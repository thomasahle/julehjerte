// Clock-controlled work belongs in its own test process, separate from fresh
// deadline tests and their numerical-kernel calibration.
import test from 'node:test';
import assert from 'node:assert/strict';
import {cfg,resolution,mask,input,initializer} from './clearance-feature-fixture.mjs';
import {repairClearanceInitializer} from '../../static/inverse/core/direct/clearance-repair.js';
import {loadBoundaryKernel} from '../../static/inverse/core/direct/native.js';
import {validate,sampleWeave} from '../../static/inverse/core/validate.js';
import {materialAudit,verifiedPaperSettings} from '../../static/inverse/core/material.js';
import {auditFeatureFidelity} from '../../static/inverse/core/feature-shapes.js';
import {solutionJSON} from '../../static/inverse/core/graph.js';
import {renderExportedWeave} from './export-renderer.mjs';

test('a valid coarse initializer can recover a missing feature through independently verified uncertain paper',async t=>{
  await loadBoundaryKernel();
  const source=input(),prepared=initializer(source),before=prepared.graph.points.slice(),probability=source.sourceImage.probability.slice();
  const initial=prepared.graph.solution(before,prepared.clear.phase,source);
  assert.equal(validate(initial,cfg,{checkImage:false}).passed,true);
  assert.equal(materialAudit(initial,cfg).passed,true);
  assert.equal(auditFeatureFidelity(source.sourceImage,sampleWeave(initial,resolution),cfg).passed,false);
  // Opting into feature recovery does not change the existing clearance-only
  // caller contract or admit an already valid initializer without refinement.
  assert.equal(repairClearanceInitializer(prepared,source,cfg).report.reason,'geometry_not_repairable');
  let clock=0,repaired;
  const now=t.mock.method(performance,'now',()=>clock);
  try{
    repaired=repairClearanceInitializer(prepared,source,cfg,{recoverFeatures:true,onProgress:r=>{
      // Verify the step-40 checkpoint in-loop. Leave insufficient reserve at
      // step 80, so the final helper must verify the retained uncertain shape.
      if(r.step>=80)clock=800;else if(r.step>=40)clock=600;
    }});
  }finally{now.mock.restore();}
  if(!repaired.candidate)t.diagnostic(JSON.stringify(repaired.report));
  assert.equal(repaired.report.steps,85);
  assert.equal(repaired.report.accepted,true);
  assert.equal(repaired.report.usedPaperAlternative,true);
  assert.ok(repaired.report.history.some(h=>h.step===40&&h.paperVerification?.resolution===700));
  assert.ok(repaired.report.history.some(h=>h.step===80&&h.paper==='uncertain'));
  const candidate=repaired.candidate,solution=candidate.graph.solution(candidate.points,candidate.phase,source);
  solution.report={paperVerification:candidate.paperVerification};
  const verified=verifiedPaperSettings(solution,cfg);
  assert.equal(verified.materialResolution,700);
  assert.equal(validate(solution,verified,{checkImage:false,finalGeometry:true}).passed,true);
  assert.equal(materialAudit(solution,verified).passed,true);
  const exported=await renderExportedWeave(solutionJSON(solution),resolution);
  assert.ok(exported.mask.reduce((s,v,i)=>s+Number(v!==mask[i]),0)/mask.length<.025);
  assert.equal(auditFeatureFidelity(source.sourceImage,exported.mask,cfg).passed,true);
  assert.deepEqual(prepared.graph.points,before);
  assert.deepEqual(source.sourceImage.mask,mask);assert.deepEqual(source.sourceImage.probability,probability);
});
