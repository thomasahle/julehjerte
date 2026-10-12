import test from 'node:test';
import assert from 'node:assert/strict';
import {Cubic,pathPolyline} from '../../static/inverse/core/bezier.js';
import {CurveGraph} from '../../static/inverse/core/direct/curves.js';
import {curvesOf} from '../../static/inverse/core/graph.js';
import {lineSimple} from '../../static/inverse/core/geometry.js';
import {selfIntersectionChains,visibleSelfIntersectionIssue} from '../../static/inverse/core/self-intersections.js';
import {validate,selfNecks} from '../../static/inverse/core/validate.js';
import {solveGraph} from '../../static/inverse/core/solver.js';
import {solveBoundary} from '../../static/inverse/core/routing.js';
import {settings} from '../../static/inverse/core/settings.js';
import {AUTOMATIC_PRESET} from '../../static/inverse/core/presets.js';

const cfg=settings({...AUTOMATIC_PRESET,timeLimit:3,maxRounds:3,trials:0});
const loop=[Cubic.line([50,0],[50,50]).p,[[50,50],[50.03,50.03],[49.97,50.03],[50.001,50]],Cubic.line([50.001,50],[50.001,100]).p];
function solution(path){const graph=new CurveGraph([[path],[[Cubic.line([0,80],[100,80]).p]]]);return graph.solution(graph.points,1);}
function reverseStorage(candidate){
  candidate.graph.edges=candidate.graph.edges.map(edge=>({...edge,u:edge.v,v:edge.u,curve:edge.curve.reversed()}));
  candidate.paths=candidate.paths.map(paths=>paths.map(path=>path.map(([edge,forward])=>[edge,!forward])));
  return candidate;
}

test('local crossing witnesses retain the validator crossing under reversal and reflection',()=>{
  for(const [flipX,flipY]of [[false,false],[true,false],[false,true],[true,true]]){
    let path=loop.map(c=>c.map(([x,y])=>[flipX?100-x:x,flipY?100-y:y]));
    if(flipY)path=path.reverse().map(c=>c.reverse());
    const candidate=solution(path),issues=validate(candidate,cfg).issues,chains=selfIntersectionChains(candidate,cfg,issues);
    assert.ok(issues.some(i=>i.type==='self_intersection'));assert.equal(selfNecks(candidate,cfg).length,0,'The tiny crossing lies inside the nonlocal-clearance exclusion.');
    assert.equal(chains.length,1);
    const witness=chains[0],curves=curvesOf(candidate,witness.family,witness.slit).slice(witness.curves[0],witness.curves[1]+1);
    assert.equal(lineSimple(pathPolyline(curves,cfg.geometryTolerance)),false);
    assert.equal(lineSimple(pathPolyline(curves.slice().reverse().map(c=>c.reversed()),cfg.geometryTolerance)),false);
    assert.ok(witness.edgeChain.length<candidate.graph.edges.length,'Unrelated cuts must stay out of the exclusion.');
  }
});

test('ordinary adjacent corners and subdivisions produce no crossing chains',()=>{
  for(const step of [1,5,20]){
    const points=[[20,0],[20,40],[70,40],[70,100]],path=[];
    for(let i=1;i<points.length;i++){
      const line=Cubic.line(points[i-1],points[i]),count=Math.ceil(line.length()/step);
      for(let j=0;j<count;j++)path.push(line.subcurve(j/count,(j+1)/count).p);
    }
    assert.deepEqual(selfIntersectionChains(solution(path),cfg),[]);
  }
});

test('routing excludes the crossing chain before paper checks or incumbent publication',async()=>{
  for(const reversed of [false,true]){
  const candidate=reversed?reverseStorage(solution(loop)):solution(loop);let audits=0,incumbents=0;
  await assert.rejects(solveGraph(candidate.graph,cfg,{
    onProgress:r=>{if(r.validatedIncumbent)incumbents++;},
    coreGate:()=>{audits++;return{passed:true,summary:{status:'pass'}};}
  }),error=>{
    assert.equal(error.report.termination,'candidate_graph_exhausted');
    assert.equal(error.report.history.length,2);
    assert.equal(error.report.history[0].selfIntersectionChains,1);
    assert.ok(error.report.history[0].issues.some(i=>i.type==='self_intersection'));
    return true;
  });
  assert.equal(audits,0);assert.equal(incumbents,0);
  }
});

test('an intrinsic required crossing skips MILP and connector expansion',async()=>{
  const candidate=solution(loop),before=JSON.stringify(candidate.graph.edges.map(e=>e.curve.p)),stages=[];
  assert.equal(visibleSelfIntersectionIssue(candidate.graph,cfg).type,'visible_edge_self_intersection');
  await assert.rejects(solveBoundary(candidate.graph.target,cfg,{initialGraph:candidate.graph,onProgress:r=>stages.push(r.stage)}),error=>{
    assert.equal(error.report.validationPreflight,true);assert.equal(error.report.termination,'candidate_graph_exhausted');
    assert.equal(error.report.connectorIndependentIssue.type,'visible_edge_self_intersection');
    assert.deepEqual(error.report.history,[]);assert.equal(error.report.neighborRetry,undefined);return true;
  });
  assert.ok(!stages.some(stage=>['model','solving'].includes(stage)));
  assert.equal(JSON.stringify(candidate.graph.edges.map(e=>e.curve.p)),before);
});

test('inexact endpoint joins defer the proof to the complete selected chain',()=>{
  const candidate=solution(loop),incoming=candidate.graph.edges[0].curve.p.map(p=>p.slice());incoming[3][0]+=1e-10;
  candidate.graph.edges[0].curve=new Cubic(incoming);
  assert.equal(visibleSelfIntersectionIssue(candidate.graph,cfg),null);
  const issues=validate(candidate,cfg).issues;
  assert.ok(issues.some(i=>i.type==='self_intersection'));
  const witnesses=selfIntersectionChains(candidate,cfg,issues);assert.equal(witnesses.length,1);
  assert.deepEqual(witnesses[0].directedChain,candidate.paths[0][0].slice(witnesses[0].curves[0],witnesses[0].curves[1]+1));
  const reversed=reverseStorage(candidate),other=selfIntersectionChains(reversed,cfg,issues)[0];
  assert.deepEqual(other.directedChain,witnesses[0].directedChain.map(([edge,forward])=>[edge,!forward]));
});
