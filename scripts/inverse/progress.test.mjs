import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixtures.mjs';
import {settings} from '../../static/inverse/core/settings.js';
import {progressReporter} from '../../static/inverse/core/progress.js';
import {curvesOf,loadSolutionJSON,solutionJSON} from '../../static/inverse/core/graph.js';
import {CurveGraph,renderCurves} from '../../static/inverse/core/direct/curves.js';
import {refineCurves} from '../../static/inverse/core/direct/refine.js';
import {solveGraph} from '../../static/inverse/core/solver.js';
import {sampleWeave,validate} from '../../static/inverse/core/validate.js';
import {materialAudit} from '../../static/inverse/core/material.js';

test('geometry progress is opt-in and rejects non-boolean settings',()=>{
  assert.equal(settings().progressGeometry,false);
  assert.equal(settings({progressGeometry:true}).progressGeometry,true);
  for(const progressGeometry of[0,1,'true',null,{}])assert.throws(()=>settings({progressGeometry}),/progressGeometry/);
});

test('disabled geometry progress neither serializes candidates nor reads the clock',()=>{
  const event={stage:'directRefining',step:0,geometry:true},calls=[];
  const emit=progressReporter((...args)=>calls.push(args),false,{now:()=>{throw Error('Unexpected clock read');}});
  emit(event,{get graph(){throw Error('Unexpected serialization');}});
  assert.deepEqual(calls,[[event]]);
  assert.equal(calls[0][0],event);
});

test('all routes share one geometry rate limit and non-checkpoint events consume none',()=>{
  const solution=fixture('hidden-corner'),events=[];let time=0;
  const emit=progressReporter(event=>events.push({time,event}),true,{now:()=>time});
  const nested=progressReporter(emit,true);
  assert.equal(nested,emit);
  for(const stage of['directInitializing','directClearance','directPolishing'])emit({stage,step:0},solution);
  const rec={stage:'directRefining',step:0,counts:[1,1],geometry:true,error:.02};
  emit(rec,solution);
  time=100;nested({...rec,step:40},solution);
  time=250;nested({stage:'solving',validatedIncumbent:false},solution);
  nested({stage:'solving',validatedIncumbent:true,round:1},solution);
  time=499;emit({...rec,step:80},solution);
  time=500;emit({stage:'directRefining'},solution);emit({...rec,step:120},solution);
  const snapshots=events.filter(x=>typeof x.event.geometry==='string');
  assert.deepEqual(snapshots.map(x=>x.time),[0,250,500]);
  assert.deepEqual(snapshots.map(x=>x.event.stage),['directRefining','solving','directRefining']);
  assert.equal(rec.geometry,true,'Reporting must not overwrite the history record.');
  for(const {event}of snapshots)assert.deepEqual(JSON.parse(event.geometry),solutionJSON(solution));
});

test('snapshots own their coordinates and preserve shared paths, phase and paper colours',()=>{
  const solution=fixture('hidden-corner');solution.graph.target.phase=1;
  solution.graph.target.metadata.paperColors=['#112233','#ffeedd'];
  let snapshot;
  progressReporter(event=>snapshot=event.geometry,true)({stage:'directRefining',step:0},solution);
  const saved=loadSolutionJSON(snapshot),before=sampleWeave(saved,160);
  assert.deepEqual(solutionJSON(saved),solutionJSON(solution));
  assert.deepEqual(before,sampleWeave(solution,160));
  const shared=new Set(saved.paths[0].flat().map(([e])=>e));
  assert.ok(saved.paths[1].flat().some(([e])=>shared.has(e)));
  solution.graph.edges[0].curve.p[1][0]+=3;
  solution.graph.target.metadata.paperColors[0]='#000000';
  assert.notEqual(snapshot,JSON.stringify(solutionJSON(solution)));
  assert.deepEqual(before,sampleWeave(loadSolutionJSON(snapshot),160));
});

test('refinement snapshots describe each checkpoint without changing history or fitted controls',()=>{
  const source=fixture('straight'),graph=new CurveGraph(source.paths.map((family,f)=>family.map((_,i)=>curvesOf(source,f,i).map(c=>c.p))),60);
  graph.points[2*graph.edges[0][1]]+=3;
  const original=graph.points.slice(),prob=Float64Array.from(sampleWeave(source,80));
  const cfg=settings({width:60,trials:0,preferMatchingSheets:false,materialResolution:120});
  const before=refineCurves(graph,prob,80,1,cfg,{steps:80});
  let clock=0;const events=[];
  const emit=progressReporter(event=>events.push(event),true,{now:()=>clock+=300});
  const after=refineCurves(graph,prob,80,1,{...cfg,progressGeometry:true},{steps:80,onProgress:(rec,solution)=>emit({stage:'directRefining',counts:[2,2],...rec},solution)});
  assert.deepEqual(after.points,before.points);
  assert.deepEqual(after.history,before.history);
  assert.deepEqual(graph.points,original);
  assert.ok(events.length>=4);
  for(const event of events){
    assert.equal(typeof event.geometry,'string');
    const snapshot=loadSolutionJSON(event.geometry),mask=sampleWeave(snapshot,80);
    const error=mask.reduce((sum,v,i)=>sum+Math.abs(v-prob[i]),0)/mask.length;
    assert.ok(Math.abs(error-event.error)<.002,'Snapshot and checkpoint error must describe the same candidate.');
    assert.deepEqual(snapshot.paths.map(f=>f.length),event.counts);
  }
  assert.ok(after.history.every(rec=>typeof rec.geometry==='boolean'));
  assert.deepEqual(renderCurves(graph,after.points,1,80),renderCurves(graph,before.points,1,80));
});

test('MILP publishes a validated incumbent even when its first valid solution ends the search',async()=>{
  const source=fixture('straight'),cfg=settings({width:60,trials:0,timeLimit:5,maxRounds:1,progressGeometry:true});
  const events=[];let audits=0;
  const solved=await solveGraph(source.graph,cfg,{stopAfterValidated:true,coreGate:s=>{audits++;return materialAudit(s,cfg);},onProgress:event=>events.push({audits,event})});
  const snapshots=events.filter(x=>typeof x.event.geometry==='string');
  assert.equal(snapshots.length,1);
  assert.equal(snapshots[0].audits,1);
  assert.equal(snapshots[0].event.validatedIncumbent,true);
  assert.equal(snapshots[0].event.stage,'solving');
  assert.deepEqual(JSON.parse(snapshots[0].event.geometry),solutionJSON(solved));
  const replay=loadSolutionJSON(snapshots[0].event.geometry);
  assert.equal(validate(replay,cfg).passed,true);
  assert.equal(materialAudit(replay,cfg).passed,true);
});

test('a MILP candidate rejected by the paper gate is never published as an incumbent',async()=>{
  const source=fixture('straight'),cfg=settings({width:60,trials:0,timeLimit:5,maxRounds:1,progressGeometry:true}),events=[];
  await assert.rejects(solveGraph(source.graph,cfg,{stopAfterValidated:true,onProgress:event=>events.push(event),coreGate:()=>({passed:false,summary:{status:'fail'}})}),/No validated/);
  assert.ok(events.length>0);
  assert.ok(events.every(event=>typeof event.geometry!=='string'&&event.validatedIncumbent!==true));
});
