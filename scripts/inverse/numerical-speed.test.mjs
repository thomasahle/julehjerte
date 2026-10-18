import test from 'node:test';
import assert from 'node:assert/strict';
import {settings} from '../../static/inverse/core/settings.js';
import {checkerPixels} from './fixtures.mjs';
import {prepare} from '../../static/inverse/core/engine.js';
import {recoverImageFeatures} from '../../static/inverse/core/feature-recovery.js';

test('feature recovery returns a fully checked MILP incumbent without optimizing its hidden-cut cost further',async()=>{
  const cfg=settings({algorithm:'direct',timeLimit:5,trials:0,roundHidden:false}),{target}=prepare(checkerPixels(64),cfg);
  const recovered=await recoverImageFeatures(target,cfg,5);
  assert.ok(recovered.solution,recovered.report.error);
  assert.equal(recovered.report.accepted,true);
  assert.equal(recovered.report.geometryPassed,true);
  assert.equal(recovered.report.paperPassed,true);
  assert.equal(recovered.report.features.passed,true);
  assert.equal(recovered.report.solver.stopAfterValidated,true);
  assert.equal(recovered.report.solver.history.filter(r=>r.validationPassed).length,1);
});
