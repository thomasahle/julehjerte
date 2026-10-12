/** Diagnostic only: follow small regions through grid and curve checkpoints.
 * Every variant starts from the same image-derived seed. No fitted curves or
 * published cutting paths enter the experiment; the source mask stays fixed.
 */
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createCanvas,loadImage} from 'canvas';
import {prepare} from '../../static/inverse/core/engine.js';
import {settings} from '../../static/inverse/core/settings.js';
import {AUTOMATIC_PRESET} from '../../static/inverse/core/presets.js';
import {imageFeatures,auditImageFeatures} from '../../static/inverse/core/image-features.js';
import {solutionJSON} from '../../static/inverse/core/graph.js';
import {loadNumericalKernel} from '../../static/inverse/core/numerical-kernel.js';
import {initializeFeatureSeeds,featureRefinementObjective} from '../../static/inverse/core/direct/feature-seeds.js';
import {smallInteriorFeatures} from '../../static/inverse/core/direct/feature-details.js';
import {borderEvidence,initializeCounts,gridCountLimit} from '../../static/inverse/core/direct/counts.js';
import {resizeObjective} from '../../static/inverse/core/direct/image-objective.js';
import {fitGrid,gridMask,gridPaths,gridControls,mismatch} from '../../static/inverse/core/direct/grid.js';
import {CurveGraph} from '../../static/inverse/core/direct/curves.js';
import {refineCurves,fittingMargin} from '../../static/inverse/core/direct/refine.js';
import {renderExportedWeave} from './export-renderer.mjs';
import {featureComponentMetrics} from './feature-component-metrics.mjs';

const args=Object.fromEntries(process.argv.slice(2).map(s=>s.replace(/^--/,'').split('=')));
assert.ok(args.run&&args.output,'Use --run=<saved benchmark> --output=<new directory>');
const report=JSON.parse(await fs.readFile(args.run+'/results.json')),counts=(args.counts||'3,3').split(',').map(Number),steps=Number(args.steps||750);
assert.ok(counts.length===2&&counts.every(v=>Number.isInteger(v)&&v>0));
assert.ok(Number.isInteger(steps)&&steps>0);
await fs.mkdir(args.output,{recursive:true});
const hash=b=>createHash('sha256').update(b).digest('hex'),sourceHashes={},rows=[];
for(const name of await fs.readdir('static/inverse/core',{recursive:true}))if(/\.(js|wasm|c)$/.test(name)){const file='static/inverse/core/'+name;sourceHashes[file]=hash(await fs.readFile(file));}
for(const file of ['scripts/inverse/feature-checkpoint-study.mjs','scripts/inverse/export-renderer.mjs','scripts/inverse/feature-component-metrics.mjs'])sourceHashes[file]=hash(await fs.readFile(file));
const ledger={run:args.run,benchmarkSha256:hash(await fs.readFile(args.run+'/results.json')),counts,steps,sourceHashes,method:'Same classified pixels and fresh feature-weighted starting grid per case. Fixed iterations, no production deadline. All variants use paper resolution 700; the prior production run can use a different margin. Compare original-mask error, feature retention and component overlap at every geometry-valid checkpoint. Diagnostic only.',rows};
await loadNumericalKernel();
const refloor=(seed,floor)=>{
  const {model}=seed,controls=gridControls(model,seed.floor),z=model.z.slice();
  model.counts.forEach((count,f)=>{for(let j=0;j<model.k;j++){
    const gaps=[];let last=0;for(let i=0;i<=count;i++){const next=i===count?1:controls[f].c[j*count+i];gaps.push(Math.max(.0001,next-last-floor));last=next;}
    const sum=gaps.reduce((a,b)=>a+b,0);for(let i=0;i<=count;i++)z[model.offsets[f]+j*(count+1)+i]=Math.log(gaps[i]/sum);
  }});return z;
};
for(const entry of report.results.filter(r=>!args.ids||args.ids.split(',').includes(r.id))){
  const previous=entry.runs?.[0];if(!previous?.maskSha256)continue;
  const im=await loadImage(`${args.run}/${entry.id}/automatic/mask.png`),canvas=createCanvas(im.width,im.height),ctx=canvas.getContext('2d');ctx.drawImage(im,0,0);
  const rgba=ctx.getImageData(0,0,im.width,im.height).data,mask=Uint8Array.from({length:im.width**2},(_,i)=>Number(rgba[4*i]>rgba[4*i+1]+20));
  assert.equal(hash(mask),previous.maskSha256);
  const cfg=settings({...AUTOMATIC_PRESET,...previous.report.settings,materialResolution:700,trials:0,preferMatchingSheets:false}),input=prepare({type:'mask',mask,resolution:im.width},cfg).target,source=input.sourceImage,n=256;
  assert.equal(hash(source.mask),previous.fittingMaskSha256);
  const features=imageFeatures(source),small=smallInteriorFeatures(source,features,cfg),missed=small.map(f=>features.indexOf(f)),evidence=borderEvidence(source.probability,source.resolution),maximumCount=gridCountLimit(evidence);
  if(!small.length){rows.push({id:entry.id,status:'no_small_interior_region'});continue;}
  const search=initializeFeatureSeeds({source,features,missed,counts,cfg,evidence,maximumCount});
  let seed=search.seeds[0],boost=16;
  if(!seed){
    // Isolate stronger initialization separately from later curve objectives.
    // Counts/phase enumeration and unweighted seed limit match the ordinary
    // one-family neighbourhood. This is not a production fallback.
    boost=64;const fullWeights=new Float64Array(mask.length).fill(1/boost),options=[];
    for(const feature of small)for(const pixel of feature.pixels)fullWeights[pixel]=1;
    for(const family of[0,1])for(const extra of[0,1,2])for(const phase of[1,-1]){
      const pair=counts.slice();pair[family]+=extra;
      if(pair.some(c=>c>maximumCount||(c+1)*(cfg.nominalWidth+.35)>=cfg.width))continue;
      if(!options.some(o=>o.phase===phase&&o.counts.every((c,i)=>c===pair[i])))options.push({counts:pair,phase});
    }
    const weighted=resizeObjective(source.probability,source.resolution,n,fullWeights),plain=resizeObjective(source.probability,source.resolution,n);
    const fallback=initializeCounts({options,fullProb:source.probability,resolution:source.resolution,prob:weighted.probability,n,evidence,weights:weighted.weights,fullWeights});
    seed=fallback.seeds.map(s=>({...s,error:mismatch(gridMask(s.model,n,s.phase,s.floor),plain.probability)})).filter(s=>s.error<=.09&&auditImageFeatures(source,gridMask(s.model,source.resolution,s.phase,s.floor),cfg.width,features).passed).sort((a,b)=>a.error-b.error)[0];
  }
  if(!seed){rows.push({id:entry.id,status:'no_feature_seed',boost});continue;}
  const plain=resizeObjective(source.probability,source.resolution,n),weighted=featureRefinementObjective(source,features,n),smallWeighted=featureRefinementObjective(source,small,n),floor=fittingMargin(cfg,cfg.width)/cfg.width;
  const metrics=woven=>({error:mismatch(woven,source.mask),features:auditImageFeatures(source,woven,cfg.width,features),components:featureComponentMetrics(source,woven,cfg.width)});
  for(const variant of ['fine-unweighted','clear-protected','clear-and-refine-protected','small-only-protected']){
    const start=performance.now(),checkpoints=[];let initial=seed;
    if(variant==='fine-unweighted'){
      const next=fitGrid(plain.probability,n,seed.model.counts,seed.phase,{steps:150,initial:seed.model.z});if(next.error<seed.error)initial=next;
    }
    const clearObjective=variant==='fine-unweighted'?plain:variant==='small-only-protected'?smallWeighted:weighted;
    const objective=variant==='clear-and-refine-protected'?weighted:variant==='small-only-protected'?smallWeighted:plain;
    const clear=fitGrid(clearObjective.probability,n,seed.model.counts,seed.phase,{weights:clearObjective.weights,steps:150,initial:refloor(initial,floor),floor,clearance:floor+.0015});
    const graph=new CurveGraph(gridPaths(clear.model,cfg.width,clear.floor),cfg.width);
    const fit=refineCurves(graph,objective.probability,n,clear.phase,cfg,{input,weights:objective.weights,steps,rate:.05,onProgress:(checkpoint,solution)=>{
      if(checkpoint.geometry)checkpoints.push({checkpoint,geometry:solutionJSON(solution)});
    }});
    const retained=solutionJSON(graph.solution(fit.points,fit.phase,input)),rendered=await renderExportedWeave(retained,source.resolution),actual=metrics(rendered.mask);
    const snapshots=[];
    for(const {checkpoint,geometry}of checkpoints){const image=await renderExportedWeave(geometry,source.resolution);snapshots.push({...checkpoint,...metrics(image.mask)});}
    const passed=snapshots.filter(s=>s.paper==='pass'),best=list=>list.toSorted((a,b)=>a.error-b.error)[0]||null;
    const shapePassed=s=>s.features.passed&&s.components.filter(c=>small.some(f=>Math.hypot(...c.centerMm.map((v,i)=>v-f.centerMm[i]))<.001)).every(c=>!c.touchesBorder&&c.componentIoU>=.5);
    const row={id:entry.id,variant,maskSha256:hash(source.mask),boost,counts:seed.model.counts,phase:seed.phase,seconds:(performance.now()-start)/1000,featureAreas:features.map(f=>f.areaMm2),seed:metrics(gridMask(seed.model,source.resolution,seed.phase,seed.floor)),afterFine:metrics(gridMask(initial.model,source.resolution,initial.phase,initial.floor)),afterClearance:metrics(gridMask(clear.model,source.resolution,clear.phase,clear.floor)),returned:{...actual,paper:fit.paper?.status},bestError:best(passed),bestRetainedFeature:best(passed.filter(s=>s.features.passed)),bestClosedFeature:best(passed.filter(shapePassed)),checkpoints:snapshots};rows.push(row);
    const name=entry.id+'-'+variant;await fs.writeFile(args.output+'/'+name+'.png',rendered.png);await fs.writeFile(args.output+'/'+name+'.json',JSON.stringify(retained));
    await fs.writeFile(args.output+'/results.json',JSON.stringify(ledger,null,2));
    console.log(JSON.stringify({id:entry.id,variant,error:actual.error,components:actual.components,closed:row.bestClosedFeature&&{step:row.bestClosedFeature.step,error:row.bestClosedFeature.error},seconds:row.seconds}));
  }
}
await fs.writeFile(args.output+'/results.json',JSON.stringify(ledger,null,2));
