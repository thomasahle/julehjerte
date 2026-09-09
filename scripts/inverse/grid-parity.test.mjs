import test from 'node:test';
import assert from 'node:assert/strict';
import {basisTable} from '../../static/inverse/core/direct/math.js';
import {gridModel,gridControls,gridSamples,gridParity,gridMask} from '../../static/inverse/core/direct/grid.js';

// Independent exhaustive classifier: no sorting or sweep, including exact
// pixel-centre ties, coincident cuts and cuts outside the sampled square.
function exhaustive(samples,count,n,transpose=false){
  return Uint8Array.from({length:n*n},(_,i)=>{
    const row=transpose?i%n:Math.floor(i/n),coordinate=transpose?Math.floor(i/n):i%n;
    let parity=0;
    for(let cut=0;cut<count;cut++)parity^=Number((coordinate+.5)/n>samples[row*count+cut]);
    return parity;
  });
}

test('ordered parity retains strict pixel-centre ties in either orientation',()=>{
  const n=4,rows=[[-1,.125,.375,.875,2],[.125,.125,.375,.375,.625],[.125-Number.EPSILON,.125,.125+Number.EPSILON,.625,.875],[.625,.625,.625,.625,.625]],samples=Float64Array.from(rows.flat());
  for(const transpose of[false,true])assert.deepEqual(gridParity(samples,5,n,transpose),exhaustive(samples,5,n,transpose));
  assert.deepEqual([...gridParity(samples,5,n).subarray(0,n)],[1,0,1,1]);
  assert.ok(gridParity(new Float64Array(),0,n).every(v=>v===0));
});

test('grid masks match exhaustive classification for unequal, dense and extreme positive gaps',()=>{
  for(const counts of[[1,1],[2,5],[8,3],[16,16]])for(const n of[17,64,97])for(const extreme of[false,true]){
    const model=gridModel(counts,8,31);
    if(extreme)for(let i=0;i<model.z.length;i++)model.z[i]=800*Math.sin(i*17);
    const samples=gridSamples(gridControls(model),model,basisTable(n,model.k),n);
    const a=exhaustive(samples[0],counts[0],n),b=exhaustive(samples[1],counts[1],n,true);
    for(const phase of[1,-1])assert.deepEqual(gridMask(model,n,phase),Uint8Array.from(a,(v,i)=>v^b[i]^Number(phase===-1)));
  }
});

test('a new sweep observes moved grid cuts',()=>{
  const samples=Float64Array.from([.5,.5,.5,.5]),before=gridParity(samples,1,4);
  samples.fill(.25);
  const after=gridParity(samples,1,4);
  assert.notDeepEqual(after,before);assert.deepEqual(after,exhaustive(samples,1,4));
});
