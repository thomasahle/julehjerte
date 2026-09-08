import test from 'node:test';
import assert from 'node:assert/strict';
import {boundaryObjective,imageWeights,resizeObjective} from '../../static/inverse/core/direct/image-objective.js';
import {boundaryGradient,boundaryValue} from '../../static/inverse/core/direct/boundary.js';
import {gridModel,gridLoss,gridMask,gridPaths,fitGrid,mismatch} from '../../static/inverse/core/direct/grid.js';
import {CurveGraph} from '../../static/inverse/core/direct/curves.js';
import {refineCurves} from '../../static/inverse/core/direct/refine.js';
import {loadBoundaryKernel} from '../../static/inverse/core/direct/native.js';
import {settings} from '../../static/inverse/core/settings.js';

const near=(a,b,tolerance=1e-10)=>assert.ok(Math.abs(a-b)<=tolerance,`${a} vs ${b}`);
const line=(a,b)=>[a,a.map((v,i)=>v+(b[i]-v)/3),a.map((v,i)=>v+2*(b[i]-v)/3),b];
const n=19,prob=Float64Array.from({length:n*n},(_,i)=>(1+Math.sin(i*.17))/2);
const weights=Float64Array.from(prob,(_,i)=>i%n<5?0:i%n<12?.25:1);

test('unweighted and all-one losses retain exactly the existing objective',()=>{
  const ones=new Float64Array(prob.length).fill(1),model=gridModel([2,3],8,6),graph=new CurveGraph(gridPaths(model));
  assert.equal(imageWeights(ones,ones.length),null);
  assert.deepEqual(boundaryObjective(prob,ones),{target:prob,offset:0});
  assert.deepEqual(gridLoss(model,prob,n,-1,.08),gridLoss(model,prob,n,-1,.08,{weights:ones}));
  assert.deepEqual(boundaryGradient(graph,graph.points,prob,n,-1),boundaryGradient(graph,graph.points,prob,n,-1,{weights:ones}));
  assert.equal(boundaryValue(graph,graph.points,prob,n,-1),boundaryValue(graph,graph.points,prob,n,-1,{weights:ones}));
});

test('weighted grid gradients include pooled residuals and partial edge blocks',()=>{
  const model=gridModel([2,3],8,6),h=1e-5;
  for(const phase of[1,-1])for(const coarseWeight of[0,.4]){
    const options={weights,coarseWeight,smooth:false},value=gridLoss(model,prob,n,phase,.08,options);
    for(const i of[0,1,5,18,31,39,50,55]){
      const old=model.z[i];model.z[i]=old+h;const up=gridLoss(model,prob,n,phase,.08,options).loss;
      model.z[i]=old-h;const down=gridLoss(model,prob,n,phase,.08,options).loss;model.z[i]=old;
      near(value.gradient[i],(up-down)/(2*h),3e-8);
    }
  }
});

test('ignored pixels exert no grid or boundary force regardless of their colour',()=>{
  const changed=Float64Array.from(prob,(p,i)=>weights[i]?p:1-p),model=gridModel([2,3],8,6),graph=new CurveGraph(gridPaths(model));
  assert.deepEqual(gridLoss(model,prob,n,1,.08,{weights}),gridLoss(model,changed,n,1,.08,{weights}));
  assert.deepEqual(boundaryObjective(prob,weights),boundaryObjective(changed,weights));
  assert.deepEqual(boundaryGradient(graph,graph.points,prob,n,1,{weights}),boundaryGradient(graph,graph.points,changed,n,1,{weights}));
  assert.equal(boundaryValue(graph,graph.points,prob,n,1,{weights}),boundaryValue(graph,graph.points,changed,n,1,{weights}));
});

test('uniform soft weights preserve loss and gradient instead of weakening the entire image',()=>{
  const model=gridModel([2,3],8,6),soft=new Float64Array(prob.length).fill(.25);
  const before=gridLoss(model,prob,n,1,.08),after=gridLoss(model,prob,n,1,.08,{weights:soft});
  near(before.loss,after.loss);before.gradient.forEach((v,i)=>near(v,after.gradient[i]));
  const objective=boundaryObjective(prob,soft);near(objective.offset,0);
  objective.target.forEach((v,i)=>near(v,prob[i]));
});

test('boundary scalar values are weighted squared errors for both uniform weave phases',()=>{
  const graph=new CurveGraph([[],[]]),mass=weights.reduce((s,v)=>s+v,0);
  for(const phase of[1,-1])for(const transpose of[false,true]){
    const colour=phase===1?0:1,expected=prob.reduce((s,p,i)=>s+weights[i]*(colour-p)**2,0)/mass;
    near(boundaryValue(graph,graph.points,prob,n,phase,{weights,rows:n*4,transpose}),expected);
  }
});

test('weighted horizontal and vertical boundaries have the analytic normal force',async()=>{
  const backend=await loadBoundaryKernel();assert.equal(backend.backend,'wasm');
  const resolution=64,probability=new Float64Array(resolution**2);
  for(const family of[0,1])for(const at of[12.5,50])for(const phase of[1,-1]){
    const paths=[[],[]];paths[family]=[[family===0?line([at,0],[at,100]):line([0,at],[100,at])]];
    const graph=new CurveGraph(paths),importance=Float64Array.from(probability,(_,i)=>{
      const coordinate=family===0?i%resolution:Math.floor(i/resolution);return coordinate>=16&&coordinate<48?1:0;
    });
    const js=boundaryGradient(graph,graph.points,probability,resolution,phase,{weights:importance,native:false,nquad:80});
    const wasm=boundaryGradient(graph,graph.points,probability,resolution,phase,{weights:importance,nquad:80});
    js.forEach((v,i)=>near(v,wasm[i],1e-12));
    const total=js.reduce((s,v,i)=>s+(i%2===family?v:0),0);
    near(total,at===50?-.02*phase:0,1e-12);
    const value=at===50?.5:phase===1?1:0;
    for(const transpose of[false,true])near(boundaryValue(graph,graph.points,probability,resolution,phase,{weights:importance,rows:256,transpose}),value);
  }
});

test('weighted shared curves still cancel before integration',()=>{
  const c=line([30,0],[30,100]),graph=new CurveGraph([[[c],[c]],[]]);
  assert.ok(boundaryGradient(graph,graph.points,prob,n,1,{weights}).every(v=>v===0));
  const expected=prob.reduce((s,p,i)=>s+weights[i]*p*p,0)/weights.reduce((s,w)=>s+w,0);
  near(boundaryValue(graph,graph.points,prob,n,1,{weights,rows:n*4}),expected);
});

test('coarse scales preserve weighted colour rather than mixing in a free border',()=>{
  const resolution=5,importance=Float64Array.from({length:25},(_,i)=>i===12?1:0),colour=Float64Array.from(importance),noisy=Float64Array.from(colour,(p,i)=>importance[i]?p:(i%3)/2);
  for(const size of[1,3,5,11]){
    const a=resizeObjective(colour,resolution,size,importance),b=resizeObjective(noisy,resolution,size,importance);
    assert.deepEqual(a,b);
    a.probability.forEach((p,i)=>{if(a.weights[i]>0)near(p,1);});
    if(size<resolution)near(a.weights.reduce((s,w)=>s+w,0)/(size*size),1/25);
  }
});

test('a protected error is not diluted by the size or colour of a free border',()=>{
  const target=new Float64Array(16),mask=new Uint8Array(16).fill(1),importance=new Float64Array(16);importance[5]=1;
  assert.equal(mismatch(mask,target,importance),1);mask[5]=0;
  assert.equal(mismatch(mask,target,importance),0);assert.equal(mismatch(mask,target),15/16);
});

test('weighted grid fitting and curve refinement ignore border perturbations throughout selection',()=>{
  const resolution=32,model=gridModel([2,2],8,2),target=Float64Array.from(gridMask(model,resolution,1));
  const importance=Float64Array.from(target,(_,i)=>i%resolution>7&&i%resolution<24&&Math.floor(i/resolution)>7&&Math.floor(i/resolution)<24?1:0);
  const noisy=Float64Array.from(target,(p,i)=>importance[i]?p:1-p);
  const fit=p=>fitGrid(p,resolution,[2,2],1,{weights:importance,resolution:19,steps:35,k:8});
  const a=fit(target),b=fit(noisy);assert.deepEqual(a,b);
  const graph=new CurveGraph(gridPaths(a.model)),cfg=settings({trials:0});
  const refine=p=>refineCurves(graph,p,resolution,1,cfg,{weights:importance,steps:3});
  const first=refine(target),second=refine(noisy);
  assert.equal(first.geometryPassed,true);assert.equal(first.paperPassed,true);
  assert.deepEqual(first.points,second.points);assert.equal(first.error,second.error);assert.deepEqual(first.history,second.history);
});

test('invalid or completely unobserved weights fail instead of reporting a perfect fit',()=>{
  for(const invalid of[[],new Float64Array(prob.length),new Float64Array(prob.length).fill(-.1),new Float64Array(prob.length).fill(1.1),new Float64Array(prob.length).fill(NaN)]){
    assert.throws(()=>boundaryObjective(prob,invalid),/weight/i);
    assert.throws(()=>gridLoss(gridModel([1,1]),prob,n,1,.08,{weights:invalid}),/weight/i);
  }
  assert.throws(()=>fitGrid(prob,n,[1,1],1,{weights,optimizationTarget:new Float64Array(96**2)}),/resample/);
});
