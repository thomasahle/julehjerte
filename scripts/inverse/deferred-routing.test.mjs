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

const fixture=JSON.parse(await fs.readFile(new URL('./fixtures/photographic-star-scheduling.json',import.meta.url)));
function target(entry){
  const mask=new Uint8Array(entry.resolution**2);
  for(const [start,length]of entry.maskRuns)mask.fill(1,start,start+length);
  assert.equal(createHash('sha256').update(mask).digest('hex'),entry.maskSha256);
  const input=prepare({type:'mask',resolution:entry.resolution,mask},fixture.settings).target;
  assert.deepEqual(input.sourceImage.mask,mask);assert.equal(input.sourceImage.resolution,entry.resolution);
  return input;
}
async function checkExport(answer,source,maximum){
  const solution=loadSolutionJSON(answer.files['cut_geometry.json']);
  assert.equal(validate(solution,answer.report.settings,{checkImage:false,finalGeometry:true}).passed,true);
  assert.equal(finalMaterialAudit(solution,answer.report.settings).summary.status,'pass');
  const replay=await renderExportedWeave(answer.files['cut_geometry.json'],source.resolution);
  const error=replay.mask.reduce((sum,v,i)=>sum+Number(v!==source.mask[i]),0)/source.mask.length;
  assert.ok(error<=maximum,`Independent mask error ${error} exceeds ${maximum}`);
  assert.equal(auditFeatureFidelity(source,replay.mask,answer.report.settings).passed,true);
  assert.equal(answer.report.templateChecksPassed,true);
}

for(const entry of fixture.cases)test(`${entry.id}: refine the retained grid before routing, preserving photographic quality`,async t=>{
  const input=target(entry),before=structuredClone(input.sourceImage),answer=await design(input,fixture.settings);
  try{
    const solver=answer.report.solver;
    assert.equal(solver.deferredRouting.reason,'feature-complete-near-fit');
    assert.equal(solver.deferredRouting.attempted,false);
    assert.equal(solver.deferredFeatureRecovery.attempted,false);
    assert.equal(solver.coarseTopologyInitialization,undefined);
    assert.equal(solver.featureRecovery,null);
    assert.equal(solver.selectedInitialization,'grid');
    assert.deepEqual(solver.selectedCounts,[4,4]);
    assert.equal(solver.cleanupBudget.addedSeconds,0,'A fast fit must retain its existing cleanup allowance.');
    await checkExport(answer,input.sourceImage,entry.baselineIndependentError+1/before.mask.length);
    assert.deepEqual(input.sourceImage,before);
  }catch(error){
    t.diagnostic(await captureFitFailure({answer,source:input.sourceImage,context:{case:entry.id,assertion:error.message}}));throw error;
  }
});

test('a stalled feature-complete grid still receives coarse and feature routing within the request',async t=>{
  const entry=fixture.cases[0],input=target(entry),before=structuredClone(input.sourceImage);
  const actualNow=performance.now.bind(performance);let elapsed=0,gridDelayed=false;
  t.mock.method(performance,'now',()=>actualNow()+elapsed);
  const answer=await design(input,fixture.settings,event=>{
    // Exhaust the first grid window without changing pixels, candidate
    // geometry, routing results or validation. Later recovery has real work
    // to do; retention in the initial grid must not suppress that fallback.
    if(event.stage==='directRefining'&&!gridDelayed){gridDelayed=true;elapsed+=9000;}
  });
  try{
    const solver=answer.report.solver;
    assert.equal(gridDelayed,true);
    assert.equal(solver.deferredRouting.attempted,true);
    assert.ok(solver.coarseTopologyInitialization.attempts.some(a=>a.routing));
    // Either coarse routing or subsequent feature recovery may find the
    // first checked fit. Never require a redundant second MILP after success.
    if(!solver.coarseTopologyInitialization.accepted){
      assert.equal(solver.deferredFeatureRecovery.attempted,true);
      assert.equal(solver.featureRecovery.budgetPolicy,'after_grid_refinement');
    }
    assert.ok(solver.seconds<fixture.settings.timeLimit);
    await checkExport(answer,input.sourceImage,.03);
    assert.deepEqual(input.sourceImage,before);
  }catch(error){
    t.diagnostic(await captureFitFailure({answer,source:input.sourceImage,context:{case:entry.id,gridDelayed,assertion:error.message}}));throw error;
  }
});
