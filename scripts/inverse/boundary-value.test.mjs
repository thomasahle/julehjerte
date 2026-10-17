import test from 'node:test';
import assert from 'node:assert/strict';
import {boundaryValue,createBoundaryEvaluator} from '../../static/inverse/core/direct/boundary.js';
import {CurveGraph} from '../../static/inverse/core/direct/curves.js';
import {gridModel,gridPaths} from '../../static/inverse/core/direct/grid.js';
import {referenceBoundaryEvaluator} from './fixtures/boundary-value-reference.mjs';

const line=(a,b)=>[a,a.map((v,i)=>v+(b[i]-v)/3),a.map((v,i)=>v+2*(b[i]-v)/3),b];
const near=(actual,expected,tolerance=1e-10)=>assert.ok(Math.abs(actual-expected)<tolerance,`${actual} vs ${expected}`);

test('prepared image integrals follow moving boundaries and both phases at different widths',()=>{
  for(const width of[73,100])for(const transpose of[false,true]){
    const graph=new CurveGraph([[[line([width/4,0],[width/4,width])]],[]],width),n=19;
    const evaluate=createBoundaryEvaluator(graph,new Float64Array(n*n).fill(.2),n,{rows:256,transpose});
    for(const fraction of[.25,.5,.75]){
      const points=graph.points.slice();for(let i=0;i<points.length;i+=2)points[i]=fraction*width;
      for(const phase of[1,-1]){
        const redArea=phase===1?1-fraction:fraction;
        near(evaluate(points,phase),.04+.6*redArea);
      }
    }
  }
});

test('an evaluator owns an image snapshot while new evaluations observe edited pixels and weights',()=>{
  const graph=new CurveGraph([[],[]]),n=16,prob=new Float64Array(n*n).fill(.2),weights=new Float64Array(n*n).fill(.5);
  for(const transpose of[false,true]){
    prob.fill(.2);weights.fill(.5);
    const evaluate=createBoundaryEvaluator(graph,prob,n,{weights,transpose,rows:64});
    near(evaluate(graph.points,1),.04);near(evaluate(graph.points,-1),.64);
    for(let i=0;i<prob.length;i++){prob[i]=i%2?.8:.1;weights[i]=i%2?1:0;}
    near(evaluate(graph.points,1),.04);near(evaluate(graph.points,-1),.64);
    near(boundaryValue(graph,graph.points,prob,n,1,{weights,transpose,rows:64}),.64);
    const edited=createBoundaryEvaluator(graph,prob,n,{weights,transpose,rows:64});
    near(edited(graph.points,-1),.04);
  }
});

test('prepared weighted fields cancel shared boundaries and preserve zero-weight colour invariance',()=>{
  const n=17,prob=Float64Array.from({length:n*n},(_,i)=>(i*19%31)/31);
  const weights=Float64Array.from(prob,(_,i)=>i%n<5?0:i%n<12?.25:1);
  const noisy=Float64Array.from(prob,(v,i)=>weights[i]?v:1-v);
  const shared=line([30,0],[30,100]),graph=new CurveGraph([[[shared],[shared]],[]]);
  const mass=weights.reduce((s,w)=>s+w,0);
  for(const transpose of[false,true]){
    const options={rows:n*4,transpose,weights},evaluate=createBoundaryEvaluator(graph,prob,n,options),other=createBoundaryEvaluator(graph,noisy,n,options);
    for(const phase of[1,-1]){
      const colour=phase===1?0:1,expected=prob.reduce((s,p,i)=>s+weights[i]*(colour-p)**2,0)/mass;
      near(evaluate(graph.points,phase),expected);
      assert.equal(evaluate(graph.points,phase),other(graph.points,phase));
    }
  }
});

test('row indexing retains every full-scan scalar through bin edges, reversals and disconnected joins',()=>{
  const shared=line([30,0],[30,100]);
  const graphs=[
    new CurveGraph([[],[]]),
    new CurveGraph([[[shared],[shared]],[]]),
    new CurveGraph([[[line([25,0],[25,100])]],[[line([0,37],[100,37])]]]),
    new CurveGraph([[[line([100*17/128,0],[100*17/128,100])]],[[line([0,100*23/128],[100,100*23/128])]]]),
    new CurveGraph([[[[[25,0],[120,140],[-20,-40],[75,100]]]],[]]),
    new CurveGraph([[[line([25,0],[25,45]),line([30,55],[30,100])]],[]]),
    new CurveGraph(gridPaths(gridModel([8,8],16,17))),
    new CurveGraph([[[line([20,0],[40,73])]],[[line([0,18],[73,52])]]],73)
  ];
  const n=17,prob=Float64Array.from({length:n*n},(_,i)=>(i*19%31)/31);
  for(const graph of graphs)for(const weighted of [false,true])for(const rows of [1,17,192,193])for(const transpose of [false,true]){
    const weights=weighted?Float64Array.from(prob,(_,i)=>i%n<5?0:i%n<12?.25:1):null,options={weights,rows,transpose};
    const reference=referenceBoundaryEvaluator(graph,prob,n,options),evaluate=createBoundaryEvaluator(graph,prob,n,options);
    for(const amount of [0,.013,-.071]){
      const points=Float64Array.from(graph.points,(v,i)=>v+amount*Math.sin(i+1));
      for(const phase of [1,-1])assert.ok(Object.is(evaluate(points,phase),reference(points,phase)),
        `Changed scalar for ${graph.edges.length} edges, ${rows} rows, transpose=${transpose}, phase=${phase}, perturbation=${amount}, weighted=${weighted}.`);
    }
  }
});
