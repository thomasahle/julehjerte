import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {prepare,design} from '../../static/inverse/core/engine.js';
import {AUTOMATIC_PRESET} from '../../static/inverse/core/presets.js';
import {hardPhotoTarget} from './hard-photo-target.mjs';
import {renderExportedWeave} from './export-renderer.mjs';

test('alternative photographic traces get a turn before densifying an exhausted sparse graph',async()=>{
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
  assert.ok(recovery.deferredDenseGraphs>0,'The ordinary dense graph must remain available as a fallback.');
  assert.equal(recovery.attempts[0].solver.termination,'candidate_graph_exhausted');
  assert.ok(recovery.attempts.every(a=>a.neighbors<=8),'A later sparse trace solves this input without densification.');
  assert.ok(recovery.attempts.some(a=>a.solver?.connectorIndependentIssue?.type==='visible_edge_self_intersection'));
  assert.equal(recovery.selectedTrace.smoothRadius,.75);
  assert.ok(recovery.refinement.steps>160,'Refine the smoother route against the original mask.');
  assert.ok(report.templateChecksPassed&&report.validation.passed);
  assert.equal(report.manufacturing.status,'pass');
  assert.equal(report.imageFidelity.features.missing.length,0);
  const replay=await renderExportedWeave(answer.files['cut_geometry.json'],n);
  const error=replay.mask.reduce((sum,v,i)=>sum+Number(v!==mask[i]),0)/mask.length;
  assert.ok(error<.012,`The independently rendered angel must retain its shape: ${error}`);
  assert.ok(error<fixture.baselineIndependentImageError);
  assert.deepEqual(source.mask,mask);assert.deepEqual(source.probability,probability);
});
