import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadSolutionJSON,solutionJSON} from '../../static/inverse/core/graph.js';
import {finalizeShared} from '../../static/inverse/core/direct/share.js';
import {sampleWeave,validate} from '../../static/inverse/core/validate.js';
import {materialAudit} from '../../static/inverse/core/material.js';
import {maskDisagreement} from '../../static/inverse/core/direct/prefer-matching.js';
import {renderExportedWeave} from './export-renderer.mjs';

test('sharing retains its best source checkpoint while exploring complementary alignments',async()=>{
  const fixture=JSON.parse(await fs.readFile(new URL('./fixtures/sharing-best-checkpoint.json',import.meta.url)));
  const {resolution,maskRuns}=fixture.source,mask=new Uint8Array(resolution**2);
  let offset=0;for(let i=0;i<maskRuns.length;i+=2){mask.fill(maskRuns[i],offset,offset+maskRuns[i+1]);offset+=maskRuns[i+1];}
  assert.equal(offset,mask.length);
  const source={resolution,mask},savedMask=mask.slice(),before=loadSolutionJSON(fixture.geometry),saved=solutionJSON(before);
  before.graph.target.sourceImage=source;
  const after=finalizeShared(before,fixture.settings),report=after.report.finalSharing;
  assert.equal(report.applied,true);
  assert.equal(report.selection.reason,'best_source_checkpoint');
  assert.ok(report.unselected.length,'The old final candidate must be retained in the diagnostics, not returned.');
  const explored=[...report.accepted,...report.unselected];
  const minimum=Math.min(report.errorBefore,...explored.map(r=>r.sourceErrorAfter));
  const selectedError=maskDisagreement(source,sampleWeave(after,resolution));
  assert.equal(selectedError,minimum);
  assert.equal(report.errorAfter,minimum);
  assert.ok(report.selection.lastError>minimum);
  assert.equal(report.accepted.at(-1).sourceErrorAfter,minimum);

  // Strictly rejecting every source-error increase would miss later gains.
  // Keep that exploration, and prefer the later alignment when scores tie.
  const temporary=report.accepted.findIndex(r=>r.sourceErrorAfter>r.sourceErrorBefore);
  assert.ok(temporary>=0);
  assert.ok(report.accepted.slice(temporary+1).some(r=>r.sourceErrorAfter<report.accepted[temporary].sourceErrorBefore));
  assert.equal(report.accepted.length,explored.findLastIndex(r=>r.sourceErrorAfter===minimum)+1);
  assert.equal(validate(after,fixture.settings,{checkImage:false}).passed,true);
  assert.equal(materialAudit(after,fixture.settings).passed,true);
  assert.deepEqual(solutionJSON(before),saved,'Exploration must retain the caller’s original curves.');
  assert.deepEqual(source.mask,savedMask);
  const original=await renderExportedWeave(saved,resolution),selected=await renderExportedWeave(solutionJSON(after),resolution);
  assert.ok(maskDisagreement(source,selected.mask)<maskDisagreement(source,original.mask),'The independent exported curves must retain the source-image improvement.');
});
