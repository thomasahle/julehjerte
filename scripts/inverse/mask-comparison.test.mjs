import test from 'node:test';
import assert from 'node:assert/strict';
import { compareMasks } from './mask-comparison.mjs';

test('comparison shows added and removed paper with the recorded pixel error', () => {
  const original = Uint8Array.of(1, 0, 1, 0), fitted = Uint8Array.of(0, 1, 1, 0);
  const a = original.slice(), b = fitted.slice();
  const view = compareMasks(original, fitted, 2, { expectedError: .5 });
  assert.deepEqual([view.changed, view.removed, view.added, view.error], [2, 1, 1, .5]);
  assert.deepEqual([...view.differenceRGBA], [180, 0, 180, 255, 0, 110, 220, 255, 255, 255, 255, 255, 255, 255, 255, 255]);
  assert.deepEqual([...view.referenceRGBA.slice(0, 4)], [...view.candidateRGBA.slice(4, 8)]);
  assert.deepEqual(original, a); assert.deepEqual(fitted, b);
});

test('a black preview misread as an empty red mask cannot produce a plausible comparison', () => {
  const original = Uint8Array.of(1, 1, 0, 0), fitted = Uint8Array.of(1, 1, 0, 1);
  assert.equal(compareMasks(original, fitted, 2, { expectedError: .25 }).changed, 1);
  assert.throws(() => compareMasks(original, new Uint8Array(4), 2, { expectedError: .25 }), /Check mask identity, color phase and image decoding/);
});

test('comparison preserves color phase and reveals a single changed pixel', () => {
  const original = new Uint8Array(16), fitted = original.slice(); fitted[15] = 1;
  assert.equal(compareMasks(original, fitted, 4, { expectedError: 1 / 16 }).added, 1);
  const inverse = Uint8Array.from(original, v => v ^ 1);
  assert.equal(compareMasks(original, inverse, 4).error, 1);
  assert.equal(compareMasks(original, original, 4, { expectedError: 0 }).changed, 0);
});

test('comparison rejects nonbinary data and inconsistent dimensions or expectations', () => {
  const mask = Uint8Array.of(0, 1, 1, 0);
  for (const n of [0, -1, 1.5, 3]) assert.throws(() => compareMasks(mask, mask, n));
  for (const value of [NaN, -1, 2, .5]) assert.throws(() => compareMasks([0, value, 1, 0], mask, 2), /only zero and one/);
  for (const expectedError of [NaN, Infinity, -1, 2]) assert.throws(() => compareMasks(mask, mask, 2, { expectedError }), /fraction/);
  assert.throws(() => compareMasks(mask, [0, 1], 2), /equally sized/);
});
