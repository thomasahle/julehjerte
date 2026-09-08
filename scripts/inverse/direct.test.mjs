import test from 'node:test';
import assert from 'node:assert/strict';
import {splineBasis,bernstein} from '../../static/inverse/core/direct/math.js';
import {gridModel,gridLoss,gridMask,gridPaths} from '../../static/inverse/core/direct/grid.js';
import {CurveGraph,renderCurves} from '../../static/inverse/core/direct/curves.js';
import {curvePenalty} from '../../static/inverse/core/direct/refine.js';
import {settings} from '../../static/inverse/core/settings.js';
import {boundaryGradient,boundaryValue} from '../../static/inverse/core/direct/boundary.js';
import {solutionJSON} from '../../static/inverse/core/graph.js';
import {sampleWeave} from '../../static/inverse/core/validate.js';
import {renderExportedWeave} from './export-renderer.mjs';
import {prepare,design} from '../../static/inverse/core/engine.js';
import {checkerPixels} from './fixtures.mjs';
import {supportedBorderCounts,gridFinalists,gridCountLimit} from '../../static/inverse/core/direct/fit.js';
import {shareReplacement} from '../../static/inverse/core/direct/share.js';

const near=(a,b,eps=1e-8)=>assert.ok(Math.abs(a-b)<eps,`${a} vs ${b}`);
const line=(a,b)=>[a,a.map((v,i)=>v+(b[i]-v)/3),a.map((v,i)=>v+2*(b[i]-v)/3),b];

test('dense grids expand the search only with repeated evidence on opposite sides',()=>{
  const rows=counts=>counts.flatMap((values,side)=>values.map(count=>({side,count})));
  assert.equal(gridCountLimit(rows([[7,7,20],[7,7,7],[7,7,7],[7,7,7]])),8);
  assert.equal(gridCountLimit(rows([[11,11,13],[5,5,5],[7,7,7],[5,5,5]])),8);
  assert.equal(gridCountLimit(rows([[11,11,13],[10,10,11],[10,10,10],[9,9,9]])),12);
  assert.equal(gridCountLimit(rows([[9,9,9],[3,3,3],[9,9,9],[3,3,3]])),10);
  assert.equal(gridCountLimit(rows([[25,25,25],[3,3,3],[25,25,25],[3,3,3]])),16);
});

test('a dense direct-fit image can recover ten slits per sheet from fresh grids',async()=>{
  const model=gridModel([10,10]);model.z.fill(0);
  const n=220,mask=gridMask(model,n,1),rgba=new Uint8ClampedArray(n*n*4);
  for(let i=0;i<mask.length;i++)rgba.set(mask[i]?[185,20,20,255]:[255,255,255,255],4*i);
  const cfg={algorithm:'direct',resolution:n,width:100,trials:0,roundHidden:false,timeLimit:30};
  const p=prepare({type:'pixels',imageWidth:n,imageHeight:n,rgba},cfg),answer=await design(p.target,cfg);
  assert.equal(answer.report.templateChecksPassed,true);
  assert.deepEqual(answer.report.slits,{left:10,right:10});
  const woven=await renderExportedWeave(answer.files['cut_geometry.json'],n);
  assert.ok(woven.mask.every((v,i)=>v===p.preview.mask[i]));
});

test('inset evidence reserves a count candidate without treating edge noise as extra slits',()=>{
  const evidence=[];for(let side=0;side<4;side++)for(let inset=0;inset<3;inset++)evidence.push({side,inset,count:side%2?5:3});
  evidence[0].count=7; evidence[8].count=4;
  assert.deepEqual(supportedBorderCounts(evidence),[3,5]);
  const coarse=[[7,7],[6,6],[8,8],[3,5]].map(counts=>({model:{counts}}));
  assert.deepEqual(gridFinalists(coarse,evidence).map(r=>r.model.counts),[[7,7],[6,6],[3,5]]);
  // Conflicting opposite sides are uncertain, not an error or forced count.
  evidence[6].count=2;evidence[7].count=2;
  assert.equal(supportedBorderCounts(evidence),null);
  assert.deepEqual(gridFinalists(coarse,evidence),coarse.slice(0,3));
});

test('shared replacement cancels reverse-running cuts and preserves adjacent endpoints',()=>{
  const a=[line([25,0],[25,40]),line([25,40],[65,40]),line([65,40],[65,100])];
  const b=[line([0,40.2],[25,40.2]),line([25,40.2],[65,40.2]),line([65,40.2],[100,40.2])].toReversed().map(c=>c.toReversed());
  const [aa,bb]=shareReplacement(a,b,{a0:1.1,a1:1.9,b0:1.9,b1:1.1,length:32});
  assert.deepEqual(aa[0][0],a[0][0]);assert.deepEqual(aa.at(-1)[3],a.at(-1)[3]);
  assert.deepEqual(bb[0][0],b[0][0]);assert.deepEqual(bb.at(-1)[3],b.at(-1)[3]);
  for(const path of[aa,bb])for(let i=1;i<path.length;i++)assert.deepEqual(path[i-1][3],path[i][0]);
  const graph=new CurveGraph([[aa],[bb]],100);
  const shared=graph.occurrences.map((o,i)=>o.length===2?i:-1).filter(i=>i>=0);
  assert.ok(shared.length>1);
  const gradient=boundaryGradient(graph,graph.points,new Float64Array(128*128).fill(.2),128,1);
  // Interior shared handles belong to the cancelling boundary alone.
  for(const i of shared)for(const id of graph.edges[i].slice(1,3))for(const axis of[0,1])near(gradient[2*id+axis],0,1e-12);
});

test('clamped cubic spline basis and exact Bézier conversion agree',()=>{
  const model=gridModel([2,3],8,17),paths=gridPaths(model);
  for(const t of [0,.03,.3,.5,.9,1]){
    near(splineBasis(t,8).reduce((s,v)=>s+v,0),1);
    near(splineBasis(t,8,true).reduce((s,v)=>s+v,0),0);
  }
  for(const f of[0,1])for(const path of paths[f])for(const c of path){
    for(const t of[0,.23,.71,1]){const b=bernstein(t),axis=1-f,y=b.reduce((s,v,i)=>s+v*c[i][axis],0);near(y,c[0][axis]+t*(c[3][axis]-c[0][axis]));}
  }
});

test('ordered-grid image, smoothness and clearance gradients match finite differences',()=>{
  const model=gridModel([2,3],8,6),n=16,target=Float64Array.from({length:n*n},(_,i)=>(Math.sin(i*.13)+1)/2);
  for(const options of[{},{clearance:.35,floor:.02}]){
    const value=gridLoss(model,target,n,-1,.08,options),h=1e-5;
    for(const i of[0,1,5,18,31,39,50,55]){
      const old=model.z[i];model.z[i]=old+h;const up=gridLoss(model,target,n,-1,.08,options).loss;model.z[i]=old-h;const down=gridLoss(model,target,n,-1,.08,options).loss;model.z[i]=old;
      near(value.gradient[i],(up-down)/(2*h),3e-7);
    }
  }
});

test('direct controls preserve phase for equal and unequal sheet counts in exported geometry',async()=>{
  for(const counts of[[2,2],[2,3],[3,2]])for(const phase of[1,-1]){
    const model=gridModel(counts,8,8);model.z.fill(0);const graph=new CurveGraph(gridPaths(model)),n=128,mask=gridMask(model,n,phase),curveMask=renderCurves(graph,graph.points,phase,n,48),solution=graph.solution(graph.points,phase);
    assert.ok(curveMask.reduce((s,v,i)=>s+Number(v!==mask[i]),0)<=2);
    const app=sampleWeave(solution,n);assert.ok(app.reduce((s,v,i)=>s+Number(v!==mask[i]),0)<=2);
    const exported=await renderExportedWeave(solutionJSON(solution),n);
    assert.ok(exported.mask.reduce((s,v,i)=>s+Number(v!==mask[i]),0)/mask.length<.002);
  }
});

test('horizontal and vertical cuts receive the analytic normal-motion gradient',()=>{
  for(const f of[0,1])for(const phase of[1,-1]){
    const paths=[[],[]];paths[f]=[[f===0?line([30,0],[30,100]):line([0,40],[100,40])]];
    const graph=new CurveGraph(paths),prob=new Float64Array(64*64),g=boundaryGradient(graph,graph.points,prob,64,phase,{nquad:80});
    let sum=0;for(let i=f;i<g.length;i+=2)sum+=g[i];near(sum,phase===1?-.01:.01,1e-12);
    for(const transpose of[false,true])near(boundaryValue(graph,graph.points,prob,64,phase,{transpose}),phase===1?(f===0?.7:.6):(f===0?.3:.4),1/192);
  }
});

test('exactly shared whole curves cancel before image integration and gradients',()=>{
  const c=line([30,0],[30,100]),graph=new CurveGraph([[[c],[c]],[]]),prob=new Float64Array(64*64);
  near(boundaryValue(graph,graph.points,prob,64,1),0,1e-12);
  assert.ok(boundaryGradient(graph,graph.points,prob,64,1).every(v=>v===0));
  assert.ok(renderCurves(graph,graph.points,1,64).every(v=>v===0));
});

test('boundary force matches an independent polygon-area change on free curved controls',()=>{
  const graph=new CurveGraph([[[[[20,0],[85,75],[0,20],[45,100]]]],[]]),prob=new Float64Array(64*64),g=boundaryGradient(graph,graph.points,prob,64,1,{nquad:512,maskSamples:128});
  // High-resolution Bernstein area integral, independent of row intersections.
  const area=points=>{
    const c=graph.controls(points)[0],ring=[];for(let j=0;j<=4000;j++){const b=bernstein(j/4000);ring.push([0,1].map(k=>b.reduce((s,v,i)=>s+v*c[i][k],0)));}ring.push([100,100],[100,0]);
    let a=0;for(let j=0;j<ring.length;j++){const p=ring[j],q=ring[(j+1)%ring.length];a+=p[0]*q[1]-p[1]*q[0];}return Math.abs(a)/20000;
  };
  for(const i of[2,3,4,5]){const h=.001,up=graph.points.slice(),down=graph.points.slice();up[i]+=h;down[i]-=h;near(g[i],(area(up)-area(down))/(2*h),1e-7);}
});

test('free-curve clearance, curvature and join forces match finite differences',()=>{
  const paths=[[[line([20,0],[20,50]),line([20,50],[20,100])],[[[22,0],[22.8,30],[21.8,70],[22,100]]]],[[line([0,50],[100,50])]]];
  const graph=new CurveGraph(paths),cfg=settings({trials:0}),value=curvePenalty(graph,graph.points,cfg),h=1e-5;
  assert.ok(value.loss>0);
  for(const i of[2,3,6,8,12,16,18,20,22]){
    const up=graph.points.slice(),down=graph.points.slice();up[i]+=h;down[i]-=h;
    near(value.gradient[i],(curvePenalty(graph,up,cfg).loss-curvePenalty(graph,down,cfg).loss)/(2*h),3e-6);
  }
});

test('direct image fitting starts without traced endpoints and survives edge noise',async()=>{
  const input=checkerPixels(128);
  for(const x of[8,12,48,76,113]){const i=4*x;input.rgba.set(input.rgba[i]===255?[190,20,20,255]:[255,255,255,255],i);}
  const cfg={algorithm:'direct',timeLimit:6,trials:0,roundHidden:false},p=prepare(input,cfg);
  assert.equal(p.target.curves.length,0);assert.equal(p.target.metadata.preprocessing.traceUsed,false);
  const before=p.preview.mask.slice(),r=await design(p.target,cfg);
  assert.equal(r.report.solver.traceUsed,false);assert.equal(r.report.solver.borderCountsAreHardConstraints,false);
  assert.equal(r.report.templateChecksPassed,true);assert.deepEqual(r.report.slits,{left:3,right:3});
  for(let count=1;count<=8;count++)for(const phase of[1,-1]){
    const attempt=r.report.solver.attempts.find(a=>a.stage==='coarse'&&a.counts[0]===count&&a.counts[1]===count&&a.phase===phase);
    assert.ok(attempt,`Missing count ${count}, phase ${phase}`);
    assert.ok(attempt.initializationRounds.length>=2);
    assert.ok(attempt.initializationRounds.every(n=>n===18),'A short budget must not starve later count/phase initializations');
  }
  assert.deepEqual(p.preview.mask,before);
  const independent=await renderExportedWeave(r.files['cut_geometry.json'],128);
  assert.ok(independent.mask.reduce((s,v,i)=>s+Number(v!==before[i]),0)/before.length<.005);
});
