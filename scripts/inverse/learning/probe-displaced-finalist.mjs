/** Fixed-work screening of one discarded grid on every saved paired target.
 * This is a development diagnostic, not a production selection rule. It must
 * reproduce the initial coarse/shortlist scores before probing anything.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createCanvas,loadImage} from 'canvas';
import {prepare} from '../../../static/inverse/core/engine.js';
import {settings} from '../../../static/inverse/core/settings.js';
import {imageFeatures,auditImageFeatures} from '../../../static/inverse/core/image-features.js';
import {auditFeatureFidelity} from '../../../static/inverse/core/feature-shapes.js';
import {sourceWeights,initializationMask} from '../../../static/inverse/core/image-reference.js';
import {borderEvidence,countHypotheses,extendInteriorCountHypotheses,initializeCounts,gridFinalists} from '../../../static/inverse/core/direct/counts.js';
import {fitGrid,gridMask} from '../../../static/inverse/core/direct/grid.js';
import {resizeObjective} from '../../../static/inverse/core/direct/image-objective.js';
import {resize} from '../../../static/inverse/core/direct/math.js';
import {loadBoundaryKernel} from '../../../static/inverse/core/direct/native.js';

const args=Object.fromEntries(process.argv.slice(2).map(s=>s.replace(/^--/,'').split('=')));
assert.deepEqual(Object.keys(args).sort(),['output','run']);
const hash=b=>createHash('sha256').update(b).digest('hex');
const reportFile=path.join(args.run,'report.json'),raw=await fs.readFile(reportFile),run=JSON.parse(raw);
assert.equal(run.status,'complete');assert.equal(run.schema,'material-pair-pipeline-1');
const verifySources=async()=>{for(const [file,sha] of Object.entries(run.sourceHashes))assert.equal(hash(await fs.readFile(file)),sha,file);};
await verifySources();
assert.ok((await fs.statfs('.')).bavail*(await fs.statfs('.')).bsize>10*1024**3,'Keep ten GiB free');
const cfg=settings(run.configuration);assert.ok(!cfg.symmetry);
const backend=await loadBoundaryKernel();
const result={schema:'displaced-finalist-probe-1',status:'running',input:{path:reportFile,sha256:hash(raw)},
 implementationSha256:hash(await fs.readFile(new URL(import.meta.url))),sourceHashes:run.sourceHashes,backend,
 scope:'All saved targets, unchanged crops and masks. Exactly replay 18-round initialization and the initial 150-step shortlist fits before proposing one extra discarded top-three seed. Later adaptive feature-weighted fits are recorded separately, not replayed. No clock deadlines, new curves, geometry certificates, training or production changes.',rows:[]};
await fs.writeFile(args.output,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
const key=r=>(r.counts??r.model.counts)+':'+r.phase;
try{
for(const row of run.rows){
 const out={id:row.id,method:row.method,originalStatus:row.status};result.rows.push(out);
 if(!row.report){out.reason='crop-unresolved';continue;}
 const asset=row.assets['mask.png'],filename=path.resolve(args.run,asset.path);
 assert.ok(filename.startsWith(path.resolve(args.run)+path.sep));
 const bytes=await fs.readFile(filename);assert.equal(hash(bytes),asset.sha256);
 const image=await loadImage(bytes),canvas=createCanvas(image.width,image.height),ctx=canvas.getContext('2d');
 assert.equal(image.width,row.resolution);assert.equal(image.height,row.resolution);ctx.drawImage(image,0,0);
 const pixels=ctx.getImageData(0,0,image.width,image.height).data;
 const mask=Uint8Array.from({length:row.resolution**2},(_,i)=>Number(pixels[4*i]>pixels[4*i+1]+20));
 assert.equal(hash(mask),row.targetMaskSha256);
 let validMask;
 if(row.assets['observed.bin']){
  const a=row.assets['observed.bin'],f=path.resolve(args.run,a.path);assert.ok(f.startsWith(path.resolve(args.run)+path.sep));
  const bytes=await fs.readFile(f);assert.equal(hash(bytes),a.sha256);validMask=Uint8Array.from(bytes);
  assert.equal(validMask.length,mask.length);assert.ok(validMask.every(v=>v===0||v===1));
 }
 assert.equal(validMask?validMask.reduce((s,v)=>s+v,0):mask.length,row.observedPixels);
 const source=prepare({type:'mask',mask,resolution:row.resolution,validMask},{...run.configuration,invert:false,removeSpecks:0,fillHoles:0}).target.sourceImage;
 assert.equal(hash(source.mask),row.targetMaskSha256);
 const fullProb=source.probability||Float32Array.from(source.mask),n=Math.min(256,source.resolution),fullWeights=sourceWeights(source);
 const resized=resizeObjective(fullProb,source.resolution,n,fullWeights),prob=resized.probability,weights=resized.weights;
 const guideProb=fullWeights&&Float64Array.from(initializationMask(source)),evidence=borderEvidence(guideProb||fullProb,source.resolution);
 const context={fullProb,resolution:source.resolution,prob,n,evidence,weights,fullWeights,guideProb};
 const options=countHypotheses({...context,cfg}),expanded=extendInteriorCountHypotheses({...context,options},cfg);
 const search=initializeCounts({...context,options:expanded.options});
 const expectedCoarse=row.report.solver.attempts.filter(r=>r.stage==='coarse');
 assert.deepEqual(search.seeds.map(key),expectedCoarse.map(key));
 for(const [i,seed] of search.seeds.entries()){
  assert.equal(seed.error,expectedCoarse[i].error);assert.equal(seed.steps,expectedCoarse[i].steps);
 }
 out.coarseScoresExactlyReproduced=search.seeds.length;
 const expectedFine=row.report.solver.attempts.filter(r=>r.stage==='fine');
 if(!expectedFine.length){out.reason='original-returned-before-fine-stage';continue;}
 const selected=gridFinalists(search.seeds,fullWeights?[]:evidence),features=imageFeatures(source,cfg.width);
 assert.deepEqual(selected.map(key),expectedFine.slice(0,selected.length).map(key));
 out.laterAdaptiveFineFitsNotReplayed=expectedFine.slice(selected.length).map(r=>({counts:r.counts,phase:r.phase,error:r.error,steps:r.steps}));
 const fit=seed=>{
  const next=fitGrid(prob,n,seed.model.counts,seed.phase,{k:seed.model.k,
   optimizationTarget:fullWeights?null:resize(fullProb,source.resolution,96),
   optimizationObjective:fullWeights?resizeObjective(fullProb,source.resolution,96,fullWeights):null,
   weights,steps:150,initial:seed.model.z});
  assert.equal(next.steps,150);
  const best=next.error<seed.error?next:seed,woven=gridMask(best.model,source.resolution,best.phase,best.floor);
  const colours=auditImageFeatures(source,woven,cfg.width,features),shapes=auditFeatureFidelity(source,woven,cfg,features);
  return{counts:best.model.counts,phase:best.phase,error:best.error,fineError:next.error,
   colourRetentionPassed:colours.passed,minimumRegionRetention:features.length?Math.min(...colours.regions.map(r=>r.retainedFraction)):null,
   shapeRetentionPassed:shapes.passed,missingShapes:shapes.missing.length};
 };
 const fine=selected.map((seed,i)=>{
  const fitted=fit(seed);assert.equal(fitted.fineError,expectedFine[i].error);assert.equal(expectedFine[i].steps,150);return fitted;
 });
 out.fineScoresExactlyReproduced=fine.length;out.fine=fine;
 const poor=search.seeds[0].error>2*cfg.maxImageError&&fine.every(r=>r.error>cfg.maxImageError);
 const excluded=search.seeds.slice(0,3).find(seed=>!selected.includes(seed));
 if(fullWeights)out.reason='observation-weighted-path-unchanged';
 else if(!poor)out.reason='existing-grid-near-enough';
 else if(!features.length)out.reason='no-source-features';
 else if(fine.some(r=>r.colourRetentionPassed))out.reason='existing-finalist-retains-colours';
 else if(!excluded)out.reason='no-discarded-top-three-seed';
 else{
  const start=performance.now();out.extra=fit(excluded);out.extraSeconds=(performance.now()-start)/1000;
  out.reason=out.extra.colourRetentionPassed?'recovered-colour-retention':'extra-grid-still-loses-colours';
 }
 console.log(JSON.stringify({id:row.id,method:row.method,reason:out.reason,extra:out.extra?.counts}));
 await fs.writeFile(args.output,JSON.stringify(result,null,2)+'\n');
}
await verifySources();
}catch(error){
 result.status='failed';result.error=String(error.stack||error);
 await fs.writeFile(args.output,JSON.stringify(result,null,2)+'\n');throw error;
}
result.status='complete';result.summary={};
for(const method of run.methods){
 const rows=result.rows.filter(r=>r.method===method),extras=rows.filter(r=>r.extra);
 result.summary[method]={inputs:rows.length,coarseReplayed:rows.filter(r=>r.coarseScoresExactlyReproduced).length,
  fineReplayed:rows.filter(r=>r.fineScoresExactlyReproduced).length,extraFits:extras.length,
  colourRetentionRecovered:extras.filter(r=>r.extra.colourRetentionPassed).map(r=>r.id),
  shapeRetentionRecovered:extras.filter(r=>r.extra.shapeRetentionPassed).map(r=>r.id),
  extraFitSeconds:extras.reduce((s,r)=>s+r.extraSeconds,0)};
}
await fs.writeFile(args.output,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result.summary));
