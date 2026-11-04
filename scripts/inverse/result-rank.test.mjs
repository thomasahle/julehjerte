import test from 'node:test';
import assert from 'node:assert/strict';
import {resultSeverity, betterResult, issueKinds} from '../../static/inverse/core/result-rank.js';
import {closer} from '../../static/inverse/core/exact/stage.js';
import {verdict, clearanceShortfall} from '../../static/inverse/core/validate.js';

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

test('the verdict lets a clearance up to 0.1 mm short pass, and nothing else', () => {
  // As validate reports a final check: strips 2.5 mm wide, the editor's 1.5 mm between slits.
  const report = {nominalWidthRequired: 2.5, editorClearanceRequired: 1.5};
  const hair = {type: 'short_self_clearance', distanceUpper: 1.417, required: 1.5}, near = {type: 'inter_slit_clearance', distanceLower: 2.45};
  const far = {type: 'nonlocal_self_clearance', distanceLower: 2.38}, crossing = {type: 'slit_intersection'}, side = {type: 'outer_side_clearance', distance: 2.41};
  assert.equal(clearanceShortfall(hair, report), 1.5 - 1.417);
  assert.equal(clearanceShortfall(near, report), 2.5 - 2.45);
  assert.equal(clearanceShortfall(crossing, report), Infinity);
  const passing = verdict({...report, passed: false, issues: [hair, near, side]});
  assert.equal(passing.passed, true);
  assert.deepEqual(passing.issues, []);
  assert.deepEqual(passing.tolerated, [hair, near, side]);
  const failing = verdict({...report, passed: false, issues: [hair, far, crossing]});
  assert.equal(failing.passed, false);
  assert.deepEqual(failing.issues, [far, crossing]);
  const clean = {...report, passed: true, issues: []};
  assert.equal(verdict(clean), clean);
});

test('a weave with a substantial region its picture does not have is reported, not failed', async () => {
  const {finalFeatureAudit, strayRegions} = await import('../../static/inverse/core/feature-shapes.js');
  const n = 100, mask = new Uint8Array(n * n), cfg = {width: 100, nominalWidth: 2.5};
  for (let y = 20; y < 80; y++) for (let x = 20; x < 80; x++) mask[y * n + x] = 1;
  const source = {mask, resolution: n};
  assert.deepEqual(strayRegions(source, mask.slice(), 100), []);
  assert.equal(finalFeatureAudit(source, mask.slice(), cfg).stray, undefined);
  // A 5 x 5 mm speck of the other colour, inside the square.
  const speck = mask.slice();
  for (let y = 40; y < 45; y++) for (let x = 40; x < 45; x++) speck[y * n + x] = 0;
  const audit = finalFeatureAudit(source, speck, cfg);
  assert.equal(audit.passed, true);
  assert.equal(audit.stray.length, 1);
  assert.equal(audit.stray[0].areaMm2, 25);
  // One smaller than the picture's own smallest detail (3 mm² on 100 mm paper) stays allowed.
  const tiny = mask.slice();
  tiny[40 * n + 40] = 0;
  assert.deepEqual(strayRegions(source, tiny, 100), []);
});
