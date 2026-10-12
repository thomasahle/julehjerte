import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {readHardPhoto,hardPhotoCatalogCases} from './hard-photo-data.mjs';

const collage=JSON.parse(await fs.readFile(new URL('./hard-photo-cases.json',import.meta.url))),photos=JSON.parse(await fs.readFile(new URL('./photo-cases.json',import.meta.url)));

test('the original 31 complete hard hearts have reproducible committed photograph inputs',async()=>{
  assert.equal(collage.cases.length,40);assert.equal(photos.cases.length,7);
  assert.equal(collage.cases.filter(c=>c.cropStatus==='visually_reviewed').length+photos.cases.length,31);
  assert.equal(collage.cases.filter(c=>c.cropStatus==='incomplete').length,15);
  assert.equal(collage.cases.filter(c=>c.cropStatus==='obscured').length,1);
  for(const spec of[collage.source,...photos.cases]){
    assert.match(spec.file,/^scripts\/inverse\/fixtures\/hard-photos\/[a-z0-9-]+\.png$/);
    assert.match(spec.sha256,/^[a-f0-9]{64}$/);assert.match(spec.decodedPixelsSha256,/^[a-f0-9]{64}$/);
    const image=await readHardPhoto(spec);assert.equal(image.fileSha256,spec.sha256);assert.equal(image.rgbaSha256,spec.decodedPixelsSha256);
  }
  assert.equal(collage.source.decodedPixelsSha256,'dffdcaf0934dd144a6a501a724832245e78bb0729614a1a9497a70b0554bed97','PNG decoding must reproduce the original historical RGBA capture exactly');
});

test('the frozen loader refuses mismatched file or decoded-pixel evidence',async()=>{
  await assert.rejects(readHardPhoto({...photos.cases[0],sha256:'0'.repeat(64)}),/Source photograph changed/);
  await assert.rejects(readHardPhoto({...photos.cases[0],decodedPixelsSha256:'0'.repeat(64)}),/Decoded source pixels changed/);
});

test('an alternate photo catalogue preserves source identity and requires no fitted corners',async()=>{
  const [entry]=hardPhotoCatalogCases({source:collage.source,cases:[{id:'rough-selection',roi:[10,20,130,160],file:'wrong-photo.png',sha256:'0'.repeat(64)}]});
  assert.equal(entry.file,collage.source.file);assert.equal(entry.sha256,collage.source.sha256);
  assert.equal(entry.quad,undefined);assert.equal(entry.cropStatus,'needs_review');
  assert.deepEqual(entry.roi,[10,20,130,160]);
  await readHardPhoto(entry);
  for(const entries of [[{id:'../escape',roi:[0,0,100,100]}],[{id:'one',roi:[0,0,100,100]},{id:'one',roi:[0,0,100,100]}],[{id:'one',roi:[0,0,0,100]}]])assert.throws(()=>hardPhotoCatalogCases({source:collage.source,cases:entries}));
  assert.throws(()=>hardPhotoCatalogCases({source:{file:'unknown.png'},cases:[{id:'one',roi:[0,0,100,100]}]}),/SHA-256/);
});
