import test from 'node:test';
import assert from 'node:assert/strict';
import {createBodyPredictor} from '../../static/inverse/neural/runtime.js';
import {detectPhotoCrops} from '../../static/inverse/neural/photo-crop.js';

const input={type:'pixels',imageWidth:24,imageHeight:24,rgba:Uint8ClampedArray.from({length:24*24*4},(_,i)=>[180,60,60,255][i%4])};
function runtime(){
 const stats={created:0,tensorsDisposed:0,outputsDisposed:0,released:0};
 const ort={env:{wasm:{}},Tensor:class{dispose(){stats.tensorsDisposed++;}},InferenceSession:{create:async()=>{
  stats.created++;return{run:async()=>({saliency:{data:new Float32Array(320**2).fill(.9),dispose(){stats.outputsDisposed++;this.data.fill(0);}}}),release:()=>stats.released++};
 }}};
 return{ort,stats};
}
test('paper inference loads once, uses one thread and detaches results before disposal',async()=>{
 const {ort,stats}=runtime();let loads=0;
 const predict=createBodyPredictor({loadRuntime:async()=>({ort}),loadModel:async()=>{loads++;return new Uint8Array([1]);}});
 const a=await predict(input),b=await predict(input);
 assert.equal(loads,1);assert.equal(stats.created,1);assert.equal(ort.env.wasm.numThreads,1);assert.equal(ort.env.wasm.proxy,false);
 assert.deepEqual(a.window,[0,0,24,24]);assert.ok(a.probability.every(p=>p>.89));assert.notEqual(a.probability,b.probability);
 assert.equal(stats.tensorsDisposed,2);assert.equal(stats.outputsDisposed,2);
});
test('a failed model load can be retried and empty images never request assets',async()=>{
 const {ort}=runtime();let loads=0;
 const predict=createBodyPredictor({loadRuntime:async()=>({ort}),loadModel:async()=>{if(++loads===1)throw new Error('offline');return new Uint8Array([1]);}});
 assert.equal(await predict({...input,rgba:new Uint8ClampedArray(input.rgba.length)}),null);assert.equal(loads,0);
 await assert.rejects(()=>predict(input),/offline/);assert.ok(await predict(input));assert.equal(loads,2);
});
test('a synchronous loader failure does not cache a rejected session',async()=>{
 const {ort}=runtime();let loads=0;
 const predict=createBodyPredictor({loadRuntime:()=>({ort}),loadModel:()=>{if(++loads===1)throw new Error('offline');return new Uint8Array([1]);}});
 await assert.rejects(()=>predict(input),/offline/);assert.ok(await predict(input));assert.equal(loads,2);
});
test('model failure preserves editable production suggestions and user regions skip inference',async()=>{
 const production={status:'needs_review',candidates:[{quad:[[1,1],[20,1],[20,20],[1,20]]}]};
 const failed=await detectPhotoCrops(input,{productionCrop:()=>production,predictBody:()=>{throw new Error('offline');}});
 assert.equal(failed.candidates,production.candidates);assert.equal(failed.bodyReview.status,'unavailable');
 const result=await detectPhotoCrops(input,{productionCrop:()=>production,predictBody:()=>assert.fail('Must respect instance selection'),roi:[0,0,24,24]});
 assert.equal(result.candidates,production.candidates);
});
test('unresolved multiple components still request a user selection',async()=>{
 const production={status:'needs_selection',candidates:[]};
 const result=await detectPhotoCrops(input,{productionCrop:()=>production,
  predictBody:()=>({probability:new Float32Array(400).fill(1),resolution:20,window:[0,0,24,24]}),
  learnedCrop:()=>({status:'needs_selection',candidates:[]})});
 assert.equal(result.status,'needs_selection');assert.deepEqual(result.candidates,[]);
});
test('cancelled inference never falls back to a stale crop',async()=>{
 let complete,cancelled=false;
 const pending=detectPhotoCrops(input,{productionCrop:()=>({status:'not_found',candidates:[]}),predictBody:()=>new Promise(resolve=>{complete=resolve;}),cancelled:()=>cancelled});
 await new Promise(resolve=>setImmediate(resolve));cancelled=true;complete(null);
 await assert.rejects(()=>pending,{name:'AbortError'});
});
test('a first load tells whoever waits its bytes, then that it is done',async()=>{
 const {ort}=runtime(),events=[];
 const predict=createBodyPredictor({loadRuntime:async()=>({ort}),loadModel:async onBytes=>{onBytes(1000000);onBytes(4615895);return new Uint8Array([1]);}});
 await predict(input,{onProgress:event=>events.push(event)});
 assert.ok(events.every(e=>e.stage==='paper-model'&&e.total===4615895));
 assert.deepEqual(events.filter(e=>!e.done).map(e=>e.loaded),[0,1000000,4615895]);
 assert.equal(events.at(-1).done,true);
 // Loaded, a later prediction reports nothing; warm() starts nothing new.
 const later=[];predict.warm();await predict(input,{onProgress:event=>later.push(event)});
 assert.equal(later.length,0);
});
