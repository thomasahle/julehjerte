import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareBoundary,prepareTopologyBoundary,initializeTopology} from '../../static/inverse/core/direct/topology.js';
import {sampleTarget} from '../../static/inverse/core/input.js';
import {prepare,design} from '../../static/inverse/core/engine.js';
import {settings} from '../../static/inverse/core/settings.js';
import {AUTOMATIC_PRESET} from '../../static/inverse/core/presets.js';
import {referenceError} from '../../static/inverse/core/image-reference.js';
import {renderExportedWeave} from './export-renderer.mjs';
import {treeMask} from './tree-fixture.mjs';
import {Cubic} from '../../static/inverse/core/bezier.js';
import {CurveGraph} from '../../static/inverse/core/direct/curves.js';
import {sampleWeave,validate} from '../../static/inverse/core/validate.js';

const n=400,clean=treeMask(),cfg=settings({...AUTOMATIC_PRESET,trials:0,timeLimit:10});
const edgeNoise=(side,invert=false)=>treeMask({noisyEdges:[side],invert});

for(const counts of [[1,1],[13,12]])test(`reusing a ${counts.join('+')}-cut boundary cannot inherit a previous routing graph`,async()=>{
  // Unequal layouts avoid the separate transposed-boundary copy. The dense
  // case has only 25 original curves, but noding expands it beyond the 160
  // input-curve guard; mutating the cache made its second attempt fail.
  const graph=new CurveGraph(counts.map((count,f)=>Array.from({length:count},(_,i)=>{
    const t=counts[0]===1?(f?60:40):(i+1)*100/(count+1);
    return[Cubic.line(f?[0,t]:[t,0],f?[100,t]:[t,100]).p];
  }))),proposal=graph.solution(graph.points,1),mask=sampleWeave(proposal,n);
  const boundary=proposal.graph.target,input={...boundary,boundarySeed:boundary,sourceImage:{mask,probability:Float32Array.from(mask),resolution:n}};
  const originalCurves=boundary.curves,controls=originalCurves.map(c=>structuredClone(c.p)),source=structuredClone(input.sourceImage);
  for(let attempt=0;attempt<2;attempt++){
    const result=await initializeTopology(input,cfg,{seconds:2});
    assert.equal(result.report.accepted,true,`Routing attempt ${attempt+1}: ${JSON.stringify(result.report)}`);
    assert.equal(result.report.boundarySegments,counts[0]+counts[1]);
    assert.equal(input.boundarySeed,boundary);assert.equal(boundary.curves,originalCurves);
    assert.deepEqual(boundary.curves.map(c=>c.p),controls);assert.deepEqual(input.sourceImage,source);
    const solution=result.graph.solution(result.graph.points,result.phase,input);
    assert.equal(validate(solution,cfg).passed,true);
    assert.deepEqual(sampleWeave(solution,n),mask,'Repeated routing preserves the same input design.');
  }
});

test('valid endpoints keep their original boundary without repair',()=>{
  const input=prepare({type:'mask',mask:clean,resolution:n},cfg).target;
  const boundary=prepareBoundary(input,cfg),result=prepareTopologyBoundary(input,cfg);
  assert.equal(result.target,boundary);
  assert.equal(result.report,undefined);
});

for(const side of[0,1,2,3])for(const invert of[false,true])test(`edge noise on side ${side}, inverted=${invert}, recovers a seed without changing the reference`,()=>{
  const mask=edgeNoise(side,invert),input=prepare({type:'mask',mask,resolution:n},cfg).target;
  const boundary=prepareBoundary(input,cfg),before=sampleTarget(boundary,n),result=prepareTopologyBoundary(input,cfg);
  assert.equal(result.report.accepted,true);
  assert.equal(result.report.borderRadius,.5);
  assert.equal(result.report.border.changedPixels,20);
  assert.deepEqual(result.report.border.transitionsAfter,[3,3,3,3]);
  assert.equal(result.target.sourceImage,input.sourceImage);
  assert.deepEqual(input.sourceImage.mask,mask);
  assert.equal(input.boundarySeed,boundary);
  assert.deepEqual(sampleTarget(boundary,n),before,'The cached raw trace remains unchanged.');
  assert.ok(referenceError(input.sourceImage,sampleTarget(result.target,n)).mismatchFraction<=.002);
});

test('the original-image error cap can reject every border proposal',()=>{
  const mask=edgeNoise(0),input=prepare({type:'mask',mask,resolution:n},cfg).target;
  const result=prepareTopologyBoundary(input,cfg,{maximumError:0});
  assert.equal(result.report.accepted,false);
  assert.equal(result.report.attempts.length,4);
  assert.ok(result.report.attempts.every(a=>!a.accepted&&a.imageError>0));
  assert.equal(result.target,input.boundarySeed);
  assert.deepEqual(input.sourceImage.mask,mask);
});

test('matching endpoint counts still reject speckles narrower than a strip',()=>{
  const first=edgeNoise(0),opposite=edgeNoise(2),mask=Uint8Array.from(clean,(v,i)=>v^first[i]^opposite[i]);
  const input=prepare({type:'mask',mask,resolution:n},cfg).target,result=prepareTopologyBoundary(input,cfg);
  assert.match(result.report.trigger,/closer than the required strip width/);
  assert.equal(result.report.accepted,true);
  assert.equal(result.report.border.changedPixels,40);
  assert.deepEqual(result.report.border.transitionsBefore,[5,3,5,3]);
  assert.deepEqual(result.report.border.transitionsAfter,[3,3,3,3]);
});

test('weighted artwork keeps its existing initialization guide',()=>{
  const mask=edgeNoise(0),weights=new Float64Array(n*n).fill(.9),input=prepare({type:'mask',mask,weights,resolution:n},cfg).target;
  const result=prepareTopologyBoundary(input,cfg);
  assert.equal(result.target,input.boundarySeed);
  assert.equal(result.report,undefined);
  assert.deepEqual(input.sourceImage.weights,weights);
});

for(const side of[0,1,2,3])test(`mask-only fitting keeps three valid cuts after side ${side} noise`,async()=>{
  const mask=edgeNoise(side,side%2===1),prepared=prepare({type:'mask',mask,resolution:n},cfg);
  const answer=await design(prepared.target,cfg);
  assert.equal(answer.report.solver.termination,'validated_topology_seed');
  assert.equal(answer.report.solver.topologyInitialization.borderRecovery.accepted,true);
  assert.deepEqual(answer.report.slits,{left:3,right:3});
  assert.equal(answer.report.templateChecksPassed,true);
  const exported=await renderExportedWeave(answer.files['cut_geometry.json'],n);
  assert.ok(referenceError(prepared.target.sourceImage,exported.mask).mismatchFraction<=.002);
  assert.deepEqual(prepared.target.sourceImage.mask,mask);
});
