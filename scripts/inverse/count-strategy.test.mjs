import test from 'node:test';
import assert from 'node:assert/strict';
import {initializeGrid,separableGrid,borderGrid} from '../../static/inverse/core/direct/initialize.js';
import {gridModel,gridMask,fitGrid} from '../../static/inverse/core/direct/grid.js';
import {borderEvidence,initializeCounts} from '../../static/inverse/core/direct/counts.js';

test('shared spline work preserves every initializer coordinate on unequal, noisy grids',()=>{
  for(const counts of [[2,5],[4,3]])for(const phase of [-1,1]){
    const model=gridModel(counts,16,37),n=128,prob=Float64Array.from(gridMask(model,n,phase));
    // Deterministic sparse edge noise, independent of either implementation.
    for(let i=3;i<n;i+=17)prob[i]=1-prob[i];
    const old=initializeGrid(prob,n,counts,phase,{sharedWork:false}),next=initializeGrid(prob,n,counts,phase);
    assert.deepEqual(next.model.z,old.model.z);assert.equal(next.error,old.error);assert.ok(next.steps<=old.steps);
    assert.deepEqual(separableGrid(prob,n,counts,phase).z,separableGrid(prob,n,counts,phase,{sharedWork:false}).z);
    const evidence=borderEvidence(prob,n),a=borderGrid(counts,evidence,{sharedWork:false}),b=borderGrid(counts,evidence);
    assert.deepEqual(b?.z,a?.z);
  }
});

test('repeated initialization states stop without changing the selected grid',()=>{
  const model=gridModel([3,3]);model.z.fill(0);const mask=Float64Array.from(gridMask(model,96,1));
  const old=initializeGrid(mask,96,[3,3],1,{sharedWork:false}),next=initializeGrid(mask,96,[3,3],1);
  assert.deepEqual(next.model.z,old.model.z);assert.equal(next.error,old.error);assert.ok(next.steps<old.steps);
});

test('shared projection stays exact when successive fits change spline size and sampling',()=>{
  const n=128,counts=[2,4],prob=Float64Array.from(gridMask(gridModel(counts,16,53),n,-1));
  // Revisiting the first configuration also exercises a warm cache after fits
  // with different matrices; the target contains soft photographic edge pixels.
  for(let i=5;i<prob.length;i+=29)prob[i]=.2+.6*prob[i];
  for(const options of [
    {resolution:32,k:6,floor:.015},
    {resolution:48,k:12,floor:.02},
    {resolution:64,k:9,floor:.008},
    {resolution:32,k:6,floor:.015}
  ]){
    const baseline=initializeGrid(prob,n,counts,-1,{...options,sharedWork:false});
    const result=initializeGrid(prob,n,counts,-1,options);
    assert.deepEqual(result.model,baseline.model);
    assert.equal(result.error,baseline.error);
  }
});

test('the default count search retains every hypothesis, phase and seed order',()=>{
  const model=gridModel([2,3],16,91),n=96,prob=Float64Array.from(gridMask(model,n,-1));
  const options=[[1,1],[2,2],[2,3],[3,2]].flatMap(counts=>[1,-1].map(phase=>({counts,phase})));
  const context={options,fullProb:prob,resolution:n,prob,n,evidence:borderEvidence(prob,n)};
  const baseline=initializeCounts(context,{sharedWork:false}),result=initializeCounts(context);
  assert.equal(result.report.strategy,'shared-work');
  assert.equal(result.report.fullyInitialized,options.length);
  assert.equal(result.seeds.length,options.length);
  for(const [i,seed] of result.seeds.entries()){
    const prior=baseline.seeds[i];
    assert.deepEqual(seed.model,prior.model);
    assert.equal(seed.phase,prior.phase);
    assert.equal(seed.floor,prior.floor);
    assert.equal(seed.error,prior.error);
    assert.equal(seed.seedKind,prior.seedKind);
  }
});

test('count initialization and continuation preserve a finer spline dimension',()=>{
  const n=96,k=24,counts=[2,3],prob=Float64Array.from(gridMask(gridModel(counts,k,91),n,-1));
  const options=[1,-1].map(phase=>({counts,phase})),weights=Float64Array.from(prob,v=>v?1:.25);
  const context={options,fullProb:prob,resolution:n,prob,n,evidence:borderEvidence(prob,n),weights,fullWeights:weights,guideProb:prob};
  const result=initializeCounts(context,{k}),baseline=initializeCounts(context,{k,sharedWork:false});
  for(const [i,seed] of result.seeds.entries()){
    assert.equal(seed.model.k,k);assert.deepEqual(seed.model,baseline.seeds[i].model);
    assert.equal(seed.model.z.length,k*(counts[0]+counts[1]+2));assert.ok(Number.isFinite(seed.error));
    const continued=fitGrid(prob,n,counts,seed.phase,{k,initial:seed.model.z,steps:0,floor:seed.floor});
    assert.equal(continued.model.k,k);assert.deepEqual(continued.model.z,seed.model.z);
    assert.deepEqual(gridMask(continued.model,n,seed.phase,seed.floor),gridMask(seed.model,n,seed.phase,seed.floor));
    const fitted=fitGrid(prob,n,counts,seed.phase,{k,initial:seed.model.z,steps:2,floor:seed.floor});
    assert.ok(fitted.model.z.every(Number.isFinite));assert.ok(fitted.error<=continued.error);
    assert.throws(()=>fitGrid(prob,n,counts,seed.phase,{initial:seed.model.z,steps:1}),/Grid initialization has/,
      'A forgotten spline dimension must fail explicitly instead of silently reinterpreting the parameters');
  }
});
