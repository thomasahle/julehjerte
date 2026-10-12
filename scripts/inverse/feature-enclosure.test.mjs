import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {finish} from '../../static/inverse/core/engine.js';
import {settings} from '../../static/inverse/core/settings.js';
import {AUTOMATIC_PRESET} from '../../static/inverse/core/presets.js';
import {loadSolutionJSON} from '../../static/inverse/core/graph.js';
import {sampleWeave} from '../../static/inverse/core/validate.js';
import {auditImageFeatures} from '../../static/inverse/core/image-features.js';

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
