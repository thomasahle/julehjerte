import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createCanvas} from 'canvas';
import {prepare,design} from '../../static/inverse/core/engine.js';
import {AUTOMATIC_PRESET} from '../../static/inverse/core/presets.js';
import {settings} from '../../static/inverse/core/settings.js';
import {imageFeatures,auditImageFeatures} from '../../static/inverse/core/image-features.js';
import {initializeFeatureSeeds,featureRefinementObjective} from '../../static/inverse/core/direct/feature-seeds.js';
import {borderEvidence} from '../../static/inverse/core/direct/counts.js';
import {fitGrid,gridMask,mismatch} from '../../static/inverse/core/direct/grid.js';
import {resize} from '../../static/inverse/core/direct/math.js';
import {readHardPhoto} from './hard-photo-data.mjs';
import {renderExportedWeave} from './export-renderer.mjs';
import {featureComponentMetrics} from './feature-component-metrics.mjs';

async function puppy(dy=0,dx=0){
  const fixture=JSON.parse(await fs.readFile('scripts/inverse/fixtures/photographic-puppy-fit.json'));
  const catalogue=JSON.parse(await fs.readFile(fixture.sourceCatalogue));
  const photo=await readHardPhoto(catalogue.cases.find(c=>c.id===fixture.sourceCase));
  const prepared=prepare({...photo,quad:fixture.quad.map(([x,y])=>[x+dx,y+dy])},AUTOMATIC_PRESET);
  if(!dy&&!dx)assert.equal(createHash('sha256').update(prepared.preview.mask).digest('hex'),fixture.maskSha256);
  return prepared;
}

async function bird(){
  const fixture=JSON.parse(await fs.readFile('scripts/inverse/fixtures/photographic-bird-fit.json'));
  const catalogue=JSON.parse(await fs.readFile(fixture.sourceCatalogue)),photo=await readHardPhoto(catalogue.source);
  const crop=prepare({...photo,quad:fixture.quad},AUTOMATIC_PRESET);
  const prepared=prepare({type:'mask',mask:crop.preview.mask,resolution:400},AUTOMATIC_PRESET),source=prepared.target.sourceImage;
  assert.equal(createHash('sha256').update(source.mask).digest('hex'),fixture.maskSha256);
  assert.equal(createHash('sha256').update(new Uint8Array(source.probability.buffer)).digest('hex'),fixture.fittingProbabilitySha256);
  return prepared;
}

test('a missing opening can need a joint count change and continued region protection',async()=>{
  const source=(await bird()).target.sourceImage,cfg=settings(AUTOMATIC_PRESET),features=imageFeatures(source);
  assert.equal(features.length,3);assert.equal(features[1].areaMm2,3.4375);
  const result=initializeFeatureSeeds({source,features,missed:[1,2],counts:[4,4],cfg,evidence:borderEvidence(source.probability,400),maximumCount:8});
  assert.equal(result.report.jointHypotheses,2);
  assert.equal(result.report.hypotheses,12,'Only the adjacent joint count pair is added, not a full Cartesian search');
  assert.ok(result.report.attempts.filter(a=>!a.protectFeatures).every(a=>!a.featuresPassed));
  assert.deepEqual(result.seeds[0].model.counts,[5,5]);
  assert.equal(result.seeds[0].protectFeatures,true);
  assert.equal(result.seeds[0].featuresPassed,true);
  assert.equal(result.seeds[0].error,mismatch(gridMask(result.seeds[0].model,256,result.seeds[0].phase,result.seeds[0].floor),resize(source.probability,400,256)));
  const original=source.probability.slice(),objective=featureRefinementObjective(source,features,400);
  for(const feature of features)for(const pixel of feature.pixels)assert.equal(objective.weights[pixel],1);
  assert.equal(objective.weights[0],1/16);
  assert.deepEqual(objective.probability,Float64Array.from(original));
  assert.deepEqual(source.probability,original,'Region protection changes importance, never source colours');
});

test('the full fitter retains the bird eye through clearance, refinement and independent export',async()=>{
  const prepared=await bird(),source=prepared.target.sourceImage,checkpoints=[];
  const answer=await design(prepared.target,{...AUTOMATIC_PRESET,timeLimit:25,trials:0,earlyStop:false},()=>{},{onCandidate:c=>checkpoints.push(c)});
  assert.equal(answer.report.solver.selectedInitialization,'feature-preserving-grid');
  assert.ok(answer.report.solver.candidates.some(c=>!c.featuresPassed&&c.paper),'The old fallback remains available');
  assert.ok(checkpoints.some(c=>c.materialResolution===700&&c.error<.03),'Stop must receive original-image scores and the actual paper resolution');
  assert.equal(answer.report.settings.materialResolution,700);
  assert.equal(answer.report.manufacturing.status,'pass');
  assert.equal(answer.report.validation.passed,true);
  assert.equal(answer.report.templateChecksPassed,true);
  const replay=await renderExportedWeave(answer.files['cut_geometry.json'],400),audit=auditImageFeatures(source,replay.mask);
  assert.equal(audit.passed,true);assert.ok(audit.regions[1].retainedFraction>=.6);
  assert.ok(mismatch(replay.mask,source.mask)<.03,'A weighted search score must not certify the original image');
  assert.equal(answer.report.solver.featureDetail.applied,true);
  for(const resolution of [400,800]){
    const woven=resolution===400?replay:await renderExportedWeave(answer.files['cut_geometry.json'],resolution);
    const mask=Uint8Array.from({length:resolution**2},(_,i)=>source.mask[Math.floor(Math.floor(i/resolution)*400/resolution)*400+Math.floor((i%resolution)*400/resolution)]);
    const eye=featureComponentMetrics({mask,resolution},woven.mask).find(f=>f.centerMm[0]<30);
    assert.equal(eye.touchesBorder,false,'Retaining eye pixels must not hide an unwanted connecting seam');
    assert.ok(eye.componentIoU>.8,'Refinement must recover the small shape, not merely enlarge its white region');
  }
  assert.deepEqual(source.mask,prepared.preview.mask);
});

test('a short search reserves enough local refinement to close the photographed bird eye',async()=>{
  const prepared=await bird(),source=prepared.target.sourceImage,mask=source.mask.slice(),probability=source.probability.slice();
  const answer=await design(prepared.target,{...AUTOMATIC_PRESET,timeLimit:10,trials:0,earlyStop:false});
  const solver=answer.report.solver;
  assert.equal(solver.earlyFeatureInitialization.enclosurePending,true,'The initial colour-retaining grid has an open eye.');
  assert.equal(solver.featureRecovery.budgetPolicy,'probe_before_grid_refinement');
  assert.equal(solver.earlyFeatureInitialization.detailHandoff,true);
  assert.equal(solver.featureDetail.applied,true);
  assert.ok(solver.seconds<10);
  assert.equal(answer.report.templateChecksPassed,true);assert.equal(answer.report.validation.passed,true);
  assert.equal(answer.report.manufacturing.status,'pass');assert.equal(answer.report.settings.materialResolution,700);
  for(const resolution of [400,800]){
    const woven=await renderExportedWeave(answer.files['cut_geometry.json'],resolution);
    const expected=Uint8Array.from({length:resolution**2},(_,i)=>mask[Math.floor(Math.floor(i/resolution)*400/resolution)*400+Math.floor((i%resolution)*400/resolution)]);
    assert.ok(mismatch(woven.mask,expected)<.03,'The unchanged source mask, not the weighted refinement objective, defines acceptance.');
    const eye=featureComponentMetrics({mask:expected,resolution},woven.mask).find(f=>f.centerMm[0]<30);
    assert.equal(eye.touchesBorder,false,'A narrow connecting seam is not an eye.');
    assert.ok(eye.componentIoU>.8,'The eye must retain its small shape, not inflate into a different region.');
  }
  assert.deepEqual(source.mask,mask);assert.deepEqual(source.probability,probability);
});

test('additional layouts can retain a remote opening without editing the image or using weighted final scores',async()=>{
  const source=(await puppy()).target.sourceImage,mask=source.mask.slice(),probability=source.probability.slice();
  const cfg=settings({...AUTOMATIC_PRESET,trials:0}),features=imageFeatures(source);
  assert.equal(features.length,1);
  const args={source,features,missed:[0],counts:[3,3],cfg,evidence:borderEvidence(source.probability,source.resolution),maximumCount:8};
  const result=initializeFeatureSeeds(args);
  assert.equal(result.report.finerHypotheses,0,'An existing coarse layout must not pay for speculative extra curve freedom');
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

test('a finer spline recovers a half-resolution opening after all coarse feature starts fail',async()=>{
  const fixture=JSON.parse(await fs.readFile('scripts/inverse/fixtures/photographic-puppy-fit.json'));
  const catalogue=JSON.parse(await fs.readFile(fixture.sourceCatalogue));
  const photo=await readHardPhoto(catalogue.cases.find(c=>c.id===fixture.sourceCase));
  assert.equal(photo.fileSha256,fixture.sourceFileSha256);assert.equal(photo.rgbaSha256,fixture.decodedPixelsSha256);
  const canvas=createCanvas(Math.round(photo.imageWidth/2),Math.round(photo.imageHeight/2)),ctx=canvas.getContext('2d');
  ctx.drawImage(photo.canvas,0,0,canvas.width,canvas.height);
  const cfg=settings({...AUTOMATIC_PRESET,timeLimit:10,trials:0,earlyStop:false}),hash=b=>createHash('sha256').update(b).digest('hex');
  const rgba=ctx.getImageData(0,0,canvas.width,canvas.height).data;
  assert.equal(hash(rgba),'c59764172b1293df526a5326bb54ba4085b73d6314f28b48e9cfc3be77006d71');
  const imported=prepare({type:'pixels',rgba,imageWidth:canvas.width,imageHeight:canvas.height,quad:fixture.quad.map(p=>p.map(v=>v/2))},cfg);
  assert.equal(hash(imported.preview.mask),'892ade9f2353db4be42a7c22ddec818734930e100a1ab6b63837e1d9b07076b5');
  const prepared=prepare({type:'mask',mask:imported.preview.mask,resolution:imported.preview.resolution},cfg),source=prepared.target.sourceImage;
  const mask=source.mask.slice(),probability=source.probability.slice(),features=imageFeatures(source);
  const opening=features.findIndex(f=>f.areaMm2<30);assert.ok(opening>=0);
  const search=initializeFeatureSeeds({source,features,missed:[opening],counts:[3,3],cfg,evidence:borderEvidence(probability,source.resolution),maximumCount:8});
  assert.equal(search.report.alternativeRefinement,null,'A discarded unequal-count start must not displace the working finer-spline route.');
  assert.equal(search.report.finerHypotheses,10);assert.equal(search.report.hypotheses,22);
  assert.ok(search.report.attempts.filter(a=>a.controlPoints===16).every(a=>!a.featuresPassed));
  assert.ok(search.seeds.length);assert.equal(search.seeds[0].model.k,32);
  const initial=featureComponentMetrics(source,gridMask(search.seeds[0].model,source.resolution,search.seeds[0].phase,search.seeds[0].floor),100,[features[opening]])[0];
  assert.equal(initial.touchesBorder,false);
  const answer=await design(prepared.target,cfg),solver=answer.report.solver;
  assert.equal(solver.earlyFeatureInitialization.finerHypotheses,10);
  assert.equal(solver.earlyFeatureInitialization.scheduled,1);assert.equal(solver.featureRecovery,null);
  for(const stage of ['fine','clearance'])assert.ok(solver.attempts.some(a=>a.stage===stage&&a.controlPoints===32));
  assert.equal(answer.report.templateChecksPassed,true);assert.equal(answer.report.validation.passed,true);
  assert.equal(answer.report.manufacturing.status,'pass');
  const rendered=await renderExportedWeave(answer.files['cut_geometry.json'],source.resolution);
  assert.ok(mismatch(rendered.mask,mask)<.012);assert.equal(auditImageFeatures(source,rendered.mask).passed,true);
  const fitted=featureComponentMetrics(source,rendered.mask,100,[features[opening]])[0];
  assert.equal(fitted.touchesBorder,false);assert.ok(fitted.componentIoU>.5,'The opening must keep its shape, not just retain some source pixels');
  assert.deepEqual(source.mask,mask);assert.deepEqual(source.probability,probability);
});

test('a horizontal crop shift recovers its opening by refining an uncertain alternate',async()=>{
  const imported=await puppy(0,1),cfg={...AUTOMATIC_PRESET,timeLimit:25,trials:0,earlyStop:false};
  assert.equal(createHash('sha256').update(imported.preview.mask).digest('hex'),'a96eea21b65604e2a7b9b93d6823cdd58937bebd66fceeb80e9a1f5c2812c1cc');
  const prepared=prepare({type:'mask',mask:imported.preview.mask,resolution:400},cfg),source=prepared.target.sourceImage;
  const before=source.mask.slice(),probability=source.probability.slice();
  // Only photograph pixels and the shifted quad enter the fresh search.
  const answer=await design(prepared.target,cfg),solver=answer.report.solver;
  assert.equal(solver.earlyFeatureInitialization.featureRetry.reason,'lost');
  assert.equal(solver.earlyFeatureInitialization.scheduled,2);
  assert.equal(solver.earlyFeatureInitialization.hypotheses,10,'Reuse a computed routing rather than repeating count search');
  assert.ok(solver.candidates.some(c=>c.featuresPassed&&!c.imagePassed&&c.paperVerification?.status==='uncertain'));
  assert.equal(solver.featureDetail.applied,true);
  assert.equal(solver.featureDetail.paperStatus,'pass');
  assert.equal(answer.report.templateChecksPassed,true);
  assert.equal(answer.report.validation.passed,true);
  assert.equal(answer.report.manufacturing.status,'pass');
  assert.equal(answer.report.settings.materialResolution,700);
  for(const resolution of [400,800]){
    const rendered=await renderExportedWeave(answer.files['cut_geometry.json'],resolution);
    const mask=Uint8Array.from({length:resolution**2},(_,i)=>source.mask[Math.floor(Math.floor(i/resolution)*400/resolution)*400+Math.floor((i%resolution)*400/resolution)]);
    const opening=featureComponentMetrics({mask,resolution},rendered.mask).find(f=>f.sourceAreaMm2<30);
    assert.equal(opening.touchesBorder,false);assert.ok(opening.componentIoU>.6);
    assert.ok(mismatch(rendered.mask,mask)<.015);
  }
  assert.deepEqual(source.mask,before);assert.deepEqual(source.probability,probability);
});

test('a crop-edge fragment still counts in fidelity but cannot drive an extra cut layout',async()=>{
  const fixture=JSON.parse(await fs.readFile('scripts/inverse/fixtures/photographic-outline-star-fit.json'));
  const catalogue=JSON.parse(await fs.readFile(fixture.sourceCatalogue));
  const photo=await readHardPhoto(catalogue.source),cfg=settings({...AUTOMATIC_PRESET,trials:0});
  const prepared=prepare({...photo,quad:fixture.quad},cfg),source=prepared.target.sourceImage;
  assert.equal(createHash('sha256').update(source.mask).digest('hex'),fixture.maskSha256);
  const features=imageFeatures(source,cfg.width),index=features.findIndex(f=>f.centerMm[1]>98);
  assert.ok(index>=0);assert.equal(features[index].areaMm2,4.25);
  const woven=source.mask.slice();for(const pixel of features[index].pixels)woven[pixel]=1-features[index].value;
  assert.equal(auditImageFeatures(source,woven,cfg.width,features).passed,false,'Do not loosen the final fidelity gate');
  const result=initializeFeatureSeeds({source,features,missed:[index],counts:[3,3],cfg,evidence:borderEvidence(source.probability,source.resolution),maximumCount:8});
  assert.equal(result.report.skippedBorderRegions,1);
  assert.equal(result.report.hypotheses,0);assert.deepEqual(result.seeds,[]);
  assert.deepEqual(source.mask,prepared.preview.mask);
  const answer=await design(prepared.target,{...cfg,timeLimit:25,earlyStop:false});
  assert.equal(answer.report.solver.featureInitialization.deferredBorderOnly,true);
  assert.equal(answer.report.manufacturing.status,'pass');
  assert.equal(answer.report.validation.passed,true);
  assert.equal(answer.report.templateChecksPassed,false,'Keep the unresolved boundary feature visible in the report');
  const replay=await renderExportedWeave(answer.files['cut_geometry.json'],400);
  assert.ok(mismatch(replay.mask,source.mask)<.01,'Do not replace the close star with the 1.8% seam-producing fit');
});

test('early feature routing recovers the frozen puppy opening within a ten-second search',async()=>{
  const imported=await puppy(),cfg={...AUTOMATIC_PRESET,timeLimit:10,trials:0,earlyStop:false};
  const prepared=prepare({type:'mask',mask:imported.preview.mask,resolution:400},cfg),source=prepared.target.sourceImage;
  const checkpoints=[];
  const answer=await design(prepared.target,cfg,()=>{},{onCandidate:c=>checkpoints.push(c)}),solver=answer.report.solver;
  assert.ok(checkpoints.some(c=>c.materialResolution===700&&c.error<.018),
    'Graceful Stop must retain the candidate after its finer paper check passes');
  assert.equal(solver.selectedInitialization,'feature-weighted-grid');
  assert.equal(solver.earlyFeatureInitialization.stage,'before-recovery');
  assert.equal(solver.earlyFeatureInitialization.scheduled,1);
  assert.equal(solver.featureRecovery,null,'A feature-retaining grid must not spend the fast budget on traced recovery');
  assert.ok(solver.attempts.some(a=>a.stage==='fine'&&a.counts.every(c=>c===3)),
    'The ordinary three-cut finalist is still initialized as a fallback');
  assert.ok(solver.candidates.some(c=>c.paperVerification?.initialStatus==='uncertain'&&c.paperVerification.status==='pass'),
    'The original feature routing must earn its finer paper verification before optional detail refinement');
  assert.ok(solver.paperVerification.initialStatus==='uncertain'||solver.paperVerification.source==='feature-detail-refinement');
  assert.equal(answer.report.settings.materialResolution,solver.paperVerification.resolution);
  assert.equal(answer.report.manufacturing.status,'pass');
  assert.equal(answer.report.validation.passed,true);
  assert.equal(answer.report.templateChecksPassed,true);
  const replay=await renderExportedWeave(answer.files['cut_geometry.json'],400);
  assert.equal(auditImageFeatures(source,replay.mask).passed,true);
  assert.ok(mismatch(replay.mask,source.mask)<.018);
  assert.deepEqual(source.mask,imported.preview.mask);
});

test('a one-pixel crop shift cannot discard a feature-preserving fine-grid checkpoint',async()=>{
  const imported=await puppy(1),cfg=settings({...AUTOMATIC_PRESET,timeLimit:10,trials:0,earlyStop:false});
  assert.equal(createHash('sha256').update(imported.preview.mask).digest('hex'),'19f2c14b8e5e09abdeda442284bb1187e80369331482ab6db0d935ef8335fd91');
  const prepared=prepare({type:'mask',mask:imported.preview.mask,resolution:400},cfg),source=prepared.target.sourceImage,features=imageFeatures(source);
  const search=initializeFeatureSeeds({source,features,missed:[0],counts:[3,3],cfg,evidence:borderEvidence(source.probability,400),maximumCount:8}),seed=search.seeds[0];
  assert.ok(seed);assert.equal(seed.featuresPassed,true);
  const prob=resize(source.probability,400,256),optimizationTarget=resize(source.probability,400,96);
  const retained=r=>auditImageFeatures(source,gridMask(r.model,400,r.phase,r.floor),100,features).passed;
  const options={steps:150,initial:seed.model.z,optimizationTarget};
  const erased=fitGrid(prob,256,seed.model.counts,seed.phase,options),kept=fitGrid(prob,256,seed.model.counts,seed.phase,{...options,preferCheckpoint:retained});
  assert.equal(retained(erased),false,'The lower average error alone omits the opening');
  assert.equal(retained(kept),true);assert.ok(kept.error>erased.error);
  const unavailable=fitGrid(prob,256,seed.model.counts,seed.phase,{...options,preferCheckpoint:()=>false});
  assert.deepEqual(unavailable.model.z,erased.model.z,'An unavailable preference must leave the ordinary fallback intact');
  const answer=await design(prepared.target,cfg),rendered=await renderExportedWeave(answer.files['cut_geometry.json'],400);
  assert.equal(answer.report.templateChecksPassed,true);
  assert.equal(answer.report.manufacturing.status,'pass');assert.equal(answer.report.validation.passed,true);
  assert.equal(auditImageFeatures(source,rendered.mask).passed,true);assert.ok(mismatch(rendered.mask,source.mask)<.018);
  const opening=featureComponentMetrics(source,rendered.mask).find(f=>f.centerMm[1]<80);
  assert.equal(opening.touchesBorder,false,'The opening must not become a channel to the background');
  assert.ok(opening.componentIoU>.5,'Preserving the pixels must not create a much larger white blob');
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
