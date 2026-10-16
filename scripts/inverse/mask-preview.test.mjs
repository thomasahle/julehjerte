import test from 'node:test';
import assert from 'node:assert/strict';
import {originalMaskBoundaries} from '../../static/inverse/core/mask-preview.js';
import {loadSVG,sampleTarget} from '../../static/inverse/core/input.js';
import {prepare} from '../../static/inverse/core/engine.js';
import {AUTOMATIC_PRESET} from '../../static/inverse/core/presets.js';

test('missing photo pixels create no boundary or continuation through unobserved cells',()=>{
  const mask=Uint8Array.of(0,0,1,0,0,1,0,0,1),validMask=Uint8Array.of(0,1,1,0,0,0,0,1,1);
  const source={mask,validMask,resolution:3},preview=originalMaskBoundaries(source,100);
  assert.equal(preview.segments,2);
  assert.ok(preview.svg.includes('d="M2,0V1 M2,2V3"'));
  const changed=Uint8Array.from(mask,(v,i)=>validMask[i]?v:1-v);
  assert.deepEqual(originalMaskBoundaries({...source,mask:changed},100),preview);
});

test('original boundary previews reconstruct every binary two-by-two arrangement',()=>{
  for(const width of [37,100])for(let bits=0;bits<16;bits++){
    const mask=Uint8Array.from({length:4},(_,i)=>(bits>>i)&1),preview=originalMaskBoundaries({mask,resolution:2},width);
    const parsed=loadSVG(preview.svg,{width});
    assert.deepEqual(sampleTarget(parsed,2),mask);
    assert.equal(preview.segments===0,bits===0||bits===15);
  }
});

test('original previews preserve border endpoints, holes and pixel noise without fitting them',()=>{
  for(const n of [17,32]){
    const mask=Uint8Array.from({length:n*n},(_,i)=>Number((i*2654435761>>>29)&1)),preview=originalMaskBoundaries({mask,resolution:n},100);
    assert.deepEqual(sampleTarget(loadSVG(preview.svg),n),mask);
  }
  const n=40,mask=Uint8Array.from({length:n*n},(_,i)=>Number(i%n>9&&i%n<30&&Math.floor(i/n)>9&&Math.floor(i/n)<30));
  const preview=originalMaskBoundaries({mask,resolution:n},100);
  assert.equal(preview.segments,4,'Merge collinear edges into four complete rectangle sides.');
  assert.deepEqual(sampleTarget(loadSVG(preview.svg),n),mask);
});

test('free-border preparation keeps exact original outlines separate from its unchanged guide',()=>{
  const n=64,mask=Uint8Array.from({length:n*n},(_,i)=>Number(i%n>20&&i%n<42&&Math.floor(i/n)>20&&Math.floor(i/n)<42)),weights=Float64Array.from(mask,(_,i)=>Number(i%n>10&&i%n<54&&Math.floor(i/n)>10&&Math.floor(i/n)<54));
  const noisy=Uint8Array.from(mask,(v,i)=>weights[i]?v:Number((i*2654435761>>>29)&1));
  const cfg={...AUTOMATIC_PRESET,width:73,paperColors:['#123456','#fedcba']};
  const before=prepare({type:'mask',resolution:n,mask,weights},cfg),after=prepare({type:'mask',resolution:n,mask:noisy,weights},cfg);
  assert.equal(after.preview.metadata.originalBoundaryMethod,'pixel-edges');
  assert.equal(after.preview.metadata.originalBoundariesAvailable,true);
  assert.deepEqual(sampleTarget(loadSVG(after.preview.boundaries,{width:73}),n),noisy);
  assert.deepEqual(after.target.boundarySeed.curves.map(c=>c.p),before.target.boundarySeed.curves.map(c=>c.p));
  assert.deepEqual(after.target.sourceImage.mask,noisy);
  const original=loadSVG(after.preview.boundaries,{width:73});assert.deepEqual(original.metadata.paperColors,cfg.paperColors);
});
