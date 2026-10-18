import test from 'node:test';
import assert from 'node:assert/strict';
import {loadNumericalKernel,nativeGridMask} from '../../static/inverse/core/numerical-kernel.js';
import {gridModel,gridMask,gridParity,gridMaskKernelChoices} from '../../static/inverse/core/direct/grid.js';

test('grid rasterization keeps its JavaScript fallback before the optional kernel loads',()=>{
  const model=gridModel([3,5],8,17);
  assert.deepEqual(gridMask(model,64,1),gridMask(model,64,1,.008,{native:false}));
  assert.deepEqual(gridMaskKernelChoices(),[]);
});

test('native grid rasterization preserves pixel-centre ties, empty families and transpose parity',async()=>{
  assert.equal((await loadNumericalKernel()).backend,'wasm');
  for(const n of [1,9,32,101])for(const counts of [[0,0],[0,3],[3,0],[3,2]])for(const phase of [1,-1]){
    const samples=counts.map(count=>Float64Array.from({length:n*count},(_,i)=>{
      const cut=i%count,row=Math.floor(i/count),x=Math.floor((cut+1)*n/(count+1));
      return (x+.5)/n+[0,-Number.EPSILON,Number.EPSILON][row%3];
    }));
    const expected=gridParity(samples[0],counts[0],n),other=gridParity(samples[1],counts[1],n,true);
    for(let i=0;i<expected.length;i++)expected[i]^=other[i]^Number(phase===-1);
    assert.deepEqual(nativeGridMask(samples,counts,n,phase),expected);
  }
});

test('forced and measured grid kernels retain exact masks as geometry and memory change',async()=>{
  await loadNumericalKernel();
  const saved=[];
  for(const counts of [[1,1],[3,5],[8,8]])for(const n of [32,96,400])for(const phase of [1,-1]){
    const model=gridModel(counts,16,17);
    for(const shift of [0,2]){
      model.z[0]+=shift;
      const expected=gridMask(model,n,phase,.008,{native:false});
      const result=gridMask(model,n,phase,.008,{native:true});
      assert.deepEqual(result,expected);assert.deepEqual(gridMask(model,n,phase),expected);
      saved.push([result,expected]);
    }
  }
  for(const [actual,expected]of saved)assert.deepEqual(actual,expected,'A later call must not overwrite a returned mask.');
  assert.ok(gridMaskKernelChoices().length>0);
  assert.ok(gridMaskKernelChoices().every(c=>c.reason!=='different_results'));
});

test('grid kernel rejects invalid dimensions before accessing linear memory',async()=>{
  await loadNumericalKernel();
  const samples=[new Float64Array(8),new Float64Array(8)];
  for(const n of [0,-1,1.5,4097,Infinity,NaN])assert.equal(nativeGridMask(samples,[1,1],n,1),null);
  for(const counts of [[-1,1],[.5,1],[4097,1],[2,1],[],null])assert.equal(nativeGridMask(samples,counts,8,1),null);
  assert.equal(nativeGridMask(samples,[1,1],8,0),null);
  assert.equal(nativeGridMask(null,[1,1],8,1),null);
  assert.equal(nativeGridMask([[],[]],[1,1],8,1),null);
});
