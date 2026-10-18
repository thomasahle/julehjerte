import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {rectifyWithCoverage,quantize} from '../../static/inverse/core/input.js';
import {prepare} from '../../static/inverse/core/engine.js';
import {referenceError,sourceWeights,hasOnlyObservationWeights} from '../../static/inverse/core/image-reference.js';
const n=64,rgba=new Uint8ClampedArray(n*n*4);
for(let y=0;y<n;y++)for(let x=0;x<n;x++){const i=4*(y*n+x);rgba.fill(x<n/2?100:120,i,i+3);rgba[i+3]=255;}
const input={type:'pixels',rgba,imageWidth:n,imageHeight:n},cfg={algorithm:'direct',resolution:n,mode:'auto'};
const quad=[[0,0],[128,0],[128,128],[0,128]],expected=Uint8Array.from({length:n*n},(_,i)=>Number(i%n<32&&Math.floor(i/n)<32));

test('recovery distinguishes missing coverage from editable or fractional observed pixels',()=>{
 const source={mask:new Uint8Array(4),resolution:2,validMask:Uint8Array.of(1,1,0,0)};
 assert.equal(hasOnlyObservationWeights(source),true);
 for(const weights of [Float64Array.of(1,1,0,0),Float64Array.of(1,1,.2,1)]){
  assert.equal(hasOnlyObservationWeights({...source,weights}),true);
 }
 for(const weights of [Float64Array.of(0,1,0,0),Float64Array.of(.5,1,0,0)]){
  assert.equal(hasOnlyObservationWeights({...source,weights}),false);
 }
 assert.equal(hasOnlyObservationWeights({mask:source.mask,weights:Float64Array.of(1,1,0,0)}),false);
});

test('coverage preserves display RGB and marks complete bilinear support only',()=>{
 // Display hashes are pinned from the pre-coverage production rectifier.
 const hashes=['392fd80ce2a7e54ed9b0d91743593f03f7cc6c74d720ac3825235492c1769af3','679461cd5a368cbdc59cc1b5ca79bf095884b9360670e00b23c5cbb4359de918','393553a92d98a36e5c03b005202c1e5f3e8ddfac86841ab2e67be3a758828711'];
 let index=0;
 for(const q of [null,quad,[[-.25,-.25],[63.75,-.25],[63.75,63.75],[-.25,63.75]]]){
  const r=rectifyWithCoverage(rgba,n,n,n,q);assert.equal(createHash('sha256').update(r.rgb).digest('hex'),hashes[index++]);
  if(q===null)assert.equal(r.validMask,null);
  else if(q===quad)assert.deepEqual(r.validMask,expected);
  else assert.deepEqual(r.validMask,Uint8Array.from({length:n*n},(_,i)=>Number(i%n>0&&Math.floor(i/n)>0)));
 }
});

test('padding cannot change classification of the observed two papers',()=>{
 const full=prepare(input,cfg),clipped=prepare({...input,quad},cfg);
 assert.deepEqual(clipped.preview.validMask,expected);
 for(let y=0;y<32;y++)for(let x=0;x<32;x++)assert.equal(clipped.preview.mask[y*n+x],full.preview.mask[(2*y+1)*n+2*x+1]);
 assert.equal(clipped.preview.metadata.preprocessing.observedPixels,1024);
 const source=clipped.target.sourceImage,truth=Uint8Array.from(source.mask,(v,i)=>expected[i]?v:1-v);
 assert.equal(referenceError(source,truth).mismatchFraction,0);
 assert.equal(referenceError(source,truth).observedFraction,.25);
 assert.deepEqual(sourceWeights(source),Float64Array.from(expected));
});

test('automatic and fixed classifiers ignore unknown pixel colors, including in palette estimation',()=>{
 const rgb=rectifyWithCoverage(rgba,n,n,n,quad).rgb,altered=rgb.slice();
 for(let i=0;i<n*n;i++)if(!expected[i])altered.set([250,0,80],3*i);
 for(const mode of ['auto','threshold','otsu','lab','swatches','red-white']){
  const options={mode,validMask:expected};assert.deepEqual(quantize(rgb,options),quantize(altered,options));
 }
});

test('binary handoff owns observation and combines it with free-border importance',()=>{
 const photo=prepare({...input,quad},cfg),validMask=photo.preview.validMask.slice(),weights=new Float32Array(n*n).fill(1);weights[0]=0;
 const handoff=prepare({type:'mask',resolution:n,mask:photo.preview.mask,validMask,weights},cfg);
 const owned=handoff.target.sourceImage;assert.deepEqual(owned.validMask,expected);assert.equal(sourceWeights(owned)[0],0);
 const same=referenceError(owned,owned.mask);assert.equal(same.observedPixels,1024);assert.equal(same.editablePixels,1);assert.equal(same.protectedPixels,1023);
 validMask.fill(1);weights.fill(0);assert.deepEqual(owned.validMask,expected);assert.equal(sourceWeights(owned)[1],1);
});

test('unknown inputs fail explicitly while alpha remains intentional background',()=>{
 assert.throws(()=>prepare({...input,quad:[[128,128],[192,128],[192,192],[128,192]]},cfg),/observed/);
 for(const validMask of [new Uint8Array(n*n),new Uint8Array(5),new Uint8Array(n*n).fill(2)])assert.throws(()=>prepare({type:'mask',mask:new Uint8Array(n*n),resolution:n,validMask},cfg),/observ/i);
 const transparent=prepare({...input,rgba:new Uint8ClampedArray(n*n*4)},cfg);assert.equal(transparent.preview.validMask,undefined);assert.ok(transparent.preview.mask.every(v=>v===0));
});


test('the red/white mixture also estimates paper colors only from observations',()=>{
 const rgb=new Uint8Array(3*n*n),altered=new Uint8Array(3*n*n);
 for(let i=0;i<n*n;i++){
  const color=expected[i]?(i%n<16?[150,20,30]:[230,225,215]):[255,255,255];
  rgb.set(color,3*i);altered.set(expected[i]?color:[0,240,180],3*i);
 }
 const options={mode:'red-white-mixture',validMask:expected};assert.deepEqual(quantize(rgb,options),quantize(altered,options));
});

test('mixture preparation keeps the original inset with an irregular missing region',()=>{
 const rgb=new Uint8Array(3*n*n),validMask=new Uint8Array(n*n).fill(1);
 for(let i=0;i<n*n;i++)rgb.set(i%n<32?[150,20,30]:[230,225,215],3*i);
 validMask[0]=0; // 4095 observations cannot be reinterpreted as a square.
 const expected=quantize(rgb,{mode:'red-white-mixture'}),actual=quantize(rgb,{mode:'red-white-mixture',validMask});
 assert.equal(actual.metadata.observedPixels,4095);assert.equal(actual.metadata.missingPixels,1);
 assert.deepEqual(actual.metadata.mixture.paperPalettesSRGB,expected.metadata.mixture.paperPalettesSRGB);
 assert.deepEqual(actual.metadata.mixture.sampleCounts,expected.metadata.mixture.sampleCounts,'A missing corner outside the inset cannot move palette samples.');
 assert.equal(actual.mask[0],0);assert.equal(actual.probability[0],.5);
 for(let i=1;i<n*n;i++){assert.equal(actual.mask[i],expected.mask[i]);assert.equal(actual.probability[i],expected.probability[i]);}
 const changed=rgb.slice();changed.set([0,255,80],0);
 assert.deepEqual(quantize(changed,{mode:'red-white-mixture',validMask}),actual);
 const inverted=quantize(rgb,{mode:'red-white-mixture',validMask,invert:true});
 assert.equal(inverted.mask[0],0);assert.equal(inverted.probability[0],.5);
 for(let i=1;i<n*n;i++)assert.equal(inverted.mask[i],1-actual.mask[i]);
});

test('mixture palettes and residuals ignore missing interior pixels at their original positions',()=>{
 const rgb=new Uint8Array(3*n*n),validMask=new Uint8Array(n*n).fill(1);
 for(let y=0;y<n;y++)for(let x=0;x<n;x++){
  const i=y*n+x;rgb.set(x<32?[150,20,30]:[230,225,215],3*i);
  if(y>14&&y<34&&x>20&&x<20+y/2)validMask[i]=0;
 }
 const changed=rgb.slice();for(let i=0;i<n*n;i++)if(!validMask[i])changed.set([0,240,80],3*i);
 const options={mode:'red-white-mixture',validMask};
 assert.deepEqual(quantize(changed,options),quantize(rgb,options));
});
