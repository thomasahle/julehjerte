import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {prepare,design} from '../../static/inverse/core/engine.js';
import {Cubic} from '../../static/inverse/core/bezier.js';
import {CurveGraph} from '../../static/inverse/core/direct/curves.js';
import {settings} from '../../static/inverse/core/settings.js';
import {preprocessMask,sampleTarget} from '../../static/inverse/core/input.js';
import {loadSolutionJSON,solutionJSON} from '../../static/inverse/core/graph.js';
import {solveGraph} from '../../static/inverse/core/solver.js';
import {progressReporter} from '../../static/inverse/core/progress.js';
import {validate} from '../../static/inverse/core/validate.js';
import {materialAudit} from '../../static/inverse/core/material.js';
import {visibleReturnEvidence,repairRejectedRouting} from '../../static/inverse/core/direct/rejected-routing.js';
import {renderExportedWeave} from './export-renderer.mjs';

const fixture=JSON.parse(await fs.readFile('scripts/inverse/fixtures/sloth-rejected-routing.json'));
const cfg=settings({...fixture.configuration,invert:false,removeSpecks:0,fillHoles:0}),n=fixture.resolution,mask=new Uint8Array(n*n);
for(const[start,length]of fixture.maskRuns)mask.fill(1,start,start+length);
assert.equal(createHash('sha256').update(mask).digest('hex'),fixture.maskSha256);
const input=()=>prepare({type:'mask',mask,resolution:n},cfg).target;
const proposal=radius=>loadSolutionJSON(fixture.seeds.find(s=>s.smoothRadius===radius).geometry);

test('visible-chain evidence detects the raster return before assigning either sheet',()=>{
  const source=input(),rows=[];
  for(const smoothRadius of [.3,.5]){
    const target=preprocessMask(mask,n,{...cfg,algorithm:'trace',fitTolerance:.75,smoothRadius,snapRadius:1.5,maxSpan:30,borderRadius:3},source.metadata.preprocessing);
    const before=target.curves.map(c=>JSON.stringify(c.p)),evidence=visibleReturnEvidence(target,cfg),woven=sampleTarget(target,n);
    rows.push({...evidence,error:woven.reduce((s,v,i)=>s+Number(v!==mask[i]),0)/mask.length});
    assert.deepEqual(target.curves.map(c=>JSON.stringify(c.p)),before);
  }
  assert.deepEqual(rows.map(r=>r.shortReturns),[2,1]);
  assert.ok(rows[1].maximumRelativeDeficit<rows[0].maximumRelativeDeficit);
  assert.ok(rows[1].error<rows[0].error);
});

for(const radius of [.3,.5])test(`continuous repair of radius ${radius} retains the original pixels and independently passes exported geometry`,async()=>{
  const source=input(),initial=proposal(radius),before=JSON.stringify(solutionJSON(initial)),probability=source.sourceImage.probability.slice();
  assert.equal(validate(initial,cfg).passed,false);
  const repaired=repairRejectedRouting(initial,source,cfg);
  assert.ok(repaired.solution,JSON.stringify(repaired.report));
  assert.equal(repaired.solution.report.status,'continuously_repaired');
  assert.equal(repaired.solution.report.mipGap,undefined,'Moved curves cannot inherit a fixed MILP optimality bound.');
  assert.equal(validate(repaired.solution,cfg).passed,true);
  assert.equal(materialAudit(repaired.solution,cfg).passed,true);
  const rendered=await renderExportedWeave(solutionJSON(repaired.solution),n);
  assert.ok(rendered.mask.reduce((s,v,i)=>s+Number(v!==mask[i]),0)/mask.length<.015);
  assert.deepEqual(source.sourceImage.mask,mask);assert.deepEqual(source.sourceImage.probability,probability);
  assert.equal(JSON.stringify(solutionJSON(initial)),before);
});

test('repair does not accept crossings, expired work, different artwork or unsupported constraints',()=>{
  const source=input(),initial=proposal(.5);
  const points=[[50,0],[50,30],[65,50],[35,50],[50,30],[50,100]];
  const graph=new CurveGraph([[points.slice(1).map((p,i)=>Cubic.line(points[i],p).p)],[[Cubic.line([0,80],[100,80]).p]]]);
  const crossing=graph.solution(graph.points,1);
  assert.ok(validate(crossing,cfg).issues.some(i=>i.type==='self_intersection'));
  const rejected=repairRejectedRouting(crossing,source,cfg);
  assert.equal(rejected.solution,null);assert.equal(rejected.report.reason,'geometry_not_repairable');
  assert.equal(repairRejectedRouting(initial,source,cfg,{deadline:performance.now()-1}).report.reason,'insufficient_time');
  assert.equal(repairRejectedRouting(initial,source,{...cfg,maxImageError:0}).report.reason,'initial_image');
  assert.equal(repairRejectedRouting(initial,source,{...cfg,symmetry:{transpose:true}}).report.reason,'unsupported_constraints');
  assert.equal(repairRejectedRouting(initial,{...source,sourceImage:{...source.sourceImage,weights:new Float32Array(n*n).fill(1)}},cfg).report.reason,'unsupported_constraints');
  assert.deepEqual(source.sourceImage.mask,mask);
});

test('observing rejected MILP geometry cannot turn it into a validated incumbent',async()=>{
  const initial=proposal(.5),packets=[];let rejected=0;
  const onProgress=progressReporter(()=>{},false,{onCandidate:packet=>packets.push(packet)});
  await assert.rejects(solveGraph(initial.graph,{...cfg,timeLimit:3},{stopAfterValidated:true,coefficientQuantum:1e-7,onProgress,
    onRejectedCandidate:async candidate=>{rejected++;assert.equal(validate(candidate,cfg).passed,false);return true;}}),error=>{
    assert.equal(error.report.status,'no_validated_solution');assert.equal(error.report.termination,'rejected_candidate_observer');return true;
  });
  assert.equal(rejected,1);assert.deepEqual(packets,[]);
});

test('a fresh solve recovers the perturbed sloth without loading either saved routing',async()=>{
  // Only source pixels reach design(): the diagnostic paths above are not
  // seeds for this test, count selection or the normal feature recovery.
  const source=input(),probability=source.sourceImage.probability.slice(),answer=await design(source,cfg);
  assert.equal(answer.report.templateChecksPassed,true);
  assert.deepEqual(answer.report.slits,{left:2,right:2});
  const recovery=answer.report.solver.featureRecovery;
  assert.equal(recovery.traceQualityPreference.preferred,true);
  assert.ok(recovery.attempts.some(a=>a.continuousRepair?.accepted));
  const rendered=await renderExportedWeave(answer.files['cut_geometry.json'],n);
  assert.ok(rendered.mask.reduce((s,v,i)=>s+Number(v!==mask[i]),0)/mask.length<.015);
  assert.deepEqual(source.sourceImage.mask,mask);assert.deepEqual(source.sourceImage.probability,probability);
});
