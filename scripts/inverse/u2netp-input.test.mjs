import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {u2netpInput} from './learning/u2netp-input.mjs';

const fixtures=JSON.parse(fs.readFileSync(new URL('./fixtures/u2netp-input-skimage.json',import.meta.url)));
for(const row of fixtures.cases) {
  test(`saliency input matches skimage: ${row.kind} ${row.width}x${row.height} -> ${row.resolution}`,()=>{
    const {width,height,resolution,kind}=row;
    const rgb=Uint8Array.from({length:width*height*3},(_,i)=>{
      const c=i%3,x=Math.floor(i/3)%width,y=Math.floor(i/3/width);
      const value=(x*17+y*31+c*53+(x*y)%251)%256;
      return kind==='positive'?20+Math.floor(value/2):kind==='white'?255:value;
    });
    const before=rgb.slice(),result=u2netpInput(rgb,width,height,resolution);
    assert.equal(result.status,'ready');assert.deepEqual(result.window,[0,0,width,height]);
    const expected=Buffer.from(row.tensorBase64,'base64');assert.equal(expected.length,result.tensor.byteLength);
    for(let i=0;i<result.tensor.length;i++)assert.ok(Math.abs(result.tensor[i]-expected.readFloatLE(4*i))<=1e-6,`tensor value ${i}`);
    assert.deepEqual(rgb,before);
  });
}

test('all-black images are refused before image-maximum division',()=>{
  assert.deepEqual(u2netpInput(new Uint8Array(7*13*3),7,13,17),{status:'empty-image',tensor:null,window:[0,0,7,13]});
});

test('invalid and excessive allocations are refused before sampling',()=>{
  for(const dims of [[0,1,320],[1,NaN,320],[1,1,1025],[5000,5000,320],[1,1,.5],[1,16385,320]])
    assert.throws(()=>u2netpInput(new Uint8Array(3),...dims),RangeError);
  assert.throws(()=>u2netpInput(new Float32Array(3),1,1),TypeError);
  assert.throws(()=>u2netpInput(new Uint8Array(4),1,1),TypeError);
});
