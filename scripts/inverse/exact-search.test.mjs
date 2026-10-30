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
import {smoothEdges} from '../../static/inverse/core/exact/refine.js';
import {turnsOf, subgroupsOf, appSymmetry} from '../../static/inverse/core/exact/stage.js';

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

// A photograph's mask as Mal sends it: the 3 x 3 heart, its top read a little
// into the next cell (one more strip there than at the bottom), a corner the
// photograph does not show.
test('the exact search starts on a photograph whose sides end unevenly, or whose crop misses a corner', async () => {
  const n = 400, colors = ['#b91313', '#ffffff'], mask = new Uint8Array(n * n), observed = new Uint8Array(n * n).fill(1);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) mask[y * n + x] = (Math.floor(3 * x / n) + Math.floor(3 * y / n)) % 2 ? 0 : 1;
  for (let y = 0; y < 12; y++) for (let x = 180; x < 200; x++) mask[y * n + x] = 1;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (x + y > 2 * n - 40) { observed[y * n + x] = 0; mask[y * n + x] = 0; }
  const raw = {...AUTOMATIC_PRESET, width: 100, minWidth: 2, cutError: .25, timeLimit: 60, exactOutline: true, paperColors: colors, trials: 0, exactRoute: 'exact'};
  const run = validMask => {
    const prepared = prepare({type: 'mask', mask, resolution: n, ...(validMask ? {validMask} : {})}, {...AUTOMATIC_PRESET, width: 100, resolution: n, paperColors: colors, mode: 'swatches', swatches: colors, invert: false, removeSpecks: 0});
    return design(restorePrepared(prepared.target), raw);
  };
  const answer = await run(observed);
  assert.equal(answer.report.solver.exactOutline.chosen, 'exact');
  assert.equal(answer.report.solver.exactOutline.paired, true);
  assert.ok(answer.report.templateChecksPassed);
  // A crop missing much of the picture is the fitter's alone.
  const most = Uint8Array.from(observed, (v, i) => v && (i % n) < 300 ? 1 : 0);
  await assert.rejects(run(most), error => error.code === 'NO_EXACT_TEMPLATE' && /cannot keep/.test(error.report.exactOutline.error));
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

test('a mask\'s wavy edge of a circle is drawn as a few cubics, split at its switches', () => {
  // A circle of 100 pixels on a 400-pixel mask, its edge waving 0.4 pixels
  // over 20 as a staircase's sub-pixel edge does, at 1-pixel steps.
  const n = 400, scale = n / 12, r = 100 / scale, c = [6, 6], count = Math.round(2 * Math.PI * 100);
  const pts = Array.from({length: count + 1}, (_, k) => {
    const a = 2 * Math.PI * k / count, wave = .4 * Math.sin(2 * Math.PI * k / 20) / scale;
    return [c[0] + (r + wave) * Math.cos(a), c[1] + (r + wave) * Math.sin(a)];
  });
  pts[count] = pts[0];
  const outline = {E: [{loop: true}], L: [2 * Math.PI * r], corners: [[]]};
  const off = cubics => Math.max(...cubics.flatMap(cubic => cubic.flatten(.001).map(p => Math.abs(Math.hypot(p[0] - c[0], p[1] - c[1]) - r) * scale)));
  const [plain] = smoothEdges(outline, [pts], n);
  assert.ok(plain.cubics.length <= 6, `${plain.cubics.length} cubics`);
  assert.ok(off(plain.cubics) < .75, `${off(plain.cubics).toFixed(2)} pixels off the circle`);
  // Switches a third and two thirds of the way round start cubics of their own.
  const s = [outline.L[0] / 3, 2 * outline.L[0] / 3], at = new Map([[0, s]]), [split] = smoothEdges(outline, [pts], n, {switches: at, positions: at});
  for (const arc of s) {
    const [i, t] = split.at.get(arc), k = Math.round(arc / outline.L[0] * count);
    assert.ok(i > 0 && t === 0, 'a cubic starts at the switch');
    assert.ok(Math.hypot(split.cubics[i].p[0][0] - pts[k][0], split.cubics[i].p[0][1] - pts[k][1]) * scale < .5);
  }
  assert.ok(off(split.cubics) < .75);
});

test('an edge meeting the square\'s side through the border band\'s leg is drawn on to its end without it', () => {
  // A slanting edge to 0.15 units above the bottom side, then a leg straight
  // down to it, as the band read 1 mm in leaves one; points a pixel apart.
  const n = 400, scale = n / 12, a = [3, 4], b = [5.5, .15], end = [5.5, 0];
  const line = (p, q) => { const k = Math.max(1, Math.round(Math.hypot(q[0] - p[0], q[1] - p[1]) * scale)); return Array.from({length: k}, (_, i) => [p[0] + (q[0] - p[0]) * i / k, p[1] + (q[1] - p[1]) * i / k]); };
  const pts = [...line(a, b), ...line(b, end), end], L = Math.hypot(b[0] - a[0], b[1] - a[1]) + .15;
  const outline = {E: [{loop: false}], L: [L], corners: [[L - .15]]};
  const [drawn] = smoothEdges(outline, [pts], n);
  assert.ok(drawn.cubics.every(cubic => Math.hypot(cubic.p[0][0] - b[0], cubic.p[0][1] - b[1]) > .1), 'no cubic starts at the leg');
  assert.deepEqual(drawn.cubics.at(-1).p[3], end);
});

test('a fine grid\'s template with more hidden segments than the bound has the coarse grid\'s too, the better kept', async () => {
  // ramme (the gallery's frame of curved bands): under its eight symmetries the
  // fine grid from no start proves 4 hidden segments its best, where the
  // coarse grid has the designer's none.
  const fixture = JSON.parse(await fs.readFile(new URL('./fixtures/ramme-mask.json', import.meta.url))), n = fixture.size;
  const data = new Uint8Array(n * n);
  for (const [from, length] of fixture.runs) data.fill(1, from, from + length);
  const {scaleTarget} = await import('../../static/inverse/core/engine.js');
  const {exactTarget, exactSearch} = await import('../../static/inverse/core/exact/stage.js');
  const c = settings({...AUTOMATIC_PRESET, width: 100, minWidth: 2, cutError: .25, exactOutline: true}), outline = scaleTarget(exactTarget({sourceImage: {mask: data, resolution: n}, width: 100, curves: [], metadata: {}}, c), c.width, c.paperColors);
  const found = await exactSearch(outline, null, c, {deadline: performance.now() + 20000, symmetry: ['mirrorX', 'mirrorY', 'antiTranspose']});
  assert.ok(found.found, found.report.error);
  assert.equal(found.report.search.hidden, 0);
});

test('a face with several holes: with its alternation rows the lazy embedding rows are never needed', async () => {
  // A Voronoi picture of thick bands: its background face has two holes, and
  // the segments from the outer boundary to them cannot alternate (hole 1, 2,
  // 1, 2), which the lazy rows found one set at a time (24 to 30 of them, over
  // 60 s, one rule broken at the end). With the rows for such faces (`multi`)
  // none is needed, and on an unloaded machine the template passes in 20 s; the
  // time to pass the export (a short return is the last rule) varies with the
  // machine, so only what the rows guarantee is asserted.
  const fixture = JSON.parse(await fs.readFile(new URL('./fixtures/voronoi-holes-mask.json', import.meta.url))), n = fixture.size;
  const data = new Uint8Array(n * n);
  for (const [from, length] of fixture.runs) data.fill(1, from, from + length);
  const {scaleTarget} = await import('../../static/inverse/core/engine.js');
  const {exactTarget, exactSearch} = await import('../../static/inverse/core/exact/stage.js');
  const c = settings({...AUTOMATIC_PRESET, width: 100, minWidth: 2, cutError: .25, exactOutline: true}),
    outline = scaleTarget(exactTarget({sourceImage: {mask: data, resolution: n}, width: 100, curves: [], metadata: {}}, c), c.width, c.paperColors);
  const found = await exactSearch(outline, null, c, {deadline: performance.now() + 30000, symmetry: [], multi: true});
  assert.ok(found.found, found.report.error);
  assert.equal(found.report.search.cuts.embedding, 0);
});

test('a mask with wobbling edges is opened by a pixel or two before tracing; a clean one is not', async () => {
  const {maskRoughness} = await import('../../static/inverse/core/engine.js');
  const n = 200, clean = new Uint8Array(n * n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) clean[y * n + x] = (x - 100) ** 2 + (y - 100) ** 2 < 60 ** 2 ? 1 : 0;
  assert.equal(maskRoughness({mask: clean, resolution: n}), 0);
  // The disc with a fifth of its boundary pixels flipped (a seeded generator), and with two fifths.
  const wobble = share => {
    let a = 12345;
    const random = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const out = clean.slice();
    for (let y = 1; y < n - 1; y++) for (let x = 1; x < n - 1; x++) {
      const v = clean[y * n + x];
      if ([clean[y * n + x - 1], clean[y * n + x + 1], clean[(y - 1) * n + x], clean[(y + 1) * n + x]].some(u => u !== v) && random() < share) out[y * n + x] = 1 - v;
    }
    return out;
  };
  assert.ok(maskRoughness({mask: wobble(.2), resolution: n}) >= 1);
  assert.equal(maskRoughness({mask: wobble(.45), resolution: n}), 2);
  assert.equal(maskRoughness({}), 0);
});

test('stray specks of a hand painting are taken into their surroundings, checker corners and big regions stay', async () => {
  const {maskSpecks} = await import('../../static/inverse/core/engine.js');
  const {withoutSpecks} = await import('../../static/inverse/core/exact/raster.js');
  const n = 400, mask = new Uint8Array(n * n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) mask[y * n + x] = x < 200 ? 1 : 0;
  assert.equal(maskSpecks({mask, resolution: n}), 0);
  const speckled = mask.slice(), disc = (cx, cy, r, v) => { for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) speckled[y * n + x] = v; };
  disc(50, 50, 3, 0); disc(300, 120, 2, 1);
  speckled[200 * n + 20] = 0;
  const limit = maskSpecks({mask: speckled, resolution: n});
  assert.ok(limit > 0);
  const cleaned = withoutSpecks(speckled, n, limit);
  assert.equal(cleaned[50 * n + 50], 1);
  assert.equal(cleaned[120 * n + 300], 0);
  assert.equal(cleaned[200 * n + 20], 0, 'a single pixel is a corner of the pixels, not a speck');
  assert.equal(cleaned[200 * n + 80], 1);
  assert.equal(withoutSpecks(speckled, n, limit, true), 2);
});

test('a picture symmetric under mirrors may keep only its turns, the search\'s fallback', () => {
  assert.deepEqual(turnsOf(['mirrorX', 'mirrorY', 'transpose']), ['rotate90']);
  assert.deepEqual(turnsOf(['mirrorX', 'mirrorY']), ['rotate180']);
  assert.deepEqual(turnsOf(['transpose', 'antiTranspose']), ['rotate180']);
  assert.deepEqual(turnsOf(['mirrorX']), []);
  assert.deepEqual(turnsOf(['rotate180']), []);
});

test('with none under all of a picture\'s symmetry, its turns are searched, then one mirror, the one making both papers alike first', () => {
  // roed-blomst: none under all eight, its designer's keeps one diagonal.
  assert.deepEqual(subgroupsOf(['mirrorX', 'mirrorY', 'antiTranspose']), [['rotate90'], ['antiTranspose']]);
  assert.deepEqual(subgroupsOf(['mirrorX', 'mirrorY']), [['rotate180'], ['mirrorX']]);
  assert.deepEqual(subgroupsOf(['transpose', 'antiTranspose']), [['rotate180'], ['antiTranspose']]);
  assert.deepEqual(subgroupsOf(['transpose']), []);
  assert.deepEqual(subgroupsOf(['rotate90']), []);
});

test('a template under part of the symmetry holds, in the app\'s names, what its ties generate', () => {
  // The reference frame's antiTranspose is the app's transpose (the two lobes alike).
  assert.deepEqual(appSymmetry(['antiTranspose']), ['transpose']);
  assert.deepEqual(appSymmetry(['rotate90']), ['rotate180']);
  assert.deepEqual(new Set(appSymmetry(['mirrorX', 'mirrorY', 'antiTranspose'])), new Set(['mirrorX', 'mirrorY', 'rotate180', 'transpose', 'antiTranspose']));
  assert.deepEqual(appSymmetry([]), []);
});
