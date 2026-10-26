import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {buildStructure, describe} from '../../static/inverse/core/exact/structure.js';
import {Outline, rules} from '../../static/inverse/core/exact/outline.js';
import {settings} from '../../static/inverse/core/settings.js';
import {loadSVG} from '../../static/inverse/core/input.js';
import {exactPositions} from '../../static/inverse/core/exact/positions.js';
import {cheapBounds} from '../../static/inverse/core/exact/bounds.js';
import {colouredRings, targetSegments, joinNearTouchings} from '../../static/inverse/core/exact/target.js';
import {returns} from '../../static/inverse/core/exact/nogoods.js';
import {returnTips} from '../../static/inverse/core/exact/stage.js';

// The reference solver's structures (minwit.build_from_segments) of eight
// juleflet.dk designs, with the segments it built them from.
const fixtures = JSON.parse(await fs.readFile(new URL('./experiments/fixtures/exact-structures.json', import.meta.url)));

for (const [name, ref] of Object.entries(fixtures)) {
  test(`the outline structure of ${name} is the reference solver's`, () => {
    const st = buildStructure(ref.segs, {readingK: ref.readingK});
    assert.deepEqual(describe(st), ref.describe);
    assert.deepEqual(st.edges.map(e => ({n: e.pts.length, loop: e.loop, u: e.u, v: e.v})), ref.edges);
    assert.deepEqual(st.faces.map(f => ({black: f.black, holes: f.holes, runs: f.runs})),
      ref.faces.map(f => ({black: f.black, holes: f.holes, runs: f.runs})));
    st.faces.forEach((f, i) => assert.ok(Math.abs(f.area - ref.faces[i].area) < 1e-9));
    assert.deepEqual(st.edges.map((_, e) => [st.faceL.get(e), st.faceR.get(e)]), ref.faceL.map((l, e) => [l, ref.faceR[e]]));
  });
}

const close = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol;
for (const [name, ref] of Object.entries(fixtures)) {
  test(`the outline of ${name}: arc lengths, corners and directions as the reference solver's`, () => {
    const o = new Outline(buildStructure(ref.segs, {readingK: ref.readingK}), rules(settings({trials: 0})));
    o.L.forEach((L, e) => assert.ok(close(L, ref.outline.L[e]), `edge ${e} length`));
    o.corners.forEach((c, e) => {
      assert.equal(c.length, ref.outline.corners[e].length, `edge ${e} corners`);
      c.forEach((s, i) => assert.ok(close(s, ref.outline.corners[e][i]), `edge ${e} corner ${i}`));
    });
    for (const x of ref.outline.samples) {
      const at = o.at(x.e, x.s);
      assert.ok(close(at[0], x.at[0]) && close(at[1], x.at[1]), `point on edge ${x.e} at ${x.s}`);
      for (const [mine, theirs] of [[o.sides(x.e, x.s), x.sides], [o.legs(x.e, x.s), x.legs]]) {
        assert.equal(mine.length, theirs.length);
        mine.forEach((d, i) => assert.ok(close(d[0], theirs[i][0], 1e-7) && close(d[1], theirs[i][1], 1e-7), `direction on edge ${x.e}`));
      }
    }
  });
}

// The same outline as a plain SVG through the editor's vector loader (what its
// preparation uses for SVG, without the trace route's 1000-curve limit): the
// target's curves read back give the same structure (faces in another order).
const svgOf = rings => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 12"><path fill="#b91313" fill-rule="evenodd" d="${
  rings.map(ring => 'M' + ring.map(([x, y]) => `${x.toFixed(9)},${(12 - y).toFixed(9)}`).join('L') + 'Z').join('')}"/></svg>`;
const counts = st => ({...describe(st), holes: describe(st).holes.toSorted(), black: st.faces.filter(f => f.black).length});
for (const [name, ref] of Object.entries(fixtures)) {
  test(`${name} read from the editor's SVG target has the reference structure`, () => {
    const reference = buildStructure(ref.segs, {readingK: ref.readingK});
    const target = loadSVG(svgOf(colouredRings(reference)), {width: 100, maxSpan: 15, tolerance: settings({}).geometryTolerance});
    assert.deepEqual(counts(buildStructure(targetSegments(target))), counts(reference));
  });
}

for (const [name, ref] of Object.entries(fixtures)) {
  test(`the candidate switch positions of ${name} are the reference solver's`, () => {
    const o = new Outline(buildStructure(ref.segs, {readingK: ref.readingK}), rules(settings({trials: 0})));
    for (const [e, grid] of exactPositions(o)) {
      const theirs = ref.positions[String(e)];
      assert.equal(grid.length, theirs.length, `edge ${e}: ${grid.length} positions, not ${theirs.length}`);
      grid.forEach((s, i) => assert.ok(close(s, theirs[i], 1e-9), `edge ${e} position ${i}`));
    }
  });
}

for (const [name, ref] of Object.entries(fixtures)) {
  test(`the combinatorial count bounds of ${name} are the reference solver's`, () => {
    const b = cheapBounds(buildStructure(ref.segs, {readingK: ref.readingK}));
    assert.deepEqual({lb: b.lb, meet: b.meet, parity: b.parity, detached: b.detached}, ref.bounds);
  });
}

test('corners a sampled checker opened a fraction apart join into a touching; edges running close stay apart', () => {
  // Reference units (12 to the square). Two squares' corners 0.03 apart (0.25 mm on a 100 mm heart).
  const corners = [[[4, 0], [4, 4], [0, 4]], [[4.03, 8], [4.03, 4.03], [8, 4.03]]];
  assert.equal(joinNearTouchings(corners, .072), 1);
  assert.deepEqual(corners[0][1], corners[1][1]);
  // Two edges 0.05 apart side by side: no corner, no join.
  const parallel = [[[2, 4], [6, 4]], [[2, 4.05], [6, 4.05]]];
  assert.equal(joinNearTouchings(parallel, .072), 0);
  // A corner and a smooth curve passing it: the curve does not turn there.
  const arc = Array.from({length: 41}, (_, k) => [7.04 + 3 * Math.cos(Math.PI * (5 / 6 + k / 120)), 4 + 3 * Math.sin(Math.PI * (5 / 6 + k / 120))]);
  assert.equal(joinNearTouchings([[[4, 0], [4, 4], [0, 4]], arc], .072), 0);
  // A traced corner chamfered by a pixel (two turns of 45 degrees) still is one.
  const chamfered = [[[4, 0], [4, 3.98], [3.98, 4], [0, 4]], [[4.03, 8], [4.03, 4.03], [8, 4.03]]];
  assert.equal(joinNearTouchings(chamfered, .072), 1);
});

test('a strip narrower than the joining distance is joined at one end, not both', () => {
  // Two dark regions either side of a light strip 0.02 wide, 3 long: its four
  // corners pair up across it at both ends.
  const lines = [[[0, 4], [4, 4], [4, 7], [0, 7]], [[8, 4], [4.02, 4], [4.02, 7], [8, 7]]];
  assert.equal(joinNearTouchings(lines, .072), 1);
  // The strip keeps its width at the other end.
  assert.ok([4, 7].some(y => Math.abs(lines[0].find(p => p[1] === y)?.[0] - 4) < 1e-12 && lines[1].some(p => p[1] === y && p[0] === 4.02)));
});

test('two corners a pixel apart along one boundary (a notch) do not join', () => {
  const lines = [[[0, 4.02], [4, 4.02]], [[4, 4.02], [4, 4]], [[4, 4], [4.03, 4]], [[4.03, 4], [4.03, 0]]];
  assert.equal(joinNearTouchings(lines, .072), 0);
});

// A dark band along the bottom with a spike up from it, half a millimetre wide
// near its end: traced as a box (two pixels wide), the slit along it turns by
// more than 190 degrees within 1.5 mm of itself, a pointed one by 163.
test('a tip traced as a box comes back to itself, a pointed one does not', () => {
  const cfg = settings({trials: 0}), spike = tip => loadSVG(svgOf([[[0, 0], [12, 0], [12, 4], [6.5, 4], ...tip, [5.5, 4], [0, 4]]]), {width: 100, maxSpan: 15, tolerance: cfg.geometryTolerance});
  const outline = target => new Outline(buildStructure(targetSegments(target)), rules(cfg));
  const box = spike([[6.03, 7], [6.03, 7.3], [5.97, 7.3], [5.97, 7]]);
  assert.ok(returns(outline(box)).length);
  assert.ok(returns(outline(box)).every(([, , , , tip]) => close(tip[1], 7.3, .01) && Math.abs(tip[0] - 6) < .05));
  const [[x, y], ...more] = returnTips(box, cfg);
  assert.ok(Math.abs(x - 50) < .5 && close(y, (12 - 7.3) * 100 / 12, .1) && more.every(([u, v]) => Math.hypot(u - x, v - y) < .6));
  assert.equal(returns(outline(spike([[6, 7.3]]))).length, 0);
});
