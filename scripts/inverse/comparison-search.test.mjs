import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {simplerComparisonSeed} from '../../static/inverse/core/direct/counts.js';
import {prepare,design} from '../../static/inverse/core/engine.js';
import {AUTOMATIC_PRESET} from '../../static/inverse/core/presets.js';
import {auditFeatureFidelity} from '../../static/inverse/core/feature-shapes.js';
import {mismatch} from '../../static/inverse/core/direct/grid.js';
import {readHardPhoto} from './hard-photo-data.mjs';
import {renderExportedWeave} from './export-renderer.mjs';

const seed=(counts,error,phase=-1)=>({model:{counts},error,phase});

test('a verified maple layout retains its later competitive three-cut comparison',()=>{
  // Observed coarse scores: a raw 0.015 image-error window alone would lose
  // the three-cut start. These scores schedule work; they do not certify it.
  const coarse=[seed([4,4],.0596),seed([5,5],.0634),seed([3,5],.0699),seed([5,5],.0705,1),seed([3,5],.0760,1),seed([3,3],.0787)];
  const remaining=coarse.slice(3),snapshot=remaining.slice();
  assert.equal(simplerComparisonSeed(remaining,coarse,[[4,4]]),coarse[5]);
  assert.equal(simplerComparisonSeed(remaining,coarse,[[4,4],[3,3]]),null);
  assert.deepEqual(remaining,snapshot,'Selection must not discard the other starts.');
});

test('verified dense grids do not extend search with elaborate or poor simpler seeds',()=>{
  const coarse=[seed([7,7],.0838),seed([7,8],.0873,1),seed([7,8],.0952),seed([8,8],.1008),seed([6,6],.1444,1)];
  assert.equal(simplerComparisonSeed(coarse.slice(3),coarse,[[7,7]]),null);
  assert.equal(simplerComparisonSeed(coarse,coarse,[]),null,'An unverified fit cannot authorize this stopping policy.');
  assert.equal(simplerComparisonSeed([seed([1,1],NaN)],[seed([1,1],Infinity)],[[7,7]]),null);
});

test('fresh maple fitting finds the simpler routing and preserves its photographic detail',async()=>{
  const fixture=JSON.parse(await fs.readFile('scripts/inverse/fixtures/maple-comparison.json'));
  const catalogue=JSON.parse(await fs.readFile(fixture.sourceCatalogue)),photo=await readHardPhoto(catalogue.source);
  const cfg={...AUTOMATIC_PRESET,timeLimit:180,trials:0,earlyStop:false},crop=prepare({...photo,quad:fixture.quad},cfg);
  assert.equal(createHash('sha256').update(crop.preview.mask).digest('hex'),fixture.maskSha256);
  const input=prepare({type:'mask',mask:crop.preview.mask.slice(),resolution:400},cfg).target;
  const answer=await design(input,cfg),replay=await renderExportedWeave(answer.files['cut_geometry.json'],400);
  assert.equal(answer.report.templateChecksPassed,true);
  assert.deepEqual(answer.report.slits,{left:3,right:3});
  // The simpler routing may now enter the initial shortlist. Its outcome is
  // required; spending time on the formerly necessary late retry is not.
  assert.ok(mismatch(replay.mask,crop.preview.mask)<.012);
  assert.equal(auditFeatureFidelity(input.sourceImage,replay.mask,answer.report.settings).passed,true);
  assert.deepEqual(input.sourceImage.mask,crop.preview.mask);
});
