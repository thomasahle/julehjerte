import test from 'node:test';
import assert from 'node:assert/strict';
import {paperCoreMasks} from '../../static/inverse/core/paper-clearance.js';
import {loadNumericalKernel,nativePaperMasks} from '../../static/inverse/core/numerical-kernel.js';
import {prepareChord,chordDistance} from '../../static/inverse/core/chord-distance.js';

function input(points,lines,{R=1,guard=.1,h=1,outline=10,includeMap=true}={}){
  return{lattice:{x:Float64Array.from(points),y:Float64Array.of(0),outline:new Float64Array(points.length).fill(outline)},
    edt:new Float64Array(points.length),tiles:[lines.map((_,i)=>i)],tileX:new Int32Array(points.length),tileY:Int32Array.of(0),
    chords:lines.map(([a,b])=>prepareChord(a,b)),h,R,guard,tol:.01,includeMap};
}
// Independent unindexed distance reference. Tests force every chord within
// the refinement band, so neither EDT nor the tile index supplies this answer.
function reference(data){
  const count=data.lattice.x.length,certain=new Uint8Array(count),possible=new Uint8Array(count),paper=data.includeMap?new Uint8Array(count):null;
  for(let i=0;i<count;i++){
    const distance=Math.min(...data.chords.map(c=>chordDistance(data.lattice.x[i],0,c))),edge=data.lattice.outline[i];
    certain[i]=Number(Math.min(distance,edge)>data.R+data.guard);
    possible[i]=Number(Math.min(distance,edge)>data.R-data.guard);
    if(paper)paper[i]=Number(edge>0);
  }
  return{certain,possible,paper};
}

test('native paper clearance preserves hypot ties, subnormals and extreme chords',async()=>{
  await loadNumericalKernel();
  let deferred=0;
  for(const scale of[1e-310,1e-160,1e-5,1,1e5,1e150])for(const guard of[0,.1,1,2]){
    const data=input([0,1-2*Number.EPSILON,1,1+2*Number.EPSILON,2,3].map(x=>x*scale),
      [[[0,-scale],[0,scale]],[[2*scale,0],[2*scale,0]]],{R:scale,guard:guard*scale,h:scale,outline:10*scale});
    const native=nativePaperMasks(data);assert.ok(native);deferred+=native.deferred.length;
    assert.deepEqual(paperCoreMasks(data,{native:true}),reference(data));
    assert.deepEqual(paperCoreMasks(data,{native:true}),paperCoreMasks(data,{native:false}));
  }
  const extreme=input([1e200],[[[0,0],[1e200,1e200]]]);
  assert.deepEqual(paperCoreMasks(extreme,{native:true}),reference(extreme));
  assert.ok(nativePaperMasks(extreme).deferred.length);
  assert.ok(deferred>0,'The fallback must actually cover threshold ties.');
});

test('native masks agree with an unindexed chord-distance oracle on many geometric queries',async()=>{
  await loadNumericalKernel();
  let seed=73;
  const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32-.5)*20;
  for(let trial=0;trial<80;trial++){
    const points=Array.from({length:31},random),lines=Array.from({length:7},()=>[[random(),random()],[random(),random()]]);
    const data=input(points,lines,{R:1+(trial%9)/10,guard:(trial%7)/10,h:1,includeMap:trial%2===0});
    assert.deepEqual(paperCoreMasks(data,{native:true}),reference(data));
  }
});

test('outline thresholds, empty tiles and the EDT-only branch preserve complete masks',async()=>{
  await loadNumericalKernel();
  for(const includeMap of[false,true]){
    const data=input([0,1,2,3],[],{includeMap});
    data.lattice.outline=Float64Array.of(-1,.9,1.1,10);data.edt=Float64Array.of(0,100,100,1);
    assert.deepEqual(paperCoreMasks(data,{native:true}),paperCoreMasks(data,{native:false}));
    assert.deepEqual([...paperCoreMasks(data,{native:true}).certain],[0,0,0,0]);
    const chorded=input([0,1],[[[0,0],[0,1]]]);chorded.tiles=[[],[0]];chorded.tileX=Int32Array.of(0,1);
    assert.deepEqual(paperCoreMasks(chorded,{native:true}),paperCoreMasks(chorded,{native:false}));
  }
});

test('optional native masks reject malformed indices before entering wasm',async()=>{
  const fresh=await import('../../static/inverse/core/numerical-kernel.js?paper-clearance-unloaded');
  const data=input([0],[[[0,0],[0,1]]]);assert.equal(fresh.nativePaperMasks(data),null);
  await loadNumericalKernel();
  for(const change of [{tiles:[[1]]},{tiles:[[-1]]},{tiles:[[.5]]},{tileX:Int32Array.of(-1)},
    {tileY:Int32Array.of(1)},{tileX:Float64Array.of(2**32)},{tileX:{length:1}},{edt:new Float64Array(2)},
    {lattice:{...data.lattice,x:[0]}},{tiles:[null]},{chords:[{}]}])assert.equal(nativePaperMasks({...data,...change}),null);
});

test('native clearance scratch reuse cannot mutate prior masks or deferred cells',async()=>{
  await loadNumericalKernel();
  const data=input([0,1,2],[[[0,0],[0,1]]],{guard:0}),saved=nativePaperMasks(data),copy=structuredClone(saved);
  const large=input(Array.from({length:30000},(_,i)=>i/10000),[[[0,0],[0,1]]]);
  assert.ok(nativePaperMasks(large));assert.deepEqual(saved,copy);
  const result=paperCoreMasks(data,{native:true}),expected=structuredClone(result);
  paperCoreMasks(large,{native:true});assert.deepEqual(result,expected);
});
