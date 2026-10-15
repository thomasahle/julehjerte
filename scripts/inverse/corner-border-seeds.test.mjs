import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {cornerBorderSeeds} from '../../static/inverse/core/corner-border-seeds.js';
import {borderTransitions,stabilizeBorder} from '../../static/inverse/core/border.js';
import {imageFeatures,auditImageFeatures} from '../../static/inverse/core/image-features.js';
import {featureComponentMetrics} from '../../static/inverse/core/feature-shapes.js';
import {design} from '../../static/inverse/core/engine.js';
import {preprocessMask} from '../../static/inverse/core/input.js';
import {renderExportedWeave} from './export-renderer.mjs';

const rotate=(mask,n)=>Uint8Array.from(mask,(_,i)=>mask[(n-1-i%n)*n+Math.floor(i/n)]);
const checker=n=>Uint8Array.from({length:n*n},(_,i)=>(Math.floor(i%n*4/n)+Math.floor(Math.floor(i/n)*4/n))%2);

test('a small corner perturbation has a clean routing proposal in every orientation and colour phase',()=>{
  for(const n of [100,200,400])for(const invert of [0,1]){
    let clean=checker(n).map(v=>v^invert),mask=clean.slice();const d=Math.round(.04*n);
    for(let y=n-d;y<n;y++)for(let x=n-d;x<n;x++)mask[y*n+x]^=1;
    for(let turn=0;turn<4;turn++){
      const saved=mask.slice(),seeds=cornerBorderSeeds(mask,n,100);
      assert.ok(seeds.some(seed=>seed.mask.every((v,i)=>v===clean[i])),'Recover the known clean checker, not just balanced transition counts');
      for(const seed of seeds){
        assert.deepEqual(seed.metadata.transitionsAfter,[3,3,3,3]);
        assert.equal(seed.metadata.initializationOnly,true);
        assert.ok(seed.metadata.maximumCornerSpanMm<=5);
        const band=Math.ceil(.05*n);
        for(let y=band;y<n-band;y++)for(let x=band;x<n-band;x++)assert.equal(seed.mask[y*n+x],saved[y*n+x]);
      }
      assert.deepEqual(mask,saved);mask=rotate(mask,n);clean=rotate(clean,n);
    }
  }
});

test('consistent borders, whole strips and corner regions extending inland are not erased',()=>{
  const n=100,clean=checker(n);
  assert.deepEqual(cornerBorderSeeds(clean,n,100),[]);
  const large=clean.slice();for(let y=90;y<n;y++)for(let x=90;x<n;x++)large[y*n+x]^=1;
  assert.deepEqual(cornerBorderSeeds(large,n,100),[],'A 10 mm corner region is outside the bounded proposal');
  const strip=Uint8Array.from({length:n*n},(_,i)=>Number(i%n>=97));
  assert.deepEqual(cornerBorderSeeds(strip,n,100),[],'A thin strip crossing the whole sheet is not a corner fragment');
  for(const minimum of [0,-1,NaN,Infinity])assert.throws(()=>cornerBorderSeeds(clean,n,100,minimum));
  assert.throws(()=>cornerBorderSeeds(clean,n-1,100));
  assert.throws(()=>cornerBorderSeeds(clean,n,0));
});

test('balanced opposite corner fragments are not silently reinterpreted',()=>{
  const n=200,clean=checker(n),mask=clean.slice();
  for(let y=0;y<8;y++)for(let x=0;x<8;x++)mask[y*n+x]^=1;
  for(let y=n-8;y<n;y++)for(let x=n-8;x<n;x++)mask[y*n+x]^=1;
  // Equal extra counts on opposite corners are not evidence of an impossible
  // endpoint model. Never silently remove a consistent interpretation.
  assert.deepEqual(borderTransitions(mask,n),[4,4,4,4]);
  assert.deepEqual(cornerBorderSeeds(mask,n,100),[]);
});

test('the frozen stacked-hearts mask recovers three endpoints per side while retaining every interior region',async()=>{
  const fixture=JSON.parse(await fs.readFile('scripts/inverse/fixtures/stacked-hearts-corner-mask.json'));
  const n=fixture.resolution,mask=new Uint8Array(n*n);let offset=0,value=fixture.first;
  for(const run of fixture.runs){mask.fill(value,offset,offset+run);offset+=run;value^=1;}
  assert.equal(offset,mask.length);assert.equal(createHash('sha256').update(mask).digest('hex'),fixture.maskSha256);
  assert.deepEqual(borderTransitions(mask,n),[9,4,6,3]);
  assert.deepEqual(stabilizeBorder(mask,n,100,1).metadata.transitionsAfter,[3,4,4,3]);
  const saved=mask.slice(),source={mask,resolution:n},features=imageFeatures(source),seeds=cornerBorderSeeds(mask,n,100);
  assert.equal(features.length,5);assert.ok(seeds.length>0);
  const seed=seeds[0];assert.deepEqual(seed.metadata.transitionsAfter,[3,3,3,3]);
  assert.ok(seed.metadata.changeFraction<.005,'The provisional seed must remain close to the ORIGINAL estimated mask');
  assert.equal(auditImageFeatures(source,seed.mask,100,features).passed,true);
  assert.ok(featureComponentMetrics(source,seed.mask,100,features).every(f=>f.touchesBorder===false&&f.retention===1));
  assert.deepEqual(mask,saved);
  const inverted=cornerBorderSeeds(mask.map(v=>v^1),n,100);
  assert.equal(inverted.length,seeds.length);
  seeds.forEach((seed,i)=>assert.deepEqual(inverted[i].mask,seed.mask.map(v=>v^1)));
});

test('a corner proposal routes fresh templates and scores them against the unchanged noisy mask',async()=>{
  const n=100,mask=checker(n);for(let y=96;y<n;y++)for(let x=96;x<n;x++)mask[y*n+x]^=1;
  const before=mask.slice(),seed=cornerBorderSeeds(mask,n,100)[0];
  const cfg={algorithm:'trace',fitTolerance:.35,smoothRadius:0,snapRadius:0,borderRadius:0,
    gridPortals:true,roundHidden:false,timeLimit:5,trials:0};
  const target=preprocessMask(seed.mask,n,cfg);
  target.sourceImage={mask:mask.slice(),resolution:n};
  const result=await design(target,cfg);
  assert.equal(result.report.templateChecksPassed,true);
  assert.deepEqual(result.report.slits,{left:3,right:3});
  assert.equal(result.report.imageError.mismatchPixels,16);
  const woven=await renderExportedWeave(result.files['cut_geometry.json'],n);
  assert.equal(woven.mask.reduce((sum,v,i)=>sum+Number(v!==mask[i]),0),16);
  assert.deepEqual(mask,before);assert.deepEqual(target.sourceImage.mask,before);
});
