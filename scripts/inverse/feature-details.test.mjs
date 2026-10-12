import test from 'node:test';
import assert from 'node:assert/strict';
import {CurveGraph} from '../../static/inverse/core/direct/curves.js';
import {featureDetailPlan,smallInteriorFeatures} from '../../static/inverse/core/direct/feature-details.js';
import {imageFeatures,auditImageFeatures} from '../../static/inverse/core/image-features.js';
import {settings} from '../../static/inverse/core/settings.js';
import {solutionJSON} from '../../static/inverse/core/graph.js';
import {renderExportedWeave} from './export-renderer.mjs';
import {featureComponentMetrics} from './feature-component-metrics.mjs';

const line=(a,b)=>[a,[0,1].map(i=>a[i]+(b[i]-a[i])/3),[0,1].map(i=>a[i]+2*(b[i]-a[i])/3),b];
const cfg=settings({width:100,minWidth:2}),n=200;
function artwork(){
  const mask=new Uint8Array(n*n).fill(1);
  for(let y=0;y<n;y++)for(let x=0;x<n;x++)for(const [cx,cy,r]of [[50,50,1.5],[3,30,1.5],[80,80,6]])if(Math.hypot((x+.5)/2-cx,(y+.5)/2-cy)<r)mask[y*n+x]=0;
  return{mask,probability:Float32Array.from(mask),resolution:n};
}

test('local detail preserves exact shared geometry and source colours while weighting both sides of a small shape',async()=>{
  const source=artwork(),original=source.mask.slice(),features=imageFeatures(source),shared=line([45,45],[55,55]);
  const selected=smallInteriorFeatures(source,features,cfg);
  assert.equal(selected.length,1,'Large regions and near-border fragments do not request extra detail');
  assert.deepEqual(selected[0].centerMm,[50,50]);
  const graph=new CurveGraph([[[line([45,0],[45,45]),shared,line([55,55],[55,100])]],[[line([0,55],[55,55]),shared.toReversed(),line([45,45],[100,45])]]]);
  const before=graph.points.slice(),plan=featureDetailPlan(graph,before,source,features,cfg,n);
  assert.ok(plan);assert.ok(plan.graph.edges.length>graph.edges.length);
  assert.ok(plan.graph.occurrences.filter(o=>o.length===2).length>1,'Both sheets must reuse the same split edge in opposite directions');
  assert.deepEqual(plan.graph.families.map(f=>f.length),[1,1]);
  for(const size of [200,800]){
    const a=await renderExportedWeave(solutionJSON(graph.solution(before,1)),size);
    const b=await renderExportedWeave(solutionJSON(plan.graph.solution(plan.graph.points,1)),size);
    assert.deepEqual(a.mask,b.mask,'Exact subdivision must not create a visible seam');
  }
  assert.equal(plan.objective.weights[100*n+104],1,'Protect opposite-colour pixels just outside the opening');
  assert.equal(source.mask[100*n+104],1);assert.equal(plan.objective.weights[100*n+115],1/16);
  assert.deepEqual(plan.objective.probability,Float64Array.from(source.probability));
  assert.deepEqual(source.mask,original);assert.deepEqual(graph.points,before);
});

test('component overlap exposes an unwanted connection that pixel retention cannot detect',()=>{
  const source=artwork(),woven=source.mask.slice();
  for(let x=0;x<100;x++)woven[100*n+x]=0;
  assert.equal(auditImageFeatures(source,woven).passed,true);
  const eye=featureComponentMetrics(source,woven).find(f=>f.centerMm[0]===50);
  assert.equal(eye.retention,1);assert.equal(eye.touchesBorder,true);assert.ok(eye.componentIoU<.3);
  const exact=featureComponentMetrics(source,source.mask).find(f=>f.centerMm[0]===50);
  assert.equal(exact.componentIoU,1);assert.equal(exact.touchesBorder,false);
});
