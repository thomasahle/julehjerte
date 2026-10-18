import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {Cubic} from '../../static/inverse/core/bezier.js';
import {CurveGraph} from '../../static/inverse/core/direct/curves.js';
import {rerouteFittedBoundary} from '../../static/inverse/core/direct/reroute.js';
import {prepare,design} from '../../static/inverse/core/engine.js';
import {settings} from '../../static/inverse/core/settings.js';
import {AUTOMATIC_PRESET} from '../../static/inverse/core/presets.js';
import {sampleWeave,validate} from '../../static/inverse/core/validate.js';
import {solutionJSON} from '../../static/inverse/core/graph.js';
import {materialAudit} from '../../static/inverse/core/material.js';
import {featureComponentMetrics} from './feature-component-metrics.mjs';
import {readHardPhoto} from './hard-photo-data.mjs';
import {renderExportedWeave} from './export-renderer.mjs';

function loopProposal(){
  const chain=p=>p.slice(1).map((v,i)=>Cubic.line(p[i],v).p);
  const graph=new CurveGraph([[chain([[50,0],[50,30],[65,50],[35,50],[50,30],[50,100]])],[chain([[0,40],[100,40]])]]);
  const proposal=graph.solution(graph.points,1),mask=sampleWeave(proposal,400);
  return{proposal,input:{sourceImage:{mask,probability:Float32Array.from(mask),resolution:400},metadata:{}}};
}

test('rerouting a self-crossing fit changes sheet assignment while preserving its image and inputs',async()=>{
  const {proposal,input}=loopProposal(),cfg=settings({...AUTOMATIC_PRESET,trials:0,materialResolution:700});
  assert.ok(validate(proposal,cfg).issues.some(i=>i.type==='self_intersection'));
  const before=solutionJSON(proposal),curves=proposal.graph.target.curves.slice(),source=structuredClone(input.sourceImage);
  const result=await rerouteFittedBoundary(proposal,input,cfg,{seconds:2});
  assert.equal(result.report.accepted,true);
  const solution=result.graph.solution(result.graph.points,result.phase,input);
  assert.equal(validate(solution,cfg).passed,true);assert.equal(materialAudit(solution,cfg).passed,true);
  const replay=await renderExportedWeave(solutionJSON(solution),400);
  assert.deepEqual(replay.mask,source.mask,'A different assignment must preserve the actual woven image.');
  assert.deepEqual(solutionJSON(proposal),before);assert.deepEqual(proposal.graph.target.curves,curves);
  assert.deepEqual(input.sourceImage,source,'Noding the proposal must not mutate the source or original fallback.');
});

test('a close-looking proposal cannot override the original image or a requested symmetry',async()=>{
  const {proposal,input}=loopProposal(),cfg=settings({...AUTOMATIC_PRESET,trials:0});
  const original=input.sourceImage.mask.slice();
  for(let i=0;i<original.length;i++)input.sourceImage.mask[i]=1-original[i];
  const mismatch=await rerouteFittedBoundary(proposal,input,cfg,{seconds:2});
  assert.equal(mismatch.report.accepted,false);assert.equal(mismatch.graph,undefined);
  assert.equal(mismatch.report.proposalError,1);assert.equal(mismatch.report.solver,undefined);
  input.sourceImage.mask.set(original);
  const symmetry=await rerouteFittedBoundary(proposal,input,settings({...cfg,symmetry:{transpose:true}}),{seconds:2});
  assert.equal(symmetry.graph,undefined,'This independent rerouting cannot silently drop requested cutting symmetry.');
  const exhausted=await rerouteFittedBoundary(proposal,input,cfg,{seconds:0});
  assert.equal(exhausted.graph,undefined);assert.equal(exhausted.report.solver,undefined);
});

for(const timeLimit of [10,180])test(`a fresh shifted bird fit preserves its eye with a ${timeLimit}-second allowance`,async()=>{
  const fixture=JSON.parse(await fs.readFile('scripts/inverse/fixtures/photographic-bird-fit.json'));
  const catalogue=JSON.parse(await fs.readFile(fixture.sourceCatalogue)),photo=await readHardPhoto(catalogue.source);
  const cfg={...AUTOMATIC_PRESET,timeLimit,trials:0,earlyStop:false};
  const crop=prepare({...photo,quad:fixture.quad.map(([x,y])=>[x+1,y])},cfg);
  assert.equal(createHash('sha256').update(crop.preview.mask).digest('hex'),'bc122e4659773ece5abab69eae4934c528c8eba8feda8c0aa92d5e6ba86afe91');
  const prepared=prepare({type:'mask',mask:crop.preview.mask,resolution:400},cfg),source=prepared.target.sourceImage;
  const mask=source.mask.slice(),probability=source.probability.slice(),checkpoints=[];
  const answer=await design(prepared.target,cfg,()=>{},{onCandidate:c=>checkpoints.push(c)}),solver=answer.report.solver;
  // The deterministic crossing fixture above exercises rerouting directly.
  // A timed fresh fit can also find a valid feature-preserving grid without
  // first crossing the eye. Judge both by the same exported shape below.
  if(solver.selectedInitialization==='fitted-boundary-rerouting'){
    const detail=solver.featureDetailAttempts.find(a=>a.rerouting?.refinementAccepted);
    assert.ok(detail.checkpoints.some(c=>!c.geometry&&c.issues.some(i=>i.type==='self_intersection')));
    assert.equal(detail.rerouting.featuresPassed,true);
  }
  assert.ok(solver.seconds<(timeLimit===10?10:30),'A longer allowance must not omit the useful fast initialization.');assert.equal(answer.report.templateChecksPassed,true);
  assert.equal(answer.report.validation.passed,true);assert.equal(answer.report.manufacturing.status,'pass');
  assert.ok(checkpoints.some(c=>c.materialResolution===700&&c.error<.03),'Stop must receive an independently checked candidate.');
  for(const resolution of [400,800]){
    const rendered=await renderExportedWeave(answer.files['cut_geometry.json'],resolution);
    const expected=Uint8Array.from({length:resolution**2},(_,i)=>mask[Math.floor(Math.floor(i/resolution)*400/resolution)*400+Math.floor((i%resolution)*400/resolution)]);
    const error=rendered.mask.reduce((sum,v,i)=>sum+Number(v!==expected[i]),0)/expected.length;
    assert.ok(error<.027,'The legal routing must retain the original-image quality.');
    const eye=featureComponentMetrics({mask:expected,resolution},rendered.mask).find(f=>f.centerMm[0]<30);
    assert.equal(eye.touchesBorder,false);assert.ok(eye.retention>=.9);
    assert.ok(eye.componentIoU>.85,'Retaining the eye must also preserve its shape, without inflating it into surrounding paper.');
  }
  assert.deepEqual(source.mask,mask);assert.deepEqual(source.probability,probability);
});
