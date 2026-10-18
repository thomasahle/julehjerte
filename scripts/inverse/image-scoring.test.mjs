import test from 'node:test';
import assert from 'node:assert/strict';
import {createMaskDisagreement,referenceError} from '../../static/inverse/core/image-reference.js';

test('stage scoring respects protected pixels, soft weights and missing observations',()=>{
  const source={mask:Uint8Array.from([0,1,0,1,0,1]),weights:Float64Array.from([1,.25,0,.75,1,0]),validMask:Uint8Array.from([1,1,1,1,0,1])};
  const score=createMaskDisagreement(source);
  assert.equal(score(Uint8Array.from([0,0,1,1,1,0])),.125);
  assert.equal(score(Uint8Array.from([1,1,0,0,0,1])),.875);
  assert.equal(score(source.mask),0);
});

test('prepared mask scores exactly match full reference reports',()=>{
  for(let seed=0;seed<15;seed++)for(const weighted of [false,true])for(const observed of [false,true]){
    const source={mask:Uint8Array.from({length:149},(_,i)=>(i*7+seed)%11<5?1:0)};
    if(weighted)source.weights=Float64Array.from({length:149},(_,i)=>(i*seed+7)%13/12);
    if(observed)source.validMask=Uint8Array.from({length:149},(_,i)=>(i+seed)%5?1:0);
    const before=structuredClone(source),score=createMaskDisagreement(source);
    for(let trial=0;trial<8;trial++){
      const woven=source.mask.map((v,i)=>(i+trial*seed)%7===0?1-v:v);
      assert.equal(score(woven),referenceError(source,woven).mismatchFraction);
    }
    assert.deepEqual(source,before);
  }
});

test('each scorer owns its stage snapshot while new scores observe image edits',()=>{
  const source={mask:Uint8Array.from([0,1,0,1]),weights:Float64Array.from([1,.5,0,1]),validMask:Uint8Array.from([1,1,1,0])};
  const woven=Uint8Array.from([0,0,1,1]),score=createMaskDisagreement(source);
  assert.equal(score(woven),1/3);
  source.mask.fill(1);source.weights.fill(1);source.validMask.fill(1);
  assert.equal(score(woven),1/3);
  assert.equal(createMaskDisagreement(source)(woven),.5);
  assert.equal(referenceError(source,woven).mismatchFraction,.5);
});

test('prepared scoring retains input errors and cannot certify an unobserved image',()=>{
  const mask=Uint8Array.from([0,1]);
  assert.throws(()=>createMaskDisagreement({mask,weights:[1]}),/match/);
  for(const weights of [[0,0],[1,NaN],[1,-.1],[1,1.01]])assert.throws(()=>createMaskDisagreement({mask,weights}));
  assert.throws(()=>createMaskDisagreement({mask})([0]),/match/);
  assert.equal(createMaskDisagreement({mask,validMask:[0,0]})(mask),Infinity);
  assert.equal(createMaskDisagreement({mask,weights:[1,1]})([1,1]),.5);
});
