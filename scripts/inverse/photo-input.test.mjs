import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import test from 'node:test';
import {photoInput} from './learning/photo-input.mjs';

const fixtures=JSON.parse(fs.readFileSync(new URL('./fixtures/photo-input-pillow.json',import.meta.url)));
for(const {width,height,resolution,sha256} of fixtures.cases){
 test(`photo preprocessing matches Pillow for ${width}x${height} to ${resolution}`,()=>{
  const rgb=Uint8Array.from({length:width*height*3},(_,i)=>{
   const c=i%3,x=Math.floor(i/3)%width,y=Math.floor(i/3/width);
   return(x*17+y*31+c*53+(x*y)%251)%256;
  });
  const sourceHash=createHash('sha256').update(rgb).digest('hex');
  const result=photoInput(rgb,width,height,resolution);
  assert.equal(createHash('sha256').update(result.rgb).digest('hex'),sha256);
  assert.equal(createHash('sha256').update(rgb).digest('hex'),sourceHash,'source pixels stay unchanged');
  assert.equal(result.rgb.length,resolution**2*3);
  assert.equal(result.window[2]-result.window[0],Math.max(width,height));
  assert.equal(result.window[3]-result.window[1],Math.max(width,height));
 });
}

test('letterbox uses a neutral background and source pixel-edge coordinates',()=>{
 const result=photoInput(new Uint8Array(4*2*3).fill(255),4,2,4);
 assert.deepEqual(result.offset,[0,1]);assert.deepEqual(result.window,[-0,-1,4,3]);
 assert.ok(result.rgb.subarray(0,12).every(v=>v===127));
 assert.ok(result.rgb.subarray(12,36).every(v=>v===255));
 assert.ok(result.rgb.subarray(36).every(v=>v===127));
});

test('preprocessing rejects malformed or excessive allocations before sampling',()=>{
 for(const dims of [[0,1,256],[1,NaN,256],[1,1,1025],[5000,5000,256],[1,1,.5]])
  assert.throws(()=>photoInput(new Uint8Array(3),...dims),RangeError);
 assert.throws(()=>photoInput(new Float32Array(3),1,1),TypeError);
 assert.throws(()=>photoInput(new Uint8Array(4),1,1),TypeError);
});
