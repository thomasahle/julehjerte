import {qualityBenchmark as test} from './quality-benchmark.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {prepare,design} from '../../static/inverse/core/engine.js';
import {AUTOMATIC_PRESET} from '../../static/inverse/core/presets.js';
import {readHardPhoto} from './hard-photo-data.mjs';
import {renderExportedWeave} from './export-renderer.mjs';

test('unsuccessful outline-star photo routing leaves time for the independent curve fit',async()=>{
  const fixture=JSON.parse(await fs.readFile('scripts/inverse/fixtures/photographic-outline-star-fit.json'));
  const catalogue=JSON.parse(await fs.readFile(fixture.sourceCatalogue));
  const photo=await readHardPhoto(catalogue.source);
  assert.equal(photo.fileSha256,fixture.sourceFileSha256);
  assert.equal(photo.rgbaSha256,fixture.decodedPixelsSha256);
  const hash=b=>createHash('sha256').update(b).digest('hex');
  const cfg={...AUTOMATIC_PRESET,timeLimit:10,trials:0,earlyStop:false};
  const prepared=prepare({...photo,quad:fixture.quad},cfg),source=prepared.target.sourceImage;
  const mask=source.mask.slice(),probability=source.probability.slice();
  assert.equal(hash(mask),fixture.maskSha256);
  assert.equal(hash(new Uint8Array(probability.buffer)),fixture.probabilitySha256);
  const answer=await design(prepared.target,cfg),solver=answer.report.solver;
  assert.equal(solver.featureRecovery.accepted,false,'Exercise an unsuccessful speculative routing.');
  assert.equal(solver.selectedInitialization,'grid');
  assert.ok(solver.checkpoints.some(c=>c.step>=80&&c.geometry&&c.paper==='pass'),
    'A legal free-curve refinement must survive after the speculative routing fails.');
  assert.equal(answer.report.validation.passed,true);
  assert.equal(answer.report.manufacturing.status,'pass');
  const replay=await renderExportedWeave(answer.files['cut_geometry.json'],source.resolution);
  const error=replay.mask.reduce((sum,v,i)=>sum+Number(v!==mask[i]),0)/mask.length;
  assert.ok(error<.0085,`Independent error ${error} must retain the close fallback fit.`);
  // Refinement still cannot guarantee recovery of a remote missing region.
  // Keep the ordinary final feature gate; do not turn low mean error into a pass.
  if(answer.report.imageFidelity.features.missing.length)assert.equal(answer.report.templateChecksPassed,false);
  assert.deepEqual(source.mask,mask);assert.deepEqual(source.probability,probability);
});

test('a one-pixel crop shift cannot starve near-limit star refinement',async()=>{
  const fixture=JSON.parse(await fs.readFile('scripts/inverse/fixtures/photographic-outline-star-fit.json'));
  const catalogue=JSON.parse(await fs.readFile(fixture.sourceCatalogue)),photo=await readHardPhoto(catalogue.source);
  const quad=fixture.quad.map(([x,y])=>[x+1,y]),cfg={...AUTOMATIC_PRESET,timeLimit:10,trials:0,earlyStop:false};
  const prepared=prepare({...photo,quad},cfg),source=prepared.target.sourceImage;
  const mask=source.mask.slice(),probability=source.probability.slice();
  assert.equal(createHash('sha256').update(mask).digest('hex'),'3338849d32ecafd54d2365fc664ec97ee5fbca5b54534290d873f6919437f5f4');
  const started=performance.now(),answer=await design(prepared.target,cfg),seconds=(performance.now()-started)/1000;
  assert.ok(seconds<10,`The complete solve and export took ${seconds} seconds`);
  assert.equal(answer.report.templateChecksPassed,true);
  assert.equal(answer.report.validation.passed,true);
  assert.equal(answer.report.manufacturing.status,'pass');
  assert.ok(answer.report.solver.checkpoints.some(c=>c.step>=80&&c.geometry&&c.paper==='pass'),
    'A slightly over-limit grid must retain useful valid curve updates after routing fails.');
  for(const resolution of [400,800]){
    const replay=await renderExportedWeave(answer.files['cut_geometry.json'],resolution);
    const reference=Uint8Array.from({length:resolution**2},(_,i)=>mask[Math.floor(Math.floor(i/resolution)*source.resolution/resolution)*source.resolution+Math.floor(i%resolution*source.resolution/resolution)]);
    const error=replay.mask.reduce((sum,v,i)=>sum+Number(v!==reference[i]),0)/reference.length;
    assert.ok(error<.011,`Independent error at ${resolution}px is ${error}`);
  }
  assert.deepEqual(source.mask,mask);assert.deepEqual(source.probability,probability);
});
