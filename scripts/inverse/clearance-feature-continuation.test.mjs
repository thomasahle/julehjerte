import test from 'node:test';
import assert from 'node:assert/strict';
import {cfg,resolution,mask,input,initializer} from './clearance-feature-fixture.mjs';
import {repairClearanceInitializer} from '../../static/inverse/core/direct/clearance-repair.js';
import {loadBoundaryKernel} from '../../static/inverse/core/direct/native.js';
import {CurveGraph} from '../../static/inverse/core/direct/curves.js';
import {refineCurves} from '../../static/inverse/core/direct/refine.js';
import {validate} from '../../static/inverse/core/validate.js';
import {materialAudit,verifiedPaperSettings} from '../../static/inverse/core/material.js';
import {auditFeatureFidelity} from '../../static/inverse/core/feature-shapes.js';
import {solutionJSON} from '../../static/inverse/core/graph.js';
import {renderExportedWeave} from './export-renderer.mjs';

test('a short verified improvement continues fitting without becoming an accepted template',async t=>{
  await loadBoundaryKernel();
  const source=input(),prepared=initializer(source),before=prepared.graph.points.slice();
  let clock=0,result;
  const now=t.mock.method(performance,'now',()=>clock);
  try{
    result=repairClearanceInitializer(prepared,source,cfg,{recoverFeatures:true,onProgress:r=>{
      // End the short refinement after its first full block. This recreates
      // the slower full-suite run without depending on wall-clock throughput.
      if(r.step>=40)clock=800;
    }});
  }finally{now.mock.restore();}
  assert.equal(result.report.steps,45);
  assert.equal(result.report.accepted,false);
  assert.equal(result.candidate,null);
  assert.ok(result.continuation,'A legal improvement above the final image limit must remain available for refinement.');
  assert.equal(result.report.continued,true);
  assert.ok(result.report.imageError>cfg.maxImageError);
  assert.ok(result.report.imageError<result.report.initialImageError);
  const candidate=result.continuation,initial=candidate.graph.solution(candidate.points,candidate.phase,source);
  initial.report={paperVerification:candidate.paperVerification};
  const verified=verifiedPaperSettings(initial,cfg);
  assert.equal(validate(initial,verified,{checkImage:false,finalGeometry:true}).passed,true);
  assert.equal(materialAudit(initial,verified).passed,true);
  const graph=new CurveGraph(candidate.graph.nested(candidate.points),cfg.width);
  const fitted=refineCurves(graph,prepared.objectiveProb,256,candidate.phase,{...verified,preferMatchingSheets:false},{input:source,steps:120,rate:.05,resolvePaperBeforeRollback:true});
  const solution=graph.solution(fitted.points,candidate.phase,source);
  assert.equal(validate(solution,verified,{checkImage:false,finalGeometry:true}).passed,true);
  assert.equal(materialAudit(solution,verified).passed,true);
  const exported=await renderExportedWeave(solutionJSON(solution),resolution);
  const error=exported.mask.reduce((sum,v,i)=>sum+Number(v!==mask[i]),0)/mask.length;
  assert.ok(error<cfg.maxImageError,`Continued fit has ${(100*error).toFixed(3)}% disagreement.`);
  assert.equal(auditFeatureFidelity(source.sourceImage,exported.mask,cfg).passed,true);
  assert.deepEqual(prepared.graph.points,before);
  assert.deepEqual(source.sourceImage.mask,mask);
});

for(const {deadline,workDeadline,verificationStart} of [{deadline:10000},{deadline:1200},{deadline:10000,workDeadline:1000},{deadline:10000,workDeadline:1000,verificationStart:1100}])test(`completed initializer checks retain the caller's ${deadline}ms deadline${workDeadline?' after a '+workDeadline+'ms work cutoff':''}${verificationStart?' with verification starting after that cutoff':''}`,async t=>{
  await loadBoundaryKernel();
  const source=input(),prepared=initializer(source),before=prepared.graph.points.slice();
  let clock=0,audits=0,result;
  const now=t.mock.method(performance,'now',()=>clock);
  try{
    result=repairClearanceInitializer(prepared,source,cfg,{deadline,workDeadline,recoverFeatures:true,onProgress:r=>{
      if(r.step>=40)clock=800;
      if(r.step===44)clock=verificationStart||(workDeadline?900:1100);
    },paperAudit:(solution,settings)=>{
      // Perform the real independent paper audit, then model its completion
      // beyond the local 1200ms cap. The caller may still have search time.
      const checked=materialAudit(solution,settings);audits++;clock=1250;return checked;
    }});
  }finally{now.mock.restore();}
  assert.equal(result.report.steps,45);
  assert.ok(audits>0,'Completed refinement can still begin verification before the caller deadline.');
  assert.equal(result.report.geometry.passed,true);
  assert.equal(result.report.features.passed,true);
  assert.equal(result.report.paper.status,'pass');
  assert.equal(result.report.accepted,false);
  assert.ok(result.report.imageError>cfg.maxImageError);
  assert.ok(result.report.imageError<result.report.initialImageError);
  assert.equal(result.candidate,null,'A useful initializer still does not meet the final image limit.');
  if(deadline>clock){
    assert.ok(result.continuation,'Do not discard completed verification solely because the local refinement cap elapsed.');
    assert.equal(result.report.continued,true);
    assert.equal(result.report.reason,'continue_refinement');
    if(workDeadline)assert.equal(result.report.retainedAfterWorkDeadline,true);
  }else{
    assert.equal(result.continuation,undefined,'Never extend the caller deadline.');
    assert.equal(result.report.reason,'deadline');
  }
  assert.deepEqual(prepared.graph.points,before);
  assert.deepEqual(source.sourceImage.mask,mask);
});

test('the finalization reserve cannot fund new clearance repair work',t=>{
  const source=input(),prepared=initializer(source),before=prepared.graph.points.slice();
  const now=t.mock.method(performance,'now',()=>0);
  let result;
  try{result=repairClearanceInitializer(prepared,source,cfg,{deadline:10000,workDeadline:800,recoverFeatures:true});}
  finally{now.mock.restore();}
  assert.equal(result.candidate,null);
  assert.equal(result.report.reason,'insufficient_time');
  assert.equal(result.report.steps,undefined);
  assert.deepEqual(prepared.graph.points,before);
});
