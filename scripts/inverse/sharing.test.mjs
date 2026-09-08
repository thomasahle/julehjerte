import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadSolutionJSON,solutionJSON} from '../../static/inverse/core/graph.js';
import {settings} from '../../static/inverse/core/settings.js';
import {sampleWeave,validate} from '../../static/inverse/core/validate.js';
import {materialAudit} from '../../static/inverse/core/material.js';
import {finalizeShared,shareReplacement} from '../../static/inverse/core/direct/share.js';
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

test('shared-cut cleanup respects its budget and unsupported symmetry constraints',()=>{
  const solution=hat();
  assert.equal(finalizeShared(solution,cfg,{deadline:0}),solution);
  assert.equal(finalizeShared(solution,{...cfg,symmetry:{mirrorX:true}}),solution);
});
