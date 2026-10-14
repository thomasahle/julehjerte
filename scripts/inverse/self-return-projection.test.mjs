import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {buildShortReturnRuntime} from './diagnostics/build-short-return-runtime.mjs';
import {returnDiagnosticCases} from './self-return-subdivision-study.mjs';

test('experimental constraint projection widens a short return without mutating its caller or fixed endpoints',async()=>{
  await fs.mkdir('tmp',{recursive:true});const scratch=await fs.mkdtemp('tmp/return-projection-test-');
  try{
    const directory=await buildShortReturnRuntime(path.join(scratch,'runtime'));
    const load=file=>import(pathToFileURL(path.join(directory,'inverse/core',file)).href);
    const {CurveGraph}=await load('direct/curves.js'),{projectShortReturns}=await load('direct/short-return-project.js'),{validate}=await load('validate.js'),{Cubic}=await load('bezier.js');
    const entry=(await returnDiagnosticCases()).find(c=>c.name==='curved-return-1'),graph=new CurveGraph(entry.paths),before=graph.points.slice();
    const initialAudit=validate(graph.solution(before,1),entry.cfg,{checkImage:false});
    assert.equal(initialAudit.passed,false);assert.ok(initialAudit.issues.every(i=>i.type==='short_self_clearance'));
    const projected=projectShortReturns(graph,before,1,{},entry.cfg,{initialAudit});
    assert.equal(projected.report.accepted,true);assert.ok(projected.points);
    assert.equal(validate(graph.solution(projected.points,1),entry.cfg,{checkImage:false}).passed,true);
    for(let i=0;i<before.length;i++)if(graph.fixed[i])assert.equal(projected.points[i],before[i]);
    assert.deepEqual(before,graph.points);
    const divided=graph.nested(projected.points).map(f=>f.map(p=>p.flatMap(points=>{
      // Exact subdivision must not hide the repaired return from its validator.
      const [a,b]=new Cubic(points).split();return[a.p,b.p];
    })));
    // The runtime and its source fixture use the same Cubic parameterization.
    const subdivided=new CurveGraph(divided);
    assert.equal(validate(subdivided.solution(subdivided.points,1),entry.cfg,{checkImage:false}).passed,true);
    assert.equal(projectShortReturns(graph,before,1,{},entry.cfg,{deadline:-Infinity}).points,null);
    assert.equal(projectShortReturns(graph,before,1,{},entry.cfg,{hiddenOnly:true}).points,null,'This fixture has no shared hidden controls.');
    graph.fixed.fill(1);
    assert.equal(projectShortReturns(graph,before,1,{},entry.cfg).points,null,'An immovable return must not be certified.');
    assert.deepEqual(before,graph.points);
  }finally{await fs.rm(scratch,{recursive:true,force:true});}
});
