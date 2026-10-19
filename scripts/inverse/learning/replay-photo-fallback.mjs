/** Paired crop-policy experiment: fresh RGB fits, no per-photo choice of winners. */
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createCanvas,loadImage} from 'canvas';
import {selectPhotoCrop} from './photo-crop-fallback.mjs';
import {selectReviewedPhotoCrop} from './partial-photo-crop.mjs';
import {detectForegroundCrop} from './foreground-crop.mjs';
import {detectHeartCrops,supportedCropOutline} from '../../../static/inverse/core/crop.js';
import {foregroundRegion} from './foreground-region.mjs';
import {prepare,design} from '../../../static/inverse/core/engine.js';
import {AUTOMATIC_PRESET} from '../../../static/inverse/core/presets.js';
import {referenceError} from '../../../static/inverse/core/image-reference.js';
import {auditFeatureFidelity} from '../../../static/inverse/core/feature-shapes.js';
import {hardPhotoTarget} from '../hard-photo-target.mjs';
import {renderExportedWeave} from '../export-renderer.mjs';

const args=Object.fromEntries(process.argv.slice(2).map(s=>s.replace(/^--/,'').split('=')));
assert.ok(args.plan&&args.output&&Object.keys(args).every(k=>['plan','output'].includes(k)));
const hash=b=>createHash('sha256').update(b).digest('hex');
const read=async p=>JSON.parse(await fs.readFile(p));
const pinned=async asset=>{const bytes=await fs.readFile(asset.path);assert.equal(hash(bytes),asset.sha256,asset.path);return JSON.parse(bytes);};
const plan=await read(args.plan);
assert.ok(['photo-crop-fallback-plan-1','candidate-photo-crop-fallback-plan-1','saliency-photo-crop-fallback-plan-1'].includes(plan.schema));
const saliency=plan.schema==='saliency-photo-crop-fallback-plan-1';
const manifest=await pinned(plan.probe),training=saliency?null:await pinned(plan.training),runtime=await pinned(plan.runtimeEvidence);
assert.equal(manifest.status,'complete');if(training)assert.equal(training.status,'complete');
if(saliency){
 const study=await pinned(plan.study),selection=await pinned(study.selection),catalog=await pinned(selection.sourceManifest);
 assert.equal(study.schema,'saliency-fresh-study-1');assert.deepEqual(plan.protocol,study.pipeline);
 assert.equal(runtime.schema,'u2netp-browser-1');assert.equal(runtime.status,'complete');
 assert.ok(runtime.checks.allPhotos&&runtime.checks.sourceRgbExact&&runtime.checks.inputParity);
 assert.equal(runtime.artifacts['manifest.json'],plan.probe.sha256);assert.equal(manifest.resolution,320);
 const native=await pinned(runtime.native);assert.equal(native.onnx.sha256,study.model.sha256);
 const assets=new Map(catalog.assets.map(r=>[r.id,r]));
 assert.deepEqual(plan.ids,selection.photos.map(r=>r.id));assert.deepEqual(manifest.rows.map(r=>r.id),plan.ids);
 for(const [file,digest] of Object.entries(study.sourcePins))assert.equal(hash(await fs.readFile(file)),digest,file);
 for(const [index,row] of manifest.rows.entries()){
  const expected=selection.photos[index],asset=assets.get(expected.assetId);
  assert.equal(asset.splitStatus,'qa-reserved');assert.equal(asset.sha256,expected.imageSha256);
  assert.equal(row.photoSha256,expected.imageSha256);assert.equal(row.file,expected.file);
  assert.deepEqual(row.dimensions,expected.dimensions);assert.equal(row.decodedRGBSha256,expected.decodedRGBSha256);
 }
 assert.equal(plan.protocol.timeLimitSeconds,10);assert.equal(plan.protocol.trials,0);
}else if(plan.schema==='photo-crop-fallback-plan-1'){
assert.ok(runtime.checks.allPhotos&&runtime.checks.inputRgbExact&&runtime.checks.archivedHalfThresholdParity);
assert.equal(runtime.artifacts['probe/manifest.json'],plan.probe.sha256);
const catalog=await pinned(plan.sourceManifest),assets=new Map(catalog.assets.map(r=>[r.id,r]));
const reserved=new Set(catalog.assets.filter(r=>r.splitStatus==='qa-reserved').map(r=>r.splitGroupId));
const labels=new Map();
for(const entry of training.labelAudits)for(const row of (await read(path.join(entry.directory,'manifest.json'))).instances){
 const asset=assets.get(row.assetId);assert.ok(asset);assert.equal(asset.sha256,row.imageSha256);
 assert.equal(asset.splitStatus,'unassigned');assert.ok(!reserved.has(asset.splitGroupId));
 assert.equal(asset.splitGroupId,row.splitGroupId);labels.set(row.id,row);
}
assert.deepEqual(manifest.rows.map(r=>r.id),plan.ids);assert.equal(new Set(plan.ids).size,plan.ids.length);
for(const id of plan.ids){
 const row=manifest.rows.find(r=>r.id===id);assert.equal(row.originalPhotoSha256,labels.get(id).imageSha256);
 const fold=training.folds.filter(f=>f.heldOut.includes(id));assert.equal(fold.length,1);
 assert.ok(!fold[0].train.includes(id));assert.equal(runtime.photos.find(r=>r.id===id).fold,fold[0].id);
}
}else{
 assert.equal(training.schema,'preserved-material-candidate-1');
 assert.equal(runtime.schema,'preserved-candidate-browser-1');assert.equal(runtime.status,'complete');
 // Failed numeric gates remain diagnostic, but mismatched image inputs cannot be compared.
 assert.ok(runtime.checks.allPhotos&&runtime.checks.sourceRgbExact&&runtime.checks.inputRgbExact);
 assert.equal(runtime.artifacts['probe/manifest.json'],plan.probe.sha256);
 const native=await pinned(runtime.native),protocol=await pinned(training.plan),evaluation=await pinned(protocol.evaluation);
 assert.equal(native.training.sha256,plan.training.sha256);assert.equal(native.evaluation.sha256,protocol.evaluation.sha256);
 assert.equal(protocol.sourceManifest.sha256,plan.sourceManifest.sha256);
 const audit=await pinned(plan.audit);assert.ok(audit.passed);assert.equal(audit.candidateReport.sha256,plan.training.sha256);
 assert.equal(audit.checkpointSha256,training.checkpointSha256);
 const labels=await pinned(protocol.labelCatalog),catalog=await pinned(plan.sourceManifest),assets=new Map(catalog.assets.map(r=>[r.id,r]));
 const reserved=new Set(catalog.assets.filter(r=>r.splitStatus==='qa-reserved').map(r=>r.splitGroupId));
 const train=labels.instances.map(r=>{const asset=assets.get(r.assetId);assert.equal(asset.sha256,r.imageSha256);assert.equal(asset.splitStatus,'unassigned');assert.ok(!reserved.has(asset.splitGroupId));return asset;});
 assert.deepEqual(manifest.rows.map(r=>r.id),evaluation.photos.map(r=>r.id));assert.deepEqual(plan.ids,evaluation.photos.map(r=>r.id));
 assert.equal(new Set(plan.ids).size,plan.ids.length);
 for(const row of manifest.rows){
  const expected=evaluation.photos.find(r=>r.id===row.id),asset=assets.get(expected.assetId);
  assert.equal(asset.splitStatus,'qa-reserved');assert.equal(asset.sha256,expected.imageSha256);
  for(const field of ['id','sha256','nearDuplicateGroup','splitGroupId'])assert.ok(!train.some(a=>a[field]===asset[field]));
  assert.ok(!train.some(a=>a.sourceGroups.some(g=>asset.sourceGroups.includes(g))));
  assert.equal(row.photoSha256,expected.imageSha256);assert.equal(row.file,expected.file);
  assert.deepEqual(row.dimensions,expected.dimensions);assert.equal(row.decodedRGBSha256,expected.decodedRGBSha256);
 }
 assert.equal(plan.protocol.timeLimitSeconds,10);assert.equal(plan.protocol.trials,0);
}
const configuration={...AUTOMATIC_PRESET,timeLimit:plan.protocol.timeLimitSeconds,trials:plan.protocol.trials};
const cropStrategy=plan.protocol.cropStrategy??'learned-fields';
assert.ok(['learned-fields','foreground-region-rgb'].includes(cropStrategy));
const control=plan.controlRun?await pinned(plan.controlRun):null;
if(control){
 assert.equal(control.schema,'material-pair-pipeline-1');assert.equal(control.status,'complete');
 assert.equal(control.probeManifestSha256,plan.probe.sha256);assert.deepEqual(control.configuration,configuration);
 assert.deepEqual(control.rows.filter(r=>r.method==='production').map(r=>r.id),plan.ids);
 // Research adapters may change, but the original production fit implementation must match.
 for(const [file,digest] of Object.entries(control.sourceHashes))
  if(file.startsWith('static/inverse/')||['scripts/inverse/hard-photo-target.mjs','scripts/inverse/export-renderer.mjs'].includes(file))
   assert.equal(hash(await fs.readFile(file)),digest,file);
}
const report={schema:'material-pair-pipeline-1',status:'running',configuration,methods:['production','fallback'],targetMode:'rgb',
 plan:{path:args.plan,sha256:hash(await fs.readFile(args.plan))},probeManifestSha256:plan.probe.sha256,rows:[],sourceHashes:{},
 scope:plan.purpose,comparisonProtocol:plan.protocol,sourceSeparationChecksPassed:true,runtimeNumericalGatePassed:runtime.passed,
 ...(control?{reusedProductionRun:plan.controlRun}:{})};
for(const file of [new URL(import.meta.url).pathname,'scripts/inverse/learning/photo-crop-fallback.mjs','scripts/inverse/learning/partial-photo-crop.mjs','scripts/inverse/learning/foreground-crop.mjs',
 'scripts/inverse/learning/foreground-region.mjs','scripts/inverse/learning/locator-field-source.mjs','scripts/inverse/learning/material-fields.mjs','scripts/inverse/hard-photo-target.mjs','scripts/inverse/export-renderer.mjs',
 ...(await fs.readdir('static/inverse',{recursive:true})).filter(p=>/^(core|locator|vendor)\/.+\.(js|mjs|wasm)$/.test(p)).map(p=>'static/inverse/'+p)])report.sourceHashes[file]=hash(await fs.readFile(file));
await fs.mkdir(args.output,{recursive:false});
const save=()=>fs.writeFile(path.join(args.output,'report.json'),JSON.stringify(report,null,2)+'\n');
async function field(asset){
 const root=path.dirname(plan.probe.path),file=path.resolve(root,asset.path);assert.ok(file.startsWith(path.resolve(root)+path.sep));
 const resolution=manifest.resolution??256;
 const bytes=await fs.readFile(file);assert.equal(hash(bytes),asset.sha256);assert.equal(bytes.length,resolution**2*4);
 return Float32Array.from({length:resolution**2},(_,i)=>bytes.readFloatLE(i*4));
}
async function controlAsset(asset){
 const root=path.resolve(path.dirname(plan.controlRun.path)),file=path.resolve(root,asset.path);
 assert.ok(file.startsWith(root+path.sep));const bytes=await fs.readFile(file);assert.equal(hash(bytes),asset.sha256);
 return{file,bytes};
}
async function reuseControl(input,selection){
 const original=control.rows.find(r=>r.id===input.id&&r.method==='production');assert.equal(original.sourceSha256,input.photoSha256);
 const row={...structuredClone(original),selection,reusedFitFrom:{report:plan.controlRun,id:input.id,method:'production'},assets:{}};
 const folder=path.join(args.output,input.id+'-production');await fs.mkdir(folder);
 for(const [name,asset] of Object.entries(original.assets)){
  const {file}=await controlAsset(asset),target=path.join(folder,name);assert.equal(path.basename(name),name);
  await fs.link(file,target);row.assets[name]={path:path.relative(args.output,target),sha256:asset.sha256};
 }
 report.rows.push(row);await save();return row;
}
function png(values,n,rgb=false){
 const c=createCanvas(n,n),ctx=c.getContext('2d'),pixels=ctx.createImageData(n,n);
 for(let i=0;i<n*n;i++)pixels.data.set(rgb?[values[3*i],values[3*i+1],values[3*i+2],255]:values[i]?[185,19,19,255]:[255,255,255,255],i*4);
 ctx.putImageData(pixels,0,0);return c.toBuffer('image/png');
}
async function fit(input,source,detection,method,selection){
 const folder=path.join(args.output,input.id+'-'+method);await fs.mkdir(folder);
 const row={id:input.id,method,targetMode:'rgb',source:input.file,sourceSha256:input.photoSha256,assets:{},selection,
  cropStatus:detection.status,selectedCrop:detection.candidates[0]??null,cropSeconds:(detection.elapsedMs??detection.candidates[0]?.locator?.elapsedMs??0)/1000};
 report.rows.push(row);
 const store=async(name,data)=>{await fs.writeFile(path.join(folder,name),data);row.assets[name]={path:path.relative(args.output,path.join(folder,name)),sha256:hash(data)};};
 try{
  const crop=row.selectedCrop;row.supported=!!crop&&supportedCropOutline(crop.locator??detection.proposal);
  await store('detection.json',JSON.stringify(detection,null,2));
  if(!crop){row.status='crop-unresolved';return row;}
  const imported=prepare({...source,quad:crop.quad,cropProvenance:crop.provenance},configuration),preview=imported.preview;
  const target=hardPhotoTarget(imported,'mask',configuration),n=preview.resolution;
  row.resolution=n;row.targetMaskSha256=hash(preview.mask);row.observedPixels=preview.validMask?preview.validMask.reduce((s,v)=>s+v,0):n*n;
  await store('crop.png',png(preview.rgb,n,true));await store('mask.png',png(preview.mask,n));
  if(preview.validMask)await store('observed.bin',preview.validMask);
  const started=performance.now(),answer=await design(target,configuration);row.solveSeconds=(performance.now()-started)/1000;row.report=answer.report;
  for(const name of ['cut_geometry.json','template_left.svg','template_right.svg','weave_preview.svg']){assert.ok(answer.files[name]);await store(name,answer.files[name]);}
  const rendered=await renderExportedWeave(answer.files['cut_geometry.json'],n);await store('woven.png',rendered.png);
  row.independentImage=referenceError(target.sourceImage,rendered.mask);row.independentFeatures=auditFeatureFidelity(target.sourceImage,rendered.mask,answer.report.settings);
  row.checkedPair=answer.report.templateChecksPassed&&row.independentFeatures.passed&&row.independentImage.mismatchFraction<=.03;
  row.status=row.checkedPair?'checked-derived-mask':'review-required';
 }catch(error){row.status='failed';row.error=error.message;if(error.report)row.report=error.report;}
 finally{await save();console.log(row.id,method,row.status,row.independentImage?.mismatchFraction);}
 return row;
}
await save();
try{
 for(const [index,input] of manifest.rows.entries()){
  const raw=await fs.readFile(input.file);assert.equal(hash(raw),input.photoSha256);
  const image=await loadImage(raw);assert.deepEqual([image.width,image.height],input.dimensions);
  const canvas=createCanvas(image.width,image.height),ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);
  const rgba=ctx.getImageData(0,0,image.width,image.height).data,rgb=Buffer.alloc(image.width*image.height*3);
  for(let i=0;i<image.width*image.height;i++)for(let c=0;c<3;c++)rgb[3*i+c]=rgba[4*i+c];assert.equal(hash(rgb),input.decodedRGBSha256);
  const source={type:'pixels',rgba,imageWidth:image.width,imageHeight:image.height};
  const started=performance.now();let neuralSeconds=0,region=null,learnedDetection=null;
  const production=control?JSON.parse((await controlAsset(control.rows.find(r=>r.id===input.id&&r.method==='production').assets['detection.json'])).bytes):null;
  const selected=await (saliency?selectReviewedPhotoCrop:selectPhotoCrop)(source,{...(production?{productionCrop:()=>production}:{}),learnedCrop:async()=>{
   const fields=saliency?null:input.assets[manifest.methods[0]],body=await field(saliency?input.assets['probability.f32']:fields.body),start=performance.now();let detected;
   if(saliency){
    detected=await detectForegroundCrop(source,{probability:body,resolution:manifest.resolution,window:input.window});
   }else if(cropStrategy==='foreground-region-rgb'){
    region=foregroundRegion({probability:body,resolution:256,window:input.window,imageWidth:source.imageWidth,imageHeight:source.imageHeight});
    detected=region.roi?await detectHeartCrops(source,{roi:region.roi}):{status:'not_found',reason:region.reason,candidates:[]};
   }else{
    const material=await field(fields.material);
    detected=await detectForegroundCrop(source,{probability:body,material,resolution:256,window:input.window});
   }
   neuralSeconds=(performance.now()-start)/1000;learnedDetection=detected;return detected;
  }});
  const selection={...selected.decision,cropStrategy,...(region?{region}:{}),productionDetectionReused:!!control,
   combinedDetectionSeconds:(performance.now()-started)/1000,neuralDetectionSeconds:neuralSeconds,
   inference:'Cached actual evaluation WASM output; inference excluded from timings. Cached production detection, when present, is also excluded.'};
  if(learnedDetection){
   const name=input.id+'-neural-detection.json',bytes=JSON.stringify(learnedDetection,null,2)+'\n';
   await fs.writeFile(path.join(args.output,name),bytes);selection.learnedDetectionAsset={path:name,sha256:hash(bytes)};
  }
  if(control){
   const reference=await reuseControl(input,selection);
   if(selected.detection===selected.production){report.rows.push({...reference,method:'fallback'});await save();}
   else await fit(input,source,selected.detection,'fallback',selection);
   continue;
  }
  if(selected.detection===selected.production){
   const control=await fit(input,source,selected.production,'production',selection);
   // Identical source/crop/configuration: intentionally share the fit and files.
   report.rows.push({...control,method:'fallback',reusedFitFrom:{id:control.id,method:'production'},selection});await save();
  }else{
   for(const method of index%2?['fallback','production']:['production','fallback'])
    await fit(input,source,method==='production'?selected.production:selected.detection,method,selection);
  }
 }
 for(const [file,digest] of Object.entries(report.sourceHashes))assert.equal(hash(await fs.readFile(file)),digest,file);
 report.summary=Object.fromEntries(report.methods.map(method=>{const rows=report.rows.filter(r=>r.method===method);return[method,{attempted:rows.length,
  crops:rows.filter(r=>r.selectedCrop).length,supported:rows.filter(r=>r.supported).length,checkedPairs:rows.filter(r=>r.checkedPair).length,
  neuralSelected:method==='fallback'?rows.filter(r=>r.selection.selected==='learned').length:0,reusedFits:rows.filter(r=>r.reusedFitFrom).length}];}));
 report.status='complete';await save();console.log(JSON.stringify(report.summary));
 const retained=await fs.readdir(args.output,{recursive:true});let bytes=0;
 for(const file of retained){const stat=await fs.stat(path.join(args.output,file));if(stat.isFile())bytes+=stat.size;}
 report.retainedBytes=bytes;assert.ok(bytes<=plan.resources.artifactBudgetMiB*1024**2);await save();
}catch(error){report.status='failed';report.error=error.message;await save();throw error;}
