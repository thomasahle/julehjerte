import test from 'node:test';
import assert from 'node:assert/strict';
import { RECIPES, proceduralDesign, validateDesign, graphLabels, sha256 } from './synthetic-geometry.mjs';
import { homography, project, invert, multiply, SQUARE, syntheticPhoto } from './synthetic-photo.mjs';

const near = (a, b) => a.forEach((v, i) => assert.ok(Math.abs(v - b[i]) < 1e-7, `${a} differs from ${b}`));
test('projective labels follow the true image transform, including imperfect crops', () => {
  const quad = [[22, 18], [185, 35], [160, 190], [8, 154]], h = homography(SQUARE, quad), inverse = invert(h);
  SQUARE.forEach((p, i) => near(project(h, p), quad[i]));
  for (const p of [[34, 67], [5, 80], [-30, 20]]) near(project(inverse, project(h, p)), p);
  const cropToPhoto = homography(SQUARE, [[20, 20], [180, 33], [161, 188], [10, 159]]), canonicalToCrop = multiply(invert(cropToPhoto), h);
  near(project(cropToPhoto, project(canonicalToCrop, [44, 63])), project(h, [44, 63]));
});

test('procedural labels preserve shared edge identity, family separation and reproducibility', () => {
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
