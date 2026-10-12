import test from 'node:test';
import assert from 'node:assert/strict';
import { appBoundary, evaluationViews } from '../learning/app-baseline.mjs';
import { prepare } from '../../../static/inverse/core/engine.js';
import { AUTOMATIC_PRESET } from '../../../static/inverse/core/presets.js';

test('learning baseline replays the actual automatic app boundary initializer', () => {
  const n = 96, rgba = new Uint8ClampedArray(n*n*4);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const inside = x > 23 && x < 69 && y > 23 && y < 69;
    rgba.set(inside ? [190, 20, 40, 255] : [241, 237, 215, 255], 4*(y*n+x));
  }
  const app = prepare({ type: 'pixels', rgba, imageWidth: n, imageHeight: n }, { ...AUTOMATIC_PRESET, resolution: n });
  const frozen = app.preview.mask.slice(), replay = appBoundary(frozen, n, app.target.metadata.preprocessing);
  assert.deepEqual(replay.curves.map(c => c.p), app.target.boundarySeed.curves.map(c => c.p));
  assert.deepEqual(replay.metadata.preprocessing, app.target.boundarySeed.metadata.preprocessing);
  assert.deepEqual(frozen, app.preview.mask, 'Replay must not edit the frozen model input.');
  assert.ok(replay.curves.length > 0);
});

test('app baseline retains the Python experiment design split and every view of each design', () => {
  const baseDesigns = Array.from({ length: 12 }, (_, i) => ({ id: `d${i}`, geometrySha256: String(i).padStart(2, '0'), split: i < 10 ? 'train' : i === 10 ? 'validation' : 'test' })).reverse();
  const views = baseDesigns.flatMap(d => [0, 1].map(i => ({ id: `${d.id}-${i}`, designId: d.id })));
  const selected = evaluationViews({ baseDesigns, views });
  assert.equal(selected.size, 8);
  for (const i of [0, 5]) for (const j of [0, 1]) assert.equal(selected.get(`d${i}-${j}`), 'development');
  assert.equal(selected.get('d10-0'), 'recipe-validation');
  assert.equal(selected.get('d11-1'), 'recipe-test');
  assert.equal(selected.has('d2-1'), false);
});
