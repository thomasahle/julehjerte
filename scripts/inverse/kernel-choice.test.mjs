import test from 'node:test';
import assert from 'node:assert/strict';
import {measuredKernel,sameArray} from '../../static/inverse/core/kernel-choice.js';

test('dense numeric comparisons preserve exact values, offsets and array semantics',()=>{
  const reference=(a,b)=>!!a&&!!b&&a.length===b.length&&a.every((v,i)=>Object.is(v,b[i]));
  const types=[Uint8Array,Uint16Array,Int32Array,Float32Array,Float64Array,BigInt64Array];
  for(const Type of types){
    const big=Type===BigInt64Array,values=big?[1n,2n,3n]:[1,2,3],storage=new Type([big?99n:99,...values,big?99n:99]);
    const a=storage.subarray(1,4),b=new Type(values);
    assert.equal(sameArray(a,b),true);assert.equal(sameArray(a,values),true);
    for(let i=0;i<b.length;i++){const changed=b.slice();changed[i]=big?7n:7;assert.equal(sameArray(a,changed),false);}
    assert.equal(sameArray(a,b.subarray(1)),false);assert.equal(sameArray(new Type(),new Type()),true);
  }
  const sparse=new Array(2);sparse[1]=2;
  const pairs=[
    [Float64Array.of(NaN,Infinity,-Infinity,-0),[NaN,Infinity,-Infinity,-0]],
    [Float64Array.of(0),Float64Array.of(-0)],
    [Float64Array.of(1),Float64Array.of(1+Number.EPSILON)],
    [sparse,[99,2]],[[undefined,2],[99,2]],[[1,2],Float64Array.of(1,2)],
    [null,null],[[],[]],[[],null]
  ];
  for(const[a,b]of pairs)assert.equal(sameArray(a,b),reference(a,b));
  // A detached view has zero length but still throws when .every is called.
  const detached=new Float64Array(1);structuredClone(detached,{transfer:[detached.buffer]});
  assert.throws(()=>sameArray(detached,new Float64Array()),TypeError);
  assert.throws(()=>sameArray(new DataView(new ArrayBuffer(1)),new DataView(new ArrayBuffer(1))),TypeError);
});

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
  for(const minimumBatchMilliseconds of[-1,101,NaN,Infinity])assert.throws(()=>measuredKernel(sameArray,{minimumBatchMilliseconds}),RangeError);
});

test('adaptive batches avoid repeating slow calls and normalize unequal batch lengths',()=>{
  for(const [jsCost,nativeCost]of[[20,5],[2,.5]]){
    let clock=0,jsCalls=0,nativeCalls=0;
    const backend=measuredKernel(sameArray,{now:()=>clock,repetitions:16,minimumBatchMilliseconds:4});
    backend.run(1000,()=>{clock+=jsCost;jsCalls++;return [2];},()=>{clock+=nativeCost;nativeCalls++;return [2];});
    const record=backend.report()[0];assert.equal(record.backend,'wasm');
    assert.equal(record.maximumTimingRepetitions,16);
    assert.equal(jsCalls,1+2*Math.max(1,4/jsCost));assert.equal(nativeCalls,1+2*Math.max(1,4/nativeCost));
    for(const t of record.timings){assert.equal(t.javascript,jsCost);assert.equal(t.wasm,nativeCost);}
    record.timings[0].repetitions.wasm=100;assert.notEqual(backend.report()[0].timings[0].repetitions.wasm,100);
  }
});

test('adaptive batches stop at the call cap when the clock cannot resolve the work',()=>{
  let calls=0;
  const backend=measuredKernel(sameArray,{now:()=>0,repetitions:16,minimumBatchMilliseconds:4});
  const run=()=>{calls++;return [2];};backend.run(1000,run,run);
  assert.equal(calls,66);assert.equal(backend.report()[0].backend,'javascript');
  assert.ok(backend.report()[0].timings.every(t=>t.repetitions.javascript===16&&t.repetitions.wasm===16));
});

test('adaptive selection checks every result in unequal-length batches',()=>{
  let clock=0,jsCalls=0,nativeCalls=0;
  const backend=measuredKernel(sameArray,{now:()=>clock,repetitions:16,minimumBatchMilliseconds:4});
  backend.run(1000,()=>{clock+=4;jsCalls++;return [2];},()=>{clock+=.5;return [++nativeCalls===5?3:2];});
  assert.equal(jsCalls,2);assert.equal(nativeCalls,9);
  assert.equal(backend.report()[0].reason,'different_results');
});

test('quick timing resolves a rounded tie before retaining a faster kernel',()=>{
  let clock=0,value=2,jsCalls=0,nativeCalls=0;
  const backend=measuredKernel(sameArray,{now:()=>Math.floor(clock),quickDecision:true,repetitions:32,minimumBatchMilliseconds:8});
  const js=()=>{clock+=1.2;jsCalls++;return Float64Array.of(value);};
  const native=()=>{clock+=.8;nativeCalls++;return Float64Array.of(value);};
  const first=backend.run(1000,js,native),record=backend.report()[0];
  assert.equal(record.backend,'wasm');assert.equal(record.initialTimings[0].javascript,record.initialTimings[0].wasm);
  assert.ok(record.timings.every(t=>t.wasm<t.javascript*.9));
  record.initialTimings[0].javascript=1000;assert.notEqual(backend.report()[0].initialTimings[0].javascript,1000);
  const before=[jsCalls,nativeCalls];value=9;
  assert.deepEqual(backend.run(1000,js,native),Float64Array.of(9));assert.deepEqual([jsCalls,nativeCalls],[before[0],before[1]+1]);
  assert.deepEqual(first,Float64Array.of(2));
});

test('decisive timing orders avoid the longer calibration in either direction',()=>{
  for(const [jsCost,nativeCost,expected]of [[20,5,'wasm'],[5,20,'javascript']]){
    let clock=0,jsCalls=0,nativeCalls=0;
    const backend=measuredKernel(sameArray,{now:()=>clock,quickDecision:true,repetitions:32,minimumBatchMilliseconds:8});
    backend.run(1000,()=>{clock+=jsCost;jsCalls++;return [2];},()=>{clock+=nativeCost;nativeCalls++;return [2];});
    assert.equal(backend.report()[0].backend,expected);assert.equal(backend.report()[0].initialTimings,undefined);
    assert.equal(jsCalls,3);assert.equal(nativeCalls,3);
  }
});

test('an unresolved quick timing stays bounded and a bad refinement result is rejected',()=>{
  let calls=0;
  const frozen=measuredKernel(sameArray,{now:()=>0,quickDecision:true,repetitions:32,minimumBatchMilliseconds:8});
  const run=()=>{calls++;return [2];};frozen.run(1000,run,run);
  assert.equal(calls,134);assert.equal(frozen.report()[0].backend,'javascript');
  let clock=0,nativeCalls=0;
  const backend=measuredKernel(sameArray,{now:()=>Math.floor(clock),quickDecision:true,repetitions:32,minimumBatchMilliseconds:8});
  const js=()=>{clock+=1.2;return [2];},native=()=>{clock+=.8;return [++nativeCalls===5?3:2];};
  assert.deepEqual(backend.run(1000,js,native),[2]);assert.equal(backend.report()[0].reason,'different_results');
  assert.ok(backend.report()[0].initialTimings);const before=nativeCalls;
  backend.run(1000,js,native);assert.equal(nativeCalls,before);
});

test('cross-call calibration reverses order, verifies each new input and retains no result',()=>{
 let clock=0,value=2;const calls=[],backend=measuredKernel(sameArray,{now:()=>clock,calibrateAcrossCalls:true});
 const js=()=>{calls.push('js');clock+=5;return Float64Array.of(value);},wasm=()=>{calls.push('wasm');clock+=2;return Float64Array.of(value);};
 const first=backend.run(40000,js,wasm);assert.equal(backend.report()[0].calibrating,true);assert.deepEqual(calls,['js','wasm']);
 value=7;const second=backend.run(40000,js,wasm);assert.deepEqual(calls,['js','wasm','wasm','js']);assert.equal(backend.report()[0].backend,'wasm');
 value=11;assert.deepEqual(backend.run(40000,js,wasm),Float64Array.of(11));assert.equal(calls.length,5);
 assert.deepEqual(first,Float64Array.of(2));assert.deepEqual(second,Float64Array.of(7));
 const report=backend.report();report[0].timings[0].wasm=1000;assert.equal(backend.report()[0].timings[0].wasm,2);
});

test('cross-call calibration rejects a mismatch on either input and never resumes native calls',()=>{
 for(const badCall of [1,2]){
  let clock=0,value=1,nativeCalls=0;const backend=measuredKernel(sameArray,{now:()=>clock,calibrateAcrossCalls:true});
  const js=()=>{clock+=5;return [value];},wasm=()=>{clock++;nativeCalls++;return [nativeCalls===badCall?-1:value];};
  for(value=1;value<=3;value++)assert.deepEqual(backend.run(40000,js,wasm),[value]);
  assert.equal(nativeCalls,badCall);assert.equal(backend.report()[0].reason,'different_results');
 }
});

test('cross-call calibration requires gains on both inputs and separates workload buckets',()=>{
 for(const costs of [[0,0,0,0],[5,2,5,7],[5,5,5,5]]){
  let clock=0,index=0;const backend=measuredKernel(sameArray,{now:()=>clock,calibrateAcrossCalls:true});
  for(const round of [0,1])backend.run(40000,()=>{clock+=costs[2*round];return [round];},()=>{clock+=costs[2*round+1];index++;return [round];});
  assert.equal(backend.report()[0].backend,'javascript');backend.run(40000,()=>[9],()=>{throw new Error('Rejected native backend was used');});assert.equal(index,2);
 }
 let clock=0;const backend=measuredKernel(sameArray,{now:()=>clock,calibrateAcrossCalls:true}),js=()=>{clock+=5;return [1];},wasm=()=>{clock+=2;return [1];};
 backend.run(40000,js,wasm);backend.run(400000,js,wasm);assert.ok(backend.report().every(r=>r.calibrating));
 backend.run(40000,js,wasm);assert.equal(backend.report()[0].backend,'wasm');assert.equal(backend.report()[1].calibrating,true);
 for(let i=0;i<20;i++)backend.run(2**i,js,wasm);assert.equal(backend.report().length,8);
 for(const options of [{repetitions:2},{minimumBatchMilliseconds:1},{quickDecision:true},{calibrateAcrossCalls:'yes'}])assert.throws(()=>measuredKernel(sameArray,{calibrateAcrossCalls:true,...options}),RangeError);
});
