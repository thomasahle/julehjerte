/** The exact search for a picture in Mal: the cuts laid exactly on the outline
 * traced from the picture's mask, its template taken whenever the export passes
 * it (`exportable`), the fitter's otherwise (engine.js design). */
import {validate, verdict, easeMetrics, sampleWeave} from '../validate.js';
import {finalMaterialAudit} from '../geometric-material.js';
import {verifiedPaperSettings} from '../material.js';
import {verifyPaper} from './paper.js';
import {auditFeatureFidelity, mergedRegions} from '../feature-shapes.js';
import {matchingSummary} from '../direct/matching.js';
import {routedComplexity} from '../direct/routed-refinement.js';
import {requestedSymmetry} from '../settings.js';
import {exactFromTemplate, NO_TEMPLATE, NOT_SYMMETRIC} from './search.js';
import {exactOutline} from './snap.js';
import {exactStart} from './start.js';
import {FROM_APP, determinant, group} from './symmetry.js';
import {rasterOutline} from './raster.js';
import {cheapBounds} from './bounds.js';
import {returns} from './nogoods.js';
import {SIZE} from './structure.js';
import {issueKinds} from '../result-rank.js';
import {noteError} from '../errors.js';

/** The outline the exact search reads: traced from the picture's mask with
 * the settings `cfg` (raster.js, `options` its tracing), or null. */
export function exactTarget(target, cfg, options = {}) {
  return rasterOutline(target, cfg, options);
}

/** Why the exact search cannot start on `outline`, or null when it can: its
 * structure must build, the cut ends on opposite sides of the square must pair
 * up (bounds.js), and both pairs of sides must have some: each of its slits
 * starts where the outline meets a side, so a figure clear of the sides (a
 * motif painted in the middle) has none, and only the fitter's hidden cuts
 * from the border reach it. Tens of milliseconds. As {code, message}: the
 * code UNEVEN or NO_SIDES, or null for a structure that does not build. */
export function whyCannotStart(outline, cfg) {
  try {
    const bounds = cheapBounds(exactOutline(outline, cfg).st);
    if (bounds.impossible) return {code: UNEVEN, message: 'The outline ends unevenly on opposite sides.'};
    if (!bounds.k || !bounds.ell) return {code: NO_SIDES, message: 'The outline does not reach both pairs of sides.'};
    return null;
  } catch (error) {
    return {code: null, message: String(error.message || error)};
  }
}

/** whyCannotStart's codes: the cut ends on opposite sides do not pair up; the
 * outline does not reach both pairs of sides. */
export const UNEVEN = 'UNEVEN', NO_SIDES = 'NO_SIDES';

/** whyCannotStart's message alone, or null when the search can start. */
export function exactCannotStart(outline, cfg) {
  return whyCannotStart(outline, cfg)?.message ?? null;
}

/** The tips where `outline` comes back within 1.5 mm of itself (nogoods.js
 * returns), in its own units: a slit along one changes papers there, which
 * takes hidden segments. Mostly a tip one or two pixels wide, traced as a box. */
export function returnTips(outline, cfg) {
  const w = outline.width, tips = new Map();
  for (const [, , , , [x, y]] of returns(exactOutline(outline, cfg).outline)) tips.set(`${x},${y}`, [x * w / SIZE, (SIZE - y) * w / SIZE]);
  return [...tips.values()];
}

/** The reference-frame symmetries the exact search ties for the requested
 * ones, or null when one of them is beyond it (each curve turned onto itself
 * about its middle). */
export function exactSymmetry(spec) {
  // Symmetric within each curve comes with both mirrors (the app requests
  // them together): their ties already map each curve onto itself.
  const requested = requestedSymmetry(spec).filter(name => !(name === 'withinCurve:sym' && spec.mirrorX && spec.mirrorY));
  if (requested.some(name => !FROM_APP[name])) return null;
  return requested.map(name => FROM_APP[name]);
}

/** The app's names (settings.js SYMMETRIES) of the symmetries the `ties`
 * keep, the group they generate: what of a request a template searched under
 * part of it still holds (subgroupsOf). FROM_APP is its own inverse. */
export function appSymmetry(ties) {
  return group(ties).map(name => FROM_APP[name]).filter(Boolean);
}

/** How a template ranks (lower is better), with what it measured. Its paper
 * is audited as the export audits it (on a finer lattice the template was
 * verified at), or `material` is that audit already made. */
export function assess(solution, cfg, {material = null} = {}) {
  // As the export's verdict reads it: a clearance up to 0.1 mm short passes.
  const check = verdict(validate(solution, cfg, {finalGeometry: true}));
  let paper = false;
  try {
    if (check.passed && !material) verifyPaper(solution, cfg);
    paper = check.passed && (material ?? finalMaterialAudit(solution, verifiedPaperSettings(solution, cfg), {reuse: true})).passed;
  } catch (crash) {
    noteError('exact/stage.js assess: paper audit', crash);
    paper = false;
  }
  const kinds = new Set(check.issues.map(i => i.type));
  if (check.passed && !paper) kinds.add('paper');
  const matching = matchingSummary(solution), hiddenRuns = routedComplexity(solution).hiddenRuns;
  const shared = Boolean(matching.identical || (matching.rmsTemplateDifferenceMm ?? Infinity) <= .1);
  const length = easeMetrics(solution, cfg).totalCutLength;
  // A picture's traced outline is no design: whether the weave keeps the
  // picture's regions (the export's own check) counts, then its disagreement
  // with the mask, in steps of half a percent, so a closer fit never buys
  // hidden cuts or a second template.
  const source = solution.graph.target.sourceImage, woven = source?.mask && source.resolution ? sampleWeave(solution, source.resolution) : null;
  const error = woven ? maskError(source, woven) : 0;
  let features = true;
  // Regions of the picture the weave joins count as one lost (mergedRegions: two hidden cuts drawn apart).
  try { features = !woven || auditFeatureFidelity(source, woven, cfg).passed && !mergedRegions(source, woven, cfg.width).length; } catch (crash) {
    // Kept as before: a crash here counts the regions as kept.
    noteError('exact/stage.js assess: picture regions', crash);
    features = true;
  }
  // Hidden cut as the weave shows it, alike for the fitter's template and the
  // exact search's (their own counts of hidden runs differ in kind), in steps
  // of 10 mm.
  const hidden = woven ? hiddenCutLength(solution, woven, source.resolution) : 0;
  // Among templates the export would not take, the nearest (result-rank.js):
  // the fewest kinds of failure besides clearances, then the clearances'
  // shortfall in mm, so a cut 0.02 mm too close to itself comes before a crossing.
  const {kinds: others, shortfall} = issueKinds(check.issues, cfg.nominalWidth);
  if (check.passed && !paper) others.add('paper');
  const over = error > cfg.maxImageError, takes = check.passed && paper && features && !over;
  return {passes: check.passed && paper, failures: kinds.size, issues: [...kinds], shared, hidden, hiddenRuns, length, maskError: error, features, shortfall,
    rank: [check.passed && paper ? 0 : 1, kinds.size, features ? 0 : 1, Math.round(error / .005), shared ? 0 : 1, Math.round(hidden / 10), Math.round(length)],
    near: [takes ? 0 : 1, others.size + (features ? 0 : 1) + (over ? 1 : 0), shortfall, Math.round(error / .005), Math.round(hidden / 10), Math.round(length)]};
}

/** assess, or null for no drawing or one it cannot assess. */
function assessed(solution, cfg) {
  try { return solution ? assess(solution, cfg) : null; } catch (error) {
    noteError('exact/stage.js assessed', error);
    return null;
  }
}

/** Whether assessment `a` is nearer what the export takes than `b` (assess's `near`). */
export function closer(a, b) {
  if (!b) return Boolean(a);
  if (!a) return false;
  const k = a.near.findIndex((v, i) => v !== b.near[i]);
  return k >= 0 && a.near[k] < b.near[k];
}

/** The length (mm) of the solution's cuts the `woven` weave (n x n) does not
 * show: where it has the same colour 0.75 mm to either side of the cut. */
export function hiddenCutLength(solution, woven, n, offset = .75) {
  const w = solution.graph.target.width, at = (x, y) => {
    const i = Math.floor(x * n / w), j = Math.floor(y * n / w);
    return i < 0 || j < 0 || i >= n || j >= n ? -1 : woven[j * n + i];
  };
  let hidden = 0;
  for (const paths of solution.paths) for (const slit of paths) for (const [e] of slit) {
    const pts = solution.graph.edges[e].curve.flatten(.02);
    for (let k = 1; k < pts.length; k++) {
      const [a, b] = [pts[k - 1], pts[k]], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (!len) continue;
      const nx = -(b[1] - a[1]) / len * offset, ny = (b[0] - a[0]) / len * offset, steps = Math.max(1, Math.ceil(len / .25));
      for (let s = 0; s < steps; s++) {
        const x = a[0] + (b[0] - a[0]) * (s + .5) / steps, y = a[1] + (b[1] - a[1]) * (s + .5) / steps;
        const left = at(x + nx, y + ny), right = at(x - nx, y - ny);
        if (left >= 0 && left === right) hidden += len / steps;
      }
    }
  }
  return hidden;
}

/** The share of the source's observed mask cells the `woven` weave gets wrong. */
function maskError(source, woven) {
  let wrong = 0, counted = 0;
  for (let i = 0; i < woven.length; i++) if (!source.validMask || source.validMask[i]) { counted++; wrong += woven[i] !== source.mask[i]; }
  return counted ? wrong / counted : 0;
}

/** Whether a template's assessment passes what the export asks of it: the
 * cutting rules and paper, the picture's regions kept, and its fidelity. */
export const exportable = (a, cfg) => Boolean(a?.passes && a.features && a.maskError <= cfg.maxImageError);

/** The most seconds the search for a start takes (exactSearch).
 * (history: docs/inverse/SEARCH-CONSTANTS.md#start-seconds) */
const START_SECONDS = 3;
/** The network's ladder (networkLadder): its rungs as [K, seconds], the most
 * of a search's time it takes, and the short candidates (mm) every rung keeps:
 * 42% of the hidden cuts in the gallery's exact templates were under 3 mm, the
 * stubs of tips and crossings the network's field hardly shows. */
const LADDER = [[10, 2], [30, 2], [100, 3], [300, 4]], LADDER_SHARE = .25, SHORT_MM = 3, LADDER_BUILD = 8, LADDER_SAMPLES = 2, LADDER_NOISE = .15, LOW_PENALTY = 5;
// Alone: K, the plain ranking's seconds, a sampled one's. (history: docs/inverse/SEARCH-CONSTANTS.md#ladder-samples)
const LADDER_ALONE = [[10, 3, 2], [30, 4, 2], [100, 6, 3], [300, 10, 4], [1000, 15, 10]];
const LADDER_FIRST = [[10, 2, 1], [30, 2, 1], [100, 3, 2], [300, 6, 3]], LADDER_SECOND = [[300, 10, 4], [1000, 15, 10]];
// The first phase's rungs as [K, ranking] (0 the plain one, then the samples): the plain K300 after the cheap
// ones, before K100's and K300's samples (ladderRungs). (history: docs/inverse/SEARCH-CONSTANTS.md#first-order)
const FIRST_ORDER = [[10, 0], [10, 1], [30, 0], [10, 2], [30, 1], [100, 0], [300, 0], [100, 1], [30, 2], [100, 2], [300, 1], [300, 2]];

/** The ladder's rungs alone (`phase` from engine.js, or none: LADDER_ALONE), as [K, seconds, seed]. */
export function ladderRungs(phase) {
  if (phase === 'first') return FIRST_ORDER.map(([k, seed]) => { const [, plain, sample] = LADDER_FIRST.find(([K]) => K === k); return [k, seed ? sample : plain, seed]; });
  const rungs = [];
  for (const [k, plain, sample] of phase === 'second' ? LADDER_SECOND : LADDER_ALONE) for (let seed = 0; seed <= LADDER_SAMPLES; seed++) rungs.push([k, seed ? sample : plain, seed]);
  return rungs;
}

/** Under ties, the share of the search's time the fine grid from no start
 * gets first, if at least BARE_FLOOR seconds are left (exactSearch).
 * (history: docs/inverse/SEARCH-CONSTANTS.md#bare) */
const BARE_SHARE = .5, BARE_FLOOR = 8, COARSE_AFTER_BARE = 4;

/** How much further from the mask (a share of its cells) the exact search's
 * template may lie drawn in a few cubics than on the traced polyline.
 * (history: docs/inverse/SEARCH-CONSTANTS.md#smooth-slack) */
const SMOOTH_SLACK = .005;

/** The seconds a search under part of the requested symmetry needs at
 * least, once none keeps all of it (exactSearch). (history: docs/inverse/SEARCH-CONSTANTS.md#turns-floor) */
const TURNS_FLOOR = 6;

/** The turns of the group `symmetry` generates, as their generator (a quarter
 * turn, else a half turn), or none when it has no mirror to drop. */
export function turnsOf(symmetry) {
  const all = group(symmetry), turn = ['rotate90', 'rotate180'].find(name => all.includes(name));
  return turn && all.some(name => determinant(name) < 0) ? [turn] : [];
}

/** The ties searched under, in turn, once the group `symmetry` generates has
 * no template: its turns, then one of its mirrors alone where it has more,
 * the one making both papers alike first (the app's transpose). A picture
 * symmetric under all eight has its two diagonals' templates turned into
 * each other, so one of them is enough. */
export function subgroupsOf(symmetry) {
  const mirrors = group(symmetry).filter(name => determinant(name) < 0), turns = turnsOf(symmetry);
  const mirror = mirrors.length > 1 && ['antiTranspose', 'transpose', 'mirrorX', 'mirrorY'].find(name => mirrors.includes(name));
  return [...(turns.length ? [turns] : []), ...(mirror ? [[mirror]] : [])];
}

/** The ties searched under, in turn, once `symmetry` has no template: part of
 * it (subgroupsOf), then none. */
export function fallbackTies(symmetry) {
  return symmetry.length ? [...subgroupsOf(symmetry), []] : [];
}

/** The cut-proposal network's ladder: the exact model from no start on the
 * fine grid, its hidden segments only the K candidates the network's `maps`
 * rank best (candidates.js rankScores) and every one up to SHORT_MM, K
 * growing (LADDER: K and the rung's seconds), the candidates built once; the
 * first template the export takes, within LADDER_SHARE of `seconds` at most,
 * stands. A rung without one costs little: a model without the right
 * candidates has no solution, which HiGHS finds in a second or two. The
 * ladder mostly finds today's search's template, or one as good, in a
 * fraction of its time. (history: docs/inverse/SEARCH-CONSTANTS.md#network-ladder) */
async function networkLadder(outline, template, cfg, exact, {seconds, symmetry, multi, onProgress, geometry, refine, maps, alone = false, phase = null}) {
  // Alone (a worker beside today's search) it may take all the time, and a wider last rung.
  const until = performance.now() + 1000 * seconds * (alone ? 1 : LADDER_SHARE), reuse = {}, rungs = [];
  // `broken`: the rung's result breaking the model's rules least, assessed only
  // once the ladder ends without a template (on jul-tern assessing every rung's
  // took 5 s of its 50); `nearest`: the template nearest what the export takes (closer).
  let error = null, code = null, nearest = null, broken = null;
  const short = SHORT_MM * SIZE / cfg.width, empty = {positions: new Map(), labels: new Map(), chords: []};
  // Alone, each rung also tries LADDER_SAMPLES sampled rankings of the same maps after the plain one: a
  // sample finds some templates at a smaller K or on an earlier outline. The plain one has longer rungs
  // there (LADDER_ALONE): in LADDER's, 5star's K300 still broke rules when its time ran out.
  // (history: docs/inverse/SEARCH-CONSTANTS.md#ladder-samples)
  const rungList = [];
  // Alone over several outlines (engine.js exactTemplate), a `phase`: its cheap rungs (LADDER_FIRST) on each
  // outline first, then its long ones (LADDER_SECOND). The first phase's plain K300 comes before K100's and
  // K300's samples, with 6 s (FIRST_ORDER): a 4 x 4 heart of small stars (Små motiver) needs K300 on the
  // rounded outline for 4-6 s, which a shorter K300 after every sample left to the second phase. Not every
  // plain ranking first: some templates only a cheap sample finds.
  // (history: docs/inverse/SEARCH-CONSTANTS.md#first-order)
  if (alone) rungList.push(...ladderRungs(phase));
  else for (const [k, rungSeconds] of LADDER) rungList.push([k, rungSeconds, 0]);
  for (const [k, rungSeconds, seed] of rungList) {
    const room = Math.min(rungSeconds, (until - performance.now()) / 1000);
    if (room < .5) break;
    const began = performance.now();
    // The first rung builds the candidates every rung reuses: it may take up
    // to LADDER_BUILD seconds of the ladder's time for that (venus's 420
    // positions take more than a rung's share).
    let result;
    try {
      result = await exactFromTemplate(outline, template, cfg, {multi, seconds: room, symmetry, exact, witness: empty, onProgress,
        geometry, refine, spacing: .75, neighbours: 8, rank: {maps, k, short, seed, noise: LADDER_NOISE}, reuse,
        buildSeconds: reuse.cand ? null : Math.max(room * .4, Math.min(LADDER_BUILD, (until - performance.now()) / 1000))});
    } catch (error) {
      // A rung that fails ends the ladder, never the search: today's runs after it.
      rungs.push({k, seconds: +((performance.now() - began) / 1000).toFixed(2), found: false, error: String(error.message || error).slice(0, 80)});
      break;
    }
    // A rung's template the export would not take is kept, the nearest of them:
    // never nothing where a cut misses its clearance by a hair (santa's ladder:
    // 0.083 mm, where today's search has crossing slits). One breaking up to
    // LOW_PENALTY of the model's rules is assessed too: the model's limits are a
    // hair stricter than the export's (jul-tern's rung at penalty 1 passes every
    // check, and waited for the ladder's end).
    let ok = false;
    if (!result.error && !(result.report.penalty > LOW_PENALTY)) for (const drawn of [result.solution, result.refined]) {
      const assessment = assessed(drawn, cfg);
      if (exportable(assessment, cfg)) { ok = true; break; }
      if (closer(assessment, nearest?.assessment)) nearest = {solution: drawn, assessment, report: {...result.report, ladder: k}};
    }
    else if (!result.error && !(broken?.report.penalty <= result.report.penalty)) broken = {...result, report: {...result.report, ladder: k}};
    rungs.push({k, seed, seconds: +((performance.now() - began) / 1000).toFixed(2), found: ok, hidden: result.report?.hidden});
    if (ok) return {found: {...result, report: {...result.report, ladder: k}}, rungs};
    if (result.error != null) { error = result.error; code = result.code ?? null; }
  }
  for (const drawn of broken ? [broken.solution, broken.refined] : []) {
    const assessment = assessed(drawn, cfg);
    if (closer(assessment, nearest?.assessment)) nearest = {solution: drawn, assessment, report: broken.report};
  }
  return {found: null, nearest, rungs, error, code};
}

/** The exact search on the traced `outline` from the fitter's `template`
 * within `deadline`, under the `symmetry` ties: {found: {solution,
 * assessment} or null, report}. */
export async function exactSearch(outline, template, cfg, {deadline, reserve = 4, onProgress = () => {}, symmetry = [], geometry = false,
  refine = true, fallback = true, even = false, multi = 'auto', maps = null, ladderOnly = false, phase = null} = {}) {
  const seconds = (deadline - performance.now()) / 1000 - reserve;
  const report = {attempted: false, symmetry}, alone = ladderOnly ? {maps, ladderOnly, phase} : {};
  if (seconds < 1) return {found: null, report: {...report, reason: 'no time left'}};
  report.attempted = true;
  onProgress({stage: 'exactOutline'});
  // `near`: the ladder's nearest template where it has none the export takes
  // (networkLadder); `other`: a fallback's below, with its report.
  let found, near = null, other = null;
  try {
    // The start: the template's reading where it holds on this outline, else
    // a topological witness (start.js). One that is not the template's breaks
    // rules wherever its switches were spread: HiGHS gets a coarser model then,
    // hidden segments between positions 3 units apart to their 2 nearest, which
    // finds the same templates sooner (HiGHS's root, which overruns its time
    // limit, grows faster than the model). The start gets START_SECONDS at most:
    // most starts take well under a second, and a longer wait found no more
    // templates. (history: docs/inverse/SEARCH-CONSTANTS.md#start-seconds)
    // With `even`, on the outline made symmetric under the ties (target.js
    // symmetricLines).
    const exact = exactOutline(outline, cfg, 'tight', {symmetry: even ? symmetry : []});
    // With the network's maps, its ladder first; today's search after it, in the time left.
    // Alone with fallback ties after it (below) and two of their floors' time, the ladder under all the ties
    // leaves them TURNS_FLOOR, which they otherwise never had: JUL in kalam on a woven square has its template
    // only untied, where the tied rungs took nearly all its outline's time.
    // (history: docs/inverse/SEARCH-CONSTANTS.md#turns-floor)
    const keep = ladderOnly && fallback && fallbackTies(symmetry).length && seconds >= 2 * TURNS_FLOOR ? TURNS_FLOOR : 0;
    const ladder = maps ? await networkLadder(outline, template, cfg, exact, {seconds: seconds - keep, symmetry, multi, onProgress, geometry, refine, maps, alone: ladderOnly, phase}) : null;
    if (ladder) report.ladder = ladder.rungs;
    near = ladder?.nearest ?? null;
    if (ladder?.found) found = ladder.found;
    // Alone, a ladder without a template goes on as today's search does after one: the outline made
    // symmetric, untied, or part of the symmetry (below), each with the ladder (alhambra's traced outline
    // is not symmetric enough for its mirror, so every rung there stops at once).
    else if (ladderOnly) found = ladder?.code === NOT_SYMMETRIC ? {error: ladder.error, code: NOT_SYMMETRIC} : {error: NO_TEMPLATE};
    else {
      const began = performance.now(), budget = (deadline - began) / 1000 - reserve;
      const start = await exactStart(exact, template, {deadline: began + Math.min(START_SECONDS, budget / 4) * 1000});
      report.start = start.how ?? start.error;
      // No start found in time: HiGHS finds the papers itself from an empty one,
      // on the coarser grid (amy-flowering, david4, where the search for a
      // start runs out of time even in 30 s).
      const empty = {positions: new Map(), labels: new Map(), chords: []}, witness = start.witness ?? empty;
      if (start.error) report.start = `none (${start.error})`;
      const left = () => budget - (performance.now() - began) / 1000, coarse = start.how !== 'template' ? {spacing: 3, neighbours: 2} : {};
      // Under ties, first the fine grid from no start, for a share of the time:
      // a start's switches each bring their images as positions, and one not the
      // template's spreads them where no template has them, a larger model.
      // Taken when the export would take it. (history: docs/inverse/SEARCH-CONSTANTS.md#bare)
      let bare = null;
      if (symmetry.length && start.how !== 'template' && left() >= BARE_FLOOR) {
        bare = await exactFromTemplate(outline, template, cfg, {multi, seconds: left() * BARE_SHARE, symmetry, exact, witness: empty, onProgress, geometry, refine, spacing: .75, neighbours: 4});
        report.bare = bare.error ?? bare.report.penalty;
      }
      const bareFound = bare && !bare.error && !(bare.report.penalty > 1e-6);
      const bareTakes = drawn => {
        try { return drawn && exportable(assess(drawn, cfg), cfg); } catch (error) {
          noteError('exact/stage.js exactSearch: assessing the fine grid\'s drawing', error);
          return false;
        }
      };
      if (bareFound && [bare.solution, bare.refined].some(bareTakes)) {
        found = {...bare, report: {...bare.report, bare: true}};
        // With more hidden segments than the lower bound, the coarse grid's too,
        // in the time left, the better kept (ramme: the fine grid proves 4
        // hidden its best, where the coarse has the designer's none).
        if (bare.report.hidden > (bare.report.bound ?? 0) && left() >= COARSE_AFTER_BARE) {
          const second = await exactFromTemplate(outline, template, cfg, {multi, seconds: left(), symmetry, exact, witness, onProgress, geometry, refine, ...coarse});
          const rank = result => {
            try { return assess(result.solution, cfg).rank; } catch (error) {
              noteError('exact/stage.js exactSearch: ranking the coarse grid\'s template', error);
              return null;
            }
          };
          if (!second.error && !(second.report.penalty > 1e-6)) {
            const [a, b] = [rank(second), rank(found)];
            if (a && b && (a.find((v, k) => v !== b[k]) !== undefined ? a[a.findIndex((v, k) => v !== b[k])] < b[a.findIndex((v, k) => v !== b[k])] : false))
              found = {...second, report: {...second.report, bareThenCoarse: true}};
          }
        }
      } else {
        found = await exactFromTemplate(outline, template, cfg, {multi, seconds: left(), symmetry, exact, witness, onProgress, geometry, refine, ...coarse});
        // The bare one where it breaks fewer of the model's rules.
        if (bare && !bare.error && (found.error || bare.report.penalty < found.report.penalty)) found = {...bare, report: {...bare.report, bare: true}};
      }
      // With two partners a position may have too few hidden segments for any
      // template under symmetric ties (starcircle's transpose, found to have none
      // in a second): then four, 1.5 units apart, in the time left.
      const rest = left();
      if (found.error === NO_TEMPLATE && start.how !== 'template' && rest >= 4) {
        const finer = await exactFromTemplate(outline, template, cfg, {multi, seconds: rest, symmetry, exact, witness, onProgress, geometry, refine, spacing: 1.5, neighbours: 4});
        found = finer.error ? found : {...finer, report: {...finer.report, finer: true}};
      }
    }
  } catch (error) {
    return {found: null, report: {...report, error: String(error.message || error)}};
  }
  // Corners joined on one side of a mirror but not on the other (exact/target.js
  // joinNearTouchings) leave the outline not quite symmetric: then without them.
  // An outline not symmetric enough for the ties even so (a traced lily's
  // petals): searched untied, the converter makes the cuts symmetric where that
  // costs little.
  // An outline not symmetric enough for the ties, its curves fitted from one
  // end on a symmetric mask (balls, davidsstjerne-circ, amy-flowering): made
  // symmetric (target.js symmetricLines). Not before: outlines the ties already
  // hold, made symmetric, gave as many templates but other ones, some worse.
  // (history: docs/inverse/SEARCH-CONSTANTS.md#even)
  if (found.code === NOT_SYMMETRIC && symmetry.length && fallback && !even) {
    const evened = await exactSearch(outline, template, cfg, {deadline, reserve, onProgress, geometry, refine, symmetry, even: true, ...alone});
    if (evened.found || evened.errorCode !== NOT_SYMMETRIC) return {...evened, report: {...evened.report, even: found.error}};
  }
  if (found.code === NOT_SYMMETRIC && symmetry.length && fallback) {
    const options = {deadline, reserve, onProgress, geometry, refine, fallback: false, ...alone};
    let again = outline.metadata?.nearTouch > 0
      ? await exactSearch({...outline, metadata: {...outline.metadata, nearTouch: 0}}, template, cfg, {...options, symmetry})
      : {found: null, report: {error: found.error}, errorCode: found.code};
    if (!again.found && again.errorCode === NOT_SYMMETRIC) again = {...await exactSearch(outline, template, cfg, {...options, symmetry: []}), untied: true};
    return {...again, report: {...again.report, unjoined: found.error, ...(again.untied ? {untied: true} : {})}};
  }
  // A picture symmetric under mirrors whose templates keep only part of its
  // symmetry: fejlternet's hidden cuts wheel round its middle square, the
  // designer's and every other, and under its mirrors the search proves there
  // is none in seconds; roed-blomst's designer keeps one diagonal, and under
  // all eight there is none. Then under part of it (subgroupsOf), each a share
  // of the time left: fejlternet's pinwheel, the designer's count, and
  // roed-blomst's template under its diagonal. Then, none of them giving a
  // template the export takes, untied for the last share: a letter or a number
  // in a hexagon has none under its turn or its diagonal alone (the outline not
  // symmetric enough for either, or the turn's drawing breaking rules). Under a
  // single tie, untied straight after: the strips frame's hearts, mirrored on a
  // diagonal, have none under it. A drawing the export does not take is kept,
  // the closest, should none follow. (history: docs/inverse/SEARCH-CONSTANTS.md#subgroups)
  const ways = fallback && found.error === NO_TEMPLATE ? fallbackTies(symmetry) : [];
  let drawn = null;
  for (const [k, ties] of ways.entries()) {
    const left = (deadline - performance.now()) / 1000 - reserve;
    if (left < TURNS_FLOOR) break;
    const share = k < ways.length - 1 ? Math.max(TURNS_FLOOR, left / (ways.length - k)) : left;
    const again = await exactSearch(outline, template, cfg, {deadline: performance.now() + 1000 * (share + reserve), reserve, onProgress,
      geometry, refine, fallback: false, symmetry: ties, even, multi, ...alone});
    const part = {subgroup: {from: symmetry, to: ties, error: found.error}, ...(ties.length ? {} : {untied: true})};
    if (again.found && exportable(again.found.assessment, cfg)) return {...again, report: {...again.report, ...part}};
    if (again.found && (!drawn || closer(again.found.assessment, drawn.found.assessment))) drawn = {...again, report: {...again.report, ...part}};
    if (closer(again.near?.assessment, other?.assessment)) other = {...again.near, report: {...again.near.report, ...part}};
  }
  if (drawn) return drawn;
  // The ladder's nearest reported as exactSearch's own results are. Alone it is
  // `near`, for the outlines after this one (engine.js exactTemplate) to better;
  // with today's search after the ladder, taken where that has none or a farther one.
  const own = near && {solution: near.solution, assessment: near.assessment, report: {...report, search: near.report, exactOutline: near.assessment, ladderNearest: true}};
  const best = closer(other?.assessment, own?.assessment) ? other : own;
  if (found.error && best && !ladderOnly) return {found: {solution: best.solution, assessment: best.assessment}, report: best.report};
  // `errorCode`: report.error's code, where it has one (NOT_SYMMETRIC), for the fallbacks above.
  if (found.error) return {found: null, ...(best ? {near: best} : {}), report: {...report, error: found.error, search: found.report},
    ...(found.code ? {errorCode: found.code} : {})};
  let solution = found.solution, assessment = assess(solution, cfg);
  // Redrawn on the mask's own edge in a few cubics (search.js, refine.js):
  // taken when it does better on passing, its failures, the picture's regions
  // or one template, or as well, with hidden cut within a quarter (a step at
  // least) and at most SMOOTH_SLACK further from the mask, within the
  // export's limit. The same solution drawn so, its hidden cut as the weave
  // shows it grows where cuts run closer beside a junction. The traced outline
  // it replaces is a polyline the editor shows as a node a pixel; on a
  // photograph's jagged staircase a smooth edge misses a few boundary pixels
  // more. (history: docs/inverse/SEARCH-CONSTANTS.md#smooth-slack)
  if (found.refined) {
    let finer = null;
    try { finer = assess(found.refined, cfg); } catch (error) {
      noteError('exact/stage.js exactSearch: assessing the redrawn template', error);
      finer = null;
    }
    report.refined = finer && {passes: finer.passes, maskError: finer.maskError, issues: finer.issues, rank: finer.rank, traced: assessment.rank};
    // Compared in that order: passing where the traced drawing does not
    // (a tip its pixel steps clear: triple-heart-shot) settles it.
    const order = [0, 1, 2, 4], diff = order.map(k => finer ? finer.rank[k] - assessment.rank[k] : 1).find(d => d !== 0) ?? 0;
    const keeps = finer && (diff < 0 || (diff === 0 && finer.rank[5] <= assessment.rank[5] + Math.max(1, Math.round(assessment.rank[5] / 4))
      && finer.maskError <= Math.min(assessment.maskError + SMOOTH_SLACK, Math.max(assessment.maskError, cfg.maxImageError))));
    if (keeps) { solution = found.refined; assessment = finer; report.refined.taken = true; }
  }
  if (best && !exportable(assessment, cfg) && closer(best.assessment, assessment)) return {found: {solution: best.solution, assessment: best.assessment}, report: best.report};
  return {found: {solution, assessment}, report: {...report, search: found.report, exactOutline: assessment}};
}
