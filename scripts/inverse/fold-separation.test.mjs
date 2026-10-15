import test from 'node:test';
import assert from 'node:assert/strict';
import {Cubic} from '../../static/inverse/core/bezier.js';
import {CurveGraph} from '../../static/inverse/core/direct/curves.js';
import {addFoldSeparation} from '../../static/inverse/core/direct/fold-separation.js';
const line=(a,b)=>Cubic.line(a,b).p;
const base=[line([20,0],[20,98.8]),line([20,98.8],[82,98.8]),line([82,98.8],[98,100])];
function evaluate(graph,points,options={}){
 const sample=graph.sample(points,8),ds=new Float64Array(sample.samples.length),gradient=new Float64Array(points.length);
 const loss=addFoldSeparation(sample,graph.family,100,2.5,3.25,ds,options);
 graph.edges.forEach((ids,e)=>{for(let j=0;j<=sample.ns;j++)for(let k=0;k<4;k++)for(let axis=0;axis<2;axis++)gradient[2*ids[k]+axis]+=sample.bases[j][k]*ds[2*(e*(sample.ns+1)+j)+axis];});
 return {loss,gradient};
}
for(const family of [0,1])test('fold force matches coordinate derivatives on sheet '+family,()=>{
 const paths=[[],[]];paths[family]=[family?base.map(c=>c.map(([x,y])=>[y,x])):base];
 const graph=new CurveGraph(paths,100),points=graph.points.slice(),before=points.slice(),result=evaluate(graph,points);
 assert.ok(result.loss>0);let checked=0;
 for(let i=0;i<points.length;i++){
  const eps=1e-5,plus=points.slice(),minus=points.slice();plus[i]+=eps;minus[i]-=eps;
  const numerical=(evaluate(graph,plus).loss-evaluate(graph,minus).loss)/(2*eps);
  assert.ok(Math.abs(numerical-result.gradient[i])<1e-7,`${i}: ${numerical} vs ${result.gradient[i]}`);checked++;
 }
 assert.equal(checked,points.length);assert.deepEqual(points,before);
 assert.ok(result.gradient.some(v=>v>0),'Descent moves the cut away from its mirrored half');
});
test('straight fold approaches and disabled forces stay exactly unchanged',()=>{
 const paths=[[[line([30,0],[30,100])]],[[line([0,30],[100,30])]]],graph=new CurveGraph(paths,100);
 const r=evaluate(graph,graph.points);assert.equal(r.loss,0);assert.ok(r.gradient.every(v=>v===0));
 const hook=new CurveGraph([[base],[]],100),off=evaluate(hook,hook.points,{weight:0});
 assert.equal(off.loss,0);assert.ok(off.gradient.every(v=>v===0));
});
test('a folded mirror uses the same source coordinate twice',()=>{
 const samples=Float64Array.of(50,98.8,98,100),sample={samples,groups:[[0,1]]},gradient=new Float64Array(4);
 const loss=addFoldSeparation(sample,[0],100,2.5,3.25,gradient,{weight:2});
 const deficit=(3.25-2.4)/3.25;
 assert.ok(Math.abs(loss-deficit**2)<1e-12);
 assert.ok(Math.abs(gradient[1]-4*deficit/3.25)<1e-12);assert.equal(gradient[3],0);
});
