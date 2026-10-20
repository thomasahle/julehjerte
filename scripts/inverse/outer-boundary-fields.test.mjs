import test from 'node:test';
import assert from 'node:assert/strict';
import {createCanvas} from 'canvas';
import {outerBoundaryMask,outerBoundaryFields} from './learning/outer-boundary-fields.mjs';
import {detectForegroundCrop} from './learning/foreground-crop.mjs';
import {heartPhoto} from './crop-fixture.mjs';

test('outer sampling envelope removes enclosed holes but preserves open and diagonal notches',()=>{
  const w=15,h=15,mask=new Uint8Array(w*h);
  for(let y=2;y<13;y++)for(let x=2;x<13;x++)mask[y*w+x]=1;
  for(let y=6;y<=9;y++)for(let x=6;x<=9;x++)mask[y*w+x]=0;
  mask[2*w+4]=mask[3*w+4]=0;
  // This zero reaches the exterior only diagonally, so it must remain zero.
  mask[4*w+5]=0;
  const before=mask.slice(),envelope=outerBoundaryMask(mask,w,h);
  for(let y=6;y<=9;y++)for(let x=6;x<=9;x++)assert.equal(envelope[y*w+x],1);
  assert.equal(envelope[2*w+4],0);assert.equal(envelope[3*w+4],0);assert.equal(envelope[4*w+5],0);
  assert.deepEqual(mask,before);
  assert.deepEqual(outerBoundaryMask(envelope,w,h),envelope);
});

test('outer sampling does not join disconnected objects or change a border-connected gap',()=>{
  const w=17,h=15,mask=new Uint8Array(w*h);
  for(let y=2;y<13;y++)for(const x of [2,3,4,5,11,12,13,14])mask[y*w+x]=1;
  mask[7*w+2]=mask[7*w+3]=mask[7*w+4]=0;
  assert.deepEqual(outerBoundaryMask(mask,w,h),mask);
  for(const value of [0,1])assert.deepEqual(outerBoundaryMask(new Uint8Array(17).fill(value),17,1),new Uint8Array(17).fill(value));
  assert.throws(()=>outerBoundaryMask(new Uint8Array([2]),1,1),/binary mask/);
  assert.throws(()=>outerBoundaryMask(new Uint8Array(2),1,1),/binary mask/);
});

test('sampling fields preserve original probabilities, colour evidence and distance fields',()=>{
  const mask=new Uint8Array(25).fill(1);mask[12]=0;
  const f={w:5,h:5,mask,paper:new Float32Array(25).fill(.9),pd:new Float32Array(25).fill(2),
    r:new Float32Array(25),g:new Float32Array(25),b:new Float32Array(25),palette:{colors:[[1,0,0],[1,1,1]]}};
  const sampled=outerBoundaryFields(f);assert.equal(sampled.mask[12],1);assert.equal(f.mask[12],0);
  for(const k of Object.keys(f).filter(k=>k!=='mask'))assert.equal(sampled[k],f[k],k);
  assert.equal(outerBoundaryFields(f),sampled);
});

test('internal body-mask holes do not displace physical corners with outer sampling',async()=>{
  const input=heartPhoto({background:'transparent'}),n=256,canvas=createCanvas(n,n),ctx=canvas.getContext('2d');
  ctx.drawImage(input.canvas,0,0,n,n);
  const rgba=ctx.getImageData(0,0,n,n).data,clean=Float32Array.from({length:n*n},(_,i)=>rgba[4*i+3]/255),hole=clean.slice();
  for(let y=0;y<n;y++)for(let x=0;x<n;x++){
    const sx=(x+.5)*input.imageWidth/n,sy=(y+.5)*input.imageHeight/n;
    if(sx>204&&sx<220&&sy>132&&sy<195)hole[y*n+x]=0;
  }
  const options={window:[0,0,input.imageWidth,input.imageHeight],paletteMode:'confidence-weighted'};
  const control=await detectForegroundCrop(input,{...options,probability:clean});
  const broken=await detectForegroundCrop(input,{...options,probability:hole});
  const repaired=await detectForegroundCrop(input,{...options,probability:hole,outerBoundarySampling:true});
  assert.equal(control.candidates.length,1);
  assert.ok(broken.candidates.length===0||broken.proposal.evidence.lowerEdgeSupport[1]<control.proposal.evidence.lowerEdgeSupport[1]-.2,
    'Fixture must expose the center-scan sensitivity');
  assert.equal(repaired.candidates.length,1);
  const expected=[[190,80],[275,155],[190,230],[105,155]];
  assert.ok(Math.max(...repaired.candidates[0].quad.map((p,i)=>Math.hypot(p[0]-expected[i][0],p[1]-expected[i][1])))<6);
  assert.ok(repaired.proposal.evidence.lowerEdgeSupport.every(v=>v>=.95));
  assert.equal(repaired.boundarySampling,'enclosed-background-8-connected');
  const cleanOuter=await detectForegroundCrop(input,{...options,probability:clean,outerBoundarySampling:true});
  assert.deepEqual(cleanOuter.candidates[0].quad,control.candidates[0].quad);
  await assert.rejects(()=>detectForegroundCrop(input,{...options,probability:clean,outerBoundarySampling:'yes'}),/boolean/);
});
