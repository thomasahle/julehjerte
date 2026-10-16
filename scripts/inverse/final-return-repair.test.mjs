import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {Cubic} from '../../static/inverse/core/bezier.js';
import {CurveGraph} from '../../static/inverse/core/direct/curves.js';
import {settings} from '../../static/inverse/core/settings.js';
import {AUTOMATIC_PRESET} from '../../static/inverse/core/presets.js';
import {validate} from '../../static/inverse/core/validate.js';
import {finish} from '../../static/inverse/core/engine.js';
import {solutionJSON,loadSolutionJSON,curvesOf} from '../../static/inverse/core/graph.js';
import {completeSelfReturns} from '../../static/inverse/core/complete-self-returns.js';
import {refineCurves} from '../../static/inverse/core/direct/refine.js';
import {repairFinalReturns} from '../../static/inverse/core/direct/final-return-repair.js';
import {renderExportedWeave} from './export-renderer.mjs';

function returningCut(width,gap){
  const x=width/2,y=.45*width;
  return [Cubic.line([x,0],[x,y]).p,[[x,y],[x+3*gap,y],[x+3*gap,y+gap],[x,y+gap]],Cubic.line([x,y+gap],[x,width]).p];
}

test('dense polygon sampling confirms the anchor return missed by the old local-pair editor rule',async()=>{
  const fixture=JSON.parse(await fs.readFile('scripts/inverse/fixtures/editor-anchor-return.json'));
  const solution=loadSolutionJSON({...fixture,schema:'heartcurves-2',units:'mm'});
  const witness=completeSelfReturns(solution).find(i=>i.family===1&&i.slit===1);
  assert.ok(witness);
  const curves=curvesOf(solution,1,1),points=[];
  for(let i=witness.curves[0];i<=witness.curves[1];i++){
    const lo=i===witness.curves[0]?witness.parameters[0]:0,hi=i===witness.curves[1]?witness.parameters[1]:1;
    for(let j=points.length?1:0;j<=1000;j++)points.push(curves[i].point(lo+(hi-lo)*j/1000));
  }
  const vectors=points.slice(1).map((p,i)=>p.map((v,k)=>v-points[i][k]));
  const arc=vectors.reduce((sum,v)=>sum+Math.hypot(...v),0);
  const turn=vectors.slice(1).reduce((sum,v,i)=>sum+Math.abs(Math.atan2(vectors[i][0]*v[1]-vectors[i][1]*v[0],vectors[i][0]*v[0]+vectors[i][1]*v[1]))*180/Math.PI,0);
  const gap=Math.hypot(...points[0].map((v,i)=>v-points.at(-1)[i]));
  assert.ok(gap<1.5&&arc>3&&turn>190,JSON.stringify({gap,arc,turn}));
  assert.ok(Math.abs(turn-witness.totalTurning)<.1);
});

test('final validation uses the editor clearance at different paper widths and minimum-strip settings',()=>{
  for(const [width,minWidth]of [[100,2],[300,2],[100,.1]]){
    const cfg=settings({...AUTOMATIC_PRESET,width,minWidth}),gap=.8*.015*width;
    const graph=new CurveGraph([[returningCut(width,gap)],[[Cubic.line([0,.8*width],[width,.8*width]).p]]],width);
    const result=validate(graph.solution(graph.points,1),cfg,{checkImage:false,finalGeometry:true});
    const returns=result.issues.filter(i=>i.type==='short_self_clearance');
    assert.equal(result.passed,false,JSON.stringify({width,minWidth}));
    assert.ok(returns.length);
    assert.ok(returns.every(i=>i.required===.015*width));
    assert.ok(returns.every(i=>i.distanceUpper<i.required));
  }
});

test('final inter-cut clearance includes the editor margin when it exceeds the requested manufacturing width',()=>{
  const cfg=settings({...AUTOMATIC_PRESET,width:300});
  const graph=new CurveGraph([[[Cubic.line([100,0],[100,300]).p],[Cubic.line([103.6,0],[103.6,300]).p]],[[Cubic.line([0,250],[300,250]).p]]],300);
  const solution=graph.solution(graph.points,1);
  assert.equal(validate(solution,cfg,{checkImage:false,finalGeometry:false}).passed,true,'The explicitly selected legacy diagnostic uses only the manufacturing width.');
  assert.equal(validate(solution,cfg,{checkImage:false}).passed,false,'Ordinary candidate validation must use the same clearance as export.');
  const final=validate(solution,cfg,{checkImage:false,finalGeometry:true});
  assert.equal(final.passed,false);
  assert.ok(final.issues.some(i=>i.type==='inter_slit_clearance'));
  assert.equal(final.editorClearanceRequired,4.5);
});

test('public final export repairs hidden returns while retaining image pixels and solver provenance',async()=>{
  const fixture=JSON.parse(await fs.readFile('scripts/inverse/fixtures/final-hidden-return.json'));
  const graph=new CurveGraph(fixture.paths,fixture.settings.width),input=graph.solution(graph.points,fixture.phase);
  const before=solutionJSON(input),woven=await renderExportedWeave(before,400);
  input.graph.target.sourceImage={mask:woven.mask,resolution:400};
  input.graph.target.metadata.testProvenance='retained input';input.report.testProvenance='retained solver';
  const result=finish(input,fixture.settings,()=>{},{refine:false});
  assert.equal(result.report.finalReturnRepair.accepted,true);
  assert.equal(result.report.validation.finalGeometry,true);
  assert.equal(result.report.templateChecksPassed,true);
  assert.equal(result.report.input.testProvenance,'retained input');
  assert.equal(result.report.solver.testProvenance,'retained solver');
  const exported=await renderExportedWeave(result.files['cut_geometry.json'],400);
  assert.deepEqual(exported.mask,woven.mask,'Independent exported pixels must remain unchanged.');
  assert.deepEqual(solutionJSON(input),before,'Final repair must not mutate the incoming geometry.');
});

test('an expired final repair never certifies an unresolved return or removes the downloadable templates',()=>{
  const cfg=settings(AUTOMATIC_PRESET),graph=new CurveGraph([[returningCut(100,1)],[[Cubic.line([0,80],[100,80]).p]]]);
  const input=graph.solution(graph.points,1),before=solutionJSON(input);
  const repair=repairFinalReturns(input,cfg,{deadline:-Infinity});
  assert.equal(repair.solution,input);
  assert.equal(repair.report.accepted,false);
  assert.equal(repair.validation.passed,false);
  const result=finish(input,cfg,()=>{},{refine:false,deadline:-Infinity});
  assert.equal(result.report.templateChecksPassed,false);
  assert.equal(result.report.templateExportAllowed,true);
  assert.ok(result.files['template_left.svg']&&result.files['template_right.svg']);
  assert.deepEqual(solutionJSON(input),before);
});

test('a visible return repair is rejected when it worsens the original image',async()=>{
  const cfg=settings(AUTOMATIC_PRESET),graph=new CurveGraph([[returningCut(100,1)],[[Cubic.line([0,80],[100,80]).p]]]);
  const input=graph.solution(graph.points,1),woven=await renderExportedWeave(solutionJSON(input),400);
  input.graph.target.sourceImage={mask:woven.mask,resolution:400};
  const repair=repairFinalReturns(input,cfg,{maxMilliseconds:2000});
  assert.equal(repair.solution,input);
  assert.equal(repair.report.accepted,false);
  assert.ok(repair.report.attempts.some(a=>a.gates?.imageNotWorse===false));
});


test('ordinary refinement never advertises a checkpoint that fails the editor clearance',()=>{
  const cfg=settings({...AUTOMATIC_PRESET,width:300}),graph=new CurveGraph([[[Cubic.line([100,0],[100,300]).p],[Cubic.line([103.6,0],[103.6,300]).p]],[[Cubic.line([0,250],[300,250]).p]]],300);
  const original=graph.points.slice(),checkpoints=[];
  const result=refineCurves(graph,new Float64Array(64*64),64,1,cfg,{steps:1,onProgress:(row,solution)=>{
    const checked=validate(solution,cfg,{checkImage:false,finalGeometry:true});
    assert.equal(row.geometry,checked.passed);
    checkpoints.push(row);
  }});
  assert.ok(checkpoints.length);
  assert.equal(result.geometryPassed,false,'Fixed endpoints cannot be separated to the editor margin.');
  assert.deepEqual(graph.points,original);
});

test('an ordinary refinement checkpoint repairs hidden connectors without changing the exported image',async()=>{
  const fixture=JSON.parse(await fs.readFile('scripts/inverse/fixtures/final-hidden-return.json'));
  const graph=new CurveGraph(fixture.paths,fixture.settings.width),before=graph.points.slice();
  const initial=graph.solution(before,fixture.phase),woven=await renderExportedWeave(solutionJSON(initial),400);
  assert.equal(validate(initial,fixture.settings,{checkImage:false}).passed,false);
  const result=refineCurves(graph,Float64Array.from(woven.mask),400,fixture.phase,fixture.settings,{steps:0,input:{sourceImage:{mask:woven.mask,resolution:400}}});
  assert.ok(result.geometryPassed&&result.paperPassed);
  assert.ok(result.history.some(row=>row.returnProjection?.policy==='hidden-controls-only'&&row.returnProjection.accepted));
  const exported=await renderExportedWeave(solutionJSON(graph.solution(result.points,fixture.phase)),400);
  assert.deepEqual(exported.mask,woven.mask);
  assert.deepEqual(graph.points,before);
});

for(const allowance of ['default','available','expired'])test(`a refinement checkpoint respects its ${allowance} repair allowance after gradient time expires`,async t=>{
  const fixture=JSON.parse(await fs.readFile('scripts/inverse/fixtures/final-hidden-return.json'));
  const graph=new CurveGraph(fixture.paths,fixture.settings.width),before=graph.points.slice();
  const input=graph.solution(before,fixture.phase),woven=await renderExportedWeave(solutionJSON(input),400);
  t.mock.method(performance,'now',()=>1000);
  const result=refineCurves(graph,Float64Array.from(woven.mask),400,fixture.phase,fixture.settings,{
    steps:40,deadline:900,...(allowance==='default'?{}:{repairDeadline:allowance==='available'?1400:950}),
    input:{sourceImage:{mask:woven.mask,resolution:400}}
  });
  assert.equal(result.steps,0,'A repair allowance must not start more gradient work.');
  assert.equal(result.geometryPassed,allowance==='available');
  assert.equal(result.paperPassed,allowance==='available');
  assert.equal(result.history.some(row=>row.returnProjection?.accepted),allowance==='available');
  if(allowance==='available'){
    const solution=graph.solution(result.points,fixture.phase);
    assert.ok(validate(solution,fixture.settings,{checkImage:false,finalGeometry:true}).passed);
    assert.deepEqual((await renderExportedWeave(solutionJSON(solution),400)).mask,woven.mask);
  }else assert.deepEqual(result.points,before,'An expired repair must not modify the candidate.');
  assert.deepEqual(graph.points,before,'Repair must not mutate the input.');
});
