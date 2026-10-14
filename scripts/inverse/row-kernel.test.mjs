import test from 'node:test';
import assert from 'node:assert/strict';
import {loadNumericalKernel,nativeGridRows} from '../../static/inverse/core/numerical-kernel.js';
import {alternatingRuns,initializeGrid} from '../../static/inverse/core/direct/initialize.js';

function fixture(n,count,mode){
  return{
    target:Float64Array.from({length:n*n},(_,i)=>mode==='ties'?.5:(i*17%29)/29),
    weights:mode==='ones'?new Float64Array(n*n).fill(1):mode==='weighted'||mode==='empty-rows'
      ?Float64Array.from({length:n*n},(_,i)=>mode==='empty-rows'&&Math.floor(i/n)%3===0?0:(i%7)/6):null,
    flips:Uint8Array.from({length:n*n},(_,i)=>Number(i%11<4)),
    priors:Float64Array.from({length:n*count},(_,i)=>((i%count)+1)/(count+1))
  };
}
function reference({target,weights,flips,priors},n,count,family,phase,minimum,weight,weightScale){
  const positions=new Float64Array(n*count);
  for(let y=0;y<n;y++){
    const prior=priors.slice(y*count,(y+1)*count),row=new Float64Array(n),rowWeights=weights?new Float64Array(n):null;
    for(let x=0;x<n;x++){
      const i=family?x*n+y:y*n+x;row[x]=flips[y*n+x]?1-target[i]:target[i];
      if(rowWeights)rowWeights[x]=weights[i];
    }
    positions.set(alternatingRuns(row,count,phase,prior,{minimum,weight,pixelWeights:rowWeights,weightScale})||prior,y*count);
  }
  return positions;
}

test('row initialization uses the unchanged JavaScript fallback before Wasm is loaded',()=>{
  const f=fixture(11,3,'weighted');
  assert.equal(nativeGridRows(f.target,f.weights,f.flips,f.priors,11,3,0,1,1,.3,2),null);
  assert.deepEqual(initializeGrid(f.target,11,[3,2],1,{resolution:11,rounds:3,weights:f.weights}),
    initializeGrid(f.target,11,[3,2],1,{resolution:11,rounds:3,weights:f.weights,native:false}));
});

test('batched Wasm rows exactly match the independent JS DP including ties and infeasible rows',async()=>{
  assert.equal((await loadNumericalKernel()).backend,'wasm');
  for(const n of[7,31,96,98])for(const count of[0,1,3,6])for(const mode of['plain','ties','ones','weighted','empty-rows']){
    const f=fixture(n,count,mode),before=structuredClone(f);
    for(const family of[0,1])for(const phase of[0,1])for(const minimum of[1,2])for(const weightScale of[1,2.7]){
      const expected=reference(f,n,count,family,phase,minimum,.3,weightScale);
      const actual=nativeGridRows(f.target,f.weights,f.flips,f.priors,n,count,family,phase,minimum,.3,weightScale);
      assert.deepEqual(actual,expected,JSON.stringify({n,count,mode,family,phase,minimum,weightScale}));
    }
    assert.deepEqual(f,before);
  }
});

test('Wasm initialization preserves complete spline trajectories and source ownership',()=>{
  const n=67,target=Float64Array.from({length:n*n},(_,i)=>{
    const x=i%n,y=Math.floor(i/n);return Math.min(1,Math.max(0,Number((Math.floor(x/13)+Math.floor((y+4*Math.sin(x/9))/17))%2===0)+(i%13-6)*.01));
  }),weights=Float64Array.from(target,(_,i)=>i%n<8||i%n>59?0:(i%7+1)/7);
  for(const importance of[null,weights])for(const resolution of[31,96,98])for(const phase of[1,-1]){
    const options={resolution,weights:importance,k:8,rounds:10};
    const actual=initializeGrid(target,n,[3,2],phase,options),expected=initializeGrid(target,n,[3,2],phase,{...options,native:false});
    assert.deepEqual(actual,expected);
    const snapshot=structuredClone(actual),edited=Float64Array.from(target,p=>1-p);
    initializeGrid(edited,n,[4,3],-phase,options);assert.deepEqual(actual,snapshot);
  }
});

test('row kernel rejects malformed dimensions and later scratch growth cannot change its output',()=>{
  const f=fixture(7,3,'weighted'),run=(...overrides)=>nativeGridRows(f.target,f.weights,f.flips,f.priors,...overrides);
  for(const args of[[8,3,0,0,1,.3,1],[7,4,0,0,1,.3,1],[7,3,2,0,1,.3,1],[7,3,0,2,1,.3,1],[7,3,0,0,0,.3,1],[7,3,0,0,1e20,.3,1],[7,3,0,0,1,.3,Infinity]])assert.equal(run(...args),null);
  const positions=run(7,3,0,0,1,.3,1),before=positions.slice(),large=fixture(400,16,'plain');
  nativeGridRows(large.target,large.weights,large.flips,large.priors,400,16,1,1,1,.3,1);
  assert.deepEqual(positions,before);
});
