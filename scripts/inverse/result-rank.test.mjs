import test from 'node:test';
import assert from 'node:assert/strict';
import {resultSeverity, betterResult, issueKinds} from '../../static/inverse/core/result-rank.js';
import {closer} from '../../static/inverse/core/exact/stage.js';

const result = ({passed = false, issues = [], mismatch = .01, features = true, image = true} = {}) =>
  ({report: {templateChecksPassed: passed, validation: {issues}, imageError: {mismatchFraction: mismatch}, imageFidelity: {passed: image && features, features: {passed: features}}, settings: {nominalWidth: 2.5}}});

test('a passing template is better than any that misses a check', () => {
  assert.equal(betterResult(result({issues: [{type: 'short_self_clearance', distanceUpper: 1.499, required: 1.5}]}), result({passed: true, mismatch: .02})).report.templateChecksPassed, true);
});

test('among failing templates: fewer kinds of real failure, then the smaller clearance shortfall, then the closer picture', () => {
  const hair = result({issues: [{type: 'short_self_clearance', distanceUpper: 1.476, required: 1.5}]});
  const crossing = result({issues: [{type: 'self_intersection'}]});
  const wide = result({issues: [{type: 'inter_slit_clearance', distanceLower: 1.5}]});
  assert.equal(betterResult(crossing, hair), hair);
  assert.equal(betterResult(wide, hair), hair);
  assert.deepEqual(resultSeverity(hair), [1, 0, .024, .01]);
  assert.deepEqual(resultSeverity(wide), [1, 0, 1, .01]);
  assert.equal(betterResult(result({features: false}), hair), hair);
  assert.equal(betterResult(result({mismatch: .02}), result({mismatch: .01})).report.imageError.mismatchFraction, .01);
});

test('a missing result loses to any template', () => {
  assert.equal(betterResult(null, null), null);
  const one = result();
  assert.equal(betterResult(null, one), one);
  assert.equal(betterResult(one, undefined), one);
});

test('the exact search\'s own ranking of templates the export would not take agrees (assess near, closer)', () => {
  const {kinds, shortfall} = issueKinds([{type: 'short_self_clearance', distanceUpper: 1.417, required: 1.5}, {type: 'nonlocal_self_clearance', distanceLower: 2.4}, {type: 'slit_intersection'}], 2.5);
  assert.deepEqual([...kinds], ['slit_intersection']);
  assert.equal(shortfall, .183);
  // [taken, other kinds, shortfall mm, mask error steps, hidden cut steps, length]
  const hair = {near: [1, 0, .083, 2, 3, 900]}, crossing = {near: [1, 1, 0, 2, 3, 900]}, faithful = {near: [1, 2, 0, 9, 3, 900]}, taken = {near: [0, 0, 0, 2, 9, 999]};
  assert.equal(closer(hair, crossing), true);
  assert.equal(closer(crossing, faithful), true);
  assert.equal(closer(taken, hair), true);
  assert.equal(closer(hair, hair), false);
  assert.equal(closer(hair, null), true);
  assert.equal(closer(null, hair), false);
});
