import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareBoundary,prepareTopologyBoundary} from '../../static/inverse/core/direct/topology.js';
import {sampleTarget} from '../../static/inverse/core/input.js';
import {prepare,design} from '../../static/inverse/core/engine.js';
import {settings} from '../../static/inverse/core/settings.js';
import {AUTOMATIC_PRESET} from '../../static/inverse/core/presets.js';
import {referenceError} from '../../static/inverse/core/image-reference.js';
import {renderExportedWeave} from './export-renderer.mjs';
import {treeMask} from './tree-fixture.mjs';

const n=400,clean=treeMask(),cfg=settings({...AUTOMATIC_PRESET,trials:0,timeLimit:10});
const edgeNoise=(side,invert=false)=>treeMask({noisyEdges:[side],invert});

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
