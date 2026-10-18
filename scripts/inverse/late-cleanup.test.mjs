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
    if(delay){
      assert.equal(delayed,true);assert.ok(budget.addedSeconds>0);
      assert.equal(solver.cleanupContinuation?.initialSteps??solver.checkpoints.at(-1).step+1,160,'The existing polishing pass must be able to finish.');
      assert.ok(solver.sharing.accepted.length>0,'Polishing must preserve useful early sharing.');
      assert.equal(solver.cleanupContinuation?.applied,true,'A still-improving polish can use the unspent long request.');
      assert.ok(solver.cleanupContinuation.errorAfter<solver.cleanupContinuation.errorBefore);
    }else{
      assert.equal(budget.addedSeconds,0,'An exhausted hard allowance cannot fund extra cleanup.');
      assert.equal(solver.cleanupContinuation,null,'Do not add work when the caller has no spare allowance.');
    }
    const solution=loadSolutionJSON(answer.files['cut_geometry.json']);
    assert.equal(validate(solution,answer.report.settings,{checkImage:false,finalGeometry:true}).passed,true);
    assert.equal(finalMaterialAudit(solution,answer.report.settings).summary.status,'pass');
    assert.ok(error<maximum,`Independent error ${error} exceeds ${maximum}`);
    assert.equal(auditFeatureFidelity(input.sourceImage,replay.mask,answer.report.settings).passed,true);
    assert.equal(answer.report.templateChecksPassed,true);
    assert.deepEqual(input.sourceImage,before);
    t.diagnostic(JSON.stringify({seconds,delay,error,cleanupBudget:budget,continuation:solver.cleanupContinuation}));
  }catch(failure){
    t.diagnostic(await captureFitFailure({answer,source:input.sourceImage,error,maximum,context:{seconds,delay,delayed,assertion:failure.message}}));throw failure;
  }
});
