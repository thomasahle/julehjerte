import test from 'node:test';
import assert from 'node:assert/strict';
import {solvePolynomialVisible} from '../../static/inverse/core/direct/polynomial.js';
import {prepare, solveTarget} from '../../static/inverse/core/engine.js';
import {sampleWeave} from '../../static/inverse/core/validate.js';
import {treeMask} from './tree-fixture.mjs';

test('polynomial path constructs a one-cut-per-sheet 2x2 cross without MILP', () => {
  const result = solvePolynomialVisible({
    bounds: {left: 0, top: 0, right: 100, bottom: 100},
    vertices: [
      {id: 't', x: 25, y: 0}, {id: 'r', x: 100, y: 25},
      {id: 'b', x: 75, y: 100}, {id: 'l', x: 0, y: 75}, {id: 'c', x: 50, y: 50},
    ],
    edges: [['t', 'c'], ['r', 'c'], ['b', 'c'], ['l', 'c']],
  });
  assert.equal(result.accepted, true);
  assert.equal(result.solution.report.milpUsed, false);
  assert.deepEqual(result.solution.report.cutCounts, {A: 1, B: 1});
  assert.equal(result.solution.paths[0].length, 1);
  assert.equal(result.solution.paths[1].length, 1);
  const mask = sampleWeave(result.solution, 32);
  assert.equal(mask.length, 32 * 32);
  assert.ok(mask.some(Boolean) && mask.some(value => !value));
});

test('polynomial path reports theorem acceptance without pretending to route hidden switches', () => {
  const result = solvePolynomialVisible({
    bounds: {left: 0, top: 0, right: 100, bottom: 100},
    vertices: [
      {id: 't', x: 25, y: 0}, {id: 'r', x: 100, y: 25},
      {id: 'b', x: 75, y: 100}, {id: 'l', x: 0, y: 75}, {id: 'c', x: 50, y: 50},
      {id: 'a', x: 30, y: 30}, {id: 'd', x: 70, y: 30}, {id: 'e', x: 70, y: 70}, {id: 'f', x: 30, y: 70},
    ],
    edges: [['t', 'c'], ['r', 'c'], ['b', 'c'], ['l', 'c'], ['a', 'd'], ['d', 'e'], ['e', 'f'], ['f', 'a']],
  });
  assert.equal(result.accepted, false);
  assert.equal(result.witness.report.passed, true);
  assert.equal(result.witness.reason, 'sheet_decomposition_failed');
});

test('polynomial path preserves a real three-cut-per-sheet tree mask', () => {
  const original = treeMask(), width = 200, mask = new Uint8Array(width * width);
  for (let y = 0; y < width; y++) for (let x = 0; x < width; x++) mask[y * width + x] = original[(2 * y) * 400 + 2 * x];
  const result = solvePolynomialVisible({mask, width});
  assert.equal(result.accepted, true);
  assert.deepEqual(result.solution.report.cutCounts, {A: 3, B: 3});
  assert.equal(result.solution.paths[0].length, 3);
  assert.equal(result.solution.paths[1].length, 3);
  const rendered = sampleWeave(result.solution, width);
  assert.deepEqual(rendered, mask);
});

test('shared engine exposes polynomial masks without entering MILP', async () => {
  const width = 32, mask = new Uint8Array(width * width);
  for (let y = 0; y < width; y++) for (let x = 0; x < width; x++) mask[y * width + x] = ((x < width / 2) ^ (y < width / 2)) ? 1 : 0;
  const prepared = prepare({type: 'mask', mask, resolution: width}, {algorithm: 'polynomial', width: 100});
  const solution = await solveTarget(prepared.target, {algorithm: 'polynomial', width: 100});
  assert.equal(solution.report.algorithm, 'polynomial-visible-sheet');
  assert.equal(solution.report.milpUsed, false);
  assert.deepEqual(solution.report.cutCounts, {A: 1, B: 1});
});
