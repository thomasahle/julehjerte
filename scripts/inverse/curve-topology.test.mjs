import test from 'node:test';
import assert from 'node:assert/strict';
import {Cubic} from '../../static/inverse/core/bezier.js';
import {CurveGraph,renderCurves} from '../../static/inverse/core/direct/curves.js';
import {refineCurves} from '../../static/inverse/core/direct/refine.js';
import {sampleWeave} from '../../static/inverse/core/validate.js';
import {symmetryReport} from '../../static/inverse/core/direct/symmetry.js';
import {settings} from '../../static/inverse/core/settings.js';

const line=(a,b)=>Cubic.line(a,b).p;
const ids=(graph,f,i=0)=>graph.paths[graph.families[f][i]].map(([e,d])=>d===1?graph.edges[e]:graph.edges[e].toReversed());
const familyIds=(graph,f)=>new Set(graph.families[f].flatMap(pi=>graph.paths[pi].flatMap(([e])=>graph.edges[e])));
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);

test('coincident grid handles do not couple independent sheets',()=>{
  const a=[1,2].map(i=>[line([100*i/3,0],[100*i/3,100])]);
  const paths=[a,a.map(p=>p.map(c=>c.map(([x,y])=>[y,x])))],graph=new CurveGraph(paths),other=graph.nested()[1];
  assert.equal(graph.points.length/2,16);
  const b=familyIds(graph,1);assert.ok([...familyIds(graph,0)].every(i=>!b.has(i)));
  graph.points[2*ids(graph,0)[0][1]]+=2;
  assert.deepEqual(graph.nested()[1],other);
});

test('each path keeps its own connected anchor at an isolated crossing',()=>{
  const a=[line([50,0],[50,50]),line([50,50],[50,100])];
  const paths=[[a],[a.map(c=>c.map(([x,y])=>[y,x]))]],graph=new CurveGraph(paths),before=JSON.stringify(paths),other=graph.nested()[1];
  const A=ids(graph,0),B=ids(graph,1);
  assert.equal(A[0][3],A[1][0]);assert.equal(B[0][3],B[1][0]);assert.notEqual(A[0][3],B[0][3]);
  graph.points[2*A[0][3]]+=3;graph.points[2*A[0][3]+1]+=2;
  assert.deepEqual(graph.nested()[1],other);assert.deepEqual(graph.nested()[0][0][0][3],graph.nested()[0][0][1][0]);
  assert.equal(JSON.stringify(paths),before);
});

for(const reverse of [false,true])test(`whole shared cubics retain all controls and connected neighbours, reverse=${reverse}`,()=>{
  const c=[[30,30],[30,48],[60,42],[60,60]],shared=reverse?c.toReversed():c;
  const paths=[[[line([30,0],c[0]),c,line(c[3],[60,100])]],[[line([0,shared[0][1]],shared[0]),shared,line(shared[3],[100,shared[3][1]])]]];
  const graph=new CurveGraph(paths),A=ids(graph,0),B=ids(graph,1),a=A[1],b=reverse?B[1].toReversed():B[1];
  assert.deepEqual(a,b);assert.equal(A[0][3],a[0]);assert.equal(A[2][0],a[3]);
  assert.equal(B[0][3],B[1][0]);assert.equal(B[1][3],B[2][0]);
  const edge=graph.paths[0][1][0];assert.equal(graph.visible[edge],false);assert.equal(graph.occurrences[edge].length,2);
  for(const id of a){graph.points[2*id]+=.2;graph.points[2*id+1]-=.1;}
  const nested=graph.nested(),other=reverse?nested[1][0][1].toReversed():nested[1][0][1];
  assert.deepEqual(nested[0][0][1],other);
  for(const f of nested)for(const p of f)for(let i=1;i<p.length;i++)assert.deepEqual(p[i-1][3],p[i][0]);
});

test('an endpoint-coincident handle remains movable without moving the endpoint',()=>{
  const c=[[20,0],[20,0],[20,100],[20,100]],graph=new CurveGraph([[[c]],[]]),p=ids(graph,0)[0];
  assert.equal(new Set(p).size,4);assert.equal(graph.fixed[2*p[0]+1],1);assert.equal(graph.fixed[2*p[1]+1],0);
  graph.points[2*p[1]+1]=5;assert.equal(graph.nested()[0][0][0][0][1],0);
});

test('a handle coincident with an unrelated anchor does not move that anchor',()=>{
  const c=[[30,0],[50,50],[30,70],[30,100]],b=[line([0,50],[50,50]),line([50,50],[100,50])];
  const graph=new CurveGraph([[[c]],[b]]),a=ids(graph,0)[0],other=ids(graph,1),before=graph.nested()[1];
  assert.notEqual(a[1],other[0][3]);graph.points[2*a[1]]+=2;
  assert.deepEqual(graph.nested()[1],before);
});

test('nearby controls are retained exactly unless a whole shared curve or actual join identifies them',()=>{
  const a=line([30,0],[30,100]),b=line([0,70],[100,70]);b[1]=[a[1][0]+1e-8,a[1][1]-1e-8];
  const paths=[[[a]],[[b]]],graph=new CurveGraph(paths);assert.deepEqual(graph.nested(),paths);
  const shared=a.map(p=>p.map(v=>v+1e-8)),both=new CurveGraph([[[a],[shared]],[]]);
  assert.equal(both.edges.length,1);assert.equal(both.visible[0],false);
  both.nested().flat(3).forEach((p,i)=>p.forEach((v,k)=>close(v,[a,shared].flat()[i][k])));
});

test('closing an actual loop joins anchors without welding equal handles',()=>{
  const c=[[40,40],[50,50],[50,50],[40,40]],graph=new CurveGraph([[[c]],[]]),a=ids(graph,0)[0];
  assert.equal(a[0],a[3]);assert.notEqual(a[1],a[2]);
});

test('a disconnected path is not joined just to enable shared-curve cancellation',()=>{
  const a=line([30,0],[30,40]),b=line([30,41],[30,100]),graph=new CurveGraph([[[a,b]],[[a]]]);
  const A=ids(graph,0);assert.notEqual(A[0][3],A[1][0]);
  const mask=renderCurves(graph,graph.points,1,100);
  assert.ok(mask.some(Boolean));
});

for(const mode of ['sym','anti'])for(const segments of [1,2])test(`${mode} fitting escapes coincident ${segments===1?'handles':'crossing anchors'} without altering its seed`,()=>{
  const count=segments===1?2:1;
  const paths=target=>{
    const A=Array.from({length:count},(_,i)=>{
      const x=(i+1)*100/(count+1),shift=target&&mode==='anti'?3:0,tilt=target&&mode==='sym'&&segments===1?3:0;
      const p=line([x+shift-tilt,0],[x+shift+tilt,100]);
      if(target&&mode==='sym'&&segments===2){p[1][0]+=4;p[2][0]+=4;}
      const c=new Cubic(p);return Array.from({length:segments},(_,j)=>c.subcurve(j/segments,(j+1)/segments).p);
    });
    return[A,A.map(path=>path.map(c=>c.map(([x,y])=>[y,x])))];
  };
  const graph=new CurveGraph(paths(false)),truth=new CurveGraph(paths(true)),cfg=settings({symmetry:{withinCurve:mode},preferMatchingSheets:false});
  const mask=sampleWeave(truth.solution(truth.points,1),200),original=graph.points.slice(),checkpoints=[];
  const fit=refineCurves(graph,Float64Array.from(mask),200,1,cfg,{steps:301,input:{sourceImage:{resolution:200,mask}},onProgress:(row,s)=>{
    if(row.geometry){const r=symmetryReport(s,cfg.symmetry);assert.deepEqual(r.honoured,r.requested);checkpoints.push(row);}
  }});
  const actual=sampleWeave(graph.solution(fit.points,1),200),error=actual.reduce((s,v,i)=>s+Number(v!==mask[i]),0)/mask.length;
  assert.ok(error<.002,`prepared-mask error ${error}`);assert.ok(fit.geometryPassed&&fit.paperPassed);assert.ok(checkpoints.length>=5);
  assert.deepEqual(graph.points,original);
});
