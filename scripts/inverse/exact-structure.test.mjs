import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {buildStructure, describe} from '../../static/inverse/core/exact/structure.js';
import {Outline, rules} from '../../static/inverse/core/exact/outline.js';
import {settings} from '../../static/inverse/core/settings.js';
import {loadSVG} from '../../static/inverse/core/input.js';
import {exactPositions} from '../../static/inverse/core/exact/positions.js';
import {cheapBounds} from '../../static/inverse/core/exact/bounds.js';
import {colouredRings, targetSegments} from '../../static/inverse/core/exact/target.js';

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
