import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Cubic } from '../../../static/inverse/core/bezier.js';
import { proceduralDesign, graphLabels, validateDesign } from './synthetic-geometry.mjs';
import { generateSynthetic } from './synthetic-generate.mjs';
import { verifySynthetic } from './synthetic-verify.mjs';

for (const seed of [5, 19, 30]) test(`radial motif ${seed} has one closed motif and exact hidden approaches`, async () => {
  const design = proceduralDesign(seed, 'radial-motif'), labels = graphLabels(design);
  assert.equal(design.split, 'unassigned');
  assert.equal(design.groupId, 'procedural-radial-motif');
  assert.deepEqual(design.cuts, proceduralDesign(seed, 'radial-motif').cuts);
  assert.deepEqual(design.parameters.counts, [2, 2]);
  for (const family of design.graph.nested()) for (const slit of family) {
    for (let i = 1; i < slit.length; i++) assert.deepEqual(slit[i - 1][3], slit[i][0]);
  }
  const shared = labels.edges.filter(e => e.shared);
  assert.equal(shared.length, 4);
  for (const edge of shared) {
    assert.equal(edge.visible, false);
    assert.deepEqual(edge.memberships.map(m => m.sheet).sort(), [0, 1]);
  }
  // Inside the surrounding grid, visible curves must form one degree-two
  // cycle. Disconnected petals or an extra inner ring are not the intended label.
  const { center, gridHalfExtent: half } = design.parameters;
  const inside = p => p.every((v, k) => Math.abs(v - center[k]) < half - 1e-6);
  const adjacency = new Map();
  for (const edge of labels.edges.filter(e => e.visible && inside(e.cubic[0]) && inside(e.cubic[3]))) {
    for (const [a, b] of [[edge.from, edge.to], [edge.to, edge.from]]) {
      if (!adjacency.has(a)) adjacency.set(a, []);
      adjacency.get(a).push(b);
    }
  }
  assert.ok(adjacency.size >= 6);
  for (const neighbours of adjacency.values()) assert.equal(neighbours.length, 2);
  const pending = [adjacency.keys().next().value], reached = new Set();
  while (pending.length) {
    const node = pending.pop();
    if (reached.has(node)) continue;
    reached.add(node); pending.push(...adjacency.get(node));
  }
  assert.equal(reached.size, adjacency.size);
  const checked = await validateDesign(design, 512);
  assert.ok(checked.passed, JSON.stringify(checked.geometry.issues));
  assert.equal(checked.paper.status, 'pass');
  // Fractional coverage, not only a binary score: a grey hairline can disappear
  // under thresholding. Interior samples on all four shared approaches are flat.
  const background = 1 - Number(design.phase === -1);
  for (const edge of shared) for (const t of [.35, .5, .65]) {
    const [x, y] = new Cubic(edge.cubic).point(t).map(v => Math.floor(v * 512 / 100));
    assert.equal(checked.rendered.coverage[y * 512 + x], background);
  }
});

test('radial motif admission rejects narrow returns at shared approaches', async () => {
  // This deterministic proposal passed the old local-pair check. Its shared
  // approaches turn back within the editor margin, so it cannot be a valid
  // training witness under the complete-cut rule.
  const design = proceduralDesign(0, 'radial-motif');
  const checked = await validateDesign(design, 512);
  assert.equal(checked.passed, false);
  const returns = checked.geometry.issues.filter(issue => issue.type === 'short_self_clearance');
  assert.equal(new Set(returns.map(issue => `${issue.family}:${issue.slit}`)).size, 4);
  assert.ok(returns.every(issue => issue.distanceUpper < issue.required && issue.required === 1.5));
});

test('radial photographic generation remains explicitly unassigned and verifies every view', async () => {
  await fs.mkdir('tmp', { recursive: true });
  const parent = await fs.mkdtemp('tmp/radial-test-'), output = path.join(parent, 'dataset');
  try {
    const manifest = await generateSynthetic({ output, designs: 4, views: 1, seed: 0,
      recipes: ['radial-motif'], resolution: 64, canonicalResolution: 256 });
    assert.deepEqual(manifest.summary.bySplit.unassigned, { designs: 4, views: 4 });
    assert.equal(manifest.summary.bySplit.train.designs, 0);
    assert.ok(manifest.views.every(v => v.split === 'unassigned'));
    const result = await verifySynthetic(output);
    assert.equal(result.designs, 4); assert.equal(result.views, 4);
    // A copied batch must not become training data just by relabelling its rows.
    manifest.baseDesigns.forEach(row => { row.split = 'train'; });
    manifest.views.forEach(row => { row.split = 'train'; });
    await fs.writeFile(path.join(output, 'manifest.json'), JSON.stringify(manifest));
    await assert.rejects(verifySynthetic(output), /Recipe group crosses dataset splits/);
  } finally { await fs.rm(parent, { recursive: true, force: true }); }
});
