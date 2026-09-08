import test from 'node:test';
import assert from 'node:assert/strict';
import {initializeGrid,separableGrid,borderGrid} from '../../static/inverse/core/direct/initialize.js';
import {gridModel,gridMask} from '../../static/inverse/core/direct/grid.js';
import {borderEvidence} from '../../static/inverse/core/direct/counts.js';

test('shared spline work preserves every initializer coordinate on unequal, noisy grids',()=>{
  for(const counts of [[2,5],[4,3]])for(const phase of [-1,1]){
    const model=gridModel(counts,16,37),n=128,prob=Float64Array.from(gridMask(model,n,phase));
    // Deterministic sparse edge noise, independent of either implementation.
    for(let i=3;i<n;i+=17)prob[i]=1-prob[i];
    const old=initializeGrid(prob,n,counts,phase),next=initializeGrid(prob,n,counts,phase,{sharedWork:true});
    assert.deepEqual(next.model.z,old.model.z);assert.equal(next.error,old.error);assert.ok(next.steps<=old.steps);
    assert.deepEqual(separableGrid(prob,n,counts,phase,{sharedWork:true}).z,separableGrid(prob,n,counts,phase).z);
    const evidence=borderEvidence(prob,n),a=borderGrid(counts,evidence),b=borderGrid(counts,evidence,{sharedWork:true});
    assert.deepEqual(b?.z,a?.z);
  }
});

test('repeated initialization states stop without changing the selected grid',()=>{
  const model=gridModel([3,3]);model.z.fill(0);const mask=Float64Array.from(gridMask(model,96,1));
  const old=initializeGrid(mask,96,[3,3],1),next=initializeGrid(mask,96,[3,3],1,{sharedWork:true});
  assert.deepEqual(next.model.z,old.model.z);assert.equal(next.error,old.error);assert.ok(next.steps<old.steps);
});
