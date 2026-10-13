import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {prepare,design} from '../../static/inverse/core/engine.js';
import {settings} from '../../static/inverse/core/settings.js';
import {AUTOMATIC_PRESET} from '../../static/inverse/core/presets.js';
import {loadSolutionJSON,solutionJSON,curvesOf} from '../../static/inverse/core/graph.js';
import {CurveGraph} from '../../static/inverse/core/direct/curves.js';
import {recoverClampedFeatures} from '../../static/inverse/core/direct/clamped-features.js';
import {sampleWeave,validate} from '../../static/inverse/core/validate.js';
import {materialAudit} from '../../static/inverse/core/material.js';
import {auditFeatureFidelity} from '../../static/inverse/core/feature-shapes.js';
import {imageFeatures} from '../../static/inverse/core/image-features.js';
import {readHardPhoto} from './hard-photo-data.mjs';
import {renderExportedWeave} from './export-renderer.mjs';

async function sourceImage(){
  const fixture=JSON.parse(await fs.readFile('scripts/inverse/fixtures/photographic-bird-fit.json'));
  const catalogue=JSON.parse(await fs.readFile(fixture.sourceCatalogue)),photo=await readHardPhoto(catalogue.source);
  const imported=prepare({...photo,quad:fixture.quad.map(([x,y])=>[x,y+1])},AUTOMATIC_PRESET);
  assert.equal(createHash('sha256').update(imported.preview.mask).digest('hex'),'877e2d912dc8bc574c99154dc5a3de16a8d675c899f022c4a517f9216618dd72');
  return prepare({type:'mask',mask:imported.preview.mask,resolution:400},AUTOMATIC_PRESET).target;
}

async function frozen(transpose=false){
  // This is a rejected checkpoint for the helper's regression, not an input
  // to the fresh fitting test below or a template available to the app.
  const proposal=loadSolutionJSON(await fs.readFile('scripts/inverse/fixtures/bird-y-clamped-proposal.json','utf8')),input=await sourceImage();
  if(!transpose){proposal.graph.target.sourceImage=input.sourceImage;return proposal;}
  const paths=proposal.paths.map((family,f)=>family.map((_,i)=>curvesOf(proposal,f,i).map(c=>c.p.map(([x,y])=>[y,x])))).toReversed();
  const graph=new CurveGraph(paths),n=input.sourceImage.resolution;
  const mask=Uint8Array.from(input.sourceImage.mask,(_,i)=>input.sourceImage.mask[(i%n)*n+Math.floor(i/n)]);
  return graph.solution(graph.points,proposal.graph.target.phase?-1:1,{sourceImage:{mask,probability:Float32Array.from(mask),resolution:n}});
}

const cfg=settings({...AUTOMATIC_PRESET,trials:0,materialResolution:700});
for(const transpose of [false,true])test(`a clamped feature repairs a whole span on the ${transpose?'right':'bottom'} side without changing its input`,async()=>{
  const proposal=await frozen(transpose),source=proposal.graph.target.sourceImage,serialized=solutionJSON(proposal),original=structuredClone(source);
  assert.equal(auditFeatureFidelity(source,sampleWeave(proposal,400),cfg).passed,false);
  const result=recoverClampedFeatures(proposal,cfg),report=result.report.clampedFeatureRecovery;
  assert.equal(report.applied,true);assert.ok(report.sourceErrorAfter<=report.sourceErrorBefore);
  const accepted=report.attempts.find(a=>a.status==='accepted');
  assert.equal(accepted.axis,transpose?0:1);assert.equal(accepted.side,1);assert.equal(accepted.coordinates,4);
  assert.equal(validate(result,cfg).passed,true);assert.equal(materialAudit(result,cfg).passed,true);
  assert.equal(auditFeatureFidelity(source,sampleWeave(result,400),cfg).passed,true);
  const replay=await renderExportedWeave(solutionJSON(result),400);
  // A boundary near a pixel centre gets coverage 127/255 horizontally and
  // 128/255 vertically in resvg. Thresholding that single shade exaggerates
  // the orientation difference by a whole pixel row. Check fractional area
  // at source resolution, then binary colour and enclosure at finer scales.
  for(const feature of imageFeatures(source,cfg.width)){
    const retained=feature.pixels.reduce((sum,i)=>sum+(feature.value?replay.coverage[i]:1-replay.coverage[i]),0)/feature.pixels.length;
    assert.ok(retained>=.6,`Independent fractional retention ${retained}`);
  }
  for(const n of [800,1600]){
    const exported=await renderExportedWeave(solutionJSON(result),n);
    const mask=Uint8Array.from({length:n*n},(_,i)=>source.mask[Math.floor(Math.floor(i/n)*400/n)*400+Math.floor((i%n)*400/n)]);
    const exportedFidelity=auditFeatureFidelity({mask,resolution:n},exported.mask,cfg);
    assert.equal(exportedFidelity.passed,true,JSON.stringify(exportedFidelity));
  }
  assert.deepEqual(solutionJSON(proposal),serialized);assert.deepEqual(source,original);
  assert.equal(recoverClampedFeatures(result,cfg),result,'An already retained feature needs no further movement.');
});

test('expired budgets and preserved artwork cannot change the fitted controls',async()=>{
  const proposal=await frozen(),serialized=solutionJSON(proposal);
  assert.equal(recoverClampedFeatures(proposal,cfg,{deadline:0}),proposal);
  proposal.graph.target.metadata.originalCubicsPreserved=true;
  assert.equal(recoverClampedFeatures(proposal,cfg),proposal);
  assert.deepEqual(solutionJSON(proposal),serialized);
});

test('a correction cannot silently discard a requested cutting symmetry',async()=>{
  const proposal=await frozen(),serialized=solutionJSON(proposal);
  const result=recoverClampedFeatures(proposal,settings({...cfg,symmetry:{transpose:true}}));
  assert.notEqual(result.report.clampedFeatureRecovery?.applied,true);
  assert.deepEqual(solutionJSON(result),serialized);
});

test('an early checked correction bounds a long photographic search and survives export',async()=>{
  const input=await sourceImage(),before=structuredClone(input.sourceImage),snapshots=[];
  // Only the original photograph and shifted crop enter this fresh fit.
  // The frozen proposal used by the helper tests above is not supplied here.
  const answer=await design(input,{...AUTOMATIC_PRESET,timeLimit:180,trials:0,earlyStop:false},()=>{},{onCandidate:c=>snapshots.push(c)});
  const report=answer.report.solver,repair=report.clampedFeatureRecovery;
  assert.equal(repair.applied,true);assert.ok(repair.sourceErrorAfter<=repair.sourceErrorBefore);
  assert.ok(report.earlyClampedFeatureRecovery.some(attempt=>attempt.report?.applied&&attempt.elapsedSeconds<25));
  // The outer engine subtracts its own setup time before entering the fitter.
  assert.ok(report.refinementBudget.requestedSeconds>179&&report.refinementBudget.requestedSeconds<=180);
  assert.equal(report.refinementBudget.maximumSearchSeconds,25);
  assert.ok(report.seconds<30);assert.equal(answer.report.templateChecksPassed,true);
  assert.equal(answer.report.validation.passed,true);assert.equal(answer.report.manufacturing.status,'pass');
  assert.ok(snapshots.some(c=>c.stage==='directPolishing'&&c.materialResolution===700&&c.error<.03));
  for(const n of [400,800]){
    const rendered=await renderExportedWeave(answer.files['cut_geometry.json'],n);
    const mask=Uint8Array.from({length:n*n},(_,i)=>before.mask[Math.floor(Math.floor(i/n)*400/n)*400+Math.floor((i%n)*400/n)]);
    const source={mask,resolution:n},fidelity=auditFeatureFidelity(source,rendered.mask,answer.report.settings);
    assert.equal(fidelity.passed,true,`Independent feature fidelity at ${n} pixels.`);
    const error=rendered.mask.reduce((sum,v,i)=>sum+Number(v!==mask[i]),0)/mask.length;
    assert.ok(error<.03,`Original-mask disagreement ${error} at ${n} pixels.`);
  }
  assert.deepEqual(input.sourceImage,before);
});
