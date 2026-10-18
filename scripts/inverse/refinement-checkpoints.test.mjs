import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {prepare,design} from '../../static/inverse/core/engine.js';
import {settings} from '../../static/inverse/core/settings.js';
import {AUTOMATIC_PRESET} from '../../static/inverse/core/presets.js';
import {CurveGraph} from '../../static/inverse/core/direct/curves.js';
import {refineCurves} from '../../static/inverse/core/direct/refine.js';
import {resize} from '../../static/inverse/core/direct/math.js';
import {materialAudit} from '../../static/inverse/core/material.js';
import {finalMaterialAudit} from '../../static/inverse/core/geometric-material.js';
import {validate} from '../../static/inverse/core/validate.js';
import {solutionJSON,loadSolutionJSON} from '../../static/inverse/core/graph.js';
import {mismatch} from '../../static/inverse/core/direct/grid.js';
import {auditImageFeatures} from '../../static/inverse/core/image-features.js';
import {loadNumericalKernel} from '../../static/inverse/core/numerical-kernel.js';
import {readHardPhoto} from './hard-photo-data.mjs';
import {renderExportedWeave} from './export-renderer.mjs';

test('longer gift refinement preserves a finer-verified export below the original error limit',async()=>{
  const fixture=JSON.parse(await fs.readFile('scripts/inverse/fixtures/gift-refinement-checkpoint.json'));
  const catalogue=JSON.parse(await fs.readFile(fixture.sourceCatalogue)),photo=await readHardPhoto(catalogue.source);
  const cfg=settings({...AUTOMATIC_PRESET,trials:0,preferMatchingSheets:false});
  const input=prepare({...photo,quad:fixture.quad},cfg).target,source=input.sourceImage,original=source.mask.slice();
  assert.equal(createHash('sha256').update(source.mask).digest('hex'),fixture.maskSha256);
  await loadNumericalKernel();
  const graph=new CurveGraph(fixture.paths,fixture.width);
  // Use the app's actual policy. Guarded diagonal connections now establish
  // a safe incumbent; finer checking must prevent premature coarse rollback.
  const fitted=refineCurves(graph,resize(source.probability,400,256),256,fixture.phase,cfg,{input,steps:750,rate:.05,resolvePaperBeforeRollback:true});
  assert.equal(fitted.geometryPassed,true);assert.equal(fitted.paperPassed,true);
  assert.equal(fitted.paperVerification.status,'pass');assert.equal(fitted.paperVerification.resolution,700);
  const solution=graph.solution(fitted.points,fixture.phase,input),finer={...cfg,materialResolution:fitted.paperVerification.resolution};
  assert.equal(materialAudit(solution,cfg).status,'uncertain','The unchanged cuts still need a finer paper check.');
  assert.equal(finalMaterialAudit(solution,finer).status,'pass');
  assert.equal(validate(solution,finer,{checkImage:false,finalGeometry:true}).passed,true);
  const rendered=await renderExportedWeave(solutionJSON(solution),400);
  assert.ok(mismatch(rendered.mask,source.mask)<.025);
  assert.equal(auditImageFeatures(source,rendered.mask).passed,true);
  assert.deepEqual(source.mask,original);
});

test('a coarse paper pass retains a better uncertain alternative without certifying it',async()=>{
  const fixture=JSON.parse(await fs.readFile('scripts/inverse/fixtures/floral-checker-refinement-checkpoint.json'));
  const catalogue=JSON.parse(await fs.readFile(fixture.sourceCatalogue)),photo=await readHardPhoto(catalogue.source);
  const cfg=settings({...AUTOMATIC_PRESET,trials:0,preferMatchingSheets:false});
  const input=prepare({...photo,quad:fixture.quad},cfg).target,source=input.sourceImage;
  assert.equal(createHash('sha256').update(source.mask).digest('hex'),fixture.maskSha256);
  await loadNumericalKernel();
  const graph=new CurveGraph(fixture.paths,fixture.width);
  // Guarded diagonal connections now certify the early checkpoints. Continue
  // to the later unresolved one so this still tests alternative retention.
  const fitted=refineCurves(graph,resize(source.probability,400,256),256,fixture.phase,cfg,{input,steps:201,rate:.035});
  assert.equal(fitted.paperPassed,true,'The ordinary return still prioritizes a verified incumbent');
  const alternative=fitted.paperAlternative;assert.ok(alternative);
  assert.equal(alternative.geometryPassed,true);assert.equal(alternative.paperPassed,false);
  assert.equal(alternative.paper.status,'uncertain');assert.ok(alternative.error<fitted.error);
  const proposed=graph.solution(alternative.points,fixture.phase,input);
  assert.equal(materialAudit(proposed,cfg).status,'uncertain');
  assert.equal(materialAudit(proposed,{...cfg,materialResolution:700}).status,'pass',
    'Recheck identical coordinates; no regularizer or geometry change may explain the improvement');
  const rendered=await renderExportedWeave(solutionJSON(proposed),400);
  assert.ok(mismatch(rendered.mask,source.mask)<.028);
  const incumbent=await renderExportedWeave(solutionJSON(graph.solution(fitted.points,fixture.phase,input)),400);
  assert.ok(mismatch(rendered.mask,source.mask)<mismatch(incumbent.mask,source.mask),
    'The actual exported alternative must improve on the verified incumbent.');
  assert.equal(auditImageFeatures(source,rendered.mask).passed,true);
});

test('fresh photographic fitting selects and exports finer-verified refinement',async()=>{
  const fixture=JSON.parse(await fs.readFile('scripts/inverse/fixtures/floral-checker-refinement-checkpoint.json'));
  const catalogue=JSON.parse(await fs.readFile(fixture.sourceCatalogue)),photo=await readHardPhoto(catalogue.source);
  const cfg={...AUTOMATIC_PRESET,trials:0,timeLimit:180,earlyStop:false},crop=prepare({...photo,quad:fixture.quad},cfg);
  // Only the image and frozen crop enter design(); never the saved curves
  // used by the separate deterministic checkpoint regression above.
  const input=prepare({type:'mask',mask:crop.preview.mask,resolution:400},cfg).target,packets=[];
  const answer=await design(input,cfg,()=>{},{onCandidate:p=>packets.push(p)});
  assert.equal(answer.report.templateChecksPassed,true);
  assert.equal(answer.report.settings.materialResolution,700);
  const budget=answer.report.solver.refinementBudget;
  // design() deducts its setup time before handing the allowance to the fitter.
  assert.ok(budget.requestedSeconds>179&&budget.requestedSeconds<=180);
  assert.equal(budget.maximumSearchSeconds,25);
  assert.equal(budget.verifiedAlternative,true);
  assert.ok(answer.report.solver.seconds<32,'An accepted alternative must not wait for the full 180-second seed portfolio');
  assert.ok(answer.report.solver.candidates.some(c=>c.paperVerification?.source==='rollback-checkpoint'));
  assert.ok(answer.report.solver.extraGridComparisons.some(r=>r.reason==='simpler-layout'&&r.selectedCounts===null),
    'After comparing the ordinary finalists, no competitive simpler grid remains.');
  assert.ok(packets.some(p=>p.materialResolution===700&&p.error<.03),'Stop must receive the now-verified alternative');
  const rendered=await renderExportedWeave(answer.files['cut_geometry.json'],400);
  assert.ok(mismatch(rendered.mask,crop.preview.mask)<.03);
  assert.equal(auditImageFeatures(input.sourceImage,rendered.mask).passed,true);
});

test('a fresh blue-star fit preserves exported quality and independently checked paper',async()=>{
  const fixture=JSON.parse(await fs.readFile('scripts/inverse/fixtures/blue-star-polishing.json'));
  const photo=await readHardPhoto(fixture.source),cfg={...AUTOMATIC_PRESET,trials:0,timeLimit:10};
  const crop=prepare({...photo,quad:fixture.quad},cfg),mask=crop.preview.mask.slice();
  assert.equal(createHash('sha256').update(mask).digest('hex'),fixture.maskSha256);
  const input=prepare({type:'mask',mask,resolution:crop.preview.resolution},{...cfg,invert:false,removeSpecks:0,fillHoles:0}).target;
  const answer=await design(input,cfg),verification=answer.report.solver.paperVerification;
  assert.equal(answer.report.templateChecksPassed,true);
  const requested=settings(cfg);
  // This photo now passes at the requested lattice. If fitting needs a finer
  // audit again, export must still retain its resolution and certificate.
  if(verification){
    assert.equal(verification.status,'pass');
    assert.equal(verification.requestedResolution,requested.materialResolution);
    assert.ok(verification.resolution>=requested.materialResolution);
  }
  assert.equal(answer.report.settings.materialResolution,verification?.resolution??requested.materialResolution);
  for(const key of ['width','minWidth','cutError','kerf','geometryTolerance','nominalWidth'])assert.equal(answer.report.settings[key],requested[key]);
  const exported=loadSolutionJSON(JSON.parse(answer.files['cut_geometry.json']));
  assert.equal(validate(exported,answer.report.settings,{checkImage:false,finalGeometry:true}).passed,true);
  assert.equal(finalMaterialAudit(exported,answer.report.settings).status,'pass');
  const rendered=await renderExportedWeave(answer.files['cut_geometry.json'],mask.length**.5);
  // Earlier fine verification can avoid the two return contractions this
  // fixture previously needed after polishing. Require the same exported
  // quality and physical checks, rather than a particular repair route.
  assert.ok(mismatch(rendered.mask,mask)<.0052,'The export must retain the independently measured photographic quality');
  assert.equal(auditImageFeatures(input.sourceImage,rendered.mask).passed,true);
  assert.deepEqual(mask,crop.preview.mask);assert.deepEqual(input.sourceImage.mask,mask);
});
