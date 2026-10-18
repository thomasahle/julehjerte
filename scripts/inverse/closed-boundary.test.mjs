import test from 'node:test';
import assert from 'node:assert/strict';
import {Cubic,pathPolyline} from '../../static/inverse/core/bezier.js';
import {nodeCurves,polygonArea} from '../../static/inverse/core/geometry.js';
import {buildGraph} from '../../static/inverse/core/graph.js';
import {sampleTarget} from '../../static/inverse/core/input.js';
import {settings} from '../../static/inverse/core/settings.js';
import {AUTOMATIC_PRESET} from '../../static/inverse/core/presets.js';

const cfg=settings({...AUTOMATIC_PRESET,width:60,timeLimit:3,trials:0,neighbors:8,connectorVariants:1});
const target=curves=>({width:60,phase:0,metadata:{},curves});
const loop=new Cubic([[30,40],[0,0],[60,0],[30,40]]);
const mismatch=(a,b)=>a.reduce((sum,v,i)=>sum+Number(v!==b[i]),0);

test('noding retains a real closed cubic at both ordinary and small scales',()=>{
  for(const scale of [1,.01]){
    const curve=new Cubic(loop.p.map(p=>p.map(v=>30+(v-30)*scale))),noded=nodeCurves([curve]);
    const area=cs=>Math.abs(polygonArea(pathPolyline(cs,1e-6)));
    assert.ok(area([curve])>0);
    assert.ok(noded.length>0,'Equal endpoints do not imply a pointlike curve.');
    assert.ok(Math.abs(area(noded)-area([curve]))<1e-8);
  }
});

test('production graph construction retains the area of a closed contour',()=>{
  const original=target([loop]),before=sampleTarget(original,400),graph=buildGraph(target([loop]),cfg);
  assert.ok(before.some(Boolean));
  assert.equal(mismatch(sampleTarget(graph.target,400),before),0);
  assert.ok(graph.edges.filter(e=>e.visible).length>=2);
  assert.ok(graph.edges.every(e=>e.u!==e.v));
});

test('a subcell boundary stub cannot turn into duplicate loops after endpoint normalization',()=>{
  const curves=[
    Cubic.line([20,0],[20,30]),Cubic.line([20,30],[20,30.000004]),
    Cubic.line([20,30.000004],[20,60]),Cubic.line([0,40],[60,40]),
  ];
  const before=sampleTarget(target(curves),400);
  for(const node of [false,true]){
    const graph=buildGraph(target(curves),cfg,{node});
    assert.ok(graph.edges.every(e=>e.u!==e.v),'No artificial self-loop may survive.');
    assert.equal(mismatch(sampleTarget(graph.target,400),before),0);
  }
});

test('a tiny straight segment crossing a vertex-cell boundary still connects its distinct vertices',()=>{
  const curve=Cubic.line([20,30.0000049],[20,30.0000051]);
  for(const node of [false,true]){
    const graph=buildGraph(target([curve]),cfg,{node});
    assert.equal(graph.edges.length,1);
    assert.notEqual(graph.edges[0].u,graph.edges[0].v);
  }
});

test('closed endpoint handling retains excursions when the cubic midpoint is also at its start',()=>{
  // A retracing cubic is not a valid cut, but must not be mistaken for a point
  // before the actual geometric validator can inspect it.
  const curve=new Cubic([[30,30],[10,30],[50,30],[30,30]]),graph=buildGraph(target([curve]),cfg,{node:false});
  assert.ok(graph.edges.filter(e=>e.visible).length>=4);
  assert.ok(graph.edges.every(e=>e.u!==e.v));
  const xs=graph.target.curves.flatMap(c=>c.flatten(1e-5).map(p=>p[0]));
  assert.ok(Math.min(...xs)<28&&Math.max(...xs)>32,'The nonzero excursions must remain.');
});
