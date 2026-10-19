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
});
