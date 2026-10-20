/** A fixed one-percent intervention on every newly fitted outline proposal.
 * Compare both exported weaves in the SAME original photographic coordinates.
 * The baseline is reused, so this is not a timing or repeated-search benchmark.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createCanvas,loadImage} from 'canvas';
import {prepare,design} from '../../../static/inverse/core/engine.js';
import {insetCropQuad} from '../../../static/inverse/core/crop-inset.js';
import {homography,project} from '../../../static/inverse/locator/math.js';
import {referenceError} from '../../../static/inverse/core/image-reference.js';
import {auditFeatureFidelity} from '../../../static/inverse/core/feature-shapes.js';
import {hardPhotoTarget} from '../hard-photo-target.mjs';
import {renderExportedWeave} from '../export-renderer.mjs';

const args=Object.fromEntries(process.argv.slice(2).map(a=>a.replace(/^--/,'').split('=')));
assert.deepEqual(Object.keys(args).sort(),['output','plan']);
const hash=b=>createHash('sha256').update(b).digest('hex');
const checked=async p=>{const b=await fs.readFile(p.path);assert.equal(hash(b),p.sha256,p.path);return b;};
const planBytes=await fs.readFile(args.plan),plan=JSON.parse(planBytes);
assert.equal(plan.schema,'fixed-outline-inset-comparison-1');
assert.equal(plan.inset,.01);assert.equal(plan.commonInteriorMargin,.03);
for(const [file,sha256] of Object.entries(plan.sourcePins))await checked({path:file,sha256});
const baseline=JSON.parse(await checked(plan.baseline));
assert.equal(baseline.status,'complete');
assert.deepEqual(baseline.rows.map(r=>r.id),plan.ids);
assert.equal(baseline.configuration.timeLimit,10);
assert.equal(baseline.configuration.trials,0);
// No concurrent change to target preparation, the solver or export checks.
for(const [file,sha256] of Object.entries(baseline.sourceHashes))await checked({path:file,sha256});
const report={schema:'fixed-outline-inset-comparison-1',status:'running',
 plan:{path:args.plan,sha256:hash(planBytes)},configuration:baseline.configuration,
 scope:plan.scope,rows:[],retainedAssetBytes:0};
await fs.mkdir(args.output,{recursive:false});
const save=()=>fs.writeFile(path.join(args.output,'report.json'),JSON.stringify(report,null,2)+'\n');
const square=[[0,0],[1,0],[1,1],[0,1]],panelSize=240,panels=[];

function bitmap(values,n,rgb=false){
 const canvas=createCanvas(n,n),ctx=canvas.getContext('2d'),image=ctx.createImageData(n,n);
 for(let i=0;i<n*n;i++)image.data.set(rgb?[values[3*i],values[3*i+1],values[3*i+2],255]:
  values[i]?[185,19,19,255]:[255,255,255,255],4*i);
 ctx.putImageData(image,0,0);return canvas;
}

// Evaluate in the original crop's pixel grid; candidate resolution may differ.
function commonInterior(reference,physicalQuad,candidateQuad,fine){
 const source=homography(square,physicalQuad),inverse=homography(candidateQuad,square);
 let errors=0,pixels=0;const n=reference.resolution,m=plan.comparisonResolution;
 assert.equal(fine.mask.length,m*m);
 for(let y=0;y<n;y++)for(let x=0;x<n;x++){
  const u=(x+.5)/n,v=(y+.5)/n,i=y*n+x;
  if(Math.min(u,v,1-u,1-v)<plan.commonInteriorMargin||reference.validMask&&!reference.validMask[i])continue;
  const [cu,cv]=project(inverse,project(source,[u,v])),xx=Math.floor(cu*m),yy=Math.floor(cv*m);
  assert.ok(xx>=0&&xx<m&&yy>=0&&yy<m);
  pixels++;errors+=fine.mask[yy*m+xx]!==reference.mask[i];
 }
 assert.ok(pixels>0);
 return{pixels,errors,fraction:errors/pixels};
}

try{
 for(const original of baseline.rows){
  const photo=await loadImage(await checked({path:original.source,sha256:original.sourceSha256}));
  const canvas=createCanvas(photo.width,photo.height),ctx=canvas.getContext('2d');ctx.drawImage(photo,0,0);
  const input={type:'pixels',rgba:ctx.getImageData(0,0,photo.width,photo.height).data,imageWidth:photo.width,imageHeight:photo.height};
  const physical=original.selectedCrop.quad,quad=insetCropQuad(physical,plan.inset);
  const before=prepare({...input,quad:physical},baseline.configuration);
  assert.equal(hash(before.preview.mask),original.targetMaskSha256,'Reuse exactly the original target');
  const oldGeometry=original.assets['cut_geometry.json'];
  const oldBytes=await checked({path:path.join(path.dirname(plan.baseline.path),oldGeometry.path),sha256:oldGeometry.sha256});
  const oldFine=await renderExportedWeave(oldBytes.toString('utf8'),plan.comparisonResolution);
  const pre=prepare({...input,quad},baseline.configuration),target=hardPhotoTarget(pre,'mask',baseline.configuration),n=pre.preview.resolution;
  const row={id:original.id,physicalQuad:physical,insetQuad:quad,sourceSha256:original.sourceSha256,
   originalResolution:before.preview.resolution,insetResolution:n,originalMaskSha256:original.targetMaskSha256,
   insetMaskSha256:hash(pre.preview.mask),originalGeometrySha256:oldGeometry.sha256,
   baseline:{checkedPair:original.checkedPair,ownMaskError:original.independentImage.mismatchFraction,
    missingFeatures:original.independentFeatures.missing.length,
    commonInterior:commonInterior(before.preview,physical,physical,oldFine)},assets:{}};
  report.rows.push(row);await save();
  const folder=path.join(args.output,original.id);await fs.mkdir(folder);
  const store=async(name,data)=>{
   report.retainedAssetBytes+=Buffer.byteLength(data);
   assert.ok(report.retainedAssetBytes<=plan.artifactBudgetMiB*1024**2);
   await fs.writeFile(path.join(folder,name),data);
   row.assets[name]={path:path.relative(args.output,path.join(folder,name)),sha256:hash(data)};
  };
  const started=performance.now();
  try{
   const answer=await design(target,baseline.configuration),seconds=(performance.now()-started)/1000;
   const rendered=await renderExportedWeave(answer.files['cut_geometry.json'],n);
   const fine=await renderExportedWeave(answer.files['cut_geometry.json'],plan.comparisonResolution);
   const image=referenceError(target.sourceImage,rendered.mask),features=auditFeatureFidelity(target.sourceImage,rendered.mask,answer.report.settings);
   row.inset={seconds,templateChecksPassed:answer.report.templateChecksPassed,
    geometryPassed:answer.report.validation.passed,paperStatus:answer.report.manufacturing.status,
    ownMaskError:image.mismatchFraction,missingFeatures:features.missing.length,
    checkedPair:answer.report.templateChecksPassed&&features.passed&&image.mismatchFraction<=.03,
    commonInterior:commonInterior(before.preview,physical,quad,fine)};
   assert.equal(row.inset.commonInterior.pixels,row.baseline.commonInterior.pixels);
   row.commonInteriorChange=row.inset.commonInterior.fraction-row.baseline.commonInterior.fraction;
   row.status='fitted';
   for(const name of ['cut_geometry.json','template_left.svg','template_right.svg','weave_preview.svg'])
    await store(name,answer.files[name]);
   await store('report.json',JSON.stringify(answer.report,null,2)+'\n');
   await store('crop.png',bitmap(pre.preview.rgb,n,true).toBuffer('image/png'));
   await store('mask.png',bitmap(pre.preview.mask,n).toBuffer('image/png'));
   await store('woven.png',rendered.png);
   const oldWoven=original.assets['woven.png'];
   panels.push({id:original.id,arms:[
    {label:'Original',photo:bitmap(before.preview.rgb,before.preview.resolution,true),mask:bitmap(before.preview.mask,before.preview.resolution),
     weave:await loadImage(await checked({path:path.join(path.dirname(plan.baseline.path),oldWoven.path),sha256:oldWoven.sha256}))},
    {label:'1% inset',photo:bitmap(pre.preview.rgb,n,true),mask:bitmap(pre.preview.mask,n),weave:await loadImage(rendered.png)}
   ]});
  }catch(error){row.status='failed';row.error=error.message;}
  await save();console.log(row.id,row.status,'common-interior change',row.commonInteriorChange,'checked',row.inset?.checkedPair);
 }
 for(let i=0;i<panels.length;i++){
  const panel=panels[i],canvas=createCanvas(panelSize*3,2*(panelSize+44)),ctx=canvas.getContext('2d');
  ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.font='14px sans-serif';
  for(const [j,arm] of panel.arms.entries())for(const [k,name] of ['photo','mask','weave'].entries()){
   ctx.fillStyle='#222';ctx.fillText(`${arm.label}: ${name}`,k*panelSize+8,j*(panelSize+44)+19);
   ctx.drawImage(arm[name],k*panelSize,j*(panelSize+44)+35,panelSize,panelSize);
  }
  const file=`comparison-${i+1}.png`,bytes=canvas.toBuffer('image/png');report.retainedAssetBytes+=bytes.length;
  assert.ok(report.retainedAssetBytes<=plan.artifactBudgetMiB*1024**2);
  await fs.writeFile(path.join(args.output,file),bytes);
  report.rows.find(r=>r.id===panel.id).comparison={path:file,sha256:hash(bytes)};
 }
 for(const [file,sha256] of Object.entries(plan.sourcePins))await checked({path:file,sha256});
 for(const [file,sha256] of Object.entries(baseline.sourceHashes))await checked({path:file,sha256});
 report.status='complete';await save();
}catch(error){report.status='failed';report.error=error.message;await save();throw error;}
