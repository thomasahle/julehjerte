import test from 'node:test';
import assert from 'node:assert/strict';
import {workerController} from '../../static/inverse/worker-controller.js';
import {AUTOMATIC_PRESET} from '../../static/inverse/core/presets.js';
import {fixture} from './fixtures.mjs';
import {solutionJSON} from '../../static/inverse/core/graph.js';

const config={...AUTOMATIC_PRESET,width:60,materialResolution:80,trials:0};
const input={type:'mask',resolution:80,mask:Uint8Array.from({length:6400},(_,i)=>(Math.floor((i%80)/20)+Math.floor(i/1600))%2)};
const packet={geometry:JSON.stringify(solutionJSON(fixture('straight'))),error:0};
const value={report:{stoppedEarly:true},files:{'cut_geometry.json':packet.geometry}};
function harness(options={}){
  const messages=[],workers=[],events=[];
  const scope={postMessage:data=>{messages.push(structuredClone(data));events.push(data.type);},close:()=>events.push('close')};
  const createWorker=()=>{
    const worker={sent:[],terminated:0,onmessage:null,onerror:null,onmessageerror:null,
      postMessage(data){this.sent.push(structuredClone(data));},terminate(){this.terminated++;events.push('terminate');}};
    workers.push(worker);return worker;
  };
  const handle=workerController(scope,{createWorker,...options});
  const send=(id,action,more={})=>handle({data:{id,action,settings:config,...more}});
  const reply=(worker,id,type,extra={})=>worker.onmessage?.({data:structuredClone({id,type,...extra})});
  return{messages,workers,events,send,reply};
}

test('Stop retains the artwork, returns on the solve channel and ignores late compute messages',async()=>{
  let complete,retained;
  const h=harness({finalize:async(target,cfg,packets)=>{retained={target,cfg,packets};return new Promise(resolve=>{complete=resolve;});}});
  await h.send(1,'prepare',{input});const solving=h.send(2,'solve'),child=h.workers[0];
  h.reply(child,2,'candidate',{candidate:packet});h.reply(child,2,'candidate',{candidate:packet});
  h.reply(child,2,'progress',{event:{stage:'directRefining',error:.1}});
  assert.equal(h.messages.filter(m=>m.type==='candidate').length,0);
  const late=child.onmessage,stopping=h.send(2,'stop');
  assert.equal(child.terminated,1);assert.equal(retained.packets.length,1);
  late({data:{id:2,type:'result',result:{wrong:true}}});
  await h.send(3,'prepare',{input});assert.match(h.messages.at(-1).message,/already working/);
  complete(value);await stopping;await solving;
  assert.deepEqual(h.messages.at(-1),{id:2,type:'result',result:value});assert.ok(!h.events.includes('close'));
  await h.send(4,'archive');assert.equal(h.messages.at(-1).type,'archive');
  const again=h.send(5,'solve');assert.equal(h.workers.length,2);
  assert.deepEqual(h.workers[1].sent[0].target,child.sent[0].target);
  await h.send(5,'cancel');await again;
});

test('Stop before the first valid checkpoint reports no solution and permits another solve',async()=>{
  const h=harness();await h.send(1,'prepare',{input});const solving=h.send(2,'solve');
  await h.send(2,'stop');await solving;
  assert.equal(h.messages.at(-1).type,'error');assert.equal(h.messages.at(-1).report.status,'no_validated_solution');
  assert.equal(h.messages.at(-1).report.termination,'user_stop');
  await h.send(3,'archive');assert.match(h.messages.at(-1).message,/Generate or check/);
  const retry=h.send(4,'solve');h.reply(h.workers[1],4,'result',{result:value});await retry;
  assert.equal(h.messages.at(-1).type,'result');
});

test('normal completion reuses the compute worker but no checkpoint survives into the next request',async()=>{
  const h=harness();await h.send(1,'prepare',{input});const first=h.send(2,'solve'),child=h.workers[0];
  h.reply(child,2,'candidate',{candidate:packet});h.reply(child,2,'result',{result:value});await first;
  const second=h.send(3,'solve');assert.equal(h.workers.length,1);
  h.reply(child,2,'candidate',{candidate:packet});await h.send(2,'stop');assert.equal(child.terminated,0);
  await h.send(3,'stop');await second;
  assert.equal(h.messages.at(-1).report.status,'no_validated_solution');assert.equal(child.terminated,1);
});

test('Cancel terminates the compute worker before acknowledging shutdown and discards finalization',async()=>{
  let complete;
  const h=harness({finalize:async()=>new Promise(resolve=>{complete=resolve;})});
  await h.send(1,'prepare',{input});const solving=h.send(2,'solve');
  const stopping=h.send(2,'stop');await h.send(2,'cancel');await solving;
  complete(value);await stopping;
  assert.equal(h.messages.filter(m=>m.type==='result').length,0);
  assert.equal(h.messages.at(-1).type,'cancelled');
  assert.ok(h.events.indexOf('terminate')<h.events.indexOf('cancelled'));
  assert.equal(h.events.at(-1),'close');
});

test('a failed child reports an engine failure and a subsequent solve creates a fresh child',async()=>{
  const h=harness();await h.send(1,'prepare',{input});const solving=h.send(2,'solve');
  h.workers[0].onerror({message:'Missing compute asset',preventDefault(){}});await solving;
  assert.equal(h.messages.at(-1).code,'ENGINE_UNAVAILABLE');assert.equal(h.workers[0].terminated,1);
  const retry=h.send(3,'solve');assert.equal(h.workers.length,2);
  h.reply(h.workers[1],3,'error',{message:'No routes',report:{status:'no_validated_solution'}});await retry;
  assert.equal(h.messages.at(-1).report.status,'no_validated_solution');
});

test('asynchronous crop detection is exclusive, cancellable and cannot publish stale results',async()=>{
 let complete,options;
 const h=harness({detectCrops:async(source,opts)=>{options=opts;return new Promise(resolve=>{complete=resolve;});}});
 const detecting=h.send(1,'detect-crops',{input});
 await h.send(2,'prepare',{input});assert.match(h.messages.at(-1).message,/already working/);
 await h.send(1,'cancel');assert.equal(options.cancelled(),true);
 options.onProgress({stage:'detecting'});complete({status:'candidate',candidates:[]});await detecting;
 assert.equal(h.messages.filter(m=>m.type==='crops').length,0);assert.equal(h.messages.at(-1).type,'cancelled');
});

test('crop provider failures clear the busy state and permit a later request',async()=>{
 let first=true;
 const h=harness({detectCrops:async()=>{if(first){first=false;throw new Error('load failed');}return{status:'not_found',candidates:[]};}});
 await h.send(1,'detect-crops',{input});assert.equal(h.messages.at(-1).message,'load failed');
 await h.send(2,'detect-crops',{input});assert.equal(h.messages.at(-1).type,'crops');
});

// Mal's solve: the exact search and the fitter in two workers side by side.
const both={...config,exactOutline:true,exactParallel:true};
const exactValue={report:{solver:{exactOutline:{chosen:'exact'}}},files:{'cut_geometry.json':packet.geometry}};

test('side by side, the exact search\'s template is taken when it comes and the fitter is ended',async()=>{
  const h=harness();await h.send(1,'prepare',{input});const solving=h.send(2,'solve',{settings:both});
  const [fitter,exact]=h.workers;
  assert.equal(fitter.sent[0].settings.exactRoute,'fitter');assert.equal(exact.sent[0].settings.exactRoute,'exact');
  // The live view shows the fitter's progress until the exact search draws,
  // then the exact search's.
  h.reply(exact,2,'progress',{event:{stage:'exactOutline'}});h.reply(fitter,2,'progress',{event:{stage:'directRefining'}});
  h.reply(exact,2,'progress',{event:{stage:'exactOutline',geometry:packet.geometry}});h.reply(fitter,2,'progress',{event:{stage:'directPolishing'}});
  assert.deepEqual(h.messages.filter(m=>m.type==='progress'&&m.id===2).map(m=>m.event.stage+(m.event.geometry?'+':'')),['directRefining','exactOutline+']);
  // A fitted answer first is held for it, and offered after it when it passes.
  const fitted={...value,report:{...value.report,templateChecksPassed:true}};
  h.reply(fitter,2,'result',{result:fitted});assert.equal(h.messages.filter(m=>m.type==='result').length,0);
  h.reply(exact,2,'result',{result:exactValue});await solving;
  assert.deepEqual(h.messages.slice(-2),[{id:2,type:'result',result:exactValue},{id:2,type:'alternative',result:fitted}]);
});

test('side by side, a fitter still running after the exact template offers its answer when it comes, unless asked something else first',async()=>{
  const fitted={...value,report:{...value.report,templateChecksPassed:true}};
  const h=harness();await h.send(1,'prepare',{input});let solving=h.send(2,'solve',{settings:both});
  let [fitter,exact]=h.workers;
  h.reply(exact,2,'result',{result:exactValue});await solving;
  // The page is told a second template is on its way.
  assert.deepEqual(h.messages.slice(-2).map(m=>[m.type,m.pending]),[['result',undefined],['alternative',true]]);assert.equal(fitter.terminated,0);
  h.reply(fitter,2,'progress',{event:{stage:'directRefining'}});assert.equal(h.messages.at(-1).pending,true);
  h.reply(fitter,2,'result',{result:fitted});
  assert.deepEqual(h.messages.at(-1),{id:2,type:'alternative',result:fitted});
  // A failing fitted answer is no alternative; a new request ends the fitter.
  solving=h.send(3,'solve',{settings:both});[fitter,exact]=h.workers.slice(-2);
  h.reply(exact,3,'result',{result:exactValue});await solving;
  await h.send(4,'prepare',{input});assert.equal(fitter.terminated,1);
  h.reply(fitter,3,'result',{result:fitted});assert.equal(h.messages.filter(m=>m.type==='alternative'&&m.result).length,1);
});

test('side by side, a trailing fitter whose answer fails says none is coming',async()=>{
  const h=harness();await h.send(1,'prepare',{input});const solving=h.send(2,'solve',{settings:both});
  const [fitter,exact]=h.workers;
  h.reply(exact,2,'result',{result:exactValue});await solving;
  h.reply(fitter,2,'result',{result:value});
  assert.deepEqual(h.messages.at(-1),{id:2,type:'alternative',pending:false});
});

test('side by side, the fitter\'s template stands once the exact search finds none',async()=>{
  const h=harness();await h.send(1,'prepare',{input});const solving=h.send(2,'solve',{settings:both});
  const [fitter,exact]=h.workers;
  h.reply(exact,2,'error',{message:'The exact search found no template the export passes.',code:'NO_EXACT_TEMPLATE'});
  assert.equal(exact.terminated,1);assert.equal(h.messages.filter(m=>m.type==='error').length,0);
  // From then on the fitter's progress is shown, and its answer taken.
  h.reply(fitter,2,'progress',{event:{stage:'directRefining'}});assert.equal(h.messages.at(-1).event.stage,'directRefining');
  h.reply(fitter,2,'result',{result:value});await solving;
  assert.deepEqual(h.messages.at(-1),{id:2,type:'result',result:value});
});

test('side by side, an exact search overrunning its minute is ended and the fitter\'s answer taken',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const h=harness();await h.send(1,'prepare',{input});const solving=h.send(2,'solve',{settings:both});
  const [fitter,exact]=h.workers;
  t.mock.timers.tick(1000*64);assert.equal(exact.terminated,0);
  t.mock.timers.tick(1000*2);assert.equal(exact.terminated,1);
  h.reply(fitter,2,'result',{result:value});
  await solving;assert.deepEqual(h.messages.at(-1),{id:2,type:'result',result:value});
  // A late exact answer is ignored.
  exact.onmessage?.({data:{id:2,type:'result',result:exactValue}});assert.equal(h.messages.filter(m=>m.type==='result').length,1);
});

test('side by side, Cancel ends both workers',async()=>{
  const h=harness();await h.send(1,'prepare',{input});const solving=h.send(2,'solve',{settings:both});
  await h.send(2,'cancel');await solving;
  assert.deepEqual(h.workers.map(w=>w.terminated),[1,1]);assert.equal(h.messages.at(-1).type,'cancelled');
});

test('side by side, Stop gives the exact search\'s drawing the live view shows, else the fitter\'s best',async()=>{
  const drawn=[];
  const h=harness({finalizeExact:(target,cfg,geometry)=>{drawn.push(geometry);return geometry==='bad'?null:exactValue;},finalize:async()=>value});
  await h.send(1,'prepare',{input});let solving=h.send(2,'solve',{settings:both});
  h.reply(h.workers[1],2,'progress',{event:{stage:'exactOutline',geometry:packet.geometry}});
  await h.send(2,'stop');await solving;
  assert.deepEqual(drawn,[packet.geometry]);assert.deepEqual(h.messages.at(-1).result,exactValue);
  // A drawing that does not pass: the fitter's checkpoints, as before.
  solving=h.send(3,'solve',{settings:both});
  h.reply(h.workers.at(-1),3,'progress',{event:{stage:'exactOutline',geometry:'bad'}});
  await h.send(3,'stop');await solving;assert.deepEqual(h.messages.at(-1).result,value);
});

test('side by side, a fitted answer waiting for the exact search says so, and Stop takes it',async()=>{
  const h=harness({finalize:async()=>{throw new Error('the checkpoints should not be needed');}});
  await h.send(1,'prepare',{input});const solving=h.send(2,'solve',{settings:both});
  h.reply(h.workers[0],2,'result',{result:value});
  assert.equal(h.messages.at(-1).event.stage,'exactOutline');
  await h.send(2,'stop');await solving;assert.deepEqual(h.messages.at(-1).result,value);
});

test('side by side, once the fitter\'s answer waits, the exact search has until 40 s',async t=>{
  t.mock.timers.enable({apis:['setTimeout','Date']});
  const h=harness({now:()=>Date.now()});await h.send(1,'prepare',{input});const solving=h.send(2,'solve',{settings:both});
  const [fitter,exact]=h.workers;
  t.mock.timers.tick(1000*10);h.reply(fitter,2,'result',{result:value});
  t.mock.timers.tick(1000*29);assert.equal(exact.terminated,0);
  t.mock.timers.tick(1000*2);assert.equal(exact.terminated,1);
  await solving;assert.deepEqual(h.messages.at(-1).result,value);
});


test('side by side, a passing fitted answer goes out at 20 s while the exact search has drawn nothing, its template following as an alternative',async t=>{
  t.mock.timers.enable({apis:['setTimeout','Date']});
  const fitted={...value,report:{...value.report,templateChecksPassed:true}},exactPassing={...exactValue,report:{...exactValue.report,templateChecksPassed:true}};
  const h=harness({now:()=>Date.now()});await h.send(1,'prepare',{input});const solving=h.send(2,'solve',{settings:both});
  const [fitter,exact]=h.workers;
  t.mock.timers.tick(1000*10);h.reply(fitter,2,'result',{result:fitted});
  t.mock.timers.tick(1000*9);assert.equal(h.messages.filter(m=>m.type==='result').length,0);
  t.mock.timers.tick(1000*2);await solving;
  assert.deepEqual(h.messages.slice(-2),[{id:2,type:'result',result:fitted},{id:2,type:'alternative',pending:true}]);assert.equal(exact.terminated,0);
  // Its progress is not shown any more; its template comes as the alternative.
  h.reply(exact,2,'progress',{event:{stage:'exactOutline',geometry:packet.geometry}});assert.equal(h.messages.at(-1).type,'alternative');
  h.reply(exact,2,'result',{result:exactPassing});
  assert.deepEqual(h.messages.at(-1),{id:2,type:'alternative',result:exactPassing});
});

test('side by side, an exact search that has drawn keeps the fitter\'s answer waiting until 40 s',async t=>{
  t.mock.timers.enable({apis:['setTimeout','Date']});
  const fitted={...value,report:{...value.report,templateChecksPassed:true}};
  const h=harness({now:()=>Date.now()});await h.send(1,'prepare',{input});const solving=h.send(2,'solve',{settings:both});
  const [fitter,exact]=h.workers;
  t.mock.timers.tick(1000*10);h.reply(fitter,2,'result',{result:fitted});
  t.mock.timers.tick(1000*5);h.reply(exact,2,'progress',{event:{stage:'exactOutline',geometry:packet.geometry}});
  t.mock.timers.tick(1000*24);assert.equal(h.messages.filter(m=>m.type==='result').length,0);assert.equal(exact.terminated,0);
  t.mock.timers.tick(1000*2);assert.equal(exact.terminated,1);
  await solving;assert.deepEqual(h.messages.at(-1),{id:2,type:'result',result:fitted});
});

test('side by side, an exact search trailing the fitter\'s answer is ended at its minute, or by a new request',async t=>{
  t.mock.timers.enable({apis:['setTimeout','Date']});
  const fitted={...value,report:{...value.report,templateChecksPassed:true}};
  const h=harness({now:()=>Date.now()});await h.send(1,'prepare',{input});let solving=h.send(2,'solve',{settings:both});
  let [fitter,exact]=h.workers;
  h.reply(fitter,2,'result',{result:fitted});t.mock.timers.tick(1000*21);await solving;
  assert.equal(h.messages.at(-1).pending,true);
  t.mock.timers.tick(1000*43);assert.equal(exact.terminated,0);
  t.mock.timers.tick(1000*2);assert.equal(exact.terminated,1);assert.deepEqual(h.messages.at(-1),{id:2,type:'alternative',pending:false});
  // The fitter's worker is reused, the ended exact search's made anew.
  solving=h.send(3,'solve',{settings:both});exact=h.workers.at(-1);assert.notEqual(exact,fitter);
  h.reply(fitter,3,'result',{result:fitted});t.mock.timers.tick(1000*21);await solving;
  await h.send(4,'prepare',{input});assert.equal(exact.terminated,1);
  h.reply(exact,3,'result',{result:exactValue});assert.equal(h.messages.filter(m=>m.type==='alternative'&&m.result).length,0);
});
