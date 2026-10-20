import './learning/projective-body.test.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {supportedBodyOutline,supportedCropOutline} from '../../static/inverse/core/crop.js';
import {selectWholeBodyPhotoCrop} from '../../static/inverse/neural/crop-selection.js';

const box=(x,y,w,h,colour=true)=>{
 const quad=[[x,y],[x+w,y],[x+w,y+h],[x,y+h]];
 return{quad,outline:quad.map((p,i)=>[p,quad[(i+1)%4]]),locator:{quad,evidence:{
  lowerEdgeSupport:[1,1],lobeOutlineSupport:[1,1],capColourLoss:colour?[0,0]:[]}}};
};
const full={candidates:[box(20,20,60,60)]},fragment={candidates:[box(35,35,30,30)]};
const unknownColour={candidates:[box(20,20,60,60,false)]},absent={candidates:[]};
const source={imageWidth:100,imageHeight:100};
const body={resolution:100,window:[0,0,100,100],probability:Float32Array.from({length:10000},
 (_,i)=>+(i%100>=20&&i%100<80&&Math.floor(i/100)>=20&&Math.floor(i/100)<80))};

test('body evidence cannot silently stand in for measured paper colours',()=>{
 const p=unknownColour.candidates[0].locator;
 assert.equal(supportedBodyOutline(p),true);
 assert.equal(supportedCropOutline(p),false);
 for(const capColourLoss of [undefined,[],[0],[0,0,0],[NaN,0],[-.1,0],[Infinity,0]])
  assert.equal(supportedCropOutline({...p,evidence:{...p.evidence,capColourLoss}}),false);
 for(const lowerEdgeSupport of [undefined,[],[1],[1,1,1],[NaN,1],[1.1,1]])
  assert.equal(supportedBodyOutline({...p,evidence:{...p.evidence,lowerEdgeSupport}}),false);
 for(const quad of [null,[],[null,null,null,null],[[0,0],[1,1],[1,0],[0,1]]])
  assert.equal(supportedBodyOutline({...p,quad}),false);
 assert.equal(supportedCropOutline(full.candidates[0].locator),true);
});

test('last-resort outline restores a full crop without inventing colour evidence',async()=>{
 const answer=await selectWholeBodyPhotoCrop(source,{body,productionCrop:()=>fragment,
  learnedCrop:()=>unknownColour,outlineCrop:()=>unknownColour});
 assert.equal(answer.decision.learnedSupported,false);
 assert.equal(answer.decision.selected,'outline');
 assert.equal(answer.decision.outline.body.passed,true);
 assert.equal(answer.decision.requiresReview,true);
 assert.equal(answer.detection,unknownColour);
 assert.deepEqual(answer.detection.candidates[0].locator.evidence.capColourLoss,[]);
});

test('strong original and learned-colour crops never run the body-only fallback',async()=>{
 for(const production of [full,fragment]){
  const answer=await selectWholeBodyPhotoCrop(source,{body,productionCrop:()=>production,
   learnedCrop:()=>full,outlineCrop:()=>assert.fail('Do not displace an established crop')});
  assert.equal(answer.detection,full);
  assert.equal(answer.decision.outlineAttempted,undefined);
 }
});

test('body-only replacement retains the minimum improvement and local support requirements',async()=>{
 const almost=box(20,20,60,56);almost.locator.evidence.lowerEdgeSupport=[.5,1];
 const retained={candidates:[almost]};
 const answer=await selectWholeBodyPhotoCrop(source,{body,productionCrop:()=>retained,
  learnedCrop:()=>absent,outlineCrop:()=>unknownColour});
 assert.equal(answer.decision.outline.body.passed,true);
 assert.equal(answer.decision.outline.bodyImproved,false);
 assert.equal(answer.detection,retained);
 const weak=structuredClone(unknownColour);weak.candidates[0].locator.evidence.lobeOutlineSupport=[1,.64];
 for(const outlineCrop of [()=>weak,()=>absent,()=>{throw new Error('outline failure');}]){
  const result=await selectWholeBodyPhotoCrop(source,{body,productionCrop:()=>fragment,
   learnedCrop:()=>absent,outlineCrop});
  assert.equal(result.detection,fragment);
  assert.equal(result.decision.selected,'production');
 }
});
