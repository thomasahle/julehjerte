/** Photo → default preparation → solve → independent export rendering, with crop perturbations. */
import fs from 'node:fs/promises';
import {yellowStarInput} from './yellow-star-fixture.mjs';
import {GENERAL_PRESET} from '../../src/lib/inverse/presets.js';
import {prepare,design} from '../../static/inverse/core/engine.js';
import {renderExportedWeave} from './export-renderer.mjs';
const output=`tmp/inverse-yellow-star/${new Date().toISOString().replace(/[:.]/g,'-')}`;await fs.mkdir(output,{recursive:true});
const input=await yellowStarInput(),cfg={...GENERAL_PRESET,timeLimit:10,trials:0},results=[];
const variants=[['clean',0,0,0],['crop-x-plus-1',1,0,0],['crop-x-minus-1',-1,0,0],['crop-y-plus-1',0,1,0],['crop-y-minus-1',0,-1,0],['brightness-plus-8',0,0,8],['brightness-minus-8',0,0,-8]];
for(const[name,dx,dy,light] of variants){
  const row={name};results.push(row);const start=performance.now();
  try{
    const modified={...input,quad:input.quad.map(([x,y])=>[x+dx,y+dy]),rgba:Uint8ClampedArray.from(input.rgba,(v,i)=>i%4===3?v:v+light)},p=prepare(modified,cfg);
    row.curves=p.target.curves.length;row.repairs=p.target.metadata.junctionRepairs.length;
    const r=await design(p.target,cfg),independent=await renderExportedWeave(r.files['cut_geometry.json'],p.preview.resolution);
    row.independentImageError=independent.mask.reduce((s,v,i)=>s+Number(v!==p.preview.mask[i]),0)/independent.mask.length;
    row.passed=r.report.templateChecksPassed&&row.independentImageError<=.03;row.slits=r.report.slits;row.geometryPassed=r.report.validation.passed;row.paperStatus=r.report.manufacturing.status;
    await fs.mkdir(`${output}/${name}`);for(const[file,data]of Object.entries(r.files))await fs.writeFile(`${output}/${name}/${file}`,data);await fs.writeFile(`${output}/${name}/independent-weave.png`,independent.png);
  }catch(e){row.passed=false;row.error=e.message;row.report=e.report;}
  row.seconds=(performance.now()-start)/1000;console.log(JSON.stringify(row));await fs.writeFile(`${output}/results.json`,JSON.stringify({settings:cfg,source:'User yellow/olive photo; manually reviewed crop. Original cutting paths unknown.',results},null,2));
}
console.log(output);if(results.some(r=>!r.passed))process.exitCode=1;
