import test from 'node:test';
import assert from 'node:assert/strict';
import {CurveGraph} from '../../static/inverse/core/direct/curves.js';
import {outlineDetailPlan} from '../../static/inverse/core/direct/outline-details.js';
import {sampleWeave} from '../../static/inverse/core/validate.js';
import {settings} from '../../static/inverse/core/settings.js';
import {solutionJSON} from '../../static/inverse/core/graph.js';
import {renderExportedWeave} from './export-renderer.mjs';

const line=(a,b)=>[a,[0,1].map(i=>a[i]+(b[i]-a[i])/3),[0,1].map(i=>a[i]+2*(b[i]-a[i])/3),b];
const cfg=settings({width:100,minWidth:2}),n=200;
function fixture(){
  const shared=line([40,40],[60,60]);
  const graph=new CurveGraph([[[line([40,0],[40,40]),shared,line([60,60],[60,100])]],[[line([0,60],[60,60]),shared.toReversed(),line([40,40],[100,40])]]]);
  const mask=sampleWeave(graph.solution(graph.points,1),n);
  return{graph,source:{mask,resolution:n}};
}

test('outline detail ignores exact fits, thin fringes, and residuals confined to the border',()=>{
  const {graph,source}=fixture();
  assert.equal(outlineDetailPlan(graph,graph.points,1,source,cfg),null);
  for(let y=0;y<n;y++)source.mask[y*n+79]^=1;
  assert.equal(outlineDetailPlan(graph,graph.points,1,source,cfg),null,'A one-pixel fringe must not add cutting geometry');
  for(let y=2;y<12;y++)for(let x=20;x<180;x++)source.mask[y*n+x]^=1;
  assert.equal(outlineDetailPlan(graph,graph.points,1,source,cfg),null,'This pass preserves the outer controls');
});

test('subdivision preserves shared cuts and the current weave while fixing outer controls',async()=>{
  const {graph,source}=fixture();
  for(let y=83;y<97;y++)for(let x=85;x<109;x++)source.mask[y*n+x]^=1;
  const originalMask=source.mask.slice(),originalPoints=graph.points.slice();
  const plan=outlineDetailPlan(graph,graph.points,1,source,cfg);
  assert.ok(plan);assert.ok(plan.report.addedCurves>0&&plan.report.addedCurves<128);
  assert.deepEqual(plan.graph.families.map(f=>f.length),[1,1]);
  assert.ok(plan.graph.occurrences.filter(o=>o.length===2).length>1,'Both sheets reference each split shared curve');
  for(const size of [200,800]){
    const a=await renderExportedWeave(solutionJSON(graph.solution(graph.points,1)),size);
    const b=await renderExportedWeave(solutionJSON(plan.graph.solution(plan.graph.points,1)),size);
    assert.deepEqual(a.mask,b.mask,'Subdivision must not introduce a visible seam');
  }
  let movable=0;
  for(let i=0;i<plan.graph.points.length;i+=2){
    const x=plan.graph.points[i],y=plan.graph.points[i+1];
    if(Math.min(x,y,100-x,100-y)<plan.report.fixedBorderMm){assert.equal(plan.graph.fixed[i],1);assert.equal(plan.graph.fixed[i+1],1);}
    else if(!plan.graph.fixed[i]&&!plan.graph.fixed[i+1])movable++;
  }
  assert.ok(movable>0);assert.deepEqual(source.mask,originalMask);assert.deepEqual(graph.points,originalPoints);
});

test('outline detail leaves weighted observations and infeasible detail scales alone',()=>{
  const {graph,source}=fixture();
  for(let y=80;y<110;y++)for(let x=80;x<110;x++)source.mask[y*n+x]^=1;
  assert.equal(outlineDetailPlan(graph,graph.points,1,{...source,weights:new Float64Array(n*n).fill(1)},cfg),null);
  assert.equal(outlineDetailPlan(graph,graph.points,1,source,{...cfg,minWidth:0}),null);
  assert.equal(outlineDetailPlan(graph,graph.points,1,source,{...cfg,minWidth:20}),null);
});
