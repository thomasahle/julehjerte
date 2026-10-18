import test from 'node:test';
import assert from 'node:assert/strict';
import {cropEvidence} from './crop-evidence.mjs';

function proposal(){const quad=[[50,10],[90,50],[50,90],[10,50]];return{quad,locator:{quad,status:'needs_review',evidence:{lowerEdgeSupport:[.9,.9],lobeOutlineSupport:[.8,.8],capColourLoss:[.1,.1]}}};}

test('crop support and bounds are independent from review status and template success',()=>{
  const candidate=proposal(),size={width:100,height:100};
  assert.equal(cropEvidence(candidate,size).outlineSupported,true);
  candidate.locator.evidence.lobeOutlineSupport[1]=.2;
  assert.equal(cropEvidence(candidate,size).outlineSupported,false);
  assert.equal(cropEvidence(candidate,size).withinPhotograph,true);
  candidate.quad[2][1]=110;
  assert.deepEqual(cropEvidence(candidate,size).outOfFrameCorners,[2]);
  assert.equal(cropEvidence(candidate,size).withinPhotograph,false);
});

test('missing historical crop evidence stays unknown rather than becoming a pass',()=>{
  assert.equal(cropEvidence(undefined).outlineSupported,null);
  assert.equal(cropEvidence({quad:[[0,0],[100,0],[100,100],[0,100]]},{width:100,height:100}).withinPhotograph,true,'Pixel-edge bounds include the final edge.');
  const candidate=proposal();delete candidate.locator.evidence.capColourLoss;
  assert.equal(cropEvidence(candidate).outlineSupported,null);
  assert.equal(cropEvidence(candidate).withinPhotograph,null);
  candidate.quad[0][0]=NaN;
  assert.equal(cropEvidence(candidate,{width:100,height:100}).withinPhotograph,null);
});
