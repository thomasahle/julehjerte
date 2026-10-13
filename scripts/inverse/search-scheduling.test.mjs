import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {prepare,design} from '../../static/inverse/core/engine.js';
import {auditFeatureFidelity} from '../../static/inverse/core/feature-shapes.js';
import {renderExportedWeave} from './export-renderer.mjs';

const fixture=JSON.parse(await fs.readFile('scripts/inverse/fixtures/sloth-search-scheduling.json'));
for(const entry of fixture.cases)test(`fresh ${entry.id} routing retains time for a valid template without changing the mask`,async t=>{
  const n=entry.resolution,mask=new Uint8Array(n*n);
  for(const[start,length]of entry.maskRuns)mask.fill(1,start,start+length);
  assert.equal(createHash('sha256').update(mask).digest('hex'),entry.maskSha256);
  const cfg={...fixture.configuration,invert:false,removeSpecks:0,fillHoles:0};
  const input=prepare({type:'mask',mask,resolution:n},cfg).target,probability=input.sourceImage.probability.slice();
  const answer=await design(input,cfg),report=answer.report;
  if(!report.templateChecksPassed)t.diagnostic(JSON.stringify({report,cuts:answer.files['cut_geometry.json']}));
  assert.equal(report.settings.timeLimit,10);
  assert.equal(report.templateChecksPassed,true);
  assert.equal(report.validation.passed,true);
  assert.equal(report.manufacturing.status,'pass');
  for(const scale of[1,2]){
    const resolution=n*scale,reference={resolution,mask:Uint8Array.from({length:resolution*resolution},(_,i)=>mask[Math.floor(Math.floor(i/resolution)/scale)*n+Math.floor((i%resolution)/scale)])};
    const rendered=await renderExportedWeave(answer.files['cut_geometry.json'],resolution);
    const error=rendered.mask.reduce((s,v,i)=>s+Number(v!==reference.mask[i]),0)/reference.mask.length;
    assert.ok(error<.02,`Independent ${resolution}-pixel disagreement ${error} must recover the missing branches.`);
    assert.equal(auditFeatureFidelity(reference,rendered.mask,report.settings).passed,true);
  }
  assert.deepEqual(input.sourceImage.mask,mask);
  assert.deepEqual(input.sourceImage.probability,probability);
});
