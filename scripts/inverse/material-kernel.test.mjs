import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {loadNumericalKernel,nativeDistanceTransform,nativeCoreLabels} from '../../static/inverse/core/numerical-kernel.js';
import {distanceTransform,materialAudit} from '../../static/inverse/core/material.js';
import {settings} from '../../static/inverse/core/settings.js';
import {fixture} from './fixtures.mjs';

const randomMask=(nx,ny,seed=7)=>{let s=seed;return Uint8Array.from({length:nx*ny},()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return Number(s<0x18000000);});};
const withoutTime=result=>{delete result.summary.seconds;return result;};
const bruteDistance=(mask,nx,ny)=>Float64Array.from(mask,(_,i)=>{
  let best=1e12;for(let j=0;j<mask.length;j++)if(mask[j])best=Math.min(best,(i%nx-j%nx)**2+(Math.floor(i/nx)-Math.floor(j/nx))**2);
  return best;
});
// Independent stack traversal. Component membership and numbering must agree
// even though its neighbour and traversal order differ from the kernel's BFS.
function componentReference(mask,nx,ny,originY,h,w,offset){
  const labels=new Int32Array(mask.length),sizes=[],anchored=[];
  for(let i=0;i<mask.length;i++)if(mask[i]&&!labels[i]){
    const id=sizes.length+1,stack=[i];labels[i]=id;let size=0,anchor=false;
    while(stack.length){
      const p=stack.pop(),x=p%nx,y=Math.floor(p/nx),yy=originY+(y+.5)*h;size++;
      anchor||=yy<-offset*1.1||yy>2*w+offset*1.1;
      for(const[xx,yy]of[[x,y+1],[x+1,y],[x,y-1],[x-1,y]])if(xx>=0&&xx<nx&&yy>=0&&yy<ny){
        const q=yy*nx+xx;if(mask[q]&&!labels[q]){labels[q]=id;stack.push(q);}
      }
    }
    sizes.push(size);anchored.push(Number(anchor));
  }
  return{labels,sizes:Int32Array.from(sizes),anchored:Uint8Array.from(anchored)};
}

test('paper kernels are optional and unsupported inputs retain the JavaScript path',async()=>{
  const fresh=await import('../../static/inverse/core/numerical-kernel.js?unloaded');
  assert.equal(fresh.nativeDistanceTransform(new Uint8Array(4),2,2),null);
  assert.equal(fresh.nativeCoreLabels(new Uint8Array(4),2,2,0,1,2,1),null);
  assert.equal((await loadNumericalKernel()).backend,'wasm');
  assert.equal(nativeDistanceTransform([0,256,0],3,1),null);
  assert.deepEqual(distanceTransform([0,256,0],3,1),Float64Array.of(1,0,1));
  assert.equal(nativeDistanceTransform(new Uint8Array(3),2,2),null);
  assert.equal(nativeCoreLabels(new Uint8Array(0),0,0,0,1,2,1),null);
});

test('native distance fields match brute-force distances for every small binary arrangement',async()=>{
  await loadNumericalKernel();
  for(const[nx,ny]of[[1,1],[1,5],[5,1],[2,2],[3,3]])for(let bits=0;bits<2**(nx*ny);bits++){
    const mask=Uint8Array.from({length:nx*ny},(_,i)=>(bits>>i)&1),actual=nativeDistanceTransform(mask,nx,ny);
    assert.ok(actual);assert.deepEqual(actual,bruteDistance(mask,nx,ny));
    assert.deepEqual(actual,distanceTransform(mask,nx,ny,{native:false}));
  }
});

test('native distance fields stay exact on tall, wide, empty and dense paper lattices',async()=>{
  await loadNumericalKernel();
  for(const[nx,ny]of[[37,113],[113,37],[121,363],[360,1080],[700,2100]]){
    const masks=[randomMask(nx,ny),new Uint8Array(nx*ny),new Uint8Array(nx*ny).fill(255)];
    for(const mask of masks)assert.deepEqual(nativeDistanceTransform(mask,nx,ny),distanceTransform(mask,nx,ny,{native:false}));
  }
});

test('native components preserve four-neighbour contacts and anchoring threshold decisions',async()=>{
  await loadNumericalKernel();
  for(const[nx,ny]of[[1,5],[5,1],[2,2],[3,3]])for(let bits=0;bits<2**(nx*ny);bits++){
    const mask=Uint8Array.from({length:nx*ny},(_,i)=>(bits>>i)&1);
    for(const origin of[-1.6-1e-12,-1.6,-1.6+1e-12,2.6])assert.deepEqual(nativeCoreLabels(mask,nx,ny,origin,1,1,1),componentReference(mask,nx,ny,origin,1,1,1));
  }
  for(const[nx,ny]of[[31,89],[89,31]]){
    const mask=randomMask(nx,ny);assert.deepEqual(nativeCoreLabels(mask,nx,ny,-30,60/nx,60,1.7),componentReference(mask,nx,ny,-30,60/nx,60,1.7));
  }
});

test('paper results own their arrays across later calls and scratch-memory growth',async()=>{
  await loadNumericalKernel();
  const mask=randomMask(7,13),distance=nativeDistanceTransform(mask,7,13),components=nativeCoreLabels(mask,7,13,-2,.7,5,1),saved=structuredClone({distance,components});
  nativeDistanceTransform(randomMask(700,2100),700,2100);
  nativeCoreLabels(new Uint8Array(700*2100).fill(1),700,2100,-50,100/700,100,2);
  assert.deepEqual({distance,components},saved);
});

test('native audits preserve complete historical maps, areas, fold intervals and strict decisions',async()=>{
  await loadNumericalKernel();
  const hashes={straight:'dd898579d6c7c89f8abbaa6bced7f141d8d5c32eeec4a3a5f6d0aa7c9aaed8c9',neck:'8918f38e8907de8e201d83b2085fd677707f411ba9accb33c4447eecdfb1b187',thin:'a7a8c91cb8f200ff2a85019dab78f6339b8513622fb0fc729d47b831e7e2876f'};
  for(const name of Object.keys(hashes))for(const resolution of[80,180,360]){
    const cfg=settings({width:60,cutError:0,printShrinkPercent:0,materialResolution:resolution,minWidth:3}),solution=fixture(name);
    const previous=withoutTime(materialAudit(solution,cfg,{includeMaps:true,native:false})),current=withoutTime(materialAudit(solution,cfg,{includeMaps:true}));
    assert.deepEqual(current,previous);
    if(resolution===180)assert.equal(createHash('sha256').update(JSON.stringify(current)).digest('hex'),hashes[name]);
  }
  const cfg=settings({width:60,cutError:0,printShrinkPercent:0,materialResolution:80,minWidth:.7});
  const uncertain=withoutTime(materialAudit(fixture('thin'),cfg,{includeMaps:true}));
  assert.equal(uncertain.status,'uncertain');assert.equal(uncertain.passed,false);
  assert.deepEqual(uncertain,withoutTime(materialAudit(fixture('thin'),cfg,{includeMaps:true,native:false})));
});
