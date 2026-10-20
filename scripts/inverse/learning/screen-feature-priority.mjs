/** Fixed-work screening of a proposed image-error guard on feature promotion. */
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
assert.deepEqual(Object.keys(args).sort(),['output','plan']);
const hash=b=>createHash('sha256').update(b).digest('hex');
const planBytes=await fs.readFile(args.plan),plan=JSON.parse(planBytes);
assert.equal(plan.schema,'feature-priority-plan-1');
const sources=[];
for(const ref of plan.runs){
 const bytes=await fs.readFile(ref.path);assert.equal(hash(bytes),ref.sha256);
 const run=JSON.parse(bytes);assert.equal(run.status,'complete');
 assert.equal(run.schema,'material-pair-pipeline-1');assert.equal(run.targetMode,'mask');
 for(const [file,sha] of Object.entries(run.sourceHashes))assert.equal(hash(await fs.readFile(file)),sha,file);
 sources.push({ref,run});
}
assert.ok(sources.every(s=>JSON.stringify(s.run.configuration)===JSON.stringify(sources[0].run.configuration)));
const cfg=settings(sources[0].run.configuration);assert.ok(!cfg.symmetry);
const report={schema:'feature-priority-screen-1',status:'running',plan:{path:args.plan,sha256:hash(planBytes)},
 implementationSha256:hash(await fs.readFile(new URL(import.meta.url))),backend:await loadBoundaryKernel(),
 configuration:sources[0].run.configuration,rows:[],references:[],unresolved:[],scope:plan.scope};
await fs.writeFile(args.output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
const seen=new Map(),started=performance.now();
const save=async()=>{
 const disk=await fs.statfs('.');assert.ok(disk.bavail*disk.bsize>plan.resources.minimumFreeGiB*1024**3);
 const bytes=JSON.stringify(report,null,2)+'\n';
 assert.ok(Buffer.byteLength(bytes)<plan.resources.maximumArtifactMiB*1024**2);
 await fs.writeFile(args.output,bytes);
};
try{
 for(const {ref,run} of sources)for(const original of run.rows){
  const reference={run:ref,id:original.id,method:original.method};
  if(!original.selectedCrop){assert.equal(original.status,'crop-unresolved');report.unresolved.push(reference);continue;}
  const identity=JSON.stringify([original.sourceSha256,original.selectedCrop,original.targetMaskSha256,
   original.resolution,original.assets['observed.bin']?.sha256??null]);
  if(seen.has(identity)){report.references.push({...reference,duplicateOf:seen.get(identity)});continue;}
  const index=report.rows.length;seen.set(identity,index);
  const row={index,reference,maskSha256:original.targetMaskSha256,originalStatus:original.status};report.rows.push(row);
  if(original.observedPixels!==original.resolution**2){row.reason='observation-weighted-policy-unchanged';continue;}
  const asset=original.assets['mask.png'],file=path.resolve(path.dirname(ref.path),asset.path);
  assert.ok(file.startsWith(path.resolve(path.dirname(ref.path))+path.sep));
  const bytes=await fs.readFile(file);assert.equal(hash(bytes),asset.sha256);
  const image=await loadImage(bytes),canvas=createCanvas(image.width,image.height),ctx=canvas.getContext('2d');
  assert.equal(image.width,original.resolution);assert.equal(image.height,original.resolution);ctx.drawImage(image,0,0);
  const pixels=ctx.getImageData(0,0,image.width,image.height).data;
  const mask=Uint8Array.from({length:original.resolution**2},(_,i)=>Number(pixels[4*i]>pixels[4*i+1]+20));
  assert.equal(hash(mask),original.targetMaskSha256);
  const source=prepare({type:'mask',mask,resolution:original.resolution},
   {...run.configuration,invert:false,removeSpecks:0,fillHoles:0}).target.sourceImage;
  assert.equal(hash(source.mask),original.targetMaskSha256);
  const fullProb=source.probability||Float32Array.from(source.mask),n=Math.min(256,source.resolution);
  const prob=resizeObjective(fullProb,source.resolution,n).probability,evidence=borderEvidence(fullProb,source.resolution);
  const context={fullProb,resolution:source.resolution,prob,n,evidence};
  const options=countHypotheses({...context,cfg}),expanded=extendInteriorCountHypotheses({...context,options},cfg);
  const search=initializeCounts({...context,options:expanded.options}),key=r=>(r.counts??r.model.counts)+':'+r.phase;
  const expected=original.report.solver.attempts.filter(r=>r.stage==='coarse');
  assert.equal(search.seeds.length,expected.length);
  for(const seed of search.seeds){
   const old=expected.find(r=>key(r)===key(seed));assert.ok(old);
   assert.equal(seed.error,old.error);assert.equal(seed.steps,old.steps);
  }
  row.coarseScoresReplayed=search.seeds.length;
  row.coarse=search.seeds.map(r=>({key:key(r),error:r.error,steps:r.steps}));
  const features=imageFeatures(source,cfg.width),selected=gridFinalists(search.seeds,evidence);
  row.fineReplays=[];row.deadlineLimitedOriginalFits=[];row.fixedFine=[];
  const fine=selected.map(seed=>{
   const next=fitGrid(prob,n,seed.model.counts,seed.phase,{k:seed.model.k,
    optimizationTarget:resize(fullProb,source.resolution,96),steps:150,initial:seed.model.z});
   assert.equal(next.steps,150);
   row.fixedFine.push({key:key(seed),error:next.error,steps:next.steps});
   const old=original.report.solver.attempts.find(r=>r.stage==='fine'&&key(r)===key(seed));assert.ok(old);
   if(old.steps===150){assert.equal(next.error,old.error);row.fineReplays.push(key(seed));}
   else row.deadlineLimitedOriginalFits.push({key:key(seed),originalSteps:old.steps,originalError:old.error,fixedWorkError:next.error});
   const best=next.error<seed.error?next:seed;
   return{...best,audit:auditImageFeatures(source,gridMask(best.model,source.resolution,best.phase,best.floor),cfg.width,features)};
  }).sort((a,b)=>a.error+.005*a.model.counts.reduce((s,v)=>s+v,0)-b.error-.005*b.model.counts.reduce((s,v)=>s+v,0));
  const describe=r=>({counts:r.model.counts,phase:r.phase,error:r.error,featuresRetained:r.audit.passed});
  row.before=fine.map(describe);
  const poor=search.seeds[0].error>2*cfg.maxImageError&&fine.every(r=>r.error>cfg.maxImageError);
  const originalFirst=fine[0];
  if(poor&&features.length){
   fine.sort((a,b)=>Number(b.audit.passed)-Number(a.audit.passed));
   if(!fine.some(r=>r.audit.passed)){
    const preference=featureImprovingFinalist(source,fine,cfg,features);
    if(preference.selected){fine.splice(fine.indexOf(preference.selected),1);fine.unshift(preference.selected);}
   }
  }
  row.after=fine.map(describe);
  row.guardTriggered=poor&&features.length>0&&!originalFirst.audit.passed&&fine[0].audit.passed&&fine[0].error>originalFirst.error;
  row.reason=row.guardTriggered?'higher-error-feature-promotion':'policy-unchanged';
  if(!row.deadlineLimitedOriginalFits.length&&original.report.solver.finalistPreference){
   assert.deepEqual(row.before,original.report.solver.finalistPreference.before);
   assert.deepEqual(row.after,original.report.solver.finalistPreference.after);
   row.preferenceReplayed=true;
  }
  await save();
  console.log(JSON.stringify({index,id:original.id,method:original.method,reason:row.reason}));
  assert.ok(performance.now()-started<plan.resources.maximumWallSeconds*1000);
 }
 assert.equal(report.rows.length,plan.expectedUniqueTargets);
 // A duplicate target can have a different timed fit. Verify every saved
 // complete fixed-work score, while explicitly retaining interrupted fits.
 for(const reference of report.references){
  const row=report.rows[reference.duplicateOf];if(!row.before)continue;
  const original=sources.find(s=>s.ref.path===reference.run.path).run.rows.find(
   r=>r.id===reference.id&&r.method===reference.method);assert.ok(original);
  const key=r=>r.counts+':'+r.phase;
  const coarse=original.report.solver.attempts.filter(r=>r.stage==='coarse');
  assert.equal(coarse.length,row.coarse.length);
  for(const old of coarse){
   const current=row.coarse.find(r=>r.key===key(old));assert.ok(current);
   assert.equal(current.error,old.error);assert.equal(current.steps,old.steps);
  }
  reference.coarseScoresReplayed=coarse.length;
  reference.fineScoresReplayed=0;reference.deadlineLimitedOriginalFits=[];
  for(const current of row.fixedFine){
   const old=original.report.solver.attempts.find(r=>r.stage==='fine'&&key(r)===current.key);assert.ok(old);
   if(old.steps===150){assert.equal(current.error,old.error);reference.fineScoresReplayed++;}
   else reference.deadlineLimitedOriginalFits.push({key:current.key,originalSteps:old.steps,
    originalError:old.error,fixedWorkError:current.error});
  }
 }
 for(const {run} of sources)for(const [file,sha] of Object.entries(run.sourceHashes))
  assert.equal(hash(await fs.readFile(file)),sha,file);
 report.status='complete';report.seconds=(performance.now()-started)/1000;
 report.summary={uniqueTargets:report.rows.length,duplicateReferences:report.references.length,
  unresolvedReferences:report.unresolved.length,screened:report.rows.filter(r=>r.before).length,
  changed:report.rows.filter(r=>r.guardTriggered).map(r=>r.index),
  coarseScoresReplayed:report.rows.reduce((s,r)=>s+(r.coarseScoresReplayed||0),0),
  fineScoresReplayed:report.rows.reduce((s,r)=>s+(r.fineReplays?.length||0),0),
  deadlineLimitedOriginalFits:report.rows.reduce((s,r)=>s+(r.deadlineLimitedOriginalFits?.length||0),0),
  duplicateCoarseScoresReplayed:report.references.reduce((s,r)=>s+(r.coarseScoresReplayed||0),0),
  duplicateFineScoresReplayed:report.references.reduce((s,r)=>s+(r.fineScoresReplayed||0),0),
  duplicateDeadlineLimitedOriginalFits:report.references.reduce((s,r)=>s+(r.deadlineLimitedOriginalFits?.length||0),0)};
 await save();console.log(JSON.stringify(report.summary));
}catch(error){report.status='failed';report.error=String(error.stack||error);await save();throw error;}
