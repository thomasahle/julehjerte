import {qualityBenchmark as test} from './quality-benchmark.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {prepare} from '../../static/inverse/core/engine.js';
import {settings} from '../../static/inverse/core/settings.js';
import {recoverImageFeatures} from '../../static/inverse/core/feature-recovery.js';
import {loadBoundaryKernel} from '../../static/inverse/core/direct/native.js';
import {solverRuntime} from '../../static/inverse/core/solver.js';
import {validate} from '../../static/inverse/core/validate.js';
import {materialAudit,verifiedPaperSettings} from '../../static/inverse/core/material.js';
const fixture=JSON.parse(await fs.readFile('scripts/inverse/fixtures/sloth-search-scheduling.json'));
for(const borrowed of [true,false])test(borrowed?'a late routing candidate uses the repair time already provided by its caller':'a late routing candidate cannot manufacture an unprovided repair allowance',async t=>{
 const entry=fixture.cases.find(c=>c.id==='synthetic-control'),n=entry.resolution,mask=new Uint8Array(n*n);
 for(const [start,length] of entry.maskRuns)mask.fill(1,start,start+length);
 const cfg=settings({...fixture.configuration,invert:false,removeSpecks:0,fillHoles:0}),input=prepare({type:'mask',mask,resolution:n},cfg).target,before=input.sourceImage.mask.slice();
 await loadBoundaryKernel();await solverRuntime();
 // Inject a one-off scheduling delay after a real MILP answer. The clock
 // continues to run normally, including during backend calibration and repair.
 const actualNow=performance.now.bind(performance),started=actualNow(),seconds=8;let offset=0,delayed=false,result;
 const clock=t.mock.method(performance,'now',()=>actualNow()+offset);
 try{
  result=await recoverImageFeatures(input,cfg,seconds,event=>{
   if(event.stage==='validating'&&!delayed){
    delayed=true;offset=started+seconds*1000-650-actualNow();
    assert.ok(offset>0,'The real MILP must finish before the controlled delay.');
   }
  },{repairDeadline:borrowed?started+(seconds+1)*1000:null});
 }finally{clock.mock.restore();}
 assert.equal(delayed,true);
 const attempt=result.report.attempts.find(a=>a.rejectedCandidates?.length),observation=attempt?.rejectedCandidates[0];
 assert.ok(observation);assert.ok(observation.remainingSeconds<.75);
 if(borrowed){
  assert.equal(observation.reason,'repair_attempted');
  assert.ok(observation.repairBudgetSeconds>.75&&observation.repairBudgetSeconds<1.2);
  assert.ok(Math.abs(attempt.continuousRepair.additionalBudgetSeconds-.5)<1e-12,'The existing half-second cap remains in force, allowing only arithmetic roundoff.');
  assert.equal(attempt.continuousRepair.accepted,true,JSON.stringify({reason:attempt.continuousRepair.reason,steps:attempt.continuousRepair.steps}));
  assert.ok(result.solution);
  const checked=verifiedPaperSettings(result.solution,cfg);
  assert.equal(validate(result.solution,checked,{finalGeometry:true}).passed,true);
  assert.equal(materialAudit(result.solution,checked).passed,true);
 }else{
  assert.equal(observation.reason,'insufficient_phase_time');
  assert.equal(attempt.continuousRepair,undefined);
 }
 assert.deepEqual(input.sourceImage.mask,before);
});
