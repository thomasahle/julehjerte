import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {imageFeatures} from '../../static/inverse/core/image-features.js';
import {stableInteriorFeatures} from '../../static/inverse/core/feature-enclosures.js';
import {auditFeatureFidelity,auditFeatureFidelityChange} from '../../static/inverse/core/feature-shapes.js';

const cfg={width:100,nominalWidth:2.5};
function rectangle(mask,n,x0,y0,x1,y1,value){
  for(let y=Math.round(y0*n/100);y<Math.round(y1*n/100);y++)for(let x=Math.round(x0*n/100);x<Math.round(x1*n/100);x++)mask[y*n+x]=value;
}

test('large isolated motifs have stable enclosures in both colours and at different image scales',()=>{
  for(const n of [100,200,400])for(const value of [0,1]){
    const mask=new Uint8Array(n*n).fill(1-value);rectangle(mask,n,40,40,50,50,value);
    const source={mask,resolution:n},before=mask.slice(),features=imageFeatures(source);
    assert.equal(features.length,1);assert.deepEqual(stableInteriorFeatures(source,features,cfg),features);
    // A nearby same-colour island may merge under dilation without making
    // the entire group boundary-connected.
    rectangle(mask,n,50.5,40,60.5,50,value);
    const neighbours=imageFeatures(source);assert.ok(neighbours.length>=1);
    assert.deepEqual(stableInteriorFeatures(source,neighbours,cfg),neighbours);
    assert.deepEqual(stableInteriorFeatures({mask:before,resolution:n},features,cfg),features);
  }
});

test('checkerboard point contacts and narrow classification gaps do not impose enclosure constraints',()=>{
  for(const n of [100,200,400])for(const value of [0,1]){
    const mask=new Uint8Array(n*n).fill(1-value);
    rectangle(mask,n,0,0,40,40,value);rectangle(mask,n,40,40,60,60,value);rectangle(mask,n,60,60,100,100,value);
    const source={mask,resolution:n},features=imageFeatures(source);assert.equal(features.length,1);
    assert.deepEqual(stableInteriorFeatures(source,features,cfg),[]);
    // The middle tile is still ambiguous with a thin raster gap at its corner.
    rectangle(mask,n,40,40,60,60,1-value);
    rectangle(mask,n,40+100/n,40+100/n,60-100/n,60-100/n,value);
    const separated=imageFeatures(source);assert.equal(separated.length,1);
    assert.deepEqual(stableInteriorFeatures(source,separated,cfg),[]);
  }
});

test('cached support follows source-pixel and observation changes without modifying either',()=>{
  const n=200,mask=new Uint8Array(n*n),weights=new Float64Array(n*n).fill(1);rectangle(mask,n,40,40,55,55,1);
  const source={mask,resolution:n,weights},features=imageFeatures(source);
  assert.equal(stableInteriorFeatures(source,features,cfg).length,1);
  const original=mask.slice();rectangle(mask,n,45,0,46,40,1);
  assert.equal(stableInteriorFeatures(source,features,cfg).length,0,'A later source channel must invalidate cached confidence.');
  mask.set(original);assert.equal(stableInteriorFeatures(source,features,cfg).length,1);
  weights[80*n+79]=0;
  assert.equal(stableInteriorFeatures(source,features,cfg).length,0,'Unknown pixels touching the grown motif cannot be treated as an enclosing band.');
  weights.fill(1);assert.equal(stableInteriorFeatures(source,features,cfg).length,1);
  source.mask=mask.slice();assert.equal(stableInteriorFeatures(source,features,cfg).length,1);
  assert.deepEqual(mask,original);assert.ok(weights.every(w=>w===1));
});

test('the frozen stacked-heart mask protects all four hearts while leaving its checker junction ambiguous',async()=>{
  const fixture=JSON.parse(await fs.readFile('scripts/inverse/fixtures/stacked-hearts-corner-mask.json'));
  const mask=new Uint8Array(fixture.resolution**2);let offset=0,value=fixture.first;
  for(const run of fixture.runs){mask.fill(value,offset,offset+run);offset+=run;value^=1;}
  const source={mask,resolution:fixture.resolution},before=mask.slice(),features=imageFeatures(source);
  assert.equal(features.length,5);
  assert.deepEqual(stableInteriorFeatures(source,features,cfg),[0,1,3,4].map(i=>features[i]));
  assert.deepEqual(mask,before);
});

test('cleanup preserves a previously enclosed large motif without forbidding recovery of an imperfect input',()=>{
  const n=200,mask=new Uint8Array(n*n);rectangle(mask,n,40,40,55,55,1);
  const source={mask,resolution:n},channel=mask.slice();rectangle(channel,n,45,0,46,40,1);
  assert.equal(auditFeatureFidelityChange(source,mask,channel,cfg).passed,false);
  assert.equal(auditFeatureFidelityChange(source,channel,channel,cfg).passed,true);
  assert.equal(auditFeatureFidelityChange(source,channel,mask,cfg).passed,true);
  const checker=new Uint8Array(n*n);rectangle(checker,n,0,0,40,40,1);rectangle(checker,n,40,40,60,60,1);
  const joined=checker.slice();joined[80*n+79]=1;
  assert.equal(auditFeatureFidelityChange({mask:checker,resolution:n},checker,joined,cfg).passed,true,'An ambiguous checker contact is not a new lost enclosure.');
});

test('a fresh candidate cannot certify an already opened large source enclosure',()=>{
  for(const n of [100,200,400])for(const value of [0,1]){
    const mask=new Uint8Array(n*n).fill(1-value);rectangle(mask,n,40,40,55,55,value);
    const source={mask,resolution:n},before=mask.slice(),channel=mask.slice();rectangle(channel,n,45,0,46,40,value);
    const audit=auditFeatureFidelity(source,channel,cfg);
    assert.equal(audit.passed,false);assert.equal(audit.missing.length,1);
    assert.equal(audit.missing[0].retainedFraction,1);assert.equal(audit.missing[0].enclosureLost,true);
    assert.equal(auditFeatureFidelity(source,mask,cfg).passed,true);
    const checker=new Uint8Array(n*n).fill(1-value);
    rectangle(checker,n,0,0,40,40,value);rectangle(checker,n,40,40,60,60,value);
    const joined=checker.slice();joined[Math.round(.4*n)*n+Math.round(.4*n)-1]=value;
    assert.equal(auditFeatureFidelity({mask:checker,resolution:n},joined,cfg).passed,true);
    assert.deepEqual(source.mask,before);
  }
});
