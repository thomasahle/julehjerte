import test from 'node:test';
import assert from 'node:assert/strict';
import {cfg,resolution,mask,input} from './clearance-feature-fixture.mjs';
import {design} from '../../static/inverse/core/engine.js';
import {auditFeatureFidelity} from '../../static/inverse/core/feature-shapes.js';
import {renderExportedWeave} from './export-renderer.mjs';
import {captureFitFailure} from './diagnostics/fit-failure.mjs';

test('late clearance comparison can repair its first usable layout before polishing',async t=>{
  const source=input(),original=structuredClone(source.sourceImage);
  const realNow=performance.now.bind(performance),started=realNow();
  let offset=0,advanced=false;
  const now=t.mock.method(performance,'now',()=>realNow()+offset);
  let answer;
  try{
    answer=await design(source,cfg,event=>{
      if(event.stage!=='directClearance'||advanced)return;
      // Model initialization reaching clearance late, without sleeping or
      // changing any grids. Every later stage shares the shortened deadline.
      offset=Math.max(0,started+5500-realNow());advanced=true;
    });
  }finally{now.mock.restore();}
  const report=answer.report,comparison=report.solver.clearanceComparison;
  try{
  assert.equal(advanced,true);
  assert.ok(comparison?.repair,JSON.stringify({comparison,stages:report.solver.stages}));
  assert.notEqual(comparison.repair.reason,'insufficient_time');
  assert.equal(report.templateChecksPassed,true);
  assert.equal(report.validation.passed,true);
  assert.equal(report.manufacturing.status,'pass');
  assert.ok(report.solver.seconds<cfg.timeLimit);
  const errors=[];
  for(const scale of [1,2]){
    const n=resolution*scale,expected=Uint8Array.from({length:n*n},(_,i)=>mask[Math.floor(Math.floor(i/n)/scale)*resolution+Math.floor(i%n/scale)]);
    const woven=await renderExportedWeave(answer.files['cut_geometry.json'],n);
    const error=woven.mask.reduce((sum,v,i)=>sum+Number(v!==expected[i]),0)/expected.length;
    errors.push({resolution:n,mismatchFraction:error});
    assert.ok(error<cfg.maxImageError,`Independent ${n}-pixel error is ${error}.`);
    assert.equal(auditFeatureFidelity({mask:expected,resolution:n},woven.mask,report.settings).passed,true);
  }
  assert.deepEqual(source.sourceImage,original);
  t.diagnostic(JSON.stringify({simulatedDelayMilliseconds:offset,solverSeconds:report.solver.seconds,errors}));
  }catch(error){t.diagnostic(await captureFitFailure({answer,source:source.sourceImage,context:{case:'late-clearance-feature',simulatedDelayMilliseconds:offset,assertion:error.message}}));throw error;}
});
