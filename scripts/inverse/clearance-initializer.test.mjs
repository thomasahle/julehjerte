import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {prepare,design} from '../../static/inverse/core/engine.js';
import {settings} from '../../static/inverse/core/settings.js';
import {loadSolutionJSON,solutionJSON,curvesOf} from '../../static/inverse/core/graph.js';
import {Cubic} from '../../static/inverse/core/bezier.js';
import {CurveGraph} from '../../static/inverse/core/direct/curves.js';
import {resizeObjective} from '../../static/inverse/core/direct/image-objective.js';
import {repairClearanceInitializer} from '../../static/inverse/core/direct/clearance-repair.js';
import {loadBoundaryKernel} from '../../static/inverse/core/direct/native.js';
import {polishCandidate} from '../../static/inverse/core/direct/polish.js';
import {materialAudit,verifiedPaperSettings} from '../../static/inverse/core/material.js';
import {validate} from '../../static/inverse/core/validate.js';
import {renderExportedWeave} from './export-renderer.mjs';

const fixture=JSON.parse(await fs.readFile(new URL('./fixtures/leaf-clearance-initializer.json',import.meta.url)));
const cfg=settings({...fixture.configuration,timeLimit:10,trials:0}),{resolution,maskRuns}=fixture.source,mask=new Uint8Array(resolution**2);
let offset=0;
for(let i=0;i<maskRuns.length;i+=2){mask.fill(maskRuns[i],offset,offset+maskRuns[i+1]);offset+=maskRuns[i+1];}
assert.equal(offset,mask.length);
assert.equal(createHash('sha256').update(mask).digest('hex'),fixture.source.sha256);
const input=()=>prepare({type:'mask',mask:mask.slice(),resolution},cfg).target;
function initializer(source){
  const proposal=loadSolutionJSON(fixture.geometry),graph=new CurveGraph(proposal.paths.map((family,f)=>family.map((_,i)=>curvesOf(proposal,f,i).map(c=>c.p))),cfg.width);
  const objective=resizeObjective(source.sourceImage.probability,resolution,256);
  return{graph,clear:{phase:proposal.graph.target.phase?-1:1,model:{counts:proposal.paths.map(f=>f.length)}},objectiveProb:objective.probability,objectiveWeights:objective.weights};
}

test('the common fitter repairs a rejected initializer and preserves its finer paper check through polishing',async t=>{
  await loadBoundaryKernel();
  const source=input(),prepared=initializer(source),before=prepared.graph.points.slice(),probability=source.sourceImage.probability.slice();
  const initial=validate(prepared.graph.solution(before,prepared.clear.phase,source),cfg,{checkImage:false});
  assert.equal(initial.passed,false);
  assert.ok(initial.issues.some(i=>i.type==='inter_slit_clearance'&&i.distanceLower<1.1));
  const repair=repairClearanceInitializer(prepared,source,cfg,{geometry:initial});
  if(!repair.candidate)t.diagnostic(JSON.stringify(repair.report));
  assert.ok(repair.candidate);
  assert.equal(repair.report.accepted,true);
  assert.equal(repair.candidate.paperVerification.resolution,700);
  assert.equal(repair.candidate.paperVerification.status,'pass');
  const candidate=repair.candidate,solution=candidate.graph.solution(candidate.points,candidate.phase,source);
  solution.report={paperVerification:candidate.paperVerification};
  const verified=verifiedPaperSettings(solution,cfg);
  assert.equal(validate(solution,verified,{checkImage:false,finalGeometry:true}).passed,true);
  assert.equal(materialAudit(solution,verified).passed,true);
  const polished=polishCandidate(candidate,prepared.objectiveProb,256,cfg,{input:source,steps:10});
  assert.equal(polished.paperVerification.resolution,700);
  assert.equal(polished.paperVerification.status,'pass');
  const exported=await renderExportedWeave(solutionJSON(solution),resolution);
  assert.ok(exported.mask.reduce((sum,v,i)=>sum+Number(v!==mask[i]),0)/mask.length<.02);
  assert.deepEqual(prepared.graph.points,before);
  assert.deepEqual(source.sourceImage.mask,mask);assert.deepEqual(source.sourceImage.probability,probability);
});

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
  const before=prepared.graph.points.slice(),result=repairClearanceInitializer(prepared,source,cfg);
  assert.equal(result.candidate,null);assert.equal(result.report.reason,'geometry_not_repairable');
  assert.equal(result.report.initialGeometry.passed,false);
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
  if(!report.templateChecksPassed)t.diagnostic(JSON.stringify({termination:report.solver.termination,counts:report.slits,clearanceComparison:report.solver.clearanceComparison}));
  assert.equal(report.templateChecksPassed,true);
  assert.equal(report.solver.clearanceComparison.repair.accepted,true);
  assert.ok(report.settings.materialResolution>=700);
  assert.equal(report.solver.paperVerification.status,'pass');
  const woven=await renderExportedWeave(answer.files['cut_geometry.json'],resolution);
  assert.ok(woven.mask.reduce((sum,v,i)=>sum+Number(v!==mask[i]),0)/mask.length<.02);
  assert.deepEqual(source.sourceImage.mask,mask);
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
