import assert from 'node:assert/strict';
import test from 'node:test';
import {wholeBodyEvidence,selectWholeBodyPhotoCrop} from './learning/whole-body-crop.mjs';

const box=(x,y,w,h)=>{
 const quad=[[x,y],[x+w,y],[x+w,y+h],[x,y+h]];
 return{quad,outline:quad.map((p,i)=>[p,quad[(i+1)%4]]),locator:{quad,evidence:{lowerEdgeSupport:[1,1],lobeOutlineSupport:[1,1],capColourLoss:[0,0]}}};
};
const resolution=100,probability=Float32Array.from({length:10000},(_,i)=>+(i%100>=20&&i%100<80&&Math.floor(i/100)>=20&&Math.floor(i/100)<80));
const body={probability,resolution,window:[0,0,100,100]},source={imageWidth:100,imageHeight:100};
const audit=c=>wholeBodyEvidence(c,{...body,...source});

test('whole-paper coverage rejects locally perfect fragments and oversized outlines',()=>{
 const exact=audit(box(20,20,60,60));assert.equal(exact.passed,true);assert.equal(exact.dice,1);
 const fragment=audit(box(35,35,30,30));assert.equal(fragment.precision,1);assert.equal(fragment.recall,.25);assert.equal(fragment.passed,false);
 const oversized=audit(box(0,0,100,100));assert.equal(oversized.recall,1);assert.equal(oversized.precision,.36);assert.equal(oversized.passed,false);
});

test('source coordinates, clipping and soft probabilities are respected',()=>{
 const moved=wholeBodyEvidence(box(50,70,120,120),{...body,window:[10,30,210,230],imageWidth:220,imageHeight:240});
 assert.equal(moved.dice,1);
 const soft=wholeBodyEvidence(box(20,20,60,60),{...body,...source,probability:Float32Array.from(probability,p=>p*.5)});
 assert.equal(soft.recall,1);assert.equal(soft.precision,.5**4);assert.equal(soft.passed,false);
 const clipped=wholeBodyEvidence(box(-50,0,100,100),{probability:new Float32Array(10000).fill(1),resolution:100,window:[-50,0,50,100],imageWidth:100,imageHeight:100});
 assert.equal(clipped.observedPixels,5000);assert.equal(clipped.dice,1);
 assert.throws(()=>wholeBodyEvidence(box(0,0,100,100),{...body,...source,window:[0,0,0,100]}),/source coordinates/);
 assert.equal(audit(null).status,'unavailable');
});

test('whole-body comparison recovers a missed full outline and preserves strong existing crops',async()=>{
 const full={candidates:[box(20,20,60,60)]},fragment={candidates:[box(35,35,30,30)]};
 const recovered=await selectWholeBodyPhotoCrop(source,{body,productionCrop:()=>fragment,learnedCrop:()=>full});
 assert.equal(recovered.detection,full);assert.equal(recovered.decision.requiresReview,true);assert.equal(recovered.decision.selected,'learned');
 const kept=await selectWholeBodyPhotoCrop(source,{body,productionCrop:()=>full,learnedCrop:()=>{throw new Error('must not run');}});
 assert.equal(kept.detection,full);assert.equal(kept.decision.neuralAttempted,false);
});

test('balanced evidence treats uncertain paper and background symmetrically',()=>{
 const evidence=(candidate,value)=>wholeBodyEvidence(candidate,{...body,...source,weighting:'balanced-confidence',probability:Float32Array.from(probability,p=>p*value)});
 const uncertainPaper=evidence(box(20,20,60,60),.8);
 assert.equal(uncertainPaper.passed,true);assert.ok(uncertainPaper.precision>.99);
 assert.equal(evidence(box(20,20,60,60),.5).passed,false,'Uniform uncertainty is not a body certificate');
 const fragment=evidence(box(35,35,30,30),.8);assert.ok(Math.abs(fragment.recall-.25)<1e-10);assert.equal(fragment.passed,false);
 assert.equal(evidence(box(0,0,100,100),.8).passed,false,'Confident background still penalizes oversized outlines');
});

test('weak alternatives, missing models and geometrically unsupported proposals never discard an existing crop',async()=>{
 const fragment={candidates:[box(35,35,30,30)]},full={candidates:[box(20,20,60,60)]};
 full.candidates[0].locator.evidence.lowerEdgeSupport=[1,.2];
 for(const learnedCrop of [()=>fragment,()=>full,()=>{throw new Error('unavailable');}]){
  const r=await selectWholeBodyPhotoCrop(source,{body,productionCrop:()=>fragment,learnedCrop});
  assert.equal(r.detection,fragment);assert.equal(r.decision.selected,'production');assert.equal(r.decision.requiresReview,true);
 }
});
