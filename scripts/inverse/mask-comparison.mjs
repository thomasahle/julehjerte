/** Diagnostic views from binary data, independent of a PNG's display palette.
 * Never infer paper membership from whether a preview is black or red.
 */
export function compareMasks(reference, candidate, resolution, { expectedError } = {}) {
  if (!Number.isInteger(resolution) || resolution < 1 || reference?.length !== resolution ** 2 || candidate?.length !== reference.length) {
    throw new Error('Comparison requires two equally sized square masks.');
  }
  if (expectedError !== undefined && (!Number.isFinite(expectedError) || expectedError < 0 || expectedError > 1)) {
    throw new Error('Expected disagreement must be a fraction in [0, 1].');
  }
  const referenceRGBA = new Uint8ClampedArray(reference.length * 4);
  const candidateRGBA = new Uint8ClampedArray(reference.length * 4);
  const differenceRGBA = new Uint8ClampedArray(reference.length * 4);
  const paper = [[255, 255, 255, 255], [185, 19, 19, 255]];
  let removed = 0, added = 0;
  for (let i = 0; i < reference.length; i++) {
    const a = reference[i], b = candidate[i];
    if ((a !== 0 && a !== 1) || (b !== 0 && b !== 1)) throw new Error('Comparison masks must contain only zero and one.');
    referenceRGBA.set(paper[a], 4 * i);
    candidateRGBA.set(paper[b], 4 * i);
    removed += Number(a === 1 && b === 0);
    added += Number(a === 0 && b === 1);
    differenceRGBA.set(a === b ? [255, 255, 255, 255] : a ? [180, 0, 180, 255] : [0, 110, 220, 255], 4 * i);
  }
  const changed = removed + added, error = changed / reference.length;
  if (expectedError !== undefined && Math.abs(error - expectedError) > 1e-12) {
    throw new Error(`Comparison disagrees with recorded error: ${error} versus ${expectedError}. Check mask identity, color phase and image decoding.`);
  }
  return { resolution, changed, removed, added, error, referenceRGBA, candidateRGBA, differenceRGBA };
}
