import {qualityBenchmark as test} from './quality-benchmark.mjs';
import assert from 'node:assert/strict';
import {cfg,resolution,mask,input} from './clearance-feature-fixture.mjs';
import {design} from '../../static/inverse/core/engine.js';
import {renderExportedWeave} from './export-renderer.mjs';
import {auditFeatureFidelity} from '../../static/inverse/core/feature-shapes.js';

test('fresh fitting continues an unfinished verified initializer within the remaining search allowance',{timeout:20000},async t=>{
  const source=input(),realNow=performance.now.bind(performance);
  let offset=0,repairStart=null,advanced=false,answer;
  const now=t.mock.method(performance,'now',()=>realNow()+offset);
  try{
    answer=await design(source,cfg,r=>{
      if(r.stage!=='directRefining'||r.detail!=='clearance-initializer')return;
      repairStart??=performance.now();
      if(r.step>=40&&!advanced){
        // Simulate a slower first repair block. Advance the global deadline
        // clock once; every later stage has correspondingly less time. Kernel
        // calibration and all optimization still run normally from fresh grids.
        offset+=Math.max(0,repairStart+800-performance.now());advanced=true;
      }
    });
  }finally{now.mock.restore();}
  assert.equal(advanced,true);
  const report=answer.report,repair=report.solver.clearanceComparison.repair;
  if(!report.templateChecksPassed)t.diagnostic(JSON.stringify({repair,termination:report.solver.termination}));
  assert.equal(repair.accepted,false);
  assert.equal(repair.continued,true);
  assert.equal(report.solver.clearanceComparison.preferred,true);
  assert.equal(report.templateChecksPassed,true);
  const woven=await renderExportedWeave(answer.files['cut_geometry.json'],resolution);
  const error=woven.mask.reduce((sum,v,i)=>sum+Number(v!==mask[i]),0)/mask.length;
  assert.ok(error<cfg.maxImageError);
  assert.equal(auditFeatureFidelity(source.sourceImage,woven.mask,cfg).passed,true);
  assert.deepEqual(source.sourceImage.mask,mask);
});
