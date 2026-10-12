import test from 'node:test';
import assert from 'node:assert/strict';
import {Cubic,distance} from '../../static/inverse/core/bezier.js';
import {segmentHits,nodeCurves} from '../../static/inverse/core/geometry.js';

test('tolerated collinear endpoint gaps cannot return parameters beyond the first segment',()=>{
  const hit=segmentHits([0,0],[1,0],[1+5e-10,0],[2,0]);
  assert.equal(hit.length,1);assert.equal(hit[0].overlap,false);
  assert.equal(hit[0].t,1);assert.deepEqual(hit[0].point,[1,0]);
  assert.equal(hit[0].u,0);
});

test('tolerated collinear endpoint gaps cannot return negative parameters',()=>{
  const hit=segmentHits([0,0],[1,0],[-1,0],[-5e-10,0]);
  assert.equal(hit.length,1);assert.equal(hit[0].overlap,false);
  assert.equal(hit[0].t,0);assert.deepEqual(hit[0].point,[0,0]);
  assert.equal(hit[0].u,1);
  assert.deepEqual(segmentHits([0,0],[1,0],[1+1e-7,0],[2,0]),[],'The existing tolerance must not widen.');
});

test('noding adjacent projected star fragments retains their full parameter intervals',()=>{
  // Reduced from the actual five-point-star trace after adding a junction.
  // Endpoint roundoff previously produced [lo, hi] = [1, 1.0000000000015086].
  const curves=[
    [[0,60],[.00001961199250469595,60.00000049029981],[.0000392239850093919,60.00000098059962],[.00005883597751408785,60.000001470899434]],
    [[.00005883597751408785,60.00000147089944],[3.331211580973566,60.08328028952435],[6.662364325969621,60.166559108149244],[9.993517070965673,60.24983792677414]],
  ].map(p=>new Cubic(p));
  let result=curves;
  for(let repeat=0;repeat<2;repeat++){
    result=nodeCurves(result);
    assert.equal(result.length,2);
    assert.ok(distance(result[0].p[0],curves[0].p[0])<1e-12);
    assert.ok(distance(result.at(-1).p[3],curves.at(-1).p[3])<1e-12);
  }
});
