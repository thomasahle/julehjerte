/** Read-only reproduction on a diagnostic branch. No deployment or training. */
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {cpus} from 'node:os';
import {createCanvas,loadImage} from 'canvas';
import {syntheticPhoto} from './datasets/synthetic-photo.mjs';
import {RECIPES,proceduralDesign,graphLabels} from './datasets/synthetic-geometry.mjs';
import {prepare,design} from '../../static/inverse/core/engine.js';
import {AUTOMATIC_PRESET} from '../../static/inverse/core/presets.js';
import {readHardPhoto} from './hard-photo-data.mjs';
import {hardPhotoTarget} from './hard-photo-target.mjs';
import {renderExportedWeave} from './export-renderer.mjs';
import {auditFeatureFidelity} from '../../static/inverse/core/feature-shapes.js';
import {cfg as clearanceCfg,input as clearanceInput} from './clearance-feature-fixture.mjs';
const out='tmp/ci-diagnostics',hash=b=>createHash('sha256').update(b).digest('hex');
const numericHash=value=>hash(JSON.stringify(value,(_,v)=>typeof v==='number'?Number(v.toFixed(8)):v));
await fs.mkdir(out,{recursive:true});
const summary={node:process.version,platform:process.platform,arch:process.arch,cpu:cpus()[0]?.model,versions:process.versions,recipes:{},photo:{},fits:[]};
const save=()=>fs.writeFile(`${out}/summary.json`,JSON.stringify(summary,null,2));
for(const recipe of RECIPES){
 const values=[0,1,7,26,33,713051,714060,827068].map(seed=>{
  const d=proceduralDesign(seed,recipe);
  return {parameters:d.parameters,cuts:d.cuts,labels:graphLabels(d),geometrySha256:d.geometrySha256,topologySha256:d.topologySha256};
 });
 const withoutDerived=values.map(({geometrySha256,...rest})=>rest);
 summary.recipes[recipe]={rawHash:hash(JSON.stringify(values)),numericHash:numericHash(withoutDerived)};
 await fs.writeFile(`${out}/recipe-${recipe}.json`,JSON.stringify(values));
}
const n=32,photo=await syntheticPhoto({coverage:Float32Array.from({length:n*n},(_,i)=>(((i%n)>>3)^(Math.floor(i/n)>>3))%2),canonicalResolution:n,graph:{nodes:[[0,0],[25,25],[50,50],[75,75],[100,100]]},seed:9281,resolution:64});
for(const [file,bytes]of Object.entries(photo.files)){
 const im=await loadImage(bytes),canvas=createCanvas(im.width,im.height),ctx=canvas.getContext('2d');ctx.drawImage(im,0,0);
 const rgba=ctx.getImageData(0,0,im.width,im.height).data;
 summary.photo[file]={encodedHash:hash(bytes),pixelHash:hash(rgba),width:im.width,height:im.height};
 await fs.writeFile(`${out}/${file}`,bytes);
}
summary.photoLabelsHash=hash(JSON.stringify(photo.labels));summary.photoNumericLabelsHash=numericHash(photo.labels);
await fs.writeFile(`${out}/photo-labels.json`,JSON.stringify(photo.labels,null,2));await save();
if(!process.argv.includes('--numeric-only')){
 const fixtures=JSON.parse(await fs.readFile('scripts/inverse/fixtures/photographic-short-budget-fits.json')),fixture=fixtures.cases[0],catalogue=JSON.parse(await fs.readFile(fixtures.sourceCatalogue));
 const original=await readHardPhoto({...catalogue.source,...catalogue.cases.find(c=>c.id===fixture.sourceCase)}),cfg={...AUTOMATIC_PRESET,timeLimit:10,trials:0,earlyStop:false};
 const imported=prepare({...original,quad:fixture.quad},cfg),stonehenge=hardPhotoTarget(imported,'mask',cfg);
 for(const [id,input,settings] of [['stacked',clearanceInput(),clearanceCfg],['stonehenge',stonehenge,cfg]]){
  const at=performance.now(),row={id,sourceMaskSha256:hash(input.sourceImage.mask),events:[]};summary.fits.push(row);
  try{
   const answer=await design(input,settings,event=>{if(event.stage!==row.events.at(-1)?.stage)row.events.push({stage:event.stage,seconds:(performance.now()-at)/1000});});
   row.seconds=(performance.now()-at)/1000;row.report=answer.report;
   const render=await renderExportedWeave(answer.files['cut_geometry.json'],input.sourceImage.resolution);
   row.fidelity=auditFeatureFidelity(input.sourceImage,render.mask,answer.report.settings);
   row.independentError=render.mask.reduce((s,v,i)=>s+Number(v!==input.sourceImage.mask[i]),0)/render.mask.length;
   await fs.writeFile(`${out}/${id}.png`,render.png);await fs.writeFile(`${out}/${id}-cuts.json`,answer.files['cut_geometry.json']);
   console.log(JSON.stringify({id,node:process.version,seconds:row.seconds,passed:answer.report.templateChecksPassed,error:row.independentError,fidelity:row.fidelity.passed}));
  }catch(error){row.error=error.stack;row.seconds=(performance.now()-at)/1000;}
  await save();
 }
}
console.log(JSON.stringify({node:summary.node,output:out,numericOnly:process.argv.includes('--numeric-only')}));
