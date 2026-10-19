import test from 'node:test';
import assert from 'node:assert/strict';
import {Cubic} from '../../static/inverse/core/bezier.js';
import {reindex} from '../../static/inverse/core/graph.js';
import {settings} from '../../static/inverse/core/settings.js';
import {formulate,solverRuntime} from '../../static/inverse/core/solver.js';

const graphOf=(chains,width=100)=>{
  const curves=chains.flatMap(points=>points.slice(1).map((point,i)=>Cubic.line(points[i],point)));
  return reindex({target:{width,phase:0,curves,metadata:{}},edges:curves.map(curve=>({curve,visible:true}))});
};
async function run(graph,cfg,inspect){
  const highs=await solverRuntime(),form=formulate(graph,cfg,{connectivity:'path-step-order'}),native=highs.createModel(form.m.data());
  try{
    native.options.set({output_flag:false,time_limit:5});
    const result=native.run();
    await inspect({highs,form,native,result});
  }finally{native.dispose();}
}

test('continuous path positions count edges through a backward-running cut',async()=>{
  const points=[[20,0],[20,20],[35,20],[35,10],[50,10],[50,45],[35,45],[35,30],[20,30],[20,60]];
  const graph=graphOf([points],60),cfg=settings({width:60,timeLimit:5,minWidth:2,maxTurn:170});
  await run(graph,cfg,({highs,form,native,result})=>{
    assert.equal(result.modelStatus,highs.constants.modelStatus.optimal);
    const values=native.getSolution().colValue;
    assert.ok(form.m.residual(values)<1e-6);
    assert.ok(form.order.flat().every(index=>form.m.integer[index]===0));
    for(const [index,point]of points.entries()){
      const vertex=graph.points.findIndex(p=>p[0]===point[0]&&p[1]===point[1]);
      assert.ok(Math.abs(values[form.order[0][vertex]]-index)<1e-6);
    }
    for(const edge of form.x[1])assert.equal(values[edge],0,'An absent cut family stays empty.');
  });
});

test('path positions reject a detached visible loop even when both border paths exist',async()=>{
  const graph=graphOf([
    [[25,0],[25,100]],[[0,70],[100,70]],
    [[50,20],[65,20],[65,35],[50,35],[50,20]]
  ]),cfg=settings({width:100,timeLimit:5,minWidth:2});
  await run(graph,cfg,({highs,result})=>{
    assert.equal(result.modelStatus,highs.constants.modelStatus.infeasible);
  });
});

test('path positions cannot connect balanced border endpoints through disconnected interior ends',async()=>{
  const graph=graphOf([[[25,0],[25,40]],[[25,60],[25,100]],[[0,70],[100,70]]]),cfg=settings({width:100,timeLimit:5,minWidth:2});
  await run(graph,cfg,({highs,result})=>{
    assert.equal(result.modelStatus,highs.constants.modelStatus.infeasible);
  });
});
