import test from 'node:test';
import assert from 'node:assert/strict';
import { spatialPaperColors } from '../../static/inverse/core/spatial-color.js';
import { quantize } from '../../static/inverse/core/input.js';

function photograph(n, { glare = 0, thin = false } = {}) {
  const mask = new Uint8Array(n * n), rgb = new Uint8Array(3 * n * n), colors = [[241, 237, 218], [176, 18, 28]];
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const i = y * n + x;
    mask[i] = thin ? Number(x === Math.floor(n / 2)) : (Math.floor(x * 4 / n) ^ Math.floor(y * 4 / n)) % 2;
    const shine = glare * Math.exp(-.5 * (((x / n - .42) / .18) ** 2 + ((y / n - .4) / .22) ** 2));
    for (let c = 0; c < 3; c++) rgb[3 * i + c] = Math.round((1 - shine) * colors[mask[i]][c] + shine * 255);
  }
  return { rgb, mask };
}
function disagreement(a, b) { return a.reduce((s, v, i) => s + Number(v !== b[i]), 0) / a.length; }

test('spatial colors preserve straight pure-color boundaries and one-pixel strips', () => {
  for (const n of [32, 96, 101]) for (const thin of [false, true]) {
    const { rgb, mask } = photograph(n, { thin }), rgbBefore = rgb.slice(), maskBefore = mask.slice();
    const result = spatialPaperColors(rgb, mask);
    assert.deepEqual(result.mask, mask, `${n} pixels, thin=${thin}`);
    assert.deepEqual(rgb, rgbBefore); assert.deepEqual(mask, maskBefore);
  }
});

test('spatial color fields remove a smooth highlight without moving checker boundaries', () => {
  const { rgb, mask } = photograph(96, { glare: .75 }), initial = quantize(rgb).mask, fitted = spatialPaperColors(rgb, initial).mask;
  assert.ok(disagreement(initial, mask) > .01, 'Fixture must expose global color ambiguity.');
  assert.ok(disagreement(fitted, mask) < .005, 'Keep material transitions despite the smooth color field.');
});

test('RGB outside the estimation inset cannot alter the fitted interior when initialization is fixed', () => {
  const n = 96, { rgb, mask } = photograph(n, { glare: .4 }), original = spatialPaperColors(rgb, mask).mask;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (x < 4 || y < 4 || x >= n - 4 || y >= n - 4) rgb.set([30, 220, 75], 3 * (y * n + x));
  const changed = spatialPaperColors(rgb, mask).mask;
  for (let y = 4; y < n - 4; y++) for (let x = 4; x < n - 4; x++) assert.equal(changed[y * n + x], original[y * n + x]);
});

test('single populations fall back without non-finite metadata and malformed input is rejected', () => {
  const rgb = new Uint8Array(3 * 32 * 32).fill(200), mask = new Uint8Array(32 * 32), result = spatialPaperColors(rgb, mask);
  assert.deepEqual(result.mask, mask); assert.ok(result.metadata.fallback);
  assert.equal(JSON.stringify(result.metadata).includes('null'), false);
  assert.throws(() => spatialPaperColors(rgb.subarray(1), mask));
  assert.throws(() => spatialPaperColors(rgb, new Uint8Array(mask.length).fill(2)));
  assert.throws(() => spatialPaperColors(Float64Array.from(rgb, (_, i) => i === 0 ? NaN : 200), mask));
});
