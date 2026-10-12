/** Replay photograph -> automatic crop -> mask -> checked exported templates.
 * Synthetic labels are used only to score the chosen crop and exported pair.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createCanvas,loadImage} from 'canvas';
import {detectHeartCrops} from '../../../static/inverse/core/crop.js';
import {prepare,design} from '../../../static/inverse/core/engine.js';
import {AUTOMATIC_PRESET} from '../../../static/inverse/core/presets.js';
import {renderExportedWeave} from '../export-renderer.mjs';
import {labelsForCrop} from './photo-labels.mjs';

const args=Object.fromEntries(process.argv.slice(2).map(s=>s.replace(/^--/,'').split('=')));
if(!args.probe||!args.output||Object.keys(args).some(k=>!['probe','output','seconds'].includes(k)))throw new Error('Use --probe=directory --output=new-directory [--seconds=10].');
const probe=path.resolve(args.probe),output=path.resolve(args.output),seconds=Number(args.seconds||10);
if(!Number.isFinite(seconds)||seconds<.1||seconds>180)throw new Error('Use a solver budget of .1..180 seconds.');
const hash=b=>createHash('sha256').update(b).digest('hex'),manifestBytes=await fs.readFile(path.join(probe,'manifest.json')),manifest=JSON.parse(manifestBytes);
if(manifest.status!=='complete')throw new Error('Require a complete intervention probe.');
await fs.mkdir(path.dirname(output),{recursive:true});await fs.mkdir(output);
const report={schema:'heart-photo-pipeline-1',status:'running',probe,probeManifestSha256:hash(manifestBytes),
  scope:(manifest.scope||'Selected synthetic photographic failures.')+' Automatic crop with no ROI, hints, known template or manual edits. Unresolved crops remain failures. Source labels score the outputs but never enter detection or fitting.',
  configuration:{...AUTOMATIC_PRESET,timeLimit:seconds,trials:0,resolution:384},sourceHashes:{},rows:[]};
for(const file of ['scripts/inverse/learning/photo-pipeline.mjs','scripts/inverse/learning/photo-labels.mjs','scripts/inverse/export-renderer.mjs','scripts/inverse/datasets/synthetic-photo.mjs',...(await fs.readdir('static/inverse',{recursive:true})).filter(p=>/^(core|locator)\/.+\.js$/.test(p)).map(p=>`static/inverse/${p}`)])report.sourceHashes[file]=hash(await fs.readFile(file));
const save=()=>fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
async function checked(root,asset){
  const file=path.resolve(root,asset.path);if(!file.startsWith(path.resolve(root)+path.sep))throw new Error('Asset escapes source root.');
  const b=await fs.readFile(file);if(hash(b)!==asset.sha256)throw new Error('Changed source asset.');return b;
}
async function decode(bytes){
  const image=await loadImage(bytes),canvas=createCanvas(image.width,image.height),ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);
  return{width:image.width,height:image.height,data:ctx.getImageData(0,0,image.width,image.height).data};
}
function png(values,n,channels=1){
  const canvas=createCanvas(n,n),ctx=canvas.getContext('2d'),rgba=ctx.createImageData(n,n);
  for(let i=0;i<n*n;i++)rgba.data.set(channels===1?[255*values[i],255*values[i],255*values[i],255]:[...values.slice(3*i,3*i+3),255],4*i);
  ctx.putImageData(rgba,0,0);return canvas.toBuffer('image/png');
}
function score(mask,target,valid){
  let count=0,wrong=0;for(let i=0;i<mask.length;i++)if(valid[i]){count++;wrong+=mask[i]!==target[i];}
  if(!count)throw new Error('No observed overlap pixels.');
  return{mismatchFraction:Math.min(wrong,count-wrong)/count,inverted:wrong>count/2,observedPixels:count};
}

await save();
try{
  for(const input of manifest.rows.filter(r=>r.variant==='baseline')){
    if(!/^[a-zA-Z0-9_-]+$/.test(input.id))throw new Error('Invalid view id.');
    const row={id:input.id,assets:{}};report.rows.push(row);const start=performance.now(),folder=path.join(output,row.id);await fs.mkdir(folder);
    const store=async(name,bytes)=>{await fs.writeFile(path.join(folder,name),bytes);row.assets[name]={path:`${row.id}/${name}`,sha256:hash(bytes)};};
    try{
      const photo=await decode(await checked(probe,input.assets['photo.jpg'])),source={type:'pixels',imageWidth:photo.width,imageHeight:photo.height,rgba:photo.data};
      const detected=performance.now(),crops=detectHeartCrops(source);row.cropSeconds=(performance.now()-detected)/1000;row.cropStatus=crops.status;
      await store('crop-proposals.json',JSON.stringify(crops,null,2));
      if(!crops.candidates.length){row.status='crop-unresolved';continue;}
      const selected=crops.candidates[0];row.selectedCrop=selected;
      const ready=performance.now(),prepared=prepare({...source,quad:selected.quad,cropProvenance:{...selected.provenance,humanReviewed:false}},report.configuration);
      row.prepareSeconds=(performance.now()-ready)/1000;await store('crop.png',png(prepared.preview.rgb,384,3));await store('mask.png',png(prepared.preview.mask,384));
      const solveStart=performance.now(),result=await design(prepared.target,report.configuration);row.solveSeconds=(performance.now()-solveStart)/1000;
      row.report=result.report;row.status=result.report.templateChecksPassed?'checked-pair':'review-required';
      const cuts=result.files['cut_geometry.json'];if(!cuts)throw new Error('No exported cutting pair.');await store('cut_geometry.json',cuts);
      const render=await renderExportedWeave(cuts,384);await store('woven.png',render.png);
      // Evaluation starts only after the fitted cuts have been selected/exported.
      const labels=JSON.parse(await checked(probe,input.assets['labels.json'])),designRecord=manifest.designs.find(d=>d.id===input.designId);
      const canonical=await decode(await checked(manifest.sourceDataset,designRecord.sourceCanonical));
      const reference=labelsForCrop(labels,selected.quad,canonical,384,photo.width,photo.height);
      row.cornerErrorsPixels=selected.quad.map((p,i)=>Math.hypot(p[0]-labels.actualQuad[i][0],p[1]-labels.actualQuad[i][1]));
      row.classifiedReference=score(prepared.preview.mask,reference.target,reference.valid);row.exportedReference=score(render.mask,reference.target,reference.valid);
      const sourceCuts=JSON.parse(await checked(manifest.sourceDataset,designRecord.sourceCuts));row.referenceSlits=[sourceCuts.A_overlap_paths.length,sourceCuts.B_overlap_paths.length];
      await store('latent-mask.png',png(reference.target,384));await store('latent-valid.png',png(reference.valid,384));
    }catch(error){row.status='failed';row.error=error.message;}
    finally{row.totalSeconds=(performance.now()-start)/1000;await save();console.log(row.id,row.status,row.totalSeconds.toFixed(3),row.exportedReference?.mismatchFraction);}
  }
  report.status='complete';await save();
}catch(error){report.status='failed';report.error=error.message;await save();throw error;}
