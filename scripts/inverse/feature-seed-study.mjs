import { benchmarkArtifactEntries } from './benchmark-artifacts.mjs';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {prepare,finish} from '../../static/inverse/core/engine.js';
import {settings} from '../../static/inverse/core/settings.js';
import {AUTOMATIC_PRESET} from '../../static/inverse/core/presets.js';
import {readHardPhoto} from './hard-photo-data.mjs';
import {imageFeatures,auditImageFeatures} from '../../static/inverse/core/image-features.js';
import {initializeCounts} from '../../static/inverse/core/direct/counts.js';
import {resizeObjective} from '../../static/inverse/core/direct/image-objective.js';
import {gridMask,mismatch} from '../../static/inverse/core/direct/grid.js';
import {fitDirect} from '../../static/inverse/core/direct/fit.js';
import {renderExportedWeave} from './export-renderer.mjs';
// Diagnostic only: deliberately refine the feature-retaining weighted starts.
// This does not replace or prune the production search. No reference paths.
const args=Object.fromEntries(process.argv.slice(2).map(s=>s.replace(/^--/,'').split('=')));
if(args.counts&&!['default','unequal'].includes(args.counts))throw new Error('Use --counts=default|unequal');
const countPolicy=args.counts||'default';
const fixture=JSON.parse(await fs.readFile('scripts/inverse/fixtures/photographic-puppy-fit.json')),catalogue=JSON.parse(await fs.readFile(fixture.sourceCatalogue)),photo=await readHardPhoto(catalogue.cases.find(c=>c.id===fixture.sourceCase));
const cfg=settings({...AUTOMATIC_PRESET,timeLimit:Number(args.seconds||20),trials:0,earlyStop:false}),prepared=prepare({...photo,quad:fixture.quad},AUTOMATIC_PRESET),rows=[],output=args.output||'tmp/feature-seed-study';await fs.mkdir(output,{recursive:true});
assert.equal(createHash('sha256').update(prepared.target.sourceImage.mask).digest('hex'),fixture.maskSha256);
assert.equal(createHash('sha256').update(new Uint8Array(prepared.target.sourceImage.probability.buffer)).digest('hex'),fixture.probabilitySha256);
const sourceHashes={};
async function hashTree(dir){for(const e of await fs.readdir(dir,{withFileTypes:true})){const f=dir+'/'+e.name;if(e.isDirectory())await hashTree(f);else sourceHashes[f]=createHash('sha256').update(await fs.readFile(f)).digest('hex');}}
await hashTree('static/inverse/core');
for(const f of ['scripts/inverse/feature-seed-study.mjs','scripts/inverse/fixtures/photographic-puppy-fit.json'])sourceHashes[f]=createHash('sha256').update(await fs.readFile(f)).digest('hex');
await fs.writeFile(output+'/inputs.json',JSON.stringify({fixture,settings:cfg,countPolicy,sourceHashes},null,2));
for(const mode of ['photo','mask'])for(const boost of countPolicy==='unequal'?[16,64]:[64,256]){
 const input=mode==='photo'?prepared.target:prepare({type:'mask',mask:prepared.target.sourceImage.mask.slice(),resolution:400},cfg).target,source=input.sourceImage,features=imageFeatures(source),initial=[],start=performance.now();
 const solution=await fitDirect(input,cfg,()=>{},{countSearch:args=>{
  if(countPolicy==='unequal'){
   const options=[];for(let a=2;a<=5;a++)for(let b=2;b<=5;b++)for(const phase of [1,-1])options.push({counts:[a,b],phase});
   args={...args,options};
  }
  const fullWeights=Float64Array.from(args.fullProb,()=>1/boost);for(const feature of features)for(const i of feature.pixels)fullWeights[i]=1;
  const weighted=resizeObjective(args.fullProb,args.resolution,args.n,fullWeights),search=initializeCounts({...args,prob:weighted.probability,weights:weighted.weights,fullWeights});
  for(const seed of search.seeds){const mask=gridMask(seed.model,args.resolution,seed.phase,seed.floor);seed.features=auditImageFeatures(source,mask);seed.error=mismatch(gridMask(seed.model,args.n,seed.phase,seed.floor),args.prob);initial.push({counts:seed.model.counts,phase:seed.phase,error:seed.error,features:seed.features});}
  const seeds=search.seeds.filter(s=>s.features.passed).sort((a,b)=>a.error-b.error).slice(0,3);assert.ok(seeds.length);
  return{seeds,report:{strategy:'feature-weighted diagnostic',boost,initial}};
 }});
 const answer=finish(solution,cfg),woven=await renderExportedWeave(answer.files['cut_geometry.json'],source.resolution),error=mismatch(woven.mask,source.mask),featureResult=auditImageFeatures(source,woven.mask),seconds=(performance.now()-start)/1000;
 const folder=output+'/'+mode+'-'+boost;await fs.mkdir(folder,{recursive:true});for(const[f,c]of benchmarkArtifactEntries(answer.files))await fs.writeFile(folder+'/'+f,c);await fs.writeFile(folder+'/woven.png',woven.png);
 const result={mode,boost,seconds,error,features:featureResult,geometryPassed:answer.report.validation.passed,paperStatus:answer.report.manufacturing.status,checks:answer.report.templateChecksPassed,counts:answer.report.slits,candidates:answer.report.solver.candidates,initial};rows.push(result);await fs.writeFile(output+'/results.json',JSON.stringify(rows,null,2));console.log(JSON.stringify({...result,initial:undefined}));
}
