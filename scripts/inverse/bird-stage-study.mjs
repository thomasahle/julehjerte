/** Isolate loss of small regions between initialization, clearance and curves.
 * Uses freshly image-derived seeds from bird-initialization-study.mjs. This
 * diagnostic has fixed iteration counts and no production deadline. The
 * refloor helper is a copy of the fitter's private initialization transform.
 */
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import{prepare}from'../../static/inverse/core/engine.js';
import{settings}from'../../static/inverse/core/settings.js';
import{AUTOMATIC_PRESET}from'../../static/inverse/core/presets.js';
import{readHardPhoto}from'./hard-photo-data.mjs';
import{gridControls,gridPaths,fitGrid}from'../../static/inverse/core/direct/grid.js';
import{CurveGraph}from'../../static/inverse/core/direct/curves.js';
import{fittingMargin,refineCurves}from'../../static/inverse/core/direct/refine.js';
import{sampleWeave,validate}from'../../static/inverse/core/validate.js';
import{materialAudit}from'../../static/inverse/core/material.js';
import{imageFeatures,auditImageFeatures}from'../../static/inverse/core/image-features.js';
import{loadNumericalKernel}from'../../static/inverse/core/numerical-kernel.js';
const args=Object.fromEntries(process.argv.slice(2).map(s=>s.replace(/^--/,'').split('='))),output=args.output||'tmp/bird-stage-study';
const fixture=JSON.parse(fs.readFileSync('scripts/inverse/fixtures/photographic-bird-fit.json')),catalogue=JSON.parse(fs.readFileSync(fixture.sourceCatalogue)),photo=await readHardPhoto(catalogue.source),cfg=settings({...AUTOMATIC_PRESET,timeLimit:25,trials:0,preferMatchingSheets:false});
await loadNumericalKernel();
const input=prepare({...photo,quad:fixture.quad},cfg).target,source=input.sourceImage,features=imageFeatures(source),rows=[];
const seedBytes=fs.readFileSync((args.seeds||'tmp/bird-initialization-study')+'/seeds.json');
const seed=JSON.parse(seedBytes).find(s=>s.id==='missing-16-1').seed;seed.model.z=Float64Array.from(seed.model.z);
const hash=b=>createHash('sha256').update(b).digest('hex');
assert.equal(hash(source.mask),fixture.maskSha256);
assert.equal(hash(new Uint8Array(source.probability.buffer)),fixture.fittingProbabilitySha256);
const sourceHashes={};for(const name of fs.readdirSync('static/inverse/core',{recursive:true}))if(/\.(js|wasm|c)$/.test(name)){const file='static/inverse/core/'+name;sourceHashes[file]=hash(fs.readFileSync(file));}
sourceHashes['scripts/inverse/bird-stage-study.mjs']=hash(fs.readFileSync('scripts/inverse/bird-stage-study.mjs'));
function record(name,graph,points=graph.points){const solution=graph.solution(points,seed.phase,input),mask=sampleWeave(solution,400),check=validate(solution,cfg);const row={name,error:mask.reduce((s,v,i)=>s+Number(v!==source.mask[i]),0)/mask.length,retention:auditImageFeatures(source,mask,100,features).regions.map(r=>r.retainedFraction),geometry:check,coarsePaper:check.passed?materialAudit(solution,cfg).summary:null,finePaper:check.passed?materialAudit(solution,{...cfg,materialResolution:700}).summary:null};rows.push(row);console.log(JSON.stringify({...row,geometry:{passed:check.passed,issues:check.issues.slice(0,6)},coarsePaper:row.coarsePaper?.status,finePaper:row.finePaper?.status}));}
function capture(name,result){const graph=new CurveGraph(gridPaths(result.model,100,result.floor),100);record(name,graph);return graph;}
const floor=fittingMargin(cfg,100)/100;
function refloor(result){const controls=gridControls(result.model,result.floor),z=result.model.z.slice();result.model.counts.forEach((count,f)=>{for(let j=0;j<result.model.k;j++){const gaps=[];let last=0;for(let i=0;i<=count;i++){const end=i===count?1:controls[f].c[j*count+i];gaps.push(Math.max(.0001,end-last-floor));last=end;}const sum=gaps.reduce((a,b)=>a+b,0);for(let i=0;i<=count;i++)z[result.model.offsets[f]+j*(count+1)+i]=Math.log(gaps[i]/sum);}});return z;}

import {resizeObjective} from '../../static/inverse/core/direct/image-objective.js';
import {solutionJSON} from '../../static/inverse/core/graph.js';
import {renderExportedWeave} from './export-renderer.mjs';
fs.mkdirSync(output,{recursive:true});
capture('weighted initial grid',seed);
const boosts=(args.boost||'1,16,64').split(',').map(Number),halos=(args.halo||'0').split(',').map(Number);
assert.ok(boosts.every(b=>Number.isFinite(b)&&b>=1&&b<=256));
assert.ok(halos.every(r=>Number.isInteger(r)&&r>=0&&r<=20));
for(const boost of boosts)for(const halo of halos){
 const id=boost+(halo?'-halo-'+halo:'');
 const fullWeights=new Float64Array(source.mask.length).fill(1/boost);
 for(const feature of features)for(const pixel of feature.pixels){
  const x=pixel%400,y=Math.floor(pixel/400);
  for(let dy=-halo;dy<=halo;dy++)for(let dx=-halo;dx<=halo;dx++)if(dx*dx+dy*dy<=halo*halo&&x+dx>=0&&x+dx<400&&y+dy>=0&&y+dy<400)fullWeights[(y+dy)*400+x+dx]=1;
 }
 const objective=resizeObjective(source.probability,400,256,fullWeights);
 const start=performance.now();
 const clear=fitGrid(objective.probability,256,seed.model.counts,seed.phase,{weights:objective.weights,steps:150,initial:refloor(seed),floor,clearance:floor+.0015});
 const graph=capture('weighted-clearance-'+id,clear);
 const candidate=refineCurves(graph,objective.probability,256,seed.phase,{...cfg,materialResolution:700},{input,weights:objective.weights,steps:750,rate:.05});
 record('weighted-refine-'+id,graph,candidate.points);
 const solution=graph.solution(candidate.points,seed.phase,input),rendered=await renderExportedWeave(solutionJSON(solution),400);
 rows.at(-1).seconds=(performance.now()-start)/1000;
 rows.at(-1).boost=boost;rows.at(-1).haloPixels=halo;
 rows.at(-1).history=candidate.history;
 rows.at(-1).independentError=rendered.mask.reduce((s,v,i)=>s+Number(v!==source.mask[i]),0)/rendered.mask.length;
 rows.at(-1).independentFeatures=auditImageFeatures(source,rendered.mask,100,features);
 fs.writeFileSync(output+'/'+id+'.json',JSON.stringify(solutionJSON(solution)));
 fs.writeFileSync(output+'/'+id+'.png',rendered.png);
 fs.writeFileSync(output+'/results.json',JSON.stringify({fixture,cfg,seedFileSha256:hash(seedBytes),sourceHashes,rows},null,2));
}
