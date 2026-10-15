import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {prepare} from '../../static/inverse/core/engine.js';
import {settings} from '../../static/inverse/core/settings.js';
import {AUTOMATIC_PRESET} from '../../static/inverse/core/presets.js';
import {CurveGraph} from '../../static/inverse/core/direct/curves.js';
import {refineCurves} from '../../static/inverse/core/direct/refine.js';
import {resizeObjective} from '../../static/inverse/core/direct/image-objective.js';
import {imageFeatures} from '../../static/inverse/core/image-features.js';
import {auditFeatureFidelity} from '../../static/inverse/core/feature-shapes.js';
import {sampleWeave} from '../../static/inverse/core/validate.js';
import {loadNumericalKernel} from '../../static/inverse/core/numerical-kernel.js';
import {readHardPhoto} from './hard-photo-data.mjs';

test('ordinary and feature-preferred rollback cycles preserve the final block and both retained geometries',async()=>{
  const checkpoint=JSON.parse(await fs.readFile('scripts/inverse/fixtures/photographic-sampling-rollback.json'));
  const fixture=JSON.parse(await fs.readFile(checkpoint.sourceFixture));
  const catalogue=JSON.parse(await fs.readFile(fixture.sourceCatalogue));
  const photo=await readHardPhoto(catalogue.cases.find(c=>c.id===fixture.sourceCase));
  assert.equal(photo.fileSha256,fixture.sourceFileSha256);
  assert.equal(photo.rgbaSha256,fixture.decodedPixelsSha256);
  const cfg=settings({...AUTOMATIC_PRESET,trials:0,earlyStop:false,preferMatchingSheets:false});
  const shift=fixture.translations.vertical,quad=fixture.quad.map(p=>p.map((v,i)=>v+shift.offset[i]));
  const input=prepare({...photo,quad},cfg).target,source=input.sourceImage;
  assert.equal(createHash('sha256').update(source.mask).digest('hex'),shift.maskSha256);
  const {probability}=resizeObjective(source.probability,source.resolution,256),features=imageFeatures(source,cfg.width);
  const preferCheckpoint=(_candidate,solution)=>auditFeatureFidelity(source,sampleWeave(solution,source.resolution),cfg,features).passed;
  await loadNumericalKernel();
  // Saved clearance geometry isolates optimizer equivalence. The separate
  // photographic regressions still derive every starting curve from pixels.
  for(const preference of [null,preferCheckpoint])for(const steps of [650,750]){
    const run=skipRepeatedRollbacks=>refineCurves(new CurveGraph(checkpoint.paths,cfg.width),probability,256,checkpoint.phase,cfg,{input,steps,rate:.05,preferCheckpoint:preference,skipRepeatedRollbacks});
    const reference=run(false),fast=run(true);
    assert.ok(fast.skippedSteps>0);assert.equal(fast.computedSteps+fast.skippedSteps,steps);
    assert.equal(fast.history.at(-1).step,steps-1,'The non-repeated final block must still be evaluated.');
    assert.equal(reference.skippedSteps,0);assert.equal(reference.computedSteps,steps);
    assert.deepEqual(fast.points,reference.points);assert.equal(fast.error,reference.error);assert.equal(fast.score,reference.score);
    assert.equal(fast.geometryPassed,reference.geometryPassed);assert.equal(fast.paperPassed,reference.paperPassed);
    assert.deepEqual(fast.paperAlternative?.points,reference.paperAlternative?.points);
    assert.equal(fast.paperAlternative?.score,reference.paperAlternative?.score);
  }
});
