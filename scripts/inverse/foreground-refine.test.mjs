import test from 'node:test';
import assert from 'node:assert/strict';
import {refineForegroundRGB} from './learning/foreground-refine.mjs';

function fixture(){
  const w=96,h=96,n=w*h,f={w,h,paper:new Float32Array(n),chroma:new Float32Array(n),r:new Float32Array(n),g:new Float32Array(n),b:new Float32Array(n)},target=new Uint8Array(n);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const i=y*w+x,inside=x>=16&&x<80&&y>=16&&y<80,first=x<48;
    const color=inside?(first?[.75,.05,.07]:[.94,.92,.85]):[.35,.23,.14];
    [f.r[i],f.g[i],f.b[i]]=color;f.chroma[i]=first?.99:.01;target[i]=Number(inside);f.paper[i]=inside?.99:.01;
    // A blurred/misaligned prior around the outer vertical edges, plus a
    // false internal hole. RGB still contains the original physical boundary.
    if(y>=20&&y<76&&(x>=13&&x<16||x>=80&&x<83))f.paper[i]=.55;
    if(inside&&(x<19||x>=77))f.paper[i]=.45;
    if(x>=54&&x<60&&y>=40&&y<50)f.paper[i]=.2;
  }
  return{f,target};
}
const error=(paper,target)=>paper.reduce((sum,v,i)=>sum+Number((v>.5)!==!!target[i]),0);

test('RGB refinement corrects uncertain edge shifts and holes without changing RGB or sheet phase',()=>{
  const {f,target}=fixture(),before=structuredClone(f),result=refineForegroundRGB(f);
  assert.ok(error(f.paper,target)>300);
  assert.equal(error(result.paper,target),0);
  assert.equal(result.refinement.applied,true);
  assert.deepEqual(f,before);
  assert.equal(result.chroma,f.chroma);
  for(let i=0;i<target.length;i++)assert.ok(Math.abs(result.red[i]+result.white[i]-result.paper[i])<1e-7);
});

test('bounded RGB evidence cannot override a nearly certain contradictory prior',()=>{
  const {f}=fixture(),point=40*f.w+60;f.paper[point]=.0001;
  const result=refineForegroundRGB(f);
  assert.ok(result.paper[point]<.5);
  const delta=Math.log(result.paper[point]/(1-result.paper[point]))-Math.log(f.paper[point]/(1-f.paper[point]));
  assert.ok(delta<=3+1e-6&&delta>=-3-1e-6);
});

test('insufficient seeds preserve the prior and invalid fields are rejected',()=>{
  const {f}=fixture();f.paper.fill(.5);
  const result=refineForegroundRGB(f);
  assert.equal(result.refinement.applied,false);assert.equal(result.paper,f.paper);
  f.r[0]=NaN;assert.throws(()=>refineForegroundRGB(f),/finite RGB/);
});
