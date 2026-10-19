/** Paired full-pipeline inset audit. No reference templates enter fitting.
 * Use --output=<new directory> [--ids=hjfig-01,stacked-heart-fringe] [--seconds=10].
 * One serial worker; compact metrics and only the reported fringe's images.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {getPriority} from 'node:os';
import {createCanvas,loadImage} from 'canvas';
import {readHardPhoto,hardPhotoCatalogCases} from '../hard-photo-data.mjs';
import {hardPhotoTarget} from '../hard-photo-target.mjs';
import {detectHeartCrops,pixelCentresToEdges} from '../../../static/inverse/core/crop.js';
import {insetCropQuad} from '../../../static/inverse/core/crop-inset.js';
import {prepare,design} from '../../../static/inverse/core/engine.js';
import {AUTOMATIC_PRESET} from '../../../static/inverse/core/presets.js';
import {homography,project} from '../../../static/inverse/locator/math.js';
import {renderExportedWeave} from '../export-renderer.mjs';
import {referenceError} from '../../../static/inverse/core/image-reference.js';

const args=Object.fromEntries(process.argv.slice(2).map(a=>a.replace(/^--/,'').split('=')));
assert.ok(args.output,'Use --output=<new directory>');
const seconds=Number(args.seconds||10);assert.ok(Number.isFinite(seconds)&&seconds>=1&&seconds<=60);
const sha=x=>createHash('sha256').update(x).digest('hex'),cfg={...AUTOMATIC_PRESET,timeLimit:seconds,trials:0};
const files=['scripts/inverse/fixtures/hunodan/speed-crops.json','scripts/inverse/fixtures/user-photos-2026-10-17/stacked.json','scripts/inverse/fixtures/user-photos-2026-10-17/window.json'];
const catalogues=await Promise.all(files.map(async f=>JSON.parse(await fs.readFile(f))));
const cases=[...catalogues[0].cases,...catalogues.slice(1).flatMap(hardPhotoCatalogCases)];
const selected=cases.filter(c=>!args.ids||args.ids.split(',').includes(c.id));assert.ok(selected.length);
const pins=new Map();
async function pin(file){pins.set(file,sha(await fs.readFile(file)));}
for(const file of [...files,'scripts/inverse/diagnostics/automatic-crop-inset.mjs','scripts/inverse/hard-photo-target.mjs','scripts/inverse/hard-photo-data.mjs','scripts/inverse/export-renderer.mjs'])await pin(file);
for(const root of ['static/inverse/core','static/inverse/locator'])for(const f of await fs.readdir(root,{recursive:true})){
  const file=path.join(root,f);if((await fs.stat(file)).isFile())await pin(file);
}
for(const e of selected)await pin(e.source||e.file);
await fs.mkdir(path.dirname(args.output),{recursive:true});await fs.mkdir(args.output);
const report={status:'running',configuration:cfg,runtime:process.version,priority:getPriority(),sourceHashes:Object.fromEntries(pins),
  scope:'Automatic physical corners fixed before solving. Compare no inset with 1% per side, alternating order. The import dialog supplies a binary mask to fitting. Common error maps independent exports into the unchanged original photograph interior, excluding 3% on each side; it is not ground truth. Different own-target errors are not directly comparable. Timings exclude detection and external rendering. No model training or reference templates.',cases:[]};
const save=()=>fs.writeFile(path.join(args.output,'results.json'),JSON.stringify(report,null,2)+'\n');await save();
const square=[[0,0],[1,0],[1,1],[0,1]],images=[];
async function read(e){
  if(!e.source)return readHardPhoto(e);
  const bytes=await fs.readFile(e.source);assert.equal(sha(bytes),e.sourceSha256);
  const im=await loadImage(bytes),[x,y,x1,y1]=e.photoROI,c=createCanvas(x1-x,y1-y),ctx=c.getContext('2d');ctx.drawImage(im,-x,-y);
  const rgba=ctx.getImageData(0,0,c.width,c.height).data;assert.equal(sha(rgba),e.decodedPixelsSha256);
  return{type:'pixels',imageWidth:c.width,imageHeight:c.height,rgba};
}
function bitmap(data,n,rgb=false){
  const canvas=createCanvas(n,n),ctx=canvas.getContext('2d'),im=ctx.createImageData(n,n);
  for(let i=0;i<n*n;i++)im.data.set([...(rgb?data.slice(3*i,3*i+3):data[i]?[185,19,19]:[255,255,255]),255],4*i);
  ctx.putImageData(im,0,0);return canvas;
}
try{
for(const [index,e]of selected.entries()){
  const input=await read(e),whole=[0,0,input.imageWidth,input.imageHeight],roi=e.roi?.every((v,i)=>v===whole[i])?undefined:e.roi;
  const start=performance.now(),detection=detectHeartCrops(input,{roi}),candidate=detection.candidates[0];
  const row={id:e.id,cropSeconds:(performance.now()-start)/1000,cropStatus:detection.status,arms:[]};report.cases.push(row);
  if(!candidate){row.failure='no_crop';console.log(JSON.stringify(row));await save();continue;}
  const physical=pixelCentresToEdges(candidate.locator.quad),H=homography(square,physical);
  row.physicalQuad=physical;row.insetQuad=insetCropQuad(physical);
  const baseline=prepare({...input,quad:physical},cfg).target.sourceImage;
  for(const fraction of index%2?[.01,0]:[0,.01]){
    const quad=insetCropQuad(physical,fraction),pre=prepare({...input,quad},cfg),target=hardPhotoTarget(pre,'mask',cfg),n=pre.preview.resolution;
    const arm={fraction,quad,maskSha256:sha(pre.preview.mask)};row.arms.push(arm);await save();const begin=performance.now();
    try{
      const answer=await design(target,cfg);arm.seconds=(performance.now()-begin)/1000;
      Object.assign(arm,{passed:answer.report.templateChecksPassed,geometry:answer.report.validation.passed,paper:answer.report.manufacturing.status,slits:answer.report.slits,missingFeatures:answer.report.imageFidelity.features.missing.length});
      const rendered=await renderExportedWeave(answer.files['cut_geometry.json'],n);
      arm.ownTargetError=referenceError(target.sourceImage,rendered.mask).mismatchFraction;
      const fine=await renderExportedWeave(answer.files['cut_geometry.json'],1600),inverse=homography(quad,square);
      let errors=0,count=0;
      for(let y=0;y<n;y++)for(let x=0;x<n;x++){
        const u=(x+.5)/n,v=(y+.5)/n;if(Math.min(u,v,1-u,1-v)<.03||baseline.validMask&&!baseline.validMask[y*n+x])continue;
        const uv=project(inverse,project(H,[u,v])),xx=Math.floor(uv[0]*1600),yy=Math.floor(uv[1]*1600);
        assert.ok(xx>=0&&xx<1600&&yy>=0&&yy<1600);
        errors+=fine.mask[yy*1600+xx]!==baseline.mask[y*n+x];count++;
      }
      assert.ok(count>0);arm.commonInterior={pixels:count,errors,fraction:errors/count};
      if(e.id==='stacked-heart-fringe'){
        images.push({fraction,photo:bitmap(pre.preview.rgb,n,true),mask:bitmap(pre.preview.mask,n),woven:await loadImage(rendered.png)});
        await fs.writeFile(path.join(args.output,`fringe-${fraction}-geometry.json`),answer.files['cut_geometry.json']);
      }
    }catch(error){arm.failure=error.message;arm.seconds=(performance.now()-begin)/1000;}
    console.log(JSON.stringify({id:e.id,...arm}));await save();
  }
}
if(images.length){
  images.sort((a,b)=>a.fraction-b.fraction);const c=createCanvas(780,images.length*292),ctx=c.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);
  for(const [i,row]of images.entries())for(const [j,key]of ['photo','mask','woven'].entries()){
    ctx.fillStyle='#222';ctx.font='16px sans-serif';ctx.fillText(`${row.fraction?'1% inset':'Physical edge'} — ${key}`,j*260+8,i*292+24);ctx.drawImage(row[key],j*260,i*292+32,260,260);
  }
  await fs.writeFile(path.join(args.output,'fringe-comparison.png'),c.toBuffer('image/png'));
}
for(const [file,digest]of pins)assert.equal(sha(await fs.readFile(file)),digest,`Changed during experiment: ${file}`);
report.status='complete';await save();
}catch(error){report.status='failed';report.failure=error.message;await save();throw error;}
