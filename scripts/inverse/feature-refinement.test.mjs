import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createCanvas,loadImage} from 'canvas';
import {prepare,design} from '../../static/inverse/core/engine.js';
import {AUTOMATIC_PRESET} from '../../static/inverse/core/presets.js';
import {renderExportedWeave} from './export-renderer.mjs';
import {catalogue,readPhoto} from './web-photo-data.mjs';
import {detectHeartCrops} from '../../static/inverse/core/crop.js';
import {recoverImageFeatures} from '../../static/inverse/core/feature-recovery.js';
import {finish} from '../../static/inverse/core/engine.js';
import {settings} from '../../static/inverse/core/settings.js';

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
  assert.equal(recovery.accepted,false);
  assert.equal(recovery.refinementSeedAvailable,true);
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

test('a recovered photo routing improves the actual exported mask before returning',async()=>{
  const catalog=JSON.parse(await fs.readFile('scripts/inverse/fixtures/hunodan/speed-crops.json'));
  const entry=catalog.cases.find(r=>r.id==='hjfig-05'),im=await loadImage(entry.source),[x,y,x1,y1]=entry.photoROI;
  const canvas=createCanvas(x1-x,y1-y),context=canvas.getContext('2d');context.drawImage(im,-x,-y);
  const cfg={...AUTOMATIC_PRESET,timeLimit:10,trials:0,earlyStop:false,progressGeometry:true};
  const prepared=prepare({type:'pixels',imageWidth:canvas.width,imageHeight:canvas.height,rgba:context.getImageData(0,0,canvas.width,canvas.height).data,quad:entry.quad},cfg);
  const answer=await design(prepared.target,cfg),replay=await renderExportedWeave(answer.files['cut_geometry.json'],prepared.preview.resolution);
  const error=replay.mask.reduce((sum,v,i)=>sum+Number(v!==prepared.preview.mask[i]),0)/replay.mask.length;
  assert.ok(['javascript','wasm'].includes(answer.report.solver.numericalBackend?.backend),'Recovered routes retain the backend diagnostic.');
  assert.ok(answer.report.solver.featureRecovery?.trigger,'The fixture must exercise recovery from a missing image feature.');
  assert.ok(answer.report.templateChecksPassed&&answer.report.validation.passed);assert.equal(answer.report.manufacturing.status,'pass');
  assert.deepEqual(answer.report.slits,{left:4,right:4});
  // The early 80-step result scored better internally but regressed to 1.0355%
  // in the independent renderer. Compare the real exported geometry here.
  assert.ok(error<.0095,`Exported disagreement ${100*error}%`);
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
  assert.ok(recovery.attempts.some(a=>a.borderSeed?.initializationOnly&&a.solver?.status==='solved'));
  assert.deepEqual(answer.report.slits,{left:3,right:3});
  assert.equal(answer.report.templateChecksPassed,true);assert.equal(answer.report.validation.passed,true);assert.equal(answer.report.manufacturing.status,'pass');
  assert.equal(answer.report.imageFidelity.features.missing.length,0);
  const replay=await renderExportedWeave(answer.files['cut_geometry.json'],n),error=replay.mask.reduce((s,v,i)=>s+Number(v!==before[i]),0)/before.length;
  assert.ok(error<.025,`Exported error ${error} must improve on the failed browser input, without recropping.`);
  assert.deepEqual(source.mask,before);assert.deepEqual(source.probability,probability);
});
