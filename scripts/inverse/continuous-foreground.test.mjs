import test from 'node:test';
import assert from 'node:assert/strict';
import {confidencePalette,subpixelPaperDistance} from './learning/continuous-foreground.mjs';
import {close,signedDistance} from '../../static/inverse/locator/fields.js';

const maximumDifference=(a,b)=>a.reduce((m,v,i)=>Math.max(m,Math.abs(v-b[i])),0);
test('subpixel foreground distance follows a translated straight boundary continuously',()=>{
 const w=25,h=17,make=offset=>Float32Array.from({length:w*h},(_,i)=>Math.max(0,Math.min(1,.5+(i%w-10-offset)*.4)));
 const a=make(-1e-5),b=make(1e-5),da=subpixelPaperDistance(a,w,h),db=subpixelPaperDistance(b,w,h);
 assert.ok(maximumDifference(da,db)<1e-4,'A subpixel translation must not move the distance objective by a whole pixel.');
 assert.ok(maximumDifference(signedDistance(close(a,w,h,1),w,h),signedDistance(close(b,w,h,1),w,h))>.5);
 const translated=subpixelPaperDistance(make(.25),w,h,{radius:0});
 for(let x=2;x<w-2;x++)assert.ok(Math.abs(translated[8*w+x]-(x-10.25))<2e-6);
});
test('subpixel distances preserve orientation, polarity, and finite constant fields',()=>{
 const w=21,h=21,p=Float32Array.from({length:w*h},(_,i)=>Math.max(0,Math.min(1,.5+(i%w-9.25)*.1)));
 const transpose=a=>Float32Array.from(a,(_,i)=>a[(i%w)*w+Math.floor(i/w)]);
 const direct=subpixelPaperDistance(p,w,h,{radius:0});
 assert.ok(maximumDifference(transpose(direct),subpixelPaperDistance(transpose(p),w,h,{radius:0}))<2e-6);
 assert.ok(maximumDifference(Float32Array.from(direct,v=>-v),subpixelPaperDistance(Float32Array.from(p,v=>1-v),w,h,{radius:0}))<2e-6);
 for(const value of [0,.5,1])assert.ok(subpixelPaperDistance(new Float32Array(w*h).fill(value),w,h).every(v=>Number.isFinite(v)&&Math.sign(v)===Math.sign(value-.5)));
});
test('confidence-weighted colour estimates do not jump when one sample crosses 95 percent',()=>{
 const n=900,paper=new Float32Array(n).fill(.999),channels=Array.from({length:3},()=>new Float32Array(n));
 for(let i=0;i<n;i++){const color=i%2?[.95,.94,.91]:[.8,.05,.04];color.forEach((v,c)=>channels[c][i]=v);}
 [.6,.4,.2].forEach((v,c)=>channels[c][90]=v);
 const estimate=p=>{paper[90]=p;return confidencePalette({paper,r:channels[0],g:channels[1],b:channels[2]});};
 const a=estimate(.95-1e-6),b=estimate(.95+1e-6);
 assert.ok(a&&b);assert.ok(maximumDifference(a.colors.flat(),b.colors.flat())<1e-7);
 assert.ok(a.separation>.9);assert.equal(a.confidencePower,8);
});
test('subpixel distance rejects malformed or non-finite probability fields',()=>{
 for(const p of [[NaN,0],[Infinity,0],[-.1,0],[1.1,0],[0]])assert.throws(()=>subpixelPaperDistance(Float32Array.from(p),2,1));
 assert.throws(()=>subpixelPaperDistance(new Float32Array(4),2,2,{radius:4}));
});
