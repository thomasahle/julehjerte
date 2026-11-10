import test from 'node:test';
import assert from 'node:assert/strict';
import {settings} from '../../static/inverse/core/settings.js';
import {AUTOMATIC_PRESET} from '../../static/inverse/core/presets.js';
import {loadSVG} from '../../static/inverse/core/input.js';
import {exactFromTemplate, NOT_SYMMETRIC} from '../../static/inverse/core/exact/search.js';
import {whyCannotStart, exactCannotStart, UNEVEN, NO_SIDES} from '../../static/inverse/core/exact/stage.js';
import {noteError} from '../../static/inverse/core/errors.js';

// Rings in the reference frame (12 units, y up) as a plain SVG, a 100 mm heart.
const svgOf = rings => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 12"><path fill="#b91313" fill-rule="evenodd" d="${
  rings.map(ring => 'M' + ring.map(([x, y]) => `${x.toFixed(9)},${(12 - y).toFixed(9)}`).join('L') + 'Z').join('')}"/></svg>`;
const cfg = settings({...AUTOMATIC_PRESET, width: 100, minWidth: 2, cutError: .25, printShrinkPercent: .2, trials: 0});
const targetOf = rings => loadSVG(svgOf(rings), {width: 100, maxSpan: 15, tolerance: cfg.geometryTolerance});

test('why the exact search cannot start comes with a code beside the message the page shows', () => {
  // A box against the top side: two cut ends there, none at the bottom.
  const uneven = targetOf([[[4, 8], [8, 8], [8, 12], [4, 12]]]);
  assert.deepEqual(whyCannotStart(uneven, cfg), {code: UNEVEN, message: 'The outline ends unevenly on opposite sides.'});
  assert.equal(exactCannotStart(uneven, cfg), 'The outline ends unevenly on opposite sides.');
  // A box in the middle reaches no side.
  const inside = targetOf([[[4, 4], [8, 4], [8, 8], [4, 8]]]);
  assert.equal(whyCannotStart(inside, cfg).code, NO_SIDES);
  // A strip from the bottom side to the top reaches one pair of sides only.
  assert.equal(whyCannotStart(targetOf([[[4, 0], [8, 0], [8, 12], [4, 12]]]), cfg).code, NO_SIDES);
  // Two squares of a 2 x 2 heart, touching in the middle: it can start.
  const heart = targetOf([[[0, 0], [6, 0], [6, 6], [0, 6]], [[6, 6], [12, 6], [12, 12], [6, 12]]]);
  assert.equal(whyCannotStart(heart, cfg), null);
  assert.equal(exactCannotStart(heart, cfg), null);
});

test('an outline not symmetric enough for the ties is NOT_SYMMETRIC, its message as before', async () => {
  // A strip off the middle has no image under the mirror across it.
  const target = targetOf([[[2, 0], [5, 0], [5, 12], [2, 12]]]);
  const found = await exactFromTemplate(target, null, cfg, {seconds: 1, paperRetries: 0, symmetry: ['mirrorX'],
    witness: {positions: new Map(), labels: new Map(), chords: []}});
  assert.equal(found.code, NOT_SYMMETRIC);
  assert.match(found.error, /^The outline is not symmetric enough: /);
});

test('a noted error keeps a bounded list and warns once a place, and never throws', () => {
  const warn = console.warn, warnings = [];
  console.warn = (...args) => warnings.push(args);
  try {
    delete globalThis.__malErrors;
    for (let i = 0; i < 60; i++) noteError('test place', new TypeError(`crash ${i}`));
    noteError('another place', 'a string');
    assert.equal(globalThis.__malErrors.length, 50);
    assert.deepEqual(globalThis.__malErrors.at(-2), {where: 'test place', name: 'TypeError', message: 'crash 59'});
    assert.deepEqual(globalThis.__malErrors.at(-1), {where: 'another place', name: 'string', message: 'a string'});
    assert.equal(warnings.length, 2);
    assert.equal(noteError('a third', {get message() { throw new Error('unreadable'); }}), undefined);
  } finally {
    console.warn = warn;
    delete globalThis.__malErrors;
  }
});
