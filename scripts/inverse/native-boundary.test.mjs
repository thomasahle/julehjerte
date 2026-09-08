import test from 'node:test';
import assert from 'node:assert/strict';
import {loadBoundaryKernel} from '../../static/inverse/core/direct/native.js';
import {boundaryGradient} from '../../static/inverse/core/direct/boundary.js';
import {CurveGraph} from '../../static/inverse/core/direct/curves.js';
import {gridModel,gridPaths} from '../../static/inverse/core/direct/grid.js';

test('WASM boundary forces agree with JavaScript for both phases, shared cuts and backward handles',async()=>{
  assert.equal((await loadBoundaryKernel()).backend,'wasm');
  const paths=gridPaths(gridModel([3,3],8,17));
  paths[0][1][2][1][1]-=25;paths[1][1][1][2][0]-=20;
  const shared=[[[20,0],[20,10],[20,30],[20,40]],[[20,40],[30,40],[40,40],[50,40]],[[50,40],[50,50],[50,70],[50,100]]];
  const horizontal=[[[0,40],[5,40],[15,40],[20,40]],shared[1],[[50,40],[70,40],[80,40],[100,40]]];
  for(const graph of[new CurveGraph(paths),new CurveGraph([[shared],[horizontal]])]){
    for(const n of[64,256,400])for(const phase of[1,-1])for(const nquad of[24,64,80]){
      const prob=Float64Array.from({length:n*n},(_,i)=>(i*19%31)/31);
      const a=boundaryGradient(graph,graph.points,prob,n,phase,{native:false,nquad});
      const b=boundaryGradient(graph,graph.points,prob,n,phase,{nquad});
      assert.ok(a.every((v,i)=>Math.abs(v-b[i])<1e-14),`phase=${phase}, resolution=${n}, quadrature=${nquad}`);
    }
  }
});
