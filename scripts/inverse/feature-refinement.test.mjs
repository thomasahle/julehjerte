import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createCanvas,loadImage} from 'canvas';
import {prepare,design} from '../../static/inverse/core/engine.js';
import {AUTOMATIC_PRESET} from '../../static/inverse/core/presets.js';
import {renderExportedWeave} from './export-renderer.mjs';
import {catalogue,readPhoto} from './web-photo-data.mjs';
import {detectHeartCrops} from '../../static/inverse/core/crop.js';
import {recoverImageFeatures} from '../../static/inverse/core/feature-recovery.js';
import {finish} from '../../static/inverse/core/engine.js';
import {settings} from '../../static/inverse/core/settings.js';
import {auditFeatureFidelity} from '../../static/inverse/core/feature-shapes.js';
import {readHardPhoto} from './hard-photo-data.mjs';
import {hardPhotoTarget} from './hard-photo-target.mjs';

test('an image-rejected routing is only a provisional refinement seed',async()=>{
  const n=64,mask=Uint8Array.from({length:n*n},(_,i)=>(Math.floor((i%n)/16)+Math.floor(Math.floor(i/n)/16))%2);
  mask[8]^=1;
  const cfg=settings({algorithm:'direct',maxImageError:0,timeLimit:5,trials:0,roundHidden:false});
  const {target}=prepare({type:'mask',mask,resolution:n},cfg),before=target.sourceImage.mask.slice();
  const recovery=await recoverImageFeatures(target,cfg,5);
  assert.equal(recovery.solution,null);
  assert.equal(recovery.report.accepted,false);
  assert.equal(recovery.report.refinementSeedAvailable,true);
  assert.ok(recovery.report.imageError>cfg.maxImageError);
  assert.ok(recovery.refinementSeed);
  const answer=finish(recovery.refinementSeed,cfg);
  assert.equal(answer.report.templateChecksPassed,false,'A provisional seed must not bypass the final image limit.');
  assert.equal(answer.report.validation.passed,true);
  assert.equal(answer.report.manufacturing.status,'pass');
  assert.deepEqual(target.sourceImage.mask,before);
});

test('poor grid agreement recovers tree branches without relying on a spurious edge feature',async()=>{
  const data=await catalogue(),entry=data.cases.find(c=>c.id==='danish-tree-red');
  const photo=await readPhoto(data.photos.find(p=>p.id===entry.photo));
  const crop=detectHeartCrops(photo,{roi:entry.roi}).candidates[0];assert.ok(crop);
  const cfg={...AUTOMATIC_PRESET,timeLimit:10,trials:0,earlyStop:false};
  const prepared=prepare({...photo,quad:crop.quad},cfg),source=prepared.target.sourceImage,before=source.mask.slice(),probability=source.probability.slice();
  const answer=await design(prepared.target,cfg),report=answer.report,recovery=report.solver.featureRecovery;
  // The routing can now satisfy the original image limit during its bounded
  // geometry repair. Keep the provisional route available without requiring
  // an already valid recovery to be rejected before ordinary refinement.
  assert.ok(recovery.accepted||recovery.refinementSeedAvailable);
  assert.equal(recovery.trigger.passed,true,'Missing components are no longer the reason to attempt this routing.');
  assert.equal(recovery.gridMismatchTrigger,true);
  assert.equal(report.solver.traceUsed,true);
  assert.deepEqual(report.slits,{left:3,right:3});
  assert.equal(report.validation.passed,true);
  assert.equal(report.manufacturing.status,'pass');
  assert.equal(report.templateChecksPassed,true);
  assert.equal(report.imageFidelity.features.borderClearancePixels,1);
  assert.equal(report.imageFidelity.features.missing.length,0);
  const replay=await renderExportedWeave(answer.files['cut_geometry.json'],source.resolution);
  const error=replay.mask.reduce((sum,v,i)=>sum+Number(v!==before[i]),0)/before.length;
  assert.ok(error<.025,`Exported error ${error} must improve on the previous 0.0671125.`);
  assert.deepEqual(source.mask,before);assert.deepEqual(source.probability,probability);
});

test('an accepted photo routing retains polishing time when a refinement checkpoint is slow',async t=>{
  const catalog=JSON.parse(await fs.readFile('scripts/inverse/fixtures/hunodan/speed-crops.json'));
  const entry=catalog.cases.find(r=>r.id==='hjfig-05'),im=await loadImage(entry.source),[x,y,x1,y1]=entry.photoROI;
  const canvas=createCanvas(x1-x,y1-y),context=canvas.getContext('2d');context.drawImage(im,-x,-y);
  const cfg={...AUTOMATIC_PRESET,timeLimit:10,trials:0,earlyStop:false,progressGeometry:true};
  const prepared=prepare({type:'pixels',imageWidth:canvas.width,imageHeight:canvas.height,rgba:context.getImageData(0,0,canvas.width,canvas.height).data,quad:entry.quad},cfg);
  const actualNow=performance.now.bind(performance);let checkpointDelay=0;
  t.mock.method(performance,'now',()=>actualNow()+checkpointDelay);
  const answer=await design(prepared.target,cfg,event=>{
    if(event.stage==='directRefining'&&event.step===80)checkpointDelay=450;
  }),replay=await renderExportedWeave(answer.files['cut_geometry.json'],prepared.preview.resolution);
  assert.equal(checkpointDelay,450,'Exercise an expensive checkpoint without sleeping or replacing the candidate.');
  const error=replay.mask.reduce((sum,v,i)=>sum+Number(v!==prepared.preview.mask[i]),0)/replay.mask.length;
  assert.ok(['javascript','wasm'].includes(answer.report.solver.numericalBackend?.backend),'Recovered routes retain the backend diagnostic.');
  assert.ok(answer.report.solver.featureRecovery?.trigger,'The fixture must exercise recovery from a missing image feature.');
  assert.ok(answer.report.templateChecksPassed&&answer.report.validation.passed);assert.equal(answer.report.manufacturing.status,'pass');
  assert.deepEqual(answer.report.slits,{left:4,right:4});
  // The early 80-step result scored better internally but regressed to 1.0355%
  // in the independent renderer. Compare the real exported geometry here.
  assert.ok(error<.0091,`Exported disagreement ${100*error}% must retain the known fit while the search still has time.`);
  assert.ok(answer.report.solver.seconds<cfg.timeLimit);
});

test('a worse colour-retaining grid leaves time for direct photographic routing',async t=>{
  const catalog=JSON.parse(await fs.readFile('scripts/inverse/fixtures/hunodan/speed-crops.json'));
  const entry=catalog.cases.find(r=>r.id==='hjfig-05'),im=await loadImage(entry.source),[x,y,x1,y1]=entry.photoROI;
  const canvas=createCanvas(x1-x,y1-y),context=canvas.getContext('2d');context.drawImage(im,-x,-y);
  const cfg={...AUTOMATIC_PRESET,timeLimit:60,trials:0,earlyStop:false};
  const prepared=prepare({type:'pixels',imageWidth:canvas.width,imageHeight:canvas.height,rgba:context.getImageData(0,0,canvas.width,canvas.height).data,quad:entry.quad},cfg);
  const source=prepared.target.sourceImage,mask=source.mask.slice(),probability=source.probability.slice();
  const actualNow=performance.now.bind(performance);let elapsed=0,graphEvents=0;
  t.mock.method(performance,'now',()=>actualNow()+elapsed);
  const answer=await design(prepared.target,cfg,event=>{
    // A one-second graph delay used to expire this fixture's short probe.
    // The worse colour-retaining grid must no longer reserve that time.
    if(event.stage==='graph'&&++graphEvents===1)elapsed+=1000;
  });
  const solver=answer.report.solver,preference=solver.finalistPreference;
  assert.equal(preference.before[0].featuresRetained,false);
  assert.equal(preference.after[0].featuresRetained,true);
  assert.ok(preference.after[0].error>preference.before[0].error);
  assert.equal(preference.reservesRefinement,false);
  assert.equal(solver.deferredFeatureRecovery,null);
  assert.equal(graphEvents,1);
  assert.equal(solver.featureRecovery.budgetPolicy,'prioritize_routing');
  assert.equal(solver.featureRecovery.accepted,true);
  assert.ok(answer.report.templateChecksPassed&&answer.report.validation.passed);
  assert.equal(answer.report.manufacturing.status,'pass');
  assert.deepEqual(answer.report.slits,{left:4,right:4});
  const replay=await renderExportedWeave(answer.files['cut_geometry.json'],source.resolution);
  const error=replay.mask.reduce((sum,v,i)=>sum+Number(v!==mask[i]),0)/mask.length;
  assert.ok(error<.0095,`Direct routing must retain the known exported quality: ${100*error}% disagreement.`);
  assert.deepEqual(source.mask,mask);assert.deepEqual(source.probability,probability);
});

test('a stalled preferred grid resumes its expired routing probe within the longer budget',async t=>{
  const fixtures=JSON.parse(await fs.readFile('scripts/inverse/fixtures/photographic-short-budget-fits.json'));
  const fixture=fixtures.cases.find(r=>r.sourceCase==='flettede-viking');
  const catalogue=JSON.parse(await fs.readFile(fixture.sourceCatalogue||fixtures.sourceCatalogue));
  const photo=await readHardPhoto({...catalogue.source,...catalogue.cases.find(c=>c.id===fixture.sourceCase)});
  assert.equal(photo.fileSha256,fixture.sourceFileSha256);
  assert.equal(photo.rgbaSha256,fixture.decodedPixelsSha256);
  const cfg={...AUTOMATIC_PRESET,timeLimit:60,trials:0,earlyStop:false};
  const input=hardPhotoTarget(prepare({...photo,quad:fixture.quad},cfg),'mask',cfg),source=input.sourceImage;
  const mask=source.mask.slice(),probability=source.probability.slice();
  assert.equal(createHash('sha256').update(mask).digest('hex'),fixture.maskSha256);
  assert.equal(createHash('sha256').update(new Uint8Array(probability.buffer)).digest('hex'),fixture.fittingProbabilitySha256);
  const actualNow=performance.now.bind(performance);let elapsed=0,graphEvents=0,gridDelay=0;
  t.mock.method(performance,'now',()=>actualNow()+elapsed);
  const answer=await design(input,cfg,event=>{
    // Exercise both a slow initial probe and a stalled first refinement.
    // Only the clock changes: every grid, routing and final check uses the
    // real photograph. The remaining user budget still permits recovery.
    if(event.stage==='graph'&&++graphEvents===1)elapsed+=1000;
    if(event.stage==='directRefining'&&!gridDelay){
      assert.equal(graphEvents,1);
      gridDelay=7000;elapsed+=gridDelay;
    }
  });
  const solver=answer.report.solver,attempts=solver.featureRecoveryAttempts;
  assert.equal(gridDelay,7000);
  assert.equal(solver.finalistPreference.reservesRefinement,true);
  assert.equal(solver.deferredFeatureRecovery.attempted,true);
  assert.equal(graphEvents,2);
  assert.equal(attempts.length,2);
  assert.equal(attempts[0].budgetPolicy,'probe_before_grid_refinement');
  assert.equal(attempts[0].accepted,false);
  assert.equal(attempts[1].budgetPolicy,'after_grid_refinement');
  assert.ok(attempts[1].budgetSeconds<=solver.deferredFeatureRecovery.remainingSeconds);
  assert.ok(solver.seconds<cfg.timeLimit);
  assert.ok(answer.report.templateChecksPassed&&answer.report.validation.passed);
  assert.equal(answer.report.manufacturing.status,'pass');
  for(const scale of [1,2]){
    const n=source.resolution*scale,reference={resolution:n,mask:Uint8Array.from({length:n*n},(_,i)=>mask[Math.floor(Math.floor(i/n)/scale)*source.resolution+Math.floor((i%n)/scale)])};
    const replay=await renderExportedWeave(answer.files['cut_geometry.json'],n);
    const error=replay.mask.reduce((sum,v,i)=>sum+Number(v!==reference.mask[i]),0)/reference.mask.length;
    assert.ok(error<.03,`Recovery must preserve the photographic quality at ${n} pixels: ${100*error}% disagreement.`);
    assert.equal(auditFeatureFidelity(reference,replay.mask,answer.report.settings).passed,true);
  }
  assert.deepEqual(source.mask,mask);assert.deepEqual(source.probability,probability);
});

test('infeasible photograph traces can retry a smoother seed without changing the source target',async()=>{
  const data=await catalogue(),entry=data.cases.find(c=>c.id==='danish-tree-group-right'),photo=await readPhoto(data.photos.find(p=>p.id===entry.photo));
  const crop=detectHeartCrops(photo,{roi:entry.roi}).candidates[0];assert.ok(crop);
  const cfg={...AUTOMATIC_PRESET,timeLimit:10,trials:0,earlyStop:false},prepared=prepare({...photo,quad:crop.quad},cfg),source=prepared.target.sourceImage;
  const mask=source.mask.slice(),probability=source.probability.slice(),corners=structuredClone(prepared.target.metadata.sourceImage.cropCorners);
  const answer=await design(prepared.target,cfg),recovery=answer.report.solver.featureRecovery;
  assert.equal(recovery.seedSmoothingRetry,true);
  assert.ok(recovery.attempts.filter(a=>a.smoothRadius===.3).every(a=>a.solver.termination==='candidate_graph_exhausted'));
  assert.ok(recovery.attempts.some(a=>a.smoothRadius===.5&&a.solver.status==='solved'));
  assert.equal(answer.report.templateChecksPassed,true);assert.equal(answer.report.validation.passed,true);assert.equal(answer.report.manufacturing.status,'pass');
  assert.deepEqual(answer.report.slits,{left:3,right:3});
  const woven=await renderExportedWeave(answer.files['cut_geometry.json'],source.resolution),error=woven.mask.reduce((s,v,i)=>s+Number(v!==mask[i]),0)/mask.length;
  assert.ok(error<.025,`Exported error ${error} must improve on the previous 0.05973125.`);
  assert.deepEqual(source.mask,mask);assert.deepEqual(source.probability,probability);assert.deepEqual(prepared.target.metadata.sourceImage.cropCorners,corners);
});


test('an actual cropped upload recovers its template when one edge hides slit endpoints',async()=>{
  const fixture=JSON.parse(await fs.readFile('scripts/inverse/fixtures/browser-group-tree.json')),n=fixture.resolution,mask=new Uint8Array(n*n);
  for(const [start,length]of fixture.maskRuns)mask.fill(1,start,start+length);
  const cfg={...AUTOMATIC_PRESET,timeLimit:10,trials:0,earlyStop:false},prepared=prepare({type:'mask',mask,resolution:n},cfg),source=prepared.target.sourceImage;
  const before=source.mask.slice(),probability=source.probability.slice();
  const answer=await design(prepared.target,cfg),recovery=answer.report.solver.featureRecovery;
  assert.equal(recovery.borderSeedRetry,true);
  // A repaired rejected integer candidate stops the MILP through its observer;
  // its raw solver status correctly remains "no_validated_solution". The
  // checked repair is another successful use of the same border proposal.
  assert.ok(recovery.attempts.some(a=>a.borderSeed?.initializationOnly&&(a.solver?.status==='solved'||a.continuousRepair?.accepted)));
  assert.deepEqual(answer.report.slits,{left:3,right:3});
  assert.equal(answer.report.templateChecksPassed,true);assert.equal(answer.report.validation.passed,true);assert.equal(answer.report.manufacturing.status,'pass');
  assert.equal(answer.report.imageFidelity.features.missing.length,0);
  const replay=await renderExportedWeave(answer.files['cut_geometry.json'],n),error=replay.mask.reduce((s,v,i)=>s+Number(v!==before[i]),0)/before.length;
  assert.ok(error<.025,`Exported error ${error} must improve on the failed browser input, without recropping.`);
  assert.deepEqual(source.mask,before);assert.deepEqual(source.probability,probability);
});
