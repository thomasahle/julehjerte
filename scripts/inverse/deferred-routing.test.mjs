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
  return error;
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
    const budget=solver.cleanupBudget;
    assert.ok(budget.startedAtSeconds+budget.availableSeconds+budget.polishingExtensionSeconds+(solver.cleanupContinuation?.addedSeconds??0)<=fixture.settings.timeLimit-1.3+1e-6,
      'Finishing a fast fit must still preserve the caller\'s export reserve.');
    const error=await checkExport(answer,input.sourceImage,entry.baselineIndependentError+1/before.mask.length);
    t.diagnostic(JSON.stringify({case:entry.id,seconds:solver.seconds,independentError:error,polishingExtensionSeconds:budget.polishingExtensionSeconds,continuationSteps:solver.cleanupContinuation?.steps??0}));
    assert.deepEqual(input.sourceImage,before);
  }catch(error){
    t.diagnostic(await captureFitFailure({answer,source:input.sourceImage,context:{case:entry.id,assertion:error.message}}));throw error;
  }
});

for(const stallPolishing of [false,true])test(stallPolishing
  ?'a stalled grid and expired polishing window still reach routing within the request'
  :'a stalled grid can finish by polishing without redundant routing',async t=>{
  const entry=fixture.cases[0],input=target(entry),before=structuredClone(input.sourceImage);
  const actualNow=performance.now.bind(performance);let elapsed=0,gridDelayed=false,polishDelayed=false;
  t.mock.method(performance,'now',()=>actualNow()+elapsed);
  const answer=await design(input,fixture.settings,event=>{
    // Interrupt the first grid window without changing pixels, geometry or
    // validators. Polishing may now finish that grid before routing is needed.
    if(event.stage==='directRefining'&&!gridDelayed){gridDelayed=true;elapsed+=9000;}
    // Separately exhaust the bounded polish window. Unused request time must
    // remain available to routing when neither local refinement succeeds.
    if(stallPolishing&&gridDelayed&&event.stage==='directPolishing'&&!polishDelayed){polishDelayed=true;elapsed+=7000;}
  });
  try{
    const solver=answer.report.solver;
    assert.equal(gridDelayed,true);
    assert.equal(polishDelayed,stallPolishing);
    if(stallPolishing){
      // Accepted routing can return directly without the later grid summary.
      if(solver.earlyPolishComparison)assert.equal(solver.earlyPolishComparison.accepted,false);
      assert.equal(solver.deferredRouting.attempted,true);
      assert.ok(solver.coarseTopologyInitialization.attempts.some(a=>a.routing));
      // Either routing stage may find the first checked fit. Do not require
      // a redundant second MILP after an accepted coarse reconstruction.
      if(!solver.coarseTopologyInitialization.accepted){
        assert.equal(solver.deferredFeatureRecovery.attempted,true);
        assert.equal(solver.featureRecovery.budgetPolicy,'after_grid_refinement');
      }
    }else{
      assert.equal(solver.earlyPolishComparison.accepted,true);
      assert.equal(solver.deferredRouting.attempted,false);
      assert.equal(solver.deferredFeatureRecovery.attempted,false);
      assert.ok(!solver.coarseTopologyInitialization?.attempts?.length);
    }
    assert.ok(solver.seconds<fixture.settings.timeLimit);
    const independentError=await checkExport(answer,input.sourceImage,.03);
    assert.deepEqual(input.sourceImage,before);
    t.diagnostic(JSON.stringify({stallPolishing,seconds:solver.seconds,earlyPolish:solver.earlyPolishComparison||null,routingAttempted:solver.deferredRouting.attempted,independentError}));
  }catch(error){
    t.diagnostic(await captureFitFailure({answer,source:input.sourceImage,context:{case:entry.id,gridDelayed,stallPolishing,polishDelayed,assertion:error.message}}));throw error;
  }
});
