import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {qualityBenchmark} from './quality-benchmark.mjs';
import {prepare,design,finish} from '../../static/inverse/core/engine.js';
import {loadSolutionJSON,solutionJSON} from '../../static/inverse/core/graph.js';
import {validate} from '../../static/inverse/core/validate.js';
import {materialAudit} from '../../static/inverse/core/material.js';
import {repairRejectedRouting} from '../../static/inverse/core/direct/rejected-routing.js';
import {auditFeatureFidelity} from '../../static/inverse/core/feature-shapes.js';
import {renderExportedWeave} from './export-renderer.mjs';

const fixture=JSON.parse(await fs.readFile(new URL('./fixtures/dinosaur-border-repair.json',import.meta.url)));
const n=fixture.resolution,mask=new Uint8Array(n*n),cfg=fixture.configuration;
for(const [start,length] of fixture.maskRuns)mask.fill(1,start,start+length);
assert.equal(createHash('sha256').update(mask).digest('hex'),fixture.maskSha256);
const input=(pixels=mask)=>prepare({type:'mask',mask:pixels.slice(),resolution:n},
  {...cfg,invert:false,removeSpecks:0,fillHoles:0}).target;
const proposal=()=>loadSolutionJSON(fixture.geometry);

test('repair retains a useful border-fragment candidate without certifying the missing feature',async()=>{
  const target=input(),original=target.sourceImage.mask.slice(),probability=target.sourceImage.probability.slice();
  const initial=proposal(),before=JSON.stringify(solutionJSON(initial));
  assert.equal(validate(initial,cfg).passed,false);
  const result=repairRejectedRouting(initial,target,cfg);
  assert.equal(result.solution,null);assert.equal(result.report.accepted,false);
  assert.equal(result.report.reason,'border_feature_refinement_seed');
  assert.equal(result.report.initialFeatures.passed,false);assert.equal(result.report.initialInteriorFeatures.passed,true);
  assert.equal(result.report.featureChange.passed,true);
  assert.equal(result.report.refinementSeedAvailable,true);
  assert.equal(result.refinementSeed.report.status,'repair_needs_feature_refinement');
  assert.equal(validate(result.refinementSeed,cfg).passed,true);
  assert.equal(materialAudit(result.refinementSeed,cfg).passed,true);
  const woven=await renderExportedWeave(solutionJSON(result.refinementSeed),n);
  assert.ok(woven.mask.reduce((sum,v,i)=>sum+Number(v!==mask[i]),0)/mask.length<.02);
  const fidelity=auditFeatureFidelity(target.sourceImage,woven.mask,cfg);
  assert.equal(fidelity.passed,false);assert.equal(fidelity.missing.length,1);
  assert.equal(fidelity.missing[0].areaMm2,8.875);
  assert.equal(finish(result.refinementSeed,cfg,()=>{},{refine:false}).report.templateChecksPassed,false);
  assert.deepEqual(target.sourceImage.mask,original);assert.deepEqual(target.sourceImage.probability,probability);
  assert.equal(JSON.stringify(solutionJSON(initial)),before);
});

test('a missing interior detail cannot claim the provisional border repair',()=>{
  const changed=mask.slice();
  for(let y=245;y<=255;y++)for(let x=95;x<=105;x++){
    assert.equal(changed[y*n+x],0);changed[y*n+x]=1;
  }
  const target=input(changed),result=repairRejectedRouting(proposal(),target,cfg);
  assert.equal(result.report.initialInteriorFeatures.passed,false);
  assert.equal(result.report.reason,'initial_image');
  assert.equal(result.solution,null);assert.equal(result.refinementSeed,undefined);
  assert.deepEqual(target.sourceImage.mask,changed);
});

test('a feature-incomplete repair still needs passing paper support',()=>{
  for(const status of ['fail','uncertain']){
    const result=repairRejectedRouting(proposal(),input(),cfg,{paperAudit:()=>({status,summary:{status}})});
    assert.equal(result.report.geometry.passed,true);
    assert.equal(result.report.features.passed,false);
    assert.equal(result.report.reason,'paper_rejected');
    assert.equal(result.report.paper.status,status);
    assert.equal(result.solution,null);assert.equal(result.refinementSeed,undefined);
  }
});

qualityBenchmark('a thin crop-margin fragment cannot discard the dinosaur motif during a short search',async()=>{
  const target=input(),before=target.sourceImage.mask.slice();
  const answer=await design(target,cfg),woven=await renderExportedWeave(answer.files['cut_geometry.json'],n);
  const error=woven.mask.reduce((sum,v,i)=>sum+Number(v!==mask[i]),0)/mask.length;
  assert.ok(error<.02,`The 142-pixel fragment previously caused 4.32% disagreement: ${error}`);
  assert.equal(answer.report.validation.passed,true);
  assert.equal(answer.report.manufacturing.status,'pass');
  assert.equal(answer.report.templateChecksPassed,false);
  assert.ok(answer.report.solver.featureRecovery.attempts.some(a=>a.continuousRepair?.reason==='border_feature_refinement_seed'));
  const features=auditFeatureFidelity(target.sourceImage,woven.mask,cfg);
  assert.equal(features.passed,false);assert.ok(features.missing.some(f=>f.areaMm2===8.875));
  assert.deepEqual(target.sourceImage.mask,before);
});
