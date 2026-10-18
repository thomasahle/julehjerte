// This test freezes the global clock to stop after a fixed amount of work.
// Keep it in its own Node test process: zero-duration calibration observations
// must not select JavaScript for the later real-deadline photographic tests.
import test from 'node:test';
import assert from 'node:assert/strict';
import {cfg,resolution,mask,input,initializer} from './leaf-clearance-fixture.mjs';
import {solutionJSON} from '../../static/inverse/core/graph.js';
import {repairClearanceInitializer} from '../../static/inverse/core/direct/clearance-repair.js';
import {loadBoundaryKernel} from '../../static/inverse/core/direct/native.js';
import {polishCandidate} from '../../static/inverse/core/direct/polish.js';
import {materialAudit,verifiedPaperSettings} from '../../static/inverse/core/material.js';
import {validate} from '../../static/inverse/core/validate.js';
import {renderExportedWeave} from './export-renderer.mjs';

test('the common fitter repairs a rejected initializer and preserves its finer paper check through polishing',async t=>{
  await loadBoundaryKernel();
  const source=input(),prepared=initializer(source),before=prepared.graph.points.slice(),probability=source.sourceImage.probability.slice();
  const initial=validate(prepared.graph.solution(before,prepared.clear.phase,source),cfg,{checkImage:false});
  assert.equal(initial.passed,false);
  assert.ok(initial.issues.some(i=>i.type==='inter_slit_clearance'&&i.distanceLower<1.1));
  // This checks repair geometry and audit propagation, not how many gradient
  // steps a cold process completes in 500 ms. Advance the clock after the
  // same complete checkpoint; the separate fresh-fit tests keep real deadlines.
  let clock=0,repair;
  const now=t.mock.method(performance,'now',()=>clock);
  try{
    repair=repairClearanceInitializer(prepared,source,cfg,{geometry:initial,onProgress:r=>{if(r.step>=120)clock=600;}});
  }finally{now.mock.restore();}
  if(!repair.candidate)t.diagnostic(JSON.stringify(repair.report));
  assert.equal(repair.report.steps,125);
  assert.ok(repair.candidate);
  assert.equal(repair.report.accepted,true);
  assert.equal(repair.candidate.paperVerification.resolution,700);
  assert.equal(repair.candidate.paperVerification.status,'pass');
  const candidate=repair.candidate,solution=candidate.graph.solution(candidate.points,candidate.phase,source);
  solution.report={paperVerification:candidate.paperVerification};
  const verified=verifiedPaperSettings(solution,cfg);
  assert.equal(validate(solution,verified,{checkImage:false,finalGeometry:true}).passed,true);
  assert.equal(materialAudit(solution,verified).passed,true);
  const polished=polishCandidate(candidate,prepared.objectiveProb,256,cfg,{input:source,steps:10});
  assert.ok(polished.paperVerification.resolution>=700);
  assert.equal(polished.paperVerification.status,'pass');
  const polishedSolution=polished.graph.solution(polished.points,polished.phase,source);
  polishedSolution.report.paperVerification=polished.paperVerification;
  const polishedCfg=verifiedPaperSettings(polishedSolution,cfg);
  assert.equal(polishedCfg.materialResolution,polished.paperVerification.resolution);
  assert.deepEqual({...polishedCfg,materialResolution:cfg.materialResolution},cfg);
  assert.equal(materialAudit(polishedSolution,polishedCfg).passed,true);
  const exported=await renderExportedWeave(solutionJSON(solution),resolution);
  assert.ok(exported.mask.reduce((sum,v,i)=>sum+Number(v!==mask[i]),0)/mask.length<.02);
  assert.deepEqual(prepared.graph.points,before);
  assert.deepEqual(source.sourceImage.mask,mask);assert.deepEqual(source.sourceImage.probability,probability);
});
