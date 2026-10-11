import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {installPaintObservation,collectPaintObservation} from './paint-observer.mjs';

function harness(t){
  const dom=new JSDOM('<button id="find"><span>Find the cuts</span></button><button id="open" disabled hidden>Open in Draw</button>',{runScripts:'outside-only'});
  const {window}=dom,calls=[];let now=0;
  t.after(()=>window.close());
  window.performance.now=()=>now;
  window.HTMLButtonElement.prototype.getClientRects=function(){return this.hidden||this.style.display==='none'?[]:[{}];};
  window.Worker=class extends window.EventTarget{
    postMessage(...args){calls.push(args);return 'forwarded';}
    emit(data){this.dispatchEvent(new window.MessageEvent('message',{data}));}
  };
  window.eval(`(${installPaintObservation.toString()})()`);
  const collect=window.eval(`(${collectPaintObservation.toString()})`);
  return{window,calls,at:value=>{now=value;},find:window.document.querySelector('#find'),open:window.document.querySelector('#open'),collect:()=>JSON.parse(JSON.stringify(collect()))};
}

test('page timestamps exclude later capture delays and wait for an enabled visible result',async t=>{
  const h=harness(t),worker=new h.window.Worker(),preview={mask:Uint8Array.of(0,1,1,0),resolution:2,weights:Float32Array.of(1,0,0,1)};
  h.at(100);h.find.querySelector('span').click();
  h.at(110);const input={id:1,action:'prepare'},options={transfer:[]};
  assert.equal(worker.postMessage(input,options),'forwarded');assert.equal(h.calls[0][0],input);assert.equal(h.calls[0][1],options);
  h.at(132);worker.emit({id:1,type:'prepared',preview});
  assert.equal(h.window.__paintQA.prepared,preview,'Receiving a mask must not copy its pixels during the timer.');
  h.at(137);worker.postMessage({id:2,action:'solve'});
  h.at(200);worker.emit({id:2,type:'result',result:{marker:'actual worker result'}});
  h.at(210);h.open.hidden=false;await Promise.resolve();
  assert.equal(h.window.__paintQA.marks.ready,null,'A disabled button is not ready.');
  h.at(220);h.open.disabled=false;h.open.style.visibility='hidden';await Promise.resolve();
  assert.equal(h.window.__paintQA.marks.ready,null,'A hidden button is not ready.');
  h.at(225);h.open.style.visibility='visible';await Promise.resolve();
  h.at(1000000);const captured=h.collect();
  assert.equal(captured.marks.ready,225);
  assert.deepEqual(captured.timings,{clickToPrepareRequestSeconds:.01,prepareRoundTripSeconds:.022,preparedToSolveRequestSeconds:.005,solveRoundTripSeconds:.063,resultToReadySeconds:.025,clickToReadySeconds:.125});
  assert.deepEqual(captured.prepared,{mask:[0,1,1,0],resolution:2,weights:[1,0,0,1]});
  preview.mask[0]=1;assert.equal(captured.prepared.mask[0],0,'Collection owns its serialized pixels.');
  h.at(2000000);assert.deepEqual(h.collect().marks,captured.marks,'Later bookkeeping cannot extend readiness.');
});

test('a new click ignores stale replies and requests on another worker',async t=>{
  const h=harness(t),oldWorker=new h.window.Worker(),worker=new h.window.Worker();
  h.find.click();oldWorker.postMessage({id:1,action:'prepare'});
  h.at(10);h.find.click();worker.postMessage({id:1,action:'prepare'});
  oldWorker.emit({id:1,type:'prepared',preview:{marker:'stale'}});
  worker.emit({id:1,type:'result',result:{marker:'wrong reply type'}});
  assert.equal(h.window.__paintQA.prepared,null);assert.equal(h.window.__paintQA.result,null);
  worker.emit({id:1,type:'prepared',preview:{mask:new Uint8Array(1),resolution:1}});
  worker.postMessage({id:2,action:'solve'});
  oldWorker.emit({id:2,type:'result',result:{marker:'wrong worker'}});
  assert.equal(h.window.__paintQA.result,null);
  h.at(20);worker.emit({id:2,type:'result',result:{marker:'current'}});
  h.open.hidden=false;h.open.disabled=false;await Promise.resolve();
  h.at(30);worker.emit({id:2,type:'result',result:{marker:'duplicate'}});
  assert.equal(h.collect().result.marker,'current');assert.equal(h.collect().marks.ready,20);
});

test('disabled clicks do not arm a run and worker errors never become readiness',t=>{
  const h=harness(t),worker=new h.window.Worker();h.find.disabled=true;
  h.find.querySelector('span').click();worker.postMessage({id:1,action:'prepare'});
  worker.emit({id:1,type:'prepared',preview:{marker:'import'}});
  assert.equal(h.window.__paintQA.marks,null);assert.equal(h.window.__paintQA.prepared,null);
  h.find.disabled=false;h.at(1);h.find.click();worker.postMessage({id:2,action:'prepare'});
  h.at(2);worker.emit({id:2,type:'error',message:'Controlled worker failure'});
  const result=h.collect();assert.equal(result.error.message,'Controlled worker failure');
  assert.equal(result.marks.failed,2);assert.equal(result.marks.ready,null);assert.equal(result.timings.clickToReadySeconds,null);
});


test('automatic crop evidence survives the Find click without starting its timer early',t=>{
  const h=harness(t),worker=new h.window.Worker(),crops={candidates:[{quad:[[10,20],[30,40],[50,60],[70,80]]}]};
  worker.emit({id:1,type:'crops',crops});
  assert.equal(h.collect().marks,null);
  assert.deepEqual(h.collect().crop,crops);
  h.find.click();
  assert.deepEqual(h.collect().crop,crops);
});
