/** Check the proposal against the existing hjfig-05 delayed-routing regression.
 * This is a separate follow-up to the neural-target screen, not a training case.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {createCanvas,loadImage} from 'canvas';
import {prepare,design} from '../../../static/inverse/core/engine.js';
import {AUTOMATIC_PRESET} from '../../../static/inverse/core/presets.js';
import {referenceError} from '../../../static/inverse/core/image-reference.js';
import {auditFeatureFidelity} from '../../../static/inverse/core/feature-shapes.js';
import {renderExportedWeave} from '../export-renderer.mjs';

const args=Object.fromEntries(process.argv.slice(2).map(s=>s.replace(/^--/,'').split('=')));
assert.deepEqual(Object.keys(args).sort(),['experiment','output']);
const hash=b=>createHash('sha256').update(b).digest('hex');
const raw=await fs.readFile(path.join(args.experiment,'report.json')),previous=JSON.parse(raw);
assert.equal(previous.status,'complete');
for(const [file,sha] of Object.entries(previous.sourceHashes))assert.equal(hash(await fs.readFile(file)),sha,file);
const proposedFile=previous.experimentalModule.path;
assert.equal(hash(await fs.readFile(proposedFile)),previous.experimentalModule.sha256);
const disk=await fs.statfs('.');assert.ok(disk.bavail*disk.bsize>10*1024**3);
await fs.mkdir(args.output,{recursive:false});
// Exercise the real automatic/finish wrappers as well as the modified fitter.
const overrides=new Map([
 ['static/inverse/core/engine.js',path.resolve(args.output,'engine-proposal.mjs')],
 ['static/inverse/core/automatic.js',path.resolve(args.output,'automatic-proposal.mjs')],
 ['static/inverse/core/direct/fit.js',path.resolve(proposedFile)],
].map(([original,replacement])=>[path.resolve(original),replacement]));
for(const file of ['static/inverse/core/engine.js','static/inverse/core/automatic.js']){
 const original=path.resolve(file),source=await fs.readFile(original,'utf8');
 const modified=source.replace(/\bfrom '(\.[^']+)'/g,(_,specifier)=>{
  const target=path.resolve(path.dirname(original),specifier);
  return `from '${pathToFileURL(overrides.get(target)||target).href}'`;
 });
 await fs.writeFile(overrides.get(original),modified,{flag:'wx'});
}
const proposal=await import(pathToFileURL(overrides.get(path.resolve('static/inverse/core/engine.js'))).href);
const fitter=await import(pathToFileURL(proposedFile).href);
const catalogueFile='scripts/inverse/fixtures/hunodan/speed-crops.json',catalogueBytes=await fs.readFile(catalogueFile);
const entry=JSON.parse(catalogueBytes).cases.find(r=>r.id==='hjfig-05');assert.ok(entry);
const photoBytes=await fs.readFile(entry.source),photo=await loadImage(photoBytes),[x,y,x1,y1]=entry.photoROI;
const canvas=createCanvas(x1-x,y1-y),ctx=canvas.getContext('2d');ctx.drawImage(photo,-x,-y);
const cfg={...AUTOMATIC_PRESET,timeLimit:60,trials:0,earlyStop:false};
const input={type:'pixels',imageWidth:canvas.width,imageHeight:canvas.height,
 rgba:ctx.getImageData(0,0,canvas.width,canvas.height).data,quad:entry.quad};
const report={schema:'feature-priority-hunodan-1',status:'running',
 experiment:{path:path.join(args.experiment,'report.json'),sha256:hash(raw)},
 sourceHashes:previous.sourceHashes,implementationSha256:hash(await fs.readFile(new URL(import.meta.url))),
 fixture:{id:entry.id,catalogueSha256:hash(catalogueBytes),photoSha256:hash(photoBytes),photoROI:entry.photoROI,quad:entry.quad},
 configuration:cfg,scope:'Existing photographic regression from feature-refinement.test.mjs: automatic workflow, original soft probability target, 60-second budget and one simulated second added at the first graph event. Baseline then proposal; no training or production edits. Ranking assertions are diagnostic, while independent image/feature/geometry/paper checks remain unchanged.',rows:[]};
const save=()=>fs.writeFile(path.join(args.output,'report.json'),JSON.stringify(report,null,2)+'\n');
await save();
try{
 for(const method of ['baseline','candidate']){
  const prepared=prepare(input,cfg),source=prepared.target.sourceImage;
  const mask=source.mask.slice(),probability=source.probability.slice();
  const row={method,maskSha256:hash(mask),probabilitySha256:hash(new Uint8Array(probability.buffer)),assets:{}};report.rows.push(row);
  if(report.rows.length>1)for(const key of ['maskSha256','probabilitySha256'])assert.equal(row[key],report.rows[0][key]);
  const directory=path.join(args.output,method);await fs.mkdir(directory);
  const store=async(name,bytes)=>{const file=path.join(directory,name);await fs.writeFile(file,bytes);row.assets[name]={path:path.relative(args.output,file),sha256:hash(bytes)};};
  const maskCanvas=createCanvas(source.resolution,source.resolution),maskCtx=maskCanvas.getContext('2d'),pixels=maskCtx.createImageData(source.resolution,source.resolution);
  for(let i=0;i<mask.length;i++)pixels.data.set(mask[i]?[185,19,19,255]:[255,255,255,255],4*i);
  maskCtx.putImageData(pixels,0,0);await store('mask.png',maskCanvas.toBuffer('image/png'));
  let elapsed=0,graphEvents=0;const realNow=performance.now;
  fitter.preferenceProbeRecords.length=0;const start=Date.now();
  performance.now=()=>realNow.call(performance)+elapsed;
  try{
   const answer=await (method==='candidate'?proposal.design:design)(prepared.target,cfg,event=>{
    if(event.stage==='graph'&&++graphEvents===1)elapsed+=1000;
   });
   row.report=answer.report;
   for(const name of ['cut_geometry.json','template_left.svg','template_right.svg'])await store(name,answer.files[name]);
   const woven=await renderExportedWeave(answer.files['cut_geometry.json'],source.resolution);await store('woven.png',woven.png);
   row.independentImage=referenceError(source,woven.mask);
   row.independentFeatures=auditFeatureFidelity(source,woven.mask,answer.report.settings);
   row.originalQualityTargetPassed=answer.report.templateChecksPassed&&answer.report.validation.passed&&
    answer.report.manufacturing.status==='pass'&&row.independentFeatures.passed&&row.independentImage.mismatchFraction<.0095;
   row.guard=structuredClone(fitter.preferenceProbeRecords);
   assert.deepEqual(source.mask,mask);assert.deepEqual(source.probability,probability);
  }catch(error){row.error=String(error.stack||error);}
  finally{performance.now=realNow;}
  row.seconds=(Date.now()-start)/1000;row.graphEvents=graphEvents;row.simulatedDelaySeconds=elapsed/1000;
  await save();console.log(JSON.stringify({method,passed:row.originalQualityTargetPassed,error:row.independentImage?.mismatchFraction,guard:row.guard,seconds:row.seconds}));
 }
 for(const [file,sha] of Object.entries(previous.sourceHashes))assert.equal(hash(await fs.readFile(file)),sha,file);
 report.status='complete';await save();
}catch(error){report.status='failed';report.error=String(error.stack||error);await save();throw error;}
