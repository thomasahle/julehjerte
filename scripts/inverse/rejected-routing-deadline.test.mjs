/** A verification that finishes late must not erase a completely checked fit. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {prepare} from '../../static/inverse/core/engine.js';
import {settings} from '../../static/inverse/core/settings.js';
import {loadSolutionJSON,solutionJSON} from '../../static/inverse/core/graph.js';
import {validate} from '../../static/inverse/core/validate.js';
import {materialAudit} from '../../static/inverse/core/material.js';
import {repairRejectedRouting} from '../../static/inverse/core/direct/rejected-routing.js';
import {renderExportedWeave} from './export-renderer.mjs';

const fixture=JSON.parse(await fs.readFile('scripts/inverse/fixtures/sloth-rejected-routing.json'));
const cfg=settings({...fixture.configuration,invert:false,removeSpecks:0,fillHoles:0});
function input(){
  const mask=new Uint8Array(fixture.resolution**2);
  for(const[start,length]of fixture.maskRuns)mask.fill(1,start,start+length);
  assert.equal(createHash('sha256').update(mask).digest('hex'),fixture.maskSha256);
  return prepare({type:'mask',mask,resolution:fixture.resolution},cfg).target;
}

test('finishing a real final paper audit after the deadline retains the checked repair',async t=>{
  const source=input(),before=structuredClone(source.sourceImage);
  const proposal=loadSolutionJSON(fixture.seeds.find(s=>s.smoothRadius===.5).geometry),original=solutionJSON(proposal);
  let now=0,audits=0;
  t.mock.method(performance,'now',()=>now);
  const repaired=repairRejectedRouting(proposal,source,cfg,{deadline:1000,paperAudit:(candidate,checked)=>{
    // The audit really runs. Only its elapsed time is controlled, and the
    // simulated delay starts after refinement has already stopped.
    const result=materialAudit(candidate,checked);audits++;now=1025;return result;
  }});
  t.mock.restoreAll();
  assert.equal(audits,1);
  assert.ok(repaired.solution,JSON.stringify(repaired.report));
  assert.equal(repaired.report.accepted,true);
  assert.equal(repaired.report.deadlineOverrunMilliseconds,25);
  assert.equal(repaired.report.geometry.passed,true);
  assert.equal(repaired.report.features.passed,true);
  assert.equal(repaired.report.paper.status,'pass');
  assert.equal(validate(repaired.solution,cfg,{finalGeometry:true}).passed,true);
  assert.equal(materialAudit(repaired.solution,cfg).status,'pass');
  const rendered=await renderExportedWeave(solutionJSON(repaired.solution),fixture.resolution);
  assert.ok(rendered.mask.reduce((sum,v,i)=>sum+Number(v!==before.mask[i]),0)/before.mask.length<.015);
  assert.deepEqual(source.sourceImage,before);assert.deepEqual(solutionJSON(proposal),original);
});

test('an expired repair cannot start its audit or alter the proposal',()=>{
  const source=input(),proposal=loadSolutionJSON(fixture.seeds.find(s=>s.smoothRadius===.5).geometry),before=solutionJSON(proposal);
  let audits=0;
  const repaired=repairRejectedRouting(proposal,source,cfg,{deadline:performance.now()-1,paperAudit:(candidate,checked)=>{audits++;return materialAudit(candidate,checked);}});
  assert.equal(repaired.solution,null);assert.equal(repaired.report.reason,'insufficient_time');
  assert.equal(audits,0);assert.deepEqual(solutionJSON(proposal),before);
});


test('a late uncertain paper audit cannot bypass its required finer check',async t=>{
  const data=JSON.parse(await fs.readFile('scripts/inverse/fixtures/sloth-clearance-routing.json'));
  const entry=data.cases.find(c=>c.expectedPaperResolution===700),mask=new Uint8Array(entry.resolution**2);
  for(const[start,length]of entry.maskRuns)mask.fill(1,start,start+length);
  assert.equal(createHash('sha256').update(mask).digest('hex'),entry.maskSha256);
  const source=prepare({type:'mask',mask,resolution:entry.resolution},cfg).target;
  const proposal=loadSolutionJSON(entry.proposal),before=solutionJSON(proposal);
  let now=0,audits=0;
  t.mock.method(performance,'now',()=>now);
  const repaired=repairRejectedRouting(proposal,source,cfg,{deadline:1000,paperAudit:(candidate,checked)=>{
    const result=materialAudit(candidate,checked);audits++;now=1025;return result;
  }});
  t.mock.restoreAll();
  assert.equal(audits,1);assert.equal(repaired.solution,null);
  assert.equal(repaired.report.paper.status,'uncertain');
  assert.equal(repaired.report.reason,'paper_rejected');
  assert.equal(repaired.report.paperVerification,undefined);
  assert.equal(repaired.report.accepted,false);
  assert.equal(repaired.report.refinementSeedAvailable,true);
  assert.equal(repaired.refinementSeed.report.status,'repair_needs_paper_verification');
  assert.equal(validate(repaired.refinementSeed,cfg,{finalGeometry:true}).passed,true);
  assert.equal(materialAudit(repaired.refinementSeed,cfg).status,'uncertain');
  assert.equal(materialAudit(repaired.refinementSeed,{...cfg,materialResolution:700}).status,'pass');
  assert.equal(repaired.refinementSeed.report.rejectedRoutingRepair.accepted,false,'Keeping a seed never certifies it.');
  assert.deepEqual(solutionJSON(proposal),before);assert.deepEqual(source.sourceImage.mask,mask);
});
