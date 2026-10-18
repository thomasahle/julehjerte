import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {prepare} from '../../static/inverse/core/engine.js';
import {AUTOMATIC_PRESET} from '../../static/inverse/core/presets.js';
import {readHardPhoto} from './hard-photo-data.mjs';
import {hardPhotoTarget} from './hard-photo-target.mjs';

test('Mal benchmark carries missing photograph pixels into the fitting objective',()=>{
  const n=64,rgba=new Uint8ClampedArray(n*n*4).fill(255);
  for(let y=0;y<n;y++)for(let x=0;x<n/2;x++)rgba.fill(0,4*(y*n+x),4*(y*n+x)+3);
  const imported=prepare({type:'pixels',rgba,imageWidth:n,imageHeight:n,quad:[[0,0],[128,0],[128,128],[0,128]]},AUTOMATIC_PRESET);
  const target=hardPhotoTarget(imported,'mask',AUTOMATIC_PRESET);
  assert.equal(target.sourceImage.validMask.reduce((sum,v)=>sum+v,0),32*32);
  assert.deepEqual(target.sourceImage.weights,Float64Array.from(target.sourceImage.validMask));
  assert.notEqual(target.sourceImage.validMask,imported.preview.validMask);
});

test('photo and Mal tracks preserve the frozen binary import and distinguish explicit mixture probabilities',async()=>{
  const fixture=JSON.parse(await fs.readFile('scripts/inverse/fixtures/photographic-puppy-fit.json'));
  const catalogue=JSON.parse(await fs.readFile(fixture.sourceCatalogue));
  const photo=await readHardPhoto(catalogue.cases.find(c=>c.id===fixture.sourceCase));
  const imported=prepare({...photo,quad:fixture.quad},AUTOMATIC_PRESET);
  const before=imported.target.sourceImage.probability.slice();
  const hash=b=>createHash('sha256').update(b).digest('hex');
  assert.equal(hash(imported.preview.mask),fixture.maskSha256);
  assert.equal(hash(new Uint8Array(before.buffer)),fixture.probabilitySha256);
  assert.equal(hardPhotoTarget(imported,'photo',AUTOMATIC_PRESET),imported.target);
  const maskTarget=hardPhotoTarget(imported,'mask',AUTOMATIC_PRESET);
  assert.equal(hash(maskTarget.sourceImage.mask),fixture.maskSha256);
  assert.deepEqual(maskTarget.sourceImage.probability,Float32Array.from(imported.preview.mask));
  assert.deepEqual(maskTarget.sourceImage.probability,before,'Default Lab classification is already binary; do not attribute different fits to a changed objective');
  assert.deepEqual(imported.target.sourceImage.probability,before);
  assert.notEqual(maskTarget.sourceImage.mask,imported.preview.mask);
  assert.throws(()=>hardPhotoTarget(imported,'unknown',AUTOMATIC_PRESET),/--target/);
  assert.throws(()=>hardPhotoTarget(imported,'mask',{algorithm:'trace'}),/requires automatic or direct/);
  const mixture=prepare({...photo,quad:fixture.quad},{...AUTOMATIC_PRESET,mode:'red-white-mixture'});
  const mixedMask=hardPhotoTarget(mixture,'mask',AUTOMATIC_PRESET);
  assert.deepEqual(mixedMask.sourceImage.mask,mixture.preview.mask);
  assert.deepEqual(mixedMask.sourceImage.probability,Float32Array.from(mixture.preview.mask));
  assert.notDeepEqual(mixedMask.sourceImage.probability,mixture.target.sourceImage.probability,
    'Explicit mixture mode has a continuous objective which Mal discards when importing the mask');
});
