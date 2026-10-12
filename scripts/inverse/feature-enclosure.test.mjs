import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {finish,prepare,design} from '../../static/inverse/core/engine.js';
import {settings} from '../../static/inverse/core/settings.js';
import {AUTOMATIC_PRESET} from '../../static/inverse/core/presets.js';
import {loadSolutionJSON} from '../../static/inverse/core/graph.js';
import {sampleWeave} from '../../static/inverse/core/validate.js';
import {auditImageFeatures} from '../../static/inverse/core/image-features.js';
import {featureComponentMetrics} from '../../static/inverse/core/feature-shapes.js';
import {renderExportedWeave} from './export-renderer.mjs';

async function browserMask(){
  const fixture=JSON.parse(await fs.readFile('scripts/inverse/fixtures/browser-puppy-half-mask.json'));
  const mask=new Uint8Array(fixture.resolution**2);let offset=0,value=fixture.first;
  for(const count of fixture.runs){mask.fill(value,offset,offset+count);offset+=count;value^=1;}
  assert.equal(offset,mask.length);
  assert.equal(createHash('sha256').update(mask).digest('hex'),fixture.maskSha256);
  return{fixture,mask,resolution:fixture.resolution};
}

test('a real uploaded photograph cannot certify an opening connected to the background',async()=>{
  const {fixture,mask,resolution}=await browserMask(),source={mask,resolution,probability:Float32Array.from(mask)};
  const solution=loadSolutionJSON(fixture.previousBadGeometry);
  solution.graph.target.sourceImage=source;solution.report={algorithm:'direct-bezier'};
  const cfg=settings({...AUTOMATIC_PRESET,trials:0,materialResolution:700});
  const pixels=auditImageFeatures(source,sampleWeave(solution,resolution));
  assert.equal(pixels.passed,true);assert.ok(pixels.regions[0].retainedFraction>.9);
  const result=finish(solution,cfg,()=>{},{refine:false});
  assert.equal(result.report.validation.passed,true);assert.equal(result.report.manufacturing.status,'pass');
  assert.ok(result.report.imageError.mismatchFraction<.02);
  assert.equal(result.report.templateChecksPassed,false);
  assert.equal(result.report.imageFidelity.features.missing[0].enclosureLost,true);
  assert.equal(result.report.imageFidelity.features.enclosures.opened,1);
  assert.equal(result.report.templateExportAllowed,true,'An imperfect result remains downloadable with its warning');
  assert.ok(result.report.warnings.some(s=>s.includes('enclosure')));
  assert.ok(result.files['template_left.svg']);assert.ok(result.files['template_right.svg']);
});

test('fresh fitting reuses an alternate routing and refines the enclosed opening',async()=>{
  const {mask,resolution}=await browserMask(),before=mask.slice();
  const cfg={...AUTOMATIC_PRESET,timeLimit:25,trials:0,earlyStop:false};
  // The stored bad cuts above never enter this search: only classified pixels.
  const prepared=prepare({type:'mask',mask,resolution},cfg),answer=await design(prepared.target,cfg);
  assert.equal(answer.report.templateChecksPassed,true);
  assert.equal(answer.report.validation.passed,true);assert.equal(answer.report.manufacturing.status,'pass');
  const initialization=answer.report.solver.earlyFeatureInitialization;
  assert.ok(initialization.enclosureRetry,'The first opened routing needs a different start');
  assert.ok(initialization.scheduled<=2,'Reuse at most one alternate from the same count search');
  assert.equal(initialization.hypotheses,10,'Do not repeat or broaden count initialization for this retry');
  const rendered=await renderExportedWeave(answer.files['cut_geometry.json'],resolution);
  const opening=featureComponentMetrics(prepared.target.sourceImage,rendered.mask)[0];
  assert.equal(opening.touchesBorder,false);assert.ok(opening.componentIoU>.65);
  const error=rendered.mask.reduce((sum,v,i)=>sum+Number(v!==mask[i]),0)/mask.length;
  assert.ok(error<.015,'The image and the whole opening must both improve');
  assert.deepEqual(mask,before);assert.deepEqual(prepared.target.sourceImage.mask,before);
});
