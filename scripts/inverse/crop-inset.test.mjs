import test from 'node:test';
import assert from 'node:assert/strict';
import {insetCropQuad,AUTOMATIC_CROP_INSET} from '../../static/inverse/core/crop-inset.js';
import {homography,project} from '../../static/inverse/locator/math.js';

test('automatic inset removes one percent from each rectified side, including perspective',()=>{
  for(const quad of [
    [[0,0],[400,0],[400,400],[0,400]],
    [[190,80],[275,155],[190,230],[105,155]],
    [[80,30],[330,70],[430,390],[20,270]],
    [[-.5,4],[240.5,-20],[290,220],[0,250]],
  ]){
    const before=structuredClone(quad),crop=insetCropQuad(quad);
    const H=homography(quad,[[0,0],[1,0],[1,1],[0,1]]);
    const actual=crop.map(p=>project(H,p)),expected=[[.01,.01],[.99,.01],[.99,.99],[.01,.99]];
    for(let i=0;i<4;i++)for(let j=0;j<2;j++)assert.ok(Math.abs(actual[i][j]-expected[i][j])<1e-12);
    assert.deepEqual(quad,before);
  }
  assert.equal(AUTOMATIC_CROP_INSET,.01);
});

test('a zero inset preserves exact corners without aliasing caller arrays',()=>{
  const quad=[[0,0],[100,0],[100,100],[0,100]],copy=insetCropQuad(quad,0);
  assert.deepEqual(copy,quad);copy[0][0]=1;assert.equal(quad[0][0],0);
});

test('invalid insets and corner geometry cannot produce an inverted crop',()=>{
  const quad=[[0,0],[100,0],[100,100],[0,100]];
  for(const value of [-.01,.5,1,NaN,Infinity])assert.throws(()=>insetCropQuad(quad,value),RangeError);
  for(const corners of [[],[[0,0],[1,1],[1,0],[0,1]],[[0,0],[1,0],[1,0],[0,1]]])assert.throws(()=>insetCropQuad(corners),TypeError);
});
