import test from 'node:test';
import assert from 'node:assert/strict';
import { foregroundRoi } from './learning/foreground-roi.mjs';

test('rough ROI maps letterboxed cell edges back to the original photograph', () => {
  const p = new Float32Array(100);
  for (let y = 3; y < 7; y++) for (let x = 2; x < 6; x++) p[y * 10 + x] = 0.9;
  const before = p.slice();
  const result = foregroundRoi(p, { resolution: 10, window: [0, -250, 1000, 750], width: 1000, height: 500 });
  assert.deepEqual(result.componentBounds, [200, 50, 600, 450]);
  assert.deepEqual(result.roi, [160, 10, 640, 490]);
  assert.equal(result.componentPixels, 16);
  assert.deepEqual(p, before);
});

test('disconnected confident clutter does not expand the selected component', () => {
  const p = new Float32Array(100);
  for (let y = 3; y < 7; y++) for (let x = 3; x < 7; x++) p[y * 10 + x] = 0.6;
  p[0] = 1; p[9] = 1; p[90] = 1;
  const result = foregroundRoi(p, { resolution: 10, window: [0, 0, 100, 100], width: 100, height: 100 });
  assert.deepEqual(result.roi, [26, 26, 74, 74]);
  assert.equal(result.componentCount, 4);
  assert.equal(result.totalForegroundPixels, 19);
});

test('diagonal body pixels connect and padding clips to source bounds', () => {
  const p = new Float32Array(16);
  p[0] = 0.5; p[5] = 0.5; p[10] = 0.5;
  const result = foregroundRoi(p, { resolution: 4, window: [0, 0, 40, 40], width: 40, height: 40, minPixels: 3 });
  assert.deepEqual(result.roi, [0, 0, 33, 33]);
  assert.equal(result.componentCount, 1);
});

test('letterbox hallucinations and tiny fragments cannot create a rough selection', () => {
  const p = new Float32Array(100);
  p.fill(1, 0, 20); p[55] = 1;
  const result = foregroundRoi(p, { resolution: 10, window: [0, -300, 1000, 700], width: 1000, height: 400 });
  assert.equal(result.roi, null);
  assert.equal(result.totalForegroundPixels, 1);
});

test('malformed probability fields and coordinate transforms are rejected', () => {
  const options = { resolution: 4, window: [0, 0, 40, 40], width: 40, height: 40 };
  assert.throws(() => foregroundRoi(new Float32Array(15), options));
  const p = new Float32Array(16); p[2] = NaN;
  assert.throws(() => foregroundRoi(p, options));
  p[2] = 0;
  assert.throws(() => foregroundRoi(p, { ...options, window: [0, 0, 0, 40] }));
  assert.throws(() => foregroundRoi(p, { ...options, padding: -1 }));
});
