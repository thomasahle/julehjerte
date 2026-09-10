import test from 'node:test';
import assert from 'node:assert/strict';
import {Cubic} from '../../static/inverse/core/bezier.js';
import {CurveGraph} from '../../static/inverse/core/direct/curves.js';
import {shortReturnProposal,finalizeShortReturns} from '../../static/inverse/core/direct/short-returns.js';
import {matchingSummary} from '../../static/inverse/core/direct/matching.js';
import {symmetryReport} from '../../static/inverse/core/direct/symmetry.js';
import {sampleWeave,validate} from '../../static/inverse/core/validate.js';
import {settings} from '../../static/inverse/core/settings.js';
import {AUTOMATIC_PRESET} from '../../static/inverse/core/presets.js';

const cfg=settings({...AUTOMATIC_PRESET,preferMatchingSheets:false,trials:0});
const line=(a,b)=>Cubic.line(a,b).p;
const chain=p=>p.slice(1).map((b,i)=>line(p[i],b));
const A=chain([[50,0],[50,45],[52,47],[50,46],[50,100]]);
const transpose=path=>path.map(c=>c.map(([x,y])=>[y,x]));

test('a short return becomes a span while matching sheets stay identical',()=>{
  const graph=new CurveGraph([[A],[transpose(A)]]),original=graph.points.slice(),p=shortReturnProposal(graph,graph.points,cfg);
  assert.ok(p);assert.equal(p.removedOccurrences,2);assert.equal(p.segmentsAfter,p.segmentsBefore-2);
  const result=p.graph.solution(p.graph.points,1);
  assert.ok(matchingSummary(result).identical);assert.ok(validate(result,cfg).passed);
  assert.deepEqual(graph.points,original);
});

for(const reverse of [false,true])test(`a ${reverse?'reversed':'forward'} shared return is replaced exactly once`,()=>{
  const common=reverse?A.slice(1,3).toReversed().map(c=>c.toReversed()):A.slice(1,3);
  const B=[line([0,common[0][0][1]],common[0][0]),...common,line(common.at(-1)[3],[100,common.at(-1)[3][1]])];
  const graph=new CurveGraph([[A],[B]]),p=shortReturnProposal(graph,graph.points,cfg);
  assert.ok(p);assert.equal(p.segmentsAfter,p.segmentsBefore-1);assert.equal(p.removedOccurrences,2);
  const shared=p.graph.occurrences.map((o,e)=>[o,e]).filter(([o])=>o.length===2);
  assert.equal(shared.length,1);assert.equal(p.graph.visible[shared[0][1]],false);
  assert.ok(validate(p.graph.solution(p.graph.points,1),cfg).passed);
});

test('contracting a return keeps its shared incoming curve connected to the other sheet',()=>{
  const B=[line([0,45],[50,45]),A[1],line([52,47],[100,47])];
  const graph=new CurveGraph([[A],[B]]),p=shortReturnProposal(graph,graph.points,cfg);
  assert.ok(p);assert.equal(p.removedOccurrences,1);
  const shared=p.graph.occurrences.map((o,e)=>[o,e]).filter(([o])=>o.length===2);
  assert.equal(shared.length,1);
  const control=p.graph.controls()[shared[0][1]];
  assert.ok(control.some(([x,y])=>x===50&&y===46),'The shared branch follows the contracted edge.');
  assert.ok(validate(p.graph.solution(p.graph.points,1),cfg).passed);
});

test('a path branching at the spur pins that geometric junction',()=>{
  const B=chain([[0,47],[52,47],[100,47]]),graph=new CurveGraph([[A],[B]]);
  assert.equal(shortReturnProposal(graph,graph.points,cfg),null);
});

for(const [name,points]of [
  ['right angle',[[50,0],[50,45],[51,45],[51,100]]],
  ['long detour',[[50,0],[50,30],[65,45],[50,35],[50,100]]],
  ['closed detour',[[50,0],[50,45],[52,47],[50,45],[50,100]]],
])test(`${name} is not a short-return shortcut`,()=>{
  const graph=new CurveGraph([[chain(points)],[chain([[0,70],[100,70]])]]);
  assert.equal(shortReturnProposal(graph,graph.points,cfg),null);
});

test('cleanup cannot trade away a drawn feature for a simpler cut',()=>{
  const graph=new CurveGraph([[A],[chain([[0,70],[100,70]])]]),seed=graph.solution(graph.points,1),mask=sampleWeave(seed,400);
  seed.graph.target.sourceImage={mask,resolution:400};
  const result=finalizeShortReturns(seed,cfg),after=sampleWeave(result,400);
  assert.deepEqual(after,mask,'No extra mask disagreement is granted for pruning a return.');
});

for(const mode of ['sym','anti'])test(`paired return contractions retain Within curve ${mode}`,()=>{
  const first=[[50,0],[50,30],[52,32],[50,31]];
  const a=chain([...first,...first.toReversed().map(([x,y])=>[mode==='anti'?100-x:x,100-y])]);
  const graph=new CurveGraph([[a],[transpose(a)]]),p=shortReturnProposal(graph,graph.points,cfg);
  assert.ok(p);assert.equal(p.removedOccurrences,4);
  const result=p.graph.solution(p.graph.points,1),symmetry=symmetryReport(result,{withinCurve:mode});
  assert.deepEqual(symmetry.honoured,symmetry.requested);
  assert.ok(matchingSummary(result).identical);assert.ok(validate(result,cfg).passed);
});
