/** Typed boundary to the locally hosted, unbundled handoff engine. */

// The progress event's own shape lives one layer up, in `engine.ts`, beside the
// stages the UI has words for. `import type` is erased before anything runs, so
// the cycle it makes exists only for the type checker; the wire protocol here
// still needs no part of the bridge at run time.
import type { EngineProgress } from './engine';

export type Point = [number, number];
export type ArtworkInput =
  | { type: 'svg' | 'json'; text: string }
  | { type: 'mask'; mask: Uint8Array; resolution: number; weights?: Float32Array; validMask?: Uint8Array; seedCells?: number }
  | { type: 'pixels'; rgba: Uint8ClampedArray; imageWidth: number; imageHeight: number; quad?: Point[]; roi?: number[]; cropProvenance?: Record<string, unknown> };

/** The pixel arm of ArtworkInput, which corner detection and the mask both need by name. */
export type PixelsInput = Extract<ArtworkInput, { type: 'pixels' }>;
export type MaskInput = Extract<ArtworkInput, { type: 'mask' }>;

export interface CropProposal {
  quad: Point[];
  outline: Point[][];
  status: string;
  warnings: string[];
  provenance: Record<string, unknown>;
  locator: Record<string, unknown>;
  needsReview: boolean;
}
export interface DetectedCrops { candidates: CropProposal[]; status: 'candidate' | 'needs_review' | 'needs_selection' | 'not_found'; reason?: string }

export interface PreparedArtwork {
  vector: string;
  boundaries: string;
  mask: Uint8Array;
  weights?: Float64Array;
  validMask?: Uint8Array;
  resolution: number;
  metadata: {
    curves: number;
    width: number;
    direct?: boolean;
    originalBoundariesAvailable?: boolean;
    originalBoundaryMethod?: 'pixel-edges';
    junctionRepairs?: { from: Point[]; to: Point }[];
    preprocessing?: {
      traceChangeFraction: number;
      totalChangeFraction?: number;
      sourceMaskComponents: number;
      vectorSampleComponents: number;
    };
  };
}

export interface DesignResult {
  files: Record<string, string>;
  comparison?: {
    resolution: number;
    wovenMask: Uint8Array;
    validMask?: Uint8Array;
    weights?: Float64Array;
  };
  report: {
    stoppedEarly?: boolean;
    alternatives?: Array<{ counts: [number, number]; error: number; checkpointError?: number | null; geometry: string }>;
    templateExportAllowed: boolean;
    templateChecksPassed: boolean;
    slits: { left: number; right: number };
    solver: { imported?: boolean; status?: string; mipGap?: number; exactOutline?: { chosen?: 'exact' | 'fitter' }; matchingPreference?: { enabled: boolean; identical: boolean; minimumIdenticalImageError: number; maximumMatchingImageError?: number; baselineImageError?: number; additionalImageError?: number; maximumAdditionalImageError?: number } };
    // null when no two slits could be measured against each other (validate.js).
    validation: { passed: boolean; minimumInterSlitDistanceLower: number | null };
    manufacturing: { status: 'pass' | 'fail' | 'uncertain' };
    warnings: string[];
    /** Which of the requested square symmetries the exported cuts satisfy (docs/inverse/SYMMETRY.md). */
    symmetry?: { requested: string[]; honoured: string[]; maxDeviationMm: number | null };
    imageError?: {
      mismatchFraction: number;
      resolution: number;
      wholeMismatchFraction?: number;
      protectedMismatchFraction?: number | null;
      editableChangeFraction?: number | null;
    } | null;
    imageFidelity?: { features: { passed: boolean } };
    settings: { width: number; maxImageError?: number; paperColors: [string, string] };
  };
}

export class EngineError extends Error {
  constructor(message: string, public report?: Record<string, unknown>, public code?: string) {
    super(message);
    this.name = 'EngineError';
  }
}

/**
 * The code on an error that is the engine's own failure rather than an answer
 * about the artwork. Everything the engine sends back — "no red and white paper
 * in this picture", a refused setting — arrives as an EngineError too, so the UI
 * needs this to know whether to blame the picture or the engine.
 */
export const ENGINE_UNAVAILABLE = 'ENGINE_UNAVAILABLE';

export class InverseWorker {
  private worker: Worker | null = null;
  private sequence = 0;
  private rejectPending: ((error: Error) => void) | null = null;
  private pendingAction: string | null = null;

  constructor(private url: string, private createWorker = (url: string) => new Worker(url)) {}

  request<T>(
    action: 'prepare' | 'solve' | 'saved' | 'archive' | 'detect-crops' | 'refine-crop' | 'warm-neural',
    input: ArtworkInput | undefined,
    settings: Record<string, unknown>,
    progress: (event: EngineProgress) => void = () => {},
    alternative: (result: T) => void = () => {}
  ): Promise<T> {
    if (this.rejectPending) return Promise.reject(new Error('The engine is already working.'));
    return new Promise((resolve, reject) => {
      try {
        const worker = this.worker ??= this.createWorker(this.url);
        const id = ++this.sequence;
        this.rejectPending = reject;
        this.pendingAction = action;
        worker.onmessage = ({ data }) => {
          if (data.id !== this.sequence) return;
          // A second answer to a solve already answered (the fitter's template
          // beside the exact search's): until the next request, which moves the
          // sequence on.
          if (data.type === 'alternative') {
            alternative(data.result as T);
            return;
          }
          if (data.type === 'progress') {
            // The whole event, not `data.event.stage`: everything the search can
            // say about itself while it runs — the counts it is trying, the
            // error, the MILP's round and gap — arrives in these fields, and the
            // panel is built out of them (PAINT.md §2, and §12 for what is still
            // missing). The worker's message is untyped, so this is the one cast
            // in the chain; `searchProgress.ts` reads every field defensively.
            progress(data.event as EngineProgress);
            return;
          }
          this.rejectPending = null;
          this.pendingAction = null;
          if (data.type === 'error') reject(new EngineError(data.message, data.report, data.code));
          else if (data.type === 'prepared') resolve(data.preview as T);
          else if (data.type === 'result') resolve(data.result as T);
          else if (data.type === 'archive') resolve(data.archive as T);
          else if (data.type === 'crops') resolve(data.crops as T);
          else reject(new Error('Unexpected engine response.'));
        };
        worker.onerror = (event) => {
          event.preventDefault();
          this.stop(new EngineError(event.message || 'The local template engine could not load.', undefined, ENGINE_UNAVAILABLE));
        };
        worker.onmessageerror = () => this.stop(new EngineError('The engine response could not be read.', undefined, ENGINE_UNAVAILABLE));
        worker.postMessage({ id, action, input, settings });
      } catch (error) {
        this.stop(error instanceof Error ? error : new Error(String(error)));
        reject(error);
      }
    });
  }

  /** Keep the current solve's id and promise; its normal result resolves it. */
  useBest(): boolean {
    if (!this.worker || !this.rejectPending || this.pendingAction !== 'solve') return false;
    this.worker.postMessage({ id: this.sequence, action: 'stop' });
    return true;
  }

  stop(error: Error = new DOMException('Cancelled', 'AbortError')) {
    const worker = this.worker, id = this.sequence, solving = this.pendingAction === 'solve';
    this.sequence++;
    this.worker = null;
    this.rejectPending?.(error);
    this.rejectPending = null;
    this.pendingAction = null;
    if (!worker) return;
    if (!solving) { worker.terminate(); return; }
    // Cancel rejects immediately. Let the responsive controller explicitly
    // terminate its CPU-bound child before terminating the controller itself;
    // otherwise a browser may leave the orphan finishing a long native solve.
    let terminated = false;
    const terminate = () => {
      if (terminated) return;
      terminated = true;
      clearTimeout(timer);
      worker.terminate();
    };
    const timer = setTimeout(terminate, 1000);
    worker.onmessage = ({ data }) => { if (data.id === id && data.type === 'cancelled') terminate(); };
    worker.onerror = event => { event.preventDefault(); terminate(); };
    worker.onmessageerror = terminate;
    try { worker.postMessage({ id, action: 'cancel' }); } catch { terminate(); }
  }
}

/** True only when a failed search explicitly reached its time limit. */
export function searchTimedOut(report?: Record<string, unknown>): boolean {
  return report?.termination === 'time_limit';
}
