import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadSolutionJSON,solutionJSON,curvesOf} from '../../static/inverse/core/graph.js';
import {CurveGraph,renderCurves} from '../../static/inverse/core/direct/curves.js';
import {refineCurves} from '../../static/inverse/core/direct/refine.js';
import {polishCandidate} from '../../static/inverse/core/direct/polish.js';
import {verifyCandidatePaper} from '../../static/inverse/core/direct/candidate-verification.js';
import {finalMaterialAudit} from '../../static/inverse/core/geometric-material.js';
import {validate} from '../../static/inverse/core/validate.js';
import {auditFeatureFidelity} from '../../static/inverse/core/feature-shapes.js';
import {loadNumericalKernel} from '../../static/inverse/core/numerical-kernel.js';
import {renderExportedWeave} from './export-renderer.mjs';

async function viking(){
  const fixture=JSON.parse(await fs.readFile(new URL('./fixtures/rejected-viking-paper.json',import.meta.url)));
  const image=JSON.parse(await fs.readFile(new URL('./fixtures/photographic-viking-cleanup.json',import.meta.url)));
  const solution=loadSolutionJSON(fixture.geometry),input=solution.graph.target,mask=new Uint8Array(image.resolution**2);
  for(const[start,length]of image.maskRuns)mask.fill(1,start,start+length);
  input.sourceImage={resolution:image.resolution,mask,probability:Float32Array.from(mask)};
  const paths=solution.paths.map((f,k)=>f.map((_,i)=>curvesOf(solution,k,i).map(c=>c.p))),graph=new CurveGraph(paths,input.width);
  const candidate={graph,points:graph.points.slice(),phase:input.phase?-1:1,counts:solution.paths.map(f=>f.length),
    geometryPassed:true,paperPassed:true,imagePassed:true,originalFeatures:{passed:true},originalImageError:.017925};
  await loadNumericalKernel();return{candidate,input,cfg:fixture.settings};
}

test('ordinary polishing repairs the Viking core before the final export deadline',async t=>{
  const {candidate,input,cfg}=await viking(),source=structuredClone(input.sourceImage),points=candidate.points.slice(),fixed=candidate.graph.fixed.slice();
  // Equal optimization work isolates the paper objective from runner speed.
  // No saved cutting paths enter a fresh photo benchmark's initialization.
  t.mock.method(performance,'now',()=>0);
  const options={input,steps:160,rate:.008,selection:'mask'},prob=source.probability,n=source.resolution;
  const before=refineCurves(candidate.graph,prob,n,candidate.phase,cfg,options);
  const after=polishCandidate(candidate,prob,n,cfg,options);
  assert.equal(before.steps,160);assert.equal(after.steps,160);
  assert.equal(after.outlineDetail,undefined,'Exercise existing spans, not the already guarded subdivision path.');
  const errors=[];
  for(const [index,result]of [before,after].entries()){
    const solution=result.graph.solution(result.points,result.phase,input),paper=finalMaterialAudit(solution,cfg);
    assert.equal(validate(solution,cfg,{checkImage:false,finalGeometry:true}).passed,true);
    assert.equal(paper.summary.latticeStatus,'pass');
    assert.equal(paper.offset.status,index?'pass':'fail');
    const exported=await renderExportedWeave(solutionJSON(solution),n);
    errors.push(exported.mask.reduce((s,v,i)=>s+Number(v!==source.mask[i]),0)/source.mask.length);
    assert.equal(auditFeatureFidelity(source,exported.mask,cfg).passed,true);
  }
  assert.equal(before.paperPassed,true,'The old lattice alone misses the disconnected core.');
  assert.equal(after.paperPassed,true);
  assert.equal(after.history[0].paper,'fail','The starting defect must be detected during polishing.');
  assert.ok(errors[1]<.018&&errors[1]<errors[0],`Independent errors: ${errors}`);
  assert.deepEqual(candidate.points,points);assert.deepEqual(candidate.graph.fixed,fixed);assert.deepEqual(input.sourceImage,source);
  assert.ok(after.points.every((v,i)=>!fixed[i]||v===points[i]));
  t.diagnostic(JSON.stringify({beforeError:errors[0],afterError:errors[1],steps:after.steps}));
});

test('an expired ordinary polish cannot declare a lattice-only Viking safe',async t=>{
  const {candidate,input,cfg}=await viking();t.mock.method(performance,'now',()=>1001);
  const after=polishCandidate(candidate,input.sourceImage.probability,input.sourceImage.resolution,cfg,{input,steps:160,deadline:1000});
  assert.equal(after.steps,0);assert.equal(after.paperPassed,false);
  assert.equal(after.paper.offset.status,'fail');
  assert.equal(verifyCandidatePaper(after,input,cfg,{recheckFailed:true}),false,'A finer lattice cannot waive a known offset failure.');
  assert.equal(after.paperPassed,false);
});

test('offset guidance preserves an already valid grid at equal optimization work',async t=>{
  const {cfg}=await viking();t.mock.method(performance,'now',()=>0);
  const line=(a,b)=>Array.from({length:4},(_,j)=>a.map((v,i)=>v+(b[i]-v)*j/3));
  const paths=[0,1].map(f=>[25,50,75].map(v=>[f===0?line([v,0],[v,100]):line([0,v],[100,v])]));
  const graph=new CurveGraph(paths,cfg.width),prob=Float64Array.from(renderCurves(graph,graph.points,1,96));
  const candidate={graph,points:graph.points,phase:1,counts:[3,3]},options={steps:41,rate:.008,selection:'mask'};
  const before=refineCurves(graph,prob,96,1,cfg,options),after=polishCandidate(candidate,prob,96,cfg,options);
  assert.equal(after.paperPassed,true);assert.deepEqual(after.points,before.points);
  assert.equal(finalMaterialAudit(graph.solution(after.points,1),cfg).status,'pass');
});
