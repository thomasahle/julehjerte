import test from 'node:test';
import assert from 'node:assert/strict';
import {Cubic,distance} from '../../static/inverse/core/bezier.js';
import {buildGraph,solutionJSON,reindex,visibleEndpointNeighborhoods} from '../../static/inverse/core/graph.js';
import {CurveGraph} from '../../static/inverse/core/direct/curves.js';
import {curveKey} from '../../static/inverse/core/symmetry.js';
import {validate} from '../../static/inverse/core/validate.js';
import {materialAudit} from '../../static/inverse/core/material.js';
import {solveGraph} from '../../static/inverse/core/solver.js';
import {settings} from '../../static/inverse/core/settings.js';
import {AUTOMATIC_PRESET} from '../../static/inverse/core/presets.js';
import {renderExportedWeave} from './export-renderer.mjs';

const cfg=settings({...AUTOMATIC_PRESET,width:60,timeLimit:3,trials:0,neighbors:16,connectorVariants:1});
const start=[20,20],end=[40,40],key=curveKey(Cubic.line(start,end).p);
const lines=points=>points.slice(1).map((p,i)=>Cubic.line(points[i],p));
function boundary(incoming=lines([[20,0],start]),extra=[]){
  return{width:60,phase:0,metadata:{},curves:[...incoming,...lines([end,[40,60]]),...lines([[0,20],start]),...lines([end,[60,40]]),...extra]};
}
const contains=(graph,wanted=key)=>graph.edges.some(e=>!e.visible&&curveKey(e.curve.p)===wanted);

test('a valid connector survives subdivision of its adjacent visible boundaries',()=>{
  assert.equal(contains(buildGraph(boundary(),cfg,{node:false})),true);
  for(const gaps of [[.0001],[.001],[.01586],[.018,.012,.006,.001]]){
    const target=boundary(lines([[20,0],...gaps.map(g=>[20,20-g]),start]));
    const before=target.curves.map(c=>c.p);
    const graph=buildGraph(target,cfg,{node:false});
    assert.equal(contains(graph),true,`boundary fragments ${gaps}`);
    assert.deepEqual(graph.edges.filter(e=>e.visible).map(e=>e.curve.p),before,'Candidate generation cannot move the motif.');
    const noded=buildGraph(boundary(lines([[20,0],...gaps.map(g=>[20,20-g]),start])),cfg);
    assert.equal(contains(noded),true,`production noding with boundary fragments ${gaps}`);
  }
});

test('subdivision recovery is independent of visible edge orientation and a quarter turn',()=>{
  const target=boundary(lines([[20,0],[20,19.999],start]));
  const rotate=p=>[60-p[1],p[0]];
  target.curves=target.curves.reverse().map(c=>new Cubic(c.p.slice().reverse().map(rotate)));
  const wanted=curveKey(Cubic.line(rotate(start),rotate(end)).p);
  assert.equal(contains(buildGraph(target,cfg,{node:false}),wanted),true);
});

test('a nearby unrelated boundary still blocks a hidden connector',()=>{
  const target=boundary(lines([[20,0],[20,19.999],start]),lines([[25,25.005],[35,35.005]]));
  assert.equal(contains(buildGraph(target,cfg,{node:false})),false);
});

test('proximity through a long boundary detour does not count as local adjacency',()=>{
  const incoming=lines([[20,0],[20,19.999],[20.015,19.985],[20.015,20],start]);
  assert.equal(contains(buildGraph(boundary(incoming),cfg,{node:false})),false);
});

test('optional hidden candidates cannot make unrelated visible edges locally adjacent',()=>{
  const foreign=[20.005,20.005],graph=reindex({edges:[
    {visible:true,curve:Cubic.line([20,0],start)},
    {visible:false,curve:Cubic.line(start,foreign)},
    {visible:true,curve:Cubic.line(foreign,[40,40.005])},
  ]});
  const atStart=graph.points.findIndex(p=>distance(p,start)<1e-9),near=visibleEndpointNeighborhoods(graph,.02)[atStart];
  assert.deepEqual([...near],[0]);
});

test('an adjacent boundary that crosses the connector away from its endpoint still blocks it',()=>{
  const incoming=[new Cubic([[20,0],[55,50],[5,50],[20,19.999]]),Cubic.line([20,19.999],start)];
  assert.equal(contains(buildGraph(boundary(incoming),cfg,{node:false})),false);
});

test('HiGHS can use the restored connector and independently reproduce the unchanged motif',async()=>{
  const paths=[
    [[...lines([[20,0],[20,19.999],start,end,[40,60]]).map(c=>c.p)]],
    [[...lines([[0,20],start,end,[60,40]]).map(c=>c.p)]],
  ];
  const curves=new CurveGraph(paths,60),reference=curves.solution(curves.points,1);
  assert.equal(validate(reference,cfg).passed,true);
  const target={...reference.graph.target,metadata:{...reference.graph.target.metadata},curves:reference.graph.target.curves.map(c=>new Cubic(c.p))};
  const graph=buildGraph(target,cfg,{node:false});
  assert.equal(contains(graph),true);
  const solved=await solveGraph(graph,cfg,{stopAfterValidated:true,coreGate:s=>materialAudit(s,cfg)});
  assert.equal(validate(solved,cfg).passed,true);
  assert.equal(materialAudit(solved,cfg).passed,true);
  assert.ok(solved.paths.flat(2).some(([e])=>!graph.edges[e].visible&&distance(graph.edges[e].curve.p[0],start)<1e-6));
  const expected=await renderExportedWeave(solutionJSON(reference),400),actual=await renderExportedWeave(solutionJSON(solved),400);
  assert.deepEqual(actual.mask,expected.mask);
});
