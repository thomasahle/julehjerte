/** Causal field interventions on previously measured exported saliency drift.
 * Diagnostic only: no training, solver, threshold changes or production imports.
 */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {mock} from 'node:test';
import {createCanvas,loadImage} from 'canvas';
import {detectForegroundCrop} from './foreground-crop.mjs';
import {supportedCropOutline} from '../../../static/inverse/core/crop.js';

const args=Object.fromEntries(process.argv.slice(2).map(a=>a.replace(/^--/,'').split('=')));
assert.ok(args.plan&&args.output&&Object.keys(args).every(k=>['plan','output'].includes(k)));
const hash=b=>createHash('sha256').update(b).digest('hex');
const read=async pin=>{const bytes=await fs.readFile(pin.path);assert.equal(hash(bytes),pin.sha256,pin.path);return JSON.parse(bytes);};
const planBytes=await fs.readFile(args.plan),plan=JSON.parse(planBytes),baseline=await read(plan.baseline);
assert.equal(baseline.status,'complete');
for(const [file,sha] of Object.entries(baseline.sourceHashes))assert.equal(hash(await fs.readFile(file)),sha,file);
const reference=await read(baseline.inputs.reference),native=await read(baseline.inputs.native),browser=await read(baseline.inputs.browser);
assert.deepEqual(plan.cases,baseline.rows.filter(r=>r.comparisons.browser.changedRgbPixels>0).map(r=>r.id));
const result={schema:'saliency-crop-drift-1',status:'running',plan:{path:args.plan,sha256:hash(planBytes)},rows:[],
 scope:plan.scope,sourceHash:hash(await fs.readFile(new URL(import.meta.url)))};
await fs.mkdir(args.output,{recursive:false});
const save=()=>fs.writeFile(path.join(args.output,'report.json'),JSON.stringify(result,null,2)+'\n');
async function field(pin,asset){
 const file=path.resolve(path.dirname(pin.path),asset.path);assert.ok(file.startsWith(path.resolve(path.dirname(pin.path))+path.sep));
 const bytes=await fs.readFile(file);assert.equal(hash(bytes),asset.sha256);assert.equal(bytes.length,320*320*4);
 return Float32Array.from({length:320*320},(_,i)=>bytes.readFloatLE(4*i));
}
function difference(a,b){
 assert.equal(a.length,b.length);let changed=0,maximum=0,halfThresholdChanges=0,palettePoolChanges=0;
 for(let i=0;i<a.length;i++){changed+=Number(a[i]!==b[i]);maximum=Math.max(maximum,Math.abs(a[i]-b[i]));
  halfThresholdChanges+=Number((a[i]>.5)!==(b[i]>.5));palettePoolChanges+=Number(i%3===0&&(a[i]>.95)!==(b[i]>.95));}
 return{changed,maximum,halfThresholdChanges,palettePoolChanges};
}
function displacement(a,b){return a&&b?Math.max(...a.map((p,i)=>Math.hypot(p[0]-b[i][0],p[1]-b[i][1]))):null;}
async function detect(source,prediction,replace){
 let fields;const clock=mock.method(performance,'now',()=>0);let detection;
 try{detection=await detectForegroundCrop(source,{...prediction,refineFields:f=>{fields=f;return replace?replace(f):f;}});}finally{clock.mock.restore();}
 const crop=detection.candidates[0];
 return{fields,record:{status:detection.status,quad:crop?.quad??null,supported:!!crop&&supportedCropOutline(crop.locator??detection.proposal),
  angles:detection.attempts.map(a=>a.degrees),score:detection.proposal.score??null}};
}
try{
 for(const id of plan.cases){
  const ref=reference.rows.find(r=>r.id===id),nat=native.rows.find(r=>r.id===id),web=browser.rows.find(r=>r.id===id);
  assert.equal(ref.photoSha256,web.photoSha256);assert.deepEqual(ref.window,web.window);
  const bytes=await fs.readFile(ref.file);assert.equal(hash(bytes),ref.photoSha256);
  const image=await loadImage(bytes),canvas=createCanvas(image.width,image.height),ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);
  const source={type:'pixels',rgba:ctx.getImageData(0,0,image.width,image.height).data,imageWidth:image.width,imageHeight:image.height};
  const predictions={};
  for(const [name,pin,asset] of [['reference',baseline.inputs.reference,ref.assets['probability.f32']],['native',baseline.inputs.native,nat.assets.saliency],['browser',baseline.inputs.browser,web.assets['probability.f32']]])
   predictions[name]={probability:await field(pin,asset),resolution:320,window:ref.window};
  const runs={},row={id,fields:{},runs:{},interventions:{}};
  for(const [name,prediction] of Object.entries(predictions)){
   runs[name]=await detect(source,prediction);row.runs[name]=runs[name].record;
   assert.deepEqual(runs[name].record.quad,baseline.rows.find(r=>r.id===id).methods[name].quad,`${id}/${name}: reproduce the measured crop before interventions`);
   assert.ok(runs[name].fields);
   if(name!=='reference'){
    row.fields[name]=Object.fromEntries(['paper','red','white','chroma','mask','pd','rd','wd'].map(key=>[key,difference(runs.reference.fields[key],runs[name].fields[key])]));
    row.fields[name].palette={reference:runs.reference.fields.palette.colors,current:runs[name].fields.palette.colors};
   }
  }
  for(const [name,keys] of Object.entries(plan.interventions)){
   const mixed=await detect(source,predictions.native,f=>({...f,...Object.fromEntries(keys.map(key=>[key,runs.reference.fields[key]]))}));
   row.interventions[name]={...mixed.record,fieldsFromReference:keys,
    distanceToReference:displacement(mixed.record.quad,runs.reference.record.quad),distanceToNative:displacement(mixed.record.quad,runs.native.record.quad)};
  }
  result.rows.push(row);await save();console.log(id,JSON.stringify(Object.fromEntries(Object.entries(row.interventions).map(([name,r])=>[name,{reference:r.distanceToReference,native:r.distanceToNative}]))));
 }
 for(const [file,sha] of Object.entries(baseline.sourceHashes))assert.equal(hash(await fs.readFile(file)),sha,file);
 result.status='complete';await save();
}catch(error){result.status='failed';result.error=error.message;await save();throw error;}
