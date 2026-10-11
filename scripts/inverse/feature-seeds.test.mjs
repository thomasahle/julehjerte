import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {prepare,design} from '../../static/inverse/core/engine.js';
import {AUTOMATIC_PRESET} from '../../static/inverse/core/presets.js';
import {settings} from '../../static/inverse/core/settings.js';
import {imageFeatures,auditImageFeatures} from '../../static/inverse/core/image-features.js';
import {initializeFeatureSeeds} from '../../static/inverse/core/direct/feature-seeds.js';
import {borderEvidence} from '../../static/inverse/core/direct/counts.js';
import {gridMask,mismatch} from '../../static/inverse/core/direct/grid.js';
import {resize} from '../../static/inverse/core/direct/math.js';
import {readHardPhoto} from './hard-photo-data.mjs';
import {renderExportedWeave} from './export-renderer.mjs';

async function puppy(){
  const fixture=JSON.parse(await fs.readFile('scripts/inverse/fixtures/photographic-puppy-fit.json'));
  const catalogue=JSON.parse(await fs.readFile(fixture.sourceCatalogue));
  const photo=await readHardPhoto(catalogue.cases.find(c=>c.id===fixture.sourceCase));
  const prepared=prepare({...photo,quad:fixture.quad},AUTOMATIC_PRESET);
  assert.equal(createHash('sha256').update(prepared.preview.mask).digest('hex'),fixture.maskSha256);
  return prepared;
}

test('additional layouts can retain a remote opening without editing the image or using weighted final scores',async()=>{
  const source=(await puppy()).target.sourceImage,mask=source.mask.slice(),probability=source.probability.slice();
  const cfg=settings({...AUTOMATIC_PRESET,trials:0}),features=imageFeatures(source);
  assert.equal(features.length,1);
  const args={source,features,missed:[0],counts:[3,3],cfg,evidence:borderEvidence(source.probability,source.resolution),maximumCount:8};
  const result=initializeFeatureSeeds(args);
  assert.ok(result.seeds.length,'A new starting layout must retain the opening which all ordinary initial grids missed');
  assert.ok(result.seeds.some(s=>s.model.counts[0]!==s.model.counts[1]));
  for(const seed of result.seeds){
    assert.equal(auditImageFeatures(source,gridMask(seed.model,400,seed.phase,seed.floor)).passed,true);
    assert.equal(seed.error,mismatch(gridMask(seed.model,256,seed.phase,seed.floor),resize(probability,400,256)),
      'Weighted initializer scores must never compete as ordinary image errors');
  }
  const bounded=initializeFeatureSeeds({...args,maximumCount:3});
  assert.ok(bounded.report.attempts.every(a=>a.counts.every(c=>c<=3)));
  assert.deepEqual(source.mask,mask);assert.deepEqual(source.probability,probability);
});

test('production search recovers the frozen puppy opening and verifies the exported pair',async()=>{
  const imported=await puppy(),cfg={...AUTOMATIC_PRESET,timeLimit:25,trials:0,earlyStop:false};
  const prepared=prepare({type:'mask',mask:imported.preview.mask,resolution:400},cfg),source=prepared.target.sourceImage;
  const checkpoints=[];
  const answer=await design(prepared.target,cfg,()=>{},{onCandidate:c=>checkpoints.push(c)}),solver=answer.report.solver;
  assert.ok(checkpoints.some(c=>c.materialResolution===700&&c.error<.018),
    'Graceful Stop must retain the candidate after its finer paper check passes');
  assert.equal(solver.selectedInitialization,'feature-weighted-grid');
  assert.ok(solver.candidates.some(c=>!c.featuresPassed&&c.paper),'The previous valid fallback must remain available');
  assert.equal(solver.paperVerification.initialStatus,'uncertain');
  assert.equal(answer.report.settings.materialResolution,solver.paperVerification.resolution);
  assert.equal(answer.report.manufacturing.status,'pass');
  assert.equal(answer.report.validation.passed,true);
  assert.equal(answer.report.templateChecksPassed,true);
  const replay=await renderExportedWeave(answer.files['cut_geometry.json'],400);
  assert.equal(auditImageFeatures(source,replay.mask).passed,true);
  assert.ok(mismatch(replay.mask,source.mask)<.018);
  assert.deepEqual(source.mask,imported.preview.mask);
});

test('resolving paper uncertainty does not hide the candle’s better ordinary finalist',async()=>{
  const catalogue=JSON.parse(await fs.readFile('scripts/inverse/hard-photo-cases.json'));
  const photo=await readHardPhoto(catalogue.source);
  const quad=[[1010.9144542590817,589.4652765269831],[1103.7537578794381,696.2833649430704],[998.6357722702141,795.1746948683086],[894.9268445855275,683.6338821954087]];
  const cfg={...AUTOMATIC_PRESET,timeLimit:10,trials:0,earlyStop:false},prepared=prepare({...photo,quad},cfg);
  assert.equal(createHash('sha256').update(prepared.preview.mask).digest('hex'),'263a91fc0a1b6db6db4da860f4145bd52aa0973927285068f8cbe267c9bc175d');
  const answer=await design(prepared.target,cfg);
  assert.ok(answer.report.solver.candidates.some(c=>c.paperVerification?.status==='pass'),
    'Exercise the formerly uncertain alternative, not a different early-exit route');
  assert.deepEqual(answer.report.slits,{left:1,right:1});
  assert.equal(answer.report.templateChecksPassed,true);
  const replay=await renderExportedWeave(answer.files['cut_geometry.json'],400);
  assert.ok(mismatch(replay.mask,prepared.preview.mask)<.008,
    'The 1.9% two-cut candidate must not prevent refinement of the better one-cut candidate');
});
