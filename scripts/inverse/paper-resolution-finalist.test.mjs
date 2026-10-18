import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {prepare,design} from '../../static/inverse/core/engine.js';
import {loadSolutionJSON,solutionJSON,curvesOf} from '../../static/inverse/core/graph.js';
import {CurveGraph} from '../../static/inverse/core/direct/curves.js';
import {assessPolishingAlternative} from '../../static/inverse/core/direct/candidate-verification.js';
import {settings} from '../../static/inverse/core/settings.js';
import {materialAudit} from '../../static/inverse/core/material.js';
import {finalMaterialAudit} from '../../static/inverse/core/geometric-material.js';
import {validate} from '../../static/inverse/core/validate.js';
import {loadNumericalKernel} from '../../static/inverse/core/numerical-kernel.js';
import {auditFeatureFidelity} from '../../static/inverse/core/feature-shapes.js';
import {readHardPhoto} from './hard-photo-data.mjs';
import {renderExportedWeave} from './export-renderer.mjs';
import {captureFitFailure} from './diagnostics/fit-failure.mjs';
const fixture=JSON.parse(await fs.readFile(new URL('./fixtures/round-checker-paper-resolution.json',import.meta.url)));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');

test('a significant floating coarse core can reconnect at a finer lattice without editing the cuts',async()=>{
  await loadNumericalKernel();
  const solution=loadSolutionJSON(fixture.geometry),before=solutionJSON(solution),cfg=settings({...fixture.configuration,materialResolution:700});
  assert.equal(validate(solution,cfg,{checkImage:false,finalGeometry:true}).passed,true);
  for(const native of [false,true]){
    const coarse=materialAudit(solution,cfg,{native});
    assert.equal(coarse.status,'uncertain');
    assert.equal(coarse.families[1].detachedCertainCoreIslands,2);
    assert.equal(materialAudit(solution,{...cfg,materialResolution:1000},{native}).status,'pass');
  }
  assert.equal(finalMaterialAudit(solution,{...cfg,materialResolution:1000}).status,'pass');
  assert.deepEqual(solutionJSON(solution),before);
});

test('cleanup verifies a retained 700-cell polish without inheriting the incumbent paper pass',async()=>{
  await loadNumericalKernel();
  const photo=await readHardPhoto(fixture.source),cfg=settings(fixture.configuration);
  const crop=prepare({...photo,quad:fixture.quad},cfg);
  const input=prepare({type:'mask',mask:crop.preview.mask,resolution:400,invert:false,removeSpecks:0,fillHoles:0},cfg).target;
  const saved=loadSolutionJSON(fixture.geometry),before=solutionJSON(saved),source=structuredClone(input.sourceImage);
  const graph=new CurveGraph(saved.paths.map((family,f)=>family.map((_,i)=>curvesOf(saved,f,i).map(c=>c.p))),cfg.width);
  const phase=saved.graph.target.phase?-1:1,paper=materialAudit(saved,{...cfg,materialResolution:700});
  assert.equal(paper.status,'uncertain');
  const retained={graph,points:graph.points.slice(),phase,error:.01,geometryPassed:true,paperPassed:false,paper:paper.summary};
  // This is the refiner's retained alternative, not an independently accepted
  // result. The incoming lattice belongs to the incumbent's verification.
  const polished={...retained,imagePassed:false,paperVerification:{resolution:700,status:'pass'},paperAlternative:retained};
  const expired=assessPolishingAlternative(polished,input,cfg,{deadline:0});
  assert.equal(expired.paperPassed,false);assert.equal(expired.imagePassed,false);
  assert.equal(expired.paperVerification.resolution,700);assert.equal(expired.paperVerification.status,'uncertain');
  const wrongImage=assessPolishingAlternative(polished,input,{...cfg,maxImageError:0});
  assert.equal(wrongImage.imagePassed,false);assert.equal(wrongImage.paperVerification.resolution,700);
  const checked=assessPolishingAlternative(polished,input,cfg);
  assert.equal(checked.imagePassed,true);assert.equal(checked.paperVerification.resolution,1000);
  assert.deepEqual(checked.points,retained.points);
  assert.equal(finalMaterialAudit(graph.solution(checked.points,phase,input),{...cfg,materialResolution:1000}).status,'pass');
  assert.deepEqual(solutionJSON(saved),before);assert.deepEqual(input.sourceImage,source);
  assert.equal(polished.paperAlternative,retained);assert.equal(retained.paperPassed,false);
});

test('fresh round-checker fitting verifies its accurate finalist before choosing a worse routing',async t=>{
  // Only the original photograph and frozen crop enter fitting, never the
  // regression witness's saved control points or known slit counts.
  const photo=await readHardPhoto(fixture.source),cfg=fixture.configuration;
  const crop=prepare({...photo,quad:fixture.quad},cfg);
  const prepared=prepare({type:'mask',mask:crop.preview.mask,resolution:400,invert:false,removeSpecks:0,fillHoles:0},cfg),source=prepared.target.sourceImage;
  const mask=source.mask.slice(),probability=source.probability.slice(),packets=[];
  assert.equal(hash(mask),fixture.maskSha256);assert.equal(hash(new Uint8Array(probability.buffer)),fixture.probabilitySha256);
  const answer=await design(prepared.target,cfg,()=>{},{onCandidate:p=>packets.push(p)}),verified=settings(answer.report.settings);
  let exportedError=null;
  try{
  assert.equal(answer.report.templateChecksPassed,true);
  // The fixed-geometry test above requires the fine lattice. A fresh timed
  // fit may instead retain cuts already certified at the requested lattice.
  // Its independent image limit and all physical tolerances still apply.
  assert.ok(verified.materialResolution>=settings(cfg).materialResolution);
  assert.ok(answer.report.solver.seconds<10);
  for(const key of ['width','minWidth','cutError','kerf','geometryTolerance','nominalWidth','minFeatureArea'])assert.equal(verified[key],settings(cfg)[key]);
  const solution=loadSolutionJSON(answer.files['cut_geometry.json']);
  assert.equal(validate(solution,verified,{checkImage:false,finalGeometry:true}).passed,true);
  assert.equal(finalMaterialAudit(solution,verified).status,'pass');
  const woven=await renderExportedWeave(answer.files['cut_geometry.json'],400);
  exportedError=woven.mask.reduce((sum,v,i)=>sum+Number(v!==mask[i]),0)/mask.length;
  assert.ok(exportedError<=fixture.previousIndependentError,`Exported disagreement ${exportedError} must retain the earlier photographic quality.`);
  assert.equal(auditFeatureFidelity(source,woven.mask,verified).passed,true);
  assert.ok(packets.some(p=>p.materialResolution===verified.materialResolution&&p.error<.015),'Stop receives a candidate at the actual verified lattice.');
  assert.deepEqual(source.mask,mask);assert.deepEqual(source.probability,probability);
  }catch(error){
    // Preserve the best actual checkpoint at each paper resolution. A hash
    // alone cannot explain why finer, better geometry was lost at final export.
    const finalists=new Map();
    for(const packet of packets){
      const resolution=packet.materialResolution??settings(cfg).materialResolution,previous=finalists.get(resolution);
      if(!previous||(packet.error??Infinity)<(previous.error??Infinity))finalists.set(resolution,packet);
    }
    t.diagnostic(await captureFitFailure({answer,source,error:exportedError,maximum:fixture.previousIndependentError,
      context:{fixture:'round-checker-paper-resolution',requestedConfiguration:cfg,assertion:error.message,
        candidates:packets.map(({geometry,...summary})=>({...summary,geometrySha256:hash(geometry)})),
        retainedCheckpoints:[...finalists.values()]}}));
    throw error;
  }
});
