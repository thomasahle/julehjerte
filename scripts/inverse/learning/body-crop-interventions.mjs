/** Isolate shape and colour fields in a paired saved body-model comparison.
 * Unlimited orientation enumeration is diagnostic, never a speed measurement.
 * Mixed fields are causal probes, not usable predictions or deployable crops.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {mock} from 'node:test';
import {createCanvas,loadImage} from 'canvas';
import {detectForegroundCrop} from './foreground-crop.mjs';
import {supportedCropOutline} from '../../../static/inverse/core/crop.js';

const args=Object.fromEntries(process.argv.slice(2).map(a=>a.replace(/^--/,'').split('=')));
assert.ok(args.plan&&args.output&&Object.keys(args).every(k=>['plan','output'].includes(k)));
const hash=b=>createHash('sha256').update(b).digest('hex');
const pinned=async pin=>{const bytes=await fs.readFile(pin.path);assert.equal(hash(bytes),pin.sha256,pin.path);return JSON.parse(bytes);};
const bytes=await fs.readFile(args.plan),plan=JSON.parse(bytes);
assert.equal(plan.schema,'body-crop-intervention-plan-1');
for(const [file,sha] of Object.entries(plan.sourcePins))assert.equal(hash(await fs.readFile(file)),sha,file);
const manifests=Object.fromEntries(await Promise.all(Object.entries(plan.probes).map(async([arm,pin])=>[arm,await pinned(pin)])));
const report={schema:'body-crop-intervention-1',status:'running',plan:{path:args.plan,sha256:hash(bytes)},
 implementationSha256:hash(await fs.readFile(new URL(import.meta.url))),rows:[],
 scope:'Untimed orientation search on saved fields. Mixed field groups test dependencies, not coherent model predictions. No thresholds or source pixels change; no fitting or crop-accuracy claim.'};
await fs.mkdir(args.output,{recursive:false});
const save=()=>fs.writeFile(path.join(args.output,'report.json'),JSON.stringify(report,null,2)+'\n');
async function detect(source,prediction,replace){
 let fields,detection;const clock=mock.method(performance,'now',()=>0);
 try{detection=await detectForegroundCrop(source,{...prediction,paletteMode:'confidence-weighted',refineFields:f=>{fields=f;return replace?replace(f):f;}});}
 finally{clock.mock.restore();}
 const crop=detection.candidates[0],e=detection.proposal.evidence??{};
 return{fields,record:{status:detection.status,reason:detection.reason??null,quad:crop?.quad??null,
  supported:!!crop&&supportedCropOutline(crop.locator??detection.proposal),
  attempts:detection.attempts,evidence:Object.fromEntries(['rejectedQuad','lobeOutlineSupport','lowerEdgeSupport','capColourLoss','medianLobeResidualPx'].map(k=>[k,e[k]??null]))}};
}
try{
 for(const id of plan.ids){
  const ref=manifests.control.rows.find(r=>r.id===id);assert.ok(ref);
  const imageBytes=await fs.readFile(ref.file);assert.equal(hash(imageBytes),ref.photoSha256);
  const image=await loadImage(imageBytes),canvas=createCanvas(image.width,image.height),ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);
  const source={type:'pixels',rgba:ctx.getImageData(0,0,image.width,image.height).data,imageWidth:image.width,imageHeight:image.height};
  const predictions={},runs={},row={id,baseline:{},interventions:{}};
  for(const arm of ['control','candidate']){
   const manifest=manifests[arm],r=manifest.rows.find(r=>r.id===id);assert.equal(manifest.status,'complete');assert.equal(manifest.resolution,320);
   assert.equal(r.photoSha256,ref.photoSha256);assert.deepEqual(r.window,ref.window);
   const asset=r.assets['probability.f32'],file=path.resolve(path.dirname(plan.probes[arm].path),asset.path);
   assert.ok(file.startsWith(path.resolve(path.dirname(plan.probes[arm].path))+path.sep));
   const bytes=await fs.readFile(file);assert.equal(hash(bytes),asset.sha256);assert.equal(bytes.length,320*320*4);
   predictions[arm]={probability:Float32Array.from({length:320*320},(_,i)=>bytes.readFloatLE(4*i)),resolution:320,window:r.window};
   runs[arm]=await detect(source,predictions[arm]);assert.ok(runs[arm].fields);row.baseline[arm]=runs[arm].record;
  }
  for(const [name,keys] of Object.entries(plan.interventions)){
   assert.ok(keys.length&&keys.every(k=>['paper','mask','pd','red','white','chroma','rd','wd','palette'].includes(k)));
   const result=await detect(source,predictions.candidate,f=>({...f,...Object.fromEntries(keys.map(k=>[k,runs.control.fields[k]]))}));
   if(new Set(keys).size===9)assert.deepEqual(result.record,runs.control.record,'Replacing all learned fields must exactly reproduce the control');
   row.interventions[name]={...result.record,fieldsFromControl:keys};
  }
  report.rows.push(row);await save();
  console.log(JSON.stringify({id,baseline:Object.fromEntries(Object.entries(row.baseline).map(([k,r])=>[k,r.supported])),interventions:Object.fromEntries(Object.entries(row.interventions).map(([k,r])=>[k,r.supported]))}));
 }
 for(const [file,sha] of Object.entries(plan.sourcePins))assert.equal(hash(await fs.readFile(file)),sha,file);
 report.status='complete';await save();
}catch(error){report.status='failed';report.error=error.message;await save();throw error;}
