import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {Cubic} from '../../static/inverse/core/bezier.js';
import {reindex,inspectBoundaryEndpoints,boundaryEndpoints} from '../../static/inverse/core/graph.js';
import {settings} from '../../static/inverse/core/settings.js';
import {AUTOMATIC_PRESET} from '../../static/inverse/core/presets.js';
import {prepare} from '../../static/inverse/core/engine.js';
import {recoverImageFeatures} from '../../static/inverse/core/feature-recovery.js';

const graphOf=lines=>reindex({target:{width:100},edges:lines.map(([a,b])=>({curve:Cubic.line(a,b),visible:true}))});

test('endpoint inspection separates inconsistent counts from narrow strips',()=>{
  const graph=graphOf([[[20,0],[20,100]],[[40,0],[40,80]]]);
  const {issue}=inspectBoundaryEndpoints(graph,2.5);
  assert.equal(issue.type,'endpoint_count');assert.equal(issue.family,0);
  assert.equal(issue.startCount,2);assert.equal(issue.endCount,1);
  assert.throws(()=>boundaryEndpoints(graph),error=>error.boundaryIssue.type==='endpoint_count'&&error.message===issue.message);
});

test('endpoint spacing is checked on all four sides and against the paper edge',()=>{
  let lines=[[[20,0],[20,100]],[[40,0],[21.5,100]]];
  for(let turn=0;turn<4;turn++){
    const graph=graphOf(lines),before=graph.edges.map(e=>e.curve.p.map(p=>p.slice()));
    const {issue}=inspectBoundaryEndpoints(graph,2.5);
    assert.equal(issue.type,'endpoint_spacing');assert.equal(issue.outerMargin,false);
    assert.equal(issue.distanceMm,1.5);assert.equal(issue.requiredMm,2.5);
    assert.deepEqual(graph.edges.map(e=>e.curve.p),before);
    lines=lines.map(line=>line.map(([x,y])=>[100-y,x]));
  }
  const outer=inspectBoundaryEndpoints(graphOf([[[1,0],[20,100]]]),2.5).issue;
  assert.equal(outer.type,'endpoint_spacing');assert.equal(outer.outerMargin,true);
  assert.deepEqual(outer.positionsMm,[0,1]);
});

test('hidden connectors cannot change endpoint feasibility and passing is only a necessary condition',()=>{
  const graph=graphOf([[[20,0],[40,100]],[[40,0],[20,100]]]);
  const before=inspectBoundaryEndpoints(graph,2.5);
  assert.equal(before.issue,null,'Well-spaced endpoints do not certify these crossing interior paths.');
  graph.edges.push({curve:Cubic.line([30,0],[30,100]),visible:false});reindex(graph);
  assert.deepEqual(inspectBoundaryEndpoints(graph,2.5),before);
  assert.equal(inspectBoundaryEndpoints(graphOf([[[20,0],[22.5,100]],[[22.5,0],[25,100]]]),2.5).issue,null,'The check must not impose a larger strip width than requested.');
});

test('a captured photographic star rejects impossible endpoint seeds before connector and MILP work',async()=>{
  const fixture=JSON.parse(await fs.readFile(new URL('./fixtures/photographic-star-boundary.json',import.meta.url))),n=fixture.resolution,mask=new Uint8Array(n*n);
  for(const [start,length]of fixture.maskRuns)mask.fill(1,start,start+length);
  assert.equal(createHash('sha256').update(mask).digest('hex'),fixture.maskSha256);
  const cfg=settings({...AUTOMATIC_PRESET,timeLimit:10,trials:0,earlyStop:false}),input=prepare({type:'mask',mask,resolution:n},cfg).target,source=input.sourceImage;
  const before=source.mask.slice(),probability=source.probability.slice(),stages=[];
  const result=await recoverImageFeatures(input,cfg,5,r=>stages.push(r.stage));
  assert.equal(result.solution,null);assert.equal(result.refinementSeed,undefined);
  assert.equal(result.report.attempts[0].boundaryIssue.type,'endpoint_count');
  const narrow=result.report.attempts.filter(a=>a.boundaryIssue?.type==='endpoint_spacing');
  assert.ok(narrow.length>0);assert.ok(narrow.every(a=>a.boundaryIssue.distanceMm===1.5&&a.boundaryIssue.requiredMm===cfg.nominalWidth));
  assert.ok(result.report.attempts.every(a=>a.stage==='boundary'&&!a.solver));
  assert.ok(!stages.some(s=>['connectors','model','solving'].includes(s)));
  assert.deepEqual(source.mask,before);assert.deepEqual(source.probability,probability);
});
