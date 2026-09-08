import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { prepare, design } from '../../static/inverse/core/engine.js';
import { rectify } from '../../static/inverse/core/input.js';
import { checkerPixels } from './fixtures.mjs';
import { Cubic, fitPolyline, segmentDistance } from '../../static/inverse/core/bezier.js';
import { snapJunctions } from '../../static/inverse/core/geometry.js';

test('curve reparameterization avoids needless segments on a smooth irregularly sampled bend', () => {
  const curve = new Cubic([[0, 0], [10, 80], [90, -20], [100, 60]]);
  const points = Array.from({ length: 201 }, (_, i) => curve.point((i / 200) ** 2));
  const fitted = fitPolyline(points, 0.25, 200);
  assert.ok(fitted.length <= 3); // The chord-length-only fit split this into eight.
  const poly = fitted.flatMap(c => c.flatten(0.005));
  const error = Math.max(...points.map(p => Math.min(...poly.slice(1).map((b, i) => segmentDistance(p, poly[i], b)))));
  assert.ok(error < 0.25);
  assert.deepEqual(fitted[0].p[0], points[0]);
  assert.deepEqual(fitted.at(-1).p[3], points.at(-1));
});

test('supported corner detection retains an intentional square corner', () => {
  const points = [[0, 0], [5, 0], [10, 0], [10, 5], [10, 10]];
  const fitted = fitPolyline(points, 0.5, 20, 65, 1);
  assert.ok(fitted.some(c => c.p[3][0] === 10 && c.p[3][1] === 0));
  assert.ok(fitted.every(c => c.flatness() < 1e-9));
});

test('junction merging joins opposed close corners, preserves unrelated corners, and logs the move', () => {
  const line = (a, b) => Cubic.line(a, b);
  const target = { width: 100, metadata: { input: 'raster' }, curves: [
    line([20, 0], [20, 20]), line([20, 20], [0, 20]),
    line([20.4, 100], [20.4, 20.4]), line([20.4, 20.4], [100, 20.4]),
    line([60, 0], [60, 60]), line([60, 60], [100, 60]),
  ] };
  const unrelated = target.curves.slice(4).map(c => c.p);
  snapJunctions(target, 1);
  assert.equal(target.metadata.junctionRepairs.length, 1);
  assert.deepEqual(target.metadata.junctionRepairs[0].to, [20.2, 20.2]);
  assert.deepEqual(target.curves.slice(4).map(c => c.p), unrelated);
  assert.deepEqual(target.curves[0].p[3], target.curves[2].p[3]);
});

test('default tracing preserves small raster junctions and yields a fresh validated pair', async () => {
  const { target, preview } = prepare(checkerPixels());
  assert.equal(preview.resolution, 64);
  assert.equal(preview.metadata.preprocessing.requestedResolution, 400);
  assert.equal(preview.metadata.preprocessing.traceChangedPixels, 0);
  const result = await design(target, { timeLimit: 5, trials: 0, roundHidden: false });
  assert.equal(result.report.validation.passed, true);
  assert.equal(result.report.templateChecksPassed, true);
  assert.equal(result.report.validation.forwardSampleMismatchPixels, 0);
  assert.deepEqual(result.report.slits, { left: 3, right: 3 });
});

test('four corner coordinates use pixel edges, matching the uncropped square', () => {
  const p = checkerPixels();
  const plain = rectify(p.rgba, 64, 64, 64);
  const cropped = rectify(p.rgba, 64, 64, 64, [[0, 0], [64, 0], [64, 64], [0, 64]]);
  assert.deepEqual(cropped, plain);
  const quad = [[0, 0], [64, 0], [64, 64], [0, 64]];
  assert.deepEqual(prepare({ ...p, quad }).preview.mask, prepare(p).preview.mask);
});

test('inverting SVG artwork complements the processed mask without changing cut geometry', () => {
  const text = fs.readFileSync(new URL('../../static/inverse/examples/waves.svg', import.meta.url), 'utf8');
  const normal = prepare({ type: 'svg', text });
  const inverted = prepare({ type: 'svg', text }, { invert: true });
  assert.deepEqual(normal.target.curves, inverted.target.curves);
  assert.equal(inverted.target.phase, normal.target.phase ^ 1);
  assert.deepEqual([...inverted.preview.mask], [...normal.preview.mask].map(v => v ^ 1));
});

test('failed preparation clears the previous target inside the actual worker', async () => {
  const messages = [];
  globalThis.self = { postMessage: data => messages.push(data) };
  try {
    await import('../../static/inverse/worker.js');
    const text = fs.readFileSync(new URL('../../static/inverse/examples/waves.svg', import.meta.url), 'utf8');
    await self.onmessage({ data: { id: 1, action: 'prepare', input: { type: 'svg', text }, settings: {} } });
    assert.equal(messages.at(-1).type, 'prepared');
    await self.onmessage({ data: { id: 2, action: 'prepare', input: { type: 'svg', text: '<svg><script/></svg>' }, settings: {} } });
    assert.equal(messages.at(-1).type, 'error');
    await self.onmessage({ data: { id: 3, action: 'solve', settings: {} } });
    assert.match(messages.at(-1).message, /Prepare and inspect/);
    await self.onmessage({ data: { id: 4, action: 'archive', settings: {} } });
    assert.match(messages.at(-1).message, /Generate or check/);
  } finally { delete globalThis.self; }
});
