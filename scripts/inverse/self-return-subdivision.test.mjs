import test from 'node:test';
import assert from 'node:assert/strict';
import {CurveGraph} from '../../static/inverse/core/direct/curves.js';
import {experimentalSelfReturns} from './diagnostics/self-return-candidate.mjs';
import {returnDiagnosticCases,subdivideDiagnosticPaths,diagnosticSubdivisions} from './self-return-subdivision-study.mjs';

test('the offline short-return proposal separates bends from saved and analytic narrow returns',async()=>{
  for(const entry of await returnDiagnosticCases()){
    const before=JSON.stringify(entry.paths),decisions=[];
    for(const knots of Object.values(diagnosticSubdivisions))for(const reflect of [false,true]){
      const transformed=subdivideDiagnosticPaths(entry.paths,knots,reflect);
      assert.ok(transformed.maximumGeometryDifference<1e-10,'Subdivision must preserve the continuous geometry.');
      const model=new CurveGraph(transformed.paths),solution=model.solution(model.points,1),issues=experimentalSelfReturns(solution,entry.cfg);
      decisions.push(issues.length>0);
      if(entry.expectedShortReturn!==null)assert.equal(issues.length>0,entry.expectedShortReturn,`${entry.name}: ${knots}, reflect=${reflect}`);
      for(const issue of issues){
        assert.ok(issue.distanceUpper<issue.required);
        assert.ok(issue.arcSeparation>=2*issue.required);
        assert.ok(issue.arcSeparation<=entry.cfg.localNeighborhoodFactor*entry.cfg.nominalWidth);
        assert.ok(issue.stationary||issue.totalTurning>=180-1e-6);
        assert.deepEqual(issue.edgeChain,solution.paths[issue.family][issue.slit].slice(issue.curves[0],issue.curves[1]+1).map(([edge])=>edge));
      }
    }
    assert.ok(decisions.every(v=>v===decisions[0]),entry.name+' must have one decision across exact representations.');
    assert.equal(JSON.stringify(entry.paths),before);
  }
});

test('the captured photographic bend has the same experimental verdict before and after its original detail split',async()=>{
  const cases=(await returnDiagnosticCases()).filter(c=>c.name.startsWith('photographic-'));
  assert.equal(cases.length,2);
  for(const entry of cases){
    const model=new CurveGraph(entry.paths);
    assert.deepEqual(experimentalSelfReturns(model.solution(model.points,1),entry.cfg),[]);
  }
});
