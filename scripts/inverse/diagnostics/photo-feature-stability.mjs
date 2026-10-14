/** Track classified regions in photograph coordinates across small input changes.
 * No crop is selected by solver error and no feature acceptance rule is changed.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createCanvas,loadImage} from 'canvas';
import {prepare} from '../../../static/inverse/core/engine.js';
import {imageFeatures} from '../../../static/inverse/core/image-features.js';
import {connectedComponent} from '../../../static/inverse/core/input.js';
import {homography,project} from '../../../static/inverse/locator/math.js';
import {readHardPhoto} from '../hard-photo-data.mjs';

const args=Object.fromEntries(process.argv.slice(2).map(s=>s.replace(/^--/,'').split('=')));
if(!args.run||!args.ids||!args.output)throw new Error('Use --run=<saved photo benchmark> --ids=<case,...> --output=<new directory>');
const hash=b=>createHash('sha256').update(b).digest('hex'),read=async p=>JSON.parse(await fs.readFile(p));
const baseline=await read(path.join(args.run,'results.json')),ids=args.ids.split(',');
const square=[[0,0],[1,0],[1,1],[0,1]],report={
 scope:'Photo classification only. Fixed production corners, translated by at most one original source pixel; JPEG and half-resolution variants keep the same physical quadrilateral. Reference region pixels are mapped through the photograph into each new crop. No solver, target editing, changed feature thresholds or newly accepted templates.',
 run:args.run,rows:[],sourceHashes:{},
};
for(const file of ['scripts/inverse/diagnostics/photo-feature-stability.mjs','static/inverse/core/input.js','static/inverse/core/image-features.js','static/inverse/locator/math.js'])report.sourceHashes[file]=hash(await fs.readFile(file));
await fs.mkdir(path.dirname(args.output),{recursive:true});await fs.mkdir(args.output);
const sources=new Map();
for(const id of ids){
 const entry=baseline.results.find(r=>r.id===id);assert.ok(entry?.effectiveQuad,'Saved crop required: '+id);
 const run=entry.runs.find(r=>r.preset==='automatic');assert.ok(run);
 if(!sources.has(entry.file))sources.set(entry.file,await readHardPhoto(entry));
 const photo=sources.get(entry.file),settings={...run.settings,...run.report.settings},quad=entry.effectiveQuad;
 assert.equal(photo.fileSha256,entry.input.fileSha256);assert.equal(photo.rgbaSha256,entry.input.rgbaSha256);
 const initial=prepare({...photo,quad},settings).target.sourceImage,n=initial.resolution;assert.equal(hash(initial.mask),run.maskSha256);
 assert.ok(Number.isInteger(n)&&n>=32);
 const features=imageFeatures(initial,settings.width),toPhoto=homography(square,quad);
 const physical=features.map(f=>f.pixels.map(p=>project(toPhoto,[(p%n+.5)/n,(Math.floor(p/n)+.5)/n])));
 const row={id,photoSha256:photo.fileSha256,decodedPixelsSha256:photo.rgbaSha256,quad,maskSha256:run.maskSha256,features:features.map(({pixels,...f})=>({...f,pixels:pixels.length})),variants:[]};report.rows.push(row);
 const variants=[];
 for(const dy of [-1,0,1])for(const dx of [-1,0,1])variants.push({name:!dx&&!dy?'original':`translate-${dx}-${dy}`,dx,dy});
 variants.push({name:'jpeg-75',jpeg:.75},{name:'half-resolution',scale:.5},{name:'mixture-classification',mode:'red-white-mixture'});
 for(const variant of variants){
  let input=photo,scale=variant.scale||1;
  if(variant.jpeg||scale!==1){
   const canvas=createCanvas(Math.round(photo.imageWidth*scale),Math.round(photo.imageHeight*scale)),ctx=canvas.getContext('2d');ctx.drawImage(photo.canvas,0,0,canvas.width,canvas.height);
   if(variant.jpeg)ctx.drawImage(await loadImage(canvas.toBuffer('image/jpeg',{quality:variant.jpeg})),0,0);
   input={...photo,imageWidth:canvas.width,imageHeight:canvas.height,rgba:ctx.getImageData(0,0,canvas.width,canvas.height).data};
  }
  const shifted=quad.map(([x,y])=>[(x+(variant.dx||0))*scale,(y+(variant.dy||0))*scale]);
  const prepared=prepare({...input,quad:shifted},{...settings,...(variant.mode?{mode:variant.mode}:{})});
  const source=prepared.target.sourceImage,fromPhoto=homography(shifted,square),labels=new Int32Array(n*n),parts=[null];
  const protectedRegions=imageFeatures(source,settings.width);
  const observations=features.map((f,index)=>{
   let outside=0,retained=0;const overlaps=new Map();
   for(const p of physical[index]){
    const q=project(fromPhoto,p.map(v=>v*scale)),x=Math.floor(q[0]*n),y=Math.floor(q[1]*n);
    if(x<0||y<0||x>=n||y>=n){outside++;continue;}
    const pixel=y*n+x;if(source.mask[pixel]!==f.value)continue;
    retained++;
    if(!labels[pixel]){const label=parts.length;parts.push(connectedComponent(source.mask,n,pixel,labels,label));}
    const label=labels[pixel];overlaps.set(label,(overlaps.get(label)||0)+1);
   }
   const match=[...overlaps].sort((a,b)=>b[1]-a[1])[0],part=match&&parts[match[0]];
   const protectedPart=part&&protectedRegions.find(r=>r.pixels.some(p=>labels[p]===match[0]));
   return{reference:index,outsideCropFraction:outside/f.pixels.length,colorRetention:retained/f.pixels.length,dominantComponentRetention:(match?.[1]||0)/f.pixels.length,touchesBorder:part?.border??null,componentAreaMm2:(part?.pixels.length||0)*(settings.width/n)**2,protected:!!protectedPart};
  });
  row.variants.push({name:variant.name,quad:shifted,inputPixelsSha256:hash(input.rgba),maskSha256:hash(source.mask),featureCount:protectedRegions.length,observations});
  const canvas=createCanvas(n,n),ctx=canvas.getContext('2d'),pixels=ctx.createImageData(n,n);
  for(let i=0;i<source.mask.length;i++)pixels.data.set(source.mask[i]?[185,19,19,255]:[255,255,255,255],4*i);
  ctx.putImageData(pixels,0,0);await fs.writeFile(path.join(args.output,id+'-'+variant.name+'.png'),canvas.toBuffer('image/png'));
  console.log(JSON.stringify({id,variant:variant.name,observations}));
  await fs.writeFile(path.join(args.output,'results.json'),JSON.stringify(report,null,2)+'\n');
 }
}
assert.equal(report.rows.length,ids.length);
