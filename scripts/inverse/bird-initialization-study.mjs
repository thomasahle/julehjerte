/** Diagnostic count/phase sweep, never supplied to the production search.
 * Source pixels/crop stay frozen. Weighted starts are rescored unweighted.
 */
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createCanvas} from 'canvas';
import {prepare} from '../../static/inverse/core/engine.js';
import {settings} from '../../static/inverse/core/settings.js';
import {AUTOMATIC_PRESET} from '../../static/inverse/core/presets.js';
import {imageFeatures,auditImageFeatures} from '../../static/inverse/core/image-features.js';
import {initializeCounts,borderEvidence} from '../../static/inverse/core/direct/counts.js';
import {resizeObjective} from '../../static/inverse/core/direct/image-objective.js';
import {gridMask,mismatch} from '../../static/inverse/core/direct/grid.js';
import {readHardPhoto} from './hard-photo-data.mjs';

const args=Object.fromEntries(process.argv.slice(2).map(s=>s.replace(/^--/,'').split('='))),output=args.output||'tmp/bird-initialization-study';
await fs.mkdir(output,{recursive:true});
const fixture=JSON.parse(await fs.readFile('scripts/inverse/fixtures/photographic-bird-fit.json'));
const catalogue=JSON.parse(await fs.readFile(fixture.sourceCatalogue)),photo=await readHardPhoto(catalogue.source);
const cfg=settings({...AUTOMATIC_PRESET,timeLimit:25,trials:0,earlyStop:false}),crop=prepare({...photo,quad:fixture.quad},cfg);
const input=prepare({type:'mask',mask:crop.preview.mask,resolution:400},cfg).target,source=input.sourceImage;
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
assert.equal(hash(source.mask),fixture.maskSha256);
assert.equal(hash(new Uint8Array(source.probability.buffer)),fixture.fittingProbabilitySha256);
const features=imageFeatures(source,cfg.width),evidence=borderEvidence(source.probability,source.resolution),n=256,original=resizeObjective(source.probability,source.resolution,n);
const options=[];for(let a=1;a<=8;a++)for(let b=1;b<=8;b++)for(const phase of [1,-1])options.push({counts:[a,b],phase});
const sourceHashes={};for(const name of await fs.readdir('static/inverse/core',{recursive:true}))if(/\.(js|wasm|c)$/.test(name)){const file='static/inverse/core/'+name;sourceHashes[file]=hash(await fs.readFile(file));}
for(const file of ['scripts/inverse/bird-initialization-study.mjs','scripts/inverse/fixtures/photographic-bird-fit.json'])sourceHashes[file]=hash(await fs.readFile(file));
const policies=[{name:'unweighted',boost:1,indices:[]},...[16,64,256].flatMap(boost=>[
 {name:'missing-'+boost,boost,indices:[1,2]},
 {name:'eye-'+boost,boost,indices:[1]}
])];
assert.equal(features.length,3);assert.ok(features[1].areaMm2<4&&features[1].centerMm[1]<50,'The diagnostic eye must still be the same component');
const rows=[],models=[];
async function png(mask,file){const c=createCanvas(400,400),cx=c.getContext('2d'),pixels=cx.createImageData(400,400);for(let i=0;i<mask.length;i++){pixels.data[4*i]=pixels.data[4*i+1]=pixels.data[4*i+2]=mask[i]?0:255;pixels.data[4*i+3]=255;}cx.putImageData(pixels,0,0);await fs.writeFile(file,c.toBuffer('image/png'));}
await png(source.mask,output+'/mask.png');
for(const policy of policies){
 const start=performance.now(),fullWeights=new Float64Array(source.mask.length).fill(1/policy.boost);
 for(const index of policy.indices)for(const pixel of features[index].pixels)fullWeights[pixel]=1;
 const weighted=resizeObjective(source.probability,source.resolution,n,fullWeights);
 const search=initializeCounts({options,fullProb:source.probability,resolution:source.resolution,prob:weighted.probability,n,evidence,weights:weighted.weights,fullWeights});
 const seeds=search.seeds.map(seed=>{
  const mask=gridMask(seed.model,400,seed.phase,seed.floor),audit=auditImageFeatures(source,mask,cfg.width,features);
  return{seed,counts:seed.model.counts,phase:seed.phase,error:mismatch(gridMask(seed.model,n,seed.phase,seed.floor),original.probability),sourceError:mismatch(mask,source.mask),featuresPassed:audit.passed,retention:audit.regions.map(r=>r.retainedFraction)};
 }).sort((a,b)=>a.error-b.error);
 const summary=s=>s&&{counts:s.counts,phase:s.phase,error:s.error,sourceError:s.sourceError,featuresPassed:s.featuresPassed,retention:s.retention};
 rows.push({policy,seconds:(performance.now()-start)/1000,best:summary(seeds[0]),bestEye:summary(seeds.find(s=>s.retention[1]>=.6)),bestAll:summary(seeds.find(s=>s.featuresPassed)),attempts:seeds.map(summary)});
 const selected=[seeds[0],seeds.find(s=>s.retention[1]>=.6),seeds.find(s=>s.featuresPassed)].filter((s,i,a)=>s&&a.indexOf(s)===i);
 for(const [i,s]of selected.entries()){
  const id=policy.name+'-'+i;
  models.push({id,policy,summary:summary(s),seed:{...s.seed,model:{...s.seed.model,z:Array.from(s.seed.model.z)}}});
  await png(gridMask(s.seed.model,400,s.seed.phase,s.seed.floor),output+'/'+id+'.png');
 }
 await fs.writeFile(output+'/results.json',JSON.stringify({fixture,cfg,features:features.map(({pixels,...f})=>({...f,pixelCount:pixels.length})),evidence,sourceHashes,rows},null,2));
 await fs.writeFile(output+'/seeds.json',JSON.stringify(models));
 console.log(JSON.stringify({...rows.at(-1),attempts:undefined}));
}
