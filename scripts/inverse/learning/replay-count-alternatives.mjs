/** Diagnostic only: can retained count alternatives improve the same mask?
 * Every arm initializes every count. Restricted arms then retain a specified
 * pair, so these are oracle comparisons, not an automatic selection policy.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createCanvas,loadImage} from 'canvas';
import {prepare,finish} from '../../../static/inverse/core/engine.js';
import {settings} from '../../../static/inverse/core/settings.js';
import {fitDirect} from '../../../static/inverse/core/direct/fit.js';
import {initializeCounts} from '../../../static/inverse/core/direct/counts.js';
import {referenceError} from '../../../static/inverse/core/image-reference.js';
import {auditFeatureFidelity} from '../../../static/inverse/core/feature-shapes.js';
import {renderExportedWeave} from '../export-renderer.mjs';

const args=Object.fromEntries(process.argv.slice(2).map(s=>s.replace(/^--/,'').split('=')));
assert.deepEqual(Object.keys(args).sort(),['output','plan']);
const hash=b=>createHash('sha256').update(b).digest('hex');
const planBytes=await fs.readFile(args.plan),plan=JSON.parse(planBytes),inputs=new Map();
assert.equal(plan.schema,'count-alternative-probe-plan-1');
assert.equal(plan.timeLimit,10);assert.ok(plan.runs.length<=12);
for(const input of plan.inputs){
 const bytes=await fs.readFile(input.report.path);assert.equal(hash(bytes),input.report.sha256);
 const report=JSON.parse(bytes);assert.equal(report.status,'complete');
 for(const [file,sha] of Object.entries(report.sourceHashes))assert.equal(hash(await fs.readFile(file)),sha,file);
 const row=report.rows.find(r=>r.id===input.id&&r.method===input.method);assert.ok(row);
 assert.equal(row.observedPixels,row.resolution**2);
 inputs.set(input.name,{row,report,root:path.dirname(input.report.path)});
}
await fs.mkdir(args.output,{recursive:false});
const report={schema:'material-pair-pipeline-1',status:'running',plan:{path:args.plan,sha256:hash(planBytes)},
 scope:'Inspected development case; count-restricted oracle arms, not an automatic policy or generalization claim. Every arm pays full initialization cost, but restricted arms have fewer fine grids. All original physical and feature gates remain unchanged.',
 sourceHashes:inputs.values().next().value.report.sourceHashes,implementationSha256:hash(await fs.readFile(new URL(import.meta.url))),rows:[]};
const save=()=>fs.writeFile(path.join(args.output,'report.json'),JSON.stringify(report,null,2)+'\n');
for(const [index,run] of plan.runs.entries()){
 const input=inputs.get(run.input);assert.ok(input);
 if(run.counts)assert.ok(run.counts.length===2&&run.counts.every(n=>Number.isInteger(n)&&n>=1&&n<=11));
 const sourceRow=input.row,method=index+'-'+run.input+'-'+(run.counts?run.counts.join('x'):'all');
 const directory=path.join(args.output,sourceRow.id+'-'+method);await fs.mkdir(directory);
 const row={id:sourceRow.id,method,source:sourceRow.source,sourceSha256:sourceRow.sourceSha256,
  targetMaskSha256:sourceRow.targetMaskSha256,resolution:sourceRow.resolution,observedPixels:sourceRow.observedPixels,
  selectedCrop:sourceRow.selectedCrop,selection:{policy:'count-alternative-oracle',input:run.input,counts:run.counts??null},assets:{}};
 report.rows.push(row);
 for(const name of ['crop.png','mask.png']){
  const asset=sourceRow.assets[name],file=path.resolve(input.root,asset.path);assert.ok(file.startsWith(path.resolve(input.root)+path.sep));
  assert.equal(hash(await fs.readFile(file)),asset.sha256);const target=path.join(directory,name);await fs.link(file,target);
  row.assets[name]={path:path.relative(args.output,target),sha256:asset.sha256};
 }
 const image=await loadImage(path.join(directory,'mask.png')),canvas=createCanvas(image.width,image.height),ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);
 const pixels=ctx.getImageData(0,0,image.width,image.height).data;
 const mask=Uint8Array.from({length:row.resolution**2},(_,i)=>Number(pixels[4*i]>pixels[4*i+1]+20));assert.equal(hash(mask),row.targetMaskSha256);
 const cfg=settings({...input.report.configuration,algorithm:'direct',timeLimit:plan.timeLimit,trials:0});
 const target=prepare({type:'mask',mask,resolution:row.resolution},{...input.report.configuration,invert:false,removeSpecks:0,fillHoles:0}).target;
 assert.equal(hash(target.sourceImage.mask),row.targetMaskSha256);
 const store=async(name,bytes)=>{const file=path.join(directory,name);await fs.writeFile(file,bytes);row.assets[name]={path:path.relative(args.output,file),sha256:hash(bytes)};};
 const start=performance.now();
 try{
  const solution=await fitDirect(target,cfg,()=>{},{countSearch:context=>{
   const search=initializeCounts(context);
   if(run.counts){search.seeds=search.seeds.filter(s=>s.model.counts.every((n,i)=>n===run.counts[i]));assert.ok(search.seeds.length);}
   search.report={...search.report,oracleRetainedCounts:run.counts??null};return search;
  }});
  const answer=finish(solution,cfg,()=>{},{deadline:start+plan.timeLimit*1000});row.solveSeconds=(performance.now()-start)/1000;row.report=answer.report;
  for(const name of ['cut_geometry.json','template_left.svg','template_right.svg'])await store(name,answer.files[name]);
  const rendered=await renderExportedWeave(answer.files['cut_geometry.json'],row.resolution);await store('woven.png',rendered.png);
  row.independentImage=referenceError(target.sourceImage,rendered.mask);
  row.independentFeatures=auditFeatureFidelity(target.sourceImage,rendered.mask,answer.report.settings);
  row.checkedPair=answer.report.templateChecksPassed&&row.independentFeatures.passed&&row.independentImage.mismatchFraction<=.03;
  row.status=row.checkedPair?'checked-derived-mask':'review-required';
 }catch(error){row.status='failed';row.error=error.message;row.solveSeconds=(performance.now()-start)/1000;}
 await save();console.log(JSON.stringify({method,status:row.status,counts:row.report?.solver.selectedCounts,error:row.independentImage?.mismatchFraction,seconds:row.solveSeconds,failure:row.error}));
}
for(const [file,sha] of Object.entries(report.sourceHashes))assert.equal(hash(await fs.readFile(file)),sha,file);
report.status='complete';await save();
