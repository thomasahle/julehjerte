/** Compare audited material fields and production through fresh fitting. */
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createCanvas,loadImage} from 'canvas';
import {detectForegroundCrop} from './foreground-crop.mjs';
import {rectifyMaterialPrediction} from './material-target.mjs';
import {detectHeartCrops,supportedCropOutline} from '../../../static/inverse/core/crop.js';
import {prepare,design} from '../../../static/inverse/core/engine.js';
import {AUTOMATIC_PRESET} from '../../../static/inverse/core/presets.js';
import {referenceError} from '../../../static/inverse/core/image-reference.js';
import {auditFeatureFidelity} from '../../../static/inverse/core/feature-shapes.js';
import {hardPhotoTarget} from '../hard-photo-target.mjs';
import {renderExportedWeave} from '../export-renderer.mjs';

const args=Object.fromEntries(process.argv.slice(2).map(s=>s.replace(/^--/,'').split('=')));
assert.ok(args.probe&&args.output&&Object.keys(args).every(k=>['probe','output','seconds','methods'].includes(k)));
const seconds=Number(args.seconds??10);assert.ok(Number.isFinite(seconds)&&seconds>0&&seconds<=60);
const probe=path.resolve(args.probe),output=path.resolve(args.output),hash=b=>createHash('sha256').update(b).digest('hex');
const bytes=await fs.readFile(path.join(probe,'manifest.json')),manifest=JSON.parse(bytes);
assert.equal(manifest.schema,'woven-heart-material-probe-1');assert.equal(manifest.status,'complete');
assert.ok(Array.isArray(manifest.methods)&&manifest.methods.length&&manifest.methods.every(m=>/^[a-z]+(?:-[a-z]+)*$/.test(m)));
const methods=args.methods?args.methods.split(','):['production',...manifest.methods];
assert.ok(methods.length&&new Set(methods).size===methods.length&&methods.every(m=>m==='production'||manifest.methods.includes(m)));
const configuration={...AUTOMATIC_PRESET,timeLimit:seconds,trials:0};
const report={schema:'material-pair-pipeline-1',status:'running',configuration,methods,probeManifestSha256:hash(bytes),rows:[],sourceHashes:{},
 scope:'All declared development photos, same full RGB source, no ROI/annotations/reference templates. Fresh crop-to-template attempts for every declared method. Only observed photograph pixels score. Derived-mask agreement does not establish full artwork recovery.',
 order:'Rotate declared methods by photo index; original geometric, feature and paper checks. Search allowance excludes crop detection and final export audit.'};
for(const file of [new URL(import.meta.url).pathname,'scripts/inverse/learning/foreground-crop.mjs','scripts/inverse/learning/locator-field-source.mjs','scripts/inverse/learning/material-target.mjs','scripts/inverse/learning/material-fields.mjs','scripts/inverse/export-renderer.mjs','scripts/inverse/hard-photo-target.mjs',
 ...(await fs.readdir('static/inverse',{recursive:true})).filter(p=>/^(core|locator|vendor)\/.+\.(js|mjs|wasm)$/.test(p)).map(p=>'static/inverse/'+p)])report.sourceHashes[file]=hash(await fs.readFile(file));
await fs.mkdir(output,{recursive:false});
const save=()=>fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
async function field(asset){
 const file=path.resolve(probe,asset.path);assert.ok(file.startsWith(probe+path.sep));
 const raw=await fs.readFile(file);assert.equal(hash(raw),asset.sha256);assert.equal(raw.length,manifest.resolution**2*4);
 return Float32Array.from({length:manifest.resolution**2},(_,i)=>raw.readFloatLE(i*4));
}
function png(values,n,rgb=false){
 const c=createCanvas(n,n),ctx=c.getContext('2d'),pixels=ctx.createImageData(n,n);
 for(let i=0;i<n*n;i++)pixels.data.set(rgb?[values[3*i],values[3*i+1],values[3*i+2],255]:values[i]?[185,19,19,255]:[255,255,255,255],i*4);
 ctx.putImageData(pixels,0,0);return c.toBuffer('image/png');
}
await save();
try{
 for(const [index,input] of manifest.rows.entries()){
  const raw=await fs.readFile(input.file);assert.equal(hash(raw),input.photoSha256);
  const image=await loadImage(raw);assert.deepEqual([image.width,image.height],input.dimensions);
  const canvas=createCanvas(image.width,image.height),ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);
  const rgba=ctx.getImageData(0,0,image.width,image.height).data,rgb=Buffer.alloc(image.width*image.height*3);
  for(let i=0;i<image.width*image.height;i++)for(let k=0;k<3;k++)rgb[3*i+k]=rgba[4*i+k];assert.equal(hash(rgb),input.decodedRGBSha256);
  const source={type:'pixels',rgba,imageWidth:image.width,imageHeight:image.height};
  const order=[...methods.slice(index%methods.length),...methods.slice(0,index%methods.length)];
  for(const method of order){
   const folder=path.join(output,input.id+'-'+method);await fs.mkdir(folder);
   const row={id:input.id,method,source:input.file,sourceSha256:input.photoSha256,assets:{}};report.rows.push(row);
   const store=async(name,data)=>{await fs.writeFile(path.join(folder,name),data);row.assets[name]={path:path.relative(output,path.join(folder,name)),sha256:hash(data)};};
   try{
    let body,material;
    if(method!=='production'){body=await field(input.assets[method].body);material=await field(input.assets[method].material);}
    const began=performance.now();
    const detected=method==='production'?detectHeartCrops(source):await detectForegroundCrop(source,{probability:body,material,resolution:manifest.resolution,window:input.window});
    row.cropSeconds=(performance.now()-began)/1000;row.cropStatus=detected.status;
    const crop=detected.candidates[0];row.supported=!!crop&&supportedCropOutline(crop.locator??detected.proposal);
    await store('detection.json',JSON.stringify(detected,null,2));
    if(!crop){row.status='crop-unresolved';continue;}row.selectedCrop=crop;
    let target,preview;
    if(method==='production'){
     const imported=prepare({...source,quad:crop.quad,cropProvenance:crop.provenance},configuration);
     preview=imported.preview;target=hardPhotoTarget(imported,'mask',configuration);
    }else{
     preview=rectifyMaterialPrediction(source,{values:material,resolution:manifest.resolution,window:input.window},crop.quad,configuration.resolution);
     target=prepare({type:'mask',resolution:preview.resolution,mask:preview.mask.slice(),validMask:preview.validMask},{...configuration,invert:false,removeSpecks:0,fillHoles:0}).target;
     assert.deepEqual(target.sourceImage.mask,preview.mask);assert.deepEqual(target.sourceImage.validMask??null,preview.validMask??null);
    }
    const n=preview.resolution;row.resolution=n;row.targetMaskSha256=hash(preview.mask);
    row.observedPixels=preview.validMask?preview.validMask.reduce((a,b)=>a+b,0):n*n;
    await store('crop.png',png(preview.rgb,n,true));await store('mask.png',png(preview.mask,n));
    if(preview.validMask)await store('observed.bin',preview.validMask);
    const started=performance.now(),result=await design(target,configuration);row.solveSeconds=(performance.now()-started)/1000;row.report=result.report;
    for(const name of ['cut_geometry.json','template_left.svg','template_right.svg','weave_preview.svg']){assert.ok(result.files[name]);await store(name,result.files[name]);}
    const render=await renderExportedWeave(result.files['cut_geometry.json'],n);await store('woven.png',render.png);
    row.independentImage=referenceError(target.sourceImage,render.mask);row.independentFeatures=auditFeatureFidelity(target.sourceImage,render.mask,result.report.settings);
    row.checkedPair=result.report.templateChecksPassed&&row.independentFeatures.passed&&row.independentImage.mismatchFraction<=.03;
    row.status=row.checkedPair?'checked-derived-mask':'review-required';
   }catch(error){row.status='failed';row.error=error.message;if(error.report)row.report=error.report;}
   finally{await save();console.log(row.id,method,row.status,row.independentImage?.mismatchFraction);}
  }
 }
 for(const [file,sha] of Object.entries(report.sourceHashes))assert.equal(hash(await fs.readFile(file)),sha,file);
 report.summary=Object.fromEntries(methods.map(method=>{const rows=report.rows.filter(r=>r.method===method);return[method,{attempted:rows.length,crops:rows.filter(r=>r.selectedCrop).length,supported:rows.filter(r=>r.supported).length,checkedPairs:rows.filter(r=>r.checkedPair).length}];}));
 report.status='complete';await save();console.log(JSON.stringify(report.summary));
}catch(error){report.status='failed';report.error=error.message;await save();throw error;}
