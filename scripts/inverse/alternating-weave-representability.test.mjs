import test from 'node:test';
import assert from 'node:assert/strict';
import {boundaryGraphFromMask, boundaryGraphFromPolygons, checkReadingN, constructReadingNWitness, constructVisibleSheetWitness} from './alternating-weave-representability.mjs';

const graph = (vertices, edges) => checkReadingN({vertices, edges});

test('accepts a balanced crossing with one transition on each side', () => {
  const result = graph([
    {id: 't', x: .25, y: 0}, {id: 'r', x: 1, y: .25},
    {id: 'b', x: .75, y: 1}, {id: 'l', x: 0, y: .75}, {id: 'c', x: .5, y: .5},
  ], [['t', 'c'], ['r', 'c'], ['b', 'c'], ['l', 'c']]);
  assert.equal(result.passed, true);
  assert.deepEqual(result.counts, {k: 1, l: 1, T: 1, R: 1, B: 1, L: 1});
  assert.equal(constructReadingNWitness({vertices: [
    {id: 't', x: .25, y: 0}, {id: 'r', x: 1, y: .25}, {id: 'b', x: .75, y: 1},
    {id: 'l', x: 0, y: .75}, {id: 'c', x: .5, y: .5},
  ], edges: [['t', 'c'], ['r', 'c'], ['b', 'c'], ['l', 'c']]}).kind, 'visible-sheet-witness');
});

test('merges collinear arms of a 2x2 cross into one cut per sheet', () => {
  const result = constructVisibleSheetWitness({
    vertices: [
      {id: 't', x: .25, y: 0}, {id: 'r', x: 1, y: .25},
      {id: 'b', x: .75, y: 1}, {id: 'l', x: 0, y: .75}, {id: 'c', x: .5, y: .5},
    ],
    edges: [['t', 'c'], ['r', 'c'], ['b', 'c'], ['l', 'c']],
  });
  assert.equal(result.accepted, true);
  assert.deepEqual(result.template.cutCounts, {A: 1, B: 1});
  assert.deepEqual(result.template.curveCounts, {A: 1, B: 1});
  assert.equal(Object.keys(result.template.curves).length, 2);
});

test('rejects an interior degree-six junction', () => {
  const vertices = [
    {id: 'c', x: .5, y: .5}, {id: 't1', x: .2, y: 0}, {id: 't2', x: .8, y: 0},
    {id: 'b1', x: .2, y: 1}, {id: 'b2', x: .8, y: 1}, {id: 'l', x: 0, y: .5}, {id: 'r', x: 1, y: .5},
  ];
  const result = graph(vertices, [['c', 't1'], ['c', 't2'], ['c', 'b1'], ['c', 'b2'], ['c', 'l'], ['c', 'r']]);
  assert.equal(result.passed, false);
  assert.equal(result.code, 'interior_vertex_degree');
  assert.equal(result.degree, 6);
});

test('rejects unequal opposite-side transition counts', () => {
  const result = graph([
    {id: 't1', x: .2, y: 0}, {id: 'b1', x: .2, y: 1},
    {id: 't2', x: .8, y: 0}, {id: 'l', x: 0, y: .5},
  ], [['t1', 'b1'], ['t2', 'l']]);
  assert.equal(result.passed, false);
  assert.equal(result.code, 'top_bottom_imbalance');
  assert.deepEqual(result.sideCounts, {T: 2, R: 0, B: 1, L: 1});
});

test('rejects a detached interior cycle when the horizontal family is absent', () => {
  const vertices = [
    {id: 't', x: .5, y: 0}, {id: 'b', x: .5, y: 1},
    {id: 'a', x: .3, y: .3}, {id: 'b2', x: .7, y: .3}, {id: 'c', x: .7, y: .7}, {id: 'd', x: .3, y: .7},
  ];
  const result = graph(vertices, [['t', 'b'], ['a', 'b2'], ['b2', 'c'], ['c', 'd'], ['d', 'a']]);
  assert.equal(result.passed, false);
  assert.equal(result.code, 'absent_horizontal_family_component');
  assert.equal(result.component.cycle, true);
});

test('accepts a uniform mask and returns an empty witness', () => {
  const result = checkReadingN({mask: new Uint8Array(16), width: 4});
  assert.equal(result.passed, true);
  assert.equal(result.counts.k, 0);
  assert.equal(result.edges, 0);
  const witness = constructReadingNWitness({mask: new Uint8Array(16), width: 4});
  assert.deepEqual(witness.aArcs, []);
  assert.deepEqual(witness.bArcs, []);
});

test('mask conversion accepts a four-quadrant crossing', () => {
  const width = 4, mask = Uint8Array.from([
    0, 0, 1, 1,
    0, 0, 1, 1,
    1, 1, 0, 0,
    1, 1, 0, 0,
  ]);
  const boundary = boundaryGraphFromMask({mask, width});
  assert.equal(boundary.edges.length, 8);
  const result = checkReadingN({mask, width});
  assert.equal(result.passed, true);
  assert.deepEqual(result.counts, {k: 1, l: 1, T: 1, R: 1, B: 1, L: 1});
});

test('Reading N rejects square-corner contacts', () => {
  const result = graph([{id: 'corner', x: 0, y: 0}, {id: 'inside', x: .5, y: .5}], [['corner', 'inside']]);
  assert.equal(result.passed, false);
  assert.equal(result.code, 'corner_contact');
});

test('polygon contours omit square-side edges and accept A4 top-bottom arcs', () => {
  const input = {
    bounds: {left: 0, top: 0, right: 1, bottom: 1},
    polygons: [[
      [.25, 0], [.35, 0], [.35, 1], [.25, 1],
    ]],
  };
  const boundary = boundaryGraphFromPolygons(input);
  assert.equal(boundary.edges.length, 2);
  const result = checkReadingN(input);
  assert.equal(result.passed, true);
  assert.deepEqual(result.counts, {k: 2, l: 0, T: 2, R: 0, B: 2, L: 0});
  assert.equal(constructReadingNWitness(input).family, 'A');
});

test('polygon contours reject a contour edge ending at a square corner (A1)', () => {
  const result = checkReadingN({polygons: [
    [[0, 0], [.5, .5], [0, .5]],
  ]});
  assert.equal(result.passed, false);
  assert.equal(result.code, 'corner_contact');
});

test('polygon contours expose A4 interior-cycle rejection', () => {
  const result = checkReadingN({polygons: [
    [[.25, .25], [.75, .25], [.75, .75], [.25, .75]],
  ]});
  assert.equal(result.passed, false);
  assert.equal(result.code, 'nonempty_without_transitions');
  assert.match(result.message, /uniform|interior cycle/);
});

test('polygon contour adapter preserves shared vertices and balanced side counts', () => {
  const input = {
    polygons: [
      [[.5, 0], [.5, .5], [0, .5]],
      [[.5, .5], [1, .5], [.5, 1]],
    ],
  };
  const boundary = boundaryGraphFromPolygons(input);
  assert.ok(boundary.vertices.some(({x, y}) => x === .5 && y === .5));
  assert.equal(boundary.edges.length, 6);
});

test('general accepted plans keep side-count cuts even when hidden routing is pending', () => {
  const input = {
    bounds: {left: 0, top: 0, right: 100, bottom: 100},
    vertices: [
      {id: 't', x: 25, y: 0}, {id: 'r', x: 100, y: 25},
      {id: 'b', x: 75, y: 100}, {id: 'l', x: 0, y: 75}, {id: 'c', x: 50, y: 50},
      {id: 'a', x: 30, y: 30}, {id: 'd', x: 70, y: 30}, {id: 'e', x: 70, y: 70}, {id: 'f', x: 30, y: 70},
    ],
    edges: [['t', 'c'], ['r', 'c'], ['b', 'c'], ['l', 'c'], ['a', 'd'], ['d', 'e'], ['e', 'f'], ['f', 'a']],
  };
  const witness = constructReadingNWitness(input);
  assert.equal(witness.kind, 'state-plan');
  assert.deepEqual(witness.cutCounts, {A: 1, B: 1});
  assert.match(witness.cutCountOptimality, /minimum/);
});

