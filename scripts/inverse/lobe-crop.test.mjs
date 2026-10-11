import test from 'node:test';
import assert from 'node:assert/strict';
import {createCanvas} from 'canvas';
import {heartPhoto} from './crop-fixture.mjs';
import {detectHeartCrops} from '../../static/inverse/core/crop.js';
import {prepare,design} from '../../static/inverse/core/engine.js';
import {AUTOMATIC_PRESET} from '../../static/inverse/core/presets.js';
import {renderExportedWeave} from './export-renderer.mjs';

const expected=[[190,80],[275,155],[190,230],[105,155]];
const cornerError=quad=>Math.max(...quad.map((p,i)=>Math.hypot(p[0]-expected[i][0],p[1]-expected[i][1])));
const colours=['#ba151a','#f5f2ef'];
for(const depths of [[.66,.61],[.4,.7],[.75,.4]])for(const swapped of [false,true]){
 test(`unequal red/white lobes keep the known overlap: ${depths}, swapped ${swapped}`,()=>{
  const input=heartPhoto({lobeDepths:depths,colours:swapped?colours.toReversed():colours}),before=input.rgba.slice();
  const candidate=detectHeartCrops(input).candidates[0];
  assert.ok(candidate);assert.ok(cornerError(candidate.quad)<3,`Corner displacement: ${cornerError(candidate.quad)}`);
  assert.equal(candidate.locator.lobeRefinement?.accepted,true);
  assert.equal(candidate.needsReview,true);
  assert.deepEqual(input.rgba,before);
 });
}

test('well-explained semicircles retain the original fast crop model',()=>{
 const candidate=detectHeartCrops(heartPhoto({colours})).candidates[0];
 assert.ok(candidate);assert.ok(cornerError(candidate.quad)<3);
 assert.equal(candidate.locator.lobeRefinement,null);
});

test('lobe refinement survives exposure changes and half-size rasterization',()=>{
 const original=heartPhoto({colours,lobeDepths:[.75,.4]});
 for(const gain of [.9,1.1]){
  const input={...original,rgba:original.rgba.slice()};
  for(let i=0;i<input.rgba.length;i++)if(i%4<3)input.rgba[i]*=gain;
  const candidate=detectHeartCrops(input).candidates[0];
  assert.ok(candidate);assert.ok(cornerError(candidate.quad)<3);
 }
 const canvas=createCanvas(190,160),ctx=canvas.getContext('2d');ctx.drawImage(original.canvas,0,0,190,160);
 const candidate=detectHeartCrops({imageWidth:190,imageHeight:160,rgba:ctx.getImageData(0,0,190,160).data}).candidates[0];
 assert.ok(candidate);assert.ok(cornerError(candidate.quad.map(p=>p.map(v=>2*v)))<6);
});

for(const depths of [[.4,.7],[.75,.4]])test(`automatic crop through exported templates retains the known checker: ${depths}`,async()=>{
 const source=heartPhoto({colours,lobeDepths:depths}),crop=detectHeartCrops(source).candidates[0];
 const cfg={...AUTOMATIC_PRESET,timeLimit:10,trials:0},p=prepare({...source,quad:crop.quad},cfg),answer=await design(p.target,cfg);
 assert.equal(answer.report.templateChecksPassed,true);
 assert.equal(answer.report.manufacturing.status,'pass');
 assert.deepEqual(answer.report.slits,{left:3,right:3});
 assert.deepEqual(answer.report.input.sourceImage.cropCorners,crop.quad,'Fitting must leave the proposed crop fixed.');
 const replay=await renderExportedWeave(answer.files['cut_geometry.json'],p.preview.resolution),n=p.preview.resolution;
 let againstMask=0,againstArtwork=0;
 for(let y=0;y<n;y++)for(let x=0;x<n;x++){
  const i=y*n+x,wanted=(Math.floor(x/n*4)+Math.floor(y/n*4))%2===0?1:0;
  againstMask+=replay.mask[i]!==p.preview.mask[i];againstArtwork+=replay.mask[i]!==wanted;
 }
 assert.ok(againstMask/n**2<.02,`Photographic mask disagreement: ${againstMask/n**2}`);
 // A wrong crop can fit its own distorted target extremely well. The earlier
 // fixed-cap crops passed with 17% / 22% error against this known artwork.
 assert.ok(againstArtwork/n**2<.05,`Original-artwork disagreement: ${againstArtwork/n**2}`);
});
