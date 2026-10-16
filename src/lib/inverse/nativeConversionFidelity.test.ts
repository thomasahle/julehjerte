import { describe, expect, it } from 'vitest';
import { convertCutGeometry, convertValidatedCutGeometry, type CutGeometry } from './toHeartDesign';
import { conversionFidelity } from './conversionFidelity';
import { createMask, resample, type Mask } from '$lib/paint/mask';
import { rasterizeDesign } from '$lib/paint/rasterize';
import { parseHeartFromSVG, serializeHeartToSVG } from '$lib/utils/heartDesign';
import { findFingersWithIssues, intersectionMarginPx } from '$lib/editor/curveIssues';
import { inferOverlapRect } from '$lib/utils/overlapRect';
import fixture from '../../../scripts/inverse/fixtures/native-conversion-puppy.json';

// Captured after fitting a real upload, never supplied as a solver initializer.
const geometry = fixture.geometry as unknown as CutGeometry;
function importedMask(): Mask {
  const sourceRaster = createMask(0, fixture.mask.size);
  for (const [from, length] of fixture.mask.runs) sourceRaster.data.fill(1, from!, from! + length!);
  return { size: 400, data: resample(sourceRaster.data, sourceRaster.size, 400), sourceRaster };
}
const raw = () => convertCutGeometry(geometry, { name: 'puppy', tolerance: 0 }).design;

describe('conversion of unchanged imported masks', () => {
  it('preserves the original photo sampling as well as the painting grid through SVG export', () => {
    const mask = importedMask(), original = raw();
    const paintOnly = { size: mask.size, data: mask.data };
    const prior = convertValidatedCutGeometry(geometry, { name: 'puppy', reference: { mask: paintOnly } });
    const nativeCheck = conversionFidelity(original, { mask: mask.sourceRaster! });
    expect(prior.editorValidation?.fidelity.passed).toBe(true);
    // The old guard missed six additional errors on the original 390px mask.
    const priorNative = nativeCheck(prior.design);
    expect(priorNative.passed).toBe(false);
    expect(Math.round((priorNative.sourceError! - priorNative.originalSourceError!) * 390 ** 2)).toBe(6);

    const result = convertValidatedCutGeometry(geometry, { name: 'puppy', reference: { mask } });
    expect(nativeCheck(result.design).passed).toBe(true);
    expect(result.editorValidation?.fidelity.nativeRaster?.passed).toBe(true);
    const exported = parseHeartFromSVG(serializeHeartToSVG(result.design), 'puppy.svg')!;
    for (const design of [result.design, exported]) {
      expect(conversionFidelity(original, { mask })(design).passed).toBe(true);
      expect(nativeCheck(design).passed).toBe(true);
      expect(findFingersWithIssues(design.fingers, intersectionMarginPx(inferOverlapRect(design.fingers, design.gridSize))).size).toBe(0);
    }
  }, 15000);

  it('stops comparing with the source after a colour or coverage edit', () => {
    const original = raw(), mask = importedMask();
    expect(conversionFidelity(original, { mask })(original).nativeRaster?.passed).toBe(true);
    mask.data[0] ^= 1;
    expect(conversionFidelity(original, { mask })(original).nativeRaster).toBeUndefined();
    mask.data[0] ^= 1;
    mask.validMask = new Uint8Array(mask.data.length).fill(1);
    mask.validMask[0] = 0;
    expect(conversionFidelity(original, { mask })(original).nativeRaster).toBeUndefined();
  });

  it('preserves small weighted regions and observation coverage, and snapshots both grids', () => {
    const original = raw(), sourceRaster = rasterizeDesign(original, 32);
    sourceRaster.validMask = new Uint8Array(32 ** 2).fill(1);
    sourceRaster.validMask[0] = 0;
    sourceRaster.data[0] ^= 1; // Unobserved disagreement must not count.
    sourceRaster.data[1] ^= 1; // One observed error in the protected region.
    const mask: Mask = { size: 64, data: resample(sourceRaster.data, 32, 64),
      validMask: resample(sourceRaster.validMask, 32, 64), sourceRaster };
    const weights = new Float64Array(64 ** 2);
    // Each pair contributes to one native pixel. Sampling just one centre
    // would lose these weights entirely, instead of retaining their average.
    weights[0] = 1; weights[2] = 0.25; weights[4] = 0.75;
    const check = conversionFidelity(original, { mask, weights });
    const before = check(original);
    expect(before.nativeRaster?.sourceError).toBe(0.25);
    expect(before.passed).toBe(true);
    mask.data.fill(1); mask.validMask!.fill(0);
    sourceRaster.data.fill(1); sourceRaster.validMask.fill(0); weights.fill(0);
    expect(check(original)).toEqual(before);
  });
});
