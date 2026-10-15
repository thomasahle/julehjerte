import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {prepare,finish} from '../../static/inverse/core/engine.js';
import {settings} from '../../static/inverse/core/settings.js';
import {AUTOMATIC_PRESET} from '../../static/inverse/core/presets.js';
import {CurveGraph} from '../../static/inverse/core/direct/curves.js';
import {refineCurves} from '../../static/inverse/core/direct/refine.js';
import {polishCandidate} from '../../static/inverse/core/direct/polish.js';
import {materialAudit,verifiedPaperSettings} from '../../static/inverse/core/material.js';
import {validate} from '../../static/inverse/core/validate.js';
import {solutionJSON} from '../../static/inverse/core/graph.js';
import {finishStopped} from '../../static/inverse/core/stopped.js';
import {loadNumericalKernel} from '../../static/inverse/core/numerical-kernel.js';
import {readHardPhoto} from './hard-photo-data.mjs';
import {renderExportedWeave} from './export-renderer.mjs';

async function fixture(){
  // Captured controls isolate final polishing. They are neither a production
  // initializer nor a substitute for fresh full-pipeline benchmark runs.
  const data=JSON.parse(await fs.readFile('scripts/inverse/fixtures/crown-polishing-checkpoint.json'));
  const catalogue=JSON.parse(await fs.readFile(data.sourceCatalogue)),photo=await readHardPhoto(catalogue.source);
  const cfg=settings({...AUTOMATIC_PRESET,trials:0,preferMatchingSheets:false});
  const source=prepare({...photo,quad:data.quad},cfg).target.sourceImage;
  assert.equal(createHash('sha256').update(source.mask).digest('hex'),data.maskSha256);
  const input=prepare({type:'mask',mask:source.mask.slice(),resolution:source.resolution},cfg).target;
  const graph=new CurveGraph(data.paths,data.width),candidate={graph,points:graph.points,phase:data.phase,
    counts:graph.families.map(f=>f.length),paperVerification:data.paperVerification};
  await loadNumericalKernel();
  return{data,cfg,input,candidate,prob:Float64Array.from(source.mask)};
}

test('final polishing retains a finer checked crown through progress, Stop and export',async()=>{
  const {data,cfg,input,candidate,prob}=await fixture(),original=structuredClone(input),points=candidate.points.slice(),config=structuredClone(cfg);
  const options={input,steps:41,rate:.008,selection:'mask'},packets=[];
  const before=refineCurves(candidate.graph,prob,400,data.phase,{...cfg,materialResolution:700},options);
  const after=polishCandidate(candidate,prob,400,cfg,{...options,onProgress:(record,solution)=>{
    if(record.paperVerification)packets.push({record,solution});
  }});
  assert.equal(before.steps,41);assert.equal(after.steps,41);
  assert.ok(before.paperPassed&&after.paperPassed);
  assert.equal(after.paperVerification.resolution,1000);
  assert.equal(after.paperVerification.source,'rollback-checkpoint');
  assert.ok(packets.length>0,'The finer result must be available to Stop during polishing.');
  for(const {record,solution}of packets){
    assert.deepEqual(solution.report.paperVerification,record.paperVerification,'Do not overwrite a new audit with the incoming 700-resolution provenance.');
    const finer=verifiedPaperSettings(solution,cfg);
    assert.equal(finer.materialResolution,1000);
    assert.deepEqual({...finer,materialResolution:cfg.materialResolution},cfg);
    assert.equal(validate(solution,finer,{checkImage:false}).passed,true);
    assert.equal(materialAudit(solution,finer).status,'pass');
  }
  const errors=[];
  for(const result of [before,after]){
    const solution=result.graph.solution(result.points,data.phase,input);
    const rendered=await renderExportedWeave(solutionJSON(solution),400);
    errors.push(rendered.mask.reduce((sum,v,i)=>sum+Number(v!==input.sourceImage.mask[i]),0)/prob.length);
  }
  assert.ok(errors[0]>.024&&errors[1]<.0225);
  assert.ok(errors[0]-errors[1]>.002,'Identical optimization work must improve the independently rendered mask by more than 0.2 percentage points.');
  const solution=after.graph.solution(after.points,data.phase,input);
  solution.report.paperVerification=after.paperVerification;
  assert.equal(materialAudit(solution,{...cfg,materialResolution:700}).status,'uncertain');
  assert.equal(materialAudit(solution,{...cfg,materialResolution:1400}).status,'pass');
  const exported=finish(solution,cfg,()=>{},{refine:false});
  assert.equal(exported.report.templateChecksPassed,true);
  assert.equal(exported.report.settings.materialResolution,1000);
  assert.equal(exported.report.manufacturing.gridSpacing,.1);
  const packet=packets.at(-1),saved={geometry:JSON.stringify(solutionJSON(packet.solution)),materialResolution:1000,error:packet.record.error};
  const stopped=await finishStopped(input,cfg,[saved],()=>{},{cleanup:s=>s});
  assert.equal(stopped.report.templateChecksPassed,true);
  assert.equal(stopped.report.settings.materialResolution,1000);
  assert.equal(stopped.report.solver.paperVerification.source,'retained-checkpoint');
  assert.deepEqual(structuredClone(input),original);assert.deepEqual(candidate.points,points);assert.deepEqual(cfg,config);
  assert.equal(candidate.paperVerification.resolution,700);
});

test('polishing cannot spend its final time reserve on a finer paper audit',async t=>{
  const {data,cfg,input,candidate,prob}=await fixture();
  t.mock.method(performance,'now',()=>0);
  const options={input,steps:41,rate:.008,selection:'mask',deadline:200};
  const before=refineCurves(candidate.graph,prob,400,data.phase,{...cfg,materialResolution:700},options);
  const after=polishCandidate(candidate,prob,400,cfg,options);
  assert.equal(after.steps,41);assert.deepEqual(after.points,before.points);
  assert.equal(after.paperVerification.resolution,700);
  assert.ok(after.history.every(record=>!record.paperVerification));
});
