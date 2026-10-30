import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {buildStructure, describe} from '../../static/inverse/core/exact/structure.js';
import {Outline, corners, rules} from '../../static/inverse/core/exact/outline.js';
import {cumlen, project} from '../../static/inverse/core/exact/polyline.js';
import {Candidates, tokenKey} from '../../static/inverse/core/exact/candidates.js';
import {settings} from '../../static/inverse/core/settings.js';
import {loadSVG} from '../../static/inverse/core/input.js';
import {exactPositions} from '../../static/inverse/core/exact/positions.js';
import {cheapBounds} from '../../static/inverse/core/exact/bounds.js';
import {colouredRings, targetSegments, joinNearTouchings, withoutClosedSlivers, symmetricLines} from '../../static/inverse/core/exact/target.js';
import {returns} from '../../static/inverse/core/exact/nogoods.js';
import {returnTips} from '../../static/inverse/core/exact/stage.js';
import {StructureSymmetry, act, group} from '../../static/inverse/core/exact/symmetry.js';

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
  // A corner of 45 degrees and a little less (a petal's tip fitted from one end, 0.78 radian) touching another is a touching too: its mirror image, fitted from the other end, may turn 0.79, and the two must join alike (stjernegitter: 15 hidden segments untied, 0 tied).
  const petal = [[[4, 0], [4, 4], [4 + 4 * Math.cos(0.78), 4 - 4 * Math.sin(0.78) * -1]], [[4.03, 8], [4.03, 4.03], [8, 4.03]]];
  assert.equal(joinNearTouchings(petal, .072), 1);
});

test('a traced outline nearly symmetric is made symmetric: each line\'s image lies on a line', () => {
  // Reference units. A ring round the middle with a bump on one side, started
  // anywhere, and an arc across each corner of the square, one notched, one
  // with more vertices than the rest.
  const ring = Array.from({length: 61}, (_, k) => {
    const a = 2 * Math.PI * (k % 60) / 60 + .3, r = 3 + (k % 60 === 7 ? .04 : 0);
    return [6 + r * Math.cos(a), 6 + r * Math.sin(a)];
  });
  const corner = (cx, cy, n, notch = 0) => Array.from({length: n + 1}, (_, k) => {
    const a = Math.PI / 2 * k / n, r = 2 + (k === n >> 1 ? notch : 0);
    return [Math.abs(cx - r * Math.cos(a)), Math.abs(cy - r * Math.sin(a))];
  });
  const lines = [ring, corner(0, 0, 12, .03), corner(12, 0, 12), corner(0, 12, 20), corner(12, 12, 12)];
  const names = ['mirrorX', 'mirrorY', 'antiTranspose'], even = symmetricLines(lines, names);
  assert.ok(even);
  for (const g of group(names)) for (const pts of even) {
    const off = Math.max(...pts.map(p => Math.min(...even.map(q => project(q, cumlen(q), act(g, p)).distance))));
    // Within a thousandth (0.01 mm of a 100 mm heart): the mean of images
    // sampled by arc length, which a notch shifts a little along.
    assert.ok(off < 1e-9, `${g}: ${off}`);
  }
  // The arcs still end on the square's sides, and the ring is closed.
  const closed = even.filter(pts => pts[0] === pts.at(-1));
  assert.equal(closed.length, 1);
  for (const pts of even) if (!closed.includes(pts)) for (const p of [pts[0], pts.at(-1)]) assert.ok(p.some(v => v === 0 || v === 12));
  // With one corner's arc missing, three have no image: as traced.
  assert.equal(symmetricLines(lines.slice(0, 4), names), null);
});

test('under symmetry a pair of corners joins with its images or not at all', () => {
  // A corner on the mirror's axis and two corners its mirror images of each
  // other, as near it as each other: alone, the first pair joined takes the
  // axis corner from its image's pair.
  const lines = () => [[[5, 3], [6, 4], [7, 3]], [[4, 6], [5.97, 4.05], [4, 2]], [[8, 6], [6.03, 4.05], [8, 2]]];
  const plain = lines();
  assert.equal(joinNearTouchings(plain, .072), 1);
  assert.ok(plain[0][1][0] !== 6);
  const even = lines();
  assert.equal(joinNearTouchings(even, .072, {symmetry: ['mirrorX']}), 1);
  // The two mirror corners meet on the axis; the axis corner stays.
  assert.deepEqual(even[1][1], [6, 4.05]);
  assert.deepEqual(even[2][1], [6, 4.05]);
  assert.deepEqual(even[0][1], [6, 4]);
});

test('lines made symmetric keep a touching in their middles on both sides', () => {
  // Two lines passing through one vertex (corners joined in the middle of
  // curves), and their mirror images a little off.
  const lines = [[[2, 0], [3, 1], [4, 0]], [[2, 2], [3, 1], [4, 2]], [[10.02, 0], [9.01, 1.01], [8, 0]], [[10, 2], [9.01, 1.01], [8, 2.01]]];
  const even = symmetricLines(lines, ['mirrorX']);
  assert.ok(even);
  const count = new Map();
  for (const pts of even) for (const p of pts) count.set(p.join(','), (count.get(p.join(',')) || 0) + 1);
  const shared = [...count].filter(([, n]) => n > 1).map(([k]) => k.split(',').map(Number));
  assert.equal(shared.length, 2);
  assert.ok(Math.abs(shared[0][0] + shared[1][0] - 12) < 1e-12 && shared[0][1] === shared[1][1]);
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

// Two edges a mirror swaps, as positionMaps sees them: arcs map straight across.
const mirrored=(positions)=>StructureSymmetry.prototype.positionMaps.call({outline:{along:(e,a,b)=>Math.abs(a-b)},names:['identity','mirrorX'],tolerance:.2,
  arcImage:(name,e,s)=>name==='identity'?[e,s]:[1-e,s]},positions);

test('an image between two positions a tenth apart takes the nearer, as long as the map stays one to one', () => {
  // A traced outline's corners can come out differently either way along an
  // edge (Uret: 9 on one junction, 2 on its mirror image), and the images land
  // a few hundredths off between two positions a tenth apart.
  const maps=mirrored(new Map([[0,[.92,1,3]],[1,[.958,1.034,3]]]));
  assert.deepEqual([...maps.mirrorX],[['0,1',[1,1]],['0,2',[1,2]],['0,3',[1,3]],['1,1',[0,1]],['1,2',[0,2]],['1,3',[0,3]]]);
  // Two positions taking one image are no symmetry.
  assert.throws(()=>mirrored(new Map([[0,[.92,1,3]],[1,[1.034,3]]])),/not a bijection|onto no position/);
});

test('a traced curve\'s pixel steps are no corners, a corner is, and they read alike from either end', () => {
  // Along y = 0 a step up two pixels (0.06 units) and on: turns of 45 degrees
  // and back 0.085 apart, each a corner on its own. Then a right angle.
  const step = [[0, 0], [1, 0], [1.06, .06], [3, .06], [3, 2]], cl = cumlen(step);
  assert.deepEqual(corners(step, cl, false), [cl[3]]);
  // Three turns of 15 degrees 0.04 apart are one corner, at the middle one,
  // whichever way the edge runs.
  const turn = [[0, 0], [2, 0]];
  for (const deg of [15, 30, 45]) {
    const [x, y] = turn.at(-1), a = deg * Math.PI / 180, d = deg === 45 ? 2 : .04;
    turn.push([x + d * Math.cos(a), y + d * Math.sin(a)]);
  }
  const forward = corners(turn, cumlen(turn), false), back = [...turn].reverse(), L = cumlen(turn).at(-1);
  assert.deepEqual(forward, [cumlen(turn)[2]]);
  assert.deepEqual(corners(back, cumlen(back), false).map(s => +(L - s).toFixed(9)), forward.map(s => +s.toFixed(9)));
});

test('pruned to its nearest partners, a position keeps one along its own edge in each band of distance', () => {
  // Twenty positions round a loop 20 long, a face's only edge (Uret's inner
  // circle), every pair a candidate costing its distance round the loop.
  const L = 20, tok = j => ['s', 0, j, 'R'], along = (e, s, t) => Math.min(Math.abs(s - t), L - Math.abs(s - t));
  const longest = options => {
    const cand = Object.assign(Object.create(Candidates.prototype), {positions: new Map([[0, Array.from({length: 20}, (_, k) => k)]]),
      outline: {along}, cost: new Map(), pair: new Map(), route: new Map(), kind: new Map()});
    for (let i = 1; i <= 20; i++) for (let j = i + 1; j <= 20; j++) {
      const key = `0|${tokenKey(tok(i))}|${tokenKey(tok(j))}`;
      cand.cost.set(key, along(0, i - 1, j - 1));
      cand.pair.set(key, [0, tok(i), tok(j)]);
    }
    cand.prune(2, [], [], options);
    return Math.max(...[...cand.pair.values()].map(([, a, b]) => along(0, a[2] - 1, b[2] - 1)));
  };
  assert.equal(longest({reach: Infinity}), 2);
  assert.equal(longest({}), 8);
});

test('two touchings a hair apart, merged, lose the tiny curves between them and keep four', () => {
  // As stjernegitter traced: two points 0.06 pixels apart joined by two tiny
  // curves either way round, each through a point only it and its partner share.
  const p = [5, 5], m1 = [5.0012, 5.0008], m2 = [4.9989, 4.999], out = [[5, 8], [8, 5], [5, 2], [2, 5]].map(q => [p, q]);
  const kept = withoutClosedSlivers([[p, m1], [m1, p], ...out, [p, m2], [m2, p]], .002);
  assert.deepEqual(kept, out);
  // A loop of real size through the point stays.
  const big = [[p, [6, 6]], [[6, 6], p]];
  assert.equal(withoutClosedSlivers([...big, ...out], .002).length, 6);
});
