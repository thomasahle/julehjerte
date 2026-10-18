import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {prepare,design} from '../../static/inverse/core/engine.js';
import {AUTOMATIC_PRESET} from '../../static/inverse/core/presets.js';
import {readHardPhoto} from './hard-photo-data.mjs';
import {renderExportedWeave} from './export-renderer.mjs';
import {captureFitFailure} from './diagnostics/fit-failure.mjs';

for(const translation of ['original','horizontal','vertical'])for(const remaining of [4800,4200,3200])test(`a late ${translation} same-count proposal retains the motif with ${remaining}ms left`,async t=>{
  const fixture=JSON.parse(await fs.readFile('scripts/inverse/fixtures/photographic-near-miss-seed.json'));
  const catalogue=JSON.parse(await fs.readFile(fixture.sourceCatalogue));
  const photo=await readHardPhoto(catalogue.cases.find(c=>c.id===fixture.sourceCase));
  assert.equal(photo.fileSha256,fixture.sourceFileSha256);assert.equal(photo.rgbaSha256,fixture.decodedPixelsSha256);
  const raw={...AUTOMATIC_PRESET,timeLimit:10,trials:0,earlyStop:false};
  const expected=translation==='original'?fixture:fixture.translations[translation];
  const quad=fixture.quad.map(p=>p.map((v,i)=>v+(expected.offset?.[i]||0))),prepared=prepare({...photo,quad},raw),source=prepared.target.sourceImage;
  const hash=b=>createHash('sha256').update(b).digest('hex');
  assert.equal(hash(source.mask),expected.maskSha256);
  assert.equal(hash(Buffer.from(source.probability.buffer)),expected.probabilitySha256);
  const mask=source.mask.slice(),probability=source.probability.slice();
  // Give the initial stages a deterministic simulated cost, then restore a
  // normally advancing clock when feature work, routing or clearance starts. This
  // exercises the scheduling decision without relying on machine load to
  // cross its cutoff. It is not a browser speed benchmark.
  const wallNow=performance.now.bind(performance),base=wallNow();
  let elapsed=0,running=false,resumedAt=base,fineStarted=false;
  t.mock.method(performance,'now',()=>base+elapsed+(running?wallNow()-resumedAt:0));
  const answer=await design(prepared.target,raw,event=>{
    if(!fineStarted&&event.stage==='directFitting'){
      fineStarted=true;elapsed=8700-remaining;
    }else if(fineStarted&&!running&&['directInitializing','directClearance','graph'].includes(event.stage)){
      running=true;resumedAt=wallNow();
    }
  });
  let error=null;
  try{
    assert.ok(fineStarted&&running);
    const solver=answer.report.solver;
    assert.equal(solver.earlyFeatureInitialization?.strategy,translation==='vertical'?'same-count-sampling':'same-count-refinement');
    assert.equal(solver.earlyFeatureInitialization.scheduled,1);
    assert.equal(solver.samplingRecovery.reason,'limited-initialization-time');
    if(translation==='vertical')assert.equal(solver.samplingRecovery.initializationResolution,98);
    else{
      const retry=solver.earlyFeatureInitialization;
      assert.equal(retry.samplingAttempt.initializationResolution,98);
      assert.equal(retry.samplingAttempt.retained,0);
      assert.equal(retry.countExpansion,false);
      assert.equal(retry.hypotheses,2);
      assert.ok(retry.attempts.every(a=>a.counts.every(c=>c===3)));
      assert.equal((translation==='original'?retry.coarseRefinement:retry.alternativeRefinement).accepted,true);
    }
    assert.deepEqual(solver.selectedCounts,[3,3]);
    assert.equal(solver.selectedInitialization,translation==='vertical'?'feature-sampling-grid':'feature-weighted-grid');
    assert.equal(answer.report.templateChecksPassed,true,JSON.stringify({error:answer.report.imageError,seconds:solver.seconds}));
    assert.ok(solver.seconds<10,'The short feature proposal keeps the original overall deadline.');
    assert.equal(answer.report.validation.passed,true);assert.equal(answer.report.manufacturing.status,'pass');
    const woven=await renderExportedWeave(answer.files['cut_geometry.json'],400);
    error=woven.mask.reduce((sum,v,i)=>sum+Number(v!==mask[i]),0)/mask.length;
    assert.ok(error<.03,`Independent mask error ${error}`);
    t.diagnostic(JSON.stringify({translation,remaining,independentError:error,simulatedSolverSeconds:solver.seconds}));
    assert.deepEqual(source.mask,mask);assert.deepEqual(source.probability,probability);
  }catch(failure){
    t.diagnostic(await captureFitFailure({answer,source,error,maximum:.03,context:{translation,remaining,assertion:failure.message}}));throw failure;
  }
});
