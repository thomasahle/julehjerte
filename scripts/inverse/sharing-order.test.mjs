import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadSolutionJSON,solutionJSON} from '../../static/inverse/core/graph.js';
import {settings} from '../../static/inverse/core/settings.js';
import {easeMetrics,sampleWeave,validate} from '../../static/inverse/core/validate.js';
import {materialAudit} from '../../static/inverse/core/material.js';
import {finalizeFittedSolution} from '../../static/inverse/core/direct/finalize.js';
import {finalizeShared} from '../../static/inverse/core/direct/share.js';
import {finalizePrimitives} from '../../static/inverse/core/direct/primitive-selection.js';
import {finalizeSharedSimplification} from '../../static/inverse/core/direct/shared-simplification.js';
import {maskDisagreement} from '../../static/inverse/core/direct/prefer-matching.js';
import {resize} from '../../static/inverse/core/direct/math.js';
import {renderExportedWeave} from './export-renderer.mjs';

const fixture=JSON.parse(await fs.readFile(new URL('./fixtures/photographic-frame-seam.json',import.meta.url)));
const cfg=settings(fixture.settings),hiddenLength=s=>s.graph.edges.filter(e=>!e.visible).reduce((sum,e)=>sum+e.curve.length(),0);
function frame(){
  const solution=loadSolutionJSON(fixture.geometry),{resolution,maskRuns}=fixture.source,mask=new Uint8Array(resolution**2);
  let offset=0;for(let i=0;i<maskRuns.length;i+=2){mask.fill(maskRuns[i],offset,offset+maskRuns[i+1]);offset+=maskRuns[i+1];}
  assert.equal(offset,mask.length);solution.graph.target.sourceImage={resolution,mask};return solution;
}

test('common finalization aligns a photographed seam made repairable by straight-span selection',async()=>{
  const before=frame(),source=before.graph.target.sourceImage,saved=solutionJSON(before),mask=source.mask.slice();
  const premature=finalizeShared(before,cfg);
  assert.equal(premature.report.finalSharing.applied,false,'The unreduced curves must reproduce the original rejection.');
  assert.ok(premature.report.finalSharing.rejected.some(r=>r.reason==='higher_resolution_error'));
  const historical=finalizeSharedSimplification(finalizePrimitives(premature,cfg),cfg);
  const after=finalizeFittedSolution(before,cfg,{searchMatching:false});
  assert.equal(after.report.finalPrimitiveSelection.applied,true);
  assert.equal(after.report.finalSharing.applied,true);
  assert.ok(hiddenLength(after)>hiddenLength(before)+20,'The fourth frame connector must become exactly shared.');
  assert.ok(maskDisagreement(source,sampleWeave(after,source.resolution))<maskDisagreement(source,sampleWeave(before,source.resolution)));
  assert.equal(validate(after,cfg,{checkImage:false}).passed,true);assert.equal(materialAudit(after,cfg).passed,true);
  assert.ok(easeMetrics(after,cfg).minimumRadius>=easeMetrics(before,cfg).minimumRadius);
  assert.deepEqual(source.mask,mask);assert.deepEqual(solutionJSON(before),saved);
  const n=source.resolution*4,a=await renderExportedWeave(solutionJSON(historical),n),b=await renderExportedWeave(solutionJSON(after),n);
  const target=resize(mask,source.resolution,n),error=r=>r.coverage.reduce((sum,v,i)=>sum+Math.abs(v-Number(target[i]>.5)),0)/target.length;
  assert.ok(error(b)<error(a),'Independent exported coverage must improve on the historical cleanup order.');
  // This interior portion of the lower-right connector has no motif boundary.
  // Fractional coverage detects the seam even when binary sampling misses it.
  const seam=r=>{let total=0;for(let y=Math.ceil(.67*n);y<.78*n;y++)for(let x=Math.ceil(.67*n);x<.78*n;x++)total+=1-r.coverage[y*n+x];return total;};
  assert.ok(seam(a)>10);assert.equal(seam(b),0);
});

test('finalization retains a narrow frame line when the source requests it',()=>{
  const before=frame(),resolution=768,mask=sampleWeave(before,resolution);
  before.graph.target.sourceImage={resolution,mask};
  const after=finalizeFittedSolution(before,cfg,{searchMatching:false});
  assert.deepEqual(sampleWeave(after,resolution),mask);
  assert.ok(hiddenLength(after)<hiddenLength(before)+1,'A real line must not become an invisible connector.');
  assert.equal(validate(after,cfg,{checkImage:false}).passed,true);
});

test('finalization leaves no cleanup work running beyond an exhausted reserve',()=>{
  const before=frame(),saved=solutionJSON(before);
  const after=finalizeFittedSolution(before,cfg,{searchMatching:false,startedAt:performance.now()-cfg.timeLimit*1000});
  assert.equal(after,before);assert.deepEqual(solutionJSON(after),saved);
  assert.equal(after.report.finalSharing,undefined);assert.equal(after.report.finalPrimitiveSelection,undefined);
});
