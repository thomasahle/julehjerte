import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {prepare,design} from '../../static/inverse/core/engine.js';
import {AUTOMATIC_PRESET} from '../../static/inverse/core/presets.js';
import {hardPhotoTarget} from './hard-photo-target.mjs';
import {renderExportedWeave} from './export-renderer.mjs';

test('the photographed gold heart retains its shape through sparse routing and refinement',async()=>{
  const fixture=JSON.parse(await fs.readFile('scripts/inverse/fixtures/photographic-gold-routing.json'));
  const n=fixture.resolution,mask=new Uint8Array(n*n);
  for(const [start,length] of fixture.maskRuns)mask.fill(1,start,start+length);
  assert.equal(createHash('sha256').update(mask).digest('hex'),fixture.maskSha256);
  // The mask comes from an annotation-assisted crop. This regression covers
  // only the main fitter, with no saved route, template or preferred trace.
  const raw={...AUTOMATIC_PRESET,width:fixture.width,timeLimit:10,trials:0,earlyStop:false};
  const input=hardPhotoTarget(prepare({type:'mask',mask,resolution:n},raw),'mask',raw),source=input.sourceImage;
  assert.deepEqual(source.mask,mask);const probability=source.probability.slice();
  const answer=await design(input,raw),report=answer.report,recovery=report.solver.featureRecovery;
  // Stronger checkpoint repair can now finish the first sparse trace. Earlier
  // fitting needed a smoother trace after exhaustion; neither route may spend
  // the image-recovery allowance on unnecessary dense connector graphs.
  assert.equal(recovery.accepted,true);
  assert.ok(recovery.attempts.every(a=>a.neighbors<=8),'Recover this input without densification.');
  assert.ok(recovery.refinement.steps>160,'Polish the selected route against the original mask.');
  assert.ok(report.templateChecksPassed&&report.validation.passed);
  assert.equal(report.manufacturing.status,'pass');
  assert.equal(report.imageFidelity.features.missing.length,0);
  const replay=await renderExportedWeave(answer.files['cut_geometry.json'],n);
  const error=replay.mask.reduce((sum,v,i)=>sum+Number(v!==mask[i]),0)/mask.length;
  assert.ok(error<.012,`The independently rendered angel must retain its shape: ${error}`);
  assert.ok(error<fixture.baselineIndependentImageError);
  assert.deepEqual(source.mask,mask);assert.deepEqual(source.probability,probability);
});
