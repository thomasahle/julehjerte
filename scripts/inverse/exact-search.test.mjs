import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {buildStructure, describe, pointKey} from '../../static/inverse/core/exact/structure.js';
import {settings, DEFAULTS} from '../../static/inverse/core/settings.js';
import {AUTOMATIC_PRESET} from '../../static/inverse/core/presets.js';
import {loadSVG, sampleTarget} from '../../static/inverse/core/input.js';
import {loadSolutionJSON} from '../../static/inverse/core/graph.js';
import {validate} from '../../static/inverse/core/validate.js';
import {targetSegments} from '../../static/inverse/core/exact/target.js';
import {exactOutline} from '../../static/inverse/core/exact/snap.js';
import {readTemplate} from '../../static/inverse/core/exact/template.js';
import {exactFromTemplate} from '../../static/inverse/core/exact/search.js';
import {gridWitness} from '../../static/inverse/core/exact/grid.js';
import {prepare, restorePrepared, design} from '../../static/inverse/core/engine.js';
import {finishExactStopped} from '../../static/inverse/core/stopped.js';

const svgOf = rings => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 12"><path fill="#b91313" fill-rule="evenodd" d="${
  rings.map(ring => 'M' + ring.map(([x, y]) => `${x.toFixed(9)},${(12 - y).toFixed(9)}`).join('L') + 'Z').join('')}"/></svg>`;
const cfg = settings({...AUTOMATIC_PRESET, width: 100, minWidth: 2, cutError: .25, printShrinkPercent: .2, trials: 0});

test('two shapes overlapping by a hair at a corner touch there once, without slivers', () => {
  // The second square's corner pokes 1e-5 into the first: noding splits the
  // crossing into points micrometres apart, which must be one touching.
  const target = loadSVG(svgOf([[[2, 2], [6, 2], [6, 6], [2, 6]], [[5.99999, 5.99999], [10, 5.99999], [10, 10], [5.99999, 10]]]),
    {width: 100, maxSpan: 15, tolerance: cfg.geometryTolerance});
  const st = buildStructure(targetSegments(target));
  assert.equal(describe(st).touchings, 1);
  for (const e of st.edges) {
    let length = 0;
    for (let i = 1; i < e.pts.length; i++) length += Math.hypot(e.pts[i][0] - e.pts[i - 1][0], e.pts[i][1] - e.pts[i - 1][1]);
    assert.ok(length > 1e-3, 'no sliver edge');
  }
});

test('a picture takes the exact search\'s template, exported, when it passes', async () => {
  // A classic 3 x 3 heart as Mal sends a mask: the exact template follows the
  // squares' edges with no hidden cut, and the fitter is never run.
  const n = 400, mask = new Uint8Array(n * n), colors = ['#b91313', '#ffffff'];
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) mask[y * n + x] = (Math.floor(3 * x / n) + Math.floor(3 * y / n)) % 2 ? 0 : 1;
  const prepared = prepare({type: 'mask', mask, resolution: n}, {...AUTOMATIC_PRESET, width: 100, resolution: n, paperColors: colors, mode: 'swatches', swatches: colors, invert: false, removeSpecks: 0});
  const stages = new Set();
  const answer = await design(restorePrepared(prepared.target), {...AUTOMATIC_PRESET, width: 100, minWidth: 2, cutError: .25, timeLimit: 60, exactOutline: true, paperColors: colors, trials: 0}, event => stages.add(event.stage));
  assert.equal(answer.report.solver.exactOutline.chosen, 'exact');
  assert.ok(answer.report.templateChecksPassed);
  assert.ok(answer.files['cut_geometry.json']);
  assert.ok(stages.has('exactOutline'));
  assert.ok(![...stages].some(stage => String(stage).startsWith('direct')), [...stages].join());
});

test('a stopped search finishes the exact search\'s last drawing as its answer', async () => {
  const n = 400, mask = new Uint8Array(n * n), colors = ['#b91313', '#ffffff'];
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) mask[y * n + x] = (Math.floor(3 * x / n) + Math.floor(3 * y / n)) % 2 ? 0 : 1;
  const prepared = prepare({type: 'mask', mask, resolution: n}, {...AUTOMATIC_PRESET, width: 100, resolution: n, paperColors: colors, mode: 'swatches', swatches: colors, invert: false, removeSpecks: 0});
  const raw = {...AUTOMATIC_PRESET, width: 100, minWidth: 2, cutError: .25, timeLimit: 60, exactOutline: true, paperColors: colors, trials: 0, progressGeometry: true, exactRoute: 'exact'};
  let drawing = null;
  await design(restorePrepared(prepared.target), raw, event => { if (event.stage === 'exactOutline' && typeof event.geometry === 'string') drawing = event.geometry; });
  assert.ok(drawing);
  const result = finishExactStopped(restorePrepared(prepared.target), settings(raw), drawing);
  assert.ok(result?.report.templateChecksPassed);
  assert.equal(result.report.solver.termination, 'user_stop');
});

test('the exact-outline stage is off unless asked for', () => {
  assert.equal(DEFAULTS.exactOutline, false);
  assert.equal(settings({exactOutline: true}).exactOutline, true);
  assert.throws(() => settings({exactOutline: 'yes'}));
});

// The editor's own fitter's template of juleflet.dk's permo-draaber: its cuts
// leave the outline where two drops nearly meet, a hidden run ending halfway
// across the neck and both papers' visible cuts going on from there.
const {'permo-draaber': permo} = JSON.parse(await fs.readFile(new URL('./experiments/fixtures/exact-templates.json', import.meta.url)));
const permoTarget = () => {
  const target = loadSVG(svgOf(permo.polygons), {width: 100, maxSpan: 15, tolerance: cfg.geometryTolerance});
  target.sourceImage = {mask: sampleTarget(target, 240), resolution: 240};
  return target;
};

test('a template whose cuts leave the outline at necks reads as hidden segments across them, by the node rules', async () => {
  const {st, outline} = exactOutline(permoTarget(), cfg);
  const w = await readTemplate(loadSolutionJSON(permo.template), outline);
  assert.ok(!w.error, w.error);
  assert.equal(w.chords.length, 9);
  // Each border end's piece is its border's paper.
  st.edges.forEach((ed, e) => {
    for (const [at, i] of [['u', 0], ['v', w.positions.get(e).length]]) {
      const node = st.nodes.get(pointKey(ed[at]));
      if (node.typ === 'end') assert.equal(w.labels.get(`${e},${i}`), 'TB'.includes(node.side) ? 1 : 0, `edge ${e} at ${node.side}`);
    }
  });
});

test('the exact search redraws that template on the exact outline, passing the editor\'s checks', async () => {
  const shown = [];
  const found = await exactFromTemplate(permoTarget(), loadSolutionJSON(permo.template), cfg, {seconds: 15, paperRetries: 0, geometry: true, onProgress: event => shown.push(event)});
  assert.ok(!found.error, found.error);
  // The live view sees the search's own solutions, as the fitter's snapshots.
  assert.ok(shown.length >= 1);
  for (const event of shown) {
    assert.equal(event.stage, 'exactOutline');
    assert.equal(loadSolutionJSON(event.geometry).paths.length, 2);
  }
  assert.equal(found.report.attempts[0].startFeasible, true);
  assert.ok(found.report.hidden <= 9);
  const check = validate(found.solution, cfg, {finalGeometry: true});
  assert.ok(check.passed, JSON.stringify(check.issues.slice(0, 3)));
});

test('under a requested symmetry the exact search ties the template to its image, still passing', async () => {
  // permo-draaber's drops are symmetric about the diagonal through the lobes
  // (the app's transpose, the reference frame's antiTranspose); the old template
  // is not, so the start is broken and the ties have to be found.
  const found = await exactFromTemplate(permoTarget(), loadSolutionJSON(permo.template), cfg, {seconds: 20, paperRetries: 0, symmetry: ['antiTranspose']});
  assert.ok(!found.error, found.error);
  const check = validate(found.solution, cfg, {finalGeometry: true});
  assert.ok(check.passed, JSON.stringify(check.issues.slice(0, 3)));
  assert.equal(found.report.penalty, 0);
});

// The reference solver's segments of juleflet.dk designs (as in exact-structure.test.mjs).
const structures = JSON.parse(await fs.readFile(new URL('./experiments/fixtures/exact-structures.json', import.meta.url)));

test('the grid search finds a witness at the meeting bound, or proves there is none, as the reference pgrid', () => {
  // h4h2: 3 x 3 side ends, 2 touchings, so 7 segments; its switches pair up
  // exactly, with the sides along each edge. fisk: its 4 touchings keep all of
  // its 2 x 2 grid's crossings, so no curve closes up into its floating fish.
  const st = buildStructure(structures.h4h2.segs), w = gridWitness(st, {deadline: performance.now() + 10000});
  assert.ok(w);
  assert.equal(w.pairs.length, 7);
  const seen = new Set();
  for (const [e, k, side] of w.pairs.flat().map(t => t.slice(1))) {
    assert.equal(w.sides.get(e)[k - 1], side);
    seen.add(`${e}:${k}`);
  }
  assert.equal(seen.size, [...w.sides.values()].reduce((n, s) => n + s.length, 0));
  assert.equal(gridWitness(buildStructure(structures.fisk.segs), {deadline: performance.now() + 10000}), false);
});

test('every engine module imports only what the site serves, under static/inverse', async () => {
  // The browser loads the worker from static/; one import outside it (a script
  // under scripts/) and the whole engine fails to load there, while node runs it.
  const root = new URL('../../static/inverse/', import.meta.url), out = [];
  const walk = async dir => {
    for (const entry of await fs.readdir(dir, {withFileTypes: true})) {
      const url = new URL(entry.name + (entry.isDirectory() ? '/' : ''), dir);
      if (entry.isDirectory()) { if (entry.name !== 'vendor') await walk(url); continue; }
      if (!/\.m?js$/.test(entry.name)) continue;
      for (const [, spec] of (await fs.readFile(url, 'utf8')).matchAll(/(?:from|import\()\s*['"](\.{1,2}\/[^'"]+)['"]/g))
        if (!new URL(spec, url).href.startsWith(root.href)) out.push(`${url.pathname.slice(root.pathname.length)} -> ${spec}`);
    }
  };
  await walk(root);
  assert.deepEqual(out, []);
});
