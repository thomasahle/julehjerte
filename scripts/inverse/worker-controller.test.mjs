import test from 'node:test';
import assert from 'node:assert/strict';
import {workerController,ladderCount} from '../../static/inverse/worker-controller.js';
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
  // One ladder unless a test asks for more: the default follows the machine's threads.
  const handle=workerController(scope,{createWorker,ladders:1,...options});
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

// The colour locator in a worker of its own, beside the paper model.
function cropHarness(){
 const crops=[],calls=[];
 const createCropWorker=()=>{
  const worker={sent:[],terminated:0,onmessage:null,onerror:null,onmessageerror:null,
   postMessage(data){this.sent.push(data);},terminate(){this.terminated++;}};
  crops.push(worker);return worker;
 };
 const h=harness({createCropWorker,detectCrops:async(source,opts)=>{const call={opts,colour:opts.productionCrop(source,{roi:source.roi,onProgress:opts.onProgress})};calls.push(call);return call.colour;}});
 return{...h,crops,calls};
}
const pixels={type:'pixels',imageWidth:20,imageHeight:20,rgba:new Uint8ClampedArray(1600)};

test('a photograph\'s colour locator answers from its own worker, which later searches reuse',async()=>{
 const h=cropHarness(),found={status:'candidate',candidates:[{quad:[[0,0],[1,0],[1,1],[0,1]]}]};
 const detecting=h.send(1,'detect-crops',{input:pixels});await null;
 const [worker]=h.crops,[sent]=worker.sent;
 assert.equal(sent.input,pixels);assert.equal(sent.roi,undefined);
 assert.deepEqual(h.messages.filter(m=>m.type==='progress').map(m=>m.event.stage),['detecting']);
 worker.onmessage({data:{id:sent.id+1,crops:{wrong:true}}});
 worker.onmessage({data:{id:sent.id,crops:found}});await detecting;
 assert.deepEqual(h.messages.at(-1),{id:1,type:'crops',crops:found});
 const again=h.send(2,'detect-crops',{input:pixels});await null;
 assert.equal(h.crops.length,1);assert.equal(worker.sent.length,2);
 worker.onmessage({data:{id:worker.sent[1].id,message:'locator failed'}});await again;
 assert.equal(h.messages.at(-1).message,'locator failed');
});

test('warming the paper model starts the colour locator\'s worker, which the search then uses',async()=>{
 const h=cropHarness();
 await h.send(1,'warm-neural');assert.equal(h.crops.length,1);assert.equal(h.crops[0].sent.length,0);
 await h.send(2,'warm-neural');assert.equal(h.crops.length,1);
 const detecting=h.send(3,'detect-crops',{input:pixels});await null;
 assert.equal(h.crops.length,1);assert.equal(h.crops[0].sent.length,1);
 h.crops[0].onmessage({data:{id:h.crops[0].sent[0].id,crops:{status:'not_found',candidates:[]}}});await detecting;
 assert.equal(h.messages.at(-1).type,'crops');
});

test('a cancel ends the colour locator\'s worker, and the next search starts another',async()=>{
 const h=cropHarness();
 const detecting=h.send(1,'detect-crops',{input:pixels});await null;
 await h.send(1,'cancel');await assert.rejects(h.calls[0].colour,{name:'AbortError'});await detecting;
 assert.equal(h.crops[0].terminated,1);assert.equal(h.messages.at(-1).type,'cancelled');
 const again=h.send(2,'detect-crops',{input:pixels});await null;
 assert.equal(h.crops.length,2);
 h.crops[1].onmessage({data:{id:h.crops[1].sent[0].id,crops:{status:'not_found',candidates:[]}}});await again;
 assert.equal(h.messages.at(-1).type,'crops');
});

test('a colour locator worker that fails or cannot start is run in the engine\'s own worker',async()=>{
 const h=cropHarness();
 const detecting=h.send(1,'detect-crops',{input:pixels});await null;
 h.crops[0].onerror({preventDefault(){}});await detecting;
 assert.equal(h.crops[0].terminated,1);
 assert.deepEqual(h.messages.at(-1),{id:1,type:'crops',crops:{status:'not_found',reason:'The image is too small for automatic outline fitting.',candidates:[]}});
 const none=harness({createCropWorker:()=>{throw new ReferenceError('Worker is not defined');},detectCrops:async(source,opts)=>opts.productionCrop(source,{})});
 await none.send(1,'detect-crops',{input:pixels});
 assert.equal(none.messages.at(-1).crops.status,'not_found');
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

// With the network (cutModel), its ladder in a third worker beside them.
const ladderValue=(hidden,bound,more={})=>({report:{solver:{exactOutline:{chosen:'exact',...more,search:{hidden,bound,ladder:100}}}},files:{'cut_geometry.json':packet.geometry}});
const todayValue=(hidden,more={})=>({report:{solver:{exactOutline:{chosen:'exact',search:{hidden,bound:0}}},...more},files:{'cut_geometry.json':packet.geometry}});
async function racing(){
  const h=harness({predictCutMaps:async()=>({size:1})});await h.send(1,'prepare',{input});
  const solving=h.send(2,'solve',{settings:{...both,cutModel:true}});
  await new Promise(resolve=>setImmediate(resolve));
  const [fitter,exact,ladder]=h.workers;
  assert.equal(ladder.sent[0].settings.ladderOnly,true);assert.ok(ladder.sent[0].settings.cutMaps);assert.equal(exact.sent[0].settings.cutMaps,undefined);
  return {h,solving,fitter,exact,ladder};
}

test('side by side with the network, a ladder template at its lower bound is taken at once',async()=>{
  const {h,solving,exact}=await racing(),found=ladderValue(4,4);
  h.reply(h.workers[2],2,'result',{result:found});await solving;
  assert.equal(exact.terminated,1);assert.deepEqual(h.messages.filter(m=>m.type==='result').at(-1),{id:2,type:'result',result:found});
});

test('side by side with the network, a ladder template above its bound waits for today\'s search, the one with fewer hidden segments standing',async()=>{
  for (const [today, wins] of [[7, 'today'], [9, 'ladder']]) {
    const {h,solving,exact,ladder}=await racing(),found=ladderValue(8,7),theirs=todayValue(today);
    h.reply(ladder,2,'result',{result:found});
    // Held and shown, today's search still running.
    assert.equal(exact.terminated,0);assert.equal(h.messages.filter(m=>m.type==='result').length,0);
    assert.equal(h.messages.filter(m=>m.type==='progress').at(-1).event.geometry,packet.geometry);
    h.reply(exact,2,'result',{result:theirs});await solving;
    assert.deepEqual(h.messages.filter(m=>m.type==='result').at(-1).result,wins==='today'?theirs:found);
  }
});

test('side by side with the network, of a ladder template and today\'s with as many hidden segments the closer to the picture stands',async()=>{
  // A user's heart: today's 0.3% off with a hairline through a motif, the ladder's 0.1%.
  for (const [ladderError, todayError, wins] of [[.001, .003, 'ladder'], [.003, .001, 'today'], [.002, .002, 'today']]) {
    const {h,solving,ladder,exact}=await racing(),found=ladderValue(7,6,{}),theirs=todayValue(7,{imageError:{mismatchFraction:todayError}});
    found.report.imageError={mismatchFraction:ladderError};
    h.reply(ladder,2,'result',{result:found});
    h.reply(exact,2,'result',{result:theirs});await solving;
    assert.deepEqual(h.messages.filter(m=>m.type==='result').at(-1).result,wins==='today'?theirs:found);
  }
});

test('side by side with the network, a ladder template at the bound of a rounded or fallback outline waits for today\'s search',async()=>{
  for (const more of [{outline:1},{untied:true},{subgroup:{to:['turn180']}}]) {
    const {h,solving,exact,ladder}=await racing(),found=ladderValue(16,16,more),theirs=todayValue(2);
    h.reply(ladder,2,'result',{result:found});
    assert.equal(exact.terminated,0);assert.equal(h.messages.filter(m=>m.type==='result').length,0);
    h.reply(exact,2,'result',{result:theirs});await solving;
    assert.deepEqual(h.messages.filter(m=>m.type==='result').at(-1).result,theirs);
  }
});

test('side by side with the network, a ladder template within the traced outline\'s bound is taken at once, on any outline',async()=>{
  const {h,solving,exact,ladder}=await racing(),found=ladderValue(12,12,{outline:2,tracedBound:12});
  h.reply(ladder,2,'result',{result:found});await solving;
  assert.equal(exact.terminated,1);assert.deepEqual(h.messages.filter(m=>m.type==='result').at(-1).result,found);
});

test('side by side with the network, a held ladder template stands when today\'s search finds none, and Stop takes it',async()=>{
  {
    const {h,solving,exact,ladder}=await racing(),found=ladderValue(8,7);
    h.reply(ladder,2,'result',{result:found});
    h.reply(exact,2,'error',{message:'The exact search found no template the export passes.',code:'NO_EXACT_TEMPLATE'});await solving;
    assert.equal(exact.terminated,1);assert.deepEqual(h.messages.filter(m=>m.type==='result').at(-1).result,found);
  }
  {
    const {h,solving,ladder}=await racing(),found=ladderValue(8,7);
    h.reply(ladder,2,'result',{result:found});
    await h.send(2,'stop');await solving;
    assert.deepEqual(h.messages.filter(m=>m.type==='result').at(-1).result,found);
  }
});

test('side by side with the network, after a fitted answer goes out at 20 s the ladder goes on, its template the alternative as in the race',async t=>{
  t.mock.timers.enable({apis:['setTimeout','Date']});
  const fitted={...value,report:{...value.report,templateChecksPassed:true}},pass=v=>({...v,report:{...v.report,templateChecksPassed:true}});
  for (const [ladderHidden, todayHidden, expect] of [[4, 6, 'ladder'], [6, 4, 'today'], [4, null, 'ladder']]) {
    const h=harness({now:()=>Date.now(),predictCutMaps:async()=>({size:1})});await h.send(1,'prepare',{input});
    const solving=h.send(2,'solve',{settings:{...both,cutModel:true}});await new Promise(resolve=>setImmediate(resolve));
    const [fitter,exact,ladder]=h.workers;
    t.mock.timers.tick(1000*10);h.reply(fitter,2,'result',{result:fitted});t.mock.timers.tick(1000*11);await solving;
    assert.deepEqual(h.messages.slice(-2),[{id:2,type:'result',result:fitted},{id:2,type:'alternative',pending:true}]);assert.equal(ladder.terminated,0);
    const found=pass(ladderValue(ladderHidden,2)),theirs=todayHidden===null?null:pass(todayValue(todayHidden));
    h.reply(ladder,2,'result',{result:found});assert.equal(exact.terminated,0);assert.equal(h.messages.at(-1).pending,true);
    if (theirs) h.reply(exact,2,'result',{result:theirs});else h.reply(exact,2,'error',{message:'none',code:'NO_EXACT_TEMPLATE'});
    assert.deepEqual(h.messages.at(-1),{id:2,type:'alternative',result:expect==='ladder'?found:theirs});

  }
  // At the bound it is the alternative at once.
  const h=harness({now:()=>Date.now(),predictCutMaps:async()=>({size:1})});await h.send(1,'prepare',{input});
  const solving=h.send(2,'solve',{settings:{...both,cutModel:true}});await new Promise(resolve=>setImmediate(resolve));
  const [fitter,exact,ladder]=h.workers;
  t.mock.timers.tick(1000*10);h.reply(fitter,2,'result',{result:fitted});t.mock.timers.tick(1000*11);await solving;
  const found=pass(ladderValue(3,3));h.reply(ladder,2,'result',{result:found});
  assert.equal(exact.terminated,1);assert.deepEqual(h.messages.at(-1),{id:2,type:'alternative',result:found});
});

// A finished result as the ranking (core/result-rank.js) reads it.
const resultWith=({passed=false,issues=[],mismatch=.01,nearMiss=false}={})=>({report:{templateChecksPassed:passed,validation:{issues},imageError:{mismatchFraction:mismatch},imageFidelity:{passed:true,features:{passed:true}},settings:{nominalWidth:2.5},
  solver:{exactOutline:{chosen:'exact',...(nearMiss?{nearMiss:true}:{})}}},files:{'cut_geometry.json':packet.geometry}});

test('side by side, an exact template missing a check by a hair is held, and the better of it and the fitter\'s answer stands',async()=>{
  const near=resultWith({nearMiss:true,issues:[{type:'short_self_clearance',distanceUpper:1.476,required:1.5}]});
  for (const [fitted, expect] of [[resultWith({passed:true}), 'fitted'], [resultWith({issues:[{type:'self_intersection'}]}), 'near'], [null, 'near']]) {
    const h=harness();await h.send(1,'prepare',{input});const solving=h.send(2,'solve',{settings:both});
    const [fitter,exact]=h.workers;
    h.reply(exact,2,'result',{result:near});
    assert.equal(h.messages.filter(m=>m.type==='result').length,0);
    if (fitted) h.reply(fitter,2,'result',{result:fitted});else h.reply(fitter,2,'error',{message:'no template',code:'NONE'});
    await solving;
    assert.deepEqual(h.messages.filter(m=>m.type==='result').at(-1).result,expect==='near'?near:fitted);
  }
});

test('side by side with the network, the ladder\'s nearest template is held as a near miss, never taken as a template',async()=>{
  const near=resultWith({nearMiss:true,issues:[{type:'short_self_clearance',distanceUpper:1.499,required:1.5}]});
  near.report.solver.exactOutline.search={hidden:2,bound:4};
  // Fewer hidden segments than its bound, yet today's passing template stands.
  {
    const {h,solving,exact,ladder}=await racing(),theirs=todayValue(9);
    h.reply(ladder,2,'result',{result:near});
    assert.equal(exact.terminated,0);assert.equal(h.messages.filter(m=>m.type==='result').length,0);
    h.reply(exact,2,'result',{result:theirs});await solving;
    assert.deepEqual(h.messages.filter(m=>m.type==='result').at(-1).result,theirs);
  }
  // With no exact template, the better of it, today's near miss and the fitter's answer.
  for (const [today, fitted, expect] of [[null, resultWith({issues:[{type:'self_intersection'}]}), 'ladder'], [null, resultWith({passed:true}), 'fitted'],
    [resultWith({nearMiss:true,issues:[{type:'short_self_clearance',distanceUpper:1.4,required:1.5}]}), null, 'ladder'],
    [resultWith({nearMiss:true,issues:[{type:'short_self_clearance',distanceUpper:1.4999,required:1.5}]}), null, 'today']]) {
    const {h,solving,fitter,exact,ladder}=await racing();
    h.reply(ladder,2,'result',{result:near});
    if (today) h.reply(exact,2,'result',{result:today});else h.reply(exact,2,'error',{message:'none',code:'NO_EXACT_TEMPLATE'});
    if (fitted) h.reply(fitter,2,'result',{result:fitted});else h.reply(fitter,2,'error',{message:'no template',code:'NONE'});
    await solving;
    assert.deepEqual(h.messages.filter(m=>m.type==='result').at(-1).result,{ladder:near,today,fitted}[expect]);
  }
});

// Two ladders side by side, each on its part of the outlines, where the machine has the threads.
async function racingTwo(count=2,more={}){
  const h=harness({predictCutMaps:async()=>({size:1}),ladders:count,...more});await h.send(1,'prepare',{input});
  const solving=h.send(2,'solve',{settings:{...both,cutModel:true}});
  await new Promise(resolve=>setImmediate(resolve));
  const [fitter,exact,...parts]=h.workers;
  assert.deepEqual(parts.map(part=>part.sent[0].settings.ladderPart),Array.from({length:count},(_,i)=>[i,count]));
  assert.ok(parts.every(part=>part.sent[0].settings.ladderOnly===true&&part.sent[0].settings.cutMaps));
  return {h,solving,fitter,exact,parts};
}

test('side by side with the network, two ladders search their parts of the outlines and the first template stands',async()=>{
  const {h,solving,exact,parts}=await racingTwo(),found=ladderValue(4,4);
  h.reply(parts[1],2,'progress',{event:{stage:'exactOutline'}});
  h.reply(parts[1],2,'result',{result:found});await solving;
  assert.equal(exact.terminated,1);assert.deepEqual(parts.map(part=>part.terminated),[1,1]);
  assert.deepEqual(h.messages.filter(m=>m.type==='result').at(-1),{id:2,type:'result',result:found});
});

test('side by side with the network, of two ladders without a template the better near miss is held, and two without one are none',async()=>{
  const close=resultWith({nearMiss:true,issues:[{type:'short_self_clearance',distanceUpper:1.4999,required:1.5}]});
  const far=resultWith({nearMiss:true,issues:[{type:'short_self_clearance',distanceUpper:1.4,required:1.5}]});
  const failing=resultWith({issues:[{type:'self_intersection'}]}),none={message:'none',code:'NO_EXACT_TEMPLATE'};
  for (const [first, second, expect] of [[far, close, close], [close, far, close], [null, far, far], [null, null, failing]]) {
    const {h,solving,fitter,exact,parts}=await racingTwo();
    h.reply(exact,2,'error',none);h.reply(fitter,2,'result',{result:failing});
    for (const [part, said] of [[parts[0], first], [parts[1], second]]) {
      assert.equal(h.messages.filter(m=>m.type==='result').length,0);
      if (said) h.reply(part,2,'result',{result:said});else h.reply(part,2,'error',none);
    }
    await solving;
    assert.deepEqual(h.messages.filter(m=>m.type==='result').at(-1).result,expect);
  }
});

test('side by side with the network, a ladder that cannot load leaves the other\'s answer, and two leave the fitter\'s',async()=>{
  for (const second of ['template', 'crash']) {
    const {h,solving,fitter,exact,parts}=await racingTwo(),found=ladderValue(8,7);
    h.reply(fitter,2,'result',{result:value});h.reply(exact,2,'error',{message:'none',code:'NO_EXACT_TEMPLATE'});
    parts[0].onerror?.({preventDefault(){}});
    assert.equal(h.messages.filter(m=>m.type==='result').length,0);
    if (second==='template') h.reply(parts[1],2,'result',{result:found});else parts[1].onerror?.({preventDefault(){}});
    // Answered then, not at the search's time limit.
    await new Promise(resolve=>setImmediate(resolve));assert.equal(h.messages.filter(m=>m.type==='result').length,1);
    await solving;
    assert.deepEqual(h.messages.filter(m=>m.type==='result').at(-1).result,second==='template'?found:value);
  }
});

test('side by side with the network, three ladders: the last to answer settles it, the better near miss standing',async()=>{
  const close=resultWith({nearMiss:true,issues:[{type:'short_self_clearance',distanceUpper:1.4999,required:1.5}]});
  const far=resultWith({nearMiss:true,issues:[{type:'short_self_clearance',distanceUpper:1.4,required:1.5}]});
  const {h,solving,fitter,exact,parts}=await racingTwo(3);
  h.reply(exact,2,'error',{message:'none',code:'NO_EXACT_TEMPLATE'});h.reply(fitter,2,'result',{result:resultWith({issues:[{type:'self_intersection'}]})});
  h.reply(parts[2],2,'result',{result:far});h.reply(parts[0],2,'error',{message:'none',code:'NO_EXACT_TEMPLATE'});
  assert.equal(h.messages.filter(m=>m.type==='result').length,0);
  h.reply(parts[1],2,'result',{result:close});await solving;
  assert.deepEqual(h.messages.filter(m=>m.type==='result').at(-1).result,close);
});

test('side by side with the network, a ladder template far off its picture waits for the other ladder\'s, the closer standing',async t=>{
  t.mock.timers.enable({apis:['setTimeout','Date']});
  const off=mismatch=>{const found=ladderValue(4,4);found.report.imageError={mismatchFraction:mismatch};return found;};
  const coarse=off(.012),fine=off(.003),hardly=off(.011),none={message:'none',code:'NO_EXACT_TEMPLATE'};
  // The other's closer template within the grace; its error; nothing within the grace; one not a margin closer.
  for (const [second, expect] of [[fine, fine], [none, coarse], [null, coarse], [hardly, coarse]]) {
    const {h,solving,parts}=await racingTwo(2,{now:()=>Date.now()});
    h.reply(parts[1],2,'result',{result:coarse});
    t.mock.timers.tick(1999);await new Promise(resolve=>setImmediate(resolve));
    assert.equal(h.messages.filter(m=>m.type==='result').length,0,'held');
    if (second===none) h.reply(parts[0],2,'error',none);else if (second) h.reply(parts[0],2,'result',{result:second});else t.mock.timers.tick(1);
    await solving;
    assert.deepEqual(h.messages.filter(m=>m.type==='result').at(-1).result,expect);
    assert.deepEqual(parts.map(part=>part.terminated),[1,1]);
  }
  // One close to its picture stands at once.
  const {h,solving,parts}=await racingTwo(2,{now:()=>Date.now()});
  h.reply(parts[0],2,'result',{result:fine});await solving;
  assert.deepEqual(h.messages.filter(m=>m.type==='result').at(-1).result,fine);
});

test('two or three ladders where the machine reports the threads, unless it reports little memory',()=>{
  assert.equal(ladderCount({hardwareConcurrency:8}),2);assert.equal(ladderCount({hardwareConcurrency:12,deviceMemory:4}),2);
  assert.equal(ladderCount({hardwareConcurrency:12}),3);assert.equal(ladderCount({hardwareConcurrency:16,deviceMemory:8}),3);
  assert.equal(ladderCount({hardwareConcurrency:4}),1);assert.equal(ladderCount({hardwareConcurrency:8,deviceMemory:2}),1);
  assert.equal(ladderCount(null),1);assert.equal(ladderCount({}),1);
});

test('side by side with the network, a near miss from the ladder after a passing fitted answer is no alternative',async t=>{
  t.mock.timers.enable({apis:['setTimeout','Date']});
  const fitted={...value,report:{...value.report,templateChecksPassed:true}},near=resultWith({nearMiss:true,issues:[{type:'short_self_clearance',distanceUpper:1.499,required:1.5}]});
  near.report.solver.exactOutline.search={hidden:1,bound:1};
  const h=harness({now:()=>Date.now(),predictCutMaps:async()=>({size:1})});await h.send(1,'prepare',{input});
  const solving=h.send(2,'solve',{settings:{...both,cutModel:true}});await new Promise(resolve=>setImmediate(resolve));
  const [fitter,exact,ladder]=h.workers;
  t.mock.timers.tick(1000*10);h.reply(fitter,2,'result',{result:fitted});t.mock.timers.tick(1000*11);await solving;
  h.reply(ladder,2,'result',{result:near});
  assert.equal(exact.terminated,0);assert.equal(h.messages.at(-1).pending,true);
  const theirs={...todayValue(3),report:{...todayValue(3).report,templateChecksPassed:true}};
  h.reply(exact,2,'result',{result:theirs});
  assert.deepEqual(h.messages.at(-1),{id:2,type:'alternative',result:theirs});
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

test('side by side, a fitted answer that fails the checks leaves the exact search its whole minute',async t=>{
  t.mock.timers.enable({apis:['setTimeout','Date']});
  const h=harness({now:()=>Date.now()});await h.send(1,'prepare',{input});const solving=h.send(2,'solve',{settings:both});
  const [fitter,exact]=h.workers;
  t.mock.timers.tick(1000*10);h.reply(fitter,2,'result',{result:value});
  t.mock.timers.tick(1000*31);assert.equal(exact.terminated,0);
  t.mock.timers.tick(1000*23);assert.equal(exact.terminated,0);assert.equal(h.messages.filter(m=>m.type==='result').length,0);
  t.mock.timers.tick(1000*2);assert.equal(exact.terminated,1);
  await solving;assert.deepEqual(h.messages.at(-1).result,value);
});

test('side by side with the network, the ladder\'s template after 40 s still beats a failing fitted answer',async t=>{
  t.mock.timers.enable({apis:['setTimeout','Date']});
  const h=harness({now:()=>Date.now(),predictCutMaps:async()=>({size:1})});await h.send(1,'prepare',{input});
  const solving=h.send(2,'solve',{settings:{...both,cutModel:true}});await new Promise(resolve=>setImmediate(resolve));
  const [fitter,exact,ladder]=h.workers,found=ladderValue(16,16);
  t.mock.timers.tick(1000*20);h.reply(fitter,2,'result',{result:value});
  t.mock.timers.tick(1000*25);assert.equal(h.messages.filter(m=>m.type==='result').length,0);assert.equal(ladder.terminated,0);
  h.reply(ladder,2,'result',{result:found});await solving;
  assert.equal(exact.terminated,1);assert.deepEqual(h.messages.filter(m=>m.type==='result').at(-1).result,found);
});

test('side by side with the network, today\'s search giving up waits for the ladder while the fitted answer fails',async()=>{
  for (const [ladderSays, expect] of [['template', 'ladder'], ['none', 'fitted'], ['crash', 'fitted']]) {
    const {h,solving,fitter,exact,ladder}=await racing(),found=ladderValue(8,7);
    h.reply(fitter,2,'result',{result:value});
    h.reply(exact,2,'error',{message:'The exact search found no template the export passes.',code:'NO_EXACT_TEMPLATE'});
    assert.equal(h.messages.filter(m=>m.type==='result').length,0);assert.equal(ladder.terminated,0);
    if (ladderSays==='template') h.reply(ladder,2,'result',{result:found});
    else if (ladderSays==='none') h.reply(ladder,2,'error',{message:'none',code:'NO_EXACT_TEMPLATE'});
    else ladder.onerror?.({preventDefault(){}});
    await solving;
    assert.deepEqual(h.messages.filter(m=>m.type==='result').at(-1).result,expect==='ladder'?found:value);
  }
  // A passing fitted answer goes out at once, and the ladder goes on: its template is the alternative.
  for (const ladderSays of ['template', 'none']) {
    const {h,solving,fitter,exact,ladder}=await racing(),fitted={...value,report:{...value.report,templateChecksPassed:true}};
    const found={...ladderValue(8,7),report:{...ladderValue(8,7).report,templateChecksPassed:true}};
    h.reply(fitter,2,'result',{result:fitted});
    h.reply(exact,2,'error',{message:'none',code:'NO_EXACT_TEMPLATE'});await solving;
    assert.equal(ladder.terminated,0);
    assert.deepEqual(h.messages.slice(-2),[{id:2,type:'result',result:fitted},{id:2,type:'alternative',pending:true}]);
    if (ladderSays==='template') h.reply(ladder,2,'result',{result:found});else h.reply(ladder,2,'error',{message:'none',code:'NO_EXACT_TEMPLATE'});
    assert.deepEqual(h.messages.at(-1),ladderSays==='template'?{id:2,type:'alternative',result:found}:{id:2,type:'alternative',pending:false});
  }
});

test('side by side with the network, after a fitted answer went out a failing answer of today\'s waits for the ladder, whose passing template stands',async t=>{
  // A user's heart on the site: the fitter's answer at 24 s, today's near miss (6 hidden) before the
  // ladder's passing template (7): no alternative came.
  t.mock.timers.enable({apis:['setTimeout','Date']});
  const pass=v=>({...v,report:{...v.report,templateChecksPassed:true}}),fitted=pass(value);
  const h=harness({now:()=>Date.now(),predictCutMaps:async()=>({size:1})});await h.send(1,'prepare',{input});
  const solving=h.send(2,'solve',{settings:{...both,cutModel:true}});await new Promise(resolve=>setImmediate(resolve));
  const [fitter,exact,ladder]=h.workers;
  t.mock.timers.tick(1000*10);h.reply(fitter,2,'result',{result:fitted});t.mock.timers.tick(1000*11);await solving;
  assert.deepEqual(h.messages.slice(-2),[{id:2,type:'result',result:fitted},{id:2,type:'alternative',pending:true}]);
  const near=todayValue(6);near.report.solver.exactOutline.nearMiss=true;
  h.reply(exact,2,'result',{result:near});
  assert.equal(exact.terminated,1);assert.equal(ladder.terminated,0);assert.equal(h.messages.at(-1).pending,true);
  const found=pass(ladderValue(7,6));h.reply(ladder,2,'result',{result:found});
  assert.deepEqual(h.messages.at(-1),{id:2,type:'alternative',result:found});
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

test('the exact search alone runs in one worker, and Stop finishes its drawing',async()=>{
  const drawn=[];
  const h=harness({finalizeExact:(target,cfg,geometry)=>{drawn.push(geometry);return exactValue;},finalize:async()=>{throw new Error('no fitter checkpoints in this mode');}});
  await h.send(1,'prepare',{input});const solving=h.send(2,'solve',{settings:{...config,exactOutline:true,exactRoute:'exact'}});
  assert.equal(h.workers.length,1);assert.equal(h.workers[0].sent[0].settings.exactRoute,'exact');
  h.reply(h.workers[0],2,'progress',{event:{stage:'exactOutline',geometry:packet.geometry}});
  assert.equal(h.messages.at(-1).event.geometry,packet.geometry);
  await h.send(2,'stop');await solving;
  assert.deepEqual(drawn,[packet.geometry]);assert.deepEqual(h.messages.at(-1).result,exactValue);
});

// The model not in within its wait (a first visit): its maps come later, and the ladder starts then.
function lateModel(){
  let arrive;const maps=new Promise(resolve=>{arrive=resolve;});
  return {arrive,predictCutMaps:async(source,options)=>options?.wait!==undefined?null:maps};
}

test('side by side with the network, a model in late starts the ladder then, whose template at its bound is taken',async()=>{
  const model=lateModel(),h=harness({predictCutMaps:model.predictCutMaps});await h.send(1,'prepare',{input});
  const solving=h.send(2,'solve',{settings:{...both,cutModel:true}});await new Promise(resolve=>setImmediate(resolve));
  assert.equal(h.workers.length,2);
  model.arrive({size:1});await new Promise(resolve=>setImmediate(resolve));
  const [,exact,ladder]=h.workers;
  assert.equal(ladder.sent[0].settings.ladderOnly,true);assert.deepEqual(ladder.sent[0].settings.cutMaps,{size:1});
  const found=ladderValue(4,4);h.reply(ladder,2,'result',{result:found});await solving;
  assert.equal(exact.terminated,1);assert.deepEqual(h.messages.filter(m=>m.type==='result').at(-1).result,found);
});

test('side by side with the network, after a fitted answer went out the alternative waits for a model in late, and its ladder\'s template stands',async t=>{
  t.mock.timers.enable({apis:['setTimeout','Date']});
  const pass=v=>({...v,report:{...v.report,templateChecksPassed:true}}),fitted=pass(value);
  for (const modelComes of [true, false]) {
    const model=lateModel(),h=harness({now:()=>Date.now(),predictCutMaps:model.predictCutMaps});await h.send(1,'prepare',{input});
    const solving=h.send(2,'solve',{settings:{...both,cutModel:true}});await new Promise(resolve=>setImmediate(resolve));
    const [fitter,exact]=h.workers;
    t.mock.timers.tick(1000*10);h.reply(fitter,2,'result',{result:fitted});t.mock.timers.tick(1000*11);await solving;
    assert.deepEqual(h.messages.slice(-2),[{id:2,type:'result',result:fitted},{id:2,type:'alternative',pending:true}]);
    // Today's near miss waits for the ladder still to start.
    const near=todayValue(6);near.report.solver.exactOutline.nearMiss=true;
    h.reply(exact,2,'result',{result:near});assert.equal(h.messages.at(-1).pending,true);
    model.arrive(modelComes?{size:1}:null);await new Promise(resolve=>setImmediate(resolve));
    if (!modelComes) {assert.equal(h.workers.length,2);assert.deepEqual(h.messages.at(-1),{id:2,type:'alternative',pending:false});continue;}
    const ladder=h.workers[2],found=pass(ladderValue(7,6));
    h.reply(ladder,2,'result',{result:found});
    assert.deepEqual(h.messages.at(-1),{id:2,type:'alternative',result:found});
  }
});
