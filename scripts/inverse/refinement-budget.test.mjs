import test from 'node:test';
import assert from 'node:assert/strict';
import {prepare} from '../../static/inverse/core/engine.js';
import {fitDirect} from '../../static/inverse/core/direct/fit.js';
import {initializeCounts} from '../../static/inverse/core/direct/counts.js';
import {settings} from '../../static/inverse/core/settings.js';

// A fresh top-hat silhouette, independent of any saved cutting geometry.
const n=96,mask=Uint8Array.from({length:n*n},(_,i)=>{
  const x=(i%n+.5)/n,y=(Math.floor(i/n)+.5)/n,dx=(x-y)/2,dy=(x+y)/2-.5;
  return Number(Math.abs(dx)<.12&&dy>=-.17&&dy<.09||Math.abs(dx)<.19&&dy>=.09&&dy<.16);
});
const weights=Float64Array.from(mask,(_,i)=>Number(i%n>=8&&i%n<n-8&&Math.floor(i/n)>=8&&Math.floor(i/n)<n-8));

test('slow initialization cannot consume the first refinement while the requested budget remains',async t=>{
  const cfg=settings({algorithm:'direct',timeLimit:30,earlyStop:false,preferMatchingSheets:false,trials:0,roundHidden:false});
  const input=prepare({type:'mask',resolution:n,mask,weights},cfg).target;
  const actualNow=performance.now.bind(performance);let elapsedInitialization=0;
  t.mock.method(performance,'now',()=>actualNow()+elapsedInitialization);
  const result=await fitDirect(input,cfg,()=>{},{countSearch:context=>{
    const initialized=initializeCounts(context);
    // Model a slower browser without a wall-clock sleep. Previously the fast
    // deadline had expired and only the untouched step -1 checkpoint survived.
    elapsedInitialization=10000;
    return initialized;
  }});
  assert.ok(result.report.checkpoints.some(p=>p.step>=40),'The first candidate needs actual curve refinement.');
  assert.ok(result.report.stages.some(s=>s.stage==='directPolishing'));
  assert.ok(result.report.seconds<cfg.timeLimit,'Additional refinement must stay inside the user budget.');
  assert.ok(result.report.estimatedMaskMismatch<.01);
});
