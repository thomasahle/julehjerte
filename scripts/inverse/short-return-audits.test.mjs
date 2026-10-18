import test from 'node:test';
import assert from 'node:assert/strict';
import {Cubic} from '../../static/inverse/core/bezier.js';
import {CurveGraph} from '../../static/inverse/core/direct/curves.js';
import {projectShortReturns} from '../../static/inverse/core/direct/short-return-project.js';
import {validate} from '../../static/inverse/core/validate.js';
import {settings} from '../../static/inverse/core/settings.js';
import {AUTOMATIC_PRESET} from '../../static/inverse/core/presets.js';

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
