/** Isolate count ranking from crop changes and wall-clock search deadlines.
 * Reproduce the saved fixed-round initialization and fine-grid fits exactly,
 * then expose the feature-retention values behind the scheduling decision.
 * This diagnostic does not change candidates, acceptance gates or production.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createCanvas,loadImage} from 'canvas';
import {prepare} from '../../../static/inverse/core/engine.js';
import {settings} from '../../../static/inverse/core/settings.js';
import {imageFeatures,auditImageFeatures} from '../../../static/inverse/core/image-features.js';
import {featureImprovingFinalist} from '../../../static/inverse/core/direct/feature-finalists.js';
import {borderEvidence,countHypotheses,extendInteriorCountHypotheses,initializeCounts,gridFinalists} from '../../../static/inverse/core/direct/counts.js';
import {fitGrid,gridMask} from '../../../static/inverse/core/direct/grid.js';
import {resizeObjective} from '../../../static/inverse/core/direct/image-objective.js';
import {resize} from '../../../static/inverse/core/direct/math.js';
import {loadBoundaryKernel} from '../../../static/inverse/core/direct/native.js';

const args=Object.fromEntries(process.argv.slice(2).map(s=>s.replace(/^--/,'').split('=')));
for(const key of ['compare','id','output','run'])assert.ok(args[key],`Missing --${key}`);
for(const key of Object.keys(args))assert.ok(['compare','id','output','run','reference-method','candidate-method'].includes(key),`Unknown --${key}`);
const hash=b=>createHash('sha256').update(b).digest('hex');
const inputs=[];
for(const [directory,method] of [[args.run,args['reference-method']||'fallback'],[args.compare,args['candidate-method']||'fallback']]){
 const filename=path.join(directory,'report.json'),raw=await fs.readFile(filename),report=JSON.parse(raw);
 assert.equal(report.status,'complete');assert.equal(report.schema,'material-pair-pipeline-1');
 for(const [file,sha] of Object.entries(report.sourceHashes))assert.equal(hash(await fs.readFile(file)),sha,file);
 const row=report.rows.find(r=>r.id===args.id&&r.method===method);assert.ok(row?.report);
 assert.ok(!row.reusedFitFrom,'Use two freshly fitted neural proposals');
 assert.equal(row.observedPixels,row.resolution**2,'This isolation covers fully observed crops');
 const asset=row.assets['mask.png'],file=path.resolve(directory,asset.path);
 assert.ok(file.startsWith(path.resolve(directory)+path.sep));
 const bytes=await fs.readFile(file);assert.equal(hash(bytes),asset.sha256);
 const image=await loadImage(bytes),canvas=createCanvas(image.width,image.height),ctx=canvas.getContext('2d');
 assert.equal(image.width,row.resolution);assert.equal(image.height,row.resolution);ctx.drawImage(image,0,0);
 const pixels=ctx.getImageData(0,0,image.width,image.height).data;
 const mask=Uint8Array.from({length:row.resolution**2},(_,i)=>Number(pixels[4*i]>pixels[4*i+1]+20));
 assert.equal(hash(mask),row.targetMaskSha256);
 const cfg=settings(report.configuration);
 const source=prepare({type:'mask',mask,resolution:row.resolution},{...report.configuration,invert:false,removeSpecks:0,fillHoles:0}).target.sourceImage;
 assert.equal(hash(source.mask),row.targetMaskSha256);assert.ok(!source.weights&&!source.validMask&&!cfg.symmetry);
 if(report.targetMode==='native'){
  if(row.assets['fitting-probability.bin']){
   const asset=row.assets['fitting-probability.bin'],file=path.resolve(directory,asset.path);
   assert.ok(file.startsWith(path.resolve(directory)+path.sep));
   const raw=await fs.readFile(file);assert.equal(hash(raw),asset.sha256);assert.equal(raw.length,mask.length*4);
   source.probability=Float32Array.from({length:mask.length},(_,i)=>raw.readFloatLE(4*i));
   assert.ok(source.probability.every(p=>Number.isFinite(p)&&p>=0&&p<=1));
  }
  const raw=Buffer.alloc(mask.length*4);
  for(let i=0;i<mask.length;i++)raw.writeFloatLE(source.probability[i],4*i);
  assert.equal(hash(raw),row.targetProbabilitySha256,'Replay the actual fitting objective');
 }
 inputs.push({directory,report:{path:filename,sha256:hash(raw),method},row,cfg,source,sourceHashes:report.sourceHashes});
}
assert.equal(inputs[0].row.sourceSha256,inputs[1].row.sourceSha256);
assert.deepEqual(inputs[0].cfg,inputs[1].cfg);assert.deepEqual(inputs[0].sourceHashes,inputs[1].sourceHashes);
const backend=await loadBoundaryKernel(),runs=[];
for(const arm of [0,1,1,0]){
 const {row,source,cfg}=inputs[arm],fullProb=source.probability||Float32Array.from(source.mask),n=Math.min(256,source.resolution);
 const prob=resizeObjective(fullProb,source.resolution,n).probability,evidence=borderEvidence(fullProb,source.resolution);
 const context={fullProb,resolution:source.resolution,prob,n,evidence};
 const options=countHypotheses({...context,cfg}),expanded=extendInteriorCountHypotheses({...context,options},cfg);
 const search=initializeCounts({...context,options:expanded.options}),features=imageFeatures(source,cfg.width);
 const key=r=>(r.counts??r.model.counts)+':'+r.phase;
 for(const seed of search.seeds){
  const expected=row.report.solver.attempts.find(r=>r.stage==='coarse'&&key(r)===key(seed));assert.ok(expected);
  assert.equal(seed.error,expected.error);assert.equal(seed.steps,expected.steps);
 }
 const selected=gridFinalists(search.seeds,evidence);
 const fit=seed=>{
  const next=fitGrid(prob,n,seed.model.counts,seed.phase,{k:seed.model.k,optimizationTarget:resize(fullProb,source.resolution,96),steps:150,initial:seed.model.z});
  assert.equal(next.steps,150);
  const chosen=next.error<seed.error?next:seed;
  const audit=auditImageFeatures(source,gridMask(chosen.model,source.resolution,chosen.phase,chosen.floor),cfg.width,features);
  return{...chosen,fineError:next.error,fineSteps:next.steps,counts:chosen.model.counts,
   complexityScore:chosen.error+.005*chosen.model.counts.reduce((a,b)=>a+b,0),audit};
 };
 const fine=selected.map(seed=>{
  const fitted=fit(seed),expected=row.report.solver.attempts.find(r=>r.stage==='fine'&&key(r)===key(seed));assert.ok(expected);
  assert.equal(fitted.fineSteps,expected.steps);assert.equal(fitted.fineError,expected.error);
  return fitted;
 }).sort((a,b)=>a.complexityScore-b.complexityScore);
 const before=fine.map(r=>({counts:r.counts,phase:r.phase,error:r.error,featuresRetained:r.audit.passed}));
 assert.deepEqual(before,row.report.solver.finalistPreference.before);
 fine.sort((a,b)=>Number(b.audit.passed)-Number(a.audit.passed));
 if(!fine.some(r=>r.audit.passed)){
  const preference=featureImprovingFinalist(source,fine,cfg,features);
  assert.deepEqual(preference.report,row.report.solver.finalistPreference.partialImprovement);
  if(preference.selected){fine.splice(fine.indexOf(preference.selected),1);fine.unshift(preference.selected);}
 }
 assert.deepEqual(fine.map(r=>({counts:r.counts,phase:r.phase,error:r.error,featuresRetained:r.audit.passed})),row.report.solver.finalistPreference.after);
 // Post-hoc diagnostic only: measure seeds shortlisted by the other target
 // with exactly the same fixed work. This does not alter production selection
 // or establish that any resulting free curves would be valid.
 const otherKeys=new Set(inputs[1-arm].row.report.solver.attempts.filter(r=>r.stage==='fine').map(key));
 const omitted=search.seeds.filter(seed=>otherKeys.has(key(seed))&&!selected.includes(seed)).map(fit);
 const describe=r=>({counts:r.counts,phase:r.phase,error:r.error,complexityScore:r.complexityScore,audit:r.audit});
 const result={arm,initializations:search.report,features:features.length,
  coarse:search.seeds.map(r=>({counts:r.model.counts,phase:r.phase,error:r.error})),
  shortlist:selected.map(key),ranked:fine.map(describe),omittedOtherArmFinalists:omitted.map(describe)};
 if(runs.some(r=>r.arm===arm))assert.deepEqual(result,runs.find(r=>r.arm===arm),'ABBA replay must be deterministic');
 runs.push(result);
 console.log(JSON.stringify({arm,first:fine[0].counts,lowestRetention:fine.map(r=>({counts:r.counts,value:Math.min(...r.audit.regions.map(f=>f.retainedFraction))}))}));
}
for(const input of inputs)for(const [file,sha] of Object.entries(input.sourceHashes))assert.equal(hash(await fs.readFile(file)),sha,file);
const result={schema:'crop-count-sensitivity-1',id:args.id,status:'complete',backend,
 implementationSha256:hash(await fs.readFile(new URL(import.meta.url))),inputs:inputs.map(i=>i.report),
 sourceHashes:inputs[0].sourceHashes,maskChanges:inputs[0].source.mask.reduce((s,v,i)=>s+Number(v!==inputs[1].source.mask[i]),0),
 probabilityChanges:inputs[0].source.probability.reduce((s,v,i)=>s+Number(v!==inputs[1].source.probability[i]),0),
 scope:'Development diagnostic on an already inspected case. ABBA order with identical 18-round initialization and 150-step fine fits, without clock deadlines. Every recorded seed error, fine error and finalist preference exactly reproduces the original timed runs. Omitted finalists from the other arm are post-hoc fixed-work probes, not production candidates or validated templates. No full-curve rerun, production change or quality claim.',runs};
await fs.writeFile(args.output,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
