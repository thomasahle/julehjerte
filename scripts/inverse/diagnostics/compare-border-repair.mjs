/** Alternate frozen and current engines on the two full-cohort regressions.
 * The temporary runtime shares immutable bytes, except for the reverted module.
 * Remove those links afterwards so later source edits cannot change evidence. */
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import * as current from '../../../static/inverse/core/engine.js';
import {renderExportedWeave} from '../export-renderer.mjs';

const args=Object.fromEntries(process.argv.slice(2).map(s=>s.replace(/^--/,'').split('=')));
assert.ok(args.output&&Object.keys(args).length===1);
const output=path.resolve(args.output),runtime=path.join(output,'runtime');
const baseline='tmp/heart-learning/exemplar-continuation-mixed-pipeline-v1';
const probe='tmp/heart-learning/exemplar-continuation-v1';
const previous=JSON.parse(await fs.readFile(path.join(baseline,'report.json')));
const manifest=JSON.parse(await fs.readFile(path.join(probe,'manifest.json')));
const hash=b=>createHash('sha256').update(b).digest('hex');
const changed='static/inverse/core/direct/rejected-routing.js';
const baselineCommit='8bd2db5e',old=execFileSync('git',['show',baselineCommit+':'+changed]);
assert.equal(hash(old),previous.sourceHashes[changed]);
const ids=['real-fcbcc23efea92b93-body-1','real-ce66f9634c2c613b-body-1'];
await fs.mkdir(output);await fs.mkdir(runtime);
const sourceHashes={};
const report={schema:'border-repair-clock-comparison-1',status:'running',baselineCommit,
  order:['previous','current','current','previous'],ids,configuration:previous.configuration,sourceHashes,runs:[],
  scope:'Every repeat retained, same masks and observation coverage, ten-second searches. No model or mask changes. This follow-up diagnoses two worse scores in the full cohort; it does not replace that cohort.'};
const save=()=>fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
await save();
try{
  for(const [file,sha] of Object.entries(previous.sourceHashes).filter(([p])=>p.startsWith('static/inverse/'))){
    const bytes=await fs.readFile(file);sourceHashes[file]=hash(bytes);
    if(file!==changed)assert.equal(hash(bytes),sha,file);
    const dest=path.join(runtime,file);await fs.mkdir(path.dirname(dest),{recursive:true});
    if(file===changed)await fs.writeFile(dest,old);else await fs.link(file,dest);
  }
  const previousEngine=await import(pathToFileURL(path.join(runtime,'static/inverse/core/engine.js')));
  const engines={previous:previousEngine,current};
  for(const id of ids){
    const oldRow=previous.rows.find(r=>r.id===id),input=manifest.rows.find(r=>r.id===id),asset=input.assets['real-mixed'].mask;
    const mask=Uint8Array.from(await fs.readFile(path.join(probe,asset.path)));
    assert.equal(hash(mask),asset.sha256);assert.equal(hash(mask),oldRow.targetMaskSha256);
    let validMask;
    if(oldRow.assets['observed.bin']){
      const asset=oldRow.assets['observed.bin'];validMask=Uint8Array.from(await fs.readFile(path.join(baseline,asset.path)));
      assert.equal(hash(validMask),asset.sha256);
    }
    for(const method of report.order){
      const stat=await fs.statfs(output);assert.ok(stat.bavail*stat.bsize>=10*1024**3);
      const engine=engines[method],cfg=report.configuration;
      const target=engine.prepare({type:'mask',mask:mask.slice(),resolution:oldRow.resolution,validMask:validMask?.slice()},
        {...cfg,invert:false,removeSpecks:0,fillHoles:0}).target;
      assert.deepEqual(target.sourceImage.mask,mask);assert.deepEqual(target.sourceImage.validMask??null,validMask??null);
      const probabilityHash=hash(Buffer.from(target.sourceImage.probability.buffer));
      const row={index:report.runs.length,id,method,maskSha256:hash(mask)};report.runs.push(row);await save();
      const started=performance.now();
      try{
        const result=await engine.design(target,cfg);row.seconds=(performance.now()-started)/1000;
        const prefix=String(row.index).padStart(2,'0')+'-'+method;
        const render=await renderExportedWeave(result.files['cut_geometry.json'],oldRow.resolution);
        row.error=render.mask.reduce((s,v,i)=>s+Number(v!==mask[i]),0)/mask.length;
        row.templateChecksPassed=result.report.templateChecksPassed;
        row.geometryPassed=result.report.validation.passed;row.paperStatus=result.report.manufacturing.status;
        row.provisional=result.report.solver.featureRecovery?.attempts?.some(a=>a.continuousRepair?.reason==='border_feature_refinement_seed')??false;
        row.assets={};
        for(const [name,data] of Object.entries({'geometry.json':result.files['cut_geometry.json'],'report.json':JSON.stringify(result.report,null,2)+'\n','woven.png':render.png})){
          const file=prefix+'-'+name;await fs.writeFile(path.join(output,file),data);row.assets[name]={path:file,sha256:hash(data)};
        }
      }catch(error){row.failure=error.stack;}
      assert.equal(hash(target.sourceImage.mask),hash(mask));assert.equal(hash(Buffer.from(target.sourceImage.probability.buffer)),probabilityHash);
      await save();console.log(JSON.stringify({...row,assets:undefined}));
    }
  }
  for(const [file,sha] of Object.entries(sourceHashes))assert.equal(hash(await fs.readFile(file)),sha,file);
  report.status='complete';await save();
}catch(error){report.status='failed';report.error=error.stack;await save();throw error;}
finally{await fs.rm(runtime,{recursive:true});}
