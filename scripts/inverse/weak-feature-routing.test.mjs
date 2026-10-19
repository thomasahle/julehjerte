import {qualityBenchmark as test} from './quality-benchmark.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createCanvas,loadImage} from 'canvas';
import {prepare,design} from '../../static/inverse/core/engine.js';
import {AUTOMATIC_PRESET} from '../../static/inverse/core/presets.js';
import {auditFeatureFidelity} from '../../static/inverse/core/feature-shapes.js';
import {renderExportedWeave} from './export-renderer.mjs';
import {reviewMaterialSamples} from './photo-material-samples.mjs';
import {readHardPhoto} from './hard-photo-data.mjs';
import {hardPhotoTarget} from './hard-photo-target.mjs';

test('a speculative weak-region grid cannot hide the dense checker layout after clearance changes its ranking',async()=>{
  const fixture=JSON.parse(await fs.readFile('scripts/inverse/fixtures/fine-checker-clearance.json'));
  const catalogue=JSON.parse(await fs.readFile(fixture.sourceCatalogue));
  const photo=await readHardPhoto({...catalogue.cases.find(c=>c.id===fixture.sourceCase),...catalogue.source});
  assert.equal(photo.fileSha256,fixture.sourceFileSha256);assert.equal(photo.rgbaSha256,fixture.decodedPixelsSha256);
  const cfg=fixture.settings,imported=prepare({...photo,quad:fixture.quad},cfg),target=hardPhotoTarget(imported,'mask',cfg);
  const source=target.sourceImage,mask=source.mask.slice(),probability=source.probability.slice(),hash=b=>createHash('sha256').update(b).digest('hex');
  assert.equal(hash(mask),fixture.maskSha256);assert.equal(hash(new Uint8Array(probability.buffer)),fixture.fittingProbabilitySha256);
  const answer=await design(target,cfg),solver=answer.report.solver;
  // A slower machine can skip the speculative proposal. It must still return
  // a sound original layout; whenever the comparison runs, it must earn priority.
  if(solver.clearanceComparison?.preferred){
    const comparison=solver.clearanceComparison;
    assert.ok(comparison.alternativeClearanceError<comparison.initialClearanceError);
    assert.equal(comparison.alternativeGeometry,true);assert.equal(comparison.alternativePaper,'pass');
    assert.equal(comparison.alternativeColours,true);
  }
  assert.equal(answer.report.templateChecksPassed,true);assert.equal(answer.report.validation.passed,true);
  assert.equal(answer.report.manufacturing.status,'pass');assert.ok(solver.seconds<10);
  const woven=await renderExportedWeave(answer.files['cut_geometry.json'],source.resolution);
  const error=woven.mask.reduce((sum,v,i)=>sum+Number(v!==mask[i]),0)/mask.length;
  assert.ok(error<.03,`Dense checker disagreement ${error} must recover the former accepted fit.`);
  assert.equal(auditFeatureFidelity(source,woven.mask,answer.report.settings).passed,true);
  assert.deepEqual(source.mask,mask);assert.deepEqual(source.probability,probability);
});

test('a poor grid can earn a better route before losing a whole source region',async()=>{
  // This experimental photograph-derived mask isolates routing from cropping
  // and classification. It is not artwork or cutting-path ground truth.
  const fixture=JSON.parse(await fs.readFile('scripts/inverse/fixtures/faded-frame-mask.json'));
  const bytes=await fs.readFile(fixture.classification.file);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),fixture.classification.sha256);
  const image=await loadImage(bytes),n=fixture.classification.resolution;
  assert.equal(image.width,n);assert.equal(image.height,n);
  const canvas=createCanvas(n,n),ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);
  const rgba=ctx.getImageData(0,0,n,n).data,mask=Uint8Array.from({length:n*n},(_,i)=>Number(rgba[i*4]<128));
  const cfg={...AUTOMATIC_PRESET,timeLimit:10,trials:0},prepared=prepare({type:'mask',mask,resolution:n},cfg);
  const source=prepared.target.sourceImage,probability=source.probability.slice();
  const answer=await design(prepared.target,cfg),solver=answer.report.solver,initialization=solver.earlyFeatureInitialization;
  assert.equal(initialization.trigger,'weak-region');assert.equal(initialization.scheduled,1);
  assert.equal(initialization.stage,'after-recovery');
  assert.equal(solver.featureRecovery.budgetPolicy,'prioritize_routing');
  assert.ok(initialization.retention>.6,'The existing whole-region loss trigger did not detect this poor routing.');
  assert.ok(initialization.proposal.error<initialization.previousError);
  assert.equal(initialization.proposal.featuresPassed,true);
  assert.equal(solver.selectedInitialization,'feature-weighted-grid');
  assert.equal(answer.report.templateChecksPassed,true);assert.equal(answer.report.validation.passed,true);
  assert.equal(answer.report.manufacturing.status,'pass');assert.ok(solver.seconds<10);
  for(const scale of [1,2]){
    const resolution=n*scale,reference={resolution,mask:Uint8Array.from({length:resolution*resolution},(_,i)=>mask[Math.floor(Math.floor(i/resolution)/scale)*n+Math.floor((i%resolution)/scale)])};
    const woven=await renderExportedWeave(answer.files['cut_geometry.json'],resolution);
    const error=woven.mask.reduce((sum,v,i)=>sum+Number(v!==reference.mask[i]),0)/reference.mask.length;
    assert.ok(error<.02,`Independent ${resolution}-pixel disagreement ${error} must improve on the former 6.02%.`);
    assert.equal(auditFeatureFidelity(reference,woven.mask,answer.report.settings).passed,true);
    if(scale===1){
      // Load the sparse photo observations only after solving. They never
      // enter the initializer, cut counts, optimizer or acceptance checks.
      const samples=JSON.parse(await fs.readFile(fixture.review.annotationFile)).cases.find(c=>c.id==='bauble');
      const classified=reviewMaterialSamples(samples,{mask,resolution:n,quad:fixture.quad});
      const exported=reviewMaterialSamples(samples,{mask:woven.mask,resolution:n,quad:fixture.quad,phase:classified.phase});
      assert.equal(classified.correct,26);assert.equal(exported.correct,26);
    }
  }
  assert.deepEqual(source.mask,mask);assert.deepEqual(source.probability,probability);
});
