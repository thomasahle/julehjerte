/** Fixed-work screening of one discarded grid on every saved paired target.
 * This is a development diagnostic, not a production selection rule. It must
 * reproduce each historical initialization/fine score before probing anything.
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
 scope:'All saved targets, unchanged crops and masks. Exactly replay 18-round initialization and 150-step fine grids before proposing one extra discarded top-three seed. No clock deadlines, new curves, geometry certificates, training or production changes.',rows:[]};
await fs.writeFile(args.output,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
const key=r=>(r.counts??r.model.counts)+':'+r.phase;
for(const row of run.rows){
 const out={id:row.id,method:row.method,originalStatus:row.status};result.rows.push(out);
 if(!row.report){out.reason='crop-unresolved';continue;}
 assert.equal(row.observedPixels,row.resolution**2,'This probe covers fully observed masks only');
 const asset=row.assets['mask.png'],filename=path.resolve(args.run,asset.path);
 assert.ok(filename.startsWith(path.resolve(args.run)+path.sep));
 const bytes=await fs.readFile(filename);assert.equal(hash(bytes),asset.sha256);
 const image=await loadImage(bytes),canvas=createCanvas(image.width,image.height),ctx=canvas.getContext('2d');
 assert.equal(image.width,row.resolution);assert.equal(image.height,row.resolution);ctx.drawImage(image,0,0);
 const pixels=ctx.getImageData(0,0,image.width,image.height).data;
 const mask=Uint8Array.from({length:row.resolution**2},(_,i)=>Number(pixels[4*i]>pixels[4*i+1]+20));
 assert.equal(hash(mask),row.targetMaskSha256);
 const source=prepare({type:'mask',mask,resolution:row.resolution},{...run.configuration,invert:false,removeSpecks:0,fillHoles:0}).target.sourceImage;
 assert.equal(hash(source.mask),row.targetMaskSha256);assert.ok(!source.weights&&!source.validMask);
 const fullProb=source.probability||Float32Array.from(source.mask),n=Math.min(256,source.resolution);
 const prob=resizeObjective(fullProb,source.resolution,n).probability,evidence=borderEvidence(fullProb,source.resolution);
 const context={fullProb,resolution:source.resolution,prob,n,evidence};
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
 const selected=gridFinalists(search.seeds,evidence),features=imageFeatures(source,cfg.width);
 assert.deepEqual(selected.map(key),expectedFine.map(key));
 const fit=seed=>{
  const next=fitGrid(prob,n,seed.model.counts,seed.phase,{k:seed.model.k,optimizationTarget:resize(fullProb,source.resolution,96),steps:150,initial:seed.model.z});
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
 if(!poor)out.reason='existing-grid-near-enough';
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
