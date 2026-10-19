import test from 'node:test';
import assert from 'node:assert/strict';
import {fitGrid,gridModel,gridMask,gridPaths} from '../../static/inverse/core/direct/grid.js';
import {CurveGraph} from '../../static/inverse/core/direct/curves.js';
import {validate} from '../../static/inverse/core/validate.js';
import {settings} from '../../static/inverse/core/settings.js';

test('clearance fitting can retain legal spacing even when a narrower checkpoint matches more pixels',()=>{
  const n=64,floor=.001,counts=[2,0],model=gridModel(counts,4,0),cfg=settings({width:100,minWidth:2});
  for(let j=0;j<model.k;j++)model.z.set([Math.log(.495),Math.log(.01),Math.log(.495)],j*3);
  const probability=Float64Array.from(gridMask(model,n,1,floor)),before=probability.slice();
  const valid=checkpoint=>{
    const graph=new CurveGraph(gridPaths(checkpoint.model,cfg.width,checkpoint.floor),cfg.width);
    return validate(graph.solution(graph.points,checkpoint.phase),cfg,{checkImage:false,finalGeometry:true}).passed;
  };
  assert.equal(valid({model,phase:1,floor}),false);
  const baseProgress=[],safeProgress=[],options={k:4,initial:model.z,floor,clearance:.04,resolution:n,steps:150};
  const ordinary=fitGrid(probability,n,counts,1,{...options,onProgress:p=>baseProgress.push(p)});
  const safe=fitGrid(probability,n,counts,1,{...options,onProgress:p=>safeProgress.push(p),preferCheckpoint:p=>valid(p)?3:1});
  assert.equal(valid(ordinary),false);assert.equal(valid(safe),true);
  assert.ok(safe.error>ordinary.error,'The legal spacing costs pixels; this fixture exposes error-only rollback.');
  assert.ok(safe.error<.05);
  assert.deepEqual(safeProgress,baseProgress,'Checkpoint choice must not alter the gradient trajectory.');
  assert.deepEqual(probability,before);assert.equal(safe.steps,ordinary.steps);
  const deferredProgress=[];
  const deferred=fitGrid(probability,n,counts,1,{...options,onProgress:p=>deferredProgress.push(p),preferCheckpoint:p=>valid(p)?3:1,maximumCheckpointPriority:3});
  assert.deepEqual(deferred.model.z,safe.model.z,'Deferred validation must select exactly the same legal checkpoint.');
  assert.deepEqual(deferredProgress,safeProgress,'Postponing validation cannot alter the gradient trajectory.');
});

test('a bounded checkpoint preference checks the lowest-error maximum-priority iterate only once',()=>{
  const n=32,model=gridModel([2,2],4,7),probability=Float64Array.from(gridMask(model,n,1));
  let eagerCalls=0,deferredCalls=0;
  const options={k:4,steps:65,resolution:n};
  const eager=fitGrid(probability,n,[2,2],1,{...options,preferCheckpoint:()=>{eagerCalls++;return true;}});
  const deferred=fitGrid(probability,n,[2,2],1,{...options,preferCheckpoint:()=>{deferredCalls++;return true;},maximumCheckpointPriority:1});
  assert.ok(eagerCalls>1);assert.equal(deferredCalls,1);assert.deepEqual(deferred.model.z,eager.model.z);assert.equal(deferred.error,eager.error);
  assert.throws(()=>fitGrid(probability,n,[2,2],1,{...options,preferCheckpoint:()=>2,maximumCheckpointPriority:1}),/exceeds its declared bound/);
});
