import test from 'node:test';
import assert from 'node:assert/strict';
import {createCanvas,loadImage} from 'canvas';
import {motifFixture} from './motif-fixture.mjs';
import {shapeCells} from '../../src/lib/paint/frame.ts';
import {resample} from '../../src/lib/paint/mask.ts';
import {prepare} from '../../static/inverse/core/engine.js';
import {prepareBoundary} from '../../static/inverse/core/direct/topology.js';
import {buildGraph} from '../../static/inverse/core/graph.js';
import {solveGraph} from '../../static/inverse/core/solver.js';
import {settings} from '../../static/inverse/core/settings.js';
import {AUTOMATIC_PRESET,MATCHING_GRID_PRESET} from '../../static/inverse/core/presets.js';
import {materialAudit} from '../../static/inverse/core/material.js';
import {fixture} from './fixtures.mjs';

const pixels=createCanvas(240,240),context=pixels.getContext('2d');
context.drawImage(await loadImage(motifFixture('house').original),0,0);
const imported=prepare({type:'pixels',imageWidth:240,imageHeight:240,rgba:context.getImageData(0,0,240,240).data},{...AUTOMATIC_PRESET,resolution:240});
const inputCfg=settings({...AUTOMATIC_PRESET,width:100,timeLimit:5,trials:0,maxRounds:1});
const cfg=settings({...inputCfg,...MATCHING_GRID_PRESET});
const source={mask:resample(imported.preview.mask,imported.preview.resolution,400),weights:shapeCells({mode:'free',shape:'diamond',size:.64},400),resolution:400};
const input=prepare({type:'mask',...source},inputCfg).target;
const graph=phase=>buildGraph(prepareBoundary(input,inputCfg,{guidePhase:phase}),cfg);

test('an integral LP routing passes the original binary residual and independent paper checks',async()=>{
  let audits=0;
  const solution=await solveGraph(graph(1),cfg,{relaxationOnly:true,stopAfterValidated:true,coefficientQuantum:1e-7,coreGate:s=>{audits++;return materialAudit(s,cfg);}});
  assert.equal(solution.report.relaxationOnly,true);
  assert.ok(solution.report.binaryVariables>0,'The reference model must retain its binary requirements.');
  assert.equal(solution.report.history.length,1);
  const timing=solution.report.history[0];
  assert.ok(timing.budgetSeconds>0&&timing.budgetSeconds<=cfg.timeLimit);
  assert.ok(timing.solveSeconds>=0&&timing.solveSeconds<=timing.elapsedSeconds);
  assert.ok(timing.elapsedSeconds<=solution.report.elapsedSeconds);
  assert.ok(solution.report.history[0].relaxationResidual<=2e-5);
  assert.equal(solution.report.validation.passed,true);
  assert.equal(solution.report.validation.materialCore.status,'pass');
  assert.equal(audits,1);
  assert.deepEqual(solution.paths.map(p=>p.length),[4,4]);
  assert.equal(solution.report.relaxationBound,solution.report.objective);
  assert.equal(solution.report.mipGap,0);
});

test('a fractional LP routing stops before extraction or paper validation and is never rounded',async()=>{
  let audits=0;
  await assert.rejects(solveGraph(graph(0),cfg,{relaxationOnly:true,stopAfterValidated:true,coefficientQuantum:1e-7,coreGate:()=>{audits++;throw new Error('A fractional answer must never reach the paper gate.');}}),error=>{
    assert.equal(error.report.termination,'relaxation_residual');
    assert.equal(error.report.history.length,1);
    assert.ok(error.report.history[0].relaxationResidual>.1);
    assert.ok(Number.isFinite(error.report.relaxationBound));
    return true;
  });
  assert.equal(audits,0);
});

test('an integral relaxation still fails when the paper gate rejects it',async()=>{
  const pair=fixture('straight'),cfg=settings({width:60,trials:0,timeLimit:5,maxRounds:1});let audits=0;
  await assert.rejects(solveGraph(pair.graph,cfg,{relaxationOnly:true,stopAfterValidated:true,coreGate:()=>{audits++;return{passed:false,summary:{status:'fail',reason:'controlled rejection'}};}}),error=>{
    assert.equal(error.report.status,'no_validated_solution');
    assert.ok(error.report.history[0].relaxationResidual<=2e-5);
    assert.equal(error.report.history[0].validationPassed,false);
    assert.equal(error.report.history[0].issues[0].type,'material_core');
    return true;
  });
  assert.equal(audits,1);
});
