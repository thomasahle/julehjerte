import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {readHardPhoto} from './hard-photo-data.mjs';
import {hardPhotoTarget} from './hard-photo-target.mjs';
import {renderExportedWeave} from './export-renderer.mjs';
import {prepare,design} from '../../static/inverse/core/engine.js';
import {AUTOMATIC_PRESET} from '../../static/inverse/core/presets.js';
import {settings} from '../../static/inverse/core/settings.js';
import {auditFeatureFidelity} from '../../static/inverse/core/feature-shapes.js';

test('a subpixel photo-crop perturbation still produces a feature-complete valid weave',{timeout:210000},async()=>{
  const fixture=JSON.parse(await fs.readFile(new URL('./fixtures/locator/bauble-nearby-crops.json',import.meta.url)));
  const source=await readHardPhoto(fixture.source);
  const cfg={...AUTOMATIC_PRESET,timeLimit:180,materialResolution:360,trials:0};
  const targets=fixture.cases.map(entry=>{
    const imported=prepare({...source,quad:entry.quad},cfg);
    assert.equal(createHash('sha256').update(imported.preview.mask).digest('hex'),entry.maskSha256);
    return hardPhotoTarget(imported,'mask',cfg);
  });
  const changed=targets[0].sourceImage.mask.reduce((s,v,i)=>s+Number(v!==targets[1].sourceImage.mask[i]),0);
  assert.equal(changed,15);
  // The earlier crop is a comparison input, not a fitting seed or cutting-path
  // label. Fit the browser crop fresh, without saved templates or supplied counts.
  const target=targets[fixture.cases.findIndex(entry=>entry.id==='browser')];
  const result=await design(target,cfg);
  assert.equal(result.report.validation.passed,true);
  assert.equal(result.report.templateChecksPassed,true);
  const comparison=result.report.solver.earlyPolishComparison;
  assert.equal(comparison?.accepted,true,'A complete near-threshold layout should be polished before more grids are tried.');
  assert.ok(comparison.beforeError>settings(cfg).maxImageError);
  assert.ok(comparison.afterError<=settings(cfg).maxImageError);
  const woven=await renderExportedWeave(result.files['cut_geometry.json'],fixture.resolution);
  const error=woven.mask.reduce((s,v,i)=>s+Number(v!==target.sourceImage.mask[i]),0)/woven.mask.length;
  assert.ok(error<=.03,`${100*error}% independent mask disagreement`);
  assert.equal(auditFeatureFidelity(target.sourceImage,woven.mask,settings(cfg)).passed,true);
});
