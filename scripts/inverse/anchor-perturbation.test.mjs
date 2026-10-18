import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createCanvas,loadImage} from 'canvas';
import {prepare,design} from '../../static/inverse/core/engine.js';
import {AUTOMATIC_PRESET} from '../../static/inverse/core/presets.js';
import {renderExportedWeave} from './export-renderer.mjs';

// A changed color estimate perturbs fewer than 1% of the source pixels. Crop
// coordinates and geometry are not supplied to the solver; only the frozen mask.
test('a small photographic mask perturbation recovers after an intrinsic trace loop',async()=>{
  const fixture=JSON.parse(await fs.readFile('scripts/inverse/fixtures/photographic-anchor-perturbation.json'));
  const bytes=await fs.readFile(fixture.maskFile),hash=value=>createHash('sha256').update(value).digest('hex');
  assert.equal(hash(bytes),fixture.imageSha256);
  const image=await loadImage(bytes),n=fixture.resolution,context=createCanvas(n,n).getContext('2d');
  assert.equal(image.width,n);assert.equal(image.height,n);context.drawImage(image,0,0);
  const rgba=context.getImageData(0,0,n,n).data,mask=Uint8Array.from({length:n*n},(_,i)=>Number(rgba[4*i]<128));
  assert.equal(hash(mask),fixture.maskSha256);
  const cfg={...AUTOMATIC_PRESET,timeLimit:10,trials:0,earlyStop:false},prepared=prepare({type:'mask',mask,resolution:n},cfg);
  const before=prepared.target.sourceImage.mask.slice(),probability=prepared.target.sourceImage.probability.slice();
  const answer=await design(prepared.target,cfg),recovery=answer.report.solver.featureRecovery;
  assert.equal(recovery.seedIntersectionRetry,true);
  const crossing=recovery.attempts.find(a=>a.solver?.connectorIndependentIssue?.type==='visible_edge_self_intersection');
  assert.ok(crossing);assert.equal(crossing.solver.validationPreflight,true);assert.deepEqual(crossing.solver.history,[]);
  assert.ok(recovery.attempts.some(a=>a.smoothRadius===.75&&a.solver.status==='solved'));
  assert.equal(answer.report.templateChecksPassed,true);assert.equal(answer.report.validation.passed,true);
  assert.equal(answer.report.manufacturing.status,'pass');assert.deepEqual(answer.report.slits,{left:4,right:4});
  assert.equal(answer.report.imageFidelity.features.missing.length,0);
  const replay=await renderExportedWeave(answer.files['cut_geometry.json'],n);
  const error=replay.mask.reduce((sum,v,i)=>sum+Number(v!==mask[i]),0)/mask.length;
  assert.ok(error<.025,`Independent exported disagreement ${error}; the failed baseline was ${fixture.baseline.maskError}.`);
  assert.deepEqual(prepared.target.sourceImage.mask,before);assert.deepEqual(prepared.target.sourceImage.probability,probability);
});
