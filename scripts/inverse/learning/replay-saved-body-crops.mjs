/** Recheck default crop decisions after offline-adapter changes; no template refits. */
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createCanvas,loadImage} from 'canvas';
import {detectForegroundCrop} from './foreground-crop.mjs';

const args=Object.fromEntries(process.argv.slice(2).map(s=>s.replace(/^--/,'').split('=')));
assert.ok(args.run&&args.output&&Object.keys(args).every(k=>['run','output'].includes(k)));
const hash=b=>createHash('sha256').update(b).digest('hex');
const read=async p=>JSON.parse(await fs.readFile(p));
const checked=async asset=>{const bytes=await fs.readFile(asset.path);assert.equal(hash(bytes),asset.sha256,asset.path);return bytes;};
const run=await read(path.join(args.run,'report.json')),plan=JSON.parse(await checked(run.plan));
assert.equal(run.status,'complete');assert.equal(plan.protocol.postprocess,undefined);assert.equal(plan.protocol.outerBoundarySampling,undefined);
const probe=JSON.parse(await checked(plan.probe));
const report={schema:'saved-body-crop-replay-1',pipeline:{path:path.join(args.run,'report.json'),sha256:hash(await fs.readFile(path.join(args.run,'report.json')))},
 status:'running',rows:[],sourceHashes:{},scope:'Default neural crop decisions only. Production rows and template fits are not executed again.'};
for(const file of [new URL(import.meta.url).pathname,'scripts/inverse/learning/foreground-crop.mjs','scripts/inverse/learning/locator-field-source.mjs','scripts/inverse/learning/continuous-foreground.mjs',
 ...Object.keys(run.sourceHashes).filter(f=>f.startsWith('static/inverse/locator/'))]){
 const digest=hash(await fs.readFile(file));report.sourceHashes[file]=digest;
 if(file.startsWith('static/inverse/locator/'))assert.equal(digest,run.sourceHashes[file]);
}
await fs.mkdir(args.output,{recursive:false});
const save=()=>fs.writeFile(path.join(args.output,'report.json'),JSON.stringify(report,null,2)+'\n');
await save();
try{
 for(const row of run.rows.filter(r=>r.method==='fallback')){
  if(!row.selection.neuralAttempted){report.rows.push({id:row.id,neuralAttempted:false});continue;}
  const input=probe.rows.find(r=>r.id===row.id);assert.ok(input);
  const bytes=await checked({...input.assets['probability.f32'],path:path.join(path.dirname(plan.probe.path),input.assets['probability.f32'].path)});
  assert.equal(bytes.length,probe.resolution**2*4);
  const probability=Float32Array.from({length:probe.resolution**2},(_,i)=>bytes.readFloatLE(4*i));
  const image=await loadImage(await checked({path:input.file,sha256:input.photoSha256}));
  assert.deepEqual([image.width,image.height],input.dimensions);
  const canvas=createCanvas(image.width,image.height),ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);
  const source={type:'pixels',rgba:ctx.getImageData(0,0,image.width,image.height).data,imageWidth:image.width,imageHeight:image.height};
  const previous=JSON.parse(await checked({...row.selection.learnedDetectionAsset,path:path.join(args.run,row.selection.learnedDetectionAsset.path)}));
  const current=await detectForegroundCrop(source,{probability,resolution:probe.resolution,window:input.window,paletteMode:plan.protocol.fieldPalette});
  assert.equal(current.status,previous.status,row.id);
  assert.deepEqual(current.candidates.map(c=>c.quad),previous.candidates.map(c=>c.quad),row.id);
  assert.deepEqual(current.proposal.evidence,previous.proposal.evidence,row.id);
  report.rows.push({id:row.id,neuralAttempted:true,sameStatus:true,sameCorners:true,sameEvidence:true});await save();
 }
 report.status='complete';report.neuralReplays=report.rows.filter(r=>r.neuralAttempted).length;report.passed=true;
}catch(error){report.status='failed';report.error=error.message;throw error;}
finally{await save();}
console.log(JSON.stringify({rows:report.rows.length,neuralReplays:report.neuralReplays,passed:report.passed}));
