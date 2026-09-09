import test from 'node:test';
import assert from 'node:assert/strict';
import {Cubic} from '../../static/inverse/core/bezier.js';
import {CurveGraph,renderCurves} from '../../static/inverse/core/direct/curves.js';
import {straightProposal,primitiveComplexity} from '../../static/inverse/core/direct/primitives.js';
import {selectStraightProposal,finalizePrimitives} from '../../static/inverse/core/direct/primitive-selection.js';
import {symmetryTies,applyTies,symmetryReport} from '../../static/inverse/core/direct/symmetry.js';
import {matchingGroups,projectMatching} from '../../static/inverse/core/direct/matching.js';
import {refineCurves} from '../../static/inverse/core/direct/refine.js';
import {mismatch} from '../../static/inverse/core/direct/grid.js';
import {settings} from '../../static/inverse/core/settings.js';
import {DIRECT_PRESET} from '../../static/inverse/core/presets.js';
import {solutionJSON,curvesOf} from '../../static/inverse/core/graph.js';
import {renderExportedWeave} from './export-renderer.mjs';

const noisy=[[25,0],[25.22,100/3],[24.78,200/3],[25,100]];
const curved=[[65,0],[65.22,100/3],[65.22,200/3],[65,100]];
const horizontal=Cubic.line([0,50],[100,50]).p;
const fixture=()=>new CurveGraph([[[noisy],[curved]],[[horizontal]]]);

test('one genuine small bend cannot veto a separate useful degree reduction',async()=>{
  const graph=fixture(),n=400,truth=new CurveGraph([[[Cubic.line([25,0],[25,100]).p],[curved]],[[horizontal]]]);
  const mask=renderCurves(truth,truth.points,1,n,32),straight=straightProposal(graph,graph.points,n);
  assert.equal(mismatch(renderCurves(graph,graph.points,1,n,32),mask),0);
  assert.ok(mismatch(renderCurves(graph,straight,1,n,32),mask)>0);
  const selected=selectStraightProposal(graph,graph.points,straight,mask,n,{mask});
  assert.equal(selected.accepted,1);assert.equal(selected.groups,2);
  assert.deepEqual(selected.mask,renderCurves(graph,selected.points,1,n,32));
  assert.equal(mismatch(selected.mask,mask),0);
  const input={sourceImage:{mask,resolution:n}},cfg=settings({...DIRECT_PRESET,trials:0});
  const fitted=refineCurves(graph,Float64Array.from(mask),n,1,cfg,{input,steps:0,selection:'mask'});
  assert.equal(fitted.geometryPassed,true);assert.equal(fitted.paperPassed,true);
  assert.equal(primitiveComplexity(graph,fitted.points).curved,2,'Do not alter the intermediate refinement result');
  const finished=finalizePrimitives(graph.solution(fitted.points,1,input),cfg);
  assert.equal(finished.report.finalPrimitiveSelection.applied,true);
  assert.equal(finished.report.finalPrimitiveSelection.curvedAfter,1);
  assert.deepEqual(curvesOf(finished,0,1)[0].p,curved,'Retain the real small bend exactly');
  const independently=await renderExportedWeave(solutionJSON(finished),n);
  const expected=await renderExportedWeave(solutionJSON(truth.solution(truth.points,1,input)),n);
  assert.deepEqual(independently.mask,expected.mask,'The exported reconstruction matches the analytic design in the independent renderer');
});

test('boundary deltas agree with full rendering for both phases, ties, weights and shared spans',()=>{
  // Partial and reversed coincident sections cancel. Other edges contain
  // backward runs and exact pixel-centre crossings. This tests the mask update,
  // not whether arbitrary geometry is a valid cutting template.
  const shared=[[30,30],[30.2,40],[29.8,50],[30,60]];
  const graph=new CurveGraph([
    [[Cubic.line([30,0],[30,30]).p,shared,Cubic.line([30,60],[30,100]).p],[noisy]],
    [[Cubic.line([0,60],[30,60]).p,shared.toReversed(),Cubic.line([30,30],[100,30]).p],[[[0,50],[40,50.4],[20,49.8],[100,50]]]]
  ]);
  const original=graph.points.slice();
  for(const n of [100,101,200])for(const phase of [1,-1])for(const weighted of [false,true]){
    const mask=renderCurves(graph,graph.points,phase,n,32),prob=Float64Array.from(mask,(v,i)=>i%11===0?1-v:v);
    const weights=weighted?Float64Array.from(mask,(_,i)=>i%n<n/3?0:(i%5+1)/5):null;
    const all=straightProposal(graph,graph.points,n),selected=selectStraightProposal(graph,graph.points,all,prob,n,{mask,weights});
    assert.ok(selected);
    assert.deepEqual(selected.mask,renderCurves(graph,selected.points,phase,n,32),`${n}/${phase}/${weighted}`);
    assert.ok(mismatch(selected.mask,prob,weights)<=mismatch(mask,prob,weights)+1e-12);
    assert.deepEqual(graph.points,original,'The selection must not mutate the continuous trajectory');
  }
});

test('complete symmetry groups are selected together, including matching and within-curve constraints',()=>{
  const half=[noisy,curved],paths=[half.map(c=>[c]),half.map(c=>[c.map(([x,y])=>[y,x])])],n=400;
  for(const spec of [{transpose:true},{transpose:true,withinCurve:'anti'},null]){
    const graph=new CurveGraph(paths),initial=graph.points.slice(),ties=symmetryTies(graph,spec),groups=ties?null:matchingGroups(graph);
    if(ties)applyTies(ties,graph.points,graph.points,{fixed:graph.fixed,original:initial});
    else projectMatching(graph.points,groups,graph.fixed,initial);
    const all=straightProposal(graph,graph.points,n);
    if(ties)applyTies(ties,all,all,{fixed:graph.fixed,original:initial});else projectMatching(all,groups,graph.fixed,initial);
    const mask=renderCurves(graph,graph.points,1,n,32),prob=Float64Array.from(mask,(v,i)=>i<n?n%2:v),selected=selectStraightProposal(graph,graph.points,all,prob,n,{mask,ties,groups});
    assert.ok(selected);
    assert.deepEqual(selected.mask,renderCurves(graph,selected.points,1,n,32));
    const checked=symmetryReport(graph.solution(selected.points,1,{}),spec||{transpose:true});
    assert.deepEqual(checked.honoured,checked.requested);
    for(let i=0;i<initial.length;i++)if(graph.fixed[i])assert.equal(selected.points[i],initial[i]);
  }
});

test('overlapping degree reductions are scored against already accepted changes',()=>{
  // Each of these two changes alone removes the same erroneous band. Applying
  // both restores that band, so their individual gains cannot simply be added.
  const a=[[25,0],[25.22,100/3],[25.22,200/3],[25,100]],b=a.map(([x,y])=>[x+.00001,y]);
  const graph=new CurveGraph([[[a],[b]],[[horizontal]]]),n=400,all=straightProposal(graph,graph.points,n);
  const mask=renderCurves(graph,graph.points,1,n,32),one=graph.points.slice();
  for(const i of graph.edges[0]){one[2*i]=all[2*i];one[2*i+1]=all[2*i+1];}
  const wanted=renderCurves(graph,one,1,n,32);
  assert.ok(mismatch(mask,wanted)>0);
  assert.deepEqual(renderCurves(graph,all,1,n,32),mask);
  const selected=selectStraightProposal(graph,graph.points,all,wanted,n,{mask});
  assert.equal(selected.accepted,1);assert.equal(selected.groups,2);
  assert.deepEqual(selected.mask,wanted);
  assert.deepEqual(renderCurves(graph,selected.points,1,n,32),wanted);
});

test('pixel-centre ties and moved endpoint closures retain the renderer convention',()=>{
  for(const phase of [1,-1])for(const endpoint of [false,true]){
    const graph=new CurveGraph([[[[[50,0],[50.2,100/3],[49.8,200/3],[50,100]]]],[[horizontal]]]),n=101;
    const proposal=endpoint?graph.points.slice():straightProposal(graph,graph.points,n);
    if(endpoint){
      const [e,d]=graph.paths[1][0],id=graph.edges[e][d===1?0:3];proposal[2*id+1]+=.8;
    }
    const mask=renderCurves(graph,graph.points,phase,n,32),wanted=renderCurves(graph,proposal,phase,n,32);
    assert.ok(mismatch(mask,wanted)>0,'Exercise actual pixel changes, including the x=50 pixel centres');
    const selected=selectStraightProposal(graph,graph.points,proposal,wanted,n,{mask});
    assert.ok(selected);assert.deepEqual(selected.mask,wanted);
    assert.deepEqual(renderCurves(graph,selected.points,phase,n,32),wanted);
  }
});

test('native SVG geometry is not simplified using its sampled preview',()=>{
  const graph=fixture(),n=400,truth=new CurveGraph([[[Cubic.line([25,0],[25,100]).p],[curved]],[[horizontal]]]);
  const mask=renderCurves(truth,truth.points,1,n,32),solution=graph.solution(graph.points,1,{metadata:{originalCubicsPreserved:true},sourceImage:{mask,resolution:n}});
  const before=solutionJSON(solution);
  assert.equal(finalizePrimitives(solution,settings({...DIRECT_PRESET,trials:0})),solution);
  assert.deepEqual(solutionJSON(solution),before);
  assert.equal(solution.report.finalPrimitiveSelection,undefined);
});
