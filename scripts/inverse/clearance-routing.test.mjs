import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {prepare,design} from '../../static/inverse/core/engine.js';
import {settings} from '../../static/inverse/core/settings.js';
import {CurveGraph} from '../../static/inverse/core/direct/curves.js';
import {subdivideDiagnosticPaths} from './self-return-subdivision-study.mjs';
import {loadSolutionJSON,solutionJSON,curvesOf} from '../../static/inverse/core/graph.js';
import {validate} from '../../static/inverse/core/validate.js';
import {materialAudit,verifiedPaperSettings} from '../../static/inverse/core/material.js';
import {finalMaterialAudit} from '../../static/inverse/core/geometric-material.js';
import {rejectedRoutingQuality,repairRejectedRouting} from '../../static/inverse/core/direct/rejected-routing.js';
import {renderExportedWeave} from './export-renderer.mjs';
import {captureFitFailure} from './diagnostics/fit-failure.mjs';

const fixture=JSON.parse(await fs.readFile('scripts/inverse/fixtures/sloth-clearance-routing.json'));
const cfg=settings({...fixture.configuration,invert:false,removeSpecks:0,fillHoles:0});
for(const entry of fixture.cases){
  const n=entry.resolution,mask=new Uint8Array(n*n);
  for(const[start,length]of entry.maskRuns)mask.fill(1,start,start+length);
  assert.equal(createHash('sha256').update(mask).digest('hex'),entry.maskSha256);
  const input=()=>prepare({type:'mask',mask,resolution:n},cfg).target;
  test(`bounded repair resolves a nonlocal slit neck without changing the ${entry.id} artwork`,async()=>{
    const source=input(),proposal=loadSolutionJSON(entry.proposal),before=JSON.stringify(solutionJSON(proposal)),quality=rejectedRoutingQuality(proposal,cfg);
    assert.equal(quality.repairable,true);assert.ok(quality.geometry.issues.some(i=>i.type==='nonlocal_self_clearance'));
    assert.ok(quality.geometry.issues.every(i=>['nonlocal_self_clearance','short_self_clearance'].includes(i.type)));
    assert.ok(quality.geometry.issues.length>4,'Multiple warnings must not suppress a bounded repair.');
    const repaired=repairRejectedRouting(proposal,source,cfg,{quality});
    assert.ok(repaired.solution,JSON.stringify(repaired.report));
    const checkedCfg=verifiedPaperSettings(repaired.solution,cfg);
    assert.equal(checkedCfg.materialResolution,entry.expectedPaperResolution);
    assert.equal(validate(repaired.solution,checkedCfg).passed,true);
    assert.equal(materialAudit(repaired.solution,checkedCfg).passed,true);
    if(entry.expectedPaperResolution>cfg.materialResolution){
      assert.equal(repaired.report.paperVerification.initialStatus,'uncertain');
      assert.equal(materialAudit(repaired.solution,cfg).status,'uncertain','The test must exercise a real lattice ambiguity.');
    }
    const rendered=await renderExportedWeave(solutionJSON(repaired.solution),n);
    assert.ok(rendered.mask.reduce((s,v,i)=>s+Number(v!==mask[i]),0)/mask.length<.02);
    assert.equal(JSON.stringify(solutionJSON(proposal)),before);assert.deepEqual(source.sourceImage.mask,mask);
  });
  test(`fresh ${entry.id} fitting carries repaired clearance through final export`,async t=>{
    const started=performance.now(),source=input(),answer=await design(source,cfg),report=answer.report;
    const seconds=(performance.now()-started)/1000;
    let exportedError=null;
    try{
    assert.ok(seconds<10,`Complete preparation, fitting and export took ${seconds} seconds.`);
    assert.equal(report.templateChecksPassed,true);assert.deepEqual(report.slits,{left:2,right:2});
    const attempt=report.solver.featureRecovery.attempts.find(a=>a.continuousRepair?.accepted||a.continuousRepair?.refinementSeedAvailable);
    assert.ok(attempt,'Recovery must retain a repaired routing, accepted or awaiting the common paper gate.');
    if(!attempt.continuousRepair.accepted){
      assert.equal(attempt.continuousRepair.reason,'paper_rejected');
      assert.equal(attempt.continuousRepair.paper.status,'uncertain');
    }
    const observed=attempt.rejectedCandidates.find(r=>r.reason==='repair_attempted');
    assert.equal(observed.integerCandidateSeconds,attempt.continuousRepair.integerCandidateSeconds);
    assert.ok(observed.repairBudgetSeconds>0);
    assert.ok(report.settings.materialResolution>=entry.expectedPaperResolution&&report.settings.materialResolution<=1000);
    if(report.settings.materialResolution>cfg.materialResolution)assert.equal(report.solver.paperVerification.resolution,report.settings.materialResolution);
    const exported=loadSolutionJSON(answer.files['cut_geometry.json']);
    assert.equal(validate(exported,report.settings,{checkImage:false,finalGeometry:true}).passed,true);
    assert.equal(finalMaterialAudit(exported,report.settings).status,'pass');
    const rendered=await renderExportedWeave(answer.files['cut_geometry.json'],n);
    exportedError=rendered.mask.reduce((s,v,i)=>s+Number(v!==mask[i]),0)/mask.length;
    assert.ok(exportedError<.02);
    assert.deepEqual(source.sourceImage.mask,mask);
    }catch(error){
      // Capture after the timed solve, including timing and late export
      // failures. Large inline reports can be truncated by the test runner.
      t.diagnostic(await captureFitFailure({answer,source:source.sourceImage,error:exportedError,maximum:.02,
        context:{fixture:'sloth-clearance-routing',id:entry.id,seconds,requestedConfiguration:cfg,assertion:error.message}}));
      throw error;
    }
  });
}


test('exact subdivision and reflection cannot disqualify the same clearance repair',()=>{
  for(const entry of fixture.cases){
    const original=loadSolutionJSON(entry.proposal),paths=original.paths.map((family,f)=>family.map((_,slit)=>curvesOf(original,f,slit).map(curve=>curve.p)));
    const before=rejectedRoutingQuality(original,cfg);
    assert.ok(before.repairable);
    for(const knots of [[0,1],[0,.5,1],[0,1/3,2/3,1],[0,.17,.61,1]])for(const reflect of [false,true]){
      const divided=subdivideDiagnosticPaths(paths,knots,reflect,cfg.width),graph=new CurveGraph(divided.paths,cfg.width);
      assert.ok(divided.maximumGeometryDifference<1e-10);
      const after=rejectedRoutingQuality(graph.solution(graph.points,1),cfg);
      assert.equal(after.geometry.passed,false,'Eligibility never certifies the invalid input.');
      assert.equal(after.repairable,true,JSON.stringify({case:entry.id,knots,reflect,quality:after}));
      assert.equal(after.affectedCuts,before.affectedCuts);
    }
  }
});
