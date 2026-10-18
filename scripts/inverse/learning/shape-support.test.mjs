import test from 'node:test';
import assert from 'node:assert/strict';
import {heartPhoto} from '../crop-fixture.mjs';
import {notchOverlapProposal, affineNotchQuad} from './notch-crop.mjs';
import {separateOverlapSupport} from './shape-support.mjs';

const quad=[[190,80],[275,155],[190,230],[105,155]];
function fixture() {
  const im=heartPhoto({background:'#000000',colours:['#ffffff','#ffffff']}),ctx=im.canvas.getContext('2d');
  ctx.fillStyle='white';ctx.beginPath();quad.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.fill();
  const {imageWidth:w,imageHeight:h}=im,rgba=ctx.getImageData(0,0,w,h).data;
  const paper=Float32Array.from({length:w*h},(_,i)=>rgba[4*i]/255);
  return {w,h,paper,chroma:new Float32Array(w*h).fill(.5),r:paper.slice(),g:paper.slice(),b:paper.slice()};
}

test('complete shape rejects a false notch carved by an occluding ribbon',()=>{
  const shape=fixture(),visible={...shape,paper:shape.paper.slice()};
  for(let y=0;y<110;y++)for(let x=186;x<=194;x++)visible.paper[y*shape.w+x]=0;
  const wrong=affineNotchQuad([190,110],{tip:[190,230],left:{a:85/75},right:{a:-85/75}});
  assert.equal(separateOverlapSupport(visible,shape,wrong).supported,false);
  const right=separateOverlapSupport(visible,shape,quad);
  assert.equal(right.supported,true,JSON.stringify(right));
  assert.ok(right.visible.notchInside[0]<right.complete.notchInside[0]);
});

test('a hidden notch proposal uses complete shape while exposed edges retain visible evidence',()=>{
  const shape=fixture(),visible={...shape,paper:shape.paper.slice()};
  for(let y=0;y<110;y++)for(let x=186;x<=194;x++)visible.paper[y*shape.w+x]=0;
  const before=visible.paper.slice(),plain=notchOverlapProposal(visible),recovered=notchOverlapProposal(visible,{shapePaper:shape.paper});
  assert.ok(Math.hypot(...plain.notch.map((v,k)=>v-quad[0][k]))>25);
  assert.ok(Math.hypot(...recovered.notch.map((v,k)=>v-quad[0][k]))<3,JSON.stringify(recovered.notch));
  assert.deepEqual(recovered.lines,plain.lines);
  assert.equal(recovered.notchSource,'complete-shape-hypothesis');
  assert.deepEqual(visible.paper,before);
});

test('complete-shape evidence cannot conceal a missing exposed paper edge',()=>{
  const shape=fixture(),visible={...shape,paper:shape.paper.slice()};
  for(let y=145;y<190;y++)for(let x=240;x<shape.w;x++)visible.paper[y*shape.w+x]=0;
  assert.equal(separateOverlapSupport(visible,shape,quad).supported,false);
});

test('an unrelated shape prior is rejected rather than replacing the selected object',()=>{
  const visible=fixture(),prior=new Float32Array(visible.paper.length);
  for(let y=20;y<60;y++)for(let x=10;x<50;x++)prior[y*visible.w+x]=1;
  assert.match(notchOverlapProposal(visible,{shapePaper:prior}).reason,/different objects/);
  assert.deepEqual(notchOverlapProposal(visible,{shapePaper:visible.paper}),notchOverlapProposal(visible));
});

test('shape support rejects inconsistent dimensions and invalid probabilities',()=>{
  const f=fixture();assert.throws(()=>separateOverlapSupport(f,{...f,w:f.w+1},quad),TypeError);
  const invalid=f.paper.slice();invalid[0]=NaN;
  assert.throws(()=>notchOverlapProposal(f,{shapePaper:invalid}),TypeError);
});
