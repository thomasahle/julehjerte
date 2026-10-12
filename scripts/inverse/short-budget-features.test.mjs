import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {prepare,design} from '../../static/inverse/core/engine.js';
import {AUTOMATIC_PRESET} from '../../static/inverse/core/presets.js';
import {auditFeatureFidelity} from '../../static/inverse/core/feature-shapes.js';
import {readHardPhoto} from './hard-photo-data.mjs';
import {hardPhotoTarget} from './hard-photo-target.mjs';
import {renderExportedWeave} from './export-renderer.mjs';

const fixtures=JSON.parse(await fs.readFile('scripts/inverse/fixtures/photographic-short-budget-fits.json'));
const catalogue=JSON.parse(await fs.readFile(fixtures.sourceCatalogue));
const hash=b=>createHash('sha256').update(b).digest('hex');

for(const fixture of fixtures.cases)test(`${fixture.sourceCase} retains its interior detail in a ten-second fresh fit`,async()=>{
  const photo=await readHardPhoto(catalogue.cases.find(c=>c.id===fixture.sourceCase));
  assert.equal(photo.fileSha256,fixture.sourceFileSha256);
  assert.equal(photo.rgbaSha256,fixture.decodedPixelsSha256);
  const cfg={...AUTOMATIC_PRESET,timeLimit:10,trials:0,earlyStop:false};
  const imported=prepare({...photo,quad:fixture.quad},cfg),input=hardPhotoTarget(imported,'mask',cfg),source=input.sourceImage;
  const mask=source.mask.slice(),probability=source.probability.slice();
  assert.equal(hash(mask),fixture.maskSha256);
  assert.equal(hash(new Uint8Array(probability.buffer)),fixture.fittingProbabilitySha256);
  let refined=false;
  const answer=await design(input,cfg,event=>{
    if(event.stage==='directRefining'&&event.step>=80)refined=true;
  });
  assert.ok(refined,'Speculative routing must leave time for actual curve fitting.');
  assert.equal(answer.report.validation.passed,true);
  assert.equal(answer.report.manufacturing.status,'pass');
  assert.equal(answer.report.templateChecksPassed,true);
  // Replay actual exported curves at two resolutions. Whole-image agreement
  // alone can hide the lost opening/stone that made the previous result fail.
  for(const scale of [1,2]){
    const n=source.resolution*scale,reference={resolution:n,mask:Uint8Array.from({length:n*n},(_,i)=>mask[Math.floor(Math.floor(i/n)/scale)*source.resolution+Math.floor((i%n)/scale)])};
    const replay=await renderExportedWeave(answer.files['cut_geometry.json'],n);
    const error=replay.mask.reduce((sum,v,i)=>sum+Number(v!==reference.mask[i]),0)/reference.mask.length;
    assert.ok(error<.03,`Independent ${n}-cell image disagreement is ${error}.`);
    assert.equal(auditFeatureFidelity(reference,replay.mask,answer.report.settings).passed,true);
  }
  assert.deepEqual(source.mask,mask);assert.deepEqual(source.probability,probability);
});
