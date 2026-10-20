/** Fresh paired fits of every mask variant of each screen-affected photo. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {createCanvas,loadImage} from 'canvas';
import {prepare,finish} from '../../../static/inverse/core/engine.js';
import {settings} from '../../../static/inverse/core/settings.js';
import {fitDirect} from '../../../static/inverse/core/direct/fit.js';
import {referenceError} from '../../../static/inverse/core/image-reference.js';
import {auditFeatureFidelity} from '../../../static/inverse/core/feature-shapes.js';
import {renderExportedWeave} from '../export-renderer.mjs';

const args=Object.fromEntries(process.argv.slice(2).map(s=>s.replace(/^--/,'').split('=')));
assert.deepEqual(Object.keys(args).sort(),['output','screen']);
const hash=b=>createHash('sha256').update(b).digest('hex'),read=async ref=>{
 const bytes=await fs.readFile(ref.path);assert.equal(hash(bytes),ref.sha256,ref.path);return JSON.parse(bytes);
};
const raw=await fs.readFile(args.screen),screen=JSON.parse(raw);
assert.equal(screen.schema,'feature-priority-screen-1');assert.equal(screen.status,'complete');
const plan=await read(screen.plan);
assert.equal(plan.schema,'feature-priority-plan-1');
assert.equal(hash(await fs.readFile(new URL('./screen-feature-priority.mjs',import.meta.url))),screen.implementationSha256);
const sourceRuns=new Map();
for(const ref of plan.runs)sourceRuns.set(ref.path,await read(ref));
const verify=async()=>{
 for(const run of sourceRuns.values())for(const [file,sha] of Object.entries(run.sourceHashes))
  assert.equal(hash(await fs.readFile(file)),sha,file);
 const disk=await fs.statfs('.');assert.ok(disk.bavail*disk.bsize>plan.resources.minimumFreeGiB*1024**3);
};
await verify();
const affected=new Set(screen.rows.filter(r=>r.guardTriggered).map(r=>r.reference.id));
const selected=screen.rows.filter(r=>affected.has(r.reference.id));assert.ok(selected.length);
await fs.mkdir(args.output,{recursive:false});
const inputDir=path.join(args.output,'inputs');await fs.mkdir(inputDir);
const baseFile=path.resolve('static/inverse/core/direct/fit.js'),base=await fs.readFile(baseFile,'utf8');
const anchor='    fine.sort((a,b)=>Number(retained.get(b))-Number(retained.get(a)));';
assert.equal(base.split(anchor).length,2);
const addition=`
    if(!retained.get(originalFirst)&&retained.get(fine[0])&&fine[0].error>originalFirst.error){
      preferenceProbeRecords.push({retained:originalFirst.model.counts.slice(),retainedError:originalFirst.error,
        deferred:fine[0].model.counts.slice(),deferredError:fine[0].error});
      fine.splice(fine.indexOf(originalFirst),1);fine.unshift(originalFirst);
    }`;
const modified=base.replace(anchor,anchor+addition).replace(/\bfrom '(\.[^']+)'/g,(_,specifier)=>
 `from '${new URL(specifier,pathToFileURL(baseFile)).href}'`)+'\nexport const preferenceProbeRecords=[];\n';
const moduleFile=path.resolve(args.output,'fit-feature-priority.mjs');await fs.writeFile(moduleFile,modified,{flag:'wx'});
const candidate=await import(pathToFileURL(moduleFile).href);
const inputs={methods:['baseline','candidate'],rows:[]},targets=[];
for(const selection of selected){
 const source=sourceRuns.get(selection.reference.run.path);
 const original=source.rows.find(r=>r.id===selection.reference.id&&r.method===selection.reference.method);assert.ok(original);
 assert.equal(original.targetMaskSha256,selection.maskSha256);
 assert.equal(original.observedPixels,original.resolution**2);
 const id=original.id+'-'+original.targetMaskSha256.slice(0,12);
 const files={};
 for(const name of ['crop.png','mask.png']){
  const asset=original.assets[name],file=path.resolve(path.dirname(selection.reference.run.path),asset.path);
  assert.ok(file.startsWith(path.resolve(path.dirname(selection.reference.run.path))+path.sep));
  assert.equal(hash(await fs.readFile(file)),asset.sha256);files[name]={file,asset};
 }
 const image=await loadImage(files['mask.png'].file),canvas=createCanvas(image.width,image.height),ctx=canvas.getContext('2d');
 assert.equal(image.width,original.resolution);assert.equal(image.height,original.resolution);ctx.drawImage(image,0,0);
 const rgba=ctx.getImageData(0,0,image.width,image.height).data;
 const mask=Uint8Array.from({length:original.resolution**2},(_,i)=>Number(rgba[4*i]>rgba[4*i+1]+20));
 assert.equal(hash(mask),original.targetMaskSha256);
 const maskName=id+'.mask';await fs.writeFile(path.join(inputDir,maskName),mask,{flag:'wx'});
 const asset={path:maskName,sha256:hash(mask)};
 inputs.rows.push({id,file:original.source,photoSha256:original.sourceSha256,assets:{
  baseline:{mask:asset},candidate:{mask:asset}}});
 targets.push({id,original,files,mask,selection});
}
const inputRaw=JSON.stringify(inputs,null,2)+'\n';await fs.writeFile(path.join(inputDir,'manifest.json'),inputRaw);
const sourceHashes=sourceRuns.values().next().value.sourceHashes;
const report={schema:'material-pair-pipeline-1',status:'running',methods:inputs.methods,targetMode:'mask',
 configuration:{...screen.configuration,algorithm:'direct',timeLimit:10,trials:0},sourceHashes,
 probeManifestSha256:hash(inputRaw),screen:{path:args.screen,sha256:hash(raw)},
 experimentalModule:{path:moduleFile,sha256:hash(modified),originalSha256:hash(base)},
 implementationSha256:hash(await fs.readFile(new URL(import.meta.url))),affectedPhotoIds:[...affected],
 scope:'All distinct mask variants of every affected photo in the declared screen, including variants that do not trigger. Fresh paired fits with alternating order and identical ten-second allowances. No altered crops/targets, per-photo policy or production edits. Retain failures and independently render exports; derived-mask agreement is not artwork ground truth.',
 rows:[]};
const save=()=>fs.writeFile(path.join(args.output,'report.json'),JSON.stringify(report,null,2)+'\n');
await save();
const began=performance.now();
try{
 for(const [index,{id,original,files,mask,selection}] of targets.entries()){
  for(const method of index%2?['candidate','baseline']:['baseline','candidate']){
   await verify();assert.ok(performance.now()-began<plan.resources.maximumWallSeconds*1000);
   const directory=path.join(args.output,id+'-'+method);await fs.mkdir(directory);
   const row={id,method,source:original.source,sourceSha256:original.sourceSha256,resolution:original.resolution,
    observedPixels:original.observedPixels,targetMaskSha256:original.targetMaskSha256,selectedCrop:original.selectedCrop,
    originalTarget:selection.reference,assets:{}};report.rows.push(row);
   for(const [name,{file,asset}] of Object.entries(files)){
    const destination=path.join(directory,name);await fs.link(file,destination);
    row.assets[name]={path:path.relative(args.output,destination),sha256:asset.sha256};
   }
   const target=prepare({type:'mask',mask,resolution:row.resolution},
    {...report.configuration,invert:false,removeSpecks:0,fillHoles:0}).target;
   assert.equal(hash(target.sourceImage.mask),row.targetMaskSha256);
   const cfg=settings(report.configuration),store=async(name,bytes)=>{
    const file=path.join(directory,name);await fs.writeFile(file,bytes);
    row.assets[name]={path:path.relative(args.output,file),sha256:hash(bytes)};
   };
   candidate.preferenceProbeRecords.length=0;
   const start=performance.now();
   try{
    const solution=await (method==='candidate'?candidate.fitDirect:fitDirect)(target,cfg);
    const answer=finish(solution,cfg,()=>{},{deadline:start+10000});
    row.solveSeconds=(performance.now()-start)/1000;row.report=answer.report;
    row.preferenceGuard=structuredClone(candidate.preferenceProbeRecords);
    for(const name of ['cut_geometry.json','template_left.svg','template_right.svg'])await store(name,answer.files[name]);
    const woven=await renderExportedWeave(answer.files['cut_geometry.json'],row.resolution);await store('woven.png',woven.png);
    row.independentImage=referenceError(target.sourceImage,woven.mask);
    row.independentFeatures=auditFeatureFidelity(target.sourceImage,woven.mask,answer.report.settings);
    row.checkedPair=answer.report.templateChecksPassed&&row.independentFeatures.passed&&row.independentImage.mismatchFraction<=.03;
    row.status=row.checkedPair?'checked-derived-mask':'review-required';
   }catch(error){row.status='failed';row.error=String(error.stack||error);row.solveSeconds=(performance.now()-start)/1000;}
   await save();console.log(JSON.stringify({id,method,status:row.status,guard:row.preferenceGuard,error:row.independentImage?.mismatchFraction}));
  }
 }
 await verify();report.status='complete';report.summary={};
 for(const method of inputs.methods){
  const rows=report.rows.filter(r=>r.method===method);
  report.summary[method]={attempted:rows.length,checkedPairs:rows.filter(r=>r.checkedPair).length,
   guardTriggered:rows.filter(r=>r.preferenceGuard?.length).length};
 }
 await save();
}catch(error){report.status='failed';report.error=String(error.stack||error);await save();throw error;}
