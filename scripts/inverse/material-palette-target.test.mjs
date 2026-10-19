import test from 'node:test';
import assert from 'node:assert/strict';
import {calibratedMaterial,rectifyMaterialPalette} from './learning/material-palette-target.mjs';
import {rectifyWithCoverage} from '../../static/inverse/core/input.js';

const colors=[[.7,.06,.05],[.8,.8,.75]],calibration={applied:true,mode:'illumination',model:'nonnegative-color-mixture',colors};
test('palette mixture retains fractional coverage and illumination across an A/B exchange',()=>{
  const rgb=[],expected=[];
  for(const light of [.1,.3,.6,1])for(let i=0;i<=30;i++){
    const p=i/30;rgb.push(...colors[0].map((a,k)=>255*light*(a*(1-p)+colors[1][k]*p)));expected.push(p);
  }
  const actual=calibratedMaterial(rgb,calibration),exchanged=calibratedMaterial(rgb,{...calibration,colors:[...colors].reverse()});
  for(let i=0;i<actual.length;i++){
    assert.ok(Math.abs(actual[i]-expected[i])<1e-7);assert.ok(Math.abs(exchanged[i]-(1-expected[i]))<1e-7);
  }
  assert.equal(calibratedMaterial([0,0,0],calibration)[0],.5);
});
test('grey papers use affine brightness while invalid palettes are rejected',()=>{
  const gray={applied:true,mode:'illumination',model:'affine-color-segment',colors:[[.1,.1,.1],[.9,.9,.9]]};
  assert.deepEqual([...calibratedMaterial([25.5,25.5,25.5,127.5,127.5,127.5,229.5,229.5,229.5],gray)],[0,.5,1]);
  assert.throws(()=>calibratedMaterial([0,0,0],{...gray,model:'nonnegative-color-mixture'}),/conditioning/);
  assert.throws(()=>calibratedMaterial([0,0,0],{...gray,colors:[[.5,.5,.5],[.5,.5,.5]]}),/separated/);
  for(const bad of [-1,256,NaN])assert.throws(()=>calibratedMaterial([bad,0,0],calibration),/Invalid/);
});
test('original RGB supplies fine edges and production coverage excludes missing pixels',()=>{
  const n=64,rgba=new Uint8ClampedArray(n*n*4);
  for(let y=0;y<n;y++)for(let x=0;x<n;x++)rgba.set([...colors[x%2].map(v=>255*v),255],4*(y*n+x));
  const source={rgba,imageWidth:n,imageHeight:n};
  const full=rectifyMaterialPalette(source,calibration,null,n);
  for(let y=0;y<n;y++)for(let x=0;x<n;x++)assert.equal(full.mask[y*n+x],x%2);
  const quad=[[-16,0],[48,0],[48,64],[-16,64]],cropped=rectifyMaterialPalette(source,calibration,quad,n);
  const reference=rectifyWithCoverage(rgba,n,n,n,quad);
  assert.deepEqual(cropped.rgb,reference.rgb);assert.deepEqual(cropped.validMask,reference.validMask);
  for(let i=0;i<n*n;i++)if(!cropped.validMask[i]){assert.equal(cropped.mask[i],0);assert.equal(cropped.probability[i],.5);}
});
