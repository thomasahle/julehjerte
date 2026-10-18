import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {prepare} from '../../static/inverse/core/engine.js';
import {AUTOMATIC_PRESET} from '../../static/inverse/core/presets.js';
import {loadSolutionJSON,solutionJSON} from '../../static/inverse/core/graph.js';
import {finalizeShared} from '../../static/inverse/core/direct/share.js';
import {validate,sampleWeave} from '../../static/inverse/core/validate.js';
import {finalMaterialAudit} from '../../static/inverse/core/geometric-material.js';
import {maskDisagreement} from '../../static/inverse/core/direct/prefer-matching.js';
import {auditFeatureFidelityChange} from '../../static/inverse/core/feature-shapes.js';
import {readHardPhoto} from './hard-photo-data.mjs';
import {renderExportedWeave} from './export-renderer.mjs';

// The source is larger than the 256-pixel sharing work image. Enlarging that
// reduced image vetoed useful joins and kept subpixel seams in the saved orb.
test('sharing resolves the photographic orb against its original classified pixels',async()=>{
  const fixture=JSON.parse(await fs.readFile(new URL('./fixtures/sharing-original-scale-orb.json',import.meta.url)));
  const catalogue=JSON.parse(await fs.readFile(fixture.sourceCatalogue));
  const photo=await readHardPhoto({...catalogue.source,...catalogue.cases.find(c=>c.id===fixture.sourceCase)});
  const prepared=prepare({...photo,quad:fixture.quad},{...AUTOMATIC_PRESET,timeLimit:10,trials:0});
  const mask=prepared.preview.mask,n=prepared.preview.resolution;
  assert.equal(createHash('sha256').update(mask).digest('hex'),fixture.maskSha256);
  const source={mask:mask.slice(),probability:Float64Array.from(mask),resolution:n},before=loadSolutionJSON(fixture.geometry),cfg=fixture.settings;
  before.graph.target.sourceImage=source;
  const original=JSON.stringify(solutionJSON(before)),after=finalizeShared(before,cfg);
  assert.equal(validate(after,cfg,{checkImage:false,finalGeometry:true}).passed,true);
  assert.equal(finalMaterialAudit(after,cfg).status,'pass');
  assert.ok(maskDisagreement(source,sampleWeave(after,n))<=maskDisagreement(source,sampleWeave(before,n)));
  assert.equal(auditFeatureFidelityChange(source,sampleWeave(before,n),sampleWeave(after,n),cfg).passed,true);
  // Independent antialiased exports catch faint seams that a binary source-
  // resolution score can miss. Limits are below the previous cleanup's 800
  // and 1600-pixel results, not just below the incoming unaligned geometry.
  for(const [resolution,coverageLimit,errorLimit] of [[800,.01466,.01423],[1600,.01467,.01453]]){
    const render=await renderExportedWeave(solutionJSON(after),resolution);
    const target=Uint8Array.from({length:resolution**2},(_,i)=>mask[Math.floor(Math.floor(i/resolution)*n/resolution)*n+Math.floor(i%resolution*n/resolution)]);
    const coverage=render.coverage.reduce((s,v,i)=>s+Math.abs(v-target[i]),0)/target.length;
    const error=render.mask.reduce((s,v,i)=>s+Number(v!==target[i]),0)/target.length;
    assert.ok(coverage<coverageLimit,`${resolution}: fractional error ${coverage}`);
    assert.ok(error<errorLimit,`${resolution}: binary error ${error}`);
  }
  assert.deepEqual(source.mask,mask);
  assert.deepEqual(source.probability,Float64Array.from(mask));
  assert.equal(JSON.stringify(solutionJSON(before)),original);
});
