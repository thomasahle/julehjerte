import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {Cubic,segmentDistance} from '../../static/inverse/core/bezier.js';
import {CurveGraph} from '../../static/inverse/core/direct/curves.js';
import {sharedShorteningProposals,finalizeSharedShortening} from '../../static/inverse/core/direct/shared-shortening.js';
import {finalizeFittedSolution} from '../../static/inverse/core/direct/finalize.js';
import {settings} from '../../static/inverse/core/settings.js';
import {sampleWeave,validate} from '../../static/inverse/core/validate.js';
import {finalMaterialAudit} from '../../static/inverse/core/geometric-material.js';
import {loadSolutionJSON,solutionJSON} from '../../static/inverse/core/graph.js';
import {renderExportedWeave} from './export-renderer.mjs';

const line=(a,b)=>Cubic.line(a,b).p;
const cfg=settings({algorithm:'direct',roundHidden:false,trials:0,maxTurn:175});
function fixture(backwards=false,curved=false){
  const shared=[line([30,70],[35,70]),line([35,70],[60,50]),line([60,50],[70,30])];
  const first=curved?[[30,0],[24,20],[34,50],[30,70]]:line([30,0],[30,70]);
  const A=[first,...shared,line([70,30],[70,100])];
  const B=backwards?[line([0,20],[70,20]),line([70,20],[70,30]),...shared.toReversed().map(c=>c.toReversed()),line([30,70],[30,80]),line([30,80],[100,80])]
    :[line([0,80],[30,80]),line([30,80],[30,70]),...shared,line([70,30],[70,20]),line([70,20],[100,20])];
  const graph=new CurveGraph([[A],[B]]),source={resolution:200,mask:sampleWeave(graph.solution(graph.points,1),200)};
  return{graph,solution:graph.solution(graph.points,1,{sourceImage:source})};
}

for(const backwards of [false,true])for(const curved of [false,true])test(`joint endpoint moves preserve the visible boundary (reversed=${backwards}, curved=${curved})`,async()=>{
  const {graph,solution}=fixture(backwards,curved),saved=solutionJSON(solution),points=graph.points.slice(),fixed=graph.fixed.slice();
  const proposals=sharedShorteningProposals(graph,graph.points,cfg);
  assert.ok(proposals.length>0&&proposals.length<=8);
  const proposal=proposals[0],next=proposal.graph.solution(proposal.graph.points,1,solution.graph.target);
  assert.ok(proposal.lengthAfter<proposal.lengthBefore-5);
  assert.equal(proposal.movedJunctions.length,2);
  for(const {before,after}of proposal.movedJunctions)assert.ok(Math.hypot(after[0]-before[0],after[1]-before[1])>0);
  assert.equal(proposal.graph.occurrences.filter(o=>o.length===2).length,1,'Both sheets share the same simplified connector.');
  const segments=s=>s.graph.edges.filter(e=>e.visible).flatMap(e=>{const p=e.curve.flatten(.00001);return p.slice(1).map((b,i)=>[p[i],b]);});
  const originalBoundary=segments(solution),newBoundary=segments(next);
  for(const [a,b]of [[originalBoundary,newBoundary],[newBoundary,originalBoundary]])for(const p of a.flat()){
    assert.ok(Math.min(...b.map(([u,v])=>segmentDistance(p,u,v)))<.00003,'Visible geometry must be unchanged after repartitioning.');
  }
  for(const n of [200,400,800]){
    const a=await renderExportedWeave(saved,n),b=await renderExportedWeave(solutionJSON(next),n);
    // Exact subdivision can change antialias rounding, never the outline.
    const mean=b.coverage.reduce((s,v,i)=>s+Math.abs(v-a.coverage[i]),0)/b.coverage.length;
    assert.ok(mean<.0001,`Exported coverage difference ${mean}`);
    for(let i=0;i<b.mask.length;i++)if(b.mask[i]!==a.mask[i])assert.ok(a.coverage[i]>0&&a.coverage[i]<1&&b.coverage[i]>0&&b.coverage[i]<1,'Only antialiased boundary pixels may change their thresholded colour.');
  }
  assert.deepEqual(graph.points,points);assert.deepEqual(graph.fixed,fixed);assert.deepEqual(solutionJSON(solution),saved);
});

test('checked shortening improves the route while preserving the mask and paper',()=>{
  const {solution}=fixture(),saved=solutionJSON(solution),source=structuredClone(solution.graph.target.sourceImage);
  const result=finalizeSharedShortening(solution,cfg),report=result.report.finalSharedShortening;
  assert.equal(report.applied,true);assert.equal(report.attempts[0].accepted,true);
  assert.ok(result.graph.edges.length<solution.graph.edges.length);
  assert.equal(validate(result,cfg,{checkImage:false,finalGeometry:true}).passed,true);
  assert.equal(finalMaterialAudit(result,cfg).status,'pass');
  for(const n of [200,400,800])assert.deepEqual(sampleWeave(result,n),sampleWeave(solution,n));
  assert.deepEqual(solutionJSON(solution),saved);assert.deepEqual(solution.graph.target.sourceImage,source);
});

test('expired requests and preserved artwork cannot move shared endpoints',()=>{
  const {graph,solution}=fixture(),saved=solutionJSON(solution);
  assert.deepEqual(sharedShorteningProposals(graph,graph.points,cfg,{deadline:0}),[]);
  assert.equal(finalizeSharedShortening(solution,cfg,{deadline:0}),solution);
  solution.graph.target.metadata.originalCubicsPreserved=true;
  assert.equal(finalizeSharedShortening(solution,cfg),solution);assert.deepEqual(solutionJSON(solution),saved);
});

test('ordinary finalization retains its export reserve instead of starting joint search',t=>{
  const {solution}=fixture(),saved=solutionJSON(solution);t.mock.method(performance,'now',()=>0);
  const after=finalizeFittedSolution(solution,cfg,{startedAt:0,timeLimit:1,searchMatching:false});
  assert.equal(after.report.finalSharedShortening,undefined);assert.deepEqual(solutionJSON(after),saved);
});

test('a joint proposal cannot waive paper width or requested symmetry',()=>{
  for(const override of [{minWidth:30},{symmetry:{transpose:true}}]){
    const {solution}=fixture(),saved=solutionJSON(solution),result=finalizeSharedShortening(solution,settings({...cfg,...override}));
    assert.equal(result,solution);assert.equal(result.report.finalSharedShortening?.applied??false,false);
    assert.ok((result.report.finalSharedShortening?.attempts||[]).every(a=>!a.accepted));assert.deepEqual(solutionJSON(result),saved);
  }
});

test('shared runs ending at paper boundaries retain their pinned endpoints',()=>{
  const shared=line([30,0],[70,30]);
  const graph=new CurveGraph([[[shared,line([70,30],[70,100])]],[[line([0,30],[30,0]),shared,line([70,30],[100,30])]]]);
  assert.deepEqual(sharedShorteningProposals(graph,graph.points,cfg),[]);
});

test('a photographed Viking shortens a shared route without losing source fidelity or paper',async t=>{
  const frozen=JSON.parse(await fs.readFile(new URL('./fixtures/shared-junction-viking.json',import.meta.url)));
  const image=JSON.parse(await fs.readFile(new URL(`./fixtures/${frozen.sourceFixture}`,import.meta.url))),mask=new Uint8Array(image.resolution**2);
  for(const[start,length]of image.maskRuns)mask.fill(1,start,start+length);
  assert.equal(createHash('sha256').update(mask).digest('hex'),frozen.sourceMaskSha256);
  const before=loadSolutionJSON(frozen.geometry),saved=solutionJSON(before),source={resolution:image.resolution,mask},sourceBefore=structuredClone(source);
  before.graph.target.sourceImage=source;
  t.mock.method(performance,'now',()=>0);
  const after=finalizeSharedShortening(before,frozen.settings,{deadline:2000}),report=after.report.finalSharedShortening;
  assert.equal(report.applied,true);const accepted=report.attempts.find(a=>a.accepted);
  assert.ok(accepted.lengthBeforeMm-accepted.lengthAfterMm>.3);
  assert.ok(accepted.imageErrorAfter<=accepted.imageErrorBefore);
  assert.equal(validate(after,frozen.settings,{checkImage:false,finalGeometry:true}).passed,true);
  assert.equal(finalMaterialAudit(after,frozen.settings).status,'pass');
  const n=image.resolution*2,a=await renderExportedWeave(saved,n),b=await renderExportedWeave(solutionJSON(after),n);
  assert.ok(b.coverage.reduce((s,v,i)=>s+Math.abs(v-a.coverage[i]),0)/b.coverage.length<.00001);
  const errors=[a,b].map(rendered=>rendered.mask.reduce((s,v,i)=>s+Number(v!==mask[Math.floor(Math.floor(i/n)/2)*image.resolution+Math.floor((i%n)/2)]),0)/(n*n));
  assert.ok(errors[1]<=errors[0]+3/(n*n),'Equivalent outlines may change at most three antialiased pixel ties.');
  assert.deepEqual(solutionJSON(before),saved);assert.deepEqual(source,sourceBefore);
  t.diagnostic(JSON.stringify({lengthBefore:accepted.lengthBeforeMm,lengthAfter:accepted.lengthAfterMm,sourceError:accepted.imageErrorAfter,exportErrors:errors}));
});
