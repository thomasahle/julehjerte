import test from 'node:test';
import assert from 'node:assert/strict';
import {createCanvas} from 'canvas';
import {foregroundFields,detectForegroundCrop} from './learning/foreground-crop.mjs';
import {heartPhoto} from './crop-fixture.mjs';

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

test('known foreground reaches correct physical corners through the injected locator',async()=>{
  const input=heartPhoto({background:'transparent'}),canvas=createCanvas(256,256),ctx=canvas.getContext('2d');
  ctx.drawImage(input.canvas,0,0,256,256);
  const rgba=ctx.getImageData(0,0,256,256).data,probability=Float32Array.from({length:256*256},(_,i)=>rgba[4*i+3]/255);
  const result=await detectForegroundCrop(input,{probability,window:[0,0,input.imageWidth,input.imageHeight]});
  assert.equal(result.candidates.length,1);
  const quad=result.candidates[0].quad,expected=[[190,80],[275,155],[190,230],[105,155]];
  assert.ok(Math.max(...quad.map((p,i)=>Math.hypot(p[0]-expected[i][0],p[1]-expected[i][1])))<6);
});

test('weighted locator receives a supported heart whose body confidence stays below 95 percent',async()=>{
  const input=heartPhoto({background:'transparent'}),canvas=createCanvas(256,256),ctx=canvas.getContext('2d');
  ctx.drawImage(input.canvas,0,0,256,256);
  const rgba=ctx.getImageData(0,0,256,256).data,probability=Float32Array.from({length:256*256},(_,i)=>.94*rgba[4*i+3]/255);
  const window=[0,0,input.imageWidth,input.imageHeight];
  const legacy=await detectForegroundCrop(input,{probability,window});
  assert.equal(legacy.candidates.length,0);
  const result=await detectForegroundCrop(input,{probability,window,paletteMode:'confidence-weighted'});
  assert.equal(result.candidates.length,1);
  const expected=[[190,80],[275,155],[190,230],[105,155]];
  assert.ok(Math.max(...result.candidates[0].quad.map((p,i)=>Math.hypot(p[0]-expected[i][0],p[1]-expected[i][1])))<6);
});
