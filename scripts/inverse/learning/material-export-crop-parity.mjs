/** Isolate numerical export drift from wall-clock crop-search variation. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {mock} from 'node:test';
import {createCanvas,loadImage} from 'canvas';
import {detectForegroundCrop} from './foreground-crop.mjs';
import {rectifyMaterialPrediction} from './material-target.mjs';
import {supportedCropOutline} from '../../../static/inverse/core/crop.js';
import {prepare} from '../../../static/inverse/core/engine.js';
import {AUTOMATIC_PRESET} from '../../../static/inverse/core/presets.js';

const args=Object.fromEntries(process.argv.slice(2).map(a=>a.replace(/^--/,'').split('=')));
assert.ok(args.reference&&args.native&&args.browser&&args.output&&Object.keys(args).every(k=>['reference','native','browser','output'].includes(k)));
const hash=b=>createHash('sha256').update(b).digest('hex');
const probes={};
for(const name of ['reference','native','browser']){
 const bytes=await fs.readFile(path.join(args[name],'manifest.json')),manifest=JSON.parse(bytes);
 assert.equal(manifest.status,'complete');assert.equal(manifest.methods.length,1);
 probes[name]={manifest,sha256:hash(bytes),root:args[name]};
}
const ids=probes.reference.manifest.rows.map(r=>r.id);
for(const p of Object.values(probes))assert.deepEqual(p.manifest.rows.map(r=>r.id),ids);
const result={schema:'material-export-crop-parity-1',status:'running',rows:[],
 inputs:Object.fromEntries(Object.entries(probes).map(([k,v])=>[k,{path:v.root,sha256:v.sha256}])),
 sourceHashes:{},scope:'Numerical parity only, no solver or new quality measurement. Freeze performance.now during detection so every method can examine the same finite orientation list; this differs from the production two-second orientation deadline. No ROI, annotation corners or templates are supplied.'};
for(const file of [new URL(import.meta.url).pathname,...(await fs.readdir('static/inverse',{recursive:true})).filter(p=>/^(core|locator)\/.+\.js$/.test(p)).map(p=>'static/inverse/'+p),
 'scripts/inverse/learning/foreground-crop.mjs','scripts/inverse/learning/material-fields.mjs','scripts/inverse/learning/material-target.mjs'])result.sourceHashes[file]=hash(await fs.readFile(file));
await fs.mkdir(args.output,{recursive:false});
const save=()=>fs.writeFile(path.join(args.output,'report.json'),JSON.stringify(result,null,2)+'\n');
const differing=(a,b)=>a.reduce((s,v,i)=>s+Number(v!==b[i]),0);
async function field(probe,asset){
 const file=path.resolve(probe.root,asset.path);assert.ok(file.startsWith(path.resolve(probe.root)+path.sep));
 const bytes=await fs.readFile(file);assert.equal(hash(bytes),asset.sha256);assert.equal(bytes.length,4*256**2);
 return Float32Array.from({length:256**2},(_,i)=>bytes.readFloatLE(4*i));
}
try{
 for(const [index,id] of ids.entries()){
  const original=probes.reference.manifest.rows[index],bytes=await fs.readFile(original.file);assert.equal(hash(bytes),original.photoSha256);
  const image=await loadImage(bytes),canvas=createCanvas(image.width,image.height),ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);
  const source={type:'pixels',rgba:ctx.getImageData(0,0,image.width,image.height).data,imageWidth:image.width,imageHeight:image.height};
  const row={id,methods:{},comparisons:{}};let reference;
  for(const [name,probe] of Object.entries(probes)){
   const input=probe.manifest.rows[index];assert.equal(input.photoSha256,original.photoSha256);
   // JSON.stringify canonicalizes Python's -0.0; signed zero is the same edge.
   assert.equal(input.window.length,original.window.length);assert.ok(input.window.every((v,i)=>v===original.window[i]));
   const assets=input.assets[probe.manifest.methods[0]],body=await field(probe,assets.body),material=await field(probe,assets.material);
   let detection;const now=performance.now.bind(performance),start=now();
   const clock=mock.method(performance,'now',()=>0);
   try{detection=await detectForegroundCrop(source,{probability:body,material,resolution:256,window:input.window});}finally{clock.mock.restore();}
   const crop=detection.candidates[0],record={status:detection.status,crop:!!crop,supported:!!crop&&supportedCropOutline(crop.locator??detection.proposal),
    seconds:((now()-start)/1000),attemptedAngles:detection.attempts.map(r=>r.degrees),quad:crop?.quad??null};
   let target,rgb;
   if(crop){
    target=rectifyMaterialPrediction(source,{values:material,resolution:256,window:input.window},crop.quad,400);
    rgb=prepare({...source,quad:crop.quad,cropProvenance:crop.provenance},AUTOMATIC_PRESET).preview;
    record.materialMaskSha256=hash(target.mask);record.rgbMaskSha256=hash(rgb.mask);
    record.coverageSha256=hash(target.validMask??new Uint8Array(400**2).fill(1));
   }
   row.methods[name]=record;
   if(name==='reference')reference={record,target,rgb};
   else{
    const before=reference.record;
    const c={sameCropPresence:record.crop===before.crop,sameSupport:record.supported===before.supported};
    if(record.crop&&before.crop){
     c.maxCornerDisplacementPixels=Math.max(...record.quad.map((p,i)=>Math.hypot(p[0]-before.quad[i][0],p[1]-before.quad[i][1])));
     c.changedMaterialPixels=differing(target.mask,reference.target.mask);c.changedRgbPixels=differing(rgb.mask,reference.rgb.mask);
     c.sameCoverage=record.coverageSha256===before.coverageSha256;
    }
    row.comparisons[name]=c;
   }
  }
  result.rows.push(row);await save();console.log(id,JSON.stringify(row.comparisons));
 }
 result.summary={};
 for(const name of ['native','browser'])result.summary[name]={
  crops:result.rows.filter(r=>r.methods[name].crop).length,
  samePresenceAndSupport:result.rows.every(r=>r.comparisons[name].sameCropPresence&&r.comparisons[name].sameSupport),
  maxCornerDisplacementPixels:Math.max(0,...result.rows.map(r=>r.comparisons[name].maxCornerDisplacementPixels??0)),
  changedMaterialPixels:result.rows.reduce((s,r)=>s+(r.comparisons[name].changedMaterialPixels??0),0),
  changedRgbPixels:result.rows.reduce((s,r)=>s+(r.comparisons[name].changedRgbPixels??0),0),
  sameCoverage:result.rows.every(r=>r.comparisons[name].sameCoverage!==false)};
 for(const [file,sha] of Object.entries(result.sourceHashes))assert.equal(hash(await fs.readFile(file)),sha,file);
 result.status='complete';await save();console.log(JSON.stringify(result.summary));
}catch(error){result.status='failed';result.error=error.message;await save();throw error;}
