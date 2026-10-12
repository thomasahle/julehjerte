import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {prepare} from '../../static/inverse/core/engine.js';
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
