import test from 'node:test';
import assert from 'node:assert/strict';
import {Cubic,distance} from '../../static/inverse/core/bezier.js';
import {sampleTarget} from '../../static/inverse/core/input.js';
import {solutionJSON} from '../../static/inverse/core/graph.js';
import {settings} from '../../static/inverse/core/settings.js';
import {AUTOMATIC_PRESET,SIMPLIFIED_PREPROCESSING} from '../../static/inverse/core/presets.js';
import {fixture} from './fixtures.mjs';
import {closestCurvePoint,projectJunctions,mergeStraightAnchors,boundaryAblationVariants,sampleCubicBoundary} from './experiments/graph-boundary-ablations.mjs';

const mismatch=(a,b)=>a.reduce((sum,v,i)=>sum+Number(v!==b[i]),0);
const target=curves=>({width:60,phase:0,curves,metadata:{}});

test('junction projection locates points on curved interiors and includes both endpoints',()=>{
  const curve=new Cubic([[5,5],[45,5],[10,45],[50,50]]),point=curve.point(.37);
  const found=closestCurvePoint(curve,point);
  assert.ok(found.distance<1e-8);assert.ok(Math.abs(found.t-.37)<1e-8);
  const line=Cubic.line([10,10],[50,10]);
  assert.equal(closestCurvePoint(line,[0,10]).t,0);
  assert.equal(closestCurvePoint(line,[60,10]).t,1);
});

test('reference junctions subdivide the observed curve without moving it toward the oracle',()=>{
  const line=Cubic.line([0,30],[60,30]),curved=new Cubic([[0,10],[20,0],[40,20],[60,10]]),original=[line,curved];
  const before=JSON.stringify(original.map(c=>c.p)),q=curved.point(.37);
  const result=projectJunctions(original,[[20,30.4],q,[30,59]],1);
  assert.equal(result.addedSegments,2);
  assert.deepEqual(result.projections.map(p=>p.matched),[true,true,false]);
  assert.ok(distance(result.projections[0].point,[20,30])<1e-8);
  assert.ok(result.curves.slice(0,2).every(c=>c.p.every(p=>Math.abs(p[1]-30)<1e-12)));
  assert.equal(mismatch(sampleCubicBoundary(target(original),400),sampleCubicBoundary(target(result.curves),400)),0);
  assert.equal(JSON.stringify(original.map(c=>c.p)),before);
  const expected=curved.split(.37);
  result.curves.slice(2).forEach((c,i)=>c.p.forEach((p,k)=>assert.ok(distance(p,expected[i].p[k])<1e-7)));
});

test('cubic boundary sampling preserves parity through crossings, horizontal rows and closed loops',()=>{
  const grid=[Cubic.line([0,20],[60,20]),Cubic.line([30,0],[30,60])],mask=sampleCubicBoundary(target(grid),120);
  for(let y=0;y<120;y++)for(let x=0;x<120;x++)assert.equal(mask[y*120+x],Number(x>=60)^Number(y>=40));
  const loop=new Cubic([[30,50],[0,0],[60,0],[30,50]]),before=sampleCubicBoundary(target([loop]),400),after=sampleCubicBoundary(target(loop.split(.371)),400);
  assert.ok(before.some(Boolean));assert.equal(mismatch(before,after),0);
  const inverted=sampleCubicBoundary({...target([loop]),phase:1},400);
  assert.equal(mismatch(before,inverted),400**2);
  const vertical=Cubic.line([33.25,0],[33.25,60]),full=sampleCubicBoundary(target([vertical]),400);
  for(const t of [.1,.33333333,.58375,.5])assert.equal(mismatch(full,sampleCubicBoundary(target(vertical.split(t)),400)),0,'A scanline through a new knot keeps the same parity.');
});

test('near-endpoint and duplicate projections preserve the entire original parameter interval',()=>{
  const curve=Cubic.line([0,10],[60,10]),result=projectJunctions([curve],[[1e-12,10],[30,10],[30,10],[60-1e-12,10]],1);
  assert.equal(result.curves.length,2);
  assert.deepEqual(result.curves[0].p[0],curve.p[0]);
  assert.deepEqual(result.curves.at(-1).p[3],curve.p[3]);
  assert.throws(()=>projectJunctions([curve],[],Infinity),/finite/);
});

test('merging straight anchors preserves a subdivided boundary and supports reversed edges',()=>{
  const curves=[Cubic.line([0,30],[15,30]),Cubic.line([45,30],[15,30]),Cubic.line([45,30],[60,30])],before=JSON.stringify(curves.map(c=>c.p));
  const merged=mergeStraightAnchors(curves,60);
  assert.equal(merged.removed.length,2);assert.equal(merged.curves.length,1);
  assert.equal(mismatch(sampleTarget(target(curves),400),sampleTarget(target(merged.curves),400)),0);
  assert.equal(JSON.stringify(curves.map(c=>c.p)),before);
});

test('straight-anchor removal retains crossings, corners, border vertices and curved excursions',()=>{
  const fixtures=[
    [Cubic.line([0,30],[30,30]),Cubic.line([30,30],[60,30]),Cubic.line([30,0],[30,30]),Cubic.line([30,30],[30,60])],
    [Cubic.line([0,30],[30,30.0001]),Cubic.line([30,30.0001],[60,30])],
    [Cubic.line([0,0],[30,0]),Cubic.line([30,0],[60,0])],
    [new Cubic([[0,30],[20,20],[25,30],[30,30]]),Cubic.line([30,30],[60,30])],
    [new Cubic([[0,30],[45,30],[15,30],[30,30]]),Cubic.line([30,30],[60,30])],
  ];
  for(const curves of fixtures){const merged=mergeStraightAnchors(curves,60);assert.equal(merged.removed.length,0);assert.equal(merged.curves.length,curves.length);}
});

test('boundary studies keep the source mask and cutting paths fixed and label all privileged variants',()=>{
  const reference=fixture('hidden-corner'),before=JSON.stringify(solutionJSON(reference)),mask=sampleTarget(reference.graph.target,240),saved=mask.slice();
  const raw={...AUTOMATIC_PRESET,...SIMPLIFIED_PREPROCESSING,width:60,algorithm:'trace',neighbors:8,connectorVariants:1,timeLimit:3,trials:0},cfg=settings(raw);
  const restricted={graph:{target:reference.graph.target,edges:reference.graph.edges.map(e=>e.visible?e:{visible:false,get curve(){throw new Error('Hidden connector geometry leaked into a boundary ablation.');}})},get paths(){throw new Error('Cutting-path ownership leaked into a boundary ablation.');}};
  const variants=boundaryAblationVariants({mask,n:240,reference:restricted,raw,cfg});
  assert.equal(variants.length,8);
  for(const variant of variants){
    assert.ok(variant.graph,`${variant.name}: ${variant.buildError}`);
    assert.ok(!('witness' in variant),'No reference cutting paths are supplied to a solve.');
    assert.equal(Boolean(variant.oracle),variant.name.startsWith('exact-')||variant.name.includes('reference-junctions'));
    if(variant.name.includes('reference-junctions')||variant.name.includes('merged-lines')||variant.name.includes('uniform-junctions'))assert.equal(variant.diagnostics.boundaryChangePixels,0,variant.name);
  }
  assert.equal(mismatch(mask,saved),0);assert.equal(JSON.stringify(solutionJSON(reference)),before);
});
