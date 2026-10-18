import test from 'node:test';
import assert from 'node:assert/strict';
import {design} from '../../static/inverse/core/engine.js';
import {Cubic} from '../../static/inverse/core/bezier.js';
import {CurveGraph} from '../../static/inverse/core/direct/curves.js';
import {repairClearanceInitializer} from '../../static/inverse/core/direct/clearance-repair.js';
import {loadSolutionJSON} from '../../static/inverse/core/graph.js';
import {settings} from '../../static/inverse/core/settings.js';
import {validate} from '../../static/inverse/core/validate.js';
import {finalMaterialAudit} from '../../static/inverse/core/geometric-material.js';
import {auditFeatureFidelity} from '../../static/inverse/core/feature-shapes.js';
import {renderExportedWeave} from './export-renderer.mjs';
import {cfg,resolution,mask,input,initializer} from './leaf-clearance-fixture.mjs';

test('an exhausted clearance repair allowance leaves the initializer untouched',()=>{
  const source=input(),prepared=initializer(source),before=prepared.graph.points.slice();
  const result=repairClearanceInitializer(prepared,source,cfg,{deadline:performance.now()-1});
  assert.equal(result.candidate,null);assert.equal(result.report.reason,'insufficient_time');
  assert.deepEqual(prepared.graph.points,before);assert.deepEqual(source.sourceImage.mask,mask);
});

test('a crossing is not admitted as a clearance-only repair',()=>{
  const source=input(),prepared=initializer(source),line=(a,b)=>[Cubic.line(a,b).p];
  prepared.graph=new CurveGraph([[line([30,0],[70,100]),line([70,0],[30,100])],[line([0,50],[100,50])]],cfg.width);
  prepared.clear.model.counts=[2,1];
  const before=prepared.graph.points.slice();
  for(const recoverFeatures of [false,true]){
    const result=repairClearanceInitializer(prepared,source,cfg,{recoverFeatures});
    assert.equal(result.candidate,null);assert.equal(result.report.reason,'geometry_not_repairable');
    assert.equal(result.report.initialGeometry.passed,false);
  }
  assert.deepEqual(prepared.graph.points,before);assert.deepEqual(source.sourceImage.mask,mask);
});

test('clearance repair leaves weighted borders and requested symmetry to their constrained fitters',()=>{
  const source=input(),prepared=initializer(source),before=prepared.graph.points.slice();
  for(const [target,configuration] of [
    [{...source,sourceImage:{...source.sourceImage,weights:new Float64Array(mask.length).fill(1)}},cfg],
    [source,{...cfg,symmetry:{...cfg.symmetry,transpose:true}}],
  ]){
    const result=repairClearanceInitializer(prepared,target,configuration);
    assert.equal(result.candidate,null);assert.equal(result.report.reason,'unsupported_constraints');
  }
  assert.deepEqual(prepared.graph.points,before);assert.deepEqual(source.sourceImage.mask,mask);
});

test('fresh fitting finds a checked pair for the upward-shifted photograph without saved cuts',{timeout:20000},async t=>{
  const source=input(),answer=await design(source,cfg),report=answer.report;
  try{
    assert.equal(report.templateChecksPassed,true);
    // Different valid routes can win a clock-limited fresh solve. Check the
    // exported pair itself; the bounded repair has separate direct regressions.
    const solution=loadSolutionJSON(answer.files['cut_geometry.json']),checkedCfg=settings(report.settings);
    const geometry=validate(solution,checkedCfg,{checkImage:false,finalGeometry:true});
    assert.equal(geometry.passed,true,JSON.stringify(geometry.issues));
    const paper=finalMaterialAudit(solution,checkedCfg);
    assert.equal(paper.passed,true,JSON.stringify(paper));
    const woven=await renderExportedWeave(answer.files['cut_geometry.json'],resolution);
    const error=woven.mask.reduce((sum,v,i)=>sum+Number(v!==mask[i]),0)/mask.length;
    assert.ok(error<.02,`Independent exported image has ${(100*error).toFixed(3)}% disagreement.`);
    assert.equal(auditFeatureFidelity(source.sourceImage,woven.mask,checkedCfg).passed,true);
    assert.deepEqual(source.sourceImage.mask,mask);
  }catch(error){
    t.diagnostic(JSON.stringify({report,cuts:answer.files['cut_geometry.json']}));
    throw error;
  }
});

test('the ordinary search allowance also recovers the upward-shifted photograph',{timeout:40000},async t=>{
  const source=input(),answer=await design(source,{...cfg,timeLimit:180}),report=answer.report;
  assert.equal(report.templateChecksPassed,true);
  const woven=await renderExportedWeave(answer.files['cut_geometry.json'],resolution);
  const error=woven.mask.reduce((sum,v,i)=>sum+Number(v!==mask[i]),0)/mask.length;
  if(error>=.02)t.diagnostic(JSON.stringify({error,termination:report.solver.termination,initialization:report.solver.selectedInitialization,recovery:report.solver.featureRecovery?.reason}));
  assert.ok(error<.02,'More search allowance must retain the recovered leaf silhouette.');
  assert.deepEqual(source.sourceImage.mask,mask);
});
