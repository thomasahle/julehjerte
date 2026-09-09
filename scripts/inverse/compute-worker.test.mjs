import test from 'node:test';
import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import {workerController} from '../../static/inverse/worker-controller.js';
import {prepare,restorePrepared} from '../../static/inverse/core/engine.js';
import {Cubic} from '../../static/inverse/core/bezier.js';
import {AUTOMATIC_PRESET} from '../../static/inverse/core/presets.js';
import {loadSolutionJSON} from '../../static/inverse/core/graph.js';
import {validate} from '../../static/inverse/core/validate.js';
import {settings} from '../../static/inverse/core/settings.js';

const raw={...AUTOMATIC_PRESET,width:60,materialResolution:80,trials:0,timeLimit:10};
const input={type:'mask',resolution:96,mask:Uint8Array.from({length:96*96},(_,i)=>(Math.floor(i%96/24)+Math.floor(i/96/24))%2)};

test('prepared target transfer restores curves in cached boundary seeds without changing image data',()=>{
  const {target}=prepare(input,raw),cloned=structuredClone(target),restored=restorePrepared(cloned);
  assert.ok(target.boundarySeed.curves.length>0);
  assert.ok(!(cloned.boundarySeed.curves[0] instanceof Cubic));
  assert.ok(restored.boundarySeed.curves[0] instanceof Cubic);
  const contents=value=>({...value,curves:value.curves.map(c=>c.p),...(value.boundarySeed?{boundarySeed:contents(value.boundarySeed)}:{})});
  assert.deepEqual(contents(restored),contents(cloned));
  assert.deepEqual(restored.boundarySeed.curves.map(c=>c.length()),target.boundarySeed.curves.map(c=>c.length()));
});

test('a real compute thread can be stopped at its first valid initializer and exported normally',{timeout:15000},async t=>{
  const messages=[],children=[];let stopping;
  const computeURL=new URL('../../static/inverse/compute-worker.js',import.meta.url).href;
  const bootstrap=`import {parentPort} from 'node:worker_threads';let pending=[];globalThis.self={postMessage:data=>parentPort.postMessage(data),onmessage:event=>pending.push(event)};parentPort.on('message',data=>self.onmessage({data}));await import(${JSON.stringify(computeURL)});for(const event of pending)self.onmessage(event);pending=[];`;
  const createWorker=()=>{
    const thread=new Worker(new URL('data:text/javascript,'+encodeURIComponent(bootstrap))),proxy={onmessage:null,onerror:null,onmessageerror:null,terminated:false,postMessage:data=>thread.postMessage(data),terminate(){this.terminated=true;thread.terminate();}};
    children.push({thread,proxy});
    thread.on('message',data=>{proxy.onmessage?.({data});if(data.type==='candidate'&&!stopping)stopping=handle({data:{id:2,action:'stop'}});});
    thread.on('error',error=>proxy.onerror?.({message:error.message,preventDefault(){}}));
    return proxy;
  };
  t.after(async()=>{for(const child of children)await child.thread.terminate();});
  const handle=workerController({postMessage:data=>messages.push(data)},{createWorker});
  await handle({data:{id:1,action:'prepare',input,settings:raw}});
  await handle({data:{id:2,action:'solve',settings:raw}});await stopping;
  const response=messages.find(m=>m.type==='result');
  assert.ok(response,JSON.stringify(messages.filter(m=>m.type==='error')));
  assert.equal(response.id,2);assert.equal(response.result.report.stoppedEarly,true);
  assert.equal(response.result.report.imageError.mismatchFraction,0);
  assert.equal(response.result.report.templateChecksPassed,true);
  assert.ok(validate(loadSolutionJSON(response.result.files['cut_geometry.json']),settings(raw)).passed);
  assert.equal(children[0].proxy.terminated,true);
  assert.equal(messages.filter(m=>m.type==='candidate').length,0);
  await handle({data:{id:3,action:'archive'}});assert.equal(messages.at(-1).type,'archive');
});
