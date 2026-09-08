import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {materialAudit} from '../../static/inverse/core/material.js';
import {settings} from '../../static/inverse/core/settings.js';
import {fixture} from './fixtures.mjs';

// Captured from the pre-optimization implementation, including every map pixel,
// component area and fold interval. Elapsed time is the only excluded field.
test('paper acceleration preserves complete guarded maps and decisions',()=>{
  const hashes={straight:'dd898579d6c7c89f8abbaa6bced7f141d8d5c32eeec4a3a5f6d0aa7c9aaed8c9',neck:'8918f38e8907de8e201d83b2085fd677707f411ba9accb33c4447eecdfb1b187',thin:'a7a8c91cb8f200ff2a85019dab78f6339b8513622fb0fc729d47b831e7e2876f'};
  const cfg=settings({width:60,cutError:0,printShrinkPercent:0,materialResolution:180,minWidth:3});
  for(const[name,expected]of Object.entries(hashes)){
    const result=materialAudit(fixture(name),cfg,{includeMaps:true});delete result.summary.seconds;
    assert.equal(createHash('sha256').update(JSON.stringify(result)).digest('hex'),expected,name);
  }
});
