import test from 'node:test';
import assert from 'node:assert/strict';
import {heartPhoto} from '../crop-fixture.mjs';
import {localOverlapSupport,supportedLocalOverlap} from './notch-support.mjs';

const quad=[[190,80],[275,155],[190,230],[105,155]];
function fixture(depths=[.5,.5]) {
  const im=heartPhoto({background:'#000000',colours:['#ffffff','#ffffff'],lobeDepths:depths});
  // Fill the physical overlap in one operation: adjacent antialiased checker
  // cells otherwise introduce artificial grey seams in an all-white oracle.
  const ctx=im.canvas.getContext('2d');ctx.fillStyle='white';ctx.beginPath();
  quad.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.fill();
  const rgba=ctx.getImageData(0,0,im.imageWidth,im.imageHeight).data;
  return {w:im.imageWidth,h:im.imageHeight,paper:Float32Array.from({length:im.imageWidth*im.imageHeight},(_,i)=>rgba[4*i]/255)};
}

test('known overlap has three paper quadrants, one background quadrant and exposed lower edges',()=>{
  for(const depths of [[.5,.5],[.32,.8]]) {
    const e=localOverlapSupport(fixture(depths),quad);
    assert.equal(supportedLocalOverlap(e),true,JSON.stringify(e));
  }
});

test('a filled undersized overlap fails independent notch evidence',()=>{
  const q=quad.map(p=>p.map((v,k)=>quad[2][k]+.7*(v-quad[2][k]))),e=localOverlapSupport(fixture(),q);
  assert.ok(e.notchInside.every(v=>v>.98));
  assert.ok(e.notchOutside>.98);
  assert.equal(supportedLocalOverlap(e),false);
});

test('extending both lower corners into background fails lower-edge evidence',()=>{
  const q=quad.map(p=>p.slice());q[1][0]+=20;q[3][0]-=20;
  const e=localOverlapSupport(fixture(),q);
  assert.ok(e.edgeInside.some(v=>v<.85));assert.equal(supportedLocalOverlap(e),false);
});

test('one missing paper lobe cannot pass a notch check',()=>{
  const f=fixture();
  for(let y=0;y<155;y++)for(let x=190;x<f.w;x++)f.paper[y*f.w+x]=0;
  assert.equal(supportedLocalOverlap(localOverlapSupport(f,quad)),false);
});

test('cap artwork colours do not enter a physical support test',()=>{
  const f=fixture(),e=localOverlapSupport(f,quad);
  assert.deepEqual(localOverlapSupport({...f,chroma:new Float32Array(f.paper.length).fill(.5)},quad),e);
});
