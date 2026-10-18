import test from 'node:test';
import assert from 'node:assert/strict';
import {Cubic} from '../../static/inverse/core/bezier.js';
import {CurveGraph} from '../../static/inverse/core/direct/curves.js';
import {projectShortReturns} from '../../static/inverse/core/direct/short-return-project.js';
import {validate} from '../../static/inverse/core/validate.js';
import {settings} from '../../static/inverse/core/settings.js';
import {AUTOMATIC_PRESET} from '../../static/inverse/core/presets.js';
import fs from 'node:fs/promises';
import {completeSelfReturns} from '../../static/inverse/core/complete-self-returns.js';

test('resolving a local return still cannot certify a fixed wrong endpoint',()=>{
  const cfg=settings(AUTOMATIC_PRESET),line=(a,b)=>Cubic.line(a,b).p;
  const returning=[line([50,.2],[50,48]),[[50,48],[53,48],[53,49],[50,49]],line([50,49],[50,100])];
  const graph=new CurveGraph([[returning],[[line([0,80],[100,80])]]]),before=graph.points.slice();
  const initial=validate(graph.solution(before,1),cfg,{checkImage:false,finalGeometry:true});
  assert.ok(initial.issues.some(i=>i.type==='wrong_endpoints'));
  // Even an incomplete caller audit cannot hide another violation from the
  // final gate. The endpoint stays pinned while the local return is repaired.
  const partial={...initial,issues:initial.issues.filter(i=>i.type==='short_self_clearance')};
  assert.ok(partial.issues.length);
  const result=projectShortReturns(graph,before,1,{},cfg,{initialAudit:partial,maxIterations:64,maxMilliseconds:2000});
  assert.equal(result.report.finalReturns,0,'Exercise a completed local correction.');
  assert.equal(result.report.rejected,'final_geometry');
  assert.equal(result.report.accepted,false);
  assert.equal(result.points,null);
  assert.deepEqual(graph.points,before);
});

test('an immutable return stops hidden-only projection before it moves unrelated shared controls',async()=>{
  const saved=JSON.parse(await fs.readFile(new URL('./fixtures/final-hidden-return.json',import.meta.url)));
  const graph=new CurveGraph(saved.paths,saved.settings.width),before=graph.points.slice();
  const initial=validate(graph.solution(before,saved.phase),saved.settings,{checkImage:false,finalGeometry:true});
  assert.ok(initial.issues.length>1);assert.ok(initial.issues.every(i=>i.type==='short_self_clearance'));
  const fixed=initial.issues[0],path=graph.paths[graph.families[fixed.family][fixed.slit]];
  for(const order of fixed.curves)for(const id of graph.edges[path[order][0]])graph.fixed.fill(1,2*id,2*id+2);
  const visible=new Set(graph.edges.flatMap((ids,e)=>graph.visible[e]?ids:[]));
  assert.ok(initial.issues.some(issue=>{
    const p=graph.paths[graph.families[issue.family][issue.slit]];
    return issue.curves.some(order=>graph.edges[p[order][0]].some(id=>!visible.has(id)&&(!graph.fixed[2*id]||!graph.fixed[2*id+1])));
  }),'Other returns still have movable hidden controls.');
  const result=projectShortReturns(graph,before,saved.phase,{},saved.settings,{initialAudit:initial,hiddenOnly:true,maxIterations:64,maxMilliseconds:Infinity});
  assert.equal(result.points,null);assert.equal(result.report.accepted,false);
  assert.equal(result.report.termination,'fixed_witness');assert.equal(result.report.displacements,0);
  assert.equal(result.report.returnConstraintAudits,0);
  assert.deepEqual(result.report.fixedWitness,{family:fixed.family,slit:fixed.slit,curves:fixed.curves});
  assert.deepEqual(graph.points,before);
});

test('cached return checks match fresh checks after control, direction and clearance changes',async()=>{
  const saved=JSON.parse(await fs.readFile(new URL('./fixtures/final-hidden-return.json',import.meta.url)));
  const graph=new CurveGraph(saved.paths,saved.settings.width),original=graph.points.slice(),cache=new Map();
  const check=solution=>{
    const expected=completeSelfReturns(solution),actual=completeSelfReturns(solution,{cache});
    assert.deepEqual(actual,expected);
    return actual;
  };
  const first=check(graph.solution(original,saved.phase));assert.ok(first.length);
  const previous=new Map(cache);
  check(graph.solution(original,saved.phase));
  for(const [key,value]of previous)assert.equal(cache.get(key),value,'Unchanged paths reuse their checked coordinates.');
  // Mutating a returned witness cannot change another invocation's answers.
  first[0].points[0][0]+=100;first[0].parameters[0]=.123;first[0].curves[0]=1000;
  check(graph.solution(original,saved.phase));
  const changed=original.slice();
  const handle=graph.edges[0][1];changed[2*handle]+=.25;
  check(graph.solution(changed,saved.phase));
  assert.ok([...previous].some(([key,value])=>cache.get(key)!==value),'Moving controls invalidates affected paths.');
  assert.ok([...previous].some(([key,value])=>cache.get(key)===value),'Unmoved paths retain their exact results.');
  const reversed=graph.solution(changed,saved.phase);
  reversed.paths[0][0]=reversed.paths[0][0].slice().reverse().map(([edge,direction])=>[edge,!direction]);
  check(reversed);
  const resized=graph.solution(changed,saved.phase);resized.graph.target.width*=1.1;
  check(resized);
  check(graph.solution(original,saved.phase));
  assert.deepEqual(graph.points,original);
});
