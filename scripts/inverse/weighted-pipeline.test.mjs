import test from 'node:test';
import assert from 'node:assert/strict';
import {prepare,design,inputImageError} from '../../static/inverse/core/engine.js';
import {referenceError,sourceWeights,initializationMask} from '../../static/inverse/core/image-reference.js';
import {imageFeatures,auditImageFeatures} from '../../static/inverse/core/image-features.js';
import {orbitObjective,symmetryOrbit} from '../../static/inverse/core/direct/symmetry.js';
import {symmetryEvidence} from '../../static/inverse/core/direct/matching.js';
import {alternatingRuns,initializeGrid} from '../../static/inverse/core/direct/initialize.js';
import {countHypotheses,initializeCounts,borderEvidence} from '../../static/inverse/core/direct/counts.js';
import {gridModel,gridMask,mismatch} from '../../static/inverse/core/direct/grid.js';
import {settings} from '../../static/inverse/core/settings.js';
import {loadSolutionJSON} from '../../static/inverse/core/graph.js';
import {renderExportedWeave} from './export-renderer.mjs';
import {maskDisagreement} from '../../static/inverse/core/direct/prefer-matching.js';

const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-12,`${a} vs ${b}`);
const n=64,model=gridModel([2,2]);model.z.fill(0);
const mask=gridMask(model,n,1),weights=Float64Array.from(mask,(_,i)=>i%n>=8&&i%n<56&&Math.floor(i/n)>=8&&Math.floor(i/n)<56?1:0);

test('binary preparation preserves source pixels and owns its mask and weight arrays',()=>{
  const input={type:'mask',resolution:n,mask:mask.slice(),weights:weights.slice()};
  const prepared=prepare(input,{algorithm:'auto',resolution:32});
  assert.equal(prepared.target.sourceImage.resolution,n);
  assert.deepEqual(prepared.preview.mask,mask);assert.deepEqual(prepared.preview.weights,weights);
  input.mask.fill(0);input.weights.fill(0);
  assert.deepEqual(prepared.target.sourceImage.mask,mask);assert.deepEqual(prepared.target.sourceImage.weights,weights);
  const allOne=prepare({type:'mask',resolution:n,mask,weights:new Float64Array(n*n).fill(1)},{algorithm:'direct'});
  assert.equal(allOne.target.sourceImage.weights,undefined);
  assert.deepEqual(prepare({type:'mask',resolution:n,mask},{algorithm:'direct',invert:true}).preview.mask,Uint8Array.from(mask,v=>1-v));
});

test('malformed mask inputs and empty weighted images fail before solving',()=>{
  for(const input of[
    {type:'mask',resolution:64,mask:new Uint8Array(12)},
    {type:'mask',resolution:64,mask:new Uint8Array(4096).fill(2)},
    {type:'mask',resolution:64,mask,weights:new Float64Array(4096)},
    {type:'mask',resolution:64,mask,weights,seedCells:0},
  ])assert.throws(()=>prepare(input,{algorithm:'auto'}),/mask|weight|grid/i);
});

test('reference metrics distinguish weighted error, whole-image difference and allowed edits',()=>{
  const source={resolution:2,mask:Uint8Array.of(0,1,1,0),weights:Float64Array.of(1,.5,0,1),validMask:Uint8Array.of(1,1,1,0)};
  const woven=Uint8Array.of(0,0,0,1),error=referenceError(source,woven);
  near(error.mismatchFraction,1/3);near(error.wholeMismatchFraction,2/3);
  assert.equal(error.weightMass,1.5);assert.equal(error.protectedMismatchFraction,0);assert.equal(error.editableChangeFraction,1);
  assert.deepEqual(sourceWeights(source),Float64Array.of(1,.5,0,0));
  near(maskDisagreement(source,woven),1/3);
});

test('the weighted identical-sheet lower bound agrees with exhaustive symmetric pictures',()=>{
  for(const importance of [[1,1,.25,0],[0,1,0,1],[.2,.4,.6,.8]]){
    const source={resolution:2,mask:Uint8Array.of(0,1,0,1),weights:Float64Array.from(importance)};
    const candidates=Array.from({length:8},(_,i)=>Uint8Array.of(i&1,(i>>1)&1,(i>>1)&1,(i>>2)&1));
    near(symmetryEvidence(source).minimumIdenticalImageError,Math.min(...candidates.map(m=>referenceError(source,m).mismatchFraction)));
  }
});

test('requested symmetries copy observations across free pixels without averaging their colours',()=>{
  const probability=Float64Array.of(0,1,0,0),importance=Float64Array.of(1,1,0,1),orbit=symmetryOrbit({transpose:true});
  const value=orbitObjective(probability,2,orbit,importance);
  assert.deepEqual(value.probability,Float64Array.of(0,1,1,0));assert.deepEqual(value.weights,Float64Array.of(1,.5,.5,1));
  probability[2]=1;
  assert.deepEqual(orbitObjective(probability,2,orbit,importance),value);
});

test('free colours cannot affect supporting grid proposals or weighted initialization',()=>{
  const changed=Uint8Array.from(mask,(v,i)=>weights[i]?v:1-v),source={resolution:n,mask,weights},other={...source,mask:changed};
  assert.deepEqual(initializationMask(source),initializationMask(other));
  const options={weights,resolution:32,scoreResolution:n,rounds:4};
  assert.deepEqual(initializeGrid(mask,n,[2,2],1,options),initializeGrid(changed,n,[2,2],1,options));
  // Entirely free rows still have legal runs; their positions follow the prior.
  const row=Float64Array.of(1,0,1,0,0,1,0,1),zero=new Float64Array(row.length);
  assert.deepEqual(alternatingRuns(row,2,0,[.25,.75],{pixelWeights:zero}),alternatingRuns(Float64Array.from(row,v=>1-v),2,0,[.25,.75],{pixelWeights:zero}));
});

test('every count seed is ranked against the protected target, including checker-guided candidates',()=>{
  const source={resolution:n,mask,weights},guide=Float64Array.from(initializationMask(source)),prob=Float64Array.from(mask),evidence=borderEvidence(guide,n),cfg=settings({width:100,trials:0});
  const options=countHypotheses({prob,n,cfg,evidence,weights,maximumCount:3});
  const result=initializeCounts({options,fullProb:prob,resolution:n,prob,n,evidence,weights,fullWeights:weights,guideProb:guide},{rounds:3});
  for(const seed of result.seeds)near(seed.error,mismatch(gridMask(seed.model,n,seed.phase,seed.floor),prob,weights));
  assert.equal(result.report.fullyInitialized,options.length);
});

test('ignored pixels neither invent features nor make a protected feature disappear',()=>{
  const resolution=40,source={resolution,mask:new Uint8Array(resolution**2),weights:new Float64Array(resolution**2)};
  for(let y=8;y<32;y++)for(let x=8;x<32;x++)source.weights[y*resolution+x]=1;
  // The left blob crosses the free-region edge. Its observed core still counts.
  for(let y=12;y<24;y++)for(let x=0;x<16;x++)source.mask[y*resolution+x]=1;
  const features=imageFeatures(source),black=features.filter(f=>f.value===1);
  assert.equal(black.length,1);assert.equal(black[0].pixels.length,8*12);
  const changed=Uint8Array.from(source.mask,(v,i)=>source.weights[i]?v:1-v);
  assert.deepEqual(imageFeatures({...source,mask:changed}),features);
  assert.equal(auditImageFeatures(source,changed).passed,true);
  for(const i of black[0].pixels)changed[i]=0;
  assert.equal(auditImageFeatures(source,changed).passed,false);
});

test('a uniform soft weight keeps the same substantial features as full observation',()=>{
  const resolution=32,mask=new Uint8Array(resolution**2);
  for(let y=10;y<13;y++)for(let x=10;x<13;x++)mask[y*resolution+x]=1;
  const source={resolution,mask},before=imageFeatures(source),after=imageFeatures({...source,weights:new Float64Array(mask.length).fill(.25)});
  assert.ok(before.some(f=>f.value===1));assert.deepEqual(after.map(f=>f.pixels),before.map(f=>f.pixels));
});

test('a weighted mask completes the public solve with measured protected and whole-image errors',async()=>{
  const cfg={algorithm:'auto',timeLimit:10,trials:0,width:100,roundHidden:false};
  const p=prepare({type:'mask',resolution:n,mask,weights},cfg),answer=await design(p.target,cfg);
  assert.equal(answer.report.validation.passed,true);assert.equal(answer.report.manufacturing.status,'pass');
  const exported=await renderExportedWeave(answer.files['cut_geometry.json'],n),error=referenceError(p.target.sourceImage,exported.mask);
  assert.ok(error.mismatchFraction<.01,`Protected disagreement ${error.mismatchFraction}`);
  assert.ok(answer.report.imageError.weightMass>0);assert.deepEqual(answer.comparison.weights,weights);
  const solution=loadSolutionJSON(answer.files['cut_geometry.json']);solution.graph.target.sourceImage=p.target.sourceImage;
  assert.deepEqual(inputImageError(solution),answer.report.imageError);
});
