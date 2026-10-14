/** Compare current cropping, a frozen RGB foreground model, and an oracle.
 * The oracle runs only on synthetic inputs and is never counted as learned.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createCanvas,loadImage} from 'canvas';
import {detectHeartCrops} from '../../../static/inverse/core/crop.js';
import {prepare,design} from '../../../static/inverse/core/engine.js';
import {AUTOMATIC_PRESET} from '../../../static/inverse/core/presets.js';
import {auditFeatureFidelity} from '../../../static/inverse/core/feature-shapes.js';
import {renderExportedWeave} from '../export-renderer.mjs';
import {cropEvidence} from '../crop-evidence.mjs';
import {labelsForCrop} from './photo-labels.mjs';
import {detectForegroundCrop} from './foreground-crop.mjs';
import {refineForegroundRGB,fillForegroundHoles} from './foreground-refine.mjs';
import {hardPhotoTarget} from '../hard-photo-target.mjs';
import {reviewMaterialSamples,validateMaterialSamples} from '../photo-material-samples.mjs';

const args=Object.fromEntries(process.argv.slice(2).map(s=>s.replace(/^--/,'').split('=')));
if(!args.probe||!args.output||Object.keys(args).some(k=>!['probe','output','seconds','ids','solve-ids','methods','refinement','target'].includes(k)))throw new Error('Use --probe=directory --output=new-directory [--seconds=10 --ids=id1,id2 --solve-ids=id1,id2 --methods=production,learned,oracle,annotation --refinement=none|seeded-rgb|fill-holes --target=photo|mask].');
const methods=(args.methods||'production,learned,oracle').split(','),refinement=args.refinement||'none';
const targetMode=args.target||'photo';
if(!['photo','mask'].includes(targetMode))throw new Error('Use --target=photo|mask.');
const refinements={none:undefined,'seeded-rgb':refineForegroundRGB,'fill-holes':fillForegroundHoles};
if(methods.some(m=>!['production','learned','oracle','annotation'].includes(m))||new Set(methods).size!==methods.length||!Object.hasOwn(refinements,refinement))throw new Error('Invalid replay methods or foreground refinement.');
const probe=path.resolve(args.probe),output=path.resolve(args.output),seconds=Number(args.seconds||10),solveIds=new Set((args['solve-ids']||'').split(','));
if(!Number.isFinite(seconds)||seconds<1||seconds>180)throw new Error('Invalid solver budget.');
const hash=b=>createHash('sha256').update(b).digest('hex'),bytes=await fs.readFile(path.join(probe,'manifest.json')),manifest=JSON.parse(bytes);
if(manifest.status!=='complete'||manifest.schema!=='woven-heart-foreground-probe-1')throw new Error('Require a completed foreground probe.');
const annotated=manifest.fieldOrigin?.kind==='reviewed-annotation-bound';
if(annotated&&methods.some(m=>m!=='production'&&m!=='annotation'))throw new Error('Reviewed annotation fields are diagnostic only; use --methods=annotation, never learned or oracle.');
if(methods.includes('annotation')&&(!annotated||manifest.fieldOrigin.diagnosticOnly!==true||typeof manifest.fieldOrigin.includeUnknown!=='boolean'||refinement!=='none'))throw new Error('Annotation replay requires an explicitly diagnostic reviewed bound and no foreground refinement.');
const ids=args.ids?.split(','),inputs=ids?manifest.rows.filter(row=>ids.includes(row.id)||ids.includes(row.caseId)):manifest.rows;
if(ids&&ids.some(id=>!id||!inputs.some(row=>row.id===id||row.caseId===id)))throw new Error('Every --ids entry must identify an input in the probe.');
const materialSampleFile='scripts/inverse/fixtures/photo-material-samples.json',materialSampleBytes=await fs.readFile(materialSampleFile),materialSamples=JSON.parse(materialSampleBytes);
if(materialSamples.schema!=='woven-heart-photo-material-samples-1')throw new Error('Unexpected material review schema.');
materialSamples.cases.forEach(validateMaterialSamples);
await fs.mkdir(path.dirname(output),{recursive:true});await fs.mkdir(output);
const report={schema:'woven-heart-foreground-replay-1',status:'running',probe,probeManifestSha256:hash(bytes),configuration:{...AUTOMATIC_PRESET,timeLimit:seconds,trials:0},
  inputIds:inputs.map(row=>row.id),probeInputCount:manifest.rows.length,solveIds:[...solveIds].filter(Boolean),methods,fieldOrigin:manifest.fieldOrigin||null,foregroundRefinement:refinement,targetMode,sourceHashes:{},rows:[],limitations:['Synthetic oracle and reviewed annotation bounds isolate the foreground task; they are not deployable inputs or learned results.',
  'checkedPair measures the derived mask and geometry. materialReview checks sparse original-photo observations separately; these observations never enter reconstruction and do not certify unsampled details.',
  'Real-photo corner annotations are approximate and are not used as ground truth.', 'Successful outline checks against a predicted silhouette are not independent physical evidence. Review against RGB and latent synthetic geometry is still required.']};
for(const file of [materialSampleFile,'scripts/inverse/photo-material-samples.mjs','scripts/inverse/learning/foreground-replay.mjs','scripts/inverse/learning/foreground-crop.mjs','scripts/inverse/learning/foreground-refine.mjs','scripts/inverse/learning/photo-labels.mjs','scripts/inverse/hard-photo-target.mjs','scripts/inverse/export-renderer.mjs',...(await fs.readdir('static/inverse',{recursive:true})).filter(p=>/^(core|locator)\/.+\.js$/.test(p)).map(p=>`static/inverse/${p}`)])report.sourceHashes[file]=hash(await fs.readFile(file));
const save=()=>fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
async function checked(asset,root=null){
  const file=root?path.resolve(root,asset.path):path.resolve(asset.path);
  if(root&&!file.startsWith(path.resolve(root)+path.sep))throw new Error('Asset escapes probe.');
  const b=await fs.readFile(file);if(hash(b)!==asset.sha256)throw new Error('Changed source asset.');return b;
}
async function decode(bytes){
  const image=await loadImage(bytes),canvas=createCanvas(image.width,image.height),ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);
  return{type:'pixels',imageWidth:image.width,imageHeight:image.height,rgba:ctx.getImageData(0,0,image.width,image.height).data,canvas};
}
function png(values,n,channels=1){
  const canvas=createCanvas(n,n),ctx=canvas.getContext('2d'),rgba=ctx.createImageData(n,n);
  for(let i=0;i<n*n;i++)rgba.data.set(channels===1?[255*values[i],255*values[i],255*values[i],255]:[...values.slice(3*i,3*i+3),255],4*i);
  ctx.putImageData(rgba,0,0);return canvas.toBuffer('image/png');
}
function score(mask,target,valid){
  let count=0,wrong=0;for(let i=0;i<mask.length;i++)if(valid[i]){count++;wrong+=mask[i]!==target[i];}
  if(!count)return null;
  return{mismatchFraction:Math.min(wrong,count-wrong)/count,inverted:wrong>count/2,observedPixels:count,observedFraction:count/mask.length};
}
function prediction(buffer,n){if(buffer.length!==n*n*4)throw new Error('Invalid float prediction dimensions.');const values=new Float32Array(n*n);for(let i=0;i<values.length;i++)values[i]=buffer.readFloatLE(4*i);return values;}

await save();
for(const input of inputs){
  const source=await decode(await checked({path:input.file,sha256:input.photoSha256}));
  if(source.imageWidth!==input.dimensions[0]||source.imageHeight!==input.dimensions[1])throw new Error('Changed source dimensions.');
  const observation=input.group==='real'?materialSamples.cases.find(row=>row.id===input.caseId):null;
  if(observation&&(observation.source.sha256!==input.photoSha256||observation.source.width!==source.imageWidth||observation.source.height!==source.imageHeight||observation.source.decodedPixelsSha256&&observation.source.decodedPixelsSha256!==hash(source.rgba)))throw new Error('Material observations do not match the source photograph.');
  for(const method of methods.filter(m=>m!=='oracle'||input.group!=='real')){
    const row={id:input.id,caseId:input.caseId,group:input.group,method,assets:{}},folder=path.join(output,`${row.id}-${method}`);report.rows.push(row);await fs.mkdir(folder);
    if(observation)row.materialReview={crop:reviewMaterialSamples(observation)};
    const store=async(name,bytes)=>{await fs.writeFile(path.join(folder,name),bytes);row.assets[name]={path:`${row.id}-${method}/${name}`,sha256:hash(bytes)};};
    try{
      const started=performance.now(),detected=method==='production'?detectHeartCrops(source,{roi:input.roi||undefined}):await detectForegroundCrop(source,{roi:input.roi||undefined,
        probability:prediction(await checked(input.assets[method==='oracle'?'oracle.f32':'probability.f32'],probe),manifest.resolution),resolution:manifest.resolution,window:input.window,
        refineFields:method==='learned'?refinements[refinement]:undefined});
      row.cropSeconds=(performance.now()-started)/1000;row.inferenceSeconds=['learned','annotation'].includes(method)?input.inferenceSeconds:0;
      if(method==='annotation')for(const candidate of detected.candidates)candidate.provenance={method:'Reviewed body foreground bound plus unchanged locator geometry and support gates; diagnostic only',humanReviewed:false,fieldOrigin:manifest.fieldOrigin};
      row.cropStatus=detected.status;await store('detection.json',JSON.stringify(detected,null,2));
      const selected=detected.candidates[0];row.cropEvidence=cropEvidence(selected,{width:source.imageWidth,height:source.imageHeight});
      const roi=input.roi||[0,0,source.imageWidth,source.imageHeight],scale=Math.min(384/(roi[2]-roi[0]),384/(roi[3]-roi[1]));
      const canvas=createCanvas(Math.round((roi[2]-roi[0])*scale),Math.round((roi[3]-roi[1])*scale)),ctx=canvas.getContext('2d');
      ctx.drawImage(source.canvas,...roi.slice(0,2),roi[2]-roi[0],roi[3]-roi[1],0,0,canvas.width,canvas.height);
      if(selected){ctx.strokeStyle='#00ff70';ctx.lineWidth=2;ctx.beginPath();selected.quad.forEach(([x,y],i)=>{x=(x-roi[0])*scale;y=(y-roi[1])*scale;if(i)ctx.lineTo(x,y);else ctx.moveTo(x,y);});ctx.closePath();ctx.stroke();}
      await store('source.png',canvas.toBuffer('image/png'));
      if(!selected){row.status='crop-unresolved';continue;}
      row.selectedCrop=selected;row.status='crop-proposed';
      if(observation)row.materialReview.crop=reviewMaterialSamples(observation,{quad:selected.quad});
      let labels;
      if(input.labels){
        labels=JSON.parse(await checked(input.labels));
        // Notch/tip have fixed identities; sheet reflection can exchange sides.
        const orders=[[0,1,2,3],[0,3,2,1]],errors=orders.map(order=>selected.quad.map((p,i)=>Math.hypot(p[0]-labels.actualQuad[order[i]][0],p[1]-labels.actualQuad[order[i]][1])));
        row.cornerErrorsPixels=errors.sort((a,b)=>Math.max(...a)-Math.max(...b))[0];
      }
      const ready=performance.now(),prepared=prepare({...source,quad:selected.quad,cropProvenance:selected.provenance},report.configuration),n=prepared.preview.resolution;
      const target=hardPhotoTarget(prepared,targetMode,report.configuration);
      row.preparedMaskSha256=hash(Buffer.from(prepared.preview.mask));
      row.targetMaskSha256=hash(Buffer.from(target.sourceImage.mask));
      row.prepareSeconds=(performance.now()-ready)/1000;await store('crop.png',png(prepared.preview.rgb,n,3));await store('mask.png',png(prepared.preview.mask,n));
      if(observation)row.materialReview.classified=reviewMaterialSamples(observation,{mask:prepared.preview.mask,resolution:n,quad:selected.quad});
      let reference;
      if(input.labels){
        const canonical=await decode(await checked(input.canonical));
        reference=labelsForCrop(labels,selected.quad,{width:canonical.imageWidth,height:canonical.imageHeight,data:canonical.rgba},n,source.imageWidth,source.imageHeight);
        row.classifiedReference=score(prepared.preview.mask,reference.target,reference.valid);await store('latent-mask.png',png(reference.target,n));await store('latent-valid.png',png(reference.valid,n));
      }
      if(solveIds.has(input.id)||solveIds.has(input.caseId)||solveIds.has('all')||solveIds.has('synthetic')&&input.group!=='real'){
        const start=performance.now(),result=await design(target,report.configuration);row.solveSeconds=(performance.now()-start)/1000;row.report=result.report;
        const cuts=result.files['cut_geometry.json'];if(!cuts)throw new Error('No exported cutting pair.');await store('cut_geometry.json',cuts);
        const render=await renderExportedWeave(cuts,n);await store('woven.png',render.png);
        row.independentImageError=render.mask.reduce((sum,v,i)=>sum+Number(v!==prepared.preview.mask[i]),0)/render.mask.length;
        row.independentFeatures=auditFeatureFidelity(target.sourceImage,render.mask,result.report.settings);
        row.checkedPair=result.report.templateChecksPassed&&row.independentFeatures.passed&&row.independentImageError<=.03;
        row.status=row.checkedPair?'checked-pair':'review-required';
        if(observation)row.materialReview.exported=reviewMaterialSamples(observation,{mask:render.mask,resolution:n,quad:selected.quad,phase:row.materialReview.classified.phase});
        if(reference)row.exportedReference=score(render.mask,reference.target,reference.valid);
      }
    }catch(error){row.status='failed';row.error=error.message;row.report=error.report;}
    finally{await save();console.log(row.id,method,row.status,row.cornerErrorsPixels?.map(v=>v.toFixed(1)),row.independentImageError);}
  }
}
report.status='complete';await save();
