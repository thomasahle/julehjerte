import test from 'node:test';
import assert from 'node:assert/strict';
import {Cubic} from '../../static/inverse/core/bezier.js';
import {buildGraph,solutionJSON} from '../../static/inverse/core/graph.js';
import {curveKey} from '../../static/inverse/core/symmetry.js';
import {CurveGraph} from '../../static/inverse/core/direct/curves.js';
import {settings} from '../../static/inverse/core/settings.js';
import {AUTOMATIC_PRESET} from '../../static/inverse/core/presets.js';
import {solveGraph} from '../../static/inverse/core/solver.js';
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
    const graph=buildGraph(target,cfg);
    assert.ok(graph.edges.some(e=>!e.visible&&curveKey(e.curve.p)===wanted),'Both nearest endpoints already have visible edges; the budget must reach the missing connection.');
    assert.deepEqual(graph.edges.filter(e=>e.visible).map(e=>e.curve.p),before);
    const visible=new Set(graph.edges.filter(e=>e.visible).map(e=>[e.u,e.v].sort((a,b)=>a-b).join(',')));
    assert.ok(graph.edges.filter(e=>!e.visible).every(e=>!visible.has([e.u,e.v].sort((a,b)=>a-b).join(','))));
  }
});

test('the recovered budget still rejects a connector crossing an unrelated boundary',()=>{
  const {target,wanted}=fixture();
  target.curves.push(Cubic.line([29,31],[31,29]));
  const graph=buildGraph(target,cfg);
  assert.ok(!graph.edges.some(e=>!e.visible&&curveKey(e.curve.p)===wanted));
});

test('the small connector budget can route and independently render the unchanged template',async()=>{
  const {reference,target}=fixture();
  assert.equal(validate(reference,cfg).passed,true);
  assert.equal(materialAudit(reference,cfg).passed,true);
  const graph=buildGraph(target,cfg);
  const solved=await solveGraph(graph,cfg,{stopAfterValidated:true,coreGate:s=>materialAudit(s,cfg)});
  assert.equal(validate(solved,cfg).passed,true);
  assert.equal(materialAudit(solved,cfg).passed,true);
  const expected=await renderExportedWeave(solutionJSON(reference),400);
  const actual=await renderExportedWeave(solutionJSON(solved),400);
  assert.deepEqual(actual.mask,expected.mask);
});
