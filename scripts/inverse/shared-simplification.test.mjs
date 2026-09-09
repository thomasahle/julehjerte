import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {Cubic} from '../../static/inverse/core/bezier.js';
import {CurveGraph,renderCurves} from '../../static/inverse/core/direct/curves.js';
import {curvesOf,loadSolutionJSON,solutionJSON} from '../../static/inverse/core/graph.js';
import {sampleWeave} from '../../static/inverse/core/validate.js';
import {settings} from '../../static/inverse/core/settings.js';
import {matchingSummary} from '../../static/inverse/core/direct/matching.js';
import {symmetryReport} from '../../static/inverse/core/direct/symmetry.js';
import {finalizeShared} from '../../static/inverse/core/direct/share.js';
import {simplifySharedGraph,finalizeSharedSimplification} from '../../static/inverse/core/direct/shared-simplification.js';
import {renderExportedWeave} from './export-renderer.mjs';

const fixture=JSON.parse(await fs.readFile(new URL('./fixtures/free-border-hat.json',import.meta.url)));
function hat(turned=false){
  let solution=loadSolutionJSON(fixture.geometry);
  const {resolution,maskRuns}=fixture.source,mask=new Uint8Array(resolution**2);let offset=0;
  for(let i=0;i<maskRuns.length;i+=2){mask.fill(maskRuns[i],offset,offset+maskRuns[i+1]);offset+=maskRuns[i+1];}
  if(turned){
    const paths=solution.paths.map((family,f)=>family.map((_,i)=>curvesOf(solution,f,i).map(c=>c.p))),reverse=p=>p.toReversed().map(c=>c.toReversed()),turn=p=>p.map(c=>c.map(([x,y])=>[100-y,x]));
    const graph=new CurveGraph([paths[1].toReversed().map(turn),paths[0].map(p=>turn(reverse(p)))]),phase=(solution.graph.target.phase?-1:1)*(paths[1].length%2?-1:1);
    solution=graph.solution(graph.points,phase);
  }
  solution.graph.target.sourceImage={resolution,mask:turned?Uint8Array.from(mask,(_,i)=>mask[(resolution-1-i%resolution)*resolution+Math.floor(i/resolution)]):mask};
  return solution;
}
const visible=g=>g.controls().filter((_,i)=>g.visible[i]).map(p=>[JSON.stringify(p),JSON.stringify(p.toReversed())].sort()[0]).sort();

test('shared runs simplify once in either direction without changing visible controls or masks',()=>{
  const c=new Cubic([[30,30],[30,48],[60,42],[60,60]]),shared=Array.from({length:16},(_,i)=>c.subcurve(i/16,(i+1)/16).p),line=(a,b)=>Cubic.line(a,b).p;
  for(const backwards of [false,true]){
    const path=backwards?shared.toReversed().map(p=>p.toReversed()):shared,start=path[0][0],end=path.at(-1)[3];
    const graph=new CurveGraph([[[line([30,0],[30,30]),...shared,line([60,60],[60,100])]],[[line([0,start[1]],start),...path,line(end,[100,end[1]])]]]);
    const before=graph.points.slice(),next=simplifySharedGraph(graph,graph.points);assert.ok(next);assert.ok(next.edges.length<graph.edges.length);
    assert.deepEqual(visible(next),visible(graph));assert.deepEqual(graph.points,before);
    for(const phase of [-1,1])for(const n of [100,101,200,400])assert.deepEqual(renderCurves(next,next.points,phase,n,32),renderCurves(graph,graph.points,phase,n,32));
    assert.ok(next.occurrences.some(o=>o.length===2),'Both sheets must still refer to the same replacement geometry');
    assert.equal(simplifySharedGraph(graph,graph.points,{deadline:0}),null);
  }
});

test('shared-run simplification keeps branch anchors and actual slit endpoints',()=>{
  const c=new Cubic([[30,30],[30,48],[60,42],[60,60]]),shared=Array.from({length:16},(_,i)=>c.subcurve(i/16,(i+1)/16).p),line=(a,b)=>Cubic.line(a,b).p,branch=shared[8][0];
  const graph=new CurveGraph([[[line([30,0],[30,30]),...shared,line([60,60],[60,100])],[line(branch,[90,100])]],[[line([0,30],[30,30]),...shared,line([60,60],[100,60])]]]);
  const next=simplifySharedGraph(graph,graph.points);assert.ok(next);assert.deepEqual(visible(next),visible(graph));
  for(const pi of [0,2])assert.ok(next.paths[pi].some(([e])=>[0,3].some(k=>{const id=next.edges[e][k];return next.points[2*id]===branch[0]&&next.points[2*id+1]===branch[1];})));
});

test('matching and anti-paired hats lose redundant nodes while retaining independent exported masks',async()=>{
  for(const turned of [false,true]){
    const cfg=settings({...fixture.settings,...(turned?{symmetry:{antiTranspose:true}}:{})}),before=finalizeShared(hat(turned),cfg),saved=solutionJSON(before),after=finalizeSharedSimplification(before,cfg);
    assert.equal(after.report.finalSharedSimplification.applied,true);assert.ok(after.graph.edges.length<before.graph.edges.length*.7);
    assert.deepEqual(symmetryReport(after,cfg.symmetry).honoured,turned?['antiTranspose']:['transpose']);
    if(!turned)assert.equal(matchingSummary(after).identical,true);
    assert.deepEqual(solutionJSON(before),saved,'The original cutting geometry must remain available');
    const n=fixture.source.resolution*4,a=await renderExportedWeave(saved,n),b=await renderExportedWeave(solutionJSON(after),n);
    assert.deepEqual(b.mask,a.mask,'Exported Bézier paths must retain the high-resolution weave');
    // Preserve fractional coverage too: thresholding alone can conceal seams.
    assert.ok(b.coverage.reduce((s,v,i)=>s+Math.abs(v-a.coverage[i]),0)/b.coverage.length<.00005);
  }
});

test('expired budgets, preserved artwork and rejected paper geometry keep the original curves',()=>{
  const cfg=settings(fixture.settings),before=finalizeShared(hat(),cfg),saved=solutionJSON(before);
  assert.equal(finalizeSharedSimplification(before,cfg,{deadline:0}),before);
  before.graph.target.metadata.originalCubicsPreserved=true;assert.equal(finalizeSharedSimplification(before,cfg),before);delete before.graph.target.metadata.originalCubicsPreserved;
  const rejected=finalizeSharedSimplification(before,settings({...fixture.settings,minWidth:30}));
  assert.equal(rejected,before);assert.equal(rejected.report.finalSharedSimplification.applied,false);assert.ok(['geometry','paper'].includes(rejected.report.finalSharedSimplification.rejection));
  assert.deepEqual(solutionJSON(before),saved);assert.ok(sampleWeave(before,100).some(Boolean));
});
