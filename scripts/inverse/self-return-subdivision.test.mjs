import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {Cubic} from '../../static/inverse/core/bezier.js';
import {CurveGraph} from '../../static/inverse/core/direct/curves.js';
import {experimentalSelfReturns} from './diagnostics/self-return-candidate.mjs';
import {returnDiagnosticCases,subdivideDiagnosticPaths,diagnosticSubdivisions} from './self-return-subdivision-study.mjs';

test('the offline short-return proposal separates bends from saved and analytic narrow returns',async()=>{
  for(const entry of await returnDiagnosticCases()){
    const before=JSON.stringify(entry.paths),decisions=[];
    for(const knots of Object.values(diagnosticSubdivisions))for(const reflect of [false,true]){
      const transformed=subdivideDiagnosticPaths(entry.paths,knots,reflect);
      assert.ok(transformed.maximumGeometryDifference<1e-10,'Subdivision must preserve the continuous geometry.');
      const model=new CurveGraph(transformed.paths),solution=model.solution(model.points,1),issues=experimentalSelfReturns(solution,entry.cfg);
      decisions.push(issues.length>0);
      if(entry.expectedShortReturn!==null)assert.equal(issues.length>0,entry.expectedShortReturn,`${entry.name}: ${knots}, reflect=${reflect}`);
      for(const issue of issues){
        assert.ok(issue.distanceUpper<issue.required);
        assert.ok(issue.arcSeparation>=2*issue.required);
        assert.ok(issue.arcSeparation<=entry.cfg.localNeighborhoodFactor*entry.cfg.nominalWidth);
        assert.ok(issue.stationary||issue.totalTurning>=180-1e-6);
        assert.deepEqual(issue.edgeChain,solution.paths[issue.family][issue.slit].slice(issue.curves[0],issue.curves[1]+1).map(([edge])=>edge));
      }
    }
    assert.ok(decisions.every(v=>v===decisions[0]),entry.name+' must have one decision across exact representations.');
    assert.equal(JSON.stringify(entry.paths),before);
  }
});

test('the complete return search accepts captured ordinary SVG bends that fooled the old editor',async()=>{
 const fixture=JSON.parse(await fs.readFile('scripts/inverse/fixtures/editor-ordinary-bends.json'));
 for(const entry of fixture.cases){
  const {left,top,width,height}=entry.overlap,scale=p=>[(p.x-left)*100/width,(p.y-top)*100/height];
  const paths=[[],[entry.segments.map(s=>[s.p0,s.p1,s.p2,s.p3].map(scale))]];
  for(const knots of Object.values(diagnosticSubdivisions))for(const reflect of [false,true]){
   const divided=subdivideDiagnosticPaths(paths,knots,reflect),graph=new CurveGraph(divided.paths);
   assert.deepEqual(experimentalSelfReturns(graph.solution(graph.points,1),entry.settings),[],`${entry.name}: ${knots}, reflect=${reflect}`);
  }
 }
});

test('the captured photographic bend has the same experimental verdict before and after its original detail split',async()=>{
  const cases=(await returnDiagnosticCases()).filter(c=>c.name.startsWith('photographic-'));
  assert.equal(cases.length,2);
  for(const entry of cases){
    const model=new CurveGraph(entry.paths);
    assert.deepEqual(experimentalSelfReturns(model.solution(model.points,1),entry.cfg),[]);
  }
});

test('exported returns remain detectable with independent random knots on each cubic',async()=>{
 for(const entry of (await returnDiagnosticCases()).filter(c=>c.name.startsWith('editable-'))){
  let state=1729;
  const random=()=>((state=(Math.imul(state,1664525)+1013904223)>>>0)/2**32);
  for(let trial=0;trial<100;trial++){
    const paths=entry.paths.map(f=>f.map(p=>p.flatMap(points=>{
      const curve=new Cubic(points),knots=[0,...Array.from({length:1+Math.floor(random()*4)},random).sort((a,b)=>a-b),1];
      return knots.slice(1).map((hi,i)=>curve.subcurve(knots[i],hi).p);
    })));
    const model=new CurveGraph(paths),issues=experimentalSelfReturns(model.solution(model.points,1),entry.cfg);
    assert.ok(issues.length,`${entry.name}, random subdivision ${trial} must not hide the exported return.`);
    assert.ok(issues.every(issue=>issue.distanceUpper<issue.required));
  }
 }
});

test('turning roots are refreshed when reused cubics move between audits',async()=>{
 const entry=(await returnDiagnosticCases()).find(c=>c.name==='gift');
 // Store each occurrence in its path direction so audits revisit the same
 // objects rather than creating temporary reversed cubics. This check only
 // concerns the per-path return predicate, not shared-control fitting.
 const graph={target:{width:entry.cfg.width},edges:[]};
 const paths=entry.paths.map(f=>f.map(p=>p.map(points=>{
  graph.edges.push({curve:new Cubic(points)});return[graph.edges.length-1,true];
 })));
 const solution={graph,paths};
 const original=solution.graph.edges.map(e=>e.curve.p.map(p=>p.slice()));
 const warm=experimentalSelfReturns(solution,entry.cfg),saved=structuredClone(warm);
 assert.ok(warm.length,'The initial captured return must exercise the turning search.');
 let seed=1729;
 const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32);
 for(const amplitude of [.1,-.2,.5,0]){
  solution.graph.edges.forEach((edge,e)=>{
   // Move handles while retaining connected anchors and the same Cubic objects.
   edge.curve.p=original[e].map((p,k)=>p.map(v=>v+(k===1||k===2?amplitude*(2*random()-1):0)));
   edge.curve.cache.clear();
  });
  const fresh={...solution,graph:{...solution.graph,edges:solution.graph.edges.map(e=>({...e,curve:new Cubic(e.curve.p)}))}};
  assert.deepEqual(experimentalSelfReturns(solution,entry.cfg),experimentalSelfReturns(fresh,entry.cfg));
 }
 assert.deepEqual(warm,saved,'A later audit must not rewrite a previously reported witness.');
});
