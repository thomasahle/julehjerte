import assert from 'node:assert/strict';
import test from 'node:test';
import {overlapCoverage,selectReviewedPhotoCrop} from './learning/partial-photo-crop.mjs';
import {homography,project} from '../../static/inverse/locator/math.js';

const source={imageWidth:100,imageHeight:100};
const empty={status:'not_found',candidates:[]};
function crop(quad,support=.9){return {status:'needs_review',candidates:[{quad,locator:{quad,evidence:{
  lowerEdgeSupport:[support,support],lobeOutlineSupport:[support,support],capColourLoss:[.1,.1]}}}]};}

test('overlap coverage measures the rectified square, including partially observed corners',()=>{
  assert.deepEqual(overlapCoverage([[0,0],[100,0],[100,100],[0,100]],100,100),{observedFraction:1,maximumExtrapolation:0});
  const half=overlapCoverage([[-100,0],[100,0],[100,100],[-100,100]],100,100);
  assert.equal(half.observedFraction,.5);assert.equal(half.maximumExtrapolation,1);
  assert.equal(overlapCoverage([[200,0],[300,0],[300,100],[200,100]],100,100).observedFraction,0);
  assert.equal(overlapCoverage([[0,0],[100,100],[100,0],[0,100]],100,100),null);
  assert.equal(overlapCoverage([null,[100,0],[100,100],[0,100]],100,100),null);
});

test('analytic projective coverage agrees with independent pixel-center observation sampling',()=>{
  for(const q of [[[50,-3],[103,45],[60,104],[-2,55]],[[4,8],[98,13],[103,108],[2,95]]]) {
    const H=homography([[0,0],[1,0],[1,1],[0,1]],q);let observed=0;const n=500;
    for(let y=0;y<n;y++)for(let x=0;x<n;x++){const p=project(H,[(x+.5)/n,(y+.5)/n]);observed+=Number(p[0]>=0&&p[0]<=100&&p[1]>=0&&p[1]<=100);}
    assert.ok(Math.abs(overlapCoverage(q,100,100).observedFraction-observed/n**2)<.00015);
    assert.ok(Math.abs(overlapCoverage([...q].reverse(),100,100).observedFraction-observed/n**2)<.00015);
  }
});

test('every existing production suggestion is retained without model inference',async()=>{
  const production=crop([[50,-1],[90,50],[50,90],[10,50]],.4);
  const result=await selectReviewedPhotoCrop(source,{productionCrop:()=>production,learnedCrop:()=>{throw new Error('should not run');}});
  assert.equal(result.detection,production);assert.equal(result.decision.neuralAttempted,false);
});

test('supported slight clipping can produce only an explicit review-required fallback',async()=>{
  const learned=crop([[50,-1],[90,50],[50,90],[10,50]]);
  const result=await selectReviewedPhotoCrop(source,{productionCrop:()=>empty,learnedCrop:()=>learned});
  assert.equal(result.detection,learned);assert.equal(result.decision.requiresReview,true);
  assert.ok(result.decision.coverage.observedFraction>.99);
});

test('weak support, missing coverage, excessive extrapolation and runtime failure do not add a crop',async()=>{
  for(const learned of [crop([[50,-1],[90,50],[50,90],[10,50]],.4),crop([[-2,0],[100,0],[100,100],[-2,100]]),
    crop([[50,-6],[90,90],[50,99],[10,90]]),crop([[0,0],[100,100],[100,0],[0,100]]),empty]) {
    const result=await selectReviewedPhotoCrop(source,{productionCrop:()=>empty,learnedCrop:()=>learned});
    assert.equal(result.detection,empty);
  }
  const result=await selectReviewedPhotoCrop(source,{productionCrop:()=>empty,learnedCrop:()=>{throw new Error('unavailable');}});
  assert.equal(result.detection,empty);assert.equal(result.decision.neuralError,'unavailable');
});
