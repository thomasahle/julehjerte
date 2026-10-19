import test from 'node:test';
import assert from 'node:assert/strict';
import {selectPhotoCrop} from './learning/photo-crop-fallback.mjs';

const source={imageWidth:100,imageHeight:100};
function crop(support=.9,quad=[[50,10],[90,50],[50,90],[10,50]]){
 return{status:'needs_review',candidates:[{quad,locator:{quad,evidence:{lowerEdgeSupport:[support,support],
  lobeOutlineSupport:[support,support],capColourLoss:[.1,.1]}}}]};
}

test('a supported production crop is retained without loading or running the NN',async()=>{
 const production=crop();let calls=0;
 const answer=await selectPhotoCrop(source,{productionCrop:()=>production,learnedCrop:()=>{calls++;throw new Error('not available');}});
 assert.equal(answer.detection,production);assert.equal(answer.production,production);assert.equal(calls,0);
 assert.equal(answer.decision.neuralAttempted,false);
});

test('only an independently supported and observed learned crop replaces a weak production guess',async()=>{
 const production=crop(.4),learned=crop();
 const answer=await selectPhotoCrop(source,{productionCrop:()=>production,learnedCrop:input=>{assert.equal(input,source);return learned;}});
 assert.equal(answer.detection,learned);assert.equal(answer.production,production);
 assert.equal(answer.decision.selected,'learned');assert.equal(answer.decision.learnedCornersObserved,true);
});

test('weak, extrapolated and missing neural proposals preserve the original editable guess',async()=>{
 const production=crop(.4);
 for(const learned of [crop(.64),crop(.9,[[50,-.1],[90,50],[50,90],[10,50]]),{status:'not_found',candidates:[]}]){
  const answer=await selectPhotoCrop(source,{productionCrop:()=>production,learnedCrop:()=>learned});
  assert.equal(answer.detection,production);assert.equal(answer.decision.selected,'production');
 }
});

test('neural runtime failures do not discard the production result',async()=>{
 const production={status:'not_found',candidates:[]};
 const answer=await selectPhotoCrop(source,{productionCrop:()=>production,learnedCrop:async()=>{throw new Error('Model unavailable');}});
 assert.equal(answer.detection,production);assert.equal(answer.decision.neuralError,'Model unavailable');
});
