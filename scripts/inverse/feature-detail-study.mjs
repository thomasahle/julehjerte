import { benchmarkArtifactEntries } from './benchmark-artifacts.mjs';
/** Fixed-crop diagnostic: does local curve subdivision recover small details?
 * Exact de Casteljau subdivision changes parameters, never the input image.
 * This script is not used by the production fitter.
 */
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {prepare,finish} from '../../static/inverse/core/engine.js';
import {finalizeFittedSolution} from '../../static/inverse/core/direct/finalize.js';
import {resizeObjective} from '../../static/inverse/core/direct/image-objective.js';
import {settings} from '../../static/inverse/core/settings.js';
import {AUTOMATIC_PRESET} from '../../static/inverse/core/presets.js';
import {Cubic} from '../../static/inverse/core/bezier.js';
import {featureComponentMetrics} from './feature-component-metrics.mjs';
import {imageFeatures,auditImageFeatures} from '../../static/inverse/core/image-features.js';
import {materialAudit} from '../../static/inverse/core/material.js';
import {validate} from '../../static/inverse/core/validate.js';
import {solutionJSON} from '../../static/inverse/core/graph.js';
import {loadNumericalKernel} from '../../static/inverse/core/numerical-kernel.js';
import {initializeFeatureSeeds,featureRefinementObjective} from '../../static/inverse/core/direct/feature-seeds.js';
import {borderEvidence} from '../../static/inverse/core/direct/counts.js';
import {fitGrid,gridPaths,gridControls,mismatch} from '../../static/inverse/core/direct/grid.js';
import {CurveGraph} from '../../static/inverse/core/direct/curves.js';
import {refineCurves,fittingMargin,curvePenalty} from '../../static/inverse/core/direct/refine.js';
import {readHardPhoto} from './hard-photo-data.mjs';
import {renderExportedWeave} from './export-renderer.mjs';

const args=Object.fromEntries(process.argv.slice(2).map(s=>s.replace(/^--/,'').split('='))),output=args.output||'tmp/feature-detail-study';
await fs.mkdir(output,{recursive:true});
const hash=b=>createHash('sha256').update(b).digest('hex');
const fixture=JSON.parse(await fs.readFile('scripts/inverse/fixtures/photographic-bird-fit.json'));
const catalogue=JSON.parse(await fs.readFile(fixture.sourceCatalogue)),photo=await readHardPhoto(catalogue.source);
const cfg=settings({...AUTOMATIC_PRESET,timeLimit:25,trials:0,preferMatchingSheets:false}),crop=prepare({...photo,quad:fixture.quad},cfg);
const input=prepare({type:'mask',mask:crop.preview.mask,resolution:400},cfg).target,source=input.sourceImage,features=imageFeatures(source,cfg.width);
assert.equal(hash(source.mask),fixture.maskSha256);assert.equal(hash(new Uint8Array(source.probability.buffer)),fixture.fittingProbabilitySha256);
const search=initializeFeatureSeeds({source,features,missed:[1,2],counts:[4,4],cfg,evidence:borderEvidence(source.probability,400),maximumCount:8}),seed=search.seeds[0];
assert.equal(seed.seed,'feature-preserving-grid');
const objective=featureRefinementObjective(source,features,256),floor=fittingMargin(cfg,100)/100,controls=gridControls(seed.model,seed.floor),z=seed.model.z.slice();
// Same initialization transform as the production fitter; no target contours.
seed.model.counts.forEach((count,f)=>{for(let j=0;j<seed.model.k;j++){
  const gaps=[];let previous=0;for(let i=0;i<=count;i++){const next=i===count?1:controls[f].c[j*count+i];gaps.push(Math.max(.0001,next-previous-floor));previous=next;}
  const sum=gaps.reduce((a,b)=>a+b,0);for(let i=0;i<=count;i++)z[seed.model.offsets[f]+j*(count+1)+i]=Math.log(gaps[i]/sum);
}});
const clear=fitGrid(objective.probability,256,seed.model.counts,seed.phase,{weights:objective.weights,steps:150,initial:z,floor,clearance:floor+.0015});
const initial=new CurveGraph(gridPaths(clear.model,100,clear.floor),100),refinementCfg={...cfg,materialResolution:700};
await loadNumericalKernel();
const selectedFeatures=features.filter(f=>f.areaMm2<25&&f.pixels.every(pixel=>{
  const x=pixel%400+.5,y=Math.floor(pixel/400)+.5;return Math.min(x,y,400-x,400-y)/4>cfg.nominalWidth;
}));
const regions=selectedFeatures.map(f=>({center:f.centerMm,radius:Math.sqrt(f.areaMm2/Math.PI)+cfg.nominalWidth}));

function subdivide(graph,points,maximumLength){
  const rec=c=>{
    // A control box outside every selected region cannot intersect it.
    const near=regions.some(({center:[x,y],radius:r})=>Math.min(...c.p.map(p=>p[0]))<=x+r&&Math.max(...c.p.map(p=>p[0]))>=x-r&&Math.min(...c.p.map(p=>p[1]))<=y+r&&Math.max(...c.p.map(p=>p[1]))>=y-r);
    return near&&c.length()>maximumLength?c.split().flatMap(rec):[c.p];
  };
  // Subdivide unique curves once; reversed/shared occurrences reuse the result.
  const pieces=graph.controls(points).map(p=>rec(new Cubic(p)));
  return new CurveGraph(graph.families.map(f=>f.map(pi=>graph.paths[pi].flatMap(([e,d])=>d===1?pieces[e]:pieces[e].toReversed().map(p=>p.toReversed())))),graph.width);
}

const componentMetrics=mask=>featureComponentMetrics(source,mask,cfg.width);
const sourceHashes={};for(const name of await fs.readdir('static/inverse/core',{recursive:true}))if(/\.(js|wasm|c)$/.test(name)){const file='static/inverse/core/'+name;sourceHashes[file]=hash(await fs.readFile(file));}
for(const file of ['scripts/inverse/feature-detail-study.mjs','scripts/inverse/feature-component-metrics.mjs'])sourceHashes[file]=hash(await fs.readFile(file));
const rows=[],report={fixture,cfg,refinementCfg,sourceHashes,regions,search:search.report,sourceComponents:componentMetrics(source.mask),method:'Fresh image-derived grid; fixed iterations without production deadlines. Report original mask error and matched four-connected component overlap independently. Subdivision also changes regularizer sampling/normalization; its before/after costs are recorded.',rows};
const fit=(graph,steps)=>refineCurves(graph,objective.probability,256,seed.phase,refinementCfg,{input,weights:objective.weights,steps,rate:.05});
async function record(id,graph,points,extra={}){
  const solution=graph.solution(points,seed.phase,input),rendered=await renderExportedWeave(solutionJSON(solution),400),check=validate(solution,cfg);
  const row={id,edges:graph.edges.length,coordinates:points.length,error:mismatch(rendered.mask,source.mask),features:auditImageFeatures(source,rendered.mask),components:componentMetrics(rendered.mask),geometry:check,paper:check.passed?materialAudit(solution,refinementCfg).summary:null,...extra};
  rows.push(row);await fs.writeFile(output+'/'+id+'.json',JSON.stringify(solutionJSON(solution)));await fs.writeFile(output+'/'+id+'.png',rendered.png);
  await fs.writeFile(output+'/results.json',JSON.stringify(report,null,2));
  console.log(JSON.stringify({id,edges:row.edges,error:row.error,components:row.components,geometry:check.passed,paper:row.paper?.status,seconds:row.seconds}));return rendered;
}
const baseStart=performance.now(),base=fit(initial,750);
await record('base-750',initial,base.points,{seconds:(performance.now()-baseStart)/1000,history:base.history});
for(const length of args['halos-only']?[]:[0,2,1]){
  const start=performance.now(),graph=length?subdivide(initial,initial.points,length):initial,split=length?subdivide(initial,base.points,length):new CurveGraph(initial.nested(base.points),100);
  if(length){
    const before=await renderExportedWeave(solutionJSON(initial.solution(initial.points,seed.phase,input)),400),after=await renderExportedWeave(solutionJSON(graph.solution(graph.points,seed.phase,input)),400);
    assert.ok(mismatch(before.mask,after.mask)<=.0001,'Exact subdivision must retain the initial image');
    const fitted=fit(graph,750);await record('before-'+length+'mm',graph,fitted.points,{seconds:(performance.now()-start)/1000,history:fitted.history,penaltyBefore:curvePenalty(initial,initial.points,refinementCfg).loss,penaltyAfter:curvePenalty(graph,graph.points,refinementCfg).loss});
  }
  const continuation=performance.now(),fitted=fit(split,400);
  await record('after-'+length+'mm',split,fitted.points,{seconds:(performance.now()-continuation)/1000,history:fitted.history,penaltyBefore:curvePenalty(initial,base.points,refinementCfg).loss,penaltyAfter:curvePenalty(split,split.points,refinementCfg).loss});
}

// A matched continuation distinguishes added degrees of freedom from another
// optimizer restart. Only small interior features receive the surrounding
// colour weights; padding the whole motif changes a different objective.
for(const halo of (args.halos||'').split(',').filter(Boolean).map(Number)){
  assert.ok(Number.isInteger(halo)&&halo>0&&halo<=20);
  const weights=new Float64Array(source.mask.length).fill(1/16);
  for(const feature of features)for(const p of feature.pixels)weights[p]=1;
  for(const feature of selectedFeatures)for(const p of feature.pixels){
    const x=p%400,y=Math.floor(p/400);
    for(let dy=-halo;dy<=halo;dy++)for(let dx=-halo;dx<=halo;dx++)if(dx*dx+dy*dy<=halo*halo&&x+dx>=0&&x+dx<400&&y+dy>=0&&y+dy<400)weights[(y+dy)*400+x+dx]=1;
  }
  const target=resizeObjective(source.probability,400,256,weights);
  for(const length of [0,2]){
    const start=performance.now(),graph=length?subdivide(initial,base.points,length):new CurveGraph(initial.nested(base.points),100);
    const fitted=refineCurves(graph,target.probability,256,seed.phase,refinementCfg,{input,weights:target.weights,steps:Number(args.steps||400),rate:.035});
    const id='after-'+length+'mm-halo-'+halo;
    await record(id,graph,fitted.points,{seconds:(performance.now()-start)/1000,history:fitted.history});
    if(args.finalize){
      const solution=graph.solution(fitted.points,seed.phase,input);
      solution.report.paperVerification={resolution:700,status:'pass'};
      const final=finalizeFittedSolution(solution,refinementCfg,{timeLimit:10,searchMatching:false});
      const result=finish(final,refinementCfg),folder=output+'/'+id+'-export';await fs.mkdir(folder,{recursive:true});
      for(const [name,contents] of benchmarkArtifactEntries(result.files))await fs.writeFile(folder+'/'+name,contents);
      const rendered=await renderExportedWeave(result.files['cut_geometry.json'],400);
      rows.at(-1).final={report:result.report,error:mismatch(rendered.mask,source.mask),components:componentMetrics(rendered.mask)};
      await fs.writeFile(folder+'/independent.png',rendered.png);
      await fs.writeFile(output+'/results.json',JSON.stringify(report,null,2));
      console.log(JSON.stringify({id:id+'-export',error:rows.at(-1).final.error,eye:rows.at(-1).final.components[1],passed:result.report.templateChecksPassed}));
    }
  }
}
