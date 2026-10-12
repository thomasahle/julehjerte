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
import {solutionJSON} from '../../static/inverse/core/graph.js';
import {mismatch} from '../../static/inverse/core/direct/grid.js';
import {auditImageFeatures} from '../../static/inverse/core/image-features.js';
import {loadNumericalKernel} from '../../static/inverse/core/numerical-kernel.js';
import {readHardPhoto} from './hard-photo-data.mjs';
import {renderExportedWeave} from './export-renderer.mjs';

test('longer refinement retains a geometry-valid uncertain checkpoint for finer paper verification',async()=>{
  const fixture=JSON.parse(await fs.readFile('scripts/inverse/fixtures/gift-refinement-checkpoint.json'));
  const catalogue=JSON.parse(await fs.readFile(fixture.sourceCatalogue)),photo=await readHardPhoto(catalogue.source);
  const cfg=settings({...AUTOMATIC_PRESET,trials:0,preferMatchingSheets:false});
  const input=prepare({...photo,quad:fixture.quad},cfg).target,source=input.sourceImage;
  assert.equal(createHash('sha256').update(source.mask).digest('hex'),fixture.maskSha256);
  await loadNumericalKernel();
  const graph=new CurveGraph(fixture.paths,fixture.width);
  // The old selector returned an illegal 1.98% checkpoint, throwing away the
  // earlier 2.41% geometry whose coarse paper uncertainty was resolvable.
  const fitted=refineCurves(graph,resize(source.probability,400,256),256,fixture.phase,cfg,{input,steps:750,rate:.05});
  assert.ok(fitted.history.some(h=>!h.geometry&&h.error<fitted.error));
  assert.equal(fitted.geometryPassed,true);
  assert.equal(fitted.paperPassed,false,'An uncertain checkpoint is not a paper certificate');
  assert.equal(fitted.paper.status,'uncertain');
  const solution=graph.solution(fitted.points,fixture.phase,input);
  assert.equal(materialAudit(solution,{...cfg,materialResolution:700}).status,'pass');
  const rendered=await renderExportedWeave(solutionJSON(solution),400);
  assert.ok(mismatch(rendered.mask,source.mask)<.025);
  assert.equal(auditImageFeatures(source,rendered.mask).passed,true);
});

test('a coarse paper pass retains a better uncertain alternative without certifying it',async()=>{
  const fixture=JSON.parse(await fs.readFile('scripts/inverse/fixtures/floral-checker-refinement-checkpoint.json'));
  const catalogue=JSON.parse(await fs.readFile(fixture.sourceCatalogue)),photo=await readHardPhoto(catalogue.source);
  const cfg=settings({...AUTOMATIC_PRESET,trials:0,preferMatchingSheets:false});
  const input=prepare({...photo,quad:fixture.quad},cfg).target,source=input.sourceImage;
  assert.equal(createHash('sha256').update(source.mask).digest('hex'),fixture.maskSha256);
  await loadNumericalKernel();
  const graph=new CurveGraph(fixture.paths,fixture.width);
  const fitted=refineCurves(graph,resize(source.probability,400,256),256,fixture.phase,cfg,{input,steps:81,rate:.035});
  assert.equal(fitted.paperPassed,true,'The ordinary return still prioritizes a verified incumbent');
  assert.ok(fitted.error>.04);
  const alternative=fitted.paperAlternative;assert.ok(alternative);
  assert.equal(alternative.geometryPassed,true);assert.equal(alternative.paperPassed,false);
  assert.equal(alternative.paper.status,'uncertain');assert.ok(alternative.error<.03);
  const proposed=graph.solution(alternative.points,fixture.phase,input);
  assert.equal(materialAudit(proposed,cfg).status,'uncertain');
  assert.equal(materialAudit(proposed,{...cfg,materialResolution:700}).status,'pass',
    'Recheck identical coordinates; no regularizer or geometry change may explain the improvement');
  const rendered=await renderExportedWeave(solutionJSON(proposed),400);
  assert.ok(mismatch(rendered.mask,source.mask)<.028);
  assert.equal(auditImageFeatures(source,rendered.mask).passed,true);
});

test('fresh photographic fitting selects and exports the finer-verified alternative',async()=>{
  const fixture=JSON.parse(await fs.readFile('scripts/inverse/fixtures/floral-checker-refinement-checkpoint.json'));
  const catalogue=JSON.parse(await fs.readFile(fixture.sourceCatalogue)),photo=await readHardPhoto(catalogue.source);
  const cfg={...AUTOMATIC_PRESET,trials:0,timeLimit:10,earlyStop:false},crop=prepare({...photo,quad:fixture.quad},cfg);
  // Only the image and frozen crop enter design(); never the saved curves
  // used by the separate deterministic checkpoint regression above.
  const input=prepare({type:'mask',mask:crop.preview.mask,resolution:400},cfg).target,packets=[];
  const answer=await design(input,cfg,()=>{},{onCandidate:p=>packets.push(p)});
  assert.equal(answer.report.templateChecksPassed,true);
  assert.equal(answer.report.settings.materialResolution,700);
  assert.ok(answer.report.solver.candidates.some(c=>c.paperVerification?.source==='retained-refinement-alternative'));
  assert.ok(packets.some(p=>p.materialResolution===700&&p.error<.03),'Stop must receive the now-verified alternative');
  const rendered=await renderExportedWeave(answer.files['cut_geometry.json'],400);
  assert.ok(mismatch(rendered.mask,crop.preview.mask)<.03);
  assert.equal(auditImageFeatures(input.sourceImage,rendered.mask).passed,true);
});
