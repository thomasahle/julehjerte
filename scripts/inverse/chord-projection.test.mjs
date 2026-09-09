import test from 'node:test';
import assert from 'node:assert/strict';
import {Cubic} from '../../static/inverse/core/bezier.js';
import {CurveGraph} from '../../static/inverse/core/direct/curves.js';
import {applyTies,symmetryTies,symmetryReport,projectWithinCurve} from '../../static/inverse/core/direct/symmetry.js';
import {settings} from '../../static/inverse/core/settings.js';
import {sampleWeave,validate} from '../../static/inverse/core/validate.js';
import {refineCurves} from '../../static/inverse/core/direct/refine.js';

function crossing(){
  const vertices=[[20,0],[25,25],[35,75],[40,100]],a=vertices.slice(1).map((p,i)=>Cubic.line(vertices[i],p).p),b=a.map(c=>c.map(([x,y])=>[y,x]));
  return new CurveGraph([[a],[b]],100);
}
const crossingIndex=graph=>{for(let i=0;i<graph.points.length;i+=2)if(graph.points[i]===25&&graph.points[i+1]===25)return i;throw new Error('Missing crossing');};
const close=(a,b,tol=1e-9)=>a.forEach((v,i)=>assert.ok(Math.abs(v-b[i])<tol,`${i}: ${v} != ${b[i]}`));
const honoured=(graph,p,spec)=>{const r=symmetryReport(graph.solution(p,1),spec);assert.deepEqual(r.honoured,r.requested);assert.ok(r.maxDeviationMm<1e-9);};

for(const mode of['sym','anti']){
  test(`one joint ${mode} projection preserves both cuts at a shared intersection`,()=>{
    const graph=crossing(),spec={withinCurve:mode},ties=symmetryTies(graph,spec),p=graph.points.slice(),i=crossingIndex(graph);
    assert.equal(validate(graph.solution(p,1),settings({}),{checkImage:false}).passed,true);honoured(graph,p,spec);
    p[i]+=.2;p[i+1]-=.1;
    assert.equal(applyTies(ties,p,graph.points,{fixed:graph.fixed,original:graph.points}),true);
    honoured(graph,p,spec);close(p.slice(i,i+2),[25+.2/3,25-.1/3]);
    const first=p.slice();applyTies(ties,p,p,{fixed:graph.fixed,original:graph.points});close(p,first);
    const reversed=graph.points.slice();reversed[i]+=.2;reversed[i+1]-=.1;
    assert.equal(projectWithinCurve(reversed,graph.points,ties.withinCurve.toReversed(),mode,{fixed:graph.fixed}),true);close(reversed,first);
    for(let j=0;j<p.length;j++)if(graph.fixed[j])assert.equal(p[j],graph.points[j]);
    assert.equal(validate(graph.solution(p,1),settings({}),{checkImage:false}).passed,true);
  });

  test(`${mode} gradient projection is idempotent and self-adjoint with shared controls`,()=>{
    const graph=crossing(),ties=symmetryTies(graph,{withinCurve:mode}),u=Float64Array.from(graph.points,(_,i)=>Math.sin(i)),v=Float64Array.from(graph.points,(_,i)=>Math.cos(i*3));
    const pu=u.slice(),pv=v.slice(),options={fixed:graph.fixed,tangent:true};
    assert.equal(applyTies(ties,pu,graph.points,options),true);assert.equal(applyTies(ties,pv,graph.points,options),true);
    const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);assert.ok(Math.abs(dot(pu,v)-dot(u,pv))<1e-9);
    const second=pu.slice();applyTies(ties,second,graph.points,options);close(second,pu);
    for(let i=0;i<pu.length;i++)if(graph.fixed[i])assert.equal(pu[i],0);
  });

  test(`${mode} projection combines square and chord ties without cache interference`,()=>{
    const graph=crossing(),spec={transpose:true,withinCurve:mode},ties=symmetryTies(graph,spec),p=graph.points.slice();
    // Warm the standalone chord projector on the same list object. The joint
    // projector must still include the square constraints afterward.
    projectWithinCurve(p,graph.points,ties.withinCurve,mode);
    for(let i=0;i<p.length;i++)if(!graph.fixed[i])p[i]+=.1*Math.sin(i*3);
    assert.equal(applyTies(ties,p,p,{fixed:graph.fixed,original:graph.points}),true);honoured(graph,p,spec);
  });

  test(`${mode} refinement retains exact chord symmetry at every accepted checkpoint`,()=>{
    const graph=crossing(),mask=sampleWeave(graph.solution(graph.points,1),200),input={sourceImage:{resolution:200,mask}},i=crossingIndex(graph);
    graph.points[i]+=.2;graph.points[i+1]-=.1;
    const cfg=settings({symmetry:{withinCurve:mode},preferMatchingSheets:false}),snapshots=[];
    const result=refineCurves(graph,Float64Array.from(mask),200,1,cfg,{steps:81,input,onProgress:(r,s)=>{if(r.geometry){const symmetry=symmetryReport(s,cfg.symmetry);assert.deepEqual(symmetry.honoured,symmetry.requested);assert.ok(symmetry.maxDeviationMm<1e-9);snapshots.push(r);}}});

    assert.ok(snapshots.length>=3);assert.equal(result.geometryPassed,true);assert.equal(result.paperPassed,true);honoured(graph,result.points,cfg.symmetry);
  });
}
