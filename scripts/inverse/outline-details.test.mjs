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

test('a crowded residual cannot spend an unbounded number of new curve pieces',()=>{
  const graph=new CurveGraph([Array.from({length:12},(_,i)=>[line([10+7*i,0],[10+7*i,100])]),Array.from({length:12},(_,i)=>[line([0,10+7*i],[100,10+7*i])])]);
  const mask=sampleWeave(graph.solution(graph.points,1),n),points=graph.points.slice();
  for(let y=30;y<170;y++)for(let x=30;x<170;x++)mask[y*n+x]^=1;
  const source={mask,resolution:n},before=mask.slice();
  assert.equal(outlineDetailPlan(graph,graph.points,1,source,cfg),null);
  assert.deepEqual(mask,before);assert.deepEqual(graph.points,points);
});

for(const family of [0,1])test(`detailed polishing releases a defective fold without releasing endpoints on sheet ${family}`,async()=>{
  const {polishCandidate}=await import('../../static/inverse/core/direct/polish.js');
  const {geometricMaterialAudit,finalMaterialAudit}=await import('../../static/inverse/core/geometric-material.js');
  const {materialAudit}=await import('../../static/inverse/core/material.js');
  const {renderCurves}=await import('../../static/inverse/core/direct/curves.js');
  const {loadNumericalKernel}=await import('../../static/inverse/core/numerical-kernel.js');
  const local=settings({algorithm:'auto',preferMatchingSheets:false,roundHidden:false,trials:0,maxTurn:175,localNeighborhoodFactor:8});
  const chain=p=>p.slice(1).map((v,i)=>line(p[i],v));
  const hook=chain([[20,0],[20,40],[20,60],[20,98.8],[30,98.5],[75,98.5],[85,98.8],[90,100]]);
  const target=chain([[20,0],[23,40],[23,60],[20,96],[30,96],[75,96],[85,96],[90,100]]),other=[line([0,50],[100,50])];
  const paths=cut=>family===0?[[cut],[other]]:[[other.map(c=>c.map(([x,y])=>[y,x]))],[cut.map(c=>c.map(([x,y])=>[y,x]))]];
  const graph=new CurveGraph(paths(hook)),truth=new CurveGraph(paths(target));
  const probability=Float64Array.from(renderCurves(truth,truth.points,1,n)),source={resolution:n,mask:Uint8Array.from(probability),probability},input={width:100,sourceImage:source,metadata:{}};
  const before=graph.points.slice(),fixed=graph.fixed.slice(),sourceBefore=structuredClone(source);
  const initial=graph.solution(graph.points,1,input);
  assert.equal(materialAudit(initial,local).passed,true,'The coarse lattice misses this thin fold island.');
  assert.equal(geometricMaterialAudit(initial,local).passed,false);
  const error=renderCurves(graph,graph.points,1,n).reduce((sum,v,i)=>sum+Number(v!==source.mask[i]),0)/(n*n);
  assert.ok(error>.03&&error<.04,'Use the existing close-fit allowance; the image acceptance limit stays 3%.');
  await loadNumericalKernel();
  const candidate={graph,points:graph.points,phase:1,counts:[1,1],geometryPassed:true,paperPassed:true,originalFeatures:{passed:true},originalImageError:error,imagePassed:false};
  const result=polishCandidate(candidate,probability,n,local,{input,steps:160,selection:'mask'});
  assert.deepEqual(result.outlineDetail.paperRecovery.foldFamilies,[family]);
  assert.ok(result.outlineDetail.paperRecovery.releasedCoordinates>0);
  assert.equal(result.history[0].paper,'fail','An invalid starting fit must not become a safe rollback point.');
  assert.equal(result.paperPassed,true);
  const solution=result.graph.solution(result.points,1,input);
  assert.equal(finalMaterialAudit(solution,local).passed,true);
  const endpoints=new CurveGraph(result.graph.nested());
  for(let i=0;i<endpoints.fixed.length;i++)if(endpoints.fixed[i]){
    assert.equal(result.graph.fixed[i],1);assert.equal(result.points[i],result.graph.points[i]);
  }
  const rendered=await renderExportedWeave(solutionJSON(solution),n);
  assert.ok(rendered.mask.reduce((sum,v,i)=>sum+Number(v!==source.mask[i]),0)/(n*n)<.005);
  assert.deepEqual(graph.points,before);assert.deepEqual(graph.fixed,fixed);assert.deepEqual(source,sourceBefore);
});
