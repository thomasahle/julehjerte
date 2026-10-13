import test from 'node:test';
import assert from 'node:assert/strict';
import {createCanvas} from 'canvas';
import {foregroundFields,detectForegroundCrop} from './learning/foreground-crop.mjs';

test('foreground adapter maps pixel-edge windows through working-image offsets and scale',()=>{
  const w=64,h=64,n=256,data=new Uint8ClampedArray(w*h*4),probability=new Float32Array(n*n);
  // Source window [100,200,228,328]. At work scale .5 each pixel centre is
  // two source pixels apart. A vertical probability step starts at x=132.
  for(let y=0;y<n;y++)for(let x=0;x<n;x++)probability[y*n+x]=x>=64?1:0;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++)data.set(y<32?[200,10,10,255]:[255,255,255,255],4*(y*w+x));
  const fields=foregroundFields({width:w,height:h,data,offset:[100,200],scale:.5},probability,n,[100,200,228,328]);
  assert.ok(fields);
  assert.equal(fields.paper[20*w+15],0);
  assert.equal(fields.paper[20*w+16],1);
  assert.equal(fields.paper[50*w+16],1,'white paper remains foreground');
  assert.notEqual(fields.chroma[20*w+16]>.5,fields.chroma[50*w+16]>.5);
  const bad=probability.slice();bad[0]=NaN;
  assert.throws(()=>foregroundFields({width:w,height:h,data},bad,n,[0,0,w,h]),/Invalid foreground/);
});

test('supplied silhouette still needs two colors and real locator support',async()=>{
  const canvas=createCanvas(256,256),ctx=canvas.getContext('2d');ctx.fillStyle='#be1111';ctx.fillRect(0,0,256,256);
  const source={imageWidth:256,imageHeight:256,rgba:ctx.getImageData(0,0,256,256).data};
  const result=await detectForegroundCrop(source,{probability:new Float32Array(256*256).fill(1),window:[0,0,256,256]});
  assert.equal(result.candidates.length,0,'a one-color rectangle cannot become a supported two-paper heart');
});
