import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {prepare,design} from '../../static/inverse/core/engine.js';
import {AUTOMATIC_PRESET} from '../../static/inverse/core/presets.js';
import {readHardPhoto} from './hard-photo-data.mjs';
import {renderExportedWeave} from './export-renderer.mjs';

for(const remaining of [4800,4200])test(`a late same-count proposal retains the missing sun with ${remaining}ms left`,async t=>{
  const fixture=JSON.parse(await fs.readFile('scripts/inverse/fixtures/photographic-near-miss-seed.json'));
  const catalogue=JSON.parse(await fs.readFile(fixture.sourceCatalogue));
  const photo=await readHardPhoto(catalogue.cases.find(c=>c.id===fixture.sourceCase));
  assert.equal(photo.fileSha256,fixture.sourceFileSha256);assert.equal(photo.rgbaSha256,fixture.decodedPixelsSha256);
  const raw={...AUTOMATIC_PRESET,timeLimit:10,trials:0,earlyStop:false};
  const quad=fixture.quad.map(p=>[p[0],p[1]+1]),prepared=prepare({...photo,quad},raw),source=prepared.target.sourceImage;
  const hash=b=>createHash('sha256').update(b).digest('hex');
  assert.equal(hash(source.mask),fixture.translations.vertical.maskSha256);
  assert.equal(hash(Buffer.from(source.probability.buffer)),fixture.translations.vertical.probabilitySha256);
  const mask=source.mask.slice(),probability=source.probability.slice();
  // Give the initial stages a deterministic simulated cost, then restore a
  // normally advancing clock when feature work (or clearance) starts. This
  // exercises the scheduling decision without relying on machine load to
  // cross its cutoff. It is not a browser speed benchmark.
  const wallNow=performance.now.bind(performance),base=wallNow();
  let elapsed=0,running=false,resumedAt=base,fineStarted=false;
  t.mock.method(performance,'now',()=>base+elapsed+(running?wallNow()-resumedAt:0));
  const answer=await design(prepared.target,raw,event=>{
    if(!fineStarted&&event.stage==='directFitting'){
      fineStarted=true;elapsed=8700-remaining;
    }else if(fineStarted&&!running&&['directInitializing','directClearance'].includes(event.stage)){
      running=true;resumedAt=wallNow();
    }
  });
  assert.ok(fineStarted&&running);
  const solver=answer.report.solver;
  assert.equal(solver.earlyFeatureInitialization?.strategy,'same-count-sampling');
  assert.equal(solver.earlyFeatureInitialization.scheduled,1);
  assert.equal(solver.samplingRecovery.reason,'limited-initialization-time');
  assert.equal(solver.samplingRecovery.initializationResolution,98);
  assert.deepEqual(solver.selectedCounts,[3,3]);
  assert.equal(solver.selectedInitialization,'feature-sampling-grid');
  assert.equal(answer.report.templateChecksPassed,true);
  assert.equal(answer.report.validation.passed,true);assert.equal(answer.report.manufacturing.status,'pass');
  const woven=await renderExportedWeave(answer.files['cut_geometry.json'],400);
  const error=woven.mask.reduce((sum,v,i)=>sum+Number(v!==mask[i]),0)/mask.length;
  assert.ok(error<.03,`Independent mask error ${error}`);
  assert.deepEqual(source.mask,mask);assert.deepEqual(source.probability,probability);
});
