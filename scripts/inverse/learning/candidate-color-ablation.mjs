/** Exploratory color-field ablation after the frozen candidate evaluation.
 * Same foreground, same locator gates, two material sources. No solver or tuning.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createCanvas,loadImage} from 'canvas';
import {detectForegroundCrop} from './foreground-crop.mjs';
import {supportedCropOutline} from '../../../static/inverse/core/crop.js';

const args=Object.fromEntries(process.argv.slice(2).map(s=>s.replace(/^--/,'').split('=')));
assert.deepEqual(Object.keys(args).sort(),['baseline','output','probe']);
const hash=b=>createHash('sha256').update(b).digest('hex');
const pinned=async(file,sha)=>{const b=await fs.readFile(file);assert.equal(hash(b),sha,file);return b;};
const raw=await fs.readFile(args.probe),probe=JSON.parse(raw),baseBytes=await fs.readFile(args.baseline),baseline=JSON.parse(baseBytes);
assert.equal(probe.status,'complete');assert.equal(baseline.status,'complete');
assert.equal(hash(raw),baseline.probeManifestSha256);assert.deepEqual(probe.methods,['wasm']);
const output={schema:'candidate-color-ablation-1',status:'running',probe:{path:args.probe,sha256:hash(raw)},
 baseline:{path:args.baseline,sha256:hash(baseBytes)},methods:['learned-material','foreground-rgb'],rows:[],sourceHashes:{},
 scope:'Exploratory ablation on the already evaluated cohort; not a new held-out evaluation. Both methods use the same saved WASM foreground and unchanged locator. Alternate execution order, retain the existing two-second orientation deadline and all failures. No solver or manual ROI. Timing can change the examined orientations.'};
for(const file of [new URL(import.meta.url).pathname,'scripts/inverse/learning/foreground-crop.mjs','scripts/inverse/learning/material-fields.mjs','scripts/inverse/learning/locator-field-source.mjs',
 ...(await fs.readdir('static/inverse',{recursive:true})).filter(p=>/^(core|locator)\/.+\.js$/.test(p)).map(p=>'static/inverse/'+p)])output.sourceHashes[file]=hash(await fs.readFile(file));
await fs.mkdir(args.output,{recursive:false});
const save=()=>fs.writeFile(path.join(args.output,'report.json'),JSON.stringify(output,null,2)+'\n');
const field=async asset=>{const b=await pinned(path.resolve(path.dirname(args.probe),asset.path),asset.sha256);assert.equal(b.length,256**2*4);return Float32Array.from({length:256**2},(_,i)=>b.readFloatLE(4*i));};
await save();
try{
 for(const [index,input] of probe.rows.entries()){
  const photo=await loadImage(await pinned(input.file,input.photoSha256));assert.deepEqual([photo.width,photo.height],input.dimensions);
  const canvas=createCanvas(photo.width,photo.height),ctx=canvas.getContext('2d');ctx.drawImage(photo,0,0);
  const rgba=ctx.getImageData(0,0,photo.width,photo.height).data,rgb=Buffer.alloc(photo.width*photo.height*3);
  for(let i=0;i<photo.width*photo.height;i++)for(let c=0;c<3;c++)rgb[3*i+c]=rgba[4*i+c];assert.equal(hash(rgb),input.decodedRGBSha256);
  const source={type:'pixels',rgba,imageWidth:photo.width,imageHeight:photo.height};
  const probability=await field(input.assets.wasm.body),material=await field(input.assets.wasm.material);
  const control=baseline.rows.find(r=>r.id===input.id&&r.method==='production');assert.ok(control);
  const row={id:input.id,productionSupported:control.supported,methods:{}};output.rows.push(row);
  for(const method of index%2?output.methods.slice().reverse():output.methods){
   const start=performance.now();
   const detection=await detectForegroundCrop(source,{probability,...(method==='learned-material'?{material}:{}),resolution:256,window:input.window});
   const crop=detection.candidates[0],supported=!!crop&&supportedCropOutline(crop.locator??detection.proposal);
   const observed=!!crop&&crop.quad.every(p=>p.every(Number.isFinite)&&p[0]>=0&&p[1]>=0&&p[0]<=photo.width&&p[1]<=photo.height);
   row.methods[method]={supported,observed,eligibleFallback:supported&&observed,seconds:(performance.now()-start)/1000,detection};
  }
  await save();console.log(row.id,JSON.stringify(Object.fromEntries(output.methods.map(m=>[m,row.methods[m].eligibleFallback]))));
 }
 output.summary=Object.fromEntries(output.methods.map(m=>[m,{
  supported:output.rows.filter(r=>r.methods[m].supported).length,eligible:output.rows.filter(r=>r.methods[m].eligibleFallback).length,
  extraFallbacks:output.rows.filter(r=>!r.productionSupported&&r.methods[m].eligibleFallback).map(r=>r.id)}]));
 for(const [file,sha] of Object.entries(output.sourceHashes))assert.equal(hash(await fs.readFile(file)),sha,file);
 output.status='complete';await save();console.log(JSON.stringify(output.summary));
}catch(error){output.status='failed';output.error=error.message;await save();throw error;}
