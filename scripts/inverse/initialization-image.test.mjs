import test from 'node:test';
import assert from 'node:assert/strict';
import {initializationImage} from '../../static/inverse/core/direct/initialization-image.js';
import {gridInitializer,initializeGrid,separableGrid} from '../../static/inverse/core/direct/initialize.js';
import {resizeObjective} from '../../static/inverse/core/direct/image-objective.js';
import {mismatch} from '../../static/inverse/core/direct/grid.js';

const n=39,prob=Float32Array.from({length:n*n},(_,i)=>(1+Math.sin(i*.21))/2);
const weights=Float64Array.from(prob,(_,i)=>i%n<9?0:i%n<23?.25:1);

test('prepared initialization scales retain the exact weighted score and resampling',()=>{
  for(const importance of [null,new Float64Array(n*n).fill(1),weights]){
    const image=initializationImage(prob,n,importance);
    for(const size of [19,64,39,19]){
      const expected=resizeObjective(prob,n,size,importance),actual=image(size);
      assert.deepEqual(actual.probability,expected.probability);assert.deepEqual(actual.weights,expected.weights);
      for(const phase of [0,1]){
        const mask=Uint8Array.from(actual.probability,(_,i)=>(i%7+phase)%2);
        assert.equal(actual.score(mask),mismatch(mask,expected.probability,expected.weights));
      }
      assert.throws(()=>actual.score(new Uint8Array(3)),/resolution/);
    }
  }
});

test('one prepared image preserves both phases and unequal grids, including completely ignored rows',()=>{
  const image=gridInitializer(prob,n,{weights});
  for(const counts of [[2,3],[3,2]])for(const phase of [1,-1])for(const resolution of [32,48]){
    const options={resolution,k:8,rounds:5,scoreResolution:48},reference=initializeGrid(prob,n,counts,phase,{...options,weights,sharedWork:false}),actual=image.initialize(counts,phase,options);
    assert.deepEqual(actual.model,reference.model);assert.equal(actual.error,reference.error);assert.equal(actual.phase,reference.phase);
    const separableOptions={resolution,k:8};
    assert.deepEqual(image.separable(counts,phase,separableOptions),separableGrid(prob,n,counts,phase,{...separableOptions,weights,sharedWork:false}));
  }
});

test('initialization owns one source snapshot and later searches see later edits',()=>{
  const target=Float64Array.from(prob),importance=weights.slice(),image=initializationImage(target,n,importance);
  const before=image(19),expected=resizeObjective(target,n,64,importance);
  target.fill(1);importance.fill(1);
  assert.deepEqual(image(19).probability,before.probability);
  assert.deepEqual(image(64).probability,expected.probability);assert.deepEqual(image(64).weights,expected.weights);
  const next=initializationImage(target,n,importance)(19);
  assert.ok(next.probability.every(p=>Math.abs(p-1)<1e-12));assert.equal(next.weights,null);
  for(const invalid of [[],new Float64Array(n*n),new Float64Array(n*n).fill(NaN),new Float64Array(n*n).fill(-1)]){
    assert.throws(()=>initializationImage(prob,n,invalid)(19),/weight/i);
  }
});
