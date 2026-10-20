/** Fit every new diagnostic crop, frozen before viewing reconstruction scores. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createCanvas,loadImage} from 'canvas';
import {prepare,design} from '../../../static/inverse/core/engine.js';
import {AUTOMATIC_PRESET} from '../../../static/inverse/core/presets.js';
import {referenceError} from '../../../static/inverse/core/image-reference.js';
import {auditFeatureFidelity} from '../../../static/inverse/core/feature-shapes.js';
import {hardPhotoTarget} from '../hard-photo-target.mjs';
import {renderExportedWeave} from '../export-renderer.mjs';
import {supportedBodyOutline} from './projective-body.mjs';

const args=Object.fromEntries(process.argv.slice(2).map(a=>a.replace(/^--/,'').split('=')));
assert.deepEqual(Object.keys(args).sort(),['output','plan']);
const hash=b=>createHash('sha256').update(b).digest('hex');
const checked=async p=>{const b=await fs.readFile(p.path);assert.equal(hash(b),p.sha256,p.path);return b;};
const planBytes=await fs.readFile(args.plan),plan=JSON.parse(planBytes);assert.equal(plan.schema,'fixed-outline-reconstruction-1');
for(const [file,sha256] of Object.entries(plan.sourcePins))await checked({path:file,sha256});
const outline=JSON.parse(await checked(plan.outline)),probe=JSON.parse(await checked(plan.probe)),baseline=JSON.parse(await checked(plan.baseline));
assert.equal(outline.status,'complete');assert.equal(probe.status,'complete');assert.equal(baseline.status,'complete');
assert.deepEqual(probe.rows.map(r=>r.id),plan.cohortIds);
const proposed=outline.rows.filter(r=>{
 const d=r.previous.bodyReview,current=d.selected==='learned'?d.learnedBody:d.productionBody;
 return r.geometricProposal&&!current.passed;
});
assert.deepEqual(proposed.map(r=>r.id),plan.freshIds,'No selection based on fitting results');
const configuration={...AUTOMATIC_PRESET,timeLimit:10,trials:0};
assert.deepEqual(configuration,baseline.configuration);
// Crop/locator code may change between studies. These immutable cuts depend
// on target preparation, fitting and rendering; verify those implementations.
for(const [file,sha256] of Object.entries(baseline.sourceHashes))
 if(/^static\/inverse\/(core|vendor)\//.test(file)||['scripts/inverse/hard-photo-target.mjs','scripts/inverse/export-renderer.mjs'].includes(file))
  await checked({path:file,sha256});
const report={schema:'material-pair-pipeline-1',status:'running',configuration,methods:['outline-only'],targetMode:'rgb',
 plan:{path:args.plan,sha256:hash(planBytes)},probeManifestSha256:plan.probe.sha256,sourceHashes:plan.sourcePins,rows:[],
 baselineReference:plan.baseline,cohortIds:plan.cohortIds,unchangedIds:plan.cohortIds.filter(id=>!plan.freshIds.includes(id)),scope:plan.scope};
await fs.mkdir(args.output,{recursive:false});
const save=()=>fs.writeFile(path.join(args.output,'report.json'),JSON.stringify(report,null,2)+'\n');
function png(values,n,rgb=false){
 const c=createCanvas(n,n),ctx=c.getContext('2d'),pixels=ctx.createImageData(n,n);
 for(let i=0;i<n*n;i++)pixels.data.set(rgb?[values[3*i],values[3*i+1],values[3*i+2],255]:values[i]?[185,19,19,255]:[255,255,255,255],i*4);
 ctx.putImageData(pixels,0,0);return c.toBuffer('image/png');
}
let retainedBytes=0;
try{
 for(const proposal of proposed){
  const input=probe.rows.find(r=>r.id===proposal.id);assert.ok(input);
  const im=await loadImage(await checked({path:input.file,sha256:input.photoSha256}));
  assert.deepEqual([im.width,im.height],input.dimensions);
  const canvas=createCanvas(im.width,im.height),ctx=canvas.getContext('2d');ctx.drawImage(im,0,0);
  const rgba=ctx.getImageData(0,0,im.width,im.height).data,rgb=Buffer.alloc(im.width*im.height*3);
  for(let i=0;i<im.width*im.height;i++)for(let k=0;k<3;k++)rgb[3*i+k]=rgba[4*i+k];assert.equal(hash(rgb),input.decodedRGBSha256);
  const detection=proposal.detection,crop=structuredClone(detection.candidates[0]);
  assert.ok(crop&&supportedBodyOutline(detection.proposal)&&proposal.bodyEvidence.passed);
  assert.ok(proposal.coverage.observedFraction>=.99&&proposal.coverage.maximumExtrapolation<=.05);
  const row={id:input.id,method:'outline-only',targetMode:'rgb',source:input.file,sourceSha256:input.photoSha256,assets:{},
   selectedCrop:crop,cropStatus:detection.status,supported:true,
   cropEvidenceKind:'physical-body-outline; paper-colour coherence is unmeasured',bodyEvidence:proposal.bodyEvidence,coverage:proposal.coverage};
  report.rows.push(row);const folder=path.join(args.output,input.id+'-outline-only');await fs.mkdir(folder);
  const store=async(name,data)=>{
   retainedBytes+=Buffer.byteLength(data);assert.ok(retainedBytes<=plan.artifactBudgetMiB*1024**2);
   await fs.writeFile(path.join(folder,name),data);row.assets[name]={path:path.relative(args.output,path.join(folder,name)),sha256:hash(data)};
  };
  try{
   await store('detection.json',JSON.stringify(detection,null,2)+'\n');
   const imported=prepare({type:'pixels',rgba,imageWidth:im.width,imageHeight:im.height,quad:crop.quad,cropProvenance:crop.provenance},configuration);
   const {preview}=imported,n=preview.resolution,target=hardPhotoTarget(imported,'mask',configuration);
   row.resolution=n;row.targetMaskSha256=hash(preview.mask);row.observedPixels=preview.validMask?.reduce((s,v)=>s+v,0)??n*n;
   await store('crop.png',png(preview.rgb,n,true));await store('mask.png',png(preview.mask,n));
   if(preview.validMask)await store('observed.bin',preview.validMask);
   const started=performance.now(),answer=await design(target,configuration);row.solveSeconds=(performance.now()-started)/1000;row.report=answer.report;
   for(const name of ['cut_geometry.json','template_left.svg','template_right.svg','weave_preview.svg']){assert.ok(answer.files[name]);await store(name,answer.files[name]);}
   const rendered=await renderExportedWeave(answer.files['cut_geometry.json'],n);await store('woven.png',rendered.png);
   row.independentImage=referenceError(target.sourceImage,rendered.mask);row.independentFeatures=auditFeatureFidelity(target.sourceImage,rendered.mask,answer.report.settings);
   row.checkedPair=answer.report.templateChecksPassed&&row.independentFeatures.passed&&row.independentImage.mismatchFraction<=.03;
   row.status=row.checkedPair?'checked-derived-mask':'review-required';
  }catch(error){row.status='failed';row.error=error.message;if(error.report)row.report=error.report;}
  assert.deepEqual(row.selectedCrop,proposal.detection.candidates[0],'Fitting cannot alter the preselected crop');
  await save();console.log(row.id,row.status,row.independentImage?.mismatchFraction,row.report?.manufacturing?.status);
 }
 assert.deepEqual(report.rows.map(r=>r.id),plan.freshIds);
 for(const [file,sha256] of Object.entries(plan.sourcePins))await checked({path:file,sha256});
 report.status='complete';report.retainedAssetBytes=retainedBytes;await save();
}catch(error){report.status='failed';report.error=error.message;await save();throw error;}
