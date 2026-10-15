import test from 'node:test';
import assert from 'node:assert/strict';
import {Cubic,distance} from '../../static/inverse/core/bezier.js';
import {CurveGraph} from '../../static/inverse/core/direct/curves.js';
import {curvesOf} from '../../static/inverse/core/graph.js';
import {settings} from '../../static/inverse/core/settings.js';
import {nonlocalClearanceWitnesses,clearanceWitnesses} from '../../static/inverse/core/direct/clearance-witnesses.js';
import {completeSelfReturns} from '../../static/inverse/core/complete-self-returns.js';
import {projectShortReturns} from '../../static/inverse/core/direct/short-return-project.js';

const path=points=>points.slice(1).map((p,i)=>Cubic.line(points[i],p).p);
test('long-neck witnesses locate the actual cubic points across subdivision and reflection',()=>{
  const cfg=settings({nominalWidth:2.5}),margin=3;
  for(const divide of [false,true])for(const reflect of [false,true]){
    let cut=path([[30,0],[30,60],[32,60],[32,10],[60,10],[60,100]]);
    if(divide)cut=cut.flatMap(p=>new Cubic(p).split(.37).map(c=>c.p));
    if(reflect)cut=cut.map(c=>c.map(([x,y])=>[100-x,y]));
    const graph=new CurveGraph([[cut],[]]),solution=graph.solution(graph.points,1),issues=nonlocalClearanceWitnesses(solution,cfg,margin);
    assert.ok(issues.length>0&&issues.length<=4);
    assert.ok(issues.some(i=>Math.abs(i.distanceUpper-2)<1e-8));
    for(const issue of issues){
      const curves=curvesOf(solution,issue.family,issue.slit);
      assert.ok(issue.parameters.every(t=>t>=0&&t<=1));
      assert.deepEqual(issue.points,issue.curves.map((c,k)=>curves[c].point(issue.parameters[k])));
      assert.equal(issue.distanceUpper,distance(...issue.points));assert.ok(issue.required>=margin);
    }
    const base=completeSelfReturns(solution),combined=clearanceWitnesses(solution,cfg,margin);
    assert.deepEqual(combined.slice(0,base.length),base,'A wider search must retain every original editor-rule witness.');
  }
  const wide=new CurveGraph([[path([[30,0],[30,60],[36,60],[36,10],[60,10],[60,100]])],[]]);
  assert.deepEqual(nonlocalClearanceWitnesses(wide.solution(wide.points,1),cfg,margin),[]);
});

test('clearance projection refuses pre-existing crossings rather than treating witnesses as a validity check',()=>{
  const graph=new CurveGraph([[path([[20,0],[60,60],[20,60],[60,20],[60,100]])],[]]),before=graph.points.slice(),cfg=settings({nominalWidth:2.5});
  const result=projectShortReturns(graph,before,1,{},cfg,{clearanceMargin:3,maxMilliseconds:1000});
  assert.equal(result.points,null);assert.equal(result.report.termination,'other_geometry');assert.deepEqual(graph.points,before);
});
