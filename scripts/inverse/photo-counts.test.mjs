import test from 'node:test';
import assert from 'node:assert/strict';
import {catalogue,readPhoto} from './web-photo-data.mjs';
import {detectHeartCrops} from '../../static/inverse/core/crop.js';
import {prepare,design} from '../../static/inverse/core/engine.js';
import {AUTOMATIC_PRESET} from '../../static/inverse/core/presets.js';
import {auditFeatureFidelity} from '../../static/inverse/core/feature-shapes.js';
import {renderExportedWeave} from './export-renderer.mjs';

test('a photographed checker finds the simpler pair despite conflicting border counts',async()=>{
  const data=await catalogue(),entry=data.cases.find(c=>c.id==='bibel-checker-3');
  const photo=await readPhoto(data.photos.find(p=>p.id===entry.photo));
  // Start with the original photograph, not reference cuts, an edited mask,
  // known cut counts or saved overlap corners. Freeze the proposed crop before
  // fitting so the solver cannot improve its score by moving the photograph.
  const crop=detectHeartCrops(photo,{roi:entry.roi}).candidates[0];
  assert.ok(crop);
  const quad=structuredClone(crop.quad),cfg={...AUTOMATIC_PRESET,timeLimit:10,trials:0,earlyStop:false};
  const input={...photo,quad},prepared=prepare(input,cfg),source=prepared.target.sourceImage;
  const mask=source.mask.slice(),probability=source.probability.slice();
  const answer=await design(prepared.target,cfg),solver=answer.report.solver;
  assert.equal(solver.supportedBorderCounts,null,'Opposite borders disagree in this unedited photograph.');
  assert.deepEqual(answer.report.slits,{left:2,right:2});
  assert.equal(answer.report.templateChecksPassed,true);
  assert.equal(answer.report.validation.passed,true);
  assert.equal(answer.report.manufacturing.status,'pass');
  const simple=solver.candidates.find(c=>c.counts.every(n=>n===2));
  assert.equal(simple?.imagePassed,true);
  assert.equal(simple.featuresPassed,true);
  // Clearance comparison can now put the simpler pair first. Requiring a
  // completed, denser competitor would reject that improvement in scheduling.
  const exported=await renderExportedWeave(answer.files['cut_geometry.json'],source.resolution);
  const error=exported.mask.reduce((s,v,i)=>s+Number(v!==mask[i]),0)/mask.length;
  assert.ok(error<.0148,`Independent exported error ${error} must improve on the previous 0.014875.`);
  assert.equal(auditFeatureFidelity(source,exported.mask,answer.report.settings).passed,true);
  assert.deepEqual(source.mask,mask);
  assert.deepEqual(source.probability,probability);
  assert.deepEqual(input.quad,crop.quad);
});
