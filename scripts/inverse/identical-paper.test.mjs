import test from 'node:test';
import assert from 'node:assert/strict';
import {materialAudit} from '../../static/inverse/core/material.js';
import {Cubic} from '../../static/inverse/core/bezier.js';
import {settings} from '../../static/inverse/core/settings.js';
import {fixture} from './fixtures.mjs';

const cfg=settings({width:60,minWidth:3,cutError:0,printShrinkPercent:0,materialResolution:80});
const withoutTime=result=>{delete result.summary.seconds;return result;};

test('identical paper results own their maps, dimensions and fold intervals',()=>{
  const solution=fixture('straight'),result=materialAudit(solution,cfg,{includeMaps:true}),[a,b]=result.families;
  assert.deepEqual({...a,family:1},b);
  const saved=structuredClone(b);
  a.map.fill(255);a.resolution[0]=0;a.foldIntervals[0].interval[0]=-100;a.foldIntervals[0].certainCoreLength=-1;
  assert.deepEqual(b,saved);
  assert.deepEqual(materialAudit(solution,cfg,{includeMaps:true}).families[1],saved);
});

test('subnanometre sheet differences at a guard threshold retain distinct core maps',()=>{
  const solution=fixture('straight'),h=cfg.width/cfg.materialResolution,guard=Math.SQRT2*h/2+cfg.geometryTolerance;
  // Put one straight cut just to either side of a certain/possible threshold.
  // Approximate template equality would incorrectly erase the difference.
  const x=29.5*h-cfg.nominalWidth/2-guard,epsilon=1e-9;
  for(const f of[0,1])for(const p of solution.graph.edges[solution.paths[f][0][0][0]].curve.p)p[f]=x+(f?epsilon:-epsilon);
  const result=materialAudit(solution,cfg,{includeMaps:true}),i=120*cfg.materialResolution+29;
  assert.equal(result.families[0].map[i],1);
  assert.equal(result.families[1].map[i],2);
  assert.notDeepEqual(result.families[0].map,result.families[1].map);
});

test('a later change to one sheet receives a new audit and cannot inherit the first sheet',()=>{
  const solution=fixture('straight'),before=withoutTime(materialAudit(solution,cfg,{includeMaps:true}));
  const edge=solution.graph.edges[solution.paths[1][1][0][0]];
  edge.curve=new Cubic(edge.curve.p.map(([x])=>[x,21]));
  const after=withoutTime(materialAudit(solution,cfg,{includeMaps:true}));
  assert.deepEqual(after.families[0],before.families[0]);
  assert.equal(before.families[1].status,'pass');
  assert.equal(after.families[1].status,'fail');
  assert.equal(after.passed,false);
});

test('equal fold endpoints do not hide a different interior cutting curve',()=>{
  const solution=fixture('straight'),edge=solution.graph.edges[solution.paths[1][0][0][0]];
  edge.curve=new Cubic([[0,20],[25,39],[35,39],[60,20]]);
  const [a,b]=materialAudit(solution,cfg,{includeMaps:true}).families;
  assert.deepEqual(a.foldIntervals.map(f=>f.interval),b.foldIntervals.map(f=>f.interval));
  assert.notDeepEqual(a.map,b.map);
});
