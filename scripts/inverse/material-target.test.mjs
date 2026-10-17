import test from 'node:test';
import assert from 'node:assert/strict';
import {rectifyMaterialPrediction} from './learning/material-target.mjs';
import {prepare} from '../../static/inverse/core/engine.js';
import {referenceError,sourceWeights} from '../../static/inverse/core/image-reference.js';

const n=64,rgba=new Uint8ClampedArray(n*n*4).fill(255),source={rgba,imageWidth:n,imageHeight:n};
const values=Float32Array.from({length:n*n},(_,i)=>(i%n+.5)/n),prediction={values,resolution:n,window:[0,0,n,n]};

test('fully observed material fields retain their coordinates, values and classification',()=>{
  const full=rectifyMaterialPrediction(source,prediction,null,n);
  assert.equal(full.validMask,null);assert.deepEqual(full.probability,values);
  assert.deepEqual(full.mask,Uint8Array.from(values,v=>Number(v>=.5)));
  const rotated=rectifyMaterialPrediction(source,prediction,[[64,0],[64,64],[0,64],[0,0]],n);
  assert.equal(rotated.validMask,null);
  for(let y=0;y<n;y++)for(let x=0;x<n;x++)assert.equal(rotated.probability[y*n+x],(n-y-.5)/n);
});

test('a clipped prediction preserves actual observations through fitting and scoring',()=>{
  const crop=rectifyMaterialPrediction(source,prediction,[[0,0],[128,0],[128,128],[0,128]],n);
  const expected=Uint8Array.from({length:n*n},(_,i)=>Number(i%n<32&&Math.floor(i/n)<32));
  assert.deepEqual(crop.validMask,expected);
  for(let i=0;i<n*n;i++){
    assert.equal(crop.probability[i],expected[i]?(2*(i%n)+1)/n:.5);
    assert.equal(crop.mask[i],expected[i]?Number(i%n>=16):0);
  }
  const prepared=prepare({type:'mask',resolution:n,mask:crop.mask,validMask:crop.validMask},{algorithm:'direct',resolution:n});
  const target=prepared.target.sourceImage,onlyPaddingChanged=Uint8Array.from(crop.mask,(v,i)=>expected[i]?v:1-v);
  assert.deepEqual(sourceWeights(target),Float64Array.from(expected));
  const score=referenceError(target,onlyPaddingChanged);
  assert.equal(score.mismatchFraction,0);assert.equal(score.observedFraction,.25);
  crop.validMask.fill(1);assert.deepEqual(target.validMask,expected,'Target owns coverage independently of caller edits');
});

test('letterboxed prediction coordinates remain in source pixel edges',()=>{
  const window=[-32,0,96,128],field=Float32Array.from({length:n*n},(_,i)=>(-32+(i%n+.5)*2+64)/256);
  const crop=rectifyMaterialPrediction(source,{values:field,resolution:n,window},[[8,8],[56,8],[56,56],[8,56]],n);
  assert.equal(crop.validMask,null);
  for(let y=0;y<n;y++)for(let x=0;x<n;x++)assert.equal(crop.probability[y*n+x],(8+(x+.5)*48/n+64)/256);
});

test('inverting a full-photo letterbox tolerates roundoff but not missing source pixels',()=>{
  const width=3730,height=2137,scale=256/width,oy=(256-height*scale)/2;
  const window=[0,-oy/scale,256/scale,(256-oy)/scale];
  assert.ok(window[2]<width,'Reproduce the real photograph’s inverse-scale roundoff');
  const input={imageWidth:width,imageHeight:height,rgba:new Uint8ClampedArray(width*height*4).fill(255)};
  const exact={...prediction,window:[0,window[1],width,window[3]]};
  const before=window.slice(),reference=rectifyMaterialPrediction(input,exact,null,n);
  const actual=rectifyMaterialPrediction(input,{...prediction,window},null,n);
  assert.deepEqual(actual,reference);
  assert.deepEqual(window,before,'Do not move the prediction sampling window');
  for(let edge=0;edge<4;edge++){
    const narrower=[0,0,width,height];narrower[edge]+=edge<2?1e-6:-1e-6;
    assert.throws(()=>rectifyMaterialPrediction(input,{...prediction,window:narrower},null,n),/contain/);
  }
});

test('invalid and partial prediction fields fail instead of shrinking the evaluation region',()=>{
  assert.throws(()=>rectifyMaterialPrediction(source,{...prediction,window:[8,0,64,64]},null,n),/contain/);
  assert.throws(()=>rectifyMaterialPrediction(source,{...prediction,values:new Float32Array(n*n).fill(NaN)},null,n),/Invalid/);
  assert.throws(()=>rectifyMaterialPrediction(source,{...prediction,values:values.slice(1)},null,n),/Invalid/);
  assert.throws(()=>rectifyMaterialPrediction(source,prediction,[[0,0],[64,64],[64,0],[0,64]],n),/convex/);
  const absent=rectifyMaterialPrediction(source,prediction,[[128,128],[192,128],[192,192],[128,192]],n);
  assert.throws(()=>prepare({type:'mask',resolution:n,mask:absent.mask,validMask:absent.validMask},{algorithm:'direct',resolution:n}),/observed/);
});
