import test from 'node:test';
import assert from 'node:assert/strict';
import {Cubic} from '../../static/inverse/core/bezier.js';
import {buildGraph,solutionJSON} from '../../static/inverse/core/graph.js';
import {curveKey} from '../../static/inverse/core/symmetry.js';
import {CurveGraph} from '../../static/inverse/core/direct/curves.js';
import {settings} from '../../static/inverse/core/settings.js';
import {AUTOMATIC_PRESET} from '../../static/inverse/core/presets.js';
import {solveGraph} from '../../static/inverse/core/solver.js';
import {solveBoundary} from '../../static/inverse/core/routing.js';
import {validate} from '../../static/inverse/core/validate.js';
import {materialAudit} from '../../static/inverse/core/material.js';
import {renderExportedWeave} from './export-renderer.mjs';

const cfg=settings({...AUTOMATIC_PRESET,width:60,neighbors:2,connectorVariants:1,timeLimit:3,trials:0});
const lines=points=>points.slice(1).map((p,i)=>Cubic.line(points[i],p).p);
function fixture(transform=p=>p){
  const paths=[
    [[20,0],[20,19],[20,20],[40,40],[40,41],[40,60]],
    [[0,20],[19,20],[20,20],[40,40],[41,40],[60,40]],
  ].map(points=>[lines(points.map(transform))]);
  const curves=new CurveGraph(paths,60),reference=curves.solution(curves.points,1);
  const target={...reference.graph.target,metadata:{},curves:reference.graph.target.curves.map(c=>new Cubic(c.p))};
  return{reference,target,wanted:curveKey(Cubic.line(transform([20,20]),transform([40,40])).p)};
}

test('visible neighbors do not consume the optional connector budget',()=>{
  for(const transform of [p=>p,p=>[60-p[1],p[0]],p=>[60-p[0],p[1]]]){
    const {target,wanted}=fixture(transform),before=target.curves.map(c=>c.p);
    const graph=buildGraph(target,cfg,{unconnectedNeighbors:true});
    assert.ok(graph.edges.some(e=>!e.visible&&curveKey(e.curve.p)===wanted),'Both nearest endpoints already have visible edges; the budget must reach the missing connection.');
    assert.deepEqual(graph.edges.filter(e=>e.visible).map(e=>e.curve.p),before);
    const visible=new Set(graph.edges.filter(e=>e.visible).map(e=>[e.u,e.v].sort((a,b)=>a-b).join(',')));
    assert.ok(graph.edges.filter(e=>!e.visible).every(e=>!visible.has([e.u,e.v].sort((a,b)=>a-b).join(','))));
  }
});

test('the recovered budget still rejects a connector crossing an unrelated boundary',()=>{
  const {target,wanted}=fixture();
  target.curves.push(Cubic.line([29,31],[31,29]));
  const graph=buildGraph(target,cfg,{unconnectedNeighbors:true});
  assert.ok(!graph.edges.some(e=>!e.visible&&curveKey(e.curve.p)===wanted));
});

test('an exhausted small graph expands its connector budget and exports the unchanged template',async()=>{
  const {reference,target}=fixture(),before=target.curves.map(c=>c.p);
  assert.equal(validate(reference,cfg).passed,true);
  assert.equal(materialAudit(reference,cfg).passed,true);
  await assert.rejects(solveGraph(buildGraph({...target,curves:target.curves.slice()},cfg),cfg,{stopAfterValidated:true,coreGate:s=>materialAudit(s,cfg)}),e=>e.report?.termination==='candidate_graph_exhausted');
  const solved=await solveBoundary(target,cfg,{stopAfterValidated:true,coreGate:s=>materialAudit(s,cfg)});
  assert.equal(solved.report.neighborRetry.initial.termination,'candidate_graph_exhausted');
  assert.ok(solved.report.neighborRetry.addedCandidates>0);
  assert.equal(solved.graph.metadata.unconnectedNeighbors,true);
  assert.deepEqual(target.curves.map(c=>c.p),before,'A retry must not normalize or edit the caller\'s boundary.');
  assert.equal(validate(solved,cfg).passed,true);
  assert.equal(materialAudit(solved,cfg).passed,true);
  const expected=await renderExportedWeave(solutionJSON(reference),400);
  const actual=await renderExportedWeave(solutionJSON(solved),400);
  assert.deepEqual(actual.mask,expected.mask);
});

test('a successful first routing keeps the smaller graph and needs no retry',async()=>{
  const {target}=fixture(),wide={...cfg,neighbors:8};let models=0;
  const solved=await solveBoundary(target,wide,{stopAfterValidated:true,coreGate:s=>materialAudit(s,wide),onProgress:p=>{if(p.stage==='model')models++;}});
  assert.equal(solved.graph.metadata.unconnectedNeighbors,false);
  assert.equal(solved.report.neighborRetry,undefined);
  assert.equal(models,1);
});

test('a cached initial graph can expand from the original boundary without renoding it twice',async()=>{
  const {target}=fixture(),before=target.curves.map(c=>c.p);
  const initialGraph=buildGraph({...target,curves:target.curves.slice()},cfg);
  const solved=await solveBoundary(target,cfg,{initialGraph,stopAfterValidated:true,coreGate:s=>materialAudit(s,cfg)});
  assert.equal(solved.report.neighborRetry.initial.termination,'candidate_graph_exhausted');
  assert.deepEqual(solved.graph.target.curves.map(c=>c.p),initialGraph.target.curves.map(c=>c.p));
  assert.deepEqual(target.curves.map(c=>c.p),before);
});

test('exhaustion without any new connections does not repeat the same MILP',async()=>{
  const {target}=fixture(),wide={...cfg,neighbors:40};let models=0;
  // An isolated interior boundary cannot be assigned a complete slit; all
  // eligible endpoint pairs already fit the large neighbor budget.
  target.curves.push(Cubic.line([10,40],[10,45]));
  await assert.rejects(solveBoundary(target,wide,{stopAfterValidated:true,onProgress:p=>{if(p.stage==='model')models++;}}),e=>e.report?.termination==='candidate_graph_exhausted'&&!e.report.neighborRetry);
  assert.equal(models,1);
});
