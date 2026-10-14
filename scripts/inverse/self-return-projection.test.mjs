import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {buildShortReturnRuntime} from './diagnostics/build-short-return-runtime.mjs';
import {returnDiagnosticCases} from './self-return-subdivision-study.mjs';
import {diagnosticSubdivisions,subdivideDiagnosticPaths} from './self-return-subdivision-study.mjs';
import {renderExportedWeave} from './export-renderer.mjs';

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

test('a final repair can move hidden shared controls farther while preserving the exact woven mask',async()=>{
  await fs.mkdir('tmp',{recursive:true});const scratch=await fs.mkdtemp('tmp/hidden-return-test-');
  try{
    const directory=await buildShortReturnRuntime(path.join(scratch,'runtime'));
    const load=file=>import(pathToFileURL(path.join(directory,'inverse/core',file)).href);
    const {CurveGraph}=await load('direct/curves.js'),{projectShortReturns}=await load('direct/short-return-project.js');
    const {validate}=await load('validate.js'),{materialAudit}=await load('material.js'),{solutionJSON}=await load('graph.js');
    const fixture=JSON.parse(await fs.readFile('scripts/inverse/fixtures/final-hidden-return.json'));
    const cfg=fixture.settings,phase=fixture.phase,graph=new CurveGraph(fixture.paths,cfg.width),before=graph.points.slice();
    const initial=graph.solution(before,phase),audit=validate(initial,cfg,{checkImage:false});
    assert.ok(!audit.passed&&audit.issues.every(i=>i.type==='short_self_clearance'));
    const repaired=projectShortReturns(graph,before,phase,{},cfg,{initialAudit:audit,hiddenOnly:true,maxIterations:64,maxMilliseconds:2000});
    assert.ok(repaired.points,'The final hidden-control repair should complete within its finite allowance.');
    assert.ok(repaired.report.accepted);
    const visible=new Set(graph.edges.flatMap((ids,e)=>graph.visible[e]?ids:[]));
    for(let i=0;i<before.length;i++)if(graph.fixed[i]||visible.has(Math.floor(i/2)))assert.equal(repaired.points[i],before[i]);
    const movement=Math.max(...repaired.points.map((v,i)=>Math.abs(v-before[i])));
    assert.ok(movement>.015*cfg.width,'This captured repair exceeds the old hidden-control bound.');
    assert.ok(movement<=cfg.nominalWidth);
    const solution=graph.solution(repaired.points,phase);
    assert.equal(materialAudit(solution,cfg).summary.status,'pass');
    const originalRender=await renderExportedWeave(solutionJSON(initial),400);
    const repairedRender=await renderExportedWeave(solutionJSON(solution),400);
    assert.deepEqual(repairedRender.mask,originalRender.mask,'Independent exported rendering must be pixel-identical.');
    for(const knots of Object.values(diagnosticSubdivisions))for(const reflect of [false,true]){
      const divided=subdivideDiagnosticPaths(graph.nested(repaired.points),knots,reflect,cfg.width),other=new CurveGraph(divided.paths,cfg.width);
      assert.equal(validate(other.solution(other.points,phase),cfg,{checkImage:false}).passed,true);
    }
    assert.deepEqual(before,graph.points);
    assert.equal(projectShortReturns(graph,before,phase,{},cfg,{deadline:-Infinity,hiddenOnly:true,maxIterations:64,maxMilliseconds:2000}).points,null);
  }finally{await fs.rm(scratch,{recursive:true,force:true});}
});
