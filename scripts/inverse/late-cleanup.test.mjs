import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {prepare,design} from '../../static/inverse/core/engine.js';
import {loadSolutionJSON} from '../../static/inverse/core/graph.js';
import {validate} from '../../static/inverse/core/validate.js';
import {finalMaterialAudit} from '../../static/inverse/core/geometric-material.js';
import {auditFeatureFidelity} from '../../static/inverse/core/feature-shapes.js';
import {renderExportedWeave} from './export-renderer.mjs';
import {captureFitFailure} from './diagnostics/fit-failure.mjs';

const fixture=JSON.parse(await fs.readFile(new URL('./fixtures/photographic-viking-cleanup.json',import.meta.url)));

for(const {seconds,delay,maximum}of [{seconds:180,delay:750,maximum:.0193},{seconds:25,delay:0,maximum:.03}])test(`late photo cleanup preserves source fidelity inside a ${seconds}-second request (${delay} ms interruption)`,async t=>{
  const mask=new Uint8Array(fixture.resolution**2);
  for(const[start,length]of fixture.maskRuns)mask.fill(1,start,start+length);
  assert.equal(createHash('sha256').update(mask).digest('hex'),fixture.maskSha256);
  const cfg={...fixture.settings,timeLimit:seconds},input=prepare({type:'mask',resolution:fixture.resolution,mask},cfg).target;
  const before=structuredClone(input.sourceImage),now=performance.now.bind(performance);let elapsed=0,delayed=false;
  t.mock.method(performance,'now',()=>now()+elapsed);
  const answer=await design(input,cfg,event=>{
    // Simulate a scheduling interruption before the first sharing pass.
    // Do not replace any proposal, source pixel or independent validator.
    if(delay&&!delayed&&event.stage==='directSharing'){elapsed+=delay;delayed=true;}
  });
  let error=null;
  try{
    const replay=await renderExportedWeave(answer.files['cut_geometry.json'],fixture.resolution);
    error=replay.mask.reduce((sum,v,i)=>sum+Number(v!==mask[i]),0)/mask.length;
    const solver=answer.report.solver,budget=solver.cleanupBudget;
    assert.ok(budget.startedAtSeconds>=10);
    assert.ok(budget.startedAtSeconds+budget.availableSeconds<=seconds-1.3+1e-6);
    const extendedDeadline=budget.startedAtSeconds+budget.availableSeconds+budget.polishingExtensionSeconds+(solver.cleanupContinuation?.addedSeconds??0);
    assert.ok(extendedDeadline<=seconds-1.3+1e-6,'Every cleanup extension must fit inside the caller\'s export reserve.');
    if(delay){
      assert.equal(delayed,true);assert.ok(budget.addedSeconds>0);
      const initialSteps=solver.cleanupContinuation?.initialSteps??solver.checkpoints.at(-1).step+1;
      assert.ok(initialSteps>0&&initialSteps<=160,'The timed polishing pass must retain its actual completed work.');
      assert.ok(solver.sharing.accepted.length>0,'Polishing must preserve useful early sharing.');
      // The same photo may earn an outline subdivision from a different
      // timed checkpoint. That completed refinement deliberately replaces
      // the continuation; requiring both would reject a better legal fit.
      const improvement=solver.outlineDetail||solver.cleanupContinuation;
      // An optional continuation may also lose to the incumbent. The fixed
      // independent export limit below still requires the useful final fit.
      if(improvement?.applied)assert.ok(improvement.errorAfter<improvement.errorBefore);
      if(solver.outlineDetail?.applied){
        assert.ok(solver.outlineDetail.steps>0&&solver.outlineDetail.steps<=160);
        assert.equal(solver.outlineDetail.geometryPassed,true);
        assert.equal(solver.outlineDetail.paperStatus,'pass');
        assert.equal(solver.cleanupContinuation,null);
      }
    }else{
      const unusedCallerTime=Math.max(0,seconds-1.3-budget.startedAtSeconds-budget.previousSeconds);
      assert.ok(budget.addedSeconds<=unusedCallerTime+1e-6,'Only unused caller time can fund extra cleanup.');
      // A faster checkpoint may leave caller time unused. Any continuation
      // must still fit before the same hard export reserve checked above.
      const continuation=solver.cleanupContinuation;
      if(continuation){
        assert.ok(continuation.budgetSeconds<=budget.availableSeconds+budget.polishingExtensionSeconds+continuation.addedSeconds);
        if(continuation.applied)assert.ok(continuation.errorAfter<continuation.errorBefore);
      }
    }
    const solution=loadSolutionJSON(answer.files['cut_geometry.json']);
    assert.equal(validate(solution,answer.report.settings,{checkImage:false,finalGeometry:true}).passed,true);
    assert.equal(finalMaterialAudit(solution,answer.report.settings).summary.status,'pass');
    assert.ok(error<maximum,`Independent error ${error} exceeds ${maximum}`);
    assert.equal(auditFeatureFidelity(input.sourceImage,replay.mask,answer.report.settings).passed,true);
    assert.equal(answer.report.templateChecksPassed,true);
    assert.deepEqual(input.sourceImage,before);
    t.diagnostic(JSON.stringify({seconds,delay,error,cleanupBudget:budget,continuation:solver.cleanupContinuation,outline:solver.outlineDetail}));
  }catch(failure){
    t.diagnostic(await captureFitFailure({answer,source:input.sourceImage,error,maximum,context:{seconds,delay,delayed,assertion:failure.message}}));throw failure;
  }
});
