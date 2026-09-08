import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createCanvas, loadImage } from 'canvas';
import { prepare, design } from '../../static/inverse/core/engine.js';
import { AUTOMATIC_PRESET, DIRECT_PRESET } from '../../static/inverse/core/presets.js';
import { settings } from '../../static/inverse/core/settings.js';
import {
  applyTies,
  orbitMean,
  symmetricCounts,
  symmetryOrbit,
  symmetryReport,
  symmetryTies
} from '../../static/inverse/core/direct/symmetry.js';
import { matchingGroups, projectMatching } from '../../static/inverse/core/direct/matching.js';
import { gridModel, gridPaths } from '../../static/inverse/core/direct/grid.js';
import { initializeGrid } from '../../static/inverse/core/direct/initialize.js';
import { refineCurves } from '../../static/inverse/core/direct/refine.js';
import { loadBoundaryKernel } from '../../static/inverse/core/direct/native.js';
import { resize } from '../../static/inverse/core/direct/math.js';
import { CurveGraph } from '../../static/inverse/core/direct/curves.js';
import { curvesOf, loadSolutionJSON } from '../../static/inverse/core/graph.js';
import { sampleWeave } from '../../static/inverse/core/validate.js';
import { checkerPixels } from './fixtures.mjs';

const TOLERANCE = 1e-6;

/** Read the exported cutting geometry back and group it into cuts of control
 * points, sorted inside each family by the crossing coordinate. */
function exportedCuts(files) {
  const solution = loadSolutionJSON(files['cut_geometry.json']);
  const cuts = [0, 1].map((f) =>
    solution.paths[f]
      .map((_, i) => curvesOf(solution, f, i).map((c) => c.p))
      .sort((a, b) => a[0][0][f] - b[0][0][f])
  );
  return { solution, cuts, width: solution.graph.target.width };
}

/** Largest distance from a transformed cut to the nearest cut of the family it
 * has to land in, trying both travel directions. This searches for a partner
 * instead of reusing the engine's pairing table, so it also fails when the
 * engine pairs the wrong cuts. */
function setDeviation(cuts, width, image, swapFamily = false) {
  let worst = 0;
  for (let f = 0; f < 2; f++) {
    const targets = cuts[swapFamily ? 1 - f : f];
    for (const cut of cuts[f]) {
      const moved = cut.map((c) => c.map((p) => image(p, width)));
      let best = Infinity;
      for (const other of targets) {
        if (other.length !== moved.length) continue;
        const reversed = other.slice().reverse().map((c) => c.slice().reverse());
        for (const candidate of [other, reversed]) {
          let max = 0;
          for (let j = 0; j < moved.length; j++)
            for (let k = 0; k < 4; k++)
              max = Math.max(max, Math.hypot(moved[j][k][0] - candidate[j][k][0], moved[j][k][1] - candidate[j][k][1]));
          best = Math.min(best, max);
        }
      }
      worst = Math.max(worst, best);
    }
  }
  return worst;
}

const IMAGE = {
  mirrorX: (p, w) => [w - p[0], p[1]],
  mirrorY: (p, w) => [p[0], w - p[1]],
  rotate180: (p, w) => [w - p[0], w - p[1]],
  transpose: (p) => [p[1], p[0]],
  antiTranspose: (p, w) => [w - p[1], w - p[0]]
};
const SWAPS = { transpose: true, antiTranspose: true };
const deviationOf = (cuts, width, name) => setDeviation(cuts, width, IMAGE[name], !!SWAPS[name]);

/** Reflection of a cut across the perpendicular bisector of its own chord,
 * written out here rather than imported, so the engine's chord map is checked
 * against an independent one. */
function chordDeviation(cuts, mode) {
  let worst = 0;
  for (const family of cuts)
    for (const cut of family) {
      const m = cut.length, start = cut[0][0], end = cut[m - 1][3];
      const dx = end[0] - start[0], dy = end[1] - start[1], length = Math.hypot(dx, dy);
      const mx = (start[0] + end[0]) / 2, my = (start[1] + end[1]) / 2;
      const reflect = (p) => {
        if (mode === 'anti') return [2 * mx - p[0], 2 * my - p[1]];
        const along = ((p[0] - mx) * dx + (p[1] - my) * dy) / (length * length);
        return [p[0] - 2 * along * dx, p[1] - 2 * along * dy];
      };
      for (let j = 0; j < m; j++)
        for (let k = 0; k < 4; k++) {
          const image = reflect(cut[m - 1 - j][3 - k]);
          worst = Math.max(worst, Math.hypot(cut[j][k][0] - image[0], cut[j][k][1] - image[1]));
        }
    }
  return worst;
}

/** A woven picture from straight cuts at the given fractional positions. */
function wovenPixels(n, xs, ys) {
  const rgba = new Uint8ClampedArray(n * n * 4);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      let value = 0;
      for (const c of xs) value ^= Number((x + 0.5) / n > c);
      for (const c of ys) value ^= Number((y + 0.5) / n > c);
      rgba.set(value ? [190, 20, 20, 255] : [255, 255, 255, 255], 4 * (y * n + x));
    }
  return { type: 'pixels', rgba, imageWidth: n, imageHeight: n };
}

async function examplePixels(file, size) {
  const image = await loadImage(file), canvas = createCanvas(size, size), context = canvas.getContext('2d');
  context.drawImage(image, 0, 0, size, size);
  return { type: 'pixels', rgba: context.getImageData(0, 0, size, size).data, imageWidth: size, imageHeight: size };
}

const STAR_SIZE = 200;
const STAR_BASE = { ...DIRECT_PRESET, resolution: STAR_SIZE, trials: 0, roundHidden: false };
const starRuns = new Map();
/** The star example prepared the way the browser's fit-curves-to-image mode
 * prepares it, then fitted end to end. Memoized per request. These runs are
 * budgeted in wall-clock time, so only assertions that hold for any number of
 * gradient steps, which symmetry the result has, belong on them. */
async function starFit(symmetry) {
  const key = JSON.stringify(symmetry);
  if (!starRuns.has(key)) {
    const input = await examplePixels('static/inverse/examples/star.png', STAR_SIZE);
    const cfg = { ...STAR_BASE, timeLimit: 6, symmetry };
    const prepared = prepare(input, cfg);
    starRuns.set(key, design(prepared.target, cfg).then((result) => ({ result, prepared })));
  }
  return starRuns.get(key);
}

const REFINE_SIZE = 128, REFINE_STEPS = 150;
let starSeeding = null;
/** The star's classified target and one fixed initial grid. Comparing the cost
 * of a constraint needs both fits to do the same work, which a time budget
 * cannot promise on a loaded machine: refinement from this seed takes a fixed
 * step count and no deadline, so it is a pure function of its arguments. The
 * boundary kernel is loaded first, because it is chosen per process and both
 * runs have to use the same one. */
async function starSeed() {
  starSeeding ??= (async () => {
    await loadBoundaryKernel();
    const prepared = prepare(await examplePixels('static/inverse/examples/star.png', STAR_SIZE), STAR_BASE);
    const source = prepared.target.sourceImage, classified = source.probability;
    return {
      target: prepared.target,
      prob: resize(classified, source.resolution, REFINE_SIZE),
      seed: initializeGrid(classified, source.resolution, [4, 4], 1, { scoreResolution: 96 })
    };
  })();
  return starSeeding;
}
/** Refine that one seed against that one target for that one step count, with
 * nothing but the symmetry request changed. */
async function equalWorkFit(symmetry, options = {}) {
  const { target, prob, seed } = await starSeed(), cfg = settings({ ...STAR_BASE, symmetry });
  const graph = new CurveGraph(gridPaths(seed.model, cfg.width, seed.floor), cfg.width);
  const fit = refineCurves(graph, prob, REFINE_SIZE, seed.phase, { ...cfg, preferMatchingSheets: false },
    { steps: REFINE_STEPS, rate: 0.035, input: target, ...options });
  return { error: fit.error, report: symmetryReport(graph.solution(fit.points, seed.phase, target), cfg.symmetry) };
}

test('requested symmetries are validated and reconciled with the sheet preference', () => {
  assert.equal(settings({}).symmetry, null);
  assert.equal(settings({}).preferMatchingSheets, true);
  assert.deepEqual(settings({ symmetry: { mirrorX: true } }).symmetry, {
    mirrorX: true, mirrorY: false, transpose: false, antiTranspose: false, rotate180: false, withinCurve: 'off'
  });
  // transpose is the identical-sheet request; anything else drops the soft
  // preference, whose copied sheets would break the requested pairing.
  assert.equal(settings({ symmetry: { transpose: true }, preferMatchingSheets: false }).preferMatchingSheets, true);
  assert.equal(settings({ symmetry: { mirrorX: true } }).preferMatchingSheets, false);
  assert.equal(settings({ symmetry: { withinCurve: 'anti' } }).preferMatchingSheets, false);
  assert.equal(settings({ symmetry: {} }).preferMatchingSheets, true);
  assert.throws(() => settings({ symmetry: { mirror: true } }), /Unknown symmetry/);
  assert.throws(() => settings({ symmetry: { mirrorX: 'yes' } }), /must be true or false/);
  assert.throws(() => settings({ symmetry: { withinCurve: 'chord' } }), /withinCurve must be/);
});

test('symmetry ties reproduce the identical-sheet projection and pin a mirrored middle cut', () => {
  const even = new CurveGraph(gridPaths(gridModel([4, 4], 8, 17), 100), 100);
  const spec = settings({ symmetry: { transpose: true } }).symmetry;
  const tied = even.points.slice(), matched = even.points.slice(), original = even.points.slice();
  applyTies(symmetryTies(even, spec), tied, tied, { fixed: even.fixed, original });
  projectMatching(matched, matchingGroups(even), even.fixed, original);
  assert.deepEqual([...tied], [...matched]);

  // An odd family under mirrorX ties its middle cut to itself, which pins that
  // cut onto the midline instead of leaving a free group.
  const odd = new CurveGraph(gridPaths(gridModel([3, 3], 8, 5), 100), 100);
  const mirror = settings({ symmetry: { mirrorX: true } }).symmetry;
  const ties = symmetryTies(odd, mirror), points = odd.points.slice();
  assert.equal(ties.conflicts.length, 0);
  assert.ok(ties.constants.length > 0);
  applyTies(ties, points, points, { fixed: odd.fixed, original: odd.points.slice() });
  for (const [index, value] of ties.constants) {
    assert.equal(points[index], 50);
    assert.equal(value, 50);
  }
  assert.equal(symmetryReport(odd.solution(points, 1, {}), mirror).maxDeviationMm, 0);

  // A cross-family transform has no pairing when the counts differ. That is
  // reported, not approximated, and the count search never offers such a pair.
  const unequal = new CurveGraph(gridPaths(gridModel([2, 3], 8, 3), 100), 100);
  const skipped = symmetryTies(unequal, spec);
  assert.deepEqual(skipped.skipped, ['transpose']);
  assert.equal(skipped.groups.length, 0);
  assert.equal(symmetryReport(unequal.solution(unequal.points, 1, {}), spec).maxDeviationMm, null);
});

test('the count search only offers pairs a requested symmetry can reproduce', () => {
  const spec = (raw) => settings({ symmetry: raw }).symmetry;
  assert.equal(symmetricCounts(null, [3, 4]), true);
  assert.equal(symmetricCounts(spec({ transpose: true }), [3, 4]), false);
  assert.equal(symmetricCounts(spec({ transpose: true }), [3, 3]), true);
  // A mirrored cut set repaints the woven colours when the mirrored family
  // holds an odd number of cuts, so those counts cannot match the drawing.
  assert.equal(symmetricCounts(spec({ mirrorX: true }), [3, 3]), false);
  assert.equal(symmetricCounts(spec({ mirrorX: true }), [4, 3]), true);
  assert.equal(symmetricCounts(spec({ mirrorY: true }), [4, 3]), false);
  assert.equal(symmetricCounts(spec({ rotate180: true }), [4, 3]), false);
  assert.equal(symmetricCounts(spec({ rotate180: true }), [3, 3]), true);
});

test('the orbit closes the requested generators and averages the picture over it', () => {
  assert.equal(symmetryOrbit(settings({ symmetry: { mirrorX: true } }).symmetry).length, 2);
  assert.equal(symmetryOrbit(settings({ symmetry: { mirrorX: true, transpose: true } }).symmetry).length, 8);
  assert.equal(symmetryOrbit(settings({ symmetry: { withinCurve: 'sym' } }).symmetry), null);
  const values = Float64Array.from({ length: 16 }, (_, i) => i % 4);
  const mean = orbitMean(values, 4, symmetryOrbit(settings({ symmetry: { mirrorX: true } }).symmetry));
  assert.deepEqual([...mean.slice(0, 4)], [1.5, 1.5, 1.5, 1.5]);
});

test('the star example exports exactly transposed cuts', { timeout: 60000 }, async () => {
  const tied = await starFit({ transpose: true });
  assert.deepEqual(tied.result.report.symmetry.requested, ['transpose']);
  assert.deepEqual(tied.result.report.symmetry.honoured, ['transpose']);
  assert.ok(tied.result.report.symmetry.maxDeviationMm < TOLERANCE);
  assert.ok(!tied.result.report.warnings.some((w) => w.includes('requested symmetry')));

  const { cuts, width } = exportedCuts(tied.result.files);
  assert.ok(cuts[0].length > 0 && cuts[1].length > 0);
  assert.ok(deviationOf(cuts, width, 'transpose') < TOLERANCE, 'exported cuts must be transpose-symmetric');
});

test('the star example also fits both mirrors exactly', { timeout: 60000 }, async () => {
  const requested = { mirrorX: true, mirrorY: true, transpose: true };
  const { result } = await starFit(requested);
  const symmetry = result.report.symmetry;
  assert.deepEqual(symmetry.requested, ['mirrorX', 'mirrorY', 'transpose']);
  assert.deepEqual(symmetry.honoured, ['mirrorX', 'mirrorY', 'transpose']);
  assert.ok(symmetry.maxDeviationMm < TOLERANCE);
  const { cuts, width } = exportedCuts(result.files);
  for (const name of symmetry.requested)
    assert.ok(deviationOf(cuts, width, name) < TOLERANCE, `exported cuts must satisfy ${name}`);
});

test('the transposed constraint is free on the star and the mirrors are not', { timeout: 60000 }, async () => {
  const free = await equalWorkFit(null), tied = await equalWorkFit({ transpose: true });
  const mirrored = await equalWorkFit({ mirrorX: true, mirrorY: true, transpose: true });
  assert.deepEqual(free.report, { requested: [], honoured: [], maxDeviationMm: null });
  assert.deepEqual(tied.report.honoured, ['transpose']);
  assert.deepEqual(mirrored.report.honoured, ['mirrorX', 'mirrorY', 'transpose']);
  assert.ok(tied.report.maxDeviationMm < TOLERANCE && mirrored.report.maxDeviationMm < TOLERANCE);
  // Same seed, same target, same number of gradient steps, so this compares the
  // constraint and not two time budgets. Measured: 4.68% free, 0.74% with the
  // transposition the drawing already has, 9.20% with both mirrors added.
  const gap = tied.error - free.error;
  assert.ok(gap <= 0.01, `the transposed fit costs ${(100 * gap).toFixed(2)} percentage points`);
  // The drawing is transposed but not mirrored: mirroring is a real constraint
  // here, so the fit pays for it and the cost stays measured, never hidden.
  assert.ok(mirrored.error > free.error);
});

test('a requested mirror is exact even when the caller also wants identical sheets', { timeout: 60000 }, async () => {
  // The polish stage asks for identical sheets whenever the candidate already
  // has them. Two hard projections in turn leave only the last exact, and the
  // very first snapshot is taken after a single clamp, so the request has to be
  // the projection that runs, not the transposition nobody asked for here.
  const mirrored = await equalWorkFit({ mirrorX: true }, { steps: 1, identicalSheets: true });
  assert.deepEqual(mirrored.report.honoured, ['mirrorX']);
  assert.ok(mirrored.report.maxDeviationMm < TOLERANCE, `mirrorX deviates by ${mirrored.report.maxDeviationMm} mm`);
});

test('an asymmetric drawing with mirrorX fits the orbit mean, not the original', { timeout: 60000 }, async () => {
  const n = 160, input = wovenPixels(n, [0.34, 0.6], [0.3, 0.62]);
  const cfg = { ...DIRECT_PRESET, resolution: n, timeLimit: 6, trials: 0, roundHidden: false, symmetry: { mirrorX: true } };
  const prepared = prepare(input, cfg), result = await design(prepared.target, cfg);
  assert.deepEqual(result.report.symmetry.honoured, ['mirrorX']);
  assert.ok(result.report.symmetry.maxDeviationMm < TOLERANCE);
  const { solution, cuts, width } = exportedCuts(result.files);
  assert.ok(deviationOf(cuts, width, 'mirrorX') < TOLERANCE);

  const source = prepared.preview.mask, woven = sampleWeave(solution, n);
  const mean = orbitMean(source, n, symmetryOrbit({ mirrorX: true }));
  let original = 0, orbit = 0;
  for (let i = 0; i < woven.length; i++) {
    original += woven[i] !== source[i];
    orbit += woven[i] !== Number(mean[i] > 0.5);
  }
  assert.ok(orbit <= original, `orbit-mean error ${orbit} must not exceed original-mask error ${original}`);
  assert.equal(result.report.imageError.mismatchFraction, original / woven.length);
});

test('within-curve symmetry makes every waves cut symmetric about its own chord', { timeout: 60000 }, async () => {
  const text = await fs.readFile('static/inverse/examples/waves.svg', 'utf8');
  const cfg = { ...DIRECT_PRESET, timeLimit: 6, trials: 0, roundHidden: false, symmetry: { withinCurve: 'sym' } };
  const prepared = prepare({ type: 'svg', text }, cfg), result = await design(prepared.target, cfg);
  assert.deepEqual(result.report.symmetry.honoured, ['withinCurve:sym']);
  const { cuts } = exportedCuts(result.files);
  assert.ok(cuts[0].length > 0 && cuts[1].length > 0);
  assert.ok(chordDeviation(cuts, 'sym') < TOLERANCE, 'every exported cut must be symmetric about its chord');
});

test('the automatic route sends every symmetry but the transposition to the fitter', { timeout: 60000 }, async () => {
  const cfg = { ...AUTOMATIC_PRESET, timeLimit: 5, trials: 0, roundHidden: false };
  const text = await fs.readFile('static/inverse/examples/waves.svg', 'utf8');
  assert.equal(prepare({ type: 'svg', text }, cfg).preview.metadata.automatic.route, 'vector');
  const curved = prepare({ type: 'svg', text }, { ...cfg, symmetry: { withinCurve: 'sym' } });
  assert.equal(curved.preview.metadata.automatic.route, 'direct');

  // Every raster uses the common fitter, with compatible count hypotheses and
  // parameter ties for the requested symmetries.
  const grid = wovenPixels(160, [0.2, 0.4, 0.6, 0.8], [0.2, 0.4, 0.6, 0.8]), angular = prepare(grid, cfg);
  assert.equal(angular.preview.metadata.automatic.route, 'direct');
  assert.equal(prepare(grid, { ...cfg, symmetry: { transpose: true } }).preview.metadata.automatic.route, 'direct');
  assert.equal(prepare(grid, { ...cfg, symmetry: { mirrorX: true } }).preview.metadata.automatic.route, 'direct');

  // A target prepared before the request was made must not slip through the
  // traced route either: that attempt is rejected before it is solved.
  const mirrored = await design(angular.target, { ...cfg, symmetry: { mirrorX: true } });
  assert.equal(mirrored.report.solver.automatic.selected, 'direct');
  assert.deepEqual(mirrored.report.solver.automatic.attempts, []);
  assert.deepEqual(mirrored.report.symmetry.honoured, ['mirrorX']);
  const tied = await design(angular.target, { ...cfg, symmetry: { transpose: true } });
  assert.equal(tied.report.solver.automatic.selected, 'direct');
  assert.deepEqual(tied.report.symmetry.honoured, ['transpose']);
});

test('a symmetry the chosen route cannot enforce is warned about, not dropped in silence', { timeout: 60000 }, async () => {
  const text = await fs.readFile('static/inverse/examples/waves.svg', 'utf8');
  const cfg = { algorithm: 'trace', timeLimit: 5, trials: 0, roundHidden: false, symmetry: { mirrorX: true } };
  const prepared = prepare({ type: 'svg', text }, cfg), result = await design(prepared.target, cfg);
  assert.deepEqual(result.report.symmetry.requested, ['mirrorX']);
  assert.deepEqual(result.report.symmetry.honoured, []);
  assert.ok(result.report.symmetry.maxDeviationMm > TOLERANCE);
  assert.ok(result.report.warnings.some((w) => w.includes('do not satisfy the requested symmetry mirrorX')));
});

test('a fit without a symmetry setting keeps its recorded result', { timeout: 60000 }, async () => {
  const cfg = { algorithm: 'direct', timeLimit: 30, trials: 0, roundHidden: false, preferMatchingSheets: true, earlyStop: true };
  const prepared = prepare(checkerPixels(128), cfg), result = await design(prepared.target, cfg);
  assert.equal(result.report.templateChecksPassed, true);
  assert.equal(result.report.solver.matchingPreference.identical, true);
  assert.equal(result.report.solver.stoppedEarly, true);
  assert.deepEqual(result.report.slits, { left: 3, right: 3 });
  assert.deepEqual(result.report.symmetry, { requested: [], honoured: [], maxDeviationMm: null });
});
