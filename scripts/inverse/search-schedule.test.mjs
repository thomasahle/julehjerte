import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {exactTemplate} from '../../static/inverse/core/engine.js';
import {traceSchedule} from './search-schedule-harness.mjs';

// The traces of exactTemplate's schedule as it was before it became tables (search-schedule-reference.mjs:
// the old code from git, driven through the same scripted tools).
const reference = JSON.parse(fs.readFileSync(new URL('./fixtures/search-schedule-traces.json', import.meta.url)));

test('the exact search schedules every scenario as the code before it did: the same calls, the same answer', async () => {
  assert.ok(reference.traces.length >= 500);
  const differing = [];
  for (const [seed, calls, result] of reference.traces) {
    const now = await traceSchedule(exactTemplate, seed);
    if (JSON.stringify(now) !== JSON.stringify({calls, result})) differing.push(seed);
  }
  if (differing.length) {
    const [seed, calls, result] = reference.traces.find(([s]) => s === differing[0]);
    assert.deepEqual(await traceSchedule(exactTemplate, seed), {calls, result}, `seeds ${differing.join(', ')} differ`);
  }
});

test('the scenarios reach every step of both branches', () => {
  const reports = reference.traces.map(([, , result]) => result?.report ?? {});
  const has = (what, count = 5) => assert.ok(reports.filter(what).length >= count, what.toString());
  has(r => r.ladderOnly && r.chosen === 'exact' && r.phase === 'first');
  has(r => r.ladderOnly && r.chosen === 'exact' && r.phase === 'second');
  has(r => r.ladderOnly && r.loose);
  has(r => r.ladderOnly && r.chosen === 'fitter' && r.outline !== undefined);
  has(r => r.ladderOnly && r.outline >= 4, 3);
  has(r => r.rounded === 'returns');
  has(r => r.outerStrip && !r.rounded);
  has(r => r.rounded === 'near');
  has(r => r.rounded === true);
  has(r => r.rounded === 'wider');
  has(r => r.outerStrip && r.rounded);
  has(r => r.repairedReturns);
  has(r => r.paired);
  has(r => r.specks);
  has(r => r.error && r.chosen === 'fitter' && !r.attempted);
  const thrown = reference.traces.filter(([, , result]) => result?.thrown);
  assert.ok(thrown.length >= 5 && thrown.length < reference.traces.length / 10);
});
