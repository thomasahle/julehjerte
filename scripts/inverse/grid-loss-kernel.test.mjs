import test from 'node:test';
import assert from 'node:assert/strict';
import {gridLoss,gridModel} from '../../static/inverse/core/direct/grid.js';
import {gridLossKernelChoices} from '../../static/inverse/core/direct/grid-pixels.js';
import {nativeGridPixels} from '../../static/inverse/core/direct/native-grid.js';
import {loadNumericalKernel,numericalKernel} from '../../static/inverse/core/numerical-kernel.js';

test('grid loss retains its JavaScript fallback before the numerical kernel loads',()=>{
  const model=gridModel([3,5],8,17),n=9,target=Float64Array.from({length:n*n},(_,i)=>(i*19%31)/31);
  assert.deepEqual(gridLoss(model,target,n,1,.01),gridLoss(model,target,n,1,.01,{native:false}));
  assert.deepEqual(gridLossKernelChoices(),[]);
});

test('native grid loss preserves exact losses, predictions and gradients across weights and widths',async()=>{
  assert.equal((await loadNumericalKernel()).backend,'wasm');assert.equal(typeof numericalKernel().grid_loss,'function');
  const saved=[];
  for(const counts of [[0,0],[0,3],[1,1],[3,5],[6,6],[10,11]])for(const n of [9,32,96,160])for(const weighted of [false,true])for(const epsilon of [.08,.01,.003]){
    const model=gridModel(counts,8,17),target=Float64Array.from({length:n*n},(_,i)=>(i*19%31)/31),weights=weighted?Float64Array.from(target,(v,i)=>i%7?v:0):null;
    for(const phase of [1,-1]){
      const options={weights},expected=gridLoss(model,target,n,phase,epsilon,{...options,native:false}),actual=gridLoss(model,target,n,phase,epsilon,{...options,native:true});
      assert.deepEqual(actual,expected,JSON.stringify({counts,n,weighted,epsilon,phase}));
      if(n===9)saved.push([actual,structuredClone(actual)]);
    }
  }
  for(const [actual,expected]of saved)assert.deepEqual(actual,expected,'Reusing and growing Wasm memory must not mutate previous results.');
});

test('native grid gradients retain zero-factor derivatives and agree with finite differences',async()=>{
  await loadNumericalKernel();
  const n=17,counts=[1,2],model=gridModel(counts,5,0);model.z.fill(0);
  const target=Float64Array.from({length:n*n},(_,i)=>(i*19%31)/31),weights=Float64Array.from(target,(v,i)=>i%5?v:0),h=1e-5;
  for(const coarseWeight of [0,.4]){
    const options={native:true,smooth:false,weights,coarseWeight},actual=gridLoss(model,target,n,-1,.08,options);
    for(let i=0;i<model.z.length;i++){
      const original=model.z[i];model.z[i]=original+h;const up=gridLoss(model,target,n,-1,.08,options).loss;
      model.z[i]=original-h;const down=gridLoss(model,target,n,-1,.08,options).loss;model.z[i]=original;
      assert.ok(Math.abs(actual.gradient[i]-(up-down)/(2*h))<2e-8,`gradient ${i}`);
    }
  }
});

test('measured grid backend observes changing parameters and retains only exact results',async()=>{
  await loadNumericalKernel();
  for(const counts of [[3,3],[6,6],[10,11]])for(const epsilon of [.08,.008]){
    const model=gridModel(counts,8,17),n=96,target=Float64Array.from({length:n*n},(_,i)=>(i*19%31)/31);
    for(let step=0;step<4;step++){
      model.z[0]+=.125;
      assert.deepEqual(gridLoss(model,target,n,1,epsilon),gridLoss(model,target,n,1,epsilon,{native:false}));
    }
  }
  assert.ok(gridLossKernelChoices().length>0);
  assert.ok(gridLossKernelChoices().every(c=>c.reason!=='different_results'));
});

test('native pixel kernel rejects unsupported dimensions before reading linear memory',async()=>{
  await loadNumericalKernel();
  const samples=[new Float64Array(8),new Float64Array(8)],target=new Float64Array(64),run=(s=samples,c=[1,1],n=8,phase=1,epsilon=.01,t=target,weights=null,mass=0)=>nativeGridPixels(s,c,n,phase,epsilon,.008,t,weights,mass,.4);
  assert.ok(run());
  for(const n of [0,-1,1.5,513,NaN,Infinity])assert.equal(run(samples,[1,1],n),null);
  for(const c of [null,[],[-1,1],[.5,1],[129,1],[2,1]])assert.equal(run(samples,c),null);
  assert.equal(run(null),null);assert.equal(run([[],[]]),null);assert.equal(run(samples,[1,1],8,0),null);
  assert.equal(run(samples,[1,1],8,1,0),null);assert.equal(run(samples,[1,1],8,1,.01,null),null);
  assert.equal(run(samples,[1,1],8,1,.01,target,new Float64Array(63),1),null);
  assert.equal(run(samples,[1,1],8,1,.01,target,new Float64Array(64),0),null);
});
