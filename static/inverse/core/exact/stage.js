/** The exact search as Mal's rescue for a picture: when the fitter's template
 * fails, the cuts are laid exactly on the outline traced from the picture's
 * mask, and that template replaces the
 * fitter's when it passes and ranks better: fewer kinds of failed check, every
 * region of the picture kept, closer to the mask (in steps of half a percent,
 * so closeness never buys hidden cuts), one template for both papers, fewer
 * hidden runs, shorter. */
import {validate, easeMetrics, sampleWeave} from '../validate.js';
import {finalMaterialAudit} from '../geometric-material.js';
import {verifiedPaperSettings} from '../material.js';
import {verifyPaper} from './paper.js';
import {auditFeatureFidelity} from '../feature-shapes.js';
import {matchingSummary} from '../direct/matching.js';
import {routedComplexity} from '../direct/routed-refinement.js';
import {requestedSymmetry} from '../settings.js';
import {exactFromTemplate} from './search.js';
import {exactOutline} from './snap.js';
import {exactStart} from './start.js';
import {FROM_APP} from './symmetry.js';
import {rasterOutline} from './raster.js';
import {cheapBounds} from './bounds.js';

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

/** The reference-frame symmetries the exact search ties for the requested
 * ones, or null when one of them is beyond it (a symmetry within each curve). */
export function exactSymmetry(spec) {
  const requested = requestedSymmetry(spec);
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

export const better = (a, b) => { for (let i = 0; i < a.rank.length; i++) if (a.rank[i] !== b.rank[i]) return a.rank[i] < b.rank[i]; return false; };

/** The exact search on the traced `outline` from the fitter's `template`
 * within `deadline`, under the `symmetry` ties: {found: {solution,
 * assessment} or null, report}. */
export async function exactSearch(outline, template, cfg, {deadline, reserve = 4, onProgress = () => {}, symmetry = [], geometry = false, refine = true} = {}) {
  const seconds = (deadline - performance.now()) / 1000 - reserve;
  const report = {attempted: false, symmetry};
  if (seconds < 1) return {found: null, report: {...report, reason: 'no time left'}};
  report.attempted = true;
  onProgress({stage: 'exactOutline'});
  let found;
  try {
    // The start: the template's reading where it holds on this outline, else
    // a topological witness (start.js). One that is not the template's breaks
    // rules wherever its switches were spread: HiGHS gets a coarser model then.
    const exact = exactOutline(outline, cfg), began = performance.now();
    const start = await exactStart(exact, template, {deadline: began + Math.min(10, seconds / 4) * 1000});
    report.start = start.how ?? start.error;
    // No start found in time: HiGHS finds the papers itself from an empty one,
    // on the coarser grid (amy-flowering, david4, where the search for a
    // start runs out of time even in 30 s).
    const witness = start.witness ?? {positions: new Map(), labels: new Map(), chords: []};
    if (start.error) report.start = `none (${start.error})`;
    const left = seconds - (performance.now() - began) / 1000, coarse = start.how !== 'template' ? {spacing: 1.5, neighbours: 4} : {};
    found = await exactFromTemplate(outline, template, cfg, {seconds: left, symmetry, exact, witness, onProgress, geometry, refine, ...coarse});
  } catch (error) {
    return {found: null, report: {...report, error: String(error.message || error)}};
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
