import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {curvesOf,loadSolutionJSON,solutionJSON} from '../../static/inverse/core/graph.js';
import {settings} from '../../static/inverse/core/settings.js';
import {sampleWeave,validate} from '../../static/inverse/core/validate.js';
import {materialAudit} from '../../static/inverse/core/material.js';
import {finalizeShared,shareReplacement} from '../../static/inverse/core/direct/share.js';
import {finalizeFittedSolution} from '../../static/inverse/core/direct/finalize.js';
import {CurveGraph} from '../../static/inverse/core/direct/curves.js';
import {Cubic} from '../../static/inverse/core/bezier.js';
import {matchingSummary} from '../../static/inverse/core/direct/matching.js';
import {symmetryReport} from '../../static/inverse/core/direct/symmetry.js';
import {maskDisagreement} from '../../static/inverse/core/direct/prefer-matching.js';
import {resize} from '../../static/inverse/core/direct/math.js';
import {renderExportedWeave} from './export-renderer.mjs';

const fixture=JSON.parse(await fs.readFile(new URL('./fixtures/free-border-hat.json',import.meta.url)));
const cfg=settings(fixture.settings);
function hat(){
  const solution=loadSolutionJSON(fixture.geometry),{resolution,maskRuns}=fixture.source,mask=new Uint8Array(resolution**2);
  let offset=0;for(let i=0;i<maskRuns.length;i+=2){mask.fill(maskRuns[i],offset,offset+maskRuns[i+1]);offset+=maskRuns[i+1];}
  assert.equal(offset,mask.length);
  solution.graph.target.sourceImage={resolution,mask,probability:Float64Array.from(mask)};
  return solution;
}
const hiddenLength=s=>s.graph.edges.filter(e=>!e.visible).reduce((sum,e)=>sum+e.curve.length(),0);

// A quarter turn conjugates reflection in x=y into reflection in x+y=width.
// Rotate both the photograph mask and complete geometry; no fitted answer is
// supplied to the optimizer or constructed from the repair being tested.
function turnedHat(){
  const original=hat(),w=original.graph.target.width,paths=original.paths.map((family,f)=>family.map((_,i)=>curvesOf(original,f,i).map(c=>c.p)));
  const turn=p=>p.map(c=>c.map(([x,y])=>[w-y,x])),reverse=p=>p.toReversed().map(c=>c.toReversed());
  const graph=new CurveGraph([paths[1].toReversed().map(turn),paths[0].map(p=>turn(reverse(p)))],w);
  const phase=(original.graph.target.phase?-1:1)*(paths[1].length%2?-1:1),solution=graph.solution(graph.points,phase);
  const {mask,resolution:n}=original.graph.target.sourceImage;
  solution.graph.target.sourceImage={resolution:n,mask:Uint8Array.from(mask,(_,i)=>mask[(n-1-i%n)*n+Math.floor(i/n)])};
  return solution;
}

test('sharing preserves right-angle joins and merges almost identical subdivision points',()=>{
  const vertices=[[20,0],[20,30],[70,30],[70,100]],line=(a,b)=>[a,a.map((v,i)=>v+(b[i]-v)/3),a.map((v,i)=>v+2*(b[i]-v)/3),b];
  const a=vertices.slice(1).map((p,i)=>line(vertices[i],p)),b=a.map(c=>c.map(([x,y])=>[x+.02,y]));
  const [kept]=shareReplacement(a,b,{a0:.5,a1:2.5,b0:.5+1e-8,b1:2.5+1e-8,length:100,blend:0});
  for(const points of kept){
    const c=new Cubic(points);assert.ok(c.length()>1e-4,'A nearly repeated knot must not create a microscopic cubic.');
    for(let i=0;i<=12;i++){
      const [x,y]=c.point(i/12);
      const distance=(a,b)=>{const dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(y-a[1])*dy)/(dx*dx+dy*dy)));return Math.hypot(x-a[0]-t*dx,y-a[1]-t*dy);};
      assert.ok(Math.min(...vertices.slice(1).map((p,j)=>distance(vertices[j],p)))<1e-6,'The chosen polyline must stay straight through each join.');
    }
  }
});

test('a symmetric free-border hat joins its invisible cuts without changing the template pairing',async()=>{
  const before=hat(),source=before.graph.target.sourceImage,after=finalizeShared(before,cfg);
  assert.equal(hiddenLength(before),0);
  assert.ok(hiddenLength(after)>200,'The long hat seams must become exact shared geometry.');
  assert.equal(matchingSummary(after).identical,true);
  assert.deepEqual(symmetryReport(after,cfg.symmetry).honoured,['transpose']);
  assert.equal(validate(after,cfg,{checkImage:false}).passed,true);
  assert.equal(materialAudit(after,cfg).passed,true);
  assert.ok(maskDisagreement(source,sampleWeave(after,source.resolution))<maskDisagreement(source,sampleWeave(before,source.resolution)));

  // Read the actual exported cubics with an independent rasterizer at 4× the
  // source resolution, so disappearance of subpixel seams is checked too.
  const resolution=source.resolution*4,target={mask:Uint8Array.from(resize(source.mask,source.resolution,resolution),v=>Number(v>.5))};
  const oldRaster=await renderExportedWeave(solutionJSON(before),resolution),newRaster=await renderExportedWeave(solutionJSON(after),resolution);
  // Binary thresholding hides faint hairlines and can flip a few antialiased
  // edge pixels. Fractional coverage measures those visible seams directly.
  const coverageError=r=>r.coverage.reduce((sum,v,i)=>sum+Math.abs(v-target.mask[i]),0)/target.mask.length;
  assert.ok(coverageError(newRaster)<coverageError(oldRaster));
  assert.equal(after.report.finalSharing.applied,true);
  assert.equal(finalizeShared(after,cfg),after,'Already shared spans must not be fitted and subdivided again.');
});

test('shared-cut cleanup preserves a narrow line when the input actually asks for it',()=>{
  const solution=hat(),resolution=512,mask=sampleWeave(solution,resolution);
  solution.graph.target.sourceImage={resolution,mask,probability:Float64Array.from(mask)};
  const after=finalizeShared(solution,cfg);
  assert.deepEqual(sampleWeave(after,resolution),mask);
});

test('matching hat cleanup follows physical partners after path reordering',async()=>{
  const before=hat(),source=before.graph.target.sourceImage;
  before.paths[1].push(before.paths[1].shift());
  const original=solutionJSON(before),after=finalizeShared(before,cfg);
  assert.equal(matchingSummary(before).identical,true);
  assert.equal(after.report.finalSharing.applied,true);
  assert.ok(hiddenLength(after)>200);
  assert.equal(matchingSummary(after).identical,true);
  assert.equal(validate(after,cfg,{checkImage:false}).passed,true);
  assert.equal(materialAudit(after,cfg).passed,true);
  assert.deepEqual(solutionJSON(before),original);
  const baseline=await renderExportedWeave(original,source.resolution*4),repaired=await renderExportedWeave(solutionJSON(after),source.resolution*4);
  const target=resize(source.mask,source.resolution,source.resolution*4),error=r=>r.coverage.reduce((s,v,i)=>s+Math.abs(v-Number(target[i]>.5)),0)/target.length;
  assert.ok(error(repaired)<error(baseline),'Exported curves must remove the seams without damaging the motif.');
});

test('final selection repairs seams in the matching pair that replaces an independent fit',()=>{
  const before=hat(),source=before.graph.target.sourceImage;
  // Use the current free-border objective: protect the inner 84% diamond.
  // The historical fixture also contains a checker border, whose disagreement
  // must not disqualify an otherwise valid matching pair in this mode.
  const n=source.resolution;
  source.weights=Float64Array.from(source.mask,(_,i)=>Number(Math.abs((i%n+.5)/n-.5)<=.42&&Math.abs((Math.floor(i/n)+.5)/n-.5)<=.42));
  before.graph.edges[1].curve.p[1][0]+=.02;
  assert.equal(matchingSummary(before).identical,false);
  assert.equal(hiddenLength(before),0);
  const original=solutionJSON(before),mask=source.mask.slice();
  // Exercise the common entry point used by both solve routes. Testing only
  // finalizeShared misses the original ordering bug: matching can replace
  // the previously repaired pair after the repair has already finished.
  const after=finalizeFittedSolution(before,settings({...fixture.settings,timeLimit:30}));
  assert.equal(after.report.matchingPreference.status,'matched');
  assert.equal(after.report.finalSharing.applied,true);
  assert.ok(hiddenLength(after)>200,'The selected matching templates must share the long invisible cuts.');
  assert.equal(matchingSummary(after).identical,true);
  assert.deepEqual(symmetryReport(after,cfg.symmetry).honoured,['transpose']);
  assert.equal(validate(after,cfg,{checkImage:false}).passed,true);
  assert.equal(materialAudit(after,cfg).passed,true);
  assert.ok(maskDisagreement(source,sampleWeave(after,source.resolution))<=maskDisagreement(source,sampleWeave(before,source.resolution)));
  assert.deepEqual(source.mask,mask,'Repair must leave the observed mask intact.');
  assert.deepEqual(solutionJSON(before),original,'The original fitted curves must remain available.');
});

test('the hat cleanup also works when the two sheets were fitted independently',()=>{
  const solution=hat();
  // Break transposition without breaking continuity or changing the target.
  solution.graph.edges[1].curve.p[1][0]+=.02;
  assert.equal(matchingSummary(solution).identical,false);
  const unconstrained=settings({...fixture.settings,symmetry:{},preferMatchingSheets:false});
  const after=finalizeShared(solution,unconstrained);
  assert.ok(hiddenLength(after)>200);
  assert.equal(validate(after,unconstrained,{checkImage:false}).passed,true);
  assert.equal(materialAudit(after,unconstrained).passed,true);
  const source=solution.graph.target.sourceImage;
  assert.ok(maskDisagreement(source,sampleWeave(after,source.resolution))<=maskDisagreement(source,sampleWeave(solution,source.resolution)));
});

test('an anti-paired hat joins shared spans while retaining reversed cutting paths',async()=>{
  const before=turnedHat(),source=before.graph.target.sourceImage,anti=settings({...fixture.settings,symmetry:{antiTranspose:true}}),saved=solutionJSON(before);
  assert.deepEqual(symmetryReport(before,anti.symmetry).honoured,['antiTranspose']);
  assert.equal(matchingSummary(before).identical,false);
  assert.equal(hiddenLength(before),0);
  const after=finalizeShared(before,anti);
  assert.ok(hiddenLength(after)>200,'The rotated seams must be repaired even when ordinary matching sheets are disabled.');
  assert.equal(validate(after,anti,{checkImage:false}).passed,true);
  assert.equal(materialAudit(after,anti).passed,true);
  assert.ok(maskDisagreement(source,sampleWeave(after,source.resolution))<maskDisagreement(source,sampleWeave(before,source.resolution)));
  assert.deepEqual(solutionJSON(before),saved,'Cleanup must not alter the original geometry.');
  // Check the exported partners explicitly, rather than only trusting the
  // symmetry reporter: cut order, cubic order and all four points reverse.
  const exported=loadSolutionJSON(solutionJSON(after)),n=exported.paths[0].length;
  for(let i=0;i<n;i++){
    const a=curvesOf(exported,0,i),b=curvesOf(exported,1,n-1-i).toReversed();
    assert.equal(a.length,b.length);
    for(let j=0;j<a.length;j++)for(let k=0;k<4;k++){
      const p=a[j].p[k],q=b[j].p[3-k];
      assert.ok(Math.hypot(p[0]+q[1]-100,p[1]+q[0]-100)<1e-7);
    }
  }
  const resolution=source.resolution*4,target=Uint8Array.from(resize(source.mask,source.resolution,resolution),v=>Number(v>.5));
  const oldRaster=await renderExportedWeave(saved,resolution),newRaster=await renderExportedWeave(solutionJSON(after),resolution);
  const coverageError=r=>r.coverage.reduce((sum,v,i)=>sum+Math.abs(v-target[i]),0)/target.length;
  assert.ok(coverageError(newRaster)<coverageError(oldRaster),'Independent antialiased rendering must confirm the seam improvement.');
  assert.equal(finalizeShared(after,anti),after,'Already shared anti-paired spans must not be subdivided again.');
});

test('anti-paired sharing follows crossing positions rather than serialized path indices',()=>{
  const before=turnedHat(),anti=settings({...fixture.settings,symmetry:{antiTranspose:true}});
  before.paths[0].reverse();before.paths[1].push(before.paths[1].shift());
  assert.deepEqual(symmetryReport(before,anti.symmetry).honoured,['antiTranspose']);
  const after=finalizeShared(before,anti);
  assert.ok(hiddenLength(after)>200);
  assert.deepEqual(symmetryReport(after,anti.symmetry).honoured,['antiTranspose']);
  assert.equal(validate(after,anti,{checkImage:false}).passed,true);
  assert.equal(materialAudit(after,anti).passed,true);
});

test('shared-cut cleanup respects its budget and unsatisfied input constraints',()=>{
  const solution=hat();
  assert.equal(finalizeShared(solution,cfg,{deadline:0}),solution);
  assert.equal(finalizeShared(solution,{...cfg,symmetry:{mirrorX:true}}),solution);
  assert.equal(finalizeShared(solution,{...cfg,symmetry:{withinCurve:'sym'}}),solution);
});
