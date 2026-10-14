import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixtures.mjs';
import {settings} from '../../static/inverse/core/settings.js';
import {solveGraph,solverRuntime} from '../../static/inverse/core/solver.js';

test('a new MILP round uses the remaining wall budget without charging prior native solves again',async t=>{
  const runtime=await solverRuntime(),createModel=runtime.createModel.bind(runtime),runs=[];
  t.mock.method(runtime,'createModel',(...args)=>{
    const model=createModel(...args),run=model.run.bind(model);
    t.mock.method(model,'run',(...args)=>{
      const row={before:model.raw.getRunTime(),limit:model.options.get('time_limit')};
      runs.push(row);
      const result=run(...args);
      row.after=model.raw.getRunTime();
      return result;
    });
    return model;
  });
  const cfg=settings({width:60,trials:0,timeLimit:5,maxRounds:3});
  let report,audits=0;
  // The unique straight routing is geometrically sound. Reject it at the
  // independent paper gate so the real persistent model must run again with
  // its exclusion constraint. No artificial clock or solver answer is used.
  await assert.rejects(solveGraph(fixture('straight').graph,cfg,{
    coreGate:()=>{audits++;return{passed:false,summary:{status:'fail',reason:'controlled paper rejection'}};}
  }),error=>{
    report=error.report;
    assert.equal(report.termination,'candidate_graph_exhausted');
    return true;
  });
  assert.equal(audits,1);
  assert.equal(runs.length,2);
  assert.ok(runs[0].after>0,'The first actual HiGHS solve must consume native clock time.');
  assert.equal(runs[1].before,0,'HiGHS must not subtract the previous solve from an already reduced budget.');
  assert.ok(runs[1].limit>0&&runs[1].limit<runs[0].limit,
    'Resetting native clocks must not reset the caller wall-clock deadline.');
  assert.equal(report.history[0].validationPassed,false);
  assert.equal(report.history[0].issues[0].type,'material_core');
  assert.ok(report.history.every(r=>r.elapsedSeconds<=report.elapsedSeconds));
});
