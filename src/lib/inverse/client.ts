/** Typed boundary to the locally hosted, unbundled handoff engine. */
export type Point = [number, number];
export type ArtworkInput =
  | { type: 'svg' | 'json'; text: string }
  | { type: 'pixels'; rgba: Uint8ClampedArray; imageWidth: number; imageHeight: number; quad?: Point[]; roi?: number[]; cropProvenance?: Record<string, unknown> };

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
  resolution: number;
  metadata: {
    curves: number;
    width: number;
    direct?: boolean;
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
  report: {
    templateExportAllowed: boolean;
    slits: { left: number; right: number };
    solver: { imported?: boolean; status?: string; mipGap?: number };
    validation: { passed: boolean; minimumInterSlitDistanceLower: number };
    manufacturing: { status: 'pass' | 'fail' | 'uncertain' };
    warnings: string[];
    imageError?: { mismatchFraction: number; resolution: number } | null;
    settings: { width: number; paperColors: [string, string] };
  };
}

export class EngineError extends Error {
  constructor(message: string, public report?: Record<string, unknown>) {
    super(message);
    this.name = 'EngineError';
  }
}

export class InverseWorker {
  private worker: Worker | null = null;
  private sequence = 0;
  private rejectPending: ((error: Error) => void) | null = null;

  constructor(private url: string, private createWorker = (url: string) => new Worker(url)) {}

  request<T>(
    action: 'prepare' | 'solve' | 'saved' | 'archive' | 'detect-crops' | 'refine-crop',
    input: ArtworkInput | undefined,
    settings: Record<string, unknown>,
    progress: (stage: string) => void = () => {}
  ): Promise<T> {
    if (this.rejectPending) return Promise.reject(new Error('The engine is already working.'));
    return new Promise((resolve, reject) => {
      try {
        const worker = this.worker ??= this.createWorker(this.url);
        const id = ++this.sequence;
        this.rejectPending = reject;
        worker.onmessage = ({ data }) => {
          if (data.id !== this.sequence) return;
          if (data.type === 'progress') {
            progress(data.event.stage);
            return;
          }
          this.rejectPending = null;
          if (data.type === 'error') reject(new EngineError(data.message, data.report));
          else if (data.type === 'prepared') resolve(data.preview as T);
          else if (data.type === 'result') resolve(data.result as T);
          else if (data.type === 'archive') resolve(data.archive as T);
          else if (data.type === 'crops') resolve(data.crops as T);
          else reject(new Error('Unexpected engine response.'));
        };
        worker.onerror = (event) => {
          event.preventDefault();
          this.stop(new EngineError(event.message || 'The local template engine could not load.'));
        };
        worker.onmessageerror = () => this.stop(new EngineError('The engine response could not be read.'));
        worker.postMessage({ id, action, input, settings });
      } catch (error) {
        this.stop(error instanceof Error ? error : new Error(String(error)));
        reject(error);
      }
    });
  }

  stop(error: Error = new DOMException('Cancelled', 'AbortError')) {
    this.sequence++;
    this.worker?.terminate();
    this.worker = null;
    this.rejectPending?.(error);
    this.rejectPending = null;
  }
}

/** True only when a failed search explicitly reached its time limit. */
export function searchTimedOut(report?: Record<string, unknown>): boolean {
  return report?.termination === 'time_limit';
}
