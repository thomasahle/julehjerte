import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { Cubic, distance } from '../../static/inverse/core/bezier.js';
import { guidePortals } from '../../static/inverse/core/portals.js';
import { prepare, design, finish } from '../../static/inverse/core/engine.js';
import { settings } from '../../static/inverse/core/settings.js';
import { sampleTarget } from '../../static/inverse/core/input.js';
import { loadSolutionJSON, solutionJSON } from '../../static/inverse/core/graph.js';
import { LinearModel, solverRuntime, constrainTurnCost, objectiveGap } from '../../static/inverse/core/solver.js';
import { MATCHING_GRID_PRESET } from '../../src/lib/inverse/presets.js';
import { referenceEnvironment, compareCutPaths } from './reference.mjs';
import { renderExportedWeave } from './export-renderer.mjs';
import { fixture } from './fixtures.mjs';

test('guide portals split the middle of a curved edge without moving its geometry', () => {
  const c=new Cubic([[5,10],[20,80],[80,20],[95,90]]), curves=[c,Cubic.line([40,0],[40,5]),Cubic.line([40,95],[40,100])];
  const result=guidePortals(curves,100);
  assert.ok(result.added>0);
  assert.ok(result.curves.some(s=>Math.abs(s.p[0][0]-40)<1e-8));
  const parameter = x => {let lo=0, hi=1;for(let i=0;i<60;i++){const mid=(lo+hi)/2;if(c.point(mid)[0]<x)lo=mid;else hi=mid;}return (lo+hi)/2;};
  for(const s of result.curves.filter(s=>s.p[0][0]!==40||s.p[3][0]!==40)) {
    const lo=parameter(s.p[0][0]), hi=parameter(s.p[3][0]);
    for(let i=0;i<=10;i++) assert.ok(distance(s.point(i/10),c.point(lo+(hi-lo)*i/10))<1e-8);
  }
});

test('one turn-cost variable equals the pairwise cost for every integral degree-2 choice', async () => {
  const highs=await solverRuntime(), costs=[[0,1,3],[0,2,20],[0,3,0],[1,2,7],[1,3,12],[2,3,2]];
  for(let selection=0;selection<16;selection++) {
    const model=new LinearModel(), xs=Array.from({length:4},(_,i)=>model.variable({binary:true,lo:(selection>>i)&1,hi:(selection>>i)&1}));
    model.row(xs.map(x=>[x,1]),0,2);
    const q=model.variable({cost:1,hi:Infinity});
    for(const [a,b,c] of costs) constrainTurnCost(model,q,xs[a],xs[b],c);
    const native=highs.createModel(model.data());
    try { native.options.set({output_flag:false}); const r=native.run();
      if(xs.reduce((s,_,i)=>s+((selection>>i)&1),0)>2) assert.equal(r.modelStatus,highs.constants.modelStatus.infeasible);
      else { const expected=costs.reduce((s,[a,b,c])=>s+(((selection>>a)&1)&&((selection>>b)&1)?c:0),0); assert.ok(Math.abs(native.getObjectiveValue()-expected)<1e-6); }
    } finally { native.dispose(); }
  }
});

test('the optimization gap uses the captured bound after adding rows invalidates native info', async () => {
  const model=new LinearModel(), x=model.variable({cost:1,binary:true});model.row([[x,1]],1,1);
  const native=(await solverRuntime()).createModel(model.data());
  try{native.options.set({output_flag:false});native.run();native.addRow(-Infinity,1,{indices:[x],values:[1]});assert.equal(objectiveGap(100,60),.4);assert.equal(objectiveGap(100,100),0);assert.equal(objectiveGap(100,-Infinity),Infinity);}finally{native.dispose();}
});

test('an otherwise valid pair is withheld when it fails original-image fidelity', () => {
  const solution=fixture('straight'); const mask=sampleTarget(solution.graph.target,80).map(c=>1-c);
  solution.graph.target.sourceImage={mask,resolution:80};
  const result=finish(solution,settings({width:60,trials:0,roundHidden:false,cutError:0,printShrinkPercent:0,materialResolution:120}));
  assert.equal(result.report.validation.passed,true);assert.equal(result.report.imageFidelity.passed,false);assert.equal(result.report.templateExportAllowed,false);assert.equal(result.files['template_left.svg'],undefined);
});

test('reference metrics ignore cubic subdivision and path direction but detect displaced cuts', () => {
  const data=solutionJSON(fixture('straight')), copy=structuredClone(data);
  for(const family of ['A_overlap_paths','B_overlap_paths']) for(let i=0;i<copy[family].length;i++) copy[family][i]=copy[family][i].flatMap(r=>{
    const c=new Cubic(copy.curves[r.curve].control_points), halves=c.split(.37);
    return halves.map((h,j)=>{const id=`${r.curve}-split-${j}`;copy.curves[id]={control_points:h.p,visible_boundary:true};return {curve:id,reverse:false};});
  }).reverse().map(r=>({...r,reverse:true}));
  const same=compareCutPaths(copy,data);assert.ok(same.symmetricMeanMm<1e-9);assert.ok(same.sampledMaximumMm<1e-9);
  for(const c of Object.values(copy.curves)) for(const p of c.control_points)p[0]+=1;
  assert.ok(compareCutPaths(copy,data).sampledMaximumMm>1);
  copy.A_overlap_paths.pop();assert.equal(compareCutPaths(copy,data).unmatchedSlits,1);
});

test('blind star reconstruction matches published cuts and independent rendering', {timeout:30000}, async () => {
  const env=await referenceEnvironment();
  try {
    const ref=await env.load('5star',600), cfg={...MATCHING_GRID_PRESET,timeLimit:10,trials:0};
    const {target}=prepare(ref.input,cfg), result=await design(target,cfg), cuts=JSON.parse(result.files['cut_geometry.json']);
    assert.equal(result.report.solver.imported,undefined);assert.equal(result.report.templateExportAllowed,true);
    const comparison=compareCutPaths(cuts,ref.cuts);
    assert.equal(comparison.unmatchedSlits,0);assert.ok(comparison.symmetricMeanMm<.1);assert.ok(comparison.sampledMaximumMm+comparison.maximumSamplingErrorBoundMm<.5);
    const rendered=await renderExportedWeave(cuts,600), error=rendered.mask.reduce((s,c,i)=>s+Number(c!==target.sourceImage.mask[i]),0)/rendered.mask.length;
    assert.ok(error<.005);
    const old=JSON.parse(await fs.readFile('static/inverse/examples/star.saved.json','utf8'));
    assert.ok(compareCutPaths(old,ref.cuts).sampledMaximumMm>20);
    assert.ok(compareCutPaths(solutionJSON(loadSolutionJSON(cuts)),ref.cuts).symmetricMeanMm<.1);
  }finally{await env.close();}
});
