import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {loadNumericalKernel,nativeDistanceTransform,nativeCoreLabels} from '../../static/inverse/core/numerical-kernel.js';
import {distanceTransform,materialAudit} from '../../static/inverse/core/material.js';
import {settings} from '../../static/inverse/core/settings.js';
import {solutionJSON,loadSolutionJSON} from '../../static/inverse/core/graph.js';
import {fixture} from './fixtures.mjs';
import {CurveGraph} from '../../static/inverse/core/direct/curves.js';

const randomMask=(nx,ny,seed=7)=>{let s=seed;return Uint8Array.from({length:nx*ny},()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return Number(s<0x18000000);});};
const withoutTime=result=>{delete result.summary.seconds;return result;};
const bruteDistance=(mask,nx,_ny)=>Float64Array.from(mask,(_,i)=>{
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
    const previous=withoutTime(materialAudit(solution,cfg,{includeMaps:true,native:false})),current=withoutTime(materialAudit(solution,cfg,{includeMaps:true,native:true}));
    assert.deepEqual(current,previous);
    if(resolution===180)assert.equal(createHash('sha256').update(JSON.stringify(current)).digest('hex'),hashes[name]);
  }
  const cfg=settings({width:60,cutError:0,printShrinkPercent:0,materialResolution:80,minWidth:.7});
  const uncertain=withoutTime(materialAudit(fixture('thin'),cfg,{includeMaps:true}));
  assert.equal(uncertain.status,'uncertain');assert.equal(uncertain.passed,false);
  assert.deepEqual(uncertain,withoutTime(materialAudit(fixture('thin'),cfg,{includeMaps:true,native:false})));
});

test('outline reuse preserves audits after width, resolution and cut changes',async()=>{
  await loadNumericalKernel();
  // Complete-map hashes captured from material.js at 0a30976. Revisit inputs
  // in both directions so changes and evictions cannot leave stale outlines.
  const cases=[
    ['straight',20,80,1,'ed6c4df6f9f05006715764b331607940fadf83eaf62661f965be0c9aa9c4f197'],
    ['neck',100,121,3,'5b1bf309d26cc41b2f7329070f64c62a578f44c6d017b79bb2941ded49f76b72'],
    ['thin',300,180,5,'d6fbb3c9e1765afafa8f557add53d888bd0bfb4045cfd68bd544bf8f19390d92'],
    ['straight',100,80,2,'30c77e32dadac4c33a158a416cec6162d45907ce53a9b5715d77a58c7e8efb28'],
    ['neck',20,180,1,'c8937a814bc4cdfeda9fd17a5ee9785fb53d6780b650e52e4976500b88d30aa2'],
    ['thin',100,121,.7,'bcbd8f88497a655be861ea2ed7830ee6fd8496c668b064907d480aedbae837f0']
  ];
  for(const[name,width,resolution,minWidth,expected]of[...cases,...cases.toReversed()]){
    const data=solutionJSON(fixture(name));data.square_width_mm=width;
    for(const curve of Object.values(data.curves))curve.control_points=curve.control_points.map(p=>p.map(v=>v*width/60));
    const cfg=settings({width,materialResolution:resolution,minWidth,cutError:0,printShrinkPercent:0});
    const result=withoutTime(materialAudit(loadSolutionJSON(data),cfg,{includeMaps:true}));
    assert.equal(createHash('sha256').update(JSON.stringify(result)).digest('hex'),expected,`${name}, ${width} mm, ${resolution}`);
  }
});

test('padded tile indexing preserves complete audits of outlying trial cuts',async()=>{
  await loadNumericalKernel();
  // Full-map hashes from d623294's unbounded string-key index. These internal
  // trial curves deliberately exceed the saved-template import bounds.
  const cases=[
    ['warped',73,121,.7,'uncertain','3b6996ea215bb55a532e18ab3542cf97edb65fd5f9dfc8b5d5a1a2ade62fcc59'],
    ['outside-left',100,80,3,'fail','3c5da4c3cb5e0711e14445829b9f665550654a866327e25ad4608014cb88712d'],
    ['outside-right',20,180,1,'fail','62ce7187750f748b1a647d01fbf9b26b3d1d86d8548e5255d8f2a797cc831bd9'],
    ['warped',20.3,81,.2,'uncertain','2fe9740638634322d63608441581c1ae752627abb12e35055091f12c208af48c']
  ];
  for(const [mode,width,resolution,minWidth,status,expected]of [...cases,...cases.toReversed()]){
    const data=solutionJSON(fixture('straight'));
    for(const curve of Object.values(data.curves))curve.control_points=curve.control_points.map(p=>p.map(v=>v*width/60));
    if(mode==='warped'){
      data.curves[0].control_points=[[-.5,0],[1.8,-2],[-.8,3],[.3,1]].map(p=>p.map(v=>v*width));
      data.curves[2].control_points=[[0,.6],[2,1.8],[-1,-.9],[1,.7]].map(p=>p.map(v=>v*width));
    }else{
      const shift=(mode==='outside-left'?-2:2)*width;
      for(const p of data.A_overlap_paths)for(const cut of p)for(const xy of data.curves[cut.curve].control_points)xy[0]+=shift;
    }
    const graph=new CurveGraph([data.A_overlap_paths,data.B_overlap_paths].map(f=>f.map(p=>p.map(c=>data.curves[c.curve].control_points))),width);
    const cfg=settings({width,materialResolution:resolution,minWidth,cutError:0,printShrinkPercent:0});
    for(const native of [false,true]){
      const result=withoutTime(materialAudit(graph.solution(graph.points,1),cfg,{includeMaps:true,native}));
      assert.equal(result.status,status);assert.equal(result.passed,false);
      assert.equal(createHash('sha256').update(JSON.stringify(result)).digest('hex'),expected,`${mode}, ${width} mm, ${resolution}, native=${native}`);
    }
  }
});
