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

test('final return repair preserves identical sheets and requested cutting symmetries',async()=>{
  await fs.mkdir('tmp',{recursive:true});const scratch=await fs.mkdtemp('tmp/symmetric-return-test-');
  try{
    const directory=await buildShortReturnRuntime(path.join(scratch,'runtime'));
    const load=file=>import(pathToFileURL(path.join(directory,'inverse/core',file)).href);
    const {CurveGraph}=await load('direct/curves.js'),{projectShortReturns}=await load('direct/short-return-project.js');
    const {validate}=await load('validate.js'),{Cubic}=await load('bezier.js');
    const {symmetryReport}=await load('direct/symmetry.js'),{matchingSummary}=await load('direct/matching.js');
    const entry=(await returnDiagnosticCases()).find(c=>c.name==='curved-return-1'),cut=entry.paths[0][0],line=entry.paths[1][0];
    const map=(p,fn)=>p.map(c=>c.map(fn)),reverse=p=>p.toReversed().map(c=>c.toReversed()),transpose=p=>map(p,([x,y])=>[y,x]);
    const upper=[Cubic.line([50,0],[50,30]).p,[[50,30],[53,30],[53,31],[50,31]],Cubic.line([50,31],[50,50]).p];
    const mirrored=[map(cut,([x,y])=>[x-20,y]),map(cut,([x,y])=>[120-x,y])];
    const cases=[
      {name:'matching without a requested symmetry',paths:[[cut],[transpose(cut)]],symmetry:{}},
      {name:'matching with an additional pinned control',paths:[[cut],[transpose(cut)]],symmetry:{},pin:true},
      {name:'transpose',paths:[[cut],[transpose(cut)]],symmetry:{transpose:true}},
      {name:'antiTranspose',paths:[[cut],[reverse(map(cut,([x,y])=>[100-y,100-x]))]],symmetry:{antiTranspose:true}},
      {name:'mirrorX',paths:[mirrored,[line]],symmetry:{mirrorX:true}},
      {name:'mirrorY',paths:[[transpose(line)],mirrored.map(transpose)],symmetry:{mirrorY:true}},
      {name:'rotate180',paths:[[map(cut,([x,y])=>[x-20,y]),reverse(map(cut,([x,y])=>[120-x,100-y]))],[line,reverse(map(line,([x,y])=>[100-x,100-y]))]],symmetry:{rotate180:true}},
    ];
    for(const mode of ['sym','anti']){
      const own=[...upper,...reverse(map(upper,([x,y])=>[mode==='sym'?x:100-x,100-y]))];
      cases.push({name:'withinCurve '+mode,paths:[[own],[line]],symmetry:{withinCurve:mode}});
      cases.push({name:'withinCurve '+mode+' and matching',paths:[[own],[transpose(own)]],symmetry:{withinCurve:mode,transpose:true}});
    }
    for(const c of cases){
      const graph=new CurveGraph(c.paths),cfg={...entry.cfg,symmetry:c.symmetry};
      if(c.pin){const [edge]=graph.paths[graph.families[0][0]][1];graph.fixed[2*graph.edges[edge][1]+1]=1;}
      const before=graph.points.slice(),initial=graph.solution(before,1),initialAudit=validate(initial,cfg,{checkImage:false}),matching=matchingSummary(initial);
      assert.ok(!initialAudit.passed&&initialAudit.issues.every(i=>i.type==='short_self_clearance'),c.name);
      const originalSymmetry=symmetryReport(initial,cfg.symmetry);
      assert.deepEqual(originalSymmetry.honoured,originalSymmetry.requested,c.name);
      const repaired=projectShortReturns(graph,before,1,{},cfg,{initialAudit,maxIterations:64,maxMilliseconds:2000});
      assert.ok(repaired.points&&repaired.report.accepted,c.name);
      const solution=graph.solution(repaired.points,1),symmetry=symmetryReport(solution,cfg.symmetry);
      assert.deepEqual(symmetry.honoured,symmetry.requested,c.name);
      if(matching.identical)assert.equal(matchingSummary(solution).identical,true,c.name);
      for(let i=0;i<before.length;i++)if(graph.fixed[i])assert.equal(repaired.points[i],before[i],c.name);
      assert.deepEqual(graph.points,before,c.name);
      for(const knots of Object.values(diagnosticSubdivisions))for(const reflect of [false,true]){
        const divided=subdivideDiagnosticPaths(graph.nested(repaired.points),knots,reflect,graph.width),other=new CurveGraph(divided.paths,graph.width);
        assert.equal(validate(other.solution(other.points,1),cfg,{checkImage:false}).passed,true,c.name+' after exact subdivision/reflection');
      }
    }
    const inconsistent=new CurveGraph(entry.paths),before=inconsistent.points.slice();
    const rejected=projectShortReturns(inconsistent,before,1,{}, {...entry.cfg,symmetry:{transpose:true}});
    assert.equal(rejected.points,null,'A final repair must not silently impose a symmetry missing from its input.');
    assert.equal(rejected.report.rejected,'initial_symmetry');assert.deepEqual(inconsistent.points,before);
  }finally{await fs.rm(scratch,{recursive:true,force:true});}
});
