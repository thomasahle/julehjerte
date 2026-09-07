import test from 'node:test';
import assert from 'node:assert/strict';
import { stabilizeBorder, borderTransitions } from '../../static/inverse/core/border.js';
import { prepare, design } from '../../static/inverse/core/engine.js';
import { checkerPixels } from './fixtures.mjs';

test('border consensus removes isolated edge noise without changing the interior or source mask', () => {
  const n = 128, original = new Uint8Array(n * n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) original[y * n + x] = (Math.floor(x / 32) + Math.floor(y / 32)) % 2;
  const noisy = original.slice();
  for (const x of [8, 12, 48, 76, 113]) noisy[x] ^= 1;
  const preserved = noisy.slice(), repaired = stabilizeBorder(noisy, n, 100, 1);
  assert.deepEqual(noisy, preserved);
  assert.deepEqual(repaired.mask, original);
  assert.deepEqual(repaired.metadata.transitionsAfter, [3, 3, 3, 3]);
  assert.ok(repaired.metadata.transitionsBefore[0] > 3);
  assert.equal(repaired.metadata.changedPixels, 5);
  assert.ok(repaired.metadata.editedBandWidthMm <= 1);
});

test('border consensus is colour symmetric, bounded and explicitly disableable', () => {
  const n = 64, mask = Uint8Array.from({ length: n * n }, (_, i) => Number((i * 13 + Math.floor(i / n) * 17) % 37 < 18));
  const radius = 3, repaired = stabilizeBorder(mask, n, 100, radius);
  const inverted = stabilizeBorder(mask.map(v => v ^ 1), n, 100, radius);
  assert.deepEqual(inverted.mask, repaired.mask.map(v => v ^ 1));
  const d = repaired.metadata.depthPixels;
  for (let y = d; y < n - d; y++) for (let x = d; x < n - d; x++) assert.equal(repaired.mask[y * n + x], mask[y * n + x]);
  assert.deepEqual(stabilizeBorder(mask, n, 100, 0).mask, mask);
  assert.deepEqual(stabilizeBorder(mask, n, 100, 0.1).mask, mask);
  for (const radius of [-1, 4, NaN]) assert.throws(() => stabilizeBorder(mask, n, 100, radius));
});

test('fresh solve survives edge-pixel perturbations and reports error against the unedited input', async () => {
  const image = checkerPixels(128);
  for (const x of [8, 12, 48, 76, 113]) {
    const i = x * 4;
    image.rgba.set(image.rgba[i] === 255 ? [190, 20, 20, 255] : [255, 255, 255, 255], i);
  }
  const prepared = prepare(image);
  assert.ok(borderTransitions(prepared.preview.mask, 128)[0] > 3);
  assert.equal(prepared.preview.metadata.preprocessing.border.changedPixels, 5);
  const result = await design(prepared.target, { timeLimit: 5, trials: 0, roundHidden: false });
  assert.equal(result.report.templateExportAllowed, true);
  assert.deepEqual(result.report.slits, { left: 3, right: 3 });
  assert.equal(result.report.imageError.resolution, 128);
  assert.equal(result.report.imageError.mismatchPixels, 5);
  assert.equal(result.report.imageError.mismatchFraction, 5 / (128 * 128));
});

test('corner slivers in perpendicular sampling profiles do not create extra slit endpoints', () => {
  const n=128, clean=Uint8Array.from({length:n*n},(_,i)=>(Math.floor((i%n)/32)+Math.floor(Math.floor(i/n)/32))%2),mask=clean.slice();
  for(let y=0;y<2;y++)for(let x=n-7;x<n;x++)mask[y*n+x]^=1;
  const repaired=stabilizeBorder(mask,n,100,3);
  assert.deepEqual(repaired.metadata.transitionsAfter,[3,3,3,3]);assert.deepEqual(repaired.mask,clean);
});

test('narrow noise reaching the inset profiles does not introduce extra slit endpoints', () => {
  for (const n of [256, 400]) {
    const clean = Uint8Array.from({ length: n * n }, (_, i) => (Math.floor((i % n) * 4 / n) + Math.floor(Math.floor(i / n) * 4 / n)) % 2);
    const mask = clean.slice(), depth = Math.floor(1.5 * n / 100);
    // A short false run extends through every profile used for edge consensus.
    // Averaging only perpendicular to the edge cannot remove this perturbation.
    for (let y = 0; y <= 2 * depth; y++) for (let x = 20; x < 22; x++) mask[y * n + x] ^= 1;
    const preserved = mask.slice(), result = stabilizeBorder(mask, n, 100, 1.5, 2.5);
    assert.deepEqual(result.metadata.transitionsBefore, [5, 3, 3, 3]);
    assert.deepEqual(result.metadata.transitionsAfter, [3, 3, 3, 3]);
    assert.ok(result.metadata.profilePixelsChanged > 0);
    assert.deepEqual(mask, preserved);
    // Denoising endpoints does not authorize changes throughout the image.
    for (let y = depth; y < n - depth; y++) for (let x = depth; x < n - depth; x++) assert.equal(result.mask[y * n + x], mask[y * n + x]);
    assert.deepEqual(stabilizeBorder(mask.map(v => v ^ 1), n, 100, 1.5, 2.5).mask, result.mask.map(v => v ^ 1));
  }
});

test('border denoising retains runs wider than the requested strip allowance', () => {
  const n = 400, mask = new Uint8Array(n * n);
  // A real 3 mm strip, larger than the 2.5 mm allowance, must retain both ends.
  for (let y = 0; y < n; y++) for (let x = 20; x < 32; x++) mask[y * n + x] = 1;
  const result = stabilizeBorder(mask, n, 100, 1.5, 2.5);
  assert.deepEqual(result.mask, mask);
  assert.deepEqual(result.metadata.transitionsAfter, [2, 0, 2, 0]);
});
