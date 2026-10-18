import test from 'node:test';
import assert from 'node:assert/strict';
import {heartPhoto} from './crop-fixture.mjs';
import {makeFields} from '../../static/inverse/locator/fields.js';
import {orientFields} from '../../static/inverse/locator/orientation.js';
import {createMotifDetector,detectMotif} from '../../static/inverse/locator/locator.js';
import {detectHeartCrops,supportedCropOutline} from '../../static/inverse/core/crop.js';

const expected=[[190,80],[275,155],[190,230],[105,155]];
const error=(a,b)=>Math.max(...a.map((p,i)=>Math.hypot(p[0]-b[i][0],p[1]-b[i][1])));
function turnedPhoto(degrees,options={}){
  const radians=degrees*Math.PI/180,c=Math.cos(radians),s=Math.sin(radians);
  const turn=([x,y])=>[190+c*(x-190)-s*(y-160),160+s*(x-190)+c*(y-160)];
  const q=expected.map(turn),[x,y]=q[0];
  return{input:heartPhoto({...options,hearts:[[x,y,q[1][0]-x,q[1][1]-y,q[3][0]-x,q[3][1]-y]]}),quad:q};
}

test('rotating classified fields preserves pixel-centre coordinates and source data',()=>{
  const input=heartPhoto(),f=makeFields({width:input.imageWidth,height:input.imageHeight,data:input.rgba}),before=structuredClone(f);
  const rotated=orientFields(f,90);
  assert.deepEqual([rotated.fields.w,rotated.fields.h],[f.h,f.w]);
  for(const name of ['mask','paper','red','white','chroma','r','g','b','pd','rd','wd'])for(let y=0;y<f.w;y++)for(let x=0;x<f.h;x++){
    const p=rotated.toSource([x,y]);assert.deepEqual(p,[y,f.h-1-x]);
    assert.equal(rotated.fields[name][y*f.h+x],f[name][(f.h-1-x)*f.w+y]);
  }
  assert.deepEqual(f,before);assert.throws(()=>orientFields(f,NaN),/finite/);
});

test('reusable detector leaves the upright fit unchanged and rotates fields without changing palette',()=>{
  const {input,quad}=turnedPhoto(65,{colours:['#0068bb','#ce1471'],background:'#fff'}),image={width:input.imageWidth,height:input.imageHeight,data:input.rgba};
  const detect=createMotifDetector(image,{palette:'adaptive',maxSize:650}),first=detect(),reference=detectMotif(image,{palette:'adaptive',maxSize:650});
  assert.deepEqual(first.quad,reference.quad);assert.equal(first.status,reference.status);
  const found=detect(-65);assert.ok(supportedCropOutline(found));assert.ok(error(found.quad.map(p=>p.map(v=>v+.5)),quad)<5);
  assert.deepEqual(detect().quad,first.quad,'Trying a pose must not move the cached source fields.');
  assert.throws(()=>detect(Infinity),/finite/);
});

for(const angle of [27,45,65,90,135,180,207,225,270,315])test(`automatic crop recovers a heart rotated ${angle} degrees`,()=>{
  const {input,quad}=turnedPhoto(angle),original=input.rgba.slice(),result=detectHeartCrops(input),candidate=result.candidates[0];
  assert.ok(candidate);assert.ok(error(candidate.quad,quad)<6);
  assert.deepEqual(candidate.provenance.sourceDimensions,[input.imageWidth,input.imageHeight]);
  assert.equal(candidate.outline.length,4);assert.ok(supportedCropOutline(candidate.locator));
  assert.deepEqual(input.rgba,original);
});

test('a rough selection keeps source coordinates when the selected heart is sideways',()=>{
  const input=heartPhoto({width:720,hearts:[[190,80,85,75,-85,75],[600,160,-75,85,-75,-85]]}),roi=[410,25,665,290];
  const result=detectHeartCrops(input,{roi}),candidate=result.candidates[0];
  assert.ok(candidate);assert.ok(error(candidate.quad,[[600,160],[525,245],[450,160],[525,75]])<6);
  assert.deepEqual(candidate.provenance.roughRegion,roi);
  assert.deepEqual(candidate.provenance.sourceDimensions,[720,320]);
});

test('an unsupported paper lobe cannot certify an orientation',()=>{
  const e={lowerEdgeSupport:[1,1],lobeOutlineSupport:[1,0],capColourLoss:[0,1]};
  assert.equal(supportedCropOutline({quad:expected,evidence:e}),false);
  assert.equal(supportedCropOutline({quad:null,evidence:e}),false);
});
