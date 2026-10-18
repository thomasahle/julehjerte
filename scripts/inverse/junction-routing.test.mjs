import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {prepare,design} from '../../static/inverse/core/engine.js';
import {settings} from '../../static/inverse/core/settings.js';
import {AUTOMATIC_PRESET} from '../../static/inverse/core/presets.js';
import {recoverImageFeatures} from '../../static/inverse/core/feature-recovery.js';
import {validate} from '../../static/inverse/core/validate.js';
import {materialAudit} from '../../static/inverse/core/material.js';
import {readHardPhoto} from './hard-photo-data.mjs';
import {hardPhotoTarget} from './hard-photo-target.mjs';
import {renderExportedWeave} from './export-renderer.mjs';
import {reviewMaterialSamples} from './photo-material-samples.mjs';
import {captureFitFailure} from './diagnostics/fit-failure.mjs';

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
async function fixture(){
  const record=JSON.parse(await fs.readFile('scripts/inverse/fixtures/photographic-junction-routing.json'));
  const photo=await readHardPhoto(record.source),raw={...AUTOMATIC_PRESET,timeLimit:10,trials:0,earlyStop:false};
  const prepared=prepare({...photo,quad:record.quad},raw),input=hardPhotoTarget(prepared,'mask',raw),source=input.sourceImage;
  assert.equal(hash(source.mask),record.maskSha256);
  assert.equal(hash(new Uint8Array(source.probability.buffer,source.probability.byteOffset,source.probability.byteLength)),record.fittingProbabilitySha256);
  return{record,input,raw,source,mask:source.mask.slice(),probability:source.probability.slice()};
}

test('an exhausted junction graph can yield a provisional routing from a simpler trace',async()=>{
  const {input,raw,source,mask,probability}=await fixture(),cfg=settings(raw);
  const result=await recoverImageFeatures(input,cfg,3),retry=result.report.seedTopologyRetry;
  assert.equal(retry.attempted,true);assert.equal(retry.recovered,true);
  assert.ok(retry.junctionsAfter<retry.junctionsBefore);
  const attempts=result.report.attempts,index=attempts.findIndex(a=>a.smoothRadius===.75);
  assert.ok(index>0);
  assert.ok(attempts.slice(0,index).every(a=>a.solver?.termination==='candidate_graph_exhausted'));
  assert.ok(attempts.slice(0,index).some(a=>a.smoothRadius===.3));
  assert.ok(attempts.slice(0,index).some(a=>a.smoothRadius===.5));
  assert.equal(result.solution,null,'Smoothing must not replace the source-mask acceptance limit.');
  assert.equal(result.report.accepted,false);assert.ok(result.report.imageError>cfg.maxImageError);
  assert.ok(result.refinementSeed);assert.equal(validate(result.refinementSeed,cfg).passed,true);
  assert.equal(materialAudit(result.refinementSeed,cfg).passed,true);
  assert.deepEqual(source.mask,mask);assert.deepEqual(source.probability,probability);
});

test('a short probe tries simpler junctions before densifying exhausted traces',async()=>{
  const {input,raw,source,mask,probability}=await fixture();
  // The full-budget test above warms the same runtime. This short probe must
  // still consider the useful topology; success remains independently gated.
  const result=await recoverImageFeatures(input,settings(raw),.74),retry=result.report.seedTopologyRetry;
  assert.equal(retry?.attempted,true,'A sub-0.75-second probe must not skip the simpler boundary.');
  assert.ok(retry.junctionsAfter<retry.junctionsBefore);
  assert.ok(retry.budgetSeconds>0&&retry.budgetSeconds<=.37);
  const index=result.report.attempts.findIndex(a=>a.smoothRadius===.75);
  assert.ok(index>=0);
  assert.ok(result.report.attempts.slice(0,index).every(a=>a.solver?.termination==='candidate_graph_exhausted'));
  assert.equal(result.report.accepted,false,'The provisional trace still exceeds the original image limit.');
  if(result.refinementSeed){
    assert.equal(validate(result.refinementSeed,settings(raw)).passed,true);
    assert.equal(materialAudit(result.refinementSeed,settings(raw)).passed,true);
  }
  assert.deepEqual(source.mask,mask);assert.deepEqual(source.probability,probability);
});

test('the common fitter refines the alternative junction routing against the unchanged photograph',async t=>{
  const {record,input,raw,source,mask,probability}=await fixture();
  const answer=await design(input,raw),report=answer.report,recovery=report.solver.featureRecovery;
  try{
  assert.equal(recovery?.seedTopologyRetry?.recovered,true);
  assert.ok(recovery.refinement.steps>160,'The provisional trace needs more than the short seed polish.');
  assert.equal(report.templateChecksPassed,true);assert.equal(report.validation.passed,true);
  assert.equal(report.manufacturing.status,'pass');assert.equal(report.imageFidelity.features.missing.length,0);
  assert.deepEqual(report.slits,{left:4,right:4});
  const geometry=JSON.parse(answer.files['cut_geometry.json']);
  assert.ok(Object.keys(geometry.curves).length<100,'The recovered routing should avoid the grid fit’s many small spans.');
  const replay=await renderExportedWeave(geometry,source.resolution);
  const error=replay.mask.reduce((sum,v,i)=>sum+Number(v!==mask[i]),0)/mask.length;
  assert.ok(error<record.baselineIndependentImageError,`The new seed must improve the fixed source-mask error: ${error}`);
  t.diagnostic(JSON.stringify({independentError:error,curves:Object.keys(geometry.curves).length,solverSeconds:report.solver.seconds,refinementSteps:recovery.refinement.steps}));
  const samples=JSON.parse(await fs.readFile('scripts/inverse/fixtures/photo-material-samples.json')).cases.find(c=>c.id===record.sourceMaterialCase);
  assert.equal(samples.source.sha256,record.source.sha256);
  const classified=reviewMaterialSamples(samples,{mask,resolution:source.resolution,quad:record.quad});
  const exported=reviewMaterialSamples(samples,{mask:replay.mask,resolution:source.resolution,quad:record.quad,phase:classified.phase});
  assert.equal(classified.correct,28);assert.equal(exported.correct,28);
  assert.deepEqual(source.mask,mask);assert.deepEqual(source.probability,probability);
  }catch(error){
    t.diagnostic(await captureFitFailure({answer,source,context:{case:'photographic-junction-routing',assertion:error.message}}));
    throw error;
  }
});
