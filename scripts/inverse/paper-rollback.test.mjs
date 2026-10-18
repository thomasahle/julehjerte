import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {prepare} from '../../static/inverse/core/engine.js';
import {settings} from '../../static/inverse/core/settings.js';
import {AUTOMATIC_PRESET} from '../../static/inverse/core/presets.js';
import {CurveGraph} from '../../static/inverse/core/direct/curves.js';
import {refineCurves} from '../../static/inverse/core/direct/refine.js';
import {resize} from '../../static/inverse/core/direct/math.js';
import {materialAudit,verifiedPaperSettings} from '../../static/inverse/core/material.js';
import {validate} from '../../static/inverse/core/validate.js';
import {solutionJSON} from '../../static/inverse/core/graph.js';
import {loadNumericalKernel} from '../../static/inverse/core/numerical-kernel.js';
import {readHardPhoto} from './hard-photo-data.mjs';
import {renderExportedWeave} from './export-renderer.mjs';

async function fixture(name,raw={}){
  const data=JSON.parse(await fs.readFile(`scripts/inverse/fixtures/${name}-refinement-checkpoint.json`));
  const catalogue=JSON.parse(await fs.readFile(data.sourceCatalogue)),photo=await readHardPhoto(catalogue.source);
  const cfg=settings({...AUTOMATIC_PRESET,trials:0,preferMatchingSheets:false,...raw});
  const input=prepare({...photo,quad:data.quad},cfg).target,source=input.sourceImage;
  assert.equal(createHash('sha256').update(source.mask).digest('hex'),data.maskSha256);
  await loadNumericalKernel();
  const probability=resize(source.probability,400,256);
  const fit=(resolvePaperBeforeRollback,options={})=>{
    const graph=new CurveGraph(data.paths,data.width);
    return refineCurves(graph,probability,256,data.phase,cfg,{input,steps:201,rate:name==='gift'?.05:.035,resolvePaperBeforeRollback,...options});
  };
  return{data,cfg,input,source,fit};
}

test('a finer verified checkpoint avoids rollback and improves independently rendered error',async()=>{
  const {data,cfg,input,source,fit}=await fixture('floral-checker'),original=source.mask.slice(),config=structuredClone(cfg);
  const before=fit(false),packets=[];
  const after=fit(true,{onProgress:(record,solution)=>{if(record.paperVerification)packets.push({record,solution});}});
  assert.ok(before.paperPassed&&after.paperPassed);
  assert.ok(packets.length>1,'Continue refining after the first finer audit; do not stop at that checkpoint.');
  for(const {record,solution}of packets){
    assert.equal(record.paper,'pass');assert.equal(record.geometry,true);
    assert.deepEqual(solution.report.paperVerification,record.paperVerification);
    const finer=verifiedPaperSettings(solution,cfg);
    assert.equal(finer.materialResolution,700);
    for(const key of ['minWidth','nominalWidth','kerf','cutError','geometryTolerance'])assert.equal(finer[key],cfg[key]);
    assert.equal(validate(solution,finer,{checkImage:false}).passed,true);
    assert.equal(materialAudit(solution,finer).status,'pass','Replay the actual coordinates sent to Stop.');
  }
  assert.equal(after.paperVerification.source,'rollback-checkpoint');
  const errors=[];
  for(const result of [before,after]){
    const solution=result.graph.solution(result.points,data.phase,input);
    const rendered=await renderExportedWeave(solutionJSON(solution),400);
    errors.push(rendered.mask.reduce((sum,v,i)=>sum+Number(v!==source.mask[i]),0)/source.mask.length);
  }
  // Certified diagonal connections already improve the coarse-only fit from
  // over 4% to 1.81%. Later checkpoints still need the actual finer audit.
  assert.ok(errors[0]>.018&&errors[0]<.019);assert.ok(errors[1]<.016);
  assert.ok(errors[0]-errors[1]>.002,'Compare fixed work and independently rendered exports, not timing or internal scores.');
  assert.deepEqual(source.mask,original);assert.deepEqual(cfg,config);
});

test('without a safe incumbent, finer checking does not interrupt provisional exploration',async()=>{
  // At 360 the guarded diagonal connections now certify a checkpoint. Use
  // an actually unresolved lattice, without changing cuts or width rules.
  const {fit}=await fixture('gift',{materialResolution:180}),resolutions=[];
  const paperAudit=(solution,cfg)=>{resolutions.push(cfg.materialResolution);return materialAudit(solution,cfg);};
  const before=fit(false),after=fit(true,{paperAudit});
  assert.equal(before.paperPassed,false);assert.equal(after.paperPassed,false);
  assert.equal(before.paper.status,'uncertain');assert.equal(after.paper.status,'uncertain');
  assert.ok(after.history.every(record=>record.paper!=='pass'&&!record.paperVerification));
  assert.equal(after.paperVerification,undefined);
  assert.deepEqual(after.points,before.points);
  assert.equal(after.error,before.error);
  assert.ok(resolutions.length>0&&resolutions.every(r=>r===180));
});

test('finer paper checks preserve the final refinement time reserve',async t=>{
  const {fit}=await fixture('floral-checker');
  // Keep the optimization deterministic, with 200 ms left throughout. It
  // still runs every requested step, but cannot spend the 250 ms audit reserve.
  t.mock.method(performance,'now',()=>0);
  // The first uncertain checkpoint is now at step 120, after earlier safe
  // diagonal connections. Run far enough to exercise the reserve condition.
  const resolutions=[],paperAudit=(solution,cfg)=>{resolutions.push(cfg.materialResolution);return materialAudit(solution,cfg);};
  const options={steps:161,deadline:200},before=fit(false,options),after=fit(true,{...options,paperAudit});
  assert.equal(after.steps,161);assert.equal(after.paperVerification,undefined);
  assert.ok(after.history.every(record=>!record.paperVerification));
  assert.deepEqual(after.points,before.points);
  assert.equal(after.paperAlternative?.paper.status,'uncertain');
  assert.ok(after.history.some(record=>record.paper==='pass'));
  assert.ok(after.history.some(record=>record.paper==='uncertain'));
  assert.ok(resolutions.length>0&&resolutions.every(r=>r===360));
});

test('a separate checking tail can certify a checkpoint without extending gradient work',async t=>{
  const {fit}=await fixture('floral-checker');let clock=0;
  t.mock.method(performance,'now',()=>clock);
  const resolutions=[],paperAudit=(solution,cfg)=>{resolutions.push(cfg.materialResolution);return materialAudit(solution,cfg);};
  const result=fit(true,{deadline:200,paperVerificationDeadline:600,paperAudit,onProgress:record=>{
    if(record.step>=120)clock=210;
  }});
  assert.ok(resolutions.includes(700),'Use the explicit checking allowance before rolling back a useful checkpoint.');
  assert.ok(result.history.some(record=>record.paperVerification?.resolution===700&&record.paper==='pass'));
  assert.equal(result.steps,125,'The later audit deadline must not authorize any extra gradient block.');
  assert.equal(result.paperPassed,true);
});
