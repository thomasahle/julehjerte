import test from 'node:test';
import assert from 'node:assert/strict';
import {Cubic,turnAngle} from '../../static/inverse/core/bezier.js';
import {CurveGraph,renderCurves} from '../../static/inverse/core/direct/curves.js';
import {curvePenalty,refineCurves} from '../../static/inverse/core/direct/refine.js';
import {settings} from '../../static/inverse/core/settings.js';
import {DIRECT_PRESET} from '../../static/inverse/core/presets.js';
import {curvesOf,solutionJSON} from '../../static/inverse/core/graph.js';
import {validate} from '../../static/inverse/core/validate.js';
import {renderExportedWeave} from './export-renderer.mjs';

const line=(a,b)=>Cubic.line(a,b).p;
const near=(a,b,tol)=>assert.ok(Math.abs(a-b)<tol,`${a} != ${b}`);
const cfg=maxTurn=>settings({...DIRECT_PRESET,maxTurn,trials:0,preferMatchingSheets:false});

function corner(angle,reverse=false){
  const theta=angle*Math.PI/180,points=[[30,20],[30,50],[30+20*Math.sin(theta),50+20*Math.cos(theta)]];
  let path=points.slice(1).map((p,i)=>line(points[i],p));
  if(reverse)path=path.toReversed().map(c=>c.toReversed());
  return new CurveGraph([[path],[]]);
}

test('the maximum-turn force leaves ordinary intentional corners unchanged',()=>{
  for(const angle of [45,90,150,170]){
    const graph=corner(angle);
    assert.deepEqual(curvePenalty(graph,graph.points,cfg(175)),curvePenalty(graph,graph.points,cfg(180)));
  }
});

test('the maximum-turn force differentiates the control-point cost in both path directions',()=>{
  for(const angle of [174.5,175.64,179])for(const reverse of [false,true]){
    const graph=corner(angle,reverse),original=graph.points.slice(),limited=cfg(175),disabled=cfg(180);
    const a=curvePenalty(graph,original,limited),b=curvePenalty(graph,original,disabled);
    assert.ok(a.loss>b.loss,'Approaching a forbidden turn must produce a corrective force, even at an intentional corner');
    const force=Float64Array.from(a.gradient,(v,i)=>v-b.gradient[i]);
    assert.ok(force.some(v=>Math.abs(v)>1e-7));
    const cost=p=>curvePenalty(graph,p,limited).loss-curvePenalty(graph,p,disabled).loss;
    for(let i=0;i<original.length;i++){
      const up=original.slice(),down=original.slice(),h=1e-5;up[i]+=h;down[i]-=h;
      near(force[i],(cost(up)-cost(down))/(2*h),2e-7);
    }
    for(const axis of [0,1])near(force.reduce((sum,v,i)=>sum+(i%2===axis?v:0),0),0,1e-12);
    const moved=Float64Array.from(original,(v,i)=>v-.1*force[i]);
    assert.ok(cost(moved)<cost(original));assert.deepEqual(graph.points,original);
  }
});

test('refinement retains an improved sharp motif without exceeding the requested turn limit',async()=>{
  const path=tip=>{
    const points=[[20,0],[20,45],[tip,49],[20,53],[20,100]];
    return points.slice(1).map((p,i)=>line(points[i],p));
  };
  // The photographed silhouette can be sharper than the allowed cutting join.
  // The old fitter reaches a better final checkpoint but rejects its turn and
  // returns 0.0434% error. Force feedback keeps a valid 0.0330% approximation.
  const n=240,truth=new CurveGraph([[path(40)],[]]),mask=renderCurves(truth,truth.points,1,n,64),original=mask.slice();
  const graph=new CurveGraph([[path(32)],[]]),prob=Float64Array.from(mask),input={sourceImage:{mask,probability:prob,resolution:n}},configuration=cfg(145);
  const fit=refineCurves(graph,prob,n,1,configuration,{input,steps:240,deadline:Infinity});
  const solution=graph.solution(fit.points,1,input),curves=curvesOf(solution,0,0),woven=await renderExportedWeave(solutionJSON(solution),n);
  assert.ok(fit.geometryPassed&&fit.paperPassed);assert.ok(validate(solution,configuration).passed);
  assert.ok(fit.history.every(h=>!h.issues.some(issue=>issue.type==='maximum_turn')));
  assert.ok(curves.slice(1).every((c,i)=>turnAngle(curves[i],c)<=configuration.maxTurn));
  const error=woven.mask.reduce((sum,v,i)=>sum+Number(v!==mask[i]),0)/mask.length;
  assert.ok(error<.0004,`Independent exported-mask disagreement: ${error}`);
  assert.deepEqual(mask,original);
});
