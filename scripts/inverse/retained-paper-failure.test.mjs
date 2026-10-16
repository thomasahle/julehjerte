import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {prepare,finish} from '../../static/inverse/core/engine.js';
import {AUTOMATIC_PRESET} from '../../static/inverse/core/presets.js';
import {CurveGraph} from '../../static/inverse/core/direct/curves.js';
import {solutionJSON} from '../../static/inverse/core/graph.js';
import {refineCurves} from '../../static/inverse/core/direct/refine.js';
import {resizeObjective} from '../../static/inverse/core/direct/image-objective.js';
import {loadBoundaryKernel} from '../../static/inverse/core/direct/native.js';
import {materialAudit,verifiedPaperSettings} from '../../static/inverse/core/material.js';
import {finalMaterialAudit} from '../../static/inverse/core/geometric-material.js';
import {sampleWeave,validate} from '../../static/inverse/core/validate.js';
import {auditFeatureFidelity} from '../../static/inverse/core/feature-shapes.js';
import {readHardPhoto} from './hard-photo-data.mjs';
import {hardPhotoTarget} from './hard-photo-target.mjs';
import {renderExportedWeave} from './export-renderer.mjs';

const hash=b=>createHash('sha256').update(b).digest('hex');
test('a paper-failed Viking block recovers without accepting its invalid retained alternative',{timeout:30000},async()=>{
  const fixture=JSON.parse(await fs.readFile('scripts/inverse/fixtures/viking-initial-refinement.json'));
  const sources=JSON.parse(await fs.readFile('scripts/inverse/fixtures/photographic-short-budget-fits.json'));
  const source=sources.cases.find(c=>c.sourceCase===fixture.sourceCase),catalogue=JSON.parse(await fs.readFile(sources.sourceCatalogue));
  const photo=await readHardPhoto({...catalogue.source,...catalogue.cases.find(c=>c.id===fixture.sourceCase)});
  const cfg={...AUTOMATIC_PRESET,timeLimit:10,trials:0,earlyStop:false};
  const input=hardPhotoTarget(prepare({...photo,quad:source.quad},cfg),'mask',cfg);
  assert.equal(hash(input.sourceImage.mask),source.maskSha256);
  const originalMask=input.sourceImage.mask.slice(),graph=new CurveGraph(fixture.paths,fixture.settings.width);
  const objective=resizeObjective(input.sourceImage.probability,input.sourceImage.resolution,fixture.resolution);
  await loadBoundaryKernel();
  const options={...fixture.options,input,steps:fixture.steps,deadline:Infinity};
  const before=refineCurves(graph,objective.probability,fixture.resolution,fixture.phase,fixture.settings,options);
  const fitted=refineCurves(graph,objective.probability,fixture.resolution,fixture.phase,fixture.settings,{...options,retryPaperSeparation:true,paperSeparationErrorThreshold:fixture.settings.maxImageError});
  // The same initial grid and step budget must improve without weakening
  // validation. The retry changes only the same-slit separation force after
  // a full paper-failed block; it preserves the safe rollback coordinates.
  assert.deepEqual(fitted.paperSeparationRetry,{step:200,previousLocalFactor:8,localFactor:3});
  const alreadyAccurate=refineCurves(graph,objective.probability,fixture.resolution,fixture.phase,fixture.settings,{...options,retryPaperSeparation:true,paperSeparationErrorThreshold:.05});
  assert.equal(alreadyAccurate.paperSeparationRetry,null);
  assert.deepEqual(alreadyAccurate.points,before.points,'Do not change a trajectory whose safe fit already meets the requested target.');
  assert.equal(fitted.geometryPassed,true);assert.equal(fitted.paperPassed,true);
  const incumbent=graph.solution(fitted.points,fixture.phase,input);
  incumbent.report={algorithm:'direct-bezier',paperVerification:fitted.paperVerification};
  const verified=verifiedPaperSettings(incumbent,fixture.settings);
  assert.equal(finalMaterialAudit(incumbent,verified).status,'pass');
  const exported=finish(incumbent,{...fixture.settings,trials:0},()=>{},{refine:false});
  assert.equal(exported.report.templateChecksPassed,true);
  const n=input.sourceImage.resolution,replay=await renderExportedWeave(exported.files['cut_geometry.json'],n);
  const incumbentError=replay.mask.reduce((sum,v,i)=>sum+Number(v!==originalMask[i]),0)/originalMask.length;
  const beforeRendered=await renderExportedWeave(solutionJSON(graph.solution(before.points,fixture.phase,input)),n);
  const beforeError=beforeRendered.mask.reduce((sum,v,i)=>sum+Number(v!==originalMask[i]),0)/originalMask.length;
  assert.ok(incumbentError<.03);
  assert.ok(incumbentError<beforeError-.004,'Fixed-work recovery must improve the independent render by at least 0.4 percentage points.');
  assert.equal(auditFeatureFidelity(input.sourceImage,replay.mask,fixture.settings).passed,true);
  const alternative=before.rejectedPaperAlternative;
  assert.ok(alternative,'A geometry-valid coarse-paper failure must remain available for a finer audit.');
  assert.equal(alternative.paper.status,'fail');
  assert.equal(alternative.paperPassed,false,'Retention must not certify the paper.');
  const solution=graph.solution(alternative.points,fixture.phase,input);
  assert.equal(validate(solution,fixture.settings,{checkImage:false,finalGeometry:true}).passed,true);
  assert.equal(materialAudit(solution,fixture.settings).status,'fail');
  for(const resolution of [700,1000])assert.equal(materialAudit(solution,{...fixture.settings,materialResolution:resolution}).status,'fail');
  const woven=sampleWeave(solution,n),error=woven.reduce((sum,v,i)=>sum+Number(v!==originalMask[i]),0)/woven.length;
  assert.ok(error<beforeError,'The retained checkpoint is tempting because its image error beats the earlier safe incumbent.');
  assert.equal(auditFeatureFidelity(input.sourceImage,woven,fixture.settings).passed,true);
  // An earlier or incorrect certificate must not bypass the actual final
  // audit. Export rechecks these coordinates even when metadata claims pass.
  solution.report={algorithm:'direct-bezier',paperVerification:{requestedResolution:fixture.settings.materialResolution,initialStatus:'fail',resolution:700,status:'pass'}};
  const rejected=finish(solution,{...fixture.settings,trials:0},()=>{},{refine:false});
  assert.equal(rejected.report.settings.materialResolution,700);
  assert.equal(rejected.report.templateChecksPassed,false);
  assert.deepEqual(input.sourceImage.mask,originalMask);
});
