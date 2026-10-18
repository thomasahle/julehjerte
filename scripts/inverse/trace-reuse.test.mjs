import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {prepare} from '../../static/inverse/core/engine.js';
import {prepareMaskTrace,preprocessMask,sampleTarget} from '../../static/inverse/core/input.js';
import {readHardPhoto} from './hard-photo-data.mjs';

const fixture=JSON.parse(await fs.readFile('scripts/inverse/fixtures/trace-reuse.json'));
const hash=b=>createHash('sha256').update(b).digest('hex');
const shape=t=>JSON.stringify({width:t.width,phase:t.phase,curves:t.curves.map(c=>c.p),metadata:t.metadata});

for(const item of fixture.cases)test(`reusing ${item.id} pixel chains preserves frozen curves, sampling and cleanup`,async()=>{
  const photo=await readHardPhoto(item);
  assert.equal(photo.fileSha256,item.sourceFileSha256);assert.equal(photo.rgbaSha256,item.decodedPixelsSha256);
  const imported=prepare({...photo,quad:item.quad},item.importSettings),mask=imported.preview.mask,n=imported.preview.resolution;
  assert.equal(n,item.resolution);assert.equal(hash(mask),item.maskSha256);
  for(const {settings,outputs}of item.variants){
    const trace=prepareMaskTrace(mask,n,settings);
    for(const expected of outputs){
      const {target,sampled}=trace(expected.fitTolerance);
      assert.equal(hash(shape(target)),expected.shapeSha256);
      assert.equal(hash(sampled),expected.sampleSha256);
      assert.deepEqual(sampleTarget(target,n),sampled);
      const single=preprocessMask(mask,n,{...settings,fitTolerance:expected.fitTolerance});
      assert.equal(hash(shape(single)),expected.shapeSha256);
      // Routing subdivides and rewrites candidate geometry. It must not change
      // the chains or diagnostic metadata reused by the next tolerance trial.
      if(target.curves.length)target.curves[0].p[0][0]+=1;
      target.curves.length=0;
      target.metadata.preprocessing.border.changedPixels=-1;
      sampled.fill(2);
      const again=trace(expected.fitTolerance);
      assert.equal(hash(shape(again.target)),expected.shapeSha256);
      assert.equal(hash(again.sampled),expected.sampleSha256);
    }
  }
  assert.equal(hash(mask),item.maskSha256);
});
