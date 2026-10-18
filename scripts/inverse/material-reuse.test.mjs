import test from 'node:test';
import assert from 'node:assert/strict';
import {materialAudit,paperAuditReuseStats} from '../../static/inverse/core/material.js';
import {Cubic} from '../../static/inverse/core/bezier.js';
import {settings} from '../../static/inverse/core/settings.js';
import {fixture} from './fixtures.mjs';

const cfg=settings({width:60,minWidth:3,materialResolution:80});
const stable=result=>{delete result.summary.seconds;return result;};
const check=(solution,options=cfg)=>{
  const expected=stable(materialAudit(solution,options,{reuse:false}));
  assert.deepEqual(stable(materialAudit(solution,options)),expected);
  return expected;
};

test('exact repeated paper inputs reuse only independently owned results',()=>{
  const solution=fixture('neck'),expected=check(solution),before=paperAuditReuseStats();
  const result=materialAudit(solution,cfg);
  assert.ok(paperAuditReuseStats().reused>before.reused);
  result.passed=!result.passed;result.summary.status='corrupted';
  for(const family of result.families){
    family.status='corrupted';family.resolution.fill(1);
    family.foldIntervals[0].interval.fill(-1);family.foldIntervals[0].certainCoreLength=-1;
  }
  assert.deepEqual(stable(materialAudit(solution,cfg)),expected);
  const stats=paperAuditReuseStats();
  materialAudit(solution,cfg,{includeMaps:true});
  materialAudit(solution,cfg,{native:false});
  assert.deepEqual(paperAuditReuseStats(),stats,'Independent backends and maps bypass reuse.');
});

test('paper reuse compares actual chords, fold endpoints and every numerical setting',()=>{
  const solution=fixture('straight');check(solution);
  const before=paperAuditReuseStats();
  // Mutate in place, well below a typical rounded cache-key precision.
  solution.graph.edges[0].curve.p[0][0]+=1e-9;
  check(solution);assert.ok(paperAuditReuseStats().computed>before.computed);
  const flattened=solution.graph.edges[0].curve.flatten(cfg.geometryTolerance),cached=paperAuditReuseStats();
  flattened[1][0]+=.1;
  check(solution);
  assert.ok(paperAuditReuseStats().computed>cached.computed,'Stored audit inputs must not alias mutable flattened chords.');
  solution.graph.edges[0].curve=new Cubic([[12,0],[48,16],[-18,43],[27,60]]);
  check(solution);
  for(const change of [{materialResolution:81},{geometryTolerance:.02},{nominalWidth:8},{minFeatureArea:2}]){
    const at=paperAuditReuseStats();check(solution,{...cfg,...change});
    assert.ok(paperAuditReuseStats().computed>at.computed);
  }
  solution.graph.target.width=61;check(solution,{...cfg,width:61});
  assert.ok(paperAuditReuseStats().entries<=4);
});
