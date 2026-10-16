import test from 'node:test';
import assert from 'node:assert/strict';
import {Cubic} from '../../static/inverse/core/bezier.js';
import {CurveGraph,renderCurves} from '../../static/inverse/core/direct/curves.js';
import {refineCurves} from '../../static/inverse/core/direct/refine.js';
import {settings} from '../../static/inverse/core/settings.js';

const paths=x=>[[[Cubic.line([x,0],[x,100]).p]],[[Cubic.line([0,40],[100,40]).p]]];
const coordinates=solution=>solution.graph.edges.map(e=>e.curve.p);
const paper=passed=>({passed,status:passed?'pass':'uncertain',summary:{passed,status:passed?'pass':'uncertain'}});

for(const selection of ['boundary','mask'])test(`${selection} refinement explores worse valid fits but rolls back to its best valid checkpoint`,()=>{
  const target=new CurveGraph(paths(40.5)),probability=Float64Array.from(renderCurves(target,target.points,1,256));
  const originalProbability=probability.slice(),graph=new CurveGraph(paths(40)),originalPoints=graph.points.slice();
  const cfg=settings({requireMaterialCore:true,preferMatchingSheets:false,materialResolution:100});
  // A large first step overshoots this nearly aligned target. Inject an
  // unresolved paper audit at the next checkpoint to isolate rollback policy
  // from lattice resolution. Real-photo tests exercise the actual paper gate.
  const records=[];let auditCalls=0;
  const fitted=refineCurves(graph,probability,256,1,cfg,{
    steps:3,checkpointEvery:1,rate:2,selection,
    paperAudit:()=>paper(![3,4].includes(++auditCalls)),
    onProgress:(record,solution)=>records.push({...record,coordinates:coordinates(solution)})
  });
  const initial=records.find(r=>r.step===-1),overshoot=records.find(r=>r.step===0);
  const rejected=records.filter(r=>r.step===1),resumed=records.find(r=>r.step===2);
  assert.equal(initial.paper,'pass');assert.equal(overshoot.paper,'pass');
  assert.ok(overshoot.score>initial.score&&overshoot.error>initial.error);
  assert.equal(rejected.length,2,'Exercise both straightened and ordinary proposals.');
  assert.ok(rejected.every(r=>r.geometry&&r.paper==='uncertain'));
  assert.ok(rejected.every(r=>r.score<overshoot.score&&r.score>initial.score),
    'The optimizer must keep exploring from a worse valid point until a checkpoint fails.');

  // Independently restart from the best valid geometry at the reduced rate.
  // The next attempted geometry must match, regardless of straightening.
  const restarted=[];
  refineCurves(new CurveGraph(paths(40)),probability,256,1,cfg,{
    steps:1,checkpointEvery:1,rate:2*.65,selection,paperAudit:()=>paper(true),
    onProgress:(record,solution)=>{if(record.step===0)restarted.push(coordinates(solution));}
  });
  assert.deepEqual(resumed.coordinates,restarted[0]);
  assert.equal(fitted.paperPassed,true);assert.equal(fitted.geometryPassed,true);
  assert.ok(fitted.score<=initial.score);
  assert.deepEqual(graph.points,originalPoints);assert.deepEqual(probability,originalProbability);
});
