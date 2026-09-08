import test from 'node:test';
import assert from 'node:assert/strict';
import {Cubic} from '../../static/inverse/core/bezier.js';
import {CurveGraph,renderCurves} from '../../static/inverse/core/direct/curves.js';
import {refineCurves,curvePenalty} from '../../static/inverse/core/direct/refine.js';
import {settings} from '../../static/inverse/core/settings.js';
import {DIRECT_PRESET} from '../../static/inverse/core/presets.js';
import {solutionJSON} from '../../static/inverse/core/graph.js';
import {renderExportedWeave} from './export-renderer.mjs';
import {prepare,design} from '../../static/inverse/core/engine.js';
import {motifFixture} from './motif-fixture.mjs';

test('one refinement checkpoint straightens a noisy line and preserves a real curve',async()=>{
  const curve=[[0,50],[30,15],[70,85],[100,50]],truth=new CurveGraph([[[Cubic.line([25,0],[25,100]).p]],[[curve]]]);
  const graph=new CurveGraph([[[[[25,0],[25.2,100/3],[24.8,200/3],[25,100]]]],[[curve]]]),n=240,mask=renderCurves(truth,truth.points,1,n,64);
  const cfg=settings({...DIRECT_PRESET,trials:0}),input={sourceImage:{mask,resolution:n}},result=refineCurves(graph,Float64Array.from(mask),n,1,cfg,{steps:0,input});
  assert.equal(result.geometryPassed,true);assert.equal(result.paperPassed,true);
  assert.deepEqual(result.primitives,{straight:1,curved:1});
  const paths=result.graph.nested(result.points);assert.ok(new Cubic(paths[0][0][0]).flatness()<1e-7);assert.deepEqual(paths[1][0][0],curve);
  const rendered=await renderExportedWeave(solutionJSON(result.graph.solution(result.points,1,input)),n);
  assert.ok(rendered.mask.reduce((s,v,i)=>s+Number(v!==mask[i]),0)/mask.length<.001);
});

test('the join penalty does not exert a rounding force on a right-angle corner',()=>{
  const paths=[[[Cubic.line([30,0],[30,50]).p,Cubic.line([30,50],[70,50]).p,Cubic.line([70,50],[70,100]).p]],[]],g=new CurveGraph(paths);
  const p=curvePenalty(g,g.points,settings({...DIRECT_PRESET,trials:0}));
  assert.ok(p.gradient.every(v=>Math.abs(v)<1e-12));
});

test('the main fitter preserves curved motifs and straight border spans together',{timeout:30000},async()=>{
  const fixture=motifFixture('circle'),cfg={...DIRECT_PRESET,trials:0,timeLimit:10,minWidth:1.5},p=prepare(fixture.input,cfg),r=await design(p.target,cfg);
  assert.equal(p.target.curves.length,0);assert.equal(r.report.solver.algorithm,'direct-bezier');assert.equal(r.report.templateChecksPassed,true);
  const data=JSON.parse(r.files['cut_geometry.json']),curves=Object.values(data.curves).map(c=>new Cubic(c.control_points));
  assert.ok(curves.some(c=>c.flatness()<1e-7));assert.ok(curves.some(c=>c.flatness()>1));
  const rendered=await renderExportedWeave(data,240);assert.ok(rendered.mask.reduce((s,v,i)=>s+Number(v!==fixture.mask[i]),0)/fixture.mask.length<.002);
});

test('resampling an imported mask for Paint does not inflate its topology problem',{timeout:60000},async()=>{
  for(const shape of ['hat','house','circle']){
    const fixture=motifFixture(shape),n=400,from=fixture.input.imageWidth,mask=new Uint8Array(n*n),rgba=new Uint8ClampedArray(4*n*n);
    for(let y=0;y<n;y++)for(let x=0;x<n;x++){
      const v=fixture.mask[Math.floor((y+.5)*from/n)*from+Math.floor((x+.5)*from/n)];mask[y*n+x]=v;
      rgba.set(v?[0,0,0,255]:[255,255,255,255],4*(y*n+x));
    }
    const cfg={...DIRECT_PRESET,trials:0,timeLimit:10},p=prepare({type:'pixels',rgba,imageWidth:n,imageHeight:n},cfg);
    const r=await design(p.target,cfg),rendered=await renderExportedWeave(r.files['cut_geometry.json'],n);
    assert.equal(r.report.templateChecksPassed,true,shape);
    assert.ok(r.report.solver.topologyInitialization.boundarySegments<=64,shape);
    assert.ok(rendered.mask.reduce((sum,v,i)=>sum+Number(v!==mask[i]),0)/mask.length<.003,shape);
  }
});
