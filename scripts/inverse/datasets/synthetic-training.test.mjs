import test from 'node:test';
import assert from 'node:assert/strict';
import { RECIPES, proceduralDesign, validateDesign, graphLabels, sha256 } from './synthetic-geometry.mjs';
import { generateSynthetic } from './synthetic-generate.mjs';
import { homography, project, invert, multiply, SQUARE, syntheticPhoto } from './synthetic-photo.mjs';

const near = (a, b) => a.forEach((v, i) => assert.ok(Math.abs(v - b[i]) < 1e-7, `${a} differs from ${b}`));
test('projective labels follow the true image transform, including imperfect crops', () => {
  const quad = [[22, 18], [185, 35], [160, 190], [8, 154]], h = homography(SQUARE, quad), inverse = invert(h);
  SQUARE.forEach((p, i) => near(project(h, p), quad[i]));
  for (const p of [[34, 67], [5, 80], [-30, 20]]) near(project(inverse, project(h, p)), p);
  const cropToPhoto = homography(SQUARE, [[20, 20], [180, 33], [161, 188], [10, 159]]), canonicalToCrop = multiply(invert(cropToPhoto), h);
  near(project(cropToPhoto, project(canonicalToCrop, [44, 63])), project(h, [44, 63]));
});

test('procedural labels preserve shared edge identity, recipe grouping and reproducibility', () => {
  for (const recipe of RECIPES) {
    const a = proceduralDesign(713051, recipe), b = proceduralDesign(713051, recipe), labels = graphLabels(a);
    assert.deepEqual(a.cuts, b.cuts); assert.equal(a.topologySha256, b.topologySha256);
    assert.equal(labels.phase, a.cuts.phase); assert.equal(labels.paperAMaskValue, 1);
    assert.equal(labels.canonicalPngPaperA, 'black'); assert.equal(labels.coveragePngPaperA, 'white (255)');
    for (const edge of labels.edges) {
      assert.equal(edge.visible, edge.memberships.length % 2 === 1);
      if (edge.shared) assert.deepEqual(edge.memberships.map(m => m.sheet).sort(), [0, 1]);
    }
    if (recipe !== 'lattice') assert.ok(labels.edges.some(e => e.shared));
    if (recipe.includes('lattice')) assert.equal(a.split, 'train');
    else assert.notEqual(a.split, 'train');
  }
  assert.equal(proceduralDesign(1, 'lattice').groupId, proceduralDesign(99, 'shared-lattice').groupId);
});

test('all procedural families pass existing geometry, paper and independent exported-render checks', async () => {
  for (const recipe of RECIPES) {
    const result = await validateDesign(proceduralDesign(713051, recipe), 512);
    assert.equal(result.geometry.passed, true, `${recipe}: ${JSON.stringify(result.geometry.issues)}`);
    assert.equal(result.paper?.status, 'pass', recipe);
    assert.equal(result.passed, true, `${recipe}: renderer error ${result.rendererDisagreement}`);
  }
});

test('photographic perturbations are deterministic and preserve the exact witness graph', async () => {
  const design = proceduralDesign(713051, 'channel'), checked = await validateDesign(design, 128), graph = graphLabels(design), before = JSON.stringify(graph);
  const input = { coverage: checked.rendered.coverage, canonicalResolution: 128, graph, seed: 9281, resolution: 64 };
  const a = await syntheticPhoto(input), b = await syntheticPhoto(input), changed = await syntheticPhoto({ ...input, seed: 9282 });
  assert.equal(JSON.stringify(graph), before);
  for (const key of Object.keys(a.files)) assert.equal(sha256(a.files[key]), sha256(b.files[key]), key);
  assert.notEqual(sha256(a.files['photo.jpg']), sha256(changed.files['photo.jpg']));
  assert.deepEqual(a.labels, b.labels);
  graph.nodes.forEach((p, i) => near(project(a.labels.canonicalToPhoto, p), a.labels.nodesPhoto[i]));
  assert.ok(a.files['crop-overlap-valid.png'].length > 20);
});

test('opposite color phases of identical cut geometry do not count as new base geometry', () => {
  const a = proceduralDesign(26, 'lattice'), b = proceduralDesign(33, 'lattice');
  assert.deepEqual(a.cuts.curves, b.cuts.curves);
  assert.deepEqual(a.cuts.A_overlap_paths, b.cuts.A_overlap_paths);
  assert.deepEqual(a.cuts.B_overlap_paths, b.cuts.B_overlap_paths);
  assert.notEqual(a.cuts.phase, b.cuts.phase);
  assert.notEqual(a.serializedDesignSha256, b.serializedDesignSha256);
  assert.equal(a.geometrySha256, b.geometrySha256);
});

// Recorded before corner-lattice existed, at source commit 703756f. Include
// metadata, cut serialization and graph labels so RNG/numeric changes surface.
test('optional corner generation preserves existing four recipes byte for byte', () => {
  const seeds = [0, 1, 7, 26, 33, 713051, 714060, 827068];
  const expected = {
    lattice: 'a95948c7427533785608c50feff030f9115cc16f3471f8def0a60122f28445ee',
    'shared-lattice': '523f91327b49dfdf913a1d79f10c4dac7c2a9d61fe1d84f90bbfc8e2816d3eb9',
    channel: '374dbabf89415f6accff4ab248bb49a7a9630efcd61ea9d4a43a422b41479b4d',
    frame: '53a9bbd7ee617eaf278c17d01e17dd0be72689c056e4b9a9ab14679c804e023d'
  };
  assert.deepEqual(RECIPES, ['lattice', 'shared-lattice', 'channel', 'frame']);
  for (const recipe of RECIPES) {
    const actual = sha256(JSON.stringify(seeds.map(seed => {
      const d = proceduralDesign(seed, recipe);
      return { parameters: d.parameters, cuts: d.cuts, labels: graphLabels(d), geometrySha256: d.geometrySha256, topologySha256: d.topologySha256 };
    })));
    assert.equal(actual, expected[recipe], recipe);
  }
});

test('the optional corner lattice admits acute, exact right and obtuse visible corners under unchanged gates', async () => {
  const design = proceduralDesign(37, 'corner-lattice'), labels = graphLabels(design), angles = [];
  assert.equal(design.split, 'train'); assert.equal(design.familyId, 'procedural-lattice');
  assert.equal(design.parameters.amplitude, 0);
  for (const [i] of labels.nodes.entries()) {
    const edges = labels.edges.filter(e => e.visible && (e.from === i || e.to === i));
    if (edges.length !== 2) continue;
    const vectors = edges.map(e => { const p = e.from === i ? e.cubic : e.cubic.toReversed(); return [p[1][0] - p[0][0], p[1][1] - p[0][1]]; });
    const [a, b] = vectors, cosine = (a[0] * b[0] + a[1] * b[1]) / Math.hypot(...a) / Math.hypot(...b);
    angles.push(Math.acos(Math.max(-1, Math.min(1, cosine))) * 180 / Math.PI);
  }
  assert.ok(angles.some(a => a < 89.9), 'Accepted geometry must really contain acute visible corners.');
  assert.ok(angles.some(a => Math.abs(a - 90) < 1e-6), 'Accepted geometry must really contain right-angle visible corners.');
  assert.ok(angles.some(a => a > 90.1 && a < 179), 'Accepted geometry must really contain obtuse visible corners.');
  const checked = await validateDesign(design, 512);
  assert.equal(checked.geometry.passed, true, JSON.stringify(checked.geometry.issues));
  assert.equal(checked.paper?.status, 'pass'); assert.equal(checked.passed, true);
  // The larger backtracking corners in this seed violate existing clearance:
  // requesting angle diversity must not bypass the ordinary rejection gate.
  const rejected = await validateDesign(proceduralDesign(713051, 'corner-lattice'), 512);
  assert.equal(rejected.passed, false);
  assert.ok(rejected.geometry.issues.some(i => i.type === 'nonlocal_self_clearance'));
});

test('explicit recipe selection rejects empty, unknown and duplicated lists before creating output', async () => {
  for (const recipes of [[], ['unknown'], ['corner-lattice', 'corner-lattice'], 'corner-lattice']) {
    await assert.rejects(generateSynthetic({ output: 'tmp/unused-invalid-recipe-output', recipes }), /nonempty unique recipe list/);
  }
});
