import test from 'node:test';
import assert from 'node:assert/strict';
import {cfg,resolution,mask,originalMask,input} from './clearance-feature-fixture.mjs';
import {design} from '../../static/inverse/core/engine.js';
import {renderExportedWeave} from './export-renderer.mjs';
import {auditFeatureFidelity} from '../../static/inverse/core/feature-shapes.js';

for(const [name,pixels]of [['resampled',mask],['original',originalMask]]){
  test(`fresh fitting retains the stacked motif on the ${name} mask`,{timeout:20000},async t=>{
    assert.equal(mask.reduce((s,v,i)=>s+Number(v!==originalMask[i]),0),116);
    const source=input(pixels),answer=await design(source,cfg),report=answer.report;
    const rendered=await renderExportedWeave(answer.files['cut_geometry.json'],resolution);
    const error=rendered.mask.reduce((s,v,i)=>s+Number(v!==pixels[i]),0)/pixels.length;
    if(!report.templateChecksPassed||error>=.03)t.diagnostic(JSON.stringify({error,comparison:report.solver.clearanceComparison,termination:report.solver.termination}));
    assert.equal(report.templateChecksPassed,true);
    assert.ok(error<.03);
    if(name==='resampled'){
      assert.equal(report.solver.clearanceComparison.alternativeColoursBeforeClearance,true);
      assert.equal(report.solver.clearanceComparison.repair.accepted,true);
    }
    assert.equal(auditFeatureFidelity(source.sourceImage,rendered.mask,report.settings).passed,true);
    assert.deepEqual(source.sourceImage.mask,pixels);
  });
}
