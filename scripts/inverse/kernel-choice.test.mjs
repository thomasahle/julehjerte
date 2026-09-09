import test from 'node:test';
import assert from 'node:assert/strict';
import {measuredKernel,sameArray} from '../../static/inverse/core/kernel-choice.js';

test('batched measurements resolve sub-clock work and reuse only the decision',()=>{
  let clock=0,value=4,javascriptCalls=0,nativeCalls=0;
  const backend=measuredKernel(sameArray,{now:()=>Math.floor(clock),repetitions:16});
  const js=()=>{clock+=.3;javascriptCalls++;return Float64Array.of(value);};
  const native=()=>{clock+=.1;nativeCalls++;return Float64Array.of(value);};
  const first=backend.run(1000,js,native);
  assert.equal(backend.report()[0].backend,'wasm');assert.equal(backend.report()[0].timingRepetitions,16);
  assert.equal(javascriptCalls,33);assert.equal(nativeCalls,33);
  value=9;assert.deepEqual(backend.run(1000,js,native),Float64Array.of(9));
  assert.deepEqual(first,Float64Array.of(4));assert.equal(javascriptCalls,33);assert.equal(nativeCalls,34);
});

test('a differing intermediate batch result rejects an otherwise faster kernel',()=>{
  let clock=0,calls=0;
  const backend=measuredKernel(sameArray,{now:()=>clock,repetitions:16});
  const js=()=>{clock+=2;return [1];};
  const native=()=>{clock++;return [++calls===3?2:1];};
  assert.deepEqual(backend.run(1000,js,native),[1]);
  assert.equal(backend.report()[0].reason,'different_results');
  const previous=calls;backend.run(1000,js,native);assert.equal(calls,previous);
});

test('custom workload keys separate decisions and timing batches stay bounded',()=>{
  let clock=0,nativeCost=2;
  const backend=measuredKernel(sameArray,{now:()=>clock,key:s=>s.points+','+s.image,describe:s=>({...s})});
  const js=()=>{clock+=5;return [1];},native=()=>{clock+=nativeCost;return [1];};
  backend.run({points:100,image:64},js,native);nativeCost=8;
  backend.run({points:100,image:400},js,native);
  const records=backend.report();assert.deepEqual(records.map(r=>r.backend),['wasm','javascript']);
  assert.deepEqual(records.map(r=>r.image),[64,400]);records[0].points=7;assert.equal(backend.report()[0].points,100);
  for(const repetitions of[0,.5,65,NaN])assert.throws(()=>measuredKernel(sameArray,{repetitions}),RangeError);
});
