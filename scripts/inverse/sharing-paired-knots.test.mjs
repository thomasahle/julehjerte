import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadSolutionJSON,solutionJSON,curvesOf} from '../../static/inverse/core/graph.js';
import {settings} from '../../static/inverse/core/settings.js';
import {easeMetrics,sampleWeave,validate} from '../../static/inverse/core/validate.js';
import {materialAudit} from '../../static/inverse/core/material.js';
import {sharingCandidates,sharingReplacement,finalizeShared} from '../../static/inverse/core/direct/share.js';
import {CurveGraph} from '../../static/inverse/core/direct/curves.js';
import {Cubic} from '../../static/inverse/core/bezier.js';
import {matchingSummary} from '../../static/inverse/core/direct/matching.js';
import {maskDisagreement} from '../../static/inverse/core/direct/prefer-matching.js';
import {resize} from '../../static/inverse/core/direct/math.js';
import {renderExportedWeave} from './export-renderer.mjs';

const fixture=JSON.parse(await fs.readFile(new URL('./fixtures/matching-channel-seam.json',import.meta.url)));
const cfg=settings({minWidth:2,sharpTurn:60,maxTurn:175});
const hiddenLength=s=>s.graph.edges.filter(e=>!e.visible).reduce((sum,e)=>sum+e.curve.length(),0);
function channel(){
  const solution=loadSolutionJSON(fixture.geometry),{resolution,maskRuns}=fixture.source,mask=new Uint8Array(resolution**2);
  let offset=0;for(let i=0;i<maskRuns.length;i+=2){mask.fill(maskRuns[i],offset,offset+maskRuns[i+1]);offset+=maskRuns[i+1];}
  assert.equal(offset,mask.length);solution.graph.target.sourceImage={resolution,mask};return solution;
}

test('whole paired knots remove a photographed channel seam without a tight partial-cubic attachment',async()=>{
  const before=channel(),source=before.graph.target.sourceImage,saved=solutionJSON(before),mask=source.mask.slice();
  const paths=before.paths.map((f,k)=>f.map((_,i)=>curvesOf(before,k,i).map(c=>c.p)));
  const partial=sharingCandidates(paths)[0],p=sharingReplacement(paths,partial,{identicalSheets:true}),graph=new CurveGraph(p);
  assert.ok(easeMetrics(graph.solution(graph.points,1),cfg).minimumRadius<.45,'The historical nearest-point proposal must expose the tight attachment that blocked cleanup.');
  const after=finalizeShared(before,cfg);
  assert.equal(hiddenLength(before),0);assert.ok(hiddenLength(after)>58);
  assert.equal(after.report.finalSharing.applied,true);
  assert.ok(after.report.finalSharing.accepted.some(c=>c.proposal==='paired-knots'));
  assert.equal(matchingSummary(after).identical,true);
  assert.ok(easeMetrics(after,cfg).minimumRadius>=easeMetrics(before,cfg).minimumRadius);
  assert.equal(validate(after,cfg,{checkImage:false}).passed,true);assert.equal(materialAudit(after,cfg).passed,true);
  assert.ok(maskDisagreement(source,sampleWeave(after,source.resolution))<maskDisagreement(source,sampleWeave(before,source.resolution)));
  assert.deepEqual(source.mask,mask);assert.deepEqual(solutionJSON(before),saved);
  const n=source.resolution*4,a=await renderExportedWeave(saved,n),b=await renderExportedWeave(solutionJSON(after),n);
  const target=resize(mask,source.resolution,n),error=r=>r.coverage.reduce((sum,v,i)=>sum+Math.abs(v-Number(target[i]>.5)),0)/target.length;
  assert.ok(error(b)<error(a),'Independent exported coverage must confirm removal of the visible seam.');
  // Inside the diagonal run there is no intended motif boundary. Even a
  // subpixel line must disappear from the independent antialiased renderer.
  const band=r=>{let total=0;for(let i=Math.ceil(.4*n);i<.7*n;i++)for(let d=-5;d<=5;d++)total+=1-r.coverage[i*n+i+d];return total;};
  assert.ok(band(a)>10);assert.equal(band(b),0);
  assert.equal(finalizeShared(after,cfg),after);
});

test('a paired-knot proposal cannot remove a diagonal feature requested by the source',()=>{
  const before=channel(),resolution=768,mask=sampleWeave(before,resolution);
  before.graph.target.sourceImage={resolution,mask};
  const saved=solutionJSON(before),after=finalizeShared(before,cfg);
  assert.deepEqual(sampleWeave(after,resolution),mask);
  assert.deepEqual(solutionJSON(after),saved);
  assert.equal(hiddenLength(after),0);
});

test('an entirely straight matching pair is not mistaken for a zero-radius bend',()=>{
  const pair=vertices=>{
    const p=vertices.slice(1).map((v,i)=>Cubic.line(vertices[i],v).p),g=new CurveGraph([[p],[p.map(c=>c.map(([x,y])=>[y,x]))]]);
    return g.solution(g.points,1);
  };
  const before=pair([[30,0],[30,30],[50,50.15],[70,70],[70,100]]);
  const reference=pair([[30,0],[30,30],[70,70],[70,100]]),resolution=384,mask=sampleWeave(reference,resolution);
  before.graph.target.sourceImage={resolution,mask};
  assert.equal(easeMetrics(before,cfg).minimumRadius,null);
  const after=finalizeShared(before,cfg);
  assert.equal(after.report.finalSharing.applied,true);
  assert.equal(easeMetrics(after,cfg).minimumRadius,null);
  assert.ok(hiddenLength(after)>56);
  assert.equal(matchingSummary(after).identical,true);
  assert.deepEqual(sampleWeave(after,resolution),mask);
  assert.equal(validate(after,cfg,{checkImage:false}).passed,true);
});
