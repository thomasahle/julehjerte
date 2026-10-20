/** Retain every full-pipeline result under controlled JS deadline pressure.
 * Native MILP time is unchanged; this is not a simulation of a particular CPU. */
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {prepare,design} from '../../../static/inverse/core/engine.js';
import {loadBoundaryKernel} from '../../../static/inverse/core/direct/native.js';
import {renderExportedWeave} from '../export-renderer.mjs';

const args=Object.fromEntries(process.argv.slice(2).map(v=>v.replace(/^--/,'').split('=')));
assert.ok(args.output&&Object.keys(args).every(k=>k==='output'));
const output=path.resolve(args.output),hash=b=>createHash('sha256').update(b).digest('hex');
const bytes=await fs.readFile('scripts/inverse/fixtures/dinosaur-border-repair.json'),fixture=JSON.parse(bytes);
const n=fixture.resolution,mask=new Uint8Array(n*n),cfg=fixture.configuration;
for(const [start,length]of fixture.maskRuns)mask.fill(1,start,start+length);
assert.equal(hash(mask),fixture.maskSha256);
const sourceHashes={};
for(const file of [new URL(import.meta.url).pathname,...(await fs.readdir('static/inverse',{recursive:true}))
  .filter(f=>/\.(js|mjs|wasm)$/.test(f)).map(f=>'static/inverse/'+f)])sourceHashes[file]=hash(await fs.readFile(file));
await fs.mkdir(output);
const stat=await fs.statfs(output);assert.ok(stat.bavail*stat.bsize>=10*1024**3);
const report={schema:'first-paper-recovery-1',status:'running',sourceHashes,fixtureSha256:hash(bytes),
  plan:{scales:[1,1.5,2,2,1.5,1],configuration:cfg,workers:1,nice:15,
    scope:'Fresh grids and MILP for each unchanged mask. Accelerate only JS deadline accounting, not numerical work or native solver time. Preserve every result and all final checks. No saved template initializes fitting.'},runs:[]};
const save=()=>fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
await save();await loadBoundaryKernel();
const now=performance.now.bind(performance),descriptor=Object.getOwnPropertyDescriptor(performance,'now');
try{
  for(const [index,scale]of report.plan.scales.entries()){
    const input=prepare({type:'mask',mask:mask.slice(),resolution:n},{...cfg,invert:false,removeSpecks:0,fillHoles:0}).target;
    const probabilityHash=hash(Buffer.from(input.sourceImage.probability.buffer)),at=now();
    Object.defineProperty(performance,'now',{configurable:true,value:()=>at+scale*(now()-at)});
    let answer;
    try{answer=await design(input,cfg);}
    finally{if(descriptor)Object.defineProperty(performance,'now',descriptor);else delete performance.now;}
    const row={index,scale,seconds:(now()-at)/1000,report:answer.report};report.runs.push(row);
    const exported=await renderExportedWeave(answer.files['cut_geometry.json'],n);
    row.independentError=exported.mask.reduce((sum,v,i)=>sum+Number(v!==mask[i]),0)/mask.length;
    for(const [name,data]of Object.entries({geometry:answer.files['cut_geometry.json'],preview:exported.png})){
      const file=`${index}-${name}.${name==='preview'?'png':'json'}`;
      await fs.writeFile(path.join(output,file),data);row[name]={path:file,sha256:hash(data)};
    }
    assert.deepEqual(input.sourceImage.mask,mask);
    assert.equal(hash(Buffer.from(input.sourceImage.probability.buffer)),probabilityHash);
    await save();
    console.log(JSON.stringify({index,scale,seconds:row.seconds,error:row.independentError,
      geometry:answer.report.validation.passed,paper:answer.report.manufacturing.status,
      repairs:answer.report.solver.featureRecovery?.attempts.flatMap(a=>a.continuousRepairs||[])
        .map(r=>({reason:r.reason,steps:r.steps,paper:r.paper?.status,earlyRepair:r.earlyPaperRepair?.accepted}))}));
  }
  report.status='complete';
}catch(error){report.status='failed';report.error=error.stack;throw error;}
finally{
  if(descriptor)Object.defineProperty(performance,'now',descriptor);else delete performance.now;
  await save();
}
