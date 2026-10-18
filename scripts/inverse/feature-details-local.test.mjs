import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {prepare} from '../../static/inverse/core/engine.js';
import {AUTOMATIC_PRESET} from '../../static/inverse/core/presets.js';
import {settings} from '../../static/inverse/core/settings.js';
import {loadSolutionJSON,curvesOf,solutionJSON} from '../../static/inverse/core/graph.js';
import {CurveGraph} from '../../static/inverse/core/direct/curves.js';
import {featureDetailPlan} from '../../static/inverse/core/direct/feature-details.js';
import {refineCurves} from '../../static/inverse/core/direct/refine.js';
import {loadBoundaryKernel} from '../../static/inverse/core/direct/native.js';
import {imageFeatures} from '../../static/inverse/core/image-features.js';
import {auditFeatureFidelity,featureComponentMetrics} from '../../static/inverse/core/feature-shapes.js';
import {validate} from '../../static/inverse/core/validate.js';
import {finalMaterialAudit} from '../../static/inverse/core/geometric-material.js';
import {renderExportedWeave} from './export-renderer.mjs';

test('local detail improves the photographed opening without moving distant valid cuts',async()=>{
  // This tests a fixed candidate, separately from the fresh photograph suite.
  // No saved curves enter design() or the production initializer.
  const fixture=JSON.parse(await fs.readFile('scripts/inverse/fixtures/puppy-local-detail.json'));
  const {resolution,maskRuns}=fixture.sourceMask,mask=new Uint8Array(resolution**2);let offset=0;
  for(let i=0;i<maskRuns.length;i+=2){mask.fill(maskRuns[i],offset,offset+maskRuns[i+1]);offset+=maskRuns[i+1];}
  assert.equal(offset,mask.length);assert.equal(createHash('sha256').update(mask).digest('hex'),fixture.maskSha256);
  const cfg=settings({...AUTOMATIC_PRESET,trials:0,preferMatchingSheets:false,materialResolution:700});
  const input=prepare({type:'mask',mask,resolution},cfg).target,source=input.sourceImage,features=imageFeatures(source,cfg.width);
  const saved=loadSolutionJSON(fixture.cutGeometry),phase=saved.graph.target.phase?-1:1;
  const graph=new CurveGraph(saved.paths.map((family,f)=>family.map((_,i)=>curvesOf(saved,f,i).map(c=>c.p))),cfg.width);
  const original=graph.points.slice(),plan=featureDetailPlan(graph,original,source,features,cfg,256,{local:true});
  assert.ok(plan?.report.local);assert.ok(plan.originalFixed);assert.ok(plan.report.freeControls>0);
  assert.deepEqual(graph.points,original,'Creating local parameters does not move the incoming candidate.');
  const before=plan.graph.points.slice(),fixed=plan.graph.fixed.slice();
  await loadBoundaryKernel();
  const fitted=refineCurves(plan.graph,plan.objective.probability,256,phase,cfg,{input,weights:plan.objective.weights,steps:160,rate:.07});
  for(let i=0;i<before.length;i++)if(fixed[i])assert.equal(fitted.points[i],before[i]);
  plan.graph.fixed.set(plan.originalFixed);
  const solution=plan.graph.solution(fitted.points,phase,input),serialized=solutionJSON(solution);
  assert.equal(validate(solution,cfg,{checkImage:false,finalGeometry:true}).passed,true);
  assert.equal(finalMaterialAudit(solution,cfg).status,'pass');
  for(const scale of [1,2]){
    const n=resolution*scale,expected=Uint8Array.from({length:n*n},(_,i)=>mask[Math.floor(Math.floor(i/n)/scale)*resolution+Math.floor(i%n/scale)]);
    const reference={mask:expected,resolution:n},prior=await renderExportedWeave(fixture.cutGeometry,n),after=await renderExportedWeave(serialized,n);
    const error=woven=>woven.reduce((sum,v,i)=>sum+Number(v!==expected[i]),0)/expected.length;
    assert.ok(error(after.mask)<error(prior.mask),'Local improvement must also improve the unchanged whole image.');
    const opening=woven=>featureComponentMetrics(reference,woven,cfg.width).find(f=>f.sourceAreaMm2<30);
    const a=opening(prior.mask),b=opening(after.mask);
    assert.ok(b.componentIoU>.6&&b.componentIoU>a.componentIoU+.08,'Recover shape, not only source-colour retention.');
    assert.ok(b.predictedComponentAreaMm2<a.predictedComponentAreaMm2);
    assert.equal(b.touchesBorder,false);assert.equal(auditFeatureFidelity(reference,after.mask,cfg).passed,true);
  }
  assert.deepEqual(source.mask,mask);
});
