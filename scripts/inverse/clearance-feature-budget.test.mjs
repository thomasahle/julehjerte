import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {prepare,design} from '../../static/inverse/core/engine.js';
import {AUTOMATIC_PRESET} from '../../static/inverse/core/presets.js';
import {auditFeatureFidelity} from '../../static/inverse/core/feature-shapes.js';
import {readHardPhoto} from './hard-photo-data.mjs';
import {hardPhotoTarget} from './hard-photo-target.mjs';
import {renderExportedWeave} from './export-renderer.mjs';
import {captureFitFailure} from './diagnostics/fit-failure.mjs';

test('a simpler seed that never contained the Viking opening leaves time for the viable routing',{timeout:20000},async t=>{
  const fixtures=JSON.parse(await fs.readFile('scripts/inverse/fixtures/photographic-short-budget-fits.json'));
  const fixture=fixtures.cases.find(r=>r.sourceCase==='flettede-viking');
  const catalogue=JSON.parse(await fs.readFile(fixture.sourceCatalogue||fixtures.sourceCatalogue));
  const photo=await readHardPhoto({...catalogue.source,...catalogue.cases.find(c=>c.id===fixture.sourceCase)});
  assert.equal(photo.fileSha256,fixture.sourceFileSha256);assert.equal(photo.rgbaSha256,fixture.decodedPixelsSha256);
  const cfg={...AUTOMATIC_PRESET,timeLimit:10,trials:0,earlyStop:false};
  const input=hardPhotoTarget(prepare({...photo,quad:fixture.quad},cfg),'mask',cfg),source=input.sourceImage;
  const mask=source.mask.slice(),probability=source.probability.slice();
  assert.equal(createHash('sha256').update(mask).digest('hex'),fixture.maskSha256);
  const answer=await design(input,cfg),report=answer.report,comparison=report.solver.clearanceComparison;
  let exportedError=null;
  try{
    assert.equal(comparison.alternativeGeometry,true);
    assert.equal(comparison.alternativeColours,false);
    assert.equal(comparison.alternativeColoursBeforeClearance,false);
    assert.equal(comparison.repair,undefined,'A seed missing the opening before clearance needs a new routing, not this short repair.');
    const replay=await renderExportedWeave(answer.files['cut_geometry.json'],source.resolution);
    exportedError=replay.mask.reduce((s,v,i)=>s+Number(v!==mask[i]),0)/mask.length;
    assert.equal(report.templateChecksPassed,true);assert.ok(exportedError<.03);
    assert.equal(auditFeatureFidelity(source,replay.mask,report.settings).passed,true);
    assert.deepEqual(source.mask,mask);assert.deepEqual(source.probability,probability);
  }catch(error){
    t.diagnostic(await captureFitFailure({error:exportedError,maximum:.03,answer,source,context:{fixture:fixture.sourceCase,failedAssertion:error.message}}));
    throw error;
  }
});
