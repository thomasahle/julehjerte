import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './fixtures.mjs';
import { solutionJSON } from '../../static/inverse/core/graph.js';
import { renderExportedWeave } from './export-renderer.mjs';

test('independent exported-cut renderer reproduces a known checker and detects a changed slit', async () => {
  const geometry = solutionJSON(fixture('straight')), n = 120;
  const expected = Uint8Array.from({ length: n * n }, (_, i) => (Math.floor(i % n / 40) + Math.floor(Math.floor(i / n) / 40)) % 2);
  const exact = await renderExportedWeave(JSON.stringify(geometry), n);
  assert.deepEqual(exact.mask, expected);
  const id = geometry.A_overlap_paths[0][0].curve;
  geometry.curves[id].control_points = geometry.curves[id].control_points.map(([x, y]) => [x + 5, y]);
  const changed = await renderExportedWeave(geometry, n);
  const difference = changed.mask.reduce((sum, v, i) => sum + Number(v !== expected[i]), 0);
  assert.equal(difference, n * 10);
});
