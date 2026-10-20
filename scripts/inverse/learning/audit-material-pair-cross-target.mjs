/** Score saved candidates against every paired target without another search. */
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createCanvas,loadImage} from 'canvas';
import {auditFeatureFidelity} from '../../../static/inverse/core/feature-shapes.js';
import {referenceError} from '../../../static/inverse/core/image-reference.js';

const args=Object.fromEntries(process.argv.slice(2).map(s=>s.replace(/^--/,'').split('=')));
assert.ok(args.run&&args.output&&Object.keys(args).every(k=>['run','output'].includes(k)));
const root=path.resolve(args.run),hash=b=>createHash('sha256').update(b).digest('hex');
const raw=await fs.readFile(path.join(root,'report.json')),run=JSON.parse(raw);
assert.equal(run.status,'complete');assert.ok(['mask','native'].includes(run.targetMode));
for(const [file,sha] of Object.entries(run.sourceHashes))assert.equal(hash(await fs.readFile(file)),sha,file);
async function asset(row,name){
 const ref=row.assets[name],file=path.resolve(root,ref.path);
 assert.ok(file.startsWith(root+path.sep));
 const bytes=await fs.readFile(file);assert.equal(hash(bytes),ref.sha256);return bytes;
}
async function mask(row,name){
 const image=await loadImage(await asset(row,name));
 assert.equal(image.width,row.resolution);assert.equal(image.height,row.resolution);
 const canvas=createCanvas(image.width,image.height),ctx=canvas.getContext('2d');
 ctx.drawImage(image,0,0);const rgba=ctx.getImageData(0,0,image.width,image.height).data;
 return Uint8Array.from({length:image.width**2},(_,i)=>Number(rgba[4*i+1]<128));
}
const rows=[];
for(const id of new Set(run.rows.map(r=>r.id))){
 const group=run.methods.map(m=>run.rows.find(r=>r.id===id&&r.method===m));
 assert.ok(group.every(Boolean));
 if(!group[0].selectedCrop){
  assert.ok(group.every(r=>r.status==='crop-unresolved'));
  rows.push({id,status:'crop-unresolved'});continue;
 }
 const targets=new Map(),woven=new Map();
 for(const row of group){
  assert.deepEqual(row.selectedCrop,group[0].selectedCrop);
  assert.equal(row.resolution,group[0].resolution);
  assert.equal(row.assets['crop.png'].sha256,group[0].assets['crop.png'].sha256);
  assert.equal(row.assets['observed.bin']?.sha256,group[0].assets['observed.bin']?.sha256);
  const pixels=await mask(row,'mask.png');assert.equal(hash(pixels),row.targetMaskSha256);
  const validMask=row.assets['observed.bin']?new Uint8Array(await asset(row,'observed.bin')):undefined;
  targets.set(row.method,{resolution:row.resolution,mask:pixels,validMask,
   ...(validMask?{weights:Float64Array.from(validMask)}:{})});
  if(row.assets['woven.png'])woven.set(row.method,await mask(row,'woven.png'));
 }
 const comparisons=[];
 for(const source of group)for(const target of group){
  const render=woven.get(source.method);if(!render)continue;
  const image=referenceError(targets.get(target.method),render);
  const features=auditFeatureFidelity(targets.get(target.method),render,target.report.settings);
  if(source===target){
   assert.equal(image.mismatchFraction,source.independentImage.mismatchFraction);
   assert.equal(features.passed,source.independentFeatures.passed);
   assert.deepEqual(features.missing,source.independentFeatures.missing);
  }
  const physical=source.report.validation.passed&&source.report.manufacturing.status==='pass';
  comparisons.push({
   candidate:source.method,target:target.method,error:image.mismatchFraction,
   featuresPassed:features.passed,missingFeatures:features.missing.length,
   engineGeometryAndPaperPassed:physical,
   passesImageFeatureAndEnginePhysicalChecks:physical&&features.passed&&image.mismatchFraction<=.03,
  });
 }
 rows.push({id,status:'complete',comparisons});
}
const report={
 schema:'material-pair-cross-target-1',status:'complete',
 run:{path:path.join(root,'report.json'),sha256:hash(raw)},
 source:{path:new URL(import.meta.url).pathname,sha256:hash(await fs.readFile(new URL(import.meta.url)))},
 scope:'All paired targets, fixed crops and observed pixels. No fitting or phase exchange. Self scores and feature reports replay exactly. Cross scores distinguish an available candidate from the one found by each timed search; engine geometry/paper checks are inherited from the candidate. Editable export is audited separately. No original-artwork accuracy claim.',
 rows,
};
await fs.writeFile(args.output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({cases:rows.length,comparisons:rows.reduce((n,r)=>n+(r.comparisons?.length??0),0)}));
