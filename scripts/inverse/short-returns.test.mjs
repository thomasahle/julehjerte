import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {Cubic} from '../../static/inverse/core/bezier.js';
import {loadSolutionJSON,solutionJSON,curvesOf} from '../../static/inverse/core/graph.js';
import {CurveGraph} from '../../static/inverse/core/direct/curves.js';
import {shortReturnProposal,finalizeShortReturns} from '../../static/inverse/core/direct/short-returns.js';
import {matchingSummary} from '../../static/inverse/core/direct/matching.js';
import {symmetryReport} from '../../static/inverse/core/direct/symmetry.js';
import {sampleWeave,validate} from '../../static/inverse/core/validate.js';
import {settings} from '../../static/inverse/core/settings.js';
import {AUTOMATIC_PRESET} from '../../static/inverse/core/presets.js';
import {materialAudit} from '../../static/inverse/core/material.js';
import {auditFeatureFidelity} from '../../static/inverse/core/feature-shapes.js';
import {renderExportedWeave} from './export-renderer.mjs';

const cfg=settings({...AUTOMATIC_PRESET,preferMatchingSheets:false,trials:0});
const line=(a,b)=>Cubic.line(a,b).p;
const chain=p=>p.slice(1).map((b,i)=>line(p[i],b));
const A=chain([[50,0],[50,45],[52,47],[50,46],[50,100]]);
const transpose=path=>path.map(c=>c.map(([x,y])=>[y,x]));

const visibleFixture=JSON.parse(await fs.readFile(new URL('./fixtures/visible-shared-return.json',import.meta.url)));
function visibleReturn(){
  const solution=loadSolutionJSON(visibleFixture.geometry),{resolution,maskRuns}=visibleFixture.source,mask=new Uint8Array(resolution**2);
  let offset=0;for(let i=0;i<maskRuns.length;i+=2){mask.fill(maskRuns[i],offset,offset+maskRuns[i+1]);offset+=maskRuns[i+1];}
  assert.equal(offset,mask.length);solution.graph.target.sourceImage={resolution,mask};return solution;
}

test('a visible outline return across two sheets contracts its real shared junction',()=>{
  const before=visibleReturn(),graph=new CurveGraph(before.paths.map((f,k)=>f.map((_,i)=>curvesOf(before,k,i).map(c=>c.p)))),points=graph.points.slice();
  assert.equal(shortReturnProposal(graph,points,settings(visibleFixture.settings)),null,'Paper paths alone do not expose the visible return.');
  const proposal=shortReturnProposal(graph,points,settings(visibleFixture.settings),{source:before.graph.target.sourceImage});
  assert.ok(proposal);assert.equal(proposal.visibleBoundaryContractions,2);
  assert.equal(proposal.removedOccurrences,2);assert.equal(proposal.segmentsAfter,proposal.segmentsBefore-2);
  assert.deepEqual(graph.points,points,'Proposing a contraction must not move the incumbent.');
});

test('visible shared-junction cleanup improves the independently rendered star without weakening paper checks',async()=>{
  const before=visibleReturn(),cfg=settings(visibleFixture.settings),source=before.graph.target.sourceImage,mask=source.mask.slice(),saved=solutionJSON(before);
  const after=finalizeShortReturns(before,cfg),report=after.report.shortReturnRepair;
  assert.equal(report.applied,true);assert.equal(report.visibleBoundaryContractions,2);
  const a=await renderExportedWeave(saved,source.resolution),b=await renderExportedWeave(solutionJSON(after),source.resolution);
  const error=r=>r.mask.reduce((sum,v,i)=>sum+Number(v!==mask[i]),0)/mask.length;
  assert.ok(error(b)<.0045&&error(b)<.85*error(a),'Removing both backtracks must improve the independent source comparison.');
  assert.ok(validate(after,cfg,{checkImage:false}).passed);assert.equal(materialAudit(after,cfg).status,'pass');
  assert.ok(auditFeatureFidelity(source,b.mask,cfg).passed);
  assert.deepEqual(source.mask,mask);assert.deepEqual(solutionJSON(before),saved);
});

test('visible return cleanup retains a notch that the source actually requests',()=>{
  const before=visibleReturn(),cfg=settings(visibleFixture.settings),resolution=400,mask=sampleWeave(before,resolution);
  before.graph.target.sourceImage={resolution,mask};
  const after=finalizeShortReturns(before,cfg);
  assert.deepEqual(sampleWeave(after,resolution),mask,'A cross-sheet shortcut receives no allowance to erase the source drawing.');
});

test('one-pixel source shifts do not turn a requested shared-junction corner into a return proposal',()=>{
  const before=visibleReturn(),cfg=settings(visibleFixture.settings),resolution=400,mask=sampleWeave(before,resolution);
  const graph=new CurveGraph(before.paths.map((f,k)=>f.map((_,i)=>curvesOf(before,k,i).map(c=>c.p))));
  for(const [dx,dy]of [[0,0],[-1,0],[1,0],[0,-1],[0,1]]){
    const shifted=Uint8Array.from(mask,(_,i)=>mask[Math.max(0,Math.min(resolution-1,Math.floor(i/resolution)+dy))*resolution+Math.max(0,Math.min(resolution-1,i%resolution+dx))]);
    assert.equal(shortReturnProposal(graph,graph.points,cfg,{source:{mask:shifted,resolution}}),null,`${dx},${dy}`);
  }
});

test('unobserved source pixels cannot justify a cross-sheet boundary contraction',()=>{
  const before=visibleReturn(),cfg=settings(visibleFixture.settings),source=before.graph.target.sourceImage;
  const graph=new CurveGraph(before.paths.map((f,k)=>f.map((_,i)=>curvesOf(before,k,i).map(c=>c.p))));
  for(const field of ['weights','validMask']){
    assert.equal(shortReturnProposal(graph,graph.points,cfg,{source:{...source,[field]:new Uint8Array(source.mask.length)}}),null);
  }
});

test('visible returns leave the shared-alignment reserve untouched when no refinement time remains',t=>{
  t.mock.method(performance,'now',()=>0);
  const before=visibleReturn(),saved=solutionJSON(before);let checkpoints=0;
  const after=finalizeShortReturns(before,settings(visibleFixture.settings),{
    deadline:1000,visibleDeadline:200,completionDeadline:1500,onProgress:()=>checkpoints++,
  });
  assert.equal(after,before);assert.equal(checkpoints,0);
  assert.deepEqual(solutionJSON(after),saved,'A deferred topology search must leave all shared branches untouched.');
});

test('visible return refinement observes its earlier cutoff while retaining a completed checkpoint',t=>{
  let now=0;t.mock.method(performance,'now',()=>now);
  const before=visibleReturn(),after=finalizeShortReturns(before,settings(visibleFixture.settings),{
    deadline:2000,visibleDeadline:1000,completionDeadline:2500,
    onProgress:r=>{if(r.step===40)now=801;},
  });
  const report=after.report.shortReturnRepair;
  assert.equal(report.refinementSteps,45,'The visible repair must stop before spending the later shared-alignment allowance.');
  assert.equal(report.applied,true);assert.equal(report.visibleBoundaryContractions,2);
  assert.ok(report.sourceErrorAfter<report.sourceErrorBefore);
});

test('a short return becomes a span while matching sheets stay identical',()=>{
  const graph=new CurveGraph([[A],[transpose(A)]]),original=graph.points.slice(),p=shortReturnProposal(graph,graph.points,cfg);
  assert.ok(p);assert.equal(p.removedOccurrences,2);assert.equal(p.segmentsAfter,p.segmentsBefore-2);
  const result=p.graph.solution(p.graph.points,1);
  assert.ok(matchingSummary(result).identical);assert.ok(validate(result,cfg).passed);
  assert.deepEqual(graph.points,original);
});

test('a narrow return is found when both fitted spans exceed one strip width',()=>{
  const broad=[line([50,0],[50,45]),
    [[50,45],[49,44],[50,45],[52,47]],
    [[52,47],[50,45],[49,45],[50,46]],
    line([50,46],[50,100])];
  const graph=new CurveGraph([[broad],[transpose(broad)]]),p=shortReturnProposal(graph,graph.points,cfg);
  assert.ok(p);assert.equal(p.removedOccurrences,2);assert.equal(p.segmentsAfter,p.segmentsBefore-2);
});

for(const reverse of [false,true])test(`a ${reverse?'reversed':'forward'} shared return is replaced exactly once`,()=>{
  const common=reverse?A.slice(1,3).toReversed().map(c=>c.toReversed()):A.slice(1,3);
  const B=[line([0,common[0][0][1]],common[0][0]),...common,line(common.at(-1)[3],[100,common.at(-1)[3][1]])];
  const graph=new CurveGraph([[A],[B]]),p=shortReturnProposal(graph,graph.points,cfg);
  assert.ok(p);assert.equal(p.segmentsAfter,p.segmentsBefore-1);assert.equal(p.removedOccurrences,2);
  const shared=p.graph.occurrences.map((o,e)=>[o,e]).filter(([o])=>o.length===2);
  assert.equal(shared.length,1);assert.equal(p.graph.visible[shared[0][1]],false);
  assert.ok(validate(p.graph.solution(p.graph.points,1),cfg).passed);
});

test('contracting a return keeps its shared incoming curve connected to the other sheet',()=>{
  const B=[line([0,45],[50,45]),A[1],line([52,47],[100,47])];
  const graph=new CurveGraph([[A],[B]]),p=shortReturnProposal(graph,graph.points,cfg);
  assert.ok(p);assert.equal(p.removedOccurrences,1);
  const shared=p.graph.occurrences.map((o,e)=>[o,e]).filter(([o])=>o.length===2);
  assert.equal(shared.length,1);
  const control=p.graph.controls()[shared[0][1]];
  assert.ok(control.some(([x,y])=>x===50&&y===46),'The shared branch follows the contracted edge.');
  assert.ok(validate(p.graph.solution(p.graph.points,1),cfg).passed);
});

test('a path branching at the spur pins that geometric junction',()=>{
  const B=chain([[0,47],[52,47],[100,47]]),graph=new CurveGraph([[A],[B]]);
  assert.equal(shortReturnProposal(graph,graph.points,cfg),null);
});

for(const [name,points]of [
  ['right angle',[[50,0],[50,45],[51,45],[51,100]]],
  ['long detour',[[50,0],[50,30],[65,45],[50,35],[50,100]]],
  ['closed detour',[[50,0],[50,45],[52,47],[50,45],[50,100]]],
])test(`${name} is not a short-return shortcut`,()=>{
  const graph=new CurveGraph([[chain(points)],[chain([[0,70],[100,70]])]]);
  assert.equal(shortReturnProposal(graph,graph.points,cfg),null);
});

test('cleanup cannot trade away a drawn feature for a simpler cut',()=>{
  const graph=new CurveGraph([[A],[chain([[0,70],[100,70]])]]),seed=graph.solution(graph.points,1),mask=sampleWeave(seed,400);
  seed.graph.target.sourceImage={mask,resolution:400};
  const result=finalizeShortReturns(seed,cfg),after=sampleWeave(result,400);
  assert.deepEqual(after,mask,'No extra mask disagreement is granted for pruning a return.');
});

for(const mode of ['sym','anti'])test(`paired return contractions retain Within curve ${mode}`,()=>{
  const first=[[50,0],[50,30],[52,32],[50,31]];
  const a=chain([...first,...first.toReversed().map(([x,y])=>[mode==='anti'?100-x:x,100-y])]);
  const graph=new CurveGraph([[a],[transpose(a)]]),p=shortReturnProposal(graph,graph.points,cfg);
  assert.ok(p);assert.equal(p.removedOccurrences,4);
  const result=p.graph.solution(p.graph.points,1),symmetry=symmetryReport(result,{withinCurve:mode});
  assert.deepEqual(symmetry.honoured,symmetry.requested);
  assert.ok(matchingSummary(result).identical);assert.ok(validate(result,cfg).passed);
});

for(const overallExpired of [false,true])test(`a late repair checkpoint ${overallExpired?'respects the overall deadline':'survives the phase cutoff'}`,async t=>{
  const geometry=JSON.parse(await fs.readFile('scripts/inverse/fixtures/editor-anchor-return.json'));
  const source=JSON.parse(await fs.readFile('scripts/inverse/fixtures/anchor-upload-mask.json'));
  const seed=loadSolutionJSON({...geometry,schema:'heartcurves-2',units:'mm'}),mask=new Uint8Array(source.resolution**2);
  for(const[start,length]of source.maskRuns)mask.fill(1,start,start+length);
  seed.graph.target.sourceImage={mask,resolution:source.resolution};
  // Reproduce a checkpoint finishing just after the local cleanup allowance.
  // This is virtual elapsed time, independent of test-machine throughput.
  let now=0;t.mock.method(performance,'now',()=>now);
  const result=finalizeShortReturns(seed,cfg,{deadline:1000,visibleDeadline:0,completionDeadline:overallExpired?1000:9000,onProgress:r=>{if(r.step===120)now=1002;}});
  const report=result.report.shortReturnRepair;
  assert.equal(report.refinementSteps,125,'Further refinement stops at the phase cutoff.');
  assert.ok(report.sourceErrorAfter<report.sourceErrorBefore);
  assert.equal(report.applied,!overallExpired);
  assert.equal(report.rejection,overallExpired?'deadline':null);
  // An expired repair returns the original narrow neck. The validator now
  // catches that defect too; only the accepted repair is geometry-valid.
  assert.equal(validate(result,cfg).passed,!overallExpired);
});
