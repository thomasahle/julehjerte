/** Prepare existing printed RGB variants without changing their graph labels. */
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createCanvas,loadImage} from 'canvas';
import {rectify,quantize} from '../../../static/inverse/core/input.js';

const args=Object.fromEntries(process.argv.slice(2).map(s=>s.replace(/^--/,'').split('=')));
assert.ok(args.plan&&args.output&&Object.keys(args).every(k=>['plan','output'].includes(k)));
const hash=raw=>createHash('sha256').update(raw).digest('hex');
async function pinned(ref,root='.'){
 const file=path.resolve(root,ref.path),raw=await fs.readFile(file);
 assert.equal(hash(raw),ref.sha256,file);return{file,raw};
}
async function reference(file){return{path:file,sha256:hash(await fs.readFile(file))};}
const plan=JSON.parse(await fs.readFile(args.plan));
assert.equal(plan.schema,'junction-printed-preparation-plan-1');
const admission=JSON.parse((await pinned(plan.admission)).raw),training=JSON.parse((await pinned(plan.training)).raw);
assert.equal(admission.status,'complete');assert.equal(training.status,'complete');
assert.equal(admission.sourceTrainingSha256,plan.training.sha256);
assert.deepEqual(admission.rows.map(r=>r.id),plan.expectedCases);
assert.deepEqual(admission.rejected.map(r=>r.id),plan.expectedRejected);
assert.equal(admission.rows.length,75);assert.equal(admission.rejected.length,21);
const allowedDesigns=new Set(training.splits.train.designs),parents=new Map(),printed=new Map();
for(const ref of plan.preparedParents){
 const prepared=JSON.parse((await pinned(ref)).raw),root=path.dirname(ref.path);
 const datasetFile=path.join(prepared.dataset,'manifest.json'),raw=await fs.readFile(datasetFile);
 assert.equal(hash(raw),prepared.datasetManifestSha256);
 const dataset=JSON.parse(raw);assert.equal(prepared.status,'complete');assert.equal(dataset.status,'complete');
 assert.deepEqual(dataset.sourceProvenance.externalAssets,[]);
 assert.ok(!dataset.splitPolicy.existingPhotoQAIncluded&&!dataset.splitPolicy.existingHunodanQAIncluded&&!dataset.splitPolicy.existingGalleryIncluded);
 assert.equal(prepared.resolution,384);
 parents.set(prepared.datasetManifestSha256,{prepared,root,dataset});
}
for(const source of admission.sources){
 const file=path.join(source.directory,'manifest.json');
 const manifest=JSON.parse((await pinned({path:file,sha256:source.manifestSha256})).raw);
 assert.equal(manifest.status,'complete');assert.equal(manifest.profile,'printed');
 assert.equal(manifest.sourceManifestSha256,source.parentManifestSha256);
 assert.ok(parents.has(source.parentManifestSha256));
 printed.set(source.manifestSha256,{...source,manifest});
}
const n=plan.protocol.resolution;assert.equal(n,384);
const started=performance.now(),sourceFiles=[
 'scripts/inverse/learning/prepare-junction-prints.mjs','package-lock.json',
 ...(await fs.readdir('static/inverse/core',{recursive:true})).filter(f=>f.endsWith('.js')).map(f=>'static/inverse/core/'+f),
];
const report={schema:'junction-printed-preparation-1',status:'running',plan:await reference(args.plan),
 resolution:n,sourceHashes:Object.fromEntries(await Promise.all(sourceFiles.map(async file=>[file,hash(await fs.readFile(file))]))),
 protocol:plan.protocol,controls:[],rows:[],rejected:admission.rejected};
await fs.mkdir(args.output);
const save=()=>fs.writeFile(path.join(args.output,'manifest.json'),JSON.stringify(report,null,2)+'\n');
async function resources(){
 assert.ok((performance.now()-started)/1000<plan.resources.maximumWallSeconds,'Wall-time cap');
 const disk=await fs.statfs(args.output);assert.ok(disk.bavail*disk.bsize>=plan.resources.minimumFreeGiB*2**30,'Free disk cap');
 let bytes=0;
 for(const file of await fs.readdir(args.output,{recursive:true})){
  const stat=await fs.stat(path.join(args.output,file));if(stat.isFile())bytes+=stat.size;
 }
 assert.ok(bytes<plan.resources.maximumArtifactMiB*2**20,'Artifact cap');return bytes;
}
async function pixels(raw){
 const image=await loadImage(raw),canvas=createCanvas(image.width,image.height),ctx=canvas.getContext('2d');
 ctx.drawImage(image,0,0);
 return{rgba:ctx.getImageData(0,0,image.width,image.height).data,width:image.width,height:image.height};
}
async function classify(raw){
 const image=await pixels(raw),rgb=rectify(image.rgba,image.width,image.height,n),result=quantize(rgb);
 return{rgb,mask:result.mask,classification:result.metadata};
}
function png(values,channels){
 const canvas=createCanvas(n,n),ctx=canvas.getContext('2d'),image=ctx.createImageData(n,n);
 for(let i=0;i<n*n;i++){for(let k=0;k<3;k++)image.data[4*i+k]=channels===3?values[3*i+k]:255*values[i];image.data[4*i+3]=255;}
 ctx.putImageData(image,0,0);return canvas.toBuffer('image/png');
}
async function preparedPixels(ref,root,channels){
 const {raw,file}=await pinned(ref,root),image=await pixels(raw);assert.equal(image.width,n);assert.equal(image.height,n);
 const values=new Uint8Array(n*n*channels);
 for(let i=0;i<n*n;i++){
  assert.equal(image.rgba[4*i+3],255);
  if(channels===3)for(let k=0;k<3;k++)values[3*i+k]=image.rgba[4*i+k];
  else{
   assert.ok([0,255].includes(image.rgba[4*i]));
   assert.equal(image.rgba[4*i],image.rgba[4*i+1]);assert.equal(image.rgba[4*i],image.rgba[4*i+2]);
   values[i]=image.rgba[4*i]/255;
  }
 }
 return{values,reference:{path:file,sha256:ref.sha256}};
}
const controls=new Map();
await save();
try{
 for(const row of admission.rows){
  await resources();
  const source=printed.get(row.sourceManifestSha256);assert.ok(source);assert.equal(row.directory,source.directory);
  const parent=parents.get(source.parentManifestSha256),view=parent.dataset.views.find(v=>v.id===row.sourceViewId);
  assert.ok(view);assert.equal(view.designId,row.designId);assert.ok(allowedDesigns.has(view.designId));
  const design=parent.dataset.baseDesigns.find(d=>d.id===view.designId);assert.equal(design.geometrySha256,row.geometrySha256);
  const variant=source.manifest.rows.find(v=>v.sourceViewId===row.sourceViewId&&v.variant===row.variant);
  assert.ok(variant);assert.deepEqual(variant.assets,row.assets);
  const baseline=source.manifest.baselineIdentities.find(v=>v.sourceViewId===row.sourceViewId);
  assert.ok(baseline);
  const originalLabels=JSON.parse((await pinned(view.assets['labels.json'],parent.prepared.dataset)).raw);
  const labels=JSON.parse((await pinned(row.assets['labels.json'],row.directory)).raw);
  for(const key of ['canonicalToPhoto','canonicalToCrop','actualQuad','nodesPhoto','nodesCrop','seed','resolution'])
   assert.deepEqual(labels[key],originalLabels[key],key);
  for(const name of ['crop-paper-a.png','crop-overlap-valid.png']){
   assert.equal(row.assets[name].sha256,baseline.imageHashes[name]);
   assert.equal(row.assets[name].sha256,view.assets[name].sha256);
   await pinned(row.assets[name],row.directory);
  }
  await pinned(design.assets['graph.json'],parent.prepared.dataset);
  await pinned(view.assets['crop-overlap-valid.png'],parent.prepared.dataset);
  const identity=source.parentManifestSha256.slice(0,12)+':'+row.sourceViewId;
  let control=controls.get(identity);
  if(!control){
   const prepared=parent.prepared.rows.find(r=>r.id===row.sourceViewId);assert.ok(prepared);
   const original=await pinned(view.assets['crop.png'],parent.prepared.dataset);
   assert.equal(original.raw.length>0,true);assert.equal(prepared.inputSha256,view.assets['crop.png'].sha256);
   const current=await classify(original.raw);
   const rgb=await preparedPixels(prepared.assets['rgb.png'],parent.root,3),mask=await preparedPixels(prepared.assets['mask.png'],parent.root,1);
   const rgbDifferences=current.rgb.reduce((sum,value,i)=>sum+Number(value!==rgb.values[i]),0);
   const maskDifferences=current.mask.reduce((sum,value,i)=>sum+Number(value!==mask.values[i]),0);
   control={id:identity,sourceViewId:row.sourceViewId,designId:row.designId,parentPreparedRoot:parent.root,
    parentDatasetManifestSha256:source.parentManifestSha256,geometrySha256:row.geometrySha256,
    rgb:rgb.reference,mask:mask.reference,rgbSha256:hash(rgb.values),maskSha256:hash(mask.values),
    originalCrop:{path:original.file,sha256:view.assets['crop.png'].sha256},
    decodedRgbScalarDifferences:rgbDifferences,maskPixelDifferences:maskDifferences,
    exact:rgbDifferences===0&&maskDifferences===0};
   controls.set(identity,control);report.controls.push(control);
  }
  const input=await pinned(row.assets['crop.png'],row.directory),result=await classify(input.raw);
  const record={id:row.id,originalId:identity,sourceViewId:row.sourceViewId,designId:row.designId,
   geometrySha256:row.geometrySha256,variant:row.variant,classification:result.classification,
   input:{path:input.file,sha256:row.assets['crop.png'].sha256},
   rgbSha256:hash(result.rgb),maskSha256:hash(result.mask),
   originalLabels:await reference(path.resolve(parent.prepared.dataset,view.assets['labels.json'].path)),
   graph:await reference(path.resolve(parent.prepared.dataset,design.assets['graph.json'].path)),
   validity:await reference(path.resolve(parent.prepared.dataset,view.assets['crop-overlap-valid.png'].path)),
   assets:{}};
  const folder=path.join(args.output,row.id);await fs.mkdir(folder);
  for(const [name,raw] of [['rgb.png',png(result.rgb,3)],['mask.png',png(result.mask,1)]]){
   const file=path.join(folder,name);await fs.writeFile(file,raw);
   record.assets[name]={path:path.relative(args.output,file),sha256:hash(raw)};
  }
  report.rows.push(record);await save();
  if(report.rows.length%15===0)console.log(report.rows.length,'/',admission.rows.length);
 }
 assert.equal(controls.size,25);
 for(const rejected of admission.rejected){
  const id=rejected.id.split(':')[1].split('--')[0];
  for(const parent of parents.values()){
   const view=parent.dataset.views.find(v=>v.id===id);
   if(view)assert.ok(!allowedDesigns.has(view.designId),'Excluded view cannot be a declared training design');
  }
 }
 for(const [file,sha] of Object.entries(report.sourceHashes))assert.equal(hash(await fs.readFile(file)),sha,file);
 report.status='complete';report.trainingEligible=report.controls.every(c=>c.exact);
 report.seconds=(performance.now()-started)/1000;report.artifactBytesBeforeFinalReport=await resources();
 await save();await resources();
 console.log(JSON.stringify({views:report.rows.length,controls:report.controls.length,trainingEligible:report.trainingEligible,
  controlsChanged:report.controls.filter(r=>!r.exact).map(r=>r.id)}));
}catch(error){report.status='failed';report.error=error.message;await save();throw error;}
