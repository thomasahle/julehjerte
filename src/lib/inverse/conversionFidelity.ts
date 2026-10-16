/** Simplifying individual cuts must also preserve their combined weave. */
import type { HeartDesign } from '$lib/types/heart';
import type { Mask } from '$lib/paint/mask';
import { maskMismatch } from '$lib/paint/mask';
import { rasterizeDesign } from '$lib/paint/rasterize';

export type ConversionReference = { mask: Mask; weights?: ArrayLike<number> };
export type ConversionFidelity = {
  passed: boolean;
  maximumWeaveDrift: number;
  weaveDrift: Array<{ resolution: number; mismatch: number }>;
  originalSourceError?: number;
  sourceError?: number;
};

/** At most a tenth of a percentage point of additional rendered weave drift. */
export const MAXIMUM_WEAVE_DRIFT = 0.001;

/** One unchanged, already-normalized design supplies the reference masks.
 * Sample twice as finely too: a single pixel-centre mask can miss thin seams.
 * If the actual target is available, simplification may not increase its error,
 * including when only a small protected motif carries image weight.
 */
export function conversionFidelity(original: HeartDesign, reference?: ConversionReference) {
  const resolution = reference?.mask.size ?? 400;
  if (!Number.isInteger(resolution) || resolution <= 0 ||
      reference && (reference.mask.data.length !== resolution * resolution ||
        reference.mask.data.some(value => value !== 0 && value !== 1))) {
    throw new Error('Conversion comparison requires a square binary mask.');
  }
  const target = reference?.mask.data.slice();
  let weights = reference?.weights && Float64Array.from(reference.weights);
  const observed = reference?.mask.validMask;
  if (observed && (observed.length !== resolution * resolution || observed.some(v => v !== 0 && v !== 1))) {
    throw new Error('Conversion observation mask must contain one binary value per pixel.');
  }
  if (weights && (weights.length !== resolution * resolution ||
      weights.some(value => !Number.isFinite(value) || value < 0))) {
    throw new Error('Conversion comparison weights must match the mask and be finite and nonnegative.');
  }
  if (observed) weights = Float64Array.from(observed, (v, i) => v * (weights?.[i] ?? 1));
  const mass = weights ? weights.reduce((sum, value) => sum + value, 0) : resolution * resolution;
  if (!(mass > 0) || !Number.isFinite(mass)) throw new Error('Conversion comparison needs positive image weight.');
  const sourceError = (mask: Uint8Array): number | undefined => {
    if (!target) return undefined;
    let error = 0;
    for (let i = 0; i < mask.length; i++) if (mask[i] !== target[i]) error += weights?.[i] ?? 1;
    return error / mass;
  };
  const sizes = [resolution, resolution * 2];
  const originals = sizes.map(size => rasterizeDesign(original, size).data);
  const originalSourceError = sourceError(originals[0]!);
  return (candidate: HeartDesign): ConversionFidelity => {
    const masks = candidate === original ? originals : sizes.map(size => rasterizeDesign(candidate, size).data);
    const weaveDrift = masks.map((mask, i) => ({ resolution: sizes[i]!, mismatch: maskMismatch(mask, originals[i]!) }));
    const error = sourceError(masks[0]!);
    return {
      passed: weaveDrift.every(row => row.mismatch <= MAXIMUM_WEAVE_DRIFT) &&
        (error === undefined || error <= originalSourceError! + 1e-12),
      maximumWeaveDrift: MAXIMUM_WEAVE_DRIFT,
      weaveDrift,
      ...(error !== undefined ? { originalSourceError, sourceError: error } : {})
    };
  };
}
