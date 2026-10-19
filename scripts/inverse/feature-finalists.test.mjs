import {qualityBenchmark} from './quality-benchmark.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createCanvas,loadImage} from 'canvas';
import {prepare,design} from '../../static/inverse/core/engine.js';
import {AUTOMATIC_PRESET} from '../../static/inverse/core/presets.js';
import {settings} from '../../static/inverse/core/settings.js';
import {gridModel,gridMask,mismatch} from '../../static/inverse/core/direct/grid.js';
import {imageFeatures} from '../../static/inverse/core/image-features.js';
import {auditFeatureFidelity} from '../../static/inverse/core/feature-shapes.js';
import {featureImprovingFinalist} from '../../static/inverse/core/direct/feature-finalists.js';
import {renderExportedWeave} from './export-renderer.mjs';
import {assertFitError} from './diagnostics/fit-failure.mjs';

test('partial feature improvement preserves represented regions without certifying the missing one',()=>{
  const n=100,cfg=settings(AUTOMATIC_PRESET),coarse=gridModel([2,3]),fine=gridModel([3,3]);coarse.z.fill(0);fine.z.fill(0);
  const mask=gridMask(fine,n,1);for(let y=10;y<=14;y++)for(let x=10;x<=14;x++)if((x-12)**2+(y-12)**2<=4)mask[y*n+x]^=1;
  const source={mask,probability:Float32Array.from(mask),resolution:n},features=imageFeatures(source,cfg.width),original=mask.slice();
  const finalists=[coarse,fine].map(model=>({model,phase:1,error:mismatch(gridMask(model,n,1),source.probability)}));
  const order=finalists.slice(),result=featureImprovingFinalist(source,finalists,cfg,features);
  assert.equal(result.selected,finalists[1]);assert.equal(result.report.attempts[0].change.passed,true);
  assert.equal(features.length,5);assert.equal(result.report.beforeMissing,3);assert.equal(result.report.attempts[0].missing,1);
  assert.equal(auditFeatureFidelity(source,gridMask(fine,n,1),cfg,features).passed,false,'The remaining small opening still fails final fidelity.');
  assert.deepEqual(finalists,order);assert.deepEqual(mask,original,'Ranking never repairs the target mask.');
});

async function fixture(name){
  const spec=JSON.parse(await fs.readFile(`scripts/inverse/fixtures/feature-finalist-${name}.json`)),bytes=await fs.readFile(spec.mask.file);
  const sha=b=>createHash('sha256').update(b).digest('hex');assert.equal(sha(bytes),spec.mask.sha256);
  const image=await loadImage(bytes),canvas=createCanvas(image.width,image.height),ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);
  assert.equal(image.width,spec.mask.resolution);assert.equal(image.height,image.width);
  const data=ctx.getImageData(0,0,image.width,image.height).data,mask=Uint8Array.from({length:image.width**2},(_,i)=>Number(data[4*i]<128));assert.equal(sha(mask),spec.mask.maskSha256);
  return prepare({type:'mask',resolution:image.width,mask},AUTOMATIC_PRESET);
}

qualityBenchmark('a low-cut preference cannot erase the central checker when an existing finalist improves its fidelity',async()=>{
  const prepared=await fixture('brown-checker'),source=prepared.target.sourceImage,original=source.mask.slice();
  const answer=await design(prepared.target,{...AUTOMATIC_PRESET,timeLimit:10,trials:0}),s=answer.report.solver;
  const preference=s.finalistPreference.partialImprovement;
  assert.deepEqual(preference.beforeCounts,[1,2]);assert.deepEqual(preference.selectedCounts,[5,5]);
  assert.equal(preference.beforeMissing,5);assert.equal(preference.attempts[0].missing,2);
  assert.equal(preference.attempts[0].change.passed,true);assert.equal(s.finalistPreference.reservesRefinement,true);
  assert.equal(s.finalistPreference.shortBudgetRefinementFirst,true);
  assert.equal(s.clearanceComparison,null,'A short request must refine the preferred grid before reconsidering the layout that erases the center.');
  assert.equal(s.earlyFeatureInitialization,null,'Speculative initialization must not consume the selected grid\'s refinement window.');
  assert.ok(s.seconds<10);assert.equal(answer.report.validation.passed,true);assert.equal(answer.report.manufacturing.status,'pass');
  const replay=await renderExportedWeave(answer.files['cut_geometry.json'],source.resolution);
  assert.ok(mismatch(replay.mask,source.mask)<.035,'The old low-cut result lost the center grid at about 9.59% error.');
  assert.equal(answer.report.templateChecksPassed,false,'Unresolved source decorations must retain their fidelity warning.');
  assert.deepEqual(source.mask,original);
});

qualityBenchmark('a lower-error finalist that erodes a partially retained region cannot claim the refinement reserve',async()=>{
  const prepared=await fixture('bicycle'),source=prepared.target.sourceImage,original=source.mask.slice();
  const answer=await design(prepared.target,{...AUTOMATIC_PRESET,timeLimit:10,trials:0}),preference=answer.report.solver.finalistPreference.partialImprovement;
  const rejected=preference.attempts.find(a=>a.counts[0]===6&&a.counts[1]===6);
  assert.equal(rejected.change.passed,false);assert.equal(rejected.preferred,false);
  assert.equal(answer.report.solver.finalistPreference.shortBudgetRefinementFirst,true);
  assert.equal(answer.report.solver.clearanceComparison,null);
  assert.deepEqual(preference.selectedCounts,[4,4]);assert.equal(answer.report.validation.passed,true);assert.equal(answer.report.manufacturing.status,'pass');
  const replay=await renderExportedWeave(answer.files['cut_geometry.json'],source.resolution);
  await assertFitError({error:mismatch(replay.mask,source.mask),maximum:.04,answer,source,resolution:source.resolution,context:{case:'feature-finalist-bicycle'}});
  assert.equal(answer.report.templateChecksPassed,false,'A better initial layout does not certify the unresolved bicycle details.');
  assert.deepEqual(source.mask,original);
});
