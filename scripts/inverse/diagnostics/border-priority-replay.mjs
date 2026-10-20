/** Separate a crop-margin feature's scheduling effect from clock-dependent
 * search. Counterfactual masks are diagnostics, never replacement targets. */
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {prepare,design} from '../../../static/inverse/core/engine.js';
import {settings} from '../../../static/inverse/core/settings.js';
import {AUTOMATIC_PRESET} from '../../../static/inverse/core/presets.js';
import {imageFeatures,auditImageFeatures} from '../../../static/inverse/core/image-features.js';
import {auditFeatureFidelity} from '../../../static/inverse/core/feature-shapes.js';
import {interiorFeatureIndices} from '../../../static/inverse/core/direct/feature-seeds.js';
import {resize} from '../../../static/inverse/core/direct/math.js';
import {resizeObjective} from '../../../static/inverse/core/direct/image-objective.js';
import {borderEvidence,gridCountLimit,countHypotheses,extendInteriorCountHypotheses,initializeCounts,gridFinalists} from '../../../static/inverse/core/direct/counts.js';
import {fitGrid,gridMask} from '../../../static/inverse/core/direct/grid.js';
import {loadBoundaryKernel} from '../../../static/inverse/core/direct/native.js';
import {renderExportedWeave} from '../export-renderer.mjs';

const args=Object.fromEntries(process.argv.slice(2).map(s=>s.replace(/^--/,'').split('=')));
assert.ok(args.output&&Object.keys(args).every(k=>['output','plan'].includes(k)));
const planFile=args.plan||'docs/inverse/datasets/border-priority-plan.json';
const hash=b=>createHash('sha256').update(b).digest('hex');
const planBytes=await fs.readFile(planFile),plan=JSON.parse(planBytes);
assert.equal(plan.schema,'border-priority-plan-1');
const output=path.resolve(args.output),n=plan.resolution;
const cfg=settings({...AUTOMATIC_PRESET,timeLimit:plan.searchSeconds,trials:0});
const rawCfg={...cfg,invert:false,removeSpecks:0,fillHoles:0};
const read=async ref=>{
  const bytes=await fs.readFile(ref.path);assert.equal(hash(bytes),ref.sha256,ref.path);return bytes;
};
await read(plan.parentStudy);
const parent=Uint8Array.from(await read(plan.inputs.parent)),mixed=Uint8Array.from(await read(plan.inputs['real-mixed']));
assert.equal(parent.length,n*n);assert.equal(mixed.length,n*n);
assert.ok([...parent,...mixed].every(v=>v===0||v===1));
const target=mask=>{
  const result=prepare({type:'mask',mask:mask.slice(),resolution:n},rawCfg).target;
  assert.deepEqual(result.sourceImage.mask,mask);return result;
};
const features=imageFeatures(target(mixed).sourceImage,cfg.width);
const matches=features.filter(f=>f.value===plan.component.value&&f.pixels.length===plan.component.pixels&&
  f.areaMm2===plan.component.areaMm2&&f.centerMm.every((v,j)=>v===plan.component.centerMm[j]));
assert.equal(matches.length,1,'Identify the predeclared feature without selecting on fit results.');
const fragment=matches[0],removed=mixed.slice(),inserted=parent.slice(),neighbours=new Set();
for(const p of fragment.pixels){
  removed[p]=1-fragment.value;
  for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
    const x=p%n+dx,y=Math.floor(p/n)+dy;if(x>=0&&x<n&&y>=0&&y<n)neighbours.add(y*n+x);
  }
}
for(const p of neighbours)inserted[p]=mixed[p];
const masks={parent,mixed,'mixed-minus-fragment':removed,'parent-plus-fragment-neighbourhood':inserted};
assert.deepEqual(Object.keys(masks),plan.variants);
const difference=(a,b)=>a.reduce((sum,v,i)=>sum+Number(v!==b[i]),0);
assert.equal(difference(mixed,removed),fragment.pixels.length);
for(let p=0;p<parent.length;p++)if(!neighbours.has(p))assert.equal(inserted[p],parent[p]);
await fs.mkdir(output);
const sourceHashes={};
for(const file of [new URL(import.meta.url).pathname,'scripts/inverse/export-renderer.mjs',
  ...(await fs.readdir('static/inverse',{recursive:true})).filter(f=>/\.(js|mjs|wasm)$/.test(f)).map(f=>'static/inverse/'+f)])sourceHashes[file]=hash(await fs.readFile(file));
const report={schema:'border-priority-replay-1',status:'running',plan:{path:planFile,sha256:hash(planBytes)},sourceHashes,configuration:rawCfg,
  scope:plan.scope,component:{...plan.component,bbox:[Math.min(...fragment.pixels.map(p=>p%n)),Math.min(...fragment.pixels.map(p=>Math.floor(p/n))),
    Math.max(...fragment.pixels.map(p=>p%n)),Math.max(...fragment.pixels.map(p=>Math.floor(p/n)))],neighbourhoodPixels:neighbours.size},
  variants:{},fixedWork:[],runs:[]};
let written=0;
const write=async(name,data)=>{
  written+=Buffer.byteLength(data);assert.ok(written<=plan.resources.maximumNewArtifactMiB*1024**2,'Artifact budget');
  await fs.writeFile(path.join(output,name),data);
  return{path:name,sha256:hash(data)};
};
const save=()=>fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
const checkSpace=async()=>{
  const stat=await fs.statfs(output);assert.ok(stat.bavail*stat.bsize>=plan.resources.minimumFreeGiB*1024**3,'Free-space floor');
};
await checkSpace();await save();
try{
  await loadBoundaryKernel();
  for(const [name,mask] of Object.entries(masks)){
    report.variants[name]={asset:await write(name+'.mask',mask),differentFromParent:difference(parent,mask),differentFromMixed:difference(mixed,mask)};
    const input=target(mask),source=input.sourceImage,probabilityHash=hash(Buffer.from(source.probability.buffer));
    const all=imageFeatures(source,cfg.width),indices=interiorFeatureIndices(source,all,all.map((_,i)=>i),cfg),interior=indices.map(i=>all[i]);
    const fullProb=source.probability,size=Math.min(256,n),prob=resizeObjective(fullProb,n,size).probability,evidence=borderEvidence(fullProb,n);
    const options=countHypotheses({prob,n:size,cfg,evidence,maximumCount:gridCountLimit(evidence)});
    const context={options,fullProb,resolution:n,prob,n:size,evidence,weights:null,fullWeights:null,guideProb:null};
    const expanded=extendInteriorCountHypotheses(context,cfg),search=initializeCounts({...context,options:expanded.options});
    const optimizationTarget=resize(fullProb,n,96),finalists=gridFinalists(search.seeds,evidence),rows=[];
    for(const seed of finalists){
      const polished=fitGrid(prob,size,seed.model.counts,seed.phase,{k:seed.model.k,optimizationTarget,steps:150,initial:seed.model.z});
      assert.equal(polished.steps,150);
      const chosen=polished.error<seed.error?polished:seed,woven=gridMask(chosen.model,n,chosen.phase,chosen.floor);
      rows.push({counts:chosen.model.counts,phase:chosen.phase,error:chosen.error,steps:polished.steps,
        all:auditImageFeatures(source,woven,cfg.width,all),interior:auditImageFeatures(source,woven,cfg.width,interior),
        mask:await write(name+'-grid-'+rows.length+'.mask',woven)});
    }
    rows.sort((a,b)=>a.error+.005*(a.counts[0]+a.counts[1])-b.error-.005*(b.counts[0]+b.counts[1]));
    const row={variant:name,allFeatures:all.map(({pixels,...f})=>({...f,pixelCount:pixels.length})),interiorIndices:indices,
      countSearch:search.report,interiorProposal:expanded.report,coarseBestError:search.seeds[0].error,
      poorGrid:search.seeds[0].error>2*cfg.maxImageError&&rows.every(r=>r.error>cfg.maxImageError),
      wholeSourceRoutesFeaturesFirst:!rows.some(r=>r.all.passed),interiorRoutesFeaturesFirst:!rows.some(r=>r.interior.passed),finalists:rows};
    report.fixedWork.push(row);
    assert.equal(hash(source.mask),hash(mask));assert.equal(hash(Buffer.from(source.probability.buffer)),probabilityHash);
    await save();console.log(JSON.stringify({fixedWork:name,wholeSource:row.wholeSourceRoutesFeaturesFirst,interior:row.interiorRoutesFeaturesFirst,
      errors:rows.map(r=>r.error)}));
  }
  for(const [index,name] of plan.fitOrder.entries()){
    await checkSpace();
    const mask=masks[name],input=target(mask),probabilityHash=hash(Buffer.from(input.sourceImage.probability.buffer));
    const row={index,variant:name,events:[]};report.runs.push(row);await save();
    const began=performance.now();
    try{
      const answer=await design(input,rawCfg,e=>{if(e.stage!==row.events.at(-1)?.stage)row.events.push({stage:e.stage,seconds:(performance.now()-began)/1000});});
      row.seconds=(performance.now()-began)/1000;
      const prefix=String(index).padStart(2,'0')+'-'+name;
      row.geometry=await write(prefix+'-geometry.json',answer.files['cut_geometry.json']);
      row.report=await write(prefix+'-report.json',JSON.stringify(answer.report,null,2)+'\n');
      const rendered=await renderExportedWeave(answer.files['cut_geometry.json'],n);
      row.woven=await write(prefix+'-woven.png',rendered.png);
      row.mask=await write(prefix+'-woven.mask',rendered.mask);
      row.inputError=difference(rendered.mask,mask)/mask.length;
      row.unchangedMixedError=difference(rendered.mask,mixed)/mixed.length;
      row.features=auditFeatureFidelity(input.sourceImage,rendered.mask,answer.report.settings);
      row.templateChecksPassed=answer.report.templateChecksPassed;
      row.geometryPassed=answer.report.validation.passed;
      row.paperStatus=answer.report.manufacturing.status;
      row.traceUsed=answer.report.solver.traceUsed;
      row.featureRoutingFirst=answer.report.solver.featureRoutingFirst;
      row.selectedInitialization=answer.report.solver.selectedInitialization;
    }catch(error){row.error=error.stack;}
    assert.equal(hash(input.sourceImage.mask),hash(mask));assert.equal(hash(Buffer.from(input.sourceImage.probability.buffer)),probabilityHash);
    await save();console.log(JSON.stringify({...row,features:row.features?.passed,events:undefined}));
  }
  for(const [file,sha] of Object.entries(sourceHashes))assert.equal(hash(await fs.readFile(file)),sha,file);
  for(const ref of Object.values(plan.inputs))await read(ref);
  report.status='complete';report.artifactBytesExcludingReport=written;await save();
}catch(error){report.status='failed';report.error=error.stack;await save();throw error;}
