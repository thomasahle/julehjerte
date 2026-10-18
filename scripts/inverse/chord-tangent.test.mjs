import test from 'node:test';
import assert from 'node:assert/strict';
import {Cubic} from '../../static/inverse/core/bezier.js';
import {CurveGraph} from '../../static/inverse/core/direct/curves.js';
import {chordMap,applyTies,symmetryTies,symmetryReport} from '../../static/inverse/core/direct/symmetry.js';
import {chordTangentProjector,projectChordTangent} from '../../static/inverse/core/direct/chord-tangent.js';
import {refineCurves} from '../../static/inverse/core/direct/refine.js';
import {sampleWeave} from '../../static/inverse/core/validate.js';
import {settings} from '../../static/inverse/core/settings.js';
import {framePaths,antiSeamPaths} from './fixtures/symmetric-frame.mjs';
import {weldEqualFixturePoints} from './fixtures/shared-controls.mjs';

const dot=(a,b)=>a.reduce((sum,v,i)=>sum+v*b[i],0);
const close=(a,b,tolerance=1e-8)=>a.forEach((v,i)=>assert.ok(Math.abs(v-b[i])<tolerance,`${i}: ${v} != ${b[i]}`));
const lines=(a,b)=>[[[Cubic.line([a,0],[b,100]).p]],[[Cubic.line([0,70],[100,70]).p]]];
function curved(mode){
  const first=[20,0],last=[40,100],p=[10,30],m=chordMap(first,last,mode),q=[m.L[0]*p[0]+m.L[1]*p[1]+m.t[0],m.L[2]*p[0]+m.L[3]*p[1]+m.t[1]];
  const a=[[first,p,q,last]];return[[a],[a.map(c=>c.map(([x,y])=>[y,x]))]];
}
function residuals(ties,p){
  const out=[];
  for(const ids of ties.withinCurve){
    const a=ids[0],b=ids.at(-1),map=chordMap([p[2*a],p[2*a+1]],[p[2*b],p[2*b+1]],ties.mode);
    for(let k=0;k<ids.length/2;k++){
      const a=ids[k],b=ids[ids.length-1-k];
      for(let axis=0;axis<2;axis++)out.push(p[2*a+axis]-map.L[2*axis]*p[2*b]-map.L[2*axis+1]*p[2*b+1]-map.t[axis]);
    }
  }
  for(const {a,b,map}of ties.square)for(let axis=0;axis<2;axis++)out.push(p[2*a+axis]-map.L[2*axis]*p[2*b]-map.L[2*axis+1]*p[2*b+1]-map.t[axis]);
  return out;
}
/** Independent dense row-space oracle from finite differences of the actual
 * moving-endpoint constraints, with twice-reorthogonalized Gram–Schmidt. */
function numericalProject(ties,p,g,fixed){
  const h=1e-4,rows=residuals(ties,p).map(()=>new Float64Array(p.length));
  for(let i=0;i<p.length;i++){
    if(fixed[i])continue;
    const a=p.slice(),b=p.slice();a[i]+=h;b[i]-=h;
    const ra=residuals(ties,a),rb=residuals(ties,b);
    rows.forEach((row,j)=>{row[i]=(ra[j]-rb[j])/(2*h);});
  }
  const basis=[];
  for(const row of rows){
    for(let pass=0;pass<2;pass++)for(const b of basis){const v=dot(row,b);for(let i=0;i<row.length;i++)row[i]-=v*b[i];}
    const length=Math.sqrt(dot(row,row));if(length<1e-6)continue;
    basis.push(Float64Array.from(row,v=>v/length));
  }
  const out=Float64Array.from(g,(v,i)=>fixed[i]?0:v);
  for(const b of basis){const v=dot(out,b);for(let i=0;i<out.length;i++)out[i]-=v*b[i];}
  return out;
}

for(const mode of ['sym','anti']){
  const transforms=['mirrorX','mirrorY','rotate180','transpose','antiTranspose'];
  for(let bits=0;bits<32;bits++){
    const spec={withinCurve:mode,...Object.fromEntries(transforms.map((name,i)=>[name,Boolean(bits&(1<<i))]))};
    test(`${mode} moving-chord projection agrees with all square generators ${bits}`,()=>{
      const a=[30,70].map(x=>[Cubic.line([x,0],[x,100]).p]),paths=[a,a.map(p=>p.map(c=>c.map(([x,y])=>[y,x])))],graph=new CurveGraph(paths,100),ties=symmetryTies(graph,spec);
      const g=Float64Array.from(graph.points,(_,i)=>Math.sin(i*.87)),actual=g.slice();
      assert.equal(applyTies(ties,actual,graph.points,{fixed:graph.fixed,tangent:true}),true);
      close(actual,numericalProject(ties,graph.points,g,graph.fixed),2e-7);
    });
  }

  test(`${mode} keeps valid endpoint motion instead of cancelling its whole gradient`,()=>{
    const graph=new CurveGraph(lines(20,20),100),target=new CurveGraph(mode==='anti'?lines(25,25):lines(15,25),100);
    const g=Float64Array.from(graph.points,(v,i)=>v-target.points[i]),before=g.slice(),ties=symmetryTies(graph,{withinCurve:mode});
    assert.equal(applyTies(ties,g,graph.points,{fixed:graph.fixed,tangent:true}),true);
    close(g,before,1e-12);assert.ok(Math.hypot(...g)>7);
  });

  for(const shape of ['curved','shared'])for(const transpose of [false,true]){
    test(`${mode} ${shape} tangent with transpose=${transpose} matches independent finite differences`,()=>{
      const graph=new CurveGraph(shape==='curved'?curved(mode):mode==='sym'?framePaths():antiSeamPaths(),100),spec={withinCurve:mode,transpose},ties=symmetryTies(graph,spec);
      assert.deepEqual(symmetryReport(graph.solution(graph.points,1),spec).honoured,symmetryReport(graph.solution(graph.points,1),spec).requested);
      const u=Float64Array.from(graph.points,(_,i)=>Math.sin(i*2.13)),v=Float64Array.from(graph.points,(_,i)=>Math.cos(i*.73)),pu=u.slice(),pv=v.slice();
      assert.equal(applyTies(ties,pu,graph.points,{fixed:graph.fixed,tangent:true}),true);
      assert.equal(applyTies(ties,pv,graph.points,{fixed:graph.fixed,tangent:true}),true);
      close(pu,numericalProject(ties,graph.points,u,graph.fixed),2e-7);
      assert.ok(Math.abs(dot(pu,v)-dot(u,pv))<1e-9);
      const second=pu.slice();assert.equal(applyTies(ties,second,graph.points,{fixed:graph.fixed,tangent:true}),true);close(second,pu,1e-9);
      const h=1e-4,forward=Float64Array.from(graph.points,(x,i)=>x+h*pu[i]),backward=Float64Array.from(graph.points,(x,i)=>x-h*pu[i]),a=residuals(ties,forward),b=residuals(ties,backward);
      assert.ok(Math.max(...a.map((x,i)=>Math.abs((x-b[i])/(2*h))))<1e-7);
      for(let i=0;i<pu.length;i++)if(graph.fixed[i])assert.equal(pu[i],0);
    });
  }

  test(`${mode} refinement escapes the frozen-chord stall while preserving every accepted symmetry`,()=>{
    const graph=new CurveGraph(lines(20,20),100),target=new CurveGraph(mode==='anti'?lines(25,25):lines(15,25),100),cfg=settings({symmetry:{withinCurve:mode},preferMatchingSheets:false});
    const mask=sampleWeave(target.solution(target.points,1),200),original=graph.points.slice(),checkpoints=[];
    const fit=refineCurves(graph,Float64Array.from(mask),200,1,cfg,{steps:201,input:{sourceImage:{resolution:200,mask}},onProgress:(row,s)=>{
      if(!row.geometry)return;
      const report=symmetryReport(s,cfg.symmetry);assert.deepEqual(report.honoured,report.requested);checkpoints.push(row);
    }});
    const actual=sampleWeave(graph.solution(fit.points,1),200),error=actual.reduce((s,v,i)=>s+Number(v!==mask[i]),0)/mask.length;
    assert.ok(error<=.00025,`${mode}: disagreement ${error}`);assert.equal(fit.geometryPassed,true);assert.equal(fit.paperPassed,true);assert.ok(checkpoints.length>=5);close(graph.points,original);
    for(let i=0;i<fit.points.length;i++)if(graph.fixed[i])assert.equal(fit.points[i],original[i]);
  });
}

test('degenerate chords and nonfinite gradients fail without changing the supplied vector',()=>{
  const points=Float64Array.of(10,10,20,20,30,30,10,10),lists=[[0,1,2,3]],compiled=chordTangentProjector(4,lists),g=new Float64Array(8).fill(1),original=g.slice();
  assert.equal(projectChordTangent(compiled,g,points,'sym'),false);close(g,original);
  points[6]=40;g[2]=NaN;
  assert.equal(projectChordTangent(compiled,g,points,'anti'),false);assert.ok(Number.isNaN(g[2]));assert.equal(g[0],1);
});


test('Adam can recover a valid update when shared handles couple endpoint motion',()=>{
  // Deliberately couple four coincident handles across the sheets. This
  // intentionally constrained model cannot reach the independently shifted
  // target, but a valid improvement exists. A coordinate-scaled Adam update
  // used to fail the joint chord projection and repeatedly roll back.
  const paths=shift=>[0,1].map(f=>[1,2].map(i=>{
    const x=100*i/3+shift,p=Cubic.line([x,0],[x,100]).p;
    return [f?p.map(([x,y])=>[y,x]):p];
  }));
  const graph=weldEqualFixturePoints(new CurveGraph(paths(0))),target=new CurveGraph(paths(3)),cfg=settings({symmetry:{withinCurve:'anti'},preferMatchingSheets:false});
  const truth=target.solution(target.points,1),mask=sampleWeave(truth,200),reference=sampleWeave(truth,400),original=graph.points.slice();
  const error=points=>sampleWeave(graph.solution(points,1),400).reduce((sum,v,i)=>sum+Number(v!==reference[i]),0)/reference.length;
  const fit=refineCurves(graph,Float64Array.from(mask),200,1,cfg,{steps:301,input:{sourceImage:{resolution:200,mask}}});
  assert.ok(error(fit.points)<.11,`${error(fit.points)} should improve on ${error(original)}`);
  assert.ok(fit.geometryPassed&&fit.paperPassed);close(graph.points,original);
  assert.deepEqual(symmetryReport(graph.solution(fit.points,1),cfg.symmetry).honoured,['withinCurve:anti']);
});
