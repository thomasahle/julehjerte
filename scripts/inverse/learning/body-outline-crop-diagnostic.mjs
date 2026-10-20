/** Explain a changed crop-support decision using saved predictions, without refitting templates. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createCanvas,loadImage} from 'canvas';
import {detectForegroundCrop} from './foreground-crop.mjs';
import {foregroundBox} from '../../../static/inverse/locator/fields.js';
import {lowerEdgeLines} from '../../../static/inverse/locator/locator.js';

const args=Object.fromEntries(process.argv.slice(2).map(a=>a.replace(/^--/,'').split('=')));
assert.ok(['control','candidate','id','output'].every(k=>args[k])&&Object.keys(args).every(k=>['control','candidate','id','output'].includes(k)));
const hash=b=>createHash('sha256').update(b).digest('hex');
const read=async p=>JSON.parse(await fs.readFile(p));
const pin=async p=>({path:p,sha256:hash(await fs.readFile(p))});
const checked=async asset=>{const b=await fs.readFile(asset.path);assert.equal(hash(b),asset.sha256);return b;};
const report={schema:'body-outline-crop-diagnostic-1',id:args.id,inputs:{},rows:[],
 scope:'Post hoc diagnostic of the original zero-orientation support decision. Saved model outputs and production lower-edge sampler only. No threshold change, extra template fit or replacement benchmark score.'};
let source;
const sourceFiles=new Set([new URL(import.meta.url).pathname]);
const fields=[];
for(const arm of ['control','candidate']){
 const run=args[arm],pipeline=await read(path.join(run,'report.json'));
 assert.equal(pipeline.status,'complete');
 for(const [file,digest] of Object.entries(pipeline.sourceHashes)){
  if(!file.startsWith('static/inverse/locator/')&&!['scripts/inverse/learning/foreground-crop.mjs','scripts/inverse/learning/continuous-foreground.mjs','scripts/inverse/learning/locator-field-source.mjs'].includes(file))continue;
  assert.equal(hash(await fs.readFile(file)),digest,file);sourceFiles.add(file);
 }
 const row=pipeline.rows.find(r=>r.id===args.id&&r.method==='fallback');assert.ok(row?.selection.neuralAttempted);
 const plan=JSON.parse(await checked(pipeline.plan)),manifest=JSON.parse(await checked(plan.probe));
 assert.equal(plan.protocol.postprocess,undefined,'This diagnostic does not apply extra field refinements.');
 const input=manifest.rows.find(r=>r.id===args.id);assert.ok(input);
 const probabilityAsset=input.assets['probability.f32'];
 const bytes=await checked({...probabilityAsset,path:path.join(path.dirname(plan.probe.path),probabilityAsset.path)});
 assert.equal(bytes.length,manifest.resolution**2*4);
 const probability=Float32Array.from({length:manifest.resolution**2},(_,i)=>bytes.readFloatLE(4*i));
 const photo=await checked({path:input.file,sha256:input.photoSha256});
 const im=await loadImage(photo),canvas=createCanvas(im.width,im.height),ctx=canvas.getContext('2d');ctx.drawImage(im,0,0);
 assert.deepEqual([im.width,im.height],input.dimensions);
 const current={type:'pixels',imageWidth:im.width,imageHeight:im.height,rgba:ctx.getImageData(0,0,im.width,im.height).data};
 if(source)assert.deepEqual(current,source);else source=current;
 let f;
 const replay=await detectForegroundCrop(source,{probability,resolution:manifest.resolution,window:input.window,
  paletteMode:plan.protocol.fieldPalette,refineFields:value=>{f=value;return value;}});
 assert.ok(f);fields.push(f);
 const original=JSON.parse(await checked({...row.selection.learnedDetectionAsset,path:path.join(run,row.selection.learnedDetectionAsset.path)}));
 assert.deepEqual(replay.proposal.quad,original.proposal.quad);
 assert.deepEqual(replay.proposal.evidence.lowerEdgeSupport,original.proposal.evidence.lowerEdgeSupport);
 const box=foregroundBox(f);assert.equal(box.status,'ok');
 const lines=lowerEdgeLines(f,box.box);assert.ok(lines);
 // This fixture must use the unrotated proposal; otherwise these samples do not explain its support.
 assert.deepEqual([lines.left.support,lines.right.support],original.proposal.evidence.lowerEdgeSupport);
 report.inputs[arm]={pipeline:await pin(path.join(run,'report.json')),probe:plan.probe,prediction:probabilityAsset};
 report.rows.push({arm,box:box.box,dimensions:[f.w,f.h],quad:original.proposal.quad??original.proposal.evidence.rejectedQuad,
  cropAccepted:!!original.proposal.quad,lines:{left:lines.left,right:lines.right},segmentationPoints:lines.segmentationPoints,points:lines.points});
}
assert.deepEqual(report.rows[0].dimensions,report.rows[1].dimensions);
const [a,b]=fields,difference=(x,y)=>x.reduce((s,v,i)=>s+Number(v!==y[i]),0);
for(const key of ['r','g','b'])assert.equal(difference(a[key],b[key]),0);
report.maskChangedPixels=difference(a.mask,b.mask);
report.maskPixels=a.mask.length;
report.maximumCornerMovementPixels=Math.max(...report.rows[0].quad.map((p,i)=>Math.hypot(...p.map((v,j)=>v-report.rows[1].quad[i][j]))));
// Exchanging only the mask and its bounding box must exchange line evidence too.
// Palette colours and smooth probability fields do not explain the changed sampler output.
for(const [to,from] of [[0,1],[1,0]]){
 const mixed={...fields[to],mask:fields[from].mask};
 assert.deepEqual(lowerEdgeLines(mixed,foregroundBox(mixed).box),lowerEdgeLines(fields[from],report.rows[from].box));
}
report.maskOnlySwapReproducesOppositeLineEvidence=true;
const originalRight=new Map(report.rows[0].segmentationPoints[1].map(([x,y])=>[y,x]));
const shifts=report.rows[1].segmentationPoints[1].filter(([,y])=>originalRight.has(y)).map(([x,y])=>({y,dx:x-originalRight.get(y)}));
report.rightSampleChanges={sharedRows:shifts.length,changed:shifts.filter(r=>r.dx!==0).length,
 inwardOverTenWorkingPixels:shifts.filter(r=>r.dx < -10).length,maximumInwardWorkingPixels:Math.max(0,...shifts.map(r=>-r.dx)),rows:shifts.filter(r=>r.dx!==0)};
await fs.mkdir(args.output,{recursive:false});
const canvas=createCanvas(a.w*3,a.h+28),ctx=canvas.getContext('2d');
ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.font='15px sans-serif';ctx.fillStyle='black';
ctx.fillText('Photograph',6,20);ctx.fillText('Control: sampled left/right boundary',a.w+6,20);ctx.fillText('Outline loss: sampled left/right boundary',a.w*2+6,20);
for(let k=0;k<3;k++){
 const f=k===0?a:fields[k-1],pixels=ctx.createImageData(a.w,a.h);
 for(let i=0;i<a.mask.length;i++)pixels.data.set(k===0?[255*a.r[i],255*a.g[i],255*a.b[i],255]:[f.mask[i]*255,f.mask[i]*255,f.mask[i]*255,255],4*i);
 ctx.putImageData(pixels,k*a.w,28);
 if(k)for(let side=0;side<2;side++){
  ctx.fillStyle=side?'#e31b23':'#008cff';
  for(const [x,y] of report.rows[k-1].segmentationPoints[side])ctx.fillRect(k*a.w+x-1,28+y-1,3,3);
 }
}
const picture=path.join(args.output,'samples.png');await fs.writeFile(picture,canvas.toBuffer('image/png'));report.illustration=await pin(picture);
report.sourceHashes={};
for(const file of sourceFiles)
 report.sourceHashes[file]=hash(await fs.readFile(file));
await fs.writeFile(path.join(args.output,'report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({maskChangedPixels:report.maskChangedPixels,maximumCornerMovementPixels:report.maximumCornerMovementPixels,
 rightSupport:report.rows.map(r=>r.lines.right.support),maskOnlySwapReproducesOppositeLineEvidence:report.maskOnlySwapReproducesOppositeLineEvidence,rightSampleChanges:{...report.rightSampleChanges,rows:undefined}}));
