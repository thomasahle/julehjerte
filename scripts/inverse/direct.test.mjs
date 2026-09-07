import test from 'node:test';
import assert from 'node:assert/strict';
import {splineBasis,bernstein} from '../../static/inverse/core/direct/math.js';
import {gridModel,gridLoss,gridMask,gridPaths} from '../../static/inverse/core/direct/grid.js';
import {CurveGraph,renderCurves} from '../../static/inverse/core/direct/curves.js';
import {curvePenalty} from '../../static/inverse/core/direct/refine.js';
import {settings} from '../../static/inverse/core/settings.js';
import {boundaryGradient,boundaryValue} from '../../static/inverse/core/direct/boundary.js';
import {solutionJSON} from '../../static/inverse/core/graph.js';
import {sampleWeave} from '../../static/inverse/core/validate.js';
import {renderExportedWeave} from './export-renderer.mjs';

const near=(a,b,eps=1e-8)=>assert.ok(Math.abs(a-b)<eps,`${a} vs ${b}`);
const line=(a,b)=>[a,a.map((v,i)=>v+(b[i]-v)/3),a.map((v,i)=>v+2*(b[i]-v)/3),b];

test('clamped cubic spline basis and exact Bézier conversion agree',()=>{
  const model=gridModel([2,3],8,17),paths=gridPaths(model);
  for(const t of [0,.03,.3,.5,.9,1]){
    near(splineBasis(t,8).reduce((s,v)=>s+v,0),1);
    near(splineBasis(t,8,true).reduce((s,v)=>s+v,0),0);
  }
  for(const f of[0,1])for(const path of paths[f])for(const c of path){
    for(const t of[0,.23,.71,1]){const b=bernstein(t),axis=1-f,y=b.reduce((s,v,i)=>s+v*c[i][axis],0);near(y,c[0][axis]+t*(c[3][axis]-c[0][axis]));}
  }
});

test('ordered-grid image, smoothness and clearance gradients match finite differences',()=>{
  const model=gridModel([2,3],8,6),n=16,target=Float64Array.from({length:n*n},(_,i)=>(Math.sin(i*.13)+1)/2);
  for(const options of[{},{clearance:.35,floor:.02}]){
    const value=gridLoss(model,target,n,-1,.08,options),h=1e-5;
    for(const i of[0,1,5,18,31,39,50,55]){
      const old=model.z[i];model.z[i]=old+h;const up=gridLoss(model,target,n,-1,.08,options).loss;model.z[i]=old-h;const down=gridLoss(model,target,n,-1,.08,options).loss;model.z[i]=old;
      near(value.gradient[i],(up-down)/(2*h),3e-7);
    }
  }
});

test('direct controls preserve phase for equal and unequal sheet counts in exported geometry',async()=>{
  for(const counts of[[2,2],[2,3],[3,2]])for(const phase of[1,-1]){
    const model=gridModel(counts,8,8);model.z.fill(0);const graph=new CurveGraph(gridPaths(model)),n=128,mask=gridMask(model,n,phase),curveMask=renderCurves(graph,graph.points,phase,n,48),solution=graph.solution(graph.points,phase);
    assert.ok(curveMask.reduce((s,v,i)=>s+Number(v!==mask[i]),0)<=2);
    const app=sampleWeave(solution,n);assert.ok(app.reduce((s,v,i)=>s+Number(v!==mask[i]),0)<=2);
    const exported=await renderExportedWeave(solutionJSON(solution),n);
    assert.ok(exported.mask.reduce((s,v,i)=>s+Number(v!==mask[i]),0)/mask.length<.002);
  }
});

test('horizontal and vertical cuts receive the analytic normal-motion gradient',()=>{
  for(const f of[0,1])for(const phase of[1,-1]){
    const paths=[[],[]];paths[f]=[[f===0?line([30,0],[30,100]):line([0,40],[100,40])]];
    const graph=new CurveGraph(paths),prob=new Float64Array(64*64),g=boundaryGradient(graph,graph.points,prob,64,phase,{nquad:80});
    let sum=0;for(let i=f;i<g.length;i+=2)sum+=g[i];near(sum,phase===1?-.01:.01,1e-12);
    near(boundaryValue(graph,graph.points,prob,64,phase),phase===1?(f===0?.7:Math.round(.6*192)/192):(f===0?.3:1-Math.round(.6*192)/192),1e-10);
  }
});

test('exactly shared whole curves cancel before image integration and gradients',()=>{
  const c=line([30,0],[30,100]),graph=new CurveGraph([[[c],[c]],[]]),prob=new Float64Array(64*64);
  near(boundaryValue(graph,graph.points,prob,64,1),0,1e-12);
  assert.ok(boundaryGradient(graph,graph.points,prob,64,1).every(v=>v===0));
  assert.ok(renderCurves(graph,graph.points,1,64).every(v=>v===0));
});

test('boundary force matches an independent polygon-area change on free curved controls',()=>{
  const graph=new CurveGraph([[[[[20,0],[85,75],[0,20],[45,100]]]],[]]),prob=new Float64Array(64*64),g=boundaryGradient(graph,graph.points,prob,64,1,{nquad:512,maskSamples:128});
  // High-resolution Bernstein area integral, independent of row intersections.
  const area=points=>{
    const c=graph.controls(points)[0],ring=[];for(let j=0;j<=4000;j++){const b=bernstein(j/4000);ring.push([0,1].map(k=>b.reduce((s,v,i)=>s+v*c[i][k],0)));}ring.push([100,100],[100,0]);
    let a=0;for(let j=0;j<ring.length;j++){const p=ring[j],q=ring[(j+1)%ring.length];a+=p[0]*q[1]-p[1]*q[0];}return Math.abs(a)/20000;
  };
  for(const i of[2,3,4,5]){const h=.001,up=graph.points.slice(),down=graph.points.slice();up[i]+=h;down[i]-=h;near(g[i],(area(up)-area(down))/(2*h),1e-7);}
});

test('free-curve clearance, curvature and join forces match finite differences',()=>{
  const paths=[[[line([20,0],[20,50]),line([20,50],[20,100])],[[[22,0],[22.8,30],[21.8,70],[22,100]]]],[[line([0,50],[100,50])]]];
  const graph=new CurveGraph(paths),cfg=settings({trials:0}),value=curvePenalty(graph,graph.points,cfg),h=1e-5;
  assert.ok(value.loss>0);
  for(const i of[2,3,6,8,12,16,18,20,22]){
    const up=graph.points.slice(),down=graph.points.slice();up[i]+=h;down[i]-=h;
    near(value.gradient[i],(curvePenalty(graph,up,cfg).loss-curvePenalty(graph,down,cfg).loss)/(2*h),3e-6);
  }
});
