import test from 'node:test';
import assert from 'node:assert/strict';
import {symmetryEvidence,matchingGrid,matchingGroups,projectMatching,matchingPenalty,matchingSummary} from '../../static/inverse/core/direct/matching.js';
import {gridModel,gridPaths} from '../../static/inverse/core/direct/grid.js';
import {CurveGraph} from '../../static/inverse/core/direct/curves.js';
import {prepare,design} from '../../static/inverse/core/engine.js';
import {loadSolutionJSON} from '../../static/inverse/core/graph.js';
import {checkerPixels} from './fixtures.mjs';
import {renderExportedWeave} from './export-renderer.mjs';

test('identical-sheet lower bound counts observed disagreeing pairs once',()=>{
  const mask=Uint8Array.from([0,1,0,0]),source={mask,resolution:2};
  assert.equal(symmetryEvidence(source).minimumIdenticalImageError,.25);
  for(let diagonal=0;diagonal<2;diagonal++){
    const m=mask.slice();m[0]=m[3]=diagonal;
    assert.equal(symmetryEvidence({...source,mask:m}).minimumIdenticalImageError,.25);
  }
  assert.equal(symmetryEvidence({...source,validMask:Uint8Array.from([1,1,0,1])}).minimumIdenticalImageError,0);
});

test('matching preference has an analytic gradient on both sheet families',()=>{
  const graph=new CurveGraph(gridPaths(gridModel([3,3],8,17))),p=graph.points,g=matchingPenalty(graph,p).gradient,h=1e-4;
  for(const i of[0,2,15,29,51,p.length-9]){
    const a=p.slice(),b=p.slice();a[i]+=h;b[i]-=h;
    const finite=(matchingPenalty(graph,a).loss-matchingPenalty(graph,b).loss)/(2*h);
    assert.ok(Math.abs(finite-g[i])<1e-10);
  }
  const projected=p.slice();projectMatching(projected,matchingGroups(graph));
  assert.ok(matchingPenalty(graph,projected).loss<1e-20);
  assert.equal(matchingSummary(graph.solution(projected,1)).identical,true);
});

test('identical proposals preserve exact transposition and reject unequal counts',()=>{
  const original=gridModel([3,3],8,17),before=original.z.slice(),tied=matchingGrid(original),graph=new CurveGraph(gridPaths(tied));
  assert.deepEqual(original.z,before);assert.equal(matchingGrid(gridModel([2,3])),null);
  assert.equal(matchingSummary(graph.solution(graph.points,1)).identical,true);
});

test('matching projection respects a locked scalar with index zero',()=>{
  const points=Float64Array.from([1,9,7]),fixed=Uint8Array.from([1,0,0]);
  projectMatching(points,[[0,1,2]],fixed,Float64Array.from([1,9,7]));
  assert.deepEqual([...points],[1,1,1]);
});

test('a symmetric image exports one identical cutting pattern and stops before using the budget',async()=>{
  const input=checkerPixels(128),cfg={algorithm:'direct',timeLimit:30,trials:0,roundHidden:false,preferMatchingSheets:true,earlyStop:true},p=prepare(input,cfg),r=await design(p.target,cfg);
  assert.equal(r.report.templateExportAllowed,true);assert.equal(r.report.solver.matchingPreference.identical,true);
  assert.equal(r.report.solver.stoppedEarly,true);
  assert.equal(matchingSummary(loadSolutionJSON(r.files['cut_geometry.json'])).identical,true);
  const independent=await renderExportedWeave(r.files['cut_geometry.json'],128);
  assert.ok(independent.mask.reduce((s,v,i)=>s+Number(v!==p.preview.mask[i]),0)/independent.mask.length<.005);
});
