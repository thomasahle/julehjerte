import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {prepare,design} from '../../static/inverse/core/engine.js';
import {AUTOMATIC_PRESET} from '../../static/inverse/core/presets.js';
import {readHardPhoto} from './hard-photo-data.mjs';
import {renderExportedWeave} from './export-renderer.mjs';

test('unsuccessful photo routing leaves time to improve the independent curve fit',async()=>{
  const fixture=JSON.parse(await fs.readFile('scripts/inverse/fixtures/photographic-puppy-fit.json'));
  const catalogue=JSON.parse(await fs.readFile(fixture.sourceCatalogue));
  const photo=await readHardPhoto(catalogue.cases.find(c=>c.id===fixture.sourceCase));
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
  assert.ok(error<.0085,`Independent error ${error} must improve on the unrefined 0.01458125.`);
  // Refinement still cannot guarantee recovery of a remote missing region.
  // Keep the ordinary final feature gate; do not turn low mean error into a pass.
  if(answer.report.imageFidelity.features.missing.length)assert.equal(answer.report.templateChecksPassed,false);
  assert.deepEqual(source.mask,mask);assert.deepEqual(source.probability,probability);
});
