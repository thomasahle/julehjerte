import test from 'node:test';
import assert from 'node:assert/strict';
import {buildReturnSearch} from './build-return-search.mjs';
import {ReturnCurve,pathReturns} from '../../static/inverse/core/return-search.js';
import {Cubic} from '../../static/inverse/core/bezier.js';
import {CurveGraph} from '../../static/inverse/core/direct/curves.js';
import {curvesOf} from '../../static/inverse/core/graph.js';
import {experimentalSelfReturns} from './diagnostics/self-return-candidate.mjs';
import {returnDiagnosticCases,diagnosticSubdivisions,subdivideDiagnosticPaths} from './self-return-subdivision-study.mjs';

test('worker return geometry is exactly generated from the standalone typed implementation',async()=>{
  await buildReturnSearch({check:true});
});

test('typed and native cubic return searches retain every complete captured witness',async()=>{
  for(const entry of await returnDiagnosticCases())for(const knots of Object.values(diagnosticSubdivisions))for(const reflect of [false,true]){
    const divided=subdivideDiagnosticPaths(entry.paths,knots,reflect,entry.cfg.width),graph=new CurveGraph(divided.paths,entry.cfg.width),solution=graph.solution(graph.points,1);
    const expected=experimentalSelfReturns(solution,entry.cfg),margin=Math.min(entry.cfg.nominalWidth,.015*entry.cfg.width);
    for(let family=0;family<2;family++)for(let slit=0;slit<divided.paths[family].length;slit++){
      const curves=curvesOf(solution,family,slit),before=JSON.stringify(curves.map(c=>c.p));
      const options={margin,local:entry.cfg.localNeighborhoodFactor*entry.cfg.nominalWidth,tolerance:entry.cfg.geometryTolerance,endpointTolerance:.01*entry.cfg.width};
      const reference=expected.filter(r=>r.family===family&&r.slit===slit).map(r=>Object.fromEntries(Object.entries(r).filter(([k])=>!['family','slit','edgeChain'].includes(k))));
      for(const input of [curves,curves.map(c=>new ReturnCurve(c.p))])assert.deepEqual(pathReturns(input,options),reference,entry.name+' '+knots+' '+reflect);
      assert.equal(JSON.stringify(curves.map(c=>c.p)),before);
    }
  }
});

test('editing reused cubic controls invalidates earlier return geometry',()=>{
  const controls=gap=>[Cubic.line([50,0],[50,48]).p,[[50,48],[53,48],[53,48+gap],[50,48+gap]],Cubic.line([50,48+gap],[50,100]).p];
  const original=controls(2),snapshot=structuredClone(original);
  const curves=original.map(p=>new ReturnCurve(p)),options={margin:1.5,endpointTolerance:1};
  assert.deepEqual(pathReturns(curves,options),[]);
  const edited=controls(1);
  curves.forEach((curve,i)=>curve.p.forEach((point,j)=>point.splice(0,2,...edited[i][j])));
  const found=pathReturns(curves,options);
  assert.ok(found.length,'Flattening cached before this edit misses the narrowed return.');
  assert.deepEqual(found,pathReturns(edited.map(p=>new ReturnCurve(p)),options));
  assert.deepEqual(original,snapshot,'Editing the curve must not change the caller’s coordinates.');
});
