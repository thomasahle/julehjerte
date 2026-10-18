import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {prepare,design} from '../../static/inverse/core/engine.js';
import {AUTOMATIC_PRESET} from '../../static/inverse/core/presets.js';
import {loadSolutionJSON} from '../../static/inverse/core/graph.js';
import {matchingSummary} from '../../static/inverse/core/direct/matching.js';
import {renderExportedWeave} from './export-renderer.mjs';
import {captureFitFailure} from './diagnostics/fit-failure.mjs';

const fixture=JSON.parse(await fs.readFile(new URL('./fixtures/matching/free-hat-mask.json',import.meta.url)));
function expand(runs,Type){
  const out=new Type(fixture.resolution**2);let at=0;
  for(let i=0;i<runs.length;i+=2){out.fill(runs[i],at,at+runs[i+1]);at+=runs[i+1];}
  assert.equal(at,out.length);return out;
}

test('the matching preference can change cut count and colour phase without forcing or editing the mask',async t=>{
  const mask=expand(fixture.maskRuns,Uint8Array),weights=expand(fixture.weightRuns,Float64Array),before=mask.slice();
  assert.equal(createHash('sha256').update(mask).digest('hex'),fixture.maskSha256);
  const cfg={...AUTOMATIC_PRESET,width:100,minWidth:2,cutError:.25,minRadius:.8,kerf:0,printShrinkPercent:.2,materialResolution:360,timeLimit:10,trials:0,earlyStop:false,preferMatchingSheets:true,symmetry:{}};
  const prepared=prepare({type:'mask',mask,weights,resolution:fixture.resolution},cfg);
  const result=await design(prepared.target,cfg),report=result.report,matching=report.solver.matchingPreference;
  try{
  assert.equal(report.templateChecksPassed,true);
  assert.equal(report.manufacturing.status,'pass');
  assert.deepEqual(report.symmetry.requested,[]);
  assert.equal(matching.status,'matched');assert.equal(matching.identical,true);
  assert.deepEqual(matching.baselineCounts,[2,2]);assert.equal(matching.baselinePhase,1);
  assert.ok(matching.attempts.filter(a=>!a.refined).every(a=>!a.withinAllowance),'Copying either independent sheet must still fail this fixture.');
  const found=matching.attempts.find(a=>a.proposal==='matching-grid'&&a.withinAllowance&&a.geometryPassed&&a.paperPassed);
  assert.ok(found);assert.deepEqual(found.counts,[3,3]);assert.equal(found.phase,1);
  assert.deepEqual(report.solver.selectedCounts,[3,3]);
  assert.deepEqual(report.slits,{left:3,right:3});
  const exported=loadSolutionJSON(result.files['cut_geometry.json']);
  assert.equal(matchingSummary(exported).identical,true);
  assert.equal(exported.graph.target.phase,0);
  assert.ok(matching.additionalImageError<=.01);
  const replay=await renderExportedWeave(result.files['cut_geometry.json'],fixture.resolution);
  let error=0,total=0;
  for(let i=0;i<mask.length;i++){total+=weights[i];error+=weights[i]*(replay.mask[i]!==mask[i]);}
  assert.ok(error/total<.007,`Exported motif disagreement: ${error/total}`);
  assert.ok(error/total<=matching.maximumMatchingImageError,'Independent export must retain the allowance.');
  t.diagnostic(JSON.stringify({independentError:error/total,matchingSeconds:matching.seconds,continuationDeferredForMatching:report.solver.cleanupBudget.continuationDeferredForMatching??false,attempts:matching.attempts}));
  assert.deepEqual(mask,before);assert.deepEqual(prepared.target.sourceImage.mask,before);
  assert.deepEqual(prepared.target.sourceImage.weights,weights);
  }catch(error){t.diagnostic(await captureFitFailure({answer:result,source:prepared.target.sourceImage,context:{case:'matching-free-hat',assertion:error.message}}));throw error;}
});
