import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadSolutionJSON,solutionJSON} from '../../static/inverse/core/graph.js';
import {settings} from '../../static/inverse/core/settings.js';
import {sampleWeave,validate} from '../../static/inverse/core/validate.js';
import {materialAudit} from '../../static/inverse/core/material.js';
import {finalizeShared} from '../../static/inverse/core/direct/share.js';
import {matchingSummary} from '../../static/inverse/core/direct/matching.js';
import {symmetryReport} from '../../static/inverse/core/direct/symmetry.js';
import {maskDisagreement} from '../../static/inverse/core/direct/prefer-matching.js';
import {resize} from '../../static/inverse/core/direct/math.js';
import {renderExportedWeave} from './export-renderer.mjs';

const fixture=JSON.parse(await fs.readFile(new URL('./fixtures/free-border-hat.json',import.meta.url)));
const cfg=settings(fixture.settings);
function hat(){
  const solution=loadSolutionJSON(fixture.geometry),{resolution,maskRuns}=fixture.source,mask=new Uint8Array(resolution**2);
  let offset=0;for(let i=0;i<maskRuns.length;i+=2){mask.fill(maskRuns[i],offset,offset+maskRuns[i+1]);offset+=maskRuns[i+1];}
  assert.equal(offset,mask.length);
  solution.graph.target.sourceImage={resolution,mask,probability:Float64Array.from(mask)};
  return solution;
}
const hiddenLength=s=>s.graph.edges.filter(e=>!e.visible).reduce((sum,e)=>sum+e.curve.length(),0);

test('a symmetric free-border hat joins its invisible cuts without changing the template pairing',async()=>{
  const before=hat(),source=before.graph.target.sourceImage,after=finalizeShared(before,cfg);
  assert.equal(hiddenLength(before),0);
  assert.ok(hiddenLength(after)>200,'The long hat seams must become exact shared geometry.');
  assert.equal(matchingSummary(after).identical,true);
  assert.deepEqual(symmetryReport(after,cfg.symmetry).honoured,['transpose']);
  assert.equal(validate(after,cfg,{checkImage:false}).passed,true);
  assert.equal(materialAudit(after,cfg).passed,true);
  assert.ok(maskDisagreement(source,sampleWeave(after,source.resolution))<maskDisagreement(source,sampleWeave(before,source.resolution)));

  // Read the actual exported cubics with an independent rasterizer at 4× the
  // source resolution, so disappearance of subpixel seams is checked too.
  const resolution=source.resolution*4,target={mask:Uint8Array.from(resize(source.mask,source.resolution,resolution),v=>Number(v>.5))};
  const oldRaster=await renderExportedWeave(solutionJSON(before),resolution),newRaster=await renderExportedWeave(solutionJSON(after),resolution);
  // Binary thresholding hides faint hairlines and can flip a few antialiased
  // edge pixels. Fractional coverage measures those visible seams directly.
  const coverageError=r=>r.coverage.reduce((sum,v,i)=>sum+Math.abs(v-target.mask[i]),0)/target.mask.length;
  assert.ok(coverageError(newRaster)<coverageError(oldRaster));
  assert.equal(after.report.finalSharing.applied,true);
  assert.equal(finalizeShared(after,cfg),after,'Already shared spans must not be fitted and subdivided again.');
});

test('shared-cut cleanup preserves a narrow line when the input actually asks for it',()=>{
  const solution=hat(),resolution=512,mask=sampleWeave(solution,resolution);
  solution.graph.target.sourceImage={resolution,mask,probability:Float64Array.from(mask)};
  const after=finalizeShared(solution,cfg);
  assert.deepEqual(sampleWeave(after,resolution),mask);
});

test('shared-cut cleanup respects its budget and unsupported symmetry constraints',()=>{
  const solution=hat();
  assert.equal(finalizeShared(solution,cfg,{deadline:0}),solution);
  assert.equal(finalizeShared(solution,{...cfg,symmetry:{mirrorX:true}}),solution);
});
