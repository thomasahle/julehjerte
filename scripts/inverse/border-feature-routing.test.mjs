import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {prepare,design} from '../../static/inverse/core/engine.js';
import {AUTOMATIC_PRESET} from '../../static/inverse/core/presets.js';
import {auditFeatureFidelity} from '../../static/inverse/core/feature-shapes.js';
import {renderExportedWeave} from './export-renderer.mjs';
import {captureFitFailure} from './diagnostics/fit-failure.mjs';

test('a missed border fragment cannot suppress useful interior routing or erase its final warning',async t=>{
  const fixture=JSON.parse(await fs.readFile(new URL('./fixtures/rabbit-border-routing.json',import.meta.url)));
  const mask=new Uint8Array(fixture.resolution**2);let offset=0;
  for(const [value,length] of fixture.runs){assert.ok(value===0||value===1);assert.ok(Number.isInteger(length)&&length>0);mask.fill(value,offset,offset+length);offset+=length;}
  assert.equal(offset,mask.length);assert.equal(createHash('sha256').update(mask).digest('hex'),fixture.maskSha256);
  const cfg={...AUTOMATIC_PRESET,timeLimit:10,trials:0},target=prepare({type:'mask',resolution:fixture.resolution,mask:mask.slice()},cfg).target;
  const before=target.sourceImage.mask.slice(),probability=target.sourceImage.probability.slice(),answer=await design(target,cfg);
  const woven=await renderExportedWeave(answer.files['cut_geometry.json'],fixture.resolution);
  const error=woven.mask.reduce((sum,v,i)=>sum+Number(v!==mask[i]),0)/mask.length;
  try{
  assert.ok(error<.02,`A 61-pixel border fragment must not destroy the motif: ${error}`);
  assert.equal(answer.report.validation.passed,true);assert.equal(answer.report.manufacturing.status,'pass');
  const initialization=answer.report.solver.earlyFeatureInitialization;
  assert.equal(initialization.interiorOnly,true);assert.equal(initialization.stage,'before-recovery');assert.equal(initialization.scheduled,1);
  assert.equal(initialization.proposal.featureChange.passed,true);assert.ok(initialization.proposal.error<initialization.previousError);
  const features=auditFeatureFidelity(target.sourceImage,woven.mask,answer.report.settings);
  assert.equal(features.passed,false,'Routing must not silently delete the unresolved source feature.');
  assert.ok(features.missing.some(f=>f.areaMm2===3.8125&&f.centerMm[1]>98));
  assert.equal(answer.report.templateChecksPassed,false,'A better usable candidate is not a fully checked reconstruction.');
  assert.deepEqual(target.sourceImage.mask,before);assert.deepEqual(target.sourceImage.probability,probability);
  }catch(failure){t.diagnostic(await captureFitFailure({answer,source:target.sourceImage,error,maximum:.02,context:{assertion:failure.message}}));throw failure;}
});
