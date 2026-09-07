import test from 'node:test';
import assert from 'node:assert/strict';
import {alternatingRuns,borderGrid,initializeGrid,separableGrid} from '../../static/inverse/core/direct/initialize.js';
import {gridMask,mismatch} from '../../static/inverse/core/direct/grid.js';

function cost(row,cuts,phase,prior,weight){
  let value=0;for(let x=0;x<row.length;x++){const p=(phase+cuts.filter(c=>x>=c).length)%2;value+=p?1-row[x]:row[x];}
  return value+cuts.reduce((s,c,i)=>s+weight*row.length*(c/row.length-prior[i])**2,0);
}
test('row dynamic program agrees with exhaustive alternating-run optimization',()=>{
  for(const minimum of[1,2])for(const phase of[0,1])for(const count of[1,2,3]){
    const row=Float64Array.from({length:11},(_,i)=>(Math.sin(i*1.37)+1)/2),prior=Array.from({length:count},(_,i)=>(i+1)/(count+1)),weight=.37;
    let best=Infinity;
    function visit(cuts){if(cuts.length===count){best=Math.min(best,cost(row,cuts,phase,prior,weight));return;}
      for(let i=(cuts.at(-1)||0)+minimum;i<=row.length-(count-cuts.length)*minimum;i++)visit([...cuts,i]);}
    visit([]);const cuts=alternatingRuns(row,count,phase,prior,{minimum,weight});
    assert.ok(Math.abs(cost(row,cuts.map(v=>Math.round(v*row.length)),phase,prior,weight)-best)<1e-10);
  }
  assert.equal(alternatingRuns(new Float32Array(5),3,0,[.2,.4,.6],{minimum:2}),null);
});
test('independent nonuniform strips are recovered without reference endpoints',()=>{
  const n=96,a=[.13,.29,.74],b=[.2,.55],target=Uint8Array.from({length:n*n},(_,i)=>(a.filter(v=>(i%n+.5)/n>v).length+b.filter(v=>(Math.floor(i/n)+.5)/n>v).length)%2);
  const r=initializeGrid(target,n,[3,2],1,{initial:separableGrid(target,n,[3,2],1).z});
  assert.ok(r.error<.02,`${r.error}`);
  assert.ok(mismatch(gridMask(r.model,n,r.phase),target)<.02);
});
test('border proposals allow unequal counts and ignore inconsistent observations',()=>{
  const evidence=[];
  for(const [side,transitions]of[[0,[.2,.3,.7]],[2,[.25,.4,.8]],[3,[.3,.6]],[1,[.35,.65]]])evidence.push({side,transitions,count:transitions.length});
  const model=borderGrid([3,2],evidence);assert.deepEqual(model.counts,[3,2]);
  assert.equal(borderGrid([7,7],evidence),null);
  assert.ok(model.z.every(Number.isFinite));
});
