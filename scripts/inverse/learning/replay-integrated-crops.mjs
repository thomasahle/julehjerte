/** Compare the shared application crop path with saved actual-browser fields. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createCanvas,loadImage} from 'canvas';
import {detectPhotoCrops} from '../../../static/inverse/neural/photo-crop.js';
import {detectForegroundCrop} from '../../../static/inverse/neural/foreground-crop.js';
const args=Object.fromEntries(process.argv.slice(2).map(a=>a.replace(/^--/,'').split('=')));
assert.deepEqual(Object.keys(args).sort(),['output','reports']);
const hash=b=>createHash('sha256').update(b).digest('hex');
const pinned=async p=>{const b=await fs.readFile(p.path);assert.equal(hash(b),p.sha256,p.path);return b;};
const result={schema:'integrated-crop-replay-1',status:'running',rows:[],reports:[],sourceHashes:{},scope:'Shared application crop policy with cached production controls and actual browser NN fields; no refitting or source-image copies. Actual model loading and UI behavior require separate browser QA.'};
for(const name of ['locator/locator.js','neural/photo-crop.js','neural/crop-selection.js','neural/foreground-crop.js','neural/foreground-fields.js','neural/continuous-foreground.js','neural/outer-boundary-fields.js','neural/runtime.js']){
 const file='static/inverse/'+name;result.sourceHashes[file]=hash(await fs.readFile(file));
}
const save=()=>fs.writeFile(args.output,JSON.stringify(result,null,2)+'\n');
try{
 for(const file of args.reports.split(',')){
  const bytes=await fs.readFile(file),report=JSON.parse(bytes);assert.equal(report.status,'complete');result.reports.push({path:file,sha256:hash(bytes)});
  const plan=JSON.parse(await pinned(report.plan)),manifest=JSON.parse(await pinned(plan.probe));
  for(const row of manifest.rows){
   const original=report.rows.find(r=>r.id===row.id&&r.method==='production'),expected=report.rows.find(r=>r.id===row.id&&r.method==='fallback');
   const photo=await pinned({path:row.file,sha256:row.photoSha256}),image=await loadImage(photo),canvas=createCanvas(image.width,image.height),ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);
   assert.deepEqual([image.width,image.height],row.dimensions);const rgba=ctx.getImageData(0,0,image.width,image.height).data;
   const rgb=Buffer.alloc(image.width*image.height*3);for(let i=0;i<image.width*image.height;i++)for(let c=0;c<3;c++)rgb[i*3+c]=rgba[i*4+c];assert.equal(hash(rgb),row.decodedRGBSha256);
   const asset=row.assets['probability.f32'],data=await pinned({path:path.join(path.dirname(plan.probe.path),asset.path),sha256:asset.sha256});
   const body={probability:Float32Array.from({length:data.length/4},(_,i)=>data.readFloatLE(i*4)),resolution:manifest.resolution,window:row.window,modelSha256:manifest.fieldOrigin.modelSha256};
   const detector=original.assets['detection.json'],production=JSON.parse(await pinned({path:path.join(path.dirname(file),detector.path),sha256:detector.sha256}));
   let learned=null;
   const actual=await detectPhotoCrops({type:'pixels',rgba,imageWidth:image.width,imageHeight:image.height},{productionCrop:()=>production,predictBody:()=>body,
    learnedCrop:async(...args)=>{learned=await detectForegroundCrop(...args);return learned;}});
   const quad=actual.candidates[0]?.quad??null;assert.deepEqual(quad,expected.selectedCrop?.quad??null,row.id);
   const decision=actual.bodyReview;assert.ok(!decision||decision.selected===expected.selection.selected,row.id);
   if(decision?.selected==='learned')assert.equal(actual.candidates[0].needsReview,true);
   if(actual.candidates.length&&decision?.requiresReview)assert.equal(actual.candidates[0].needsReview,true);
   // Retain failed learned proposals as well as the selected crop. A null
   // candidate alone cannot distinguish segmentation, colour and outline
   // failures. Reuse the same fields and gates; never fit a new template here.
   result.rows.push({id:row.id,cropExact:true,selected:decision?.selected??'production',status:actual.status,needsReview:actual.candidates[0]?.needsReview??null,explicitSelectionPreserved:!decision,
    decision,learned});
   await save();console.log(row.id,'crop exact',decision?.selected??'selection preserved');
  }
 }
 for(const [f,h] of Object.entries(result.sourceHashes))assert.equal(hash(await fs.readFile(f)),h,f);
 result.status='complete';result.passed=true;await save();
}catch(error){result.status='failed';result.error=error.message;await save();throw error;}
