import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {exactTemplate} from '../../static/inverse/core/engine.js';
import * as schedule from '../../static/inverse/core/exact/schedule.js';
import {exactSearch} from '../../static/inverse/core/exact/stage.js';
import {traceExactSearch, traceSchedule} from './search-schedule-harness.mjs';

// The traces of exactTemplate's schedule as it was before it became tables (exact/schedule.js), driven through
// the same scripted tools (search-schedule-harness.mjs): made by search-schedule-reference.mjs from the old code in
// git, again whenever the harness changes. They hold what the schedule asks of the searches and what it answers,
// not the searches themselves nor how long real ones take, nor design()'s ends (TRACED_SECONDS...).
const reference = JSON.parse(fs.readFileSync(new URL('./fixtures/search-schedule-traces.json', import.meta.url)));

/** Whether `trace(code, seed)` gives every one of `traces` as recorded: the first that differs shown in full. */
async function sameTraces(traces, trace, code) {
  const differing = [];
  for (const [seed, calls, result] of traces)
    if (JSON.stringify(await trace(code, seed)) !== JSON.stringify({calls, result})) differing.push(seed);
  if (differing.length) {
    const [seed, calls, result] = traces.find(([s]) => s === differing[0]);
    assert.deepEqual(await trace(code, seed), {calls, result}, `${differing.length} scenarios differ: seeds ${differing.slice(0, 12).join(', ')}`);
  }
}

test('the exact search schedules every scenario as the code before it did: the same calls, the same answer', async () => {
  assert.ok(reference.traces.length >= 500);
  await sameTraces(reference.traces, traceSchedule, exactTemplate);
});

test('one outline\'s search and its fallbacks run every scenario as the code before them did', async () => {
  assert.ok(reference.searches.length >= 300);
  await sameTraces(reference.searches, traceExactSearch, exactSearch);
});

test('the scenarios reach every step of both branches', () => {
  const reports = reference.traces.map(([, , result]) => result?.report ?? {});
  const has = (what, count = 5) => assert.ok(reports.filter(what).length >= count, what.toString());
  has(r => r.ladderOnly && r.chosen === 'exact' && r.phase === 'first');
  has(r => r.ladderOnly && r.chosen === 'exact' && r.phase === 'second');
  has(r => r.ladderOnly && r.loose);
  has(r => r.ladderOnly && r.chosen === 'fitter' && r.outline !== undefined);
  has(r => r.ladderOnly && r.outline >= 4, 3);
  has(r => r.rounded === 'returns', 3);
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

test('the schedule\'s constants and the ladder\'s rungs are those engine.js and exact/stage.js had', () => {
  for (const [name, value] of Object.entries(reference.constants)) assert.deepEqual(schedule[name], value, name);
  assert.deepEqual([null, 'first', 'second'].map(schedule.ladderRungs), reference.rungs);
});

test('the scenarios of one outline\'s search reach each of its grids and fallbacks', () => {
  const results = reference.searches.map(([, , result]) => result ?? {});
  const has = (what, count = 5) => assert.ok(results.filter(what).length >= count, what.toString());
  has(r => r.report?.reason === 'no time left');
  has(r => r.report?.even);
  has(r => r.report?.unjoined && !r.report.untied, 3);
  has(r => r.report?.unjoined && !r.report.even, 3);
  has(r => r.report?.unjoined && r.report.untied);
  has(r => r.report?.subgroup && r.report.subgroup.to.length);
  has(r => r.report?.subgroup && !r.report.subgroup.to.length);
  has(r => r.report?.search?.bare || r.report?.bare);
  has(r => r.report?.search?.bareThenCoarse, 3);
  has(r => r.report?.search?.finer);
  has(r => r.report?.refined?.taken);
  has(r => r.report?.ladderNearest);
  has(r => r.near);
  has(r => r.thrown, 3);
});
