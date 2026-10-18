import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {prepare} from '../../static/inverse/core/engine.js';
import {settings} from '../../static/inverse/core/settings.js';
import {loadSolutionJSON,solutionJSON} from '../../static/inverse/core/graph.js';
import {sampleWeave,validate} from '../../static/inverse/core/validate.js';
import {materialAudit,verifiedPaperSettings} from '../../static/inverse/core/material.js';
import {loadBoundaryKernel} from '../../static/inverse/core/direct/native.js';
import {repairRejectedRouting} from '../../static/inverse/core/direct/rejected-routing.js';
import {renderExportedWeave} from './export-renderer.mjs';

const saved=JSON.parse(await fs.readFile(new URL('./fixtures/tree-repair-handoff.json',import.meta.url)));
const image=JSON.parse(await fs.readFile(saved.maskFixture));
const cfg=settings({...saved.configuration,timeLimit:10,trials:0});
function input(){
  const mask=new Uint8Array(image.resolution**2);
  for(const [start,length] of image.maskRuns)mask.fill(1,start,start+length);
  assert.equal(createHash('sha256').update(mask).digest('hex'),saved.maskSha256);
  return prepare({type:'mask',mask,resolution:image.resolution},cfg).target;
}

test('a provisional traced image can earn final fidelity through clearance repair',async()=>{
  await loadBoundaryKernel();
  const target=input(),source=structuredClone(target.sourceImage),proposal=loadSolutionJSON(saved.geometry),before=JSON.stringify(solutionJSON(proposal));
  const mask=sampleWeave(proposal,source.resolution),initialError=mask.reduce((sum,v,i)=>sum+Number(v!==source.mask[i]),0)/mask.length;
  assert.ok(initialError>cfg.maxImageError&&initialError<.05);
  const repaired=repairRejectedRouting(proposal,target,cfg);
  assert.ok(repaired.solution,JSON.stringify(repaired.report));
  assert.equal(repaired.report.initialImageError,initialError);
  assert.equal(repaired.report.maximumInitialImageError,.05);
  assert.equal(repaired.report.initialFeatures.passed,true);
  assert.ok(repaired.report.steps>0);
  assert.ok(repaired.report.imageError<=cfg.maxImageError);
  assert.equal(repaired.report.features.passed,true);
  const checked=verifiedPaperSettings(repaired.solution,cfg);
  assert.equal(validate(repaired.solution,checked,{finalGeometry:true}).passed,true);
  assert.equal(materialAudit(repaired.solution,checked).passed,true);
  const rendered=await renderExportedWeave(solutionJSON(repaired.solution),source.resolution);
  assert.ok(rendered.mask.reduce((sum,v,i)=>sum+Number(v!==source.mask[i]),0)/mask.length<=cfg.maxImageError);
  assert.deepEqual(target.sourceImage,source);
  assert.equal(JSON.stringify(solutionJSON(proposal)),before);
});

test('provisional repair still rejects unrelated artwork and respects a stricter image limit',()=>{
  const target=input(),proposal=loadSolutionJSON(saved.geometry),before=structuredClone(target.sourceImage);
  const strict=repairRejectedRouting(proposal,target,{...cfg,maxImageError:.01});
  assert.equal(strict.solution,null);assert.equal(strict.report.maximumInitialImageError,.02);
  assert.equal(strict.report.reason,'initial_image');assert.equal(strict.report.steps,undefined);
  const inverted={...target,sourceImage:{...target.sourceImage,mask:target.sourceImage.mask.map(v=>1-v)}};
  const rejected=repairRejectedRouting(proposal,inverted,cfg);
  assert.equal(rejected.solution,null);assert.equal(rejected.report.reason,'initial_image');
  assert.equal(rejected.report.steps,undefined);
  assert.deepEqual(target.sourceImage,before);
});
