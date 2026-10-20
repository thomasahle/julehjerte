/** Fresh, paired full fits for every target that triggered the fixed-work probe.
 * Only a temporary module changes: production sources remain byte-identical.
 */
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
assert.deepEqual(Object.keys(args).sort(),['output','plan']);
const hash=b=>createHash('sha256').update(b).digest('hex'),read=async pin=>{
 const bytes=await fs.readFile(pin.path);assert.equal(hash(bytes),pin.sha256,pin.path);return JSON.parse(bytes);
};
const planBytes=await fs.readFile(args.plan),plan=JSON.parse(planBytes);
assert.equal(plan.schema,'displaced-finalist-replay-plan-1');assert.equal(plan.timeLimit,10);
assert.equal(hash(await fs.readFile(new URL(import.meta.url))),plan.implementationSha256);
const screen=await read(plan.screen),source=await read(screen.input);
assert.equal(screen.status,'complete');assert.equal(source.status,'complete');
const verify=async()=>{for(const [file,sha] of Object.entries(source.sourceHashes))assert.equal(hash(await fs.readFile(file)),sha,file);};
await verify();
const selected=screen.rows.filter(r=>r.extra);assert.ok(selected.length&&selected.length<=32);
assert.deepEqual(selected.map(r=>[r.id,r.method]),plan.targets);
const disk=await fs.statfs('.');assert.ok(disk.bavail*disk.bsize>10*1024**3);
await fs.mkdir(args.output,{recursive:false});
// Keep the current source and all its imports intact. Replace exactly one
// anchor in a temporary copy; rewrite relative imports to the pinned originals.
// The proposal runs inside the same deadline and retains every old finalist.
const baseFile=path.resolve('static/inverse/core/direct/fit.js'),base=await fs.readFile(baseFile,'utf8');
const anchor='  const poorGrid=coarse[0].error>2*cfg.maxImageError&&fine.every(r=>r.error>cfg.maxImageError);';
assert.equal(base.split(anchor).length,2);
const addition=`  if(!weights&&!symmetryRequested&&sourceFeatures.length&&coarse[0].error>2*cfg.maxImageError&&fine.every(r=>r.error>cfg.maxImageError)&&!fine.some(retainsGridColours)){
    const displaced=coarse.slice(0,3).find(seed=>!finalists.includes(seed));
    if(displaced){
      const record={counts:displaced.model.counts,phase:displaced.phase,attempted:false};displacedProbeRecords.push(record);
      if(deadline-performance.now()>1700){
        const fitted=stage('directFitting',()=>fitSeed(displaced));
        record.attempted=true;record.error=fitted.error;record.coloursRetained=retainsGridColours(fitted);record.shapesRetained=retainsGridFeature(fitted);
        finalists.push(displaced);remainingSeeds.splice(remainingSeeds.indexOf(displaced),1);fine.push(fitted);
        fine.sort((a,b)=>a.error+.005*(a.model.counts[0]+a.model.counts[1])-b.error-.005*(b.model.counts[0]+b.model.counts[1]));
      }
    }
  }
`;
const modified=base.replace(anchor,addition+anchor).replace(/\bfrom '(\.[^']+)'/g,(_,specifier)=>`from '${new URL(specifier,pathToFileURL(baseFile)).href}'`)
 +'\nexport const displacedProbeRecords=[];\n';
const moduleFile=path.resolve(args.output,'fit-displaced-probe.mjs');await fs.writeFile(moduleFile,modified,{flag:'wx'});
const candidate=await import(pathToFileURL(moduleFile).href);
const report={schema:'material-pair-pipeline-1',status:'running',methods:['baseline','candidate'],
 configuration:{...source.configuration,algorithm:'direct',timeLimit:10,trials:0},
 plan:{path:args.plan,sha256:hash(planBytes)},sourceHashes:source.sourceHashes,
 experimentalModule:{path:moduleFile,sha256:hash(modified),originalSha256:hash(base)},
 implementationSha256:plan.implementationSha256,
 scope:'Every target that triggers the declared extra-finalist screen, including unhelpful probes. Fresh baseline and proposal, rotating order, unchanged masks and ten-second search limits. No production edits, oracle count restriction, per-photo policy or artwork ground truth.',rows:[]};
const save=()=>fs.writeFile(path.join(args.output,'report.json'),JSON.stringify(report,null,2)+'\n');
await save();
try{
 for(const [index,selection] of selected.entries()){
  const original=source.rows.find(r=>r.id===selection.id&&r.method===selection.method);assert.ok(original);
  assert.equal(original.observedPixels,original.resolution**2);
  const id=original.id+'-'+original.method;
  for(const method of index%2?['candidate','baseline']:['baseline','candidate']){
   const directory=path.join(args.output,id+'-'+method);await fs.mkdir(directory);
   const row={id,method,source:original.source,sourceSha256:original.sourceSha256,resolution:original.resolution,
    observedPixels:original.observedPixels,targetMaskSha256:original.targetMaskSha256,selectedCrop:original.selectedCrop,
    originalTarget:{id:original.id,method:original.method},assets:{}};
   report.rows.push(row);
   for(const name of ['crop.png','mask.png']){
    const a=original.assets[name],f=path.resolve(path.dirname(screen.input.path),a.path);assert.ok(f.startsWith(path.resolve(path.dirname(screen.input.path))+path.sep));
    assert.equal(hash(await fs.readFile(f)),a.sha256);const target=path.join(directory,name);await fs.link(f,target);
    row.assets[name]={path:path.relative(args.output,target),sha256:a.sha256};
   }
   const image=await loadImage(path.join(directory,'mask.png')),canvas=createCanvas(image.width,image.height),ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);
   assert.equal(image.width,row.resolution);assert.equal(image.height,row.resolution);
   const pixels=ctx.getImageData(0,0,image.width,image.height).data;
   const mask=Uint8Array.from({length:row.resolution**2},(_,i)=>Number(pixels[4*i]>pixels[4*i+1]+20));assert.equal(hash(mask),row.targetMaskSha256);
   const target=prepare({type:'mask',mask,resolution:row.resolution},{...report.configuration,invert:false,removeSpecks:0,fillHoles:0}).target;
   assert.equal(hash(target.sourceImage.mask),row.targetMaskSha256);
   const cfg=settings(report.configuration),store=async(name,bytes)=>{
    const file=path.join(directory,name);await fs.writeFile(file,bytes);row.assets[name]={path:path.relative(args.output,file),sha256:hash(bytes)};
   };
   candidate.displacedProbeRecords.length=0;
   const start=performance.now();
   try{
    const solution=await (method==='candidate'?candidate.fitDirect:fitDirect)(target,cfg);
    const answer=finish(solution,cfg,()=>{},{deadline:start+10000});row.solveSeconds=(performance.now()-start)/1000;row.report=answer.report;
    row.displacedProbe=structuredClone(candidate.displacedProbeRecords);
    for(const name of ['cut_geometry.json','template_left.svg','template_right.svg'])await store(name,answer.files[name]);
    const woven=await renderExportedWeave(answer.files['cut_geometry.json'],row.resolution);await store('woven.png',woven.png);
    row.independentImage=referenceError(target.sourceImage,woven.mask);
    row.independentFeatures=auditFeatureFidelity(target.sourceImage,woven.mask,answer.report.settings);
    row.checkedPair=answer.report.templateChecksPassed&&row.independentFeatures.passed&&row.independentImage.mismatchFraction<=.03;
    row.status=row.checkedPair?'checked-derived-mask':'review-required';
   }catch(error){row.status='failed';row.error=String(error.stack||error);row.solveSeconds=(performance.now()-start)/1000;}
   await save();console.log(JSON.stringify({id,method,status:row.status,extra:row.displacedProbe,error:row.independentImage?.mismatchFraction,seconds:row.solveSeconds}));
  }
 }
 await verify();report.status='complete';await save();
}catch(error){report.status='failed';report.error=String(error.stack||error);await save();throw error;}
