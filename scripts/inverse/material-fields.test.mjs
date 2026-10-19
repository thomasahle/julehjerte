import test from 'node:test';
import assert from 'node:assert/strict';
import {materialFields,materialMask} from './learning/material-fields.mjs';

test('joint evidence preserves paper identities under window offsets, scaling and transparency',()=>{
  const n=8,body=new Float32Array(n*n).fill(1),material=Float32Array.from({length:n*n},(_,i)=>i%n>=4?1:0);
  const w=4,h=4,data=new Uint8ClampedArray(w*h*4);
  for(let i=0;i<w*h;i++)data.set([120,120,120,i===0?0:255],4*i);
  const fields=materialFields({width:w,height:h,data,offset:[10,20],scale:.5},body,material,n,[10,20,18,28]);
  // Learned identities remain distinct even for identical RGB paper colors.
  assert.equal(fields.red[1],0);assert.equal(fields.white[1],1);
  assert.equal(fields.red[2],1);assert.equal(fields.white[2],0);
  assert.equal(fields.paper[0],0);assert.equal(fields.red[0]+fields.white[0],0);
  for(let i=0;i<w*h;i++)assert.equal(fields.red[i]+fields.white[i],fields.paper[i]);
});

test('rectification samples exact pixel centres and preserves complement phase',()=>{
  const n=8,values=Float32Array.from({length:n*n},(_,i)=>i%n>=4?.8:.2),window=[10,20,18,28],quad=[[10,20],[18,20],[18,28],[10,28]];
  const result=materialMask(values,n,window,quad,n),other=materialMask(values.map(v=>1-v),n,window,quad,n);
  assert.deepEqual(result.probability,values);
  for(let i=0;i<values.length;i++)assert.equal(result.mask[i],1-other.mask[i]);
  const invalid=values.slice();invalid[4]=NaN;
  assert.throws(()=>materialMask(invalid,n,window,quad,n),/Invalid prediction/);
});
