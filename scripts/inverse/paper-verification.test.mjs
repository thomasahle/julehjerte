import test from 'node:test';
import assert from 'node:assert/strict';
import {CurveGraph} from '../../static/inverse/core/direct/curves.js';
import {Cubic} from '../../static/inverse/core/bezier.js';
import {materialAudit,verifiedPaperSettings} from '../../static/inverse/core/material.js';
import {settings} from '../../static/inverse/core/settings.js';
import {finish} from '../../static/inverse/core/engine.js';

test('export rechecks a finer verified paper lattice without changing physical tolerances',()=>{
  const cfg=settings({algorithm:'direct',trials:0,roundHidden:false});
  const graph=new CurveGraph([
    [48.55,51.45].map(x=>[Cubic.line([x,0],[x,100]).p]),
    [[Cubic.line([0,50],[100,50]).p]]
  ],100),solution=graph.solution(graph.points,1);
  const coarse=materialAudit(solution,cfg);
  assert.equal(coarse.status,'uncertain');
  solution.report={algorithm:'direct-bezier',paperVerification:{requestedResolution:360,initialStatus:'uncertain',resolution:700,status:'pass'}};
  const refined=verifiedPaperSettings(solution,cfg);
  assert.deepEqual({...refined,materialResolution:cfg.materialResolution},cfg);
  assert.equal(materialAudit(solution,refined).status,'pass');
  const answer=finish(solution,cfg);
  assert.equal(answer.report.settings.materialResolution,700);
  assert.equal(answer.report.manufacturing.status,'pass');
  assert.equal(answer.report.manufacturing.gridSpacing,100/700);
  assert.equal(cfg.materialResolution,360,'Do not mutate the requested settings');
  // A remembered pass never certifies edited geometry: narrower cuts fail
  // fresh validation even when the caller carries the same report metadata.
  const narrow=new CurveGraph([
    [49.5,50.5].map(x=>[Cubic.line([x,0],[x,100]).p]),
    [[Cubic.line([0,50],[100,50]).p]]
  ],100),edited=narrow.solution(narrow.points,1);edited.report=solution.report;
  assert.equal(finish(edited,cfg).report.templateChecksPassed,false);
});

test('paper verification cannot lower the requested resolution or exceed the supported bound',()=>{
  const cfg=settings({materialResolution:540});
  for(const resolution of [undefined,NaN,360,540,700.5,701,'700']){
    assert.equal(verifiedPaperSettings({report:{paperVerification:{resolution}}},cfg),cfg);
  }
});
