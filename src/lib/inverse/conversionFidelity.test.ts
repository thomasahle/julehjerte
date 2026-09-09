import { describe, expect, it } from 'vitest';
import { Resvg } from '@resvg/resvg-js';
import { convertCutGeometry, convertValidatedCutGeometry, type CutGeometry } from './toHeartDesign';
import { conversionFidelity, MAXIMUM_WEAVE_DRIFT } from './conversionFidelity';
import { createMask } from '$lib/paint/mask';
import { frameMismatch, shapeCells, type Frame } from '$lib/paint/frame';
import { rasterizeDesign } from '$lib/paint/rasterize';
import { computeWeaveData } from '$lib/rendering/svgWeave';
import { findFingersWithIssues, intersectionMarginPx } from '$lib/editor/curveIssues';
import { inferOverlapRect } from '$lib/utils/overlapRect';
import type { HeartDesign } from '$lib/types/heart';
import fixture from '../../../scripts/inverse/fixtures/editor-house-seams.json';

// The fresh WebKit result that passed geometry checks but grew hairline seams
// when its two sheets were simplified independently. It is only a conversion
// fixture; no saved answer is supplied to the image-fitting algorithm.
const geometry = fixture.geometry as unknown as CutGeometry;
const frame = fixture.frame as Frame;
const target = createMask(0, fixture.mask.size);
for (const [from, length] of fixture.mask.runs) target.data.fill(1, from!, from! + length!);
const weights = shapeCells(frame, target.size);
const raw = () => convertCutGeometry(geometry, { name: 'original', tolerance: 0 }).design;
const mismatch = (d: HeartDesign) => frameMismatch(rasterizeDesign(d, target.size).data, target.data, target.size, frame).inside;

/** Independent, antialiased SVG coverage. Binary pixel centres alone can miss
 * the very thin seams that prompted this regression. No sampled cut polylines. */
function coverageError(design: HeartDesign): number {
  const weave = computeWeaveData(design.fingers, design.gridSize, design.weaveParity ?? 0);
  const b = weave.overlap, size = target.size * 4;
  const paths = [...weave.rightOnTopStrips, ...weave.leftOnTopStrips].map(s => s.pathData).join(' ');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${b.left} ${b.top} ${b.width} ${b.height}"><rect x="${b.left}" y="${b.top}" width="${b.width}" height="${b.height}" fill="white"/><path d="${paths}" fill="black" fill-rule="evenodd"/></svg>`;
  const pixels = new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().pixels;
  let error = 0, mass = 0;
  for (let y = 0; y < target.size; y++) for (let x = 0; x < target.size; x++) {
    const i = y * target.size + x;
    if (!weights[i]) continue;
    let coverage = 0;
    for (let yy = 0; yy < 4; yy++) for (let xx = 0; xx < 4; xx++) coverage += (1 - pixels[4 * ((y * 4 + yy) * size + x * 4 + xx)]! / 255) / 16;
    error += Math.abs(coverage - target.data[i]!);mass++;
  }
  return error / mass;
}

describe('conversion preserves the combined weave', () => {
  it('rejects simplification that opens seams despite passing all editor geometry rules', () => {
    const coarse = convertCutGeometry(geometry, { name: 'coarse' }).design, original = raw();
    expect(findFingersWithIssues(coarse.fingers, intersectionMarginPx(inferOverlapRect(coarse.fingers, coarse.gridSize))).size).toBe(0);
    expect(mismatch(coarse) - mismatch(original)).toBeGreaterThan(0.003);
    const result = convertValidatedCutGeometry(geometry, { name: 'house', reference: { mask: target, weights } });
    expect(mismatch(result.design)).toBeLessThanOrEqual(mismatch(original));
    expect(result.editorValidation?.tolerance).toBeLessThan(0.1);
    expect(result.editorValidation?.fidelity.passed).toBe(true);
    expect(result.editorValidation?.fidelity.weaveDrift).toHaveLength(2);
    expect(result.editorValidation?.fidelity.weaveDrift.every(row => row.mismatch <= MAXIMUM_WEAVE_DRIFT)).toBe(true);
    const selectedCoverage = coverageError(result.design);
    expect(selectedCoverage).toBeLessThanOrEqual(coverageError(original) + 0.00001);
    expect(coverageError(coarse) - selectedCoverage).toBeGreaterThan(0.003);
    // Three independent 1600² renders can exceed the default five seconds
    // while the full suite runs concurrently. This is a fidelity assertion.
  }, 15000);

  it('protects the weave when the caller has no source mask', () => {
    const result = convertValidatedCutGeometry(geometry, { name: 'house' });
    expect(result.editorValidation?.tolerance).toBeLessThan(0.1);
    expect(mismatch(result.design)).toBeLessThan(0.001);
  });

  it('measures target error only in observed pixels and snapshots the reference', () => {
    const original = raw(), mask = { size: target.size, data: target.data.slice() };
    const importance = Float64Array.from(weights, w => w * 0.25);
    const before = conversionFidelity(original, { mask, weights: importance });
    for (let i = 0; i < mask.data.length; i++) if (!weights[i]) mask.data[i] ^= 1;
    const same = conversionFidelity(original, { mask, weights: importance });
    expect(same(original).sourceError).toBe(before(original).sourceError);
    mask.data.fill(1);importance.fill(0);
    expect(before(original).sourceError).toBe(mismatch(original));
    expect(before(original).passed).toBe(true);
  });

  it('rejects malformed comparison masks and weights', () => {
    const original = raw();
    expect(() => conversionFidelity(original, { mask: { size: 2, data: new Uint8Array(3) } })).toThrow(/binary mask/);
    expect(() => conversionFidelity(original, { mask: { size: 2, data: new Uint8Array(4).fill(2) } })).toThrow(/binary mask/);
    for (const bad of [new Float64Array(1), new Float64Array(target.data.length), new Float64Array(target.data.length).fill(-1), new Float64Array(target.data.length).fill(NaN)]) {
      expect(() => conversionFidelity(original, { mask: target, weights: bad })).toThrow(/weight/);
    }
  });
});
