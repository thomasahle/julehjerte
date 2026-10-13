import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {prepare,design} from '../../static/inverse/core/engine.js';
import {AUTOMATIC_PRESET} from '../../static/inverse/core/presets.js';
import {settings} from '../../static/inverse/core/settings.js';
import {imageFeatures} from '../../static/inverse/core/image-features.js';
import {auditFeatureFidelity} from '../../static/inverse/core/feature-shapes.js';
import {initializeFeatureSeeds} from '../../static/inverse/core/direct/feature-seeds.js';
import {borderEvidence} from '../../static/inverse/core/direct/counts.js';
import {readHardPhoto} from './hard-photo-data.mjs';
import {renderExportedWeave} from './export-renderer.mjs';

async function nearMiss(translation=null){
  const fixture=JSON.parse(await fs.readFile('scripts/inverse/fixtures/photographic-near-miss-seed.json'));
  const catalogue=JSON.parse(await fs.readFile(fixture.sourceCatalogue));
  const photo=await readHardPhoto(catalogue.cases.find(c=>c.id===fixture.sourceCase));
  assert.equal(photo.fileSha256,fixture.sourceFileSha256);assert.equal(photo.rgbaSha256,fixture.decodedPixelsSha256);
  const expected=translation?fixture.translations[translation]:fixture;
  const quad=fixture.quad.map(p=>p.map((v,axis)=>v+(expected.offset?.[axis]||0)));
  const cfg={...AUTOMATIC_PRESET,timeLimit:10,trials:0,earlyStop:false},prepared=prepare({...photo,quad},cfg);
  const source=prepared.target.sourceImage,hash=b=>createHash('sha256').update(b).digest('hex');
  assert.equal(hash(source.mask),expected.maskSha256);assert.equal(hash(new Uint8Array(source.probability.buffer)),expected.probabilitySha256);
  return{prepared,cfg};
}

test('a colour-retaining near miss earns refinement before changing both cut counts',async()=>{
  const {prepared,cfg:options}=await nearMiss(),source=prepared.target.sourceImage,cfg=settings(options),features=imageFeatures(source,cfg.width);
  const missed=features.findIndex(f=>f.areaMm2<40&&f.centerMm[0]>50&&f.centerMm[1]>50);assert.ok(missed>=0);
  const result=initializeFeatureSeeds({source,features,missed:[missed],counts:[3,3],cfg,evidence:borderEvidence(source.probability,source.resolution),maximumCount:8});
  const retry=result.report.coarseRefinement;assert.ok(retry);
  assert.ok(retry.initialError>3*cfg.maxImageError,'The useful initial layout failed the old coarse cutoff.');
  assert.ok(retry.error<=3*cfg.maxImageError,'Refinement must meet the same cutoff; it is not relaxed.');
  assert.equal(retry.featuresPassed,true);assert.equal(retry.accepted,true);
  assert.equal(result.report.jointHypotheses,0);assert.deepEqual(result.seeds[0].model.counts,[3,3]);
});

test('a discarded same-count start preserves the opening after a one-pixel crop shift',async()=>{
  const {prepared,cfg:options}=await nearMiss('horizontal'),source=prepared.target.sourceImage,cfg=settings(options),features=imageFeatures(source,cfg.width);
  const missed=features.findIndex(f=>f.areaMm2<40&&f.centerMm[0]>50&&f.centerMm[1]>50);assert.ok(missed>=0);
  const result=initializeFeatureSeeds({source,features,missed:[missed],counts:[3,3],cfg,evidence:borderEvidence(source.probability,source.resolution),maximumCount:8});
  assert.equal(result.report.coarseRefinement.accepted,false,'The former winning layouts still fail the original cutoff.');
  const retry=result.report.alternativeRefinement;assert.ok(retry);
  assert.deepEqual(retry.counts,[3,3]);assert.equal(retry.featuresPassed,true);assert.equal(retry.accepted,true);
  assert.ok(retry.initialError>3*cfg.maxImageError);assert.ok(retry.error<=3*cfg.maxImageError);
  assert.equal(result.report.jointHypotheses,0,'An existing three-cut layout avoids another count hypothesis.');
  assert.deepEqual(result.seeds[0].model.counts,[3,3]);
});

for(const translation of [null,'horizontal'])test(`the ${translation||'original'} near-miss layout produces checked exports within the original short search`,async()=>{
  const {prepared,cfg}=await nearMiss(translation),source=prepared.target.sourceImage,mask=source.mask.slice(),probability=source.probability.slice();
  const answer=await design(prepared.target,cfg);
  const initialization=answer.report.solver.earlyFeatureInitialization;
  assert.equal((translation?initialization.alternativeRefinement:initialization.coarseRefinement).accepted,true);
  assert.equal(answer.report.templateChecksPassed,true);
  assert.equal(answer.report.validation.passed,true);assert.equal(answer.report.manufacturing.status,'pass');
  assert.ok(answer.report.solver.seconds<10);
  for(const scale of [1,2]){
    const n=source.resolution*scale,reference={resolution:n,mask:Uint8Array.from({length:n*n},(_,i)=>mask[Math.floor(Math.floor(i/n)/scale)*source.resolution+Math.floor((i%n)/scale)])};
    const replay=await renderExportedWeave(answer.files['cut_geometry.json'],n);
    const error=replay.mask.reduce((sum,v,i)=>sum+Number(v!==reference.mask[i]),0)/reference.mask.length;
    assert.ok(error<.03,`Independent ${n}-pixel disagreement is ${error}.`);
    assert.equal(auditFeatureFidelity(reference,replay.mask,answer.report.settings).passed,true);
  }
  assert.deepEqual(source.mask,mask);assert.deepEqual(source.probability,probability);
});
