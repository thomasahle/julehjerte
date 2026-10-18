import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {CurveGraph} from '../../static/inverse/core/direct/curves.js';
import {loadSolutionJSON,curvesOf,solutionJSON} from '../../static/inverse/core/graph.js';
import {projectShortReturns} from '../../static/inverse/core/direct/short-return-project.js';
import {fittingMargin} from '../../static/inverse/core/direct/refine.js';
import {validate} from '../../static/inverse/core/validate.js';
import {materialAudit} from '../../static/inverse/core/material.js';
import {featureComponentMetrics} from '../../static/inverse/core/feature-shapes.js';
import {renderExportedWeave} from './export-renderer.mjs';
import {shortLinearControls} from '../../static/inverse/core/direct/linear-controls.js';

test('bounded mixed-return repair keeps straight joins legal and the four photographed motifs enclosed',async()=>{
  const fixture=JSON.parse(await fs.readFile('scripts/inverse/fixtures/stacked-hearts-corner-routing.json'));
  assert.equal(createHash('sha256').update(JSON.stringify(fixture.geometry)).digest('hex'),fixture.geometrySha256);
  const maskFixture=JSON.parse(await fs.readFile('scripts/inverse/fixtures/'+fixture.sourceMask));
  const mask=new Uint8Array(maskFixture.resolution**2);let offset=0,value=maskFixture.first;
  for(const run of maskFixture.runs){mask.fill(value,offset,offset+run);offset+=run;value^=1;}
  assert.equal(offset,mask.length);assert.equal(createHash('sha256').update(mask).digest('hex'),maskFixture.maskSha256);
  const proposal=loadSolutionJSON(fixture.geometry),cfg=fixture.settings;
  const graph=new CurveGraph(proposal.paths.map((family,f)=>family.map((_,i)=>curvesOf(proposal,f,i).map(c=>c.p))),cfg.width),before=graph.points.slice();
  const sourceImage={mask,resolution:maskFixture.resolution},input={...proposal.graph.target,sourceImage},phase=input.phase?-1:1;
  const initialAudit=validate(graph.solution(before,phase,input),cfg,{checkImage:false});
  assert.ok(initialAudit.issues.some(i=>i.type==='nonlocal_self_clearance'));
  assert.ok(initialAudit.issues.some(i=>i.type==='short_self_clearance'));
  assert.ok(initialAudit.issues.every(i=>['nonlocal_self_clearance','short_self_clearance'].includes(i.type)));
  assert.equal(projectShortReturns(graph,before,phase,input,cfg,{initialAudit}).report.termination,'other_geometry','The default short-return scope is unchanged.');
  const options={initialAudit,clearanceMargin:fittingMargin(cfg,cfg.width),maxIterations:128,maxMilliseconds:10000};
  const projected=projectShortReturns(graph,before,phase,input,cfg,options);
  assert.ok(projected.report.accepted,JSON.stringify(projected.report));assert.ok(projected.points);
  const solution=graph.solution(projected.points,phase,input);
  assert.equal(validate(solution,cfg).passed,true);
  assert.equal(materialAudit(solution,{...cfg,materialResolution:700}).summary.status,'pass');
  const cap=Math.min(cfg.nominalWidth,.015*graph.width);
  for(let i=0;i<before.length;i++){
    assert.ok(projected.points[i]>=before[i]-cap&&projected.points[i]<=before[i]+cap);
    if(graph.fixed[i])assert.equal(projected.points[i],before[i]);
  }
  const lines=shortLinearControls(graph,before,cfg.nominalWidth);assert.ok(lines.size>0);
  for(const [id,partners]of lines)for(let axis=0;axis<2;axis++){
    const expected=partners.reduce((sum,[other,weight])=>sum+weight*projected.points[2*other+axis],0);
    assert.ok(Math.abs(expected-projected.points[2*id+axis])<1e-10,'Short straight handles remain on their endpoint chord.');
  }
  const rendered=await renderExportedWeave(solutionJSON(solution),maskFixture.resolution);
  const error=rendered.mask.reduce((sum,v,i)=>sum+Number(v!==mask[i]),0)/mask.length;
  assert.ok(error<.026,`Measured against the original mask: ${error}`);
  const components=featureComponentMetrics(sourceImage,rendered.mask);
  // The fifth component is a checker junction, not a heart motif. It is kept
  // in the report, but ambiguous point contacts are not enclosure ground truth.
  for(const i of [0,1,3,4]){assert.equal(components[i].touchesBorder,false);assert.ok(components[i].componentIoU>.92);}
  assert.deepEqual(graph.points,before);
  assert.equal(projectShortReturns(graph,before,phase,input,cfg,{...options,deadline:-Infinity}).points,null);
  graph.fixed.fill(1);
  assert.equal(projectShortReturns(graph,before,phase,input,cfg,options).points,null,'Pinned geometry cannot be silently repaired.');
  for(const clearanceMargin of [NaN,Infinity,-1,cfg.nominalWidth/2])assert.throws(()=>projectShortReturns(graph,before,phase,input,cfg,{clearanceMargin}),RangeError);
});
