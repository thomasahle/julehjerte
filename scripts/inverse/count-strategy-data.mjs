/** Freeze classification/crops once, before any strategy is evaluated. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {gzipSync,gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {createCanvas,loadImage} from 'canvas';
import {prepare} from '../../static/inverse/core/engine.js';
import {AUTOMATIC_PRESET} from '../../static/inverse/core/presets.js';
import {detectHeartCrops} from '../../static/inverse/core/crop.js';
import {Cubic} from '../../static/inverse/core/bezier.js';
import {motifFixture} from './motif-fixture.mjs';

export const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export const benchmarkSettings={...AUTOMATIC_PRESET,timeLimit:10,trials:0,earlyStop:false};
const json=async p=>JSON.parse(await fs.readFile(p));
const images=new Map();
async function photo(file){
  if(images.has(file))return images.get(file);
  const bytes=await fs.readFile(file),im=await loadImage(bytes),c=createCanvas(im.width,im.height),ctx=c.getContext('2d');ctx.drawImage(im,0,0);
  const v={type:'pixels',imageWidth:im.width,imageHeight:im.height,rgba:ctx.getImageData(0,0,im.width,im.height).data,sourceSha256:hash(bytes)};images.set(file,v);return v;
}
function serialTarget(target){
  const s=target.sourceImage,b=target.boundarySeed;
  return{width:target.width,phase:target.phase,metadata:target.metadata,curves:[],sourceImage:{resolution:s.resolution,mask:Array.from(s.mask),probability:Array.from(s.probability),probabilityType:s.probability.constructor.name,...(s.validMask?{validMask:Array.from(s.validMask)}:{})},boundarySeed:b?{width:b.width,phase:b.phase,metadata:b.metadata,curves:b.curves.map(c=>c.p)}:null};
}
export async function readCase(root,entry){
  const bytes=await fs.readFile(path.join(root,entry.file));if(hash(bytes)!==entry.preparedSha256)throw new Error('Prepared input checksum differs');
  const t=JSON.parse(gunzipSync(bytes)),s=t.sourceImage;
  s.mask=Uint8Array.from(s.mask);s.probability=({Float32Array,Float64Array}[s.probabilityType]).from(s.probability);delete s.probabilityType;
  if(s.validMask)s.validMask=Uint8Array.from(s.validMask);
  if(t.boundarySeed){t.boundarySeed.curves=t.boundarySeed.curves.map(p=>new Cubic(p));t.boundarySeed.sourceImage=s;}
  return t;
}
export async function prepareCorpus(root){
  await fs.mkdir(root,{recursive:true});const ledger={settings:benchmarkSettings,method:'Fixed source pixels, crop and classification shared by every policy. Crop proposals and colour estimates are not ground truth. No published templates enter fitting.',cases:[],excluded:[]};
  const add=async(id,group,input,info={})=>{
    try{
      const p=prepare(input,benchmarkSettings),serialized=serialTarget(p.target),bytes=gzipSync(JSON.stringify(serialized)),file=id+'.json.gz';
      await fs.writeFile(path.join(root,file),bytes);ledger.cases.push({id,group,file,sourceSha256:input.sourceSha256,quad:input.quad,resolution:p.preview.resolution,preparedSha256:hash(bytes),...info});
    }catch(e){ledger.excluded.push({id,group,reason:e.message});}
  };
  const frozen=await json('scripts/inverse/fixtures/hunodan/speed-crops.json');
  for(const [i,e] of frozen.cases.entries()){
    const p=await photo(e.source);if(p.sourceSha256!==e.sourceSha256)throw new Error('Hunodan source changed');
    const [x,y,x1,y1]=e.photoROI,c=createCanvas(x1-x,y1-y),ctx=c.getContext('2d'),im=await loadImage(e.source);ctx.drawImage(im,-x,-y);
    const input={type:'pixels',imageWidth:c.width,imageHeight:c.height,rgba:ctx.getImageData(0,0,c.width,c.height).data,quad:e.quad,sourceSha256:p.sourceSha256};
    if(hash(input.rgba)!==e.decodedPixelsSha256)throw new Error('Hunodan decoded pixels changed');
    await add(e.id,'hunodan',input,{fullSolve:true});
    // Predeclared subsample, selected by catalogue order rather than outcomes.
    if(i%4===0)await add(e.id+'-shift-x1','perturbation',{...input,quad:e.quad.map(([x,y])=>[x+1,y])},{fullSolve:true,variant:'one-source-pixel crop shift'});
  }
  const web=await json('scripts/inverse/fixtures/web-photos/manifest.json'),saved=await json('docs/inverse/WEB-PHOTOS-BASELINE.json');
  for(const e of web.cases){
    const spec=web.photos.find(p=>p.id===e.photo),prior=saved.preparedCases.find(p=>p.id===e.id),quad=prior?.detection?.quad;
    if(!quad){ledger.excluded.push({id:e.id,group:'web',reason:'No crop proposal in frozen collection baseline'});continue;}
    const input=await photo('scripts/inverse/fixtures/web-photos/'+spec.file);if(input.sourceSha256!==spec.sha256)throw new Error('Web source changed');
    await add(e.id,'web',{...input,quad},{family:spec.family,track:e.track,cropStatus:'needs_review'});
  }
  const collage=await json('scripts/inverse/hard-photo-cases.json'),input=await photo(collage.source.file);
  if(collage.source.rgbaFile)input.rgba=new Uint8ClampedArray(await fs.readFile(collage.source.rgbaFile));
  for(const e of collage.cases){
    if(e.cropStatus!=='visually_reviewed'){ledger.excluded.push({id:e.id,group:'collage',reason:e.cropStatus});continue;}
    // The former hand annotations were disputed. Use the current automatic
    // detector on their rough ROIs, frozen before any strategy is run.
    const detected=detectHeartCrops(input,{roi:e.roi}),c=detected.candidates[0];
    if(!c){ledger.excluded.push({id:e.id,group:'collage',reason:'No automatic crop from rough ROI'});continue;}
    await add('collage-'+e.id,'collage',{...input,quad:c.quad},{cropStatus:detected.status,roi:e.roi});
  }
  for(const e of (await json('scripts/inverse/photo-cases.json')).cases){
    const input=await photo(`tmp/inverse-hard-photos/sources/${e.id}.png`),center=[0,1].map(k=>e.quad.reduce((s,p)=>s+p[k],0)/4),quad=e.quad.map(p=>p.map((v,k)=>center[k]+(v-center[k])*(1-2*(e.cropInsetFraction||0))));
    await add(e.id,'individual',{...input,quad},{cropStatus:'fixed historical crop'});
  }
  for(const e of (await json('scripts/inverse/fixtures/hard-user/manifest.json')).cases){
    const input=await photo('scripts/inverse/fixtures/hard-user/'+e.file),detected=detectHeartCrops(input),c=detected.candidates[0];
    if(c)await add(e.id,'hard-user',{...input,quad:c.quad},{cropStatus:detected.status,fullSolve:true});
    else ledger.excluded.push({id:e.id,group:'hard-user',reason:'No automatic crop'});
  }
  for(const shape of ['hat','house','circle'])await add('motif-'+shape,'synthetic',motifFixture(shape).input,{fullSolve:true});
  // Every fourth case in each harder-photo group is held out for full solves.
  for(const group of ['web','collage','individual'])ledger.cases.filter(e=>e.group===group).forEach((e,i)=>{e.fullSolve=i%4===0;});
  await fs.writeFile(path.join(root,'manifest.json'),JSON.stringify(ledger,null,2));return ledger;
}
