/** The exact search for a picture in Mal: the cuts laid exactly on the outline
 * traced from the picture's mask, its template taken whenever the export passes
 * it (`exportable`), the fitter's otherwise (engine.js design). */
import {validate, easeMetrics, sampleWeave} from '../validate.js';
import {finalMaterialAudit} from '../geometric-material.js';
import {verifiedPaperSettings} from '../material.js';
import {verifyPaper} from './paper.js';
import {auditFeatureFidelity} from '../feature-shapes.js';
import {matchingSummary} from '../direct/matching.js';
import {routedComplexity} from '../direct/routed-refinement.js';
import {requestedSymmetry} from '../settings.js';
import {exactFromTemplate, NO_TEMPLATE} from './search.js';
import {exactOutline} from './snap.js';
import {exactStart} from './start.js';
import {FROM_APP} from './symmetry.js';
import {rasterOutline} from './raster.js';
import {cheapBounds} from './bounds.js';
import {returns} from './nogoods.js';
import {SIZE} from './structure.js';

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
 * from the border reach it. Tens of milliseconds. */
export function exactCannotStart(outline, cfg) {
  try {
    const bounds = cheapBounds(exactOutline(outline, cfg).st);
    if (bounds.impossible) return 'The outline ends unevenly on opposite sides.';
    if (!bounds.k || !bounds.ell) return 'The outline does not reach both pairs of sides.';
    return null;
  } catch (error) {
    return String(error.message || error);
  }
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

/** How a template ranks (lower is better), with what it measured. Its paper
 * is audited as the export audits it (on a finer lattice the template was
 * verified at), or `material` is that audit already made. */
export function assess(solution, cfg, {material = null} = {}) {
  const check = validate(solution, cfg, {finalGeometry: true});
  let paper = false;
  try {
    if (check.passed && !material) verifyPaper(solution, cfg);
    paper = check.passed && (material ?? finalMaterialAudit(solution, verifiedPaperSettings(solution, cfg))).passed;
  } catch { paper = false; }
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
  try { features = !woven || auditFeatureFidelity(source, woven, cfg).passed; } catch { features = true; }
  // Hidden cut as the weave shows it, alike for the fitter's template and the
  // exact search's (their own counts of hidden runs differ in kind), in steps
  // of 10 mm.
  const hidden = woven ? hiddenCutLength(solution, woven, source.resolution) : 0;
  return {passes: check.passed && paper, failures: kinds.size, issues: [...kinds], shared, hidden, hiddenRuns, length, maskError: error, features,
    rank: [check.passed && paper ? 0 : 1, kinds.size, features ? 0 : 1, Math.round(error / .005), shared ? 0 : 1, Math.round(hidden / 10), Math.round(length)]};
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

/** The exact search on the traced `outline` from the fitter's `template`
 * within `deadline`, under the `symmetry` ties: {found: {solution,
 * assessment} or null, report}. */
export async function exactSearch(outline, template, cfg, {deadline, reserve = 4, onProgress = () => {}, symmetry = [], geometry = false, refine = true, fallback = true} = {}) {
  const seconds = (deadline - performance.now()) / 1000 - reserve;
  const report = {attempted: false, symmetry};
  if (seconds < 1) return {found: null, report: {...report, reason: 'no time left'}};
  report.attempted = true;
  onProgress({stage: 'exactOutline'});
  let found;
  try {
    // The start: the template's reading where it holds on this outline, else
    // a topological witness (start.js). One that is not the template's breaks
    // rules wherever its switches were spread: HiGHS gets a coarser model then,
    // hidden segments between positions 3 units apart to their 2 nearest. On
    // the 128 juleflet pictures that found the same templates as 1.5 and 4 in
    // two thirds of the time; HiGHS's root, which overruns its time limit,
    // grows faster than the model (dagognat-shot: 65k rows 57 s, 34k 3 s).
    const exact = exactOutline(outline, cfg), began = performance.now();
    const start = await exactStart(exact, template, {deadline: began + Math.min(10, seconds / 4) * 1000});
    report.start = start.how ?? start.error;
    // No start found in time: HiGHS finds the papers itself from an empty one,
    // on the coarser grid (amy-flowering, david4, where the search for a
    // start runs out of time even in 30 s).
    const witness = start.witness ?? {positions: new Map(), labels: new Map(), chords: []};
    if (start.error) report.start = `none (${start.error})`;
    const left = seconds - (performance.now() - began) / 1000, coarse = start.how !== 'template' ? {spacing: 3, neighbours: 2} : {};
    found = await exactFromTemplate(outline, template, cfg, {seconds: left, symmetry, exact, witness, onProgress, geometry, refine, ...coarse});
    // With two partners a position may have too few hidden segments for any
    // template under symmetric ties (starcircle's transpose, found to have none
    // in a second): then four, 1.5 units apart, in the time left.
    const rest = seconds - (performance.now() - began) / 1000;
    if (found.error === NO_TEMPLATE && start.how !== 'template' && rest >= 4) {
      const finer = await exactFromTemplate(outline, template, cfg, {seconds: rest, symmetry, exact, witness, onProgress, geometry, refine, spacing: 1.5, neighbours: 4});
      found = finer.error ? found : {...finer, report: {...finer.report, finer: true}};
    }
  } catch (error) {
    return {found: null, report: {...report, error: String(error.message || error)}};
  }
  // Corners joined on one side of a mirror but not on the other (exact/target.js
  // joinNearTouchings) leave the outline not quite symmetric: then without them.
  // An outline not symmetric enough for the ties even so (a traced lily's
  // petals): searched untied, the converter makes the cuts symmetric where that
  // costs little.
  if (found.error && /not symmetric/.test(found.error) && symmetry.length && fallback) {
    const options = {deadline, reserve, onProgress, geometry, refine, fallback: false};
    let again = outline.metadata?.nearTouch > 0 ? await exactSearch({...outline, metadata: {...outline.metadata, nearTouch: 0}}, template, cfg, {...options, symmetry}) : {found: null, report: {error: found.error}};
    if (!again.found && /not symmetric/.test(again.report.error ?? '')) again = {...await exactSearch(outline, template, cfg, {...options, symmetry: []}), untied: true};
    return {...again, report: {...again.report, unjoined: found.error, ...(again.untied ? {untied: true} : {})}};
  }
  if (found.error) return {found: null, report: {...report, error: found.error, search: found.report}};
  let solution = found.solution, assessment = assess(solution, cfg);
  // Redrawn on the mask's own edge: taken when it lies nearer the mask and
  // keeps the rest (passing, the picture's regions, one template, hidden cut
  // within a step); its pixel-step edges are a little longer, which is no loss.
  if (found.refined) {
    let finer = null;
    try { finer = assess(found.refined, cfg); } catch { finer = null; }
    report.refined = finer && {passes: finer.passes, maskError: finer.maskError, issues: finer.issues};
    const keeps = finer && [0, 1, 2, 4].every(k => finer.rank[k] <= assessment.rank[k]) && finer.rank[5] <= assessment.rank[5] + 1;
    if (keeps && finer.maskError < assessment.maskError) { solution = found.refined; assessment = finer; report.refined.taken = true; }
  }
  return {found: {solution, assessment}, report: {...report, search: found.report, exactOutline: assessment}};
}
