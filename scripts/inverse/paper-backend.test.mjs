import test from 'node:test';import assert from 'node:assert/strict';
import {paperBackend,sameArray,sameCore} from '../../static/inverse/core/paper-backend.js';

test('backend selection measures a repeated gain and never caches a previous input or output',()=>{
  let clock=0,value=3,jsCalls=0,nativeCalls=0;
  const backend=paperBackend(sameArray,{now:()=>clock}),js=()=>{clock+=5;jsCalls++;return Float64Array.of(value);},native=()=>{clock+=2;nativeCalls++;return Float64Array.of(value);};
  const first=backend.run(40000,js,native);assert.deepEqual(first,Float64Array.of(3));assert.equal(backend.report()[0].calibrating,true);
  assert.equal(jsCalls,1);assert.equal(nativeCalls,1);
  value=8;assert.deepEqual(backend.run(40000,js,native),Float64Array.of(8));assert.equal(backend.report()[0].backend,'wasm');
  assert.equal(jsCalls,2);assert.equal(nativeCalls,2);
  value=9;assert.deepEqual(backend.run(40000,js,native),Float64Array.of(9));assert.equal(jsCalls,2);assert.equal(nativeCalls,3);assert.deepEqual(first,Float64Array.of(3));
  const report=backend.report();report[0].timings[0].wasm=1000;assert.equal(backend.report()[0].timings[0].wasm,2);
});

test('ambiguous clocks and inconsistent speed gains keep the reference implementation',()=>{
  for(const costs of[[0,0],[1,10]]){
    let clock=0,at=0,jsCalls=0,nativeCalls=0;
    const backend=paperBackend(sameArray,{now:()=>clock}),js=()=>{clock+=costs[0]===0?0:5;jsCalls++;return [2];},native=()=>{clock+=costs[Math.min(at++,1)];nativeCalls++;return [2];};
    backend.run(40000,js,native);backend.run(40000,js,native);assert.equal(backend.report()[0].backend,'javascript');
    const before=nativeCalls;backend.run(40000,js,native);assert.equal(nativeCalls,before);assert.equal(jsCalls,3);
  }
});

test('a fast but unequal result is rejected and size-specific records stay bounded',()=>{
  let clock=0;
  const backend=paperBackend(sameArray,{now:()=>clock}),js=()=>{clock+=5;return [2];},bad=()=>{clock++;return [3];};
  assert.deepEqual(backend.run(40000,js,bad),[2]);assert.equal(backend.report()[0].reason,'different_results');
  backend.run(400000,js,()=>{clock++;return [2];});assert.equal(backend.report()[1].calibrating,true);
  backend.run(400000,js,()=>{clock++;return [2];});assert.equal(backend.report()[1].backend,'wasm');
  for(let i=0;i<20;i++)backend.run(2**i,js,bad);assert.equal(backend.report().length,8);
  assert.equal(sameArray(null,null),false);
  const core={labels:Int32Array.of(1),parts:[{id:1,anchored:true,area:1,significant:true}],anchors:new Set([1]),floating:[]};
  assert.equal(sameCore(core,structuredClone(core)),true);assert.equal(sameCore(core,{...core,anchors:new Set()}),false);
});
