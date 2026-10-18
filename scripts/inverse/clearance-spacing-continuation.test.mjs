// Fixed-work regression isolated from real-deadline kernel calibration.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {cfg,resolution,mask,input,initializer} from './clearance-feature-fixture.mjs';
import {CurveGraph} from '../../static/inverse/core/direct/curves.js';
import {repairClearanceInitializer} from '../../static/inverse/core/direct/clearance-repair.js';
import {refineCurves} from '../../static/inverse/core/direct/refine.js';
import {loadBoundaryKernel} from '../../static/inverse/core/direct/native.js';
import {materialAudit,verifiedPaperSettings} from '../../static/inverse/core/material.js';
import {validate} from '../../static/inverse/core/validate.js';
import {auditFeatureFidelity} from '../../static/inverse/core/feature-shapes.js';
import {solutionJSON} from '../../static/inverse/core/graph.js';
import {renderExportedWeave} from './export-renderer.mjs';

const fixture=JSON.parse(await fs.readFile(new URL('./fixtures/clearance-spacing-initializer.json',import.meta.url)));

test('a repaired spacing initializer can continue before meeting the final image limit',async t=>{
  await loadBoundaryKernel();
  assert.equal(createHash('sha256').update(mask).digest('hex'),fixture.sourceMaskSha256);
  const source=input(),original=structuredClone(source.sourceImage),prepared=initializer(source);
  prepared.graph=new CurveGraph(fixture.paths,cfg.width);
  prepared.clear={phase:fixture.phase,model:{counts:fixture.counts}};
  const before=prepared.graph.points.slice(),initial=prepared.graph.solution(before,fixture.phase,source);
  const geometry=validate(initial,cfg,{checkImage:false});
  assert.equal(geometry.passed,false);
  assert.deepEqual(geometry.issues,fixture.construction.initialGeometryIssues);
  let clock=0,result;
  const now=t.mock.method(performance,'now',()=>clock);
  try{
    result=repairClearanceInitializer(prepared,source,cfg,{geometry,onProgress:r=>{
      if(r.step>=40)clock=800;
    }});
  }finally{now.mock.restore();}
  assert.equal(result.report.steps,45);
  assert.equal(result.report.trigger,'inter-slit-clearance');
  assert.equal(result.report.geometry.passed,true);
  assert.equal(result.report.features.passed,true);
  assert.ok(result.report.imageError>cfg.maxImageError);
  assert.equal(result.report.accepted,false);
  assert.equal(result.candidate,null,'An unfinished initializer is not an accepted template.');
  assert.ok(result.continuation,'A checked improvement should remain available to the common fitter.');
  assert.ok(result.report.imageError<result.report.initialImageError);
  const candidate=result.continuation,solution=candidate.graph.solution(candidate.points,candidate.phase,source);
  solution.report={paperVerification:candidate.paperVerification};
  const verified=verifiedPaperSettings(solution,cfg);
  assert.equal(validate(solution,verified,{checkImage:false,finalGeometry:true}).passed,true);
  assert.equal(materialAudit(solution,verified).passed,true);
  const graph=new CurveGraph(candidate.graph.nested(candidate.points),cfg.width);
  const fitted=refineCurves(graph,prepared.objectiveProb,256,candidate.phase,{...verified,preferMatchingSheets:false},{input:source,steps:120,rate:.05,resolvePaperBeforeRollback:true});
  const finished=graph.solution(fitted.points,fitted.phase,source);
  assert.equal(validate(finished,verified,{checkImage:false,finalGeometry:true}).passed,true);
  assert.equal(materialAudit(finished,verified).passed,true);
  const exported=await renderExportedWeave(solutionJSON(finished),resolution);
  const error=exported.mask.reduce((sum,v,i)=>sum+Number(v!==mask[i]),0)/mask.length;
  assert.ok(error<cfg.maxImageError,`Continued fit disagrees on ${error} of original pixels.`);
  assert.equal(auditFeatureFidelity(source.sourceImage,exported.mask,verified).passed,true);
  assert.deepEqual(prepared.graph.points,before);
  assert.deepEqual(source.sourceImage,original);
  t.diagnostic(JSON.stringify({initialError:result.report.initialImageError,continuedError:result.report.imageError,exportedError:error}));
});

for(const status of ['uncertain','fail'])test(`an unfinished spacing repair cannot continue with ${status} paper`,async t=>{
  await loadBoundaryKernel();
  const source=input(),original=structuredClone(source.sourceImage),prepared=initializer(source);
  prepared.graph=new CurveGraph(fixture.paths,cfg.width);
  prepared.clear={phase:fixture.phase,model:{counts:fixture.counts}};
  const before=prepared.graph.points.slice();
  let clock=0,audits=0,result;
  const now=t.mock.method(performance,'now',()=>clock);
  try{
    result=repairClearanceInitializer(prepared,source,cfg,{
      onProgress:r=>{if(r.step>=40)clock=800;},
      paperAudit:()=>{audits++;return{passed:false,status,summary:{status}};},
    });
  }finally{now.mock.restore();}
  assert.ok(audits>0,'The improved geometry must reach the independent paper gate.');
  assert.equal(result.report.geometry.passed,true);
  assert.equal(result.report.features.passed,true);
  assert.ok(result.report.imageError<result.report.initialImageError);
  assert.equal(result.report.reason,'paper_rejected');
  assert.equal(result.report.accepted,false);
  assert.equal(result.candidate,null);
  assert.equal(result.continuation,undefined);
  assert.deepEqual(prepared.graph.points,before);
  assert.deepEqual(source.sourceImage,original);
});
