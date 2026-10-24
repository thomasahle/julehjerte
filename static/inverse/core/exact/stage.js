/** The exact search as Mal's rescue for a picture: when the fitter's template
 * fails, the cuts are laid exactly on the outline traced from the picture's
 * mask, and that template replaces the fitter's when it passes and ranks
 * better: fewer kinds of failed check, closer to the mask (in steps of half a
 * percent, so closeness never buys hidden cuts), one template for both papers,
 * fewer hidden runs, shorter. */
import {validate, easeMetrics, sampleWeave} from '../validate.js';
import {finalMaterialAudit} from '../geometric-material.js';
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
 * the settings `cfg` (raster.js), or null. */
export function exactTarget(target, cfg) {
  return rasterOutline(target, cfg);
}

/** Whether the exact search can start on `outline` at all: the cut ends on
 * opposite sides of the square must pair up (bounds.js). Tens of milliseconds. */
export function exactCanStart(outline, cfg) {
  try { return !cheapBounds(exactOutline(outline, cfg).st).impossible; } catch { return false; }
}

/** The reference-frame symmetries the exact search ties for the requested
 * ones, or null when one of them is beyond it (a symmetry within each curve). */
export function exactSymmetry(spec) {
  const requested = requestedSymmetry(spec);
  if (requested.some(name => !FROM_APP[name])) return null;
  return requested.map(name => FROM_APP[name]);
}

/** How a template ranks (lower is better), with what it measured. */
export function assess(solution, cfg) {
  const check = validate(solution, cfg, {finalGeometry: true});
  let paper = false;
  try { paper = check.passed && finalMaterialAudit(solution, cfg).passed; } catch { paper = false; }
  const kinds = new Set(check.issues.map(i => i.type));
  if (check.passed && !paper) kinds.add('paper');
  const matching = matchingSummary(solution), hidden = routedComplexity(solution).hiddenRuns;
  const shared = Boolean(matching.identical || (matching.rmsTemplateDifferenceMm ?? Infinity) <= .1);
  const length = easeMetrics(solution, cfg).totalCutLength;
  // A picture's traced outline is no design: the weave's disagreement with the
  // mask counts, in steps of half a percent, so a closer fit never buys hidden
  // cuts or a second template.
  const error = maskError(solution);
  return {passes: check.passed && paper, failures: kinds.size, issues: [...kinds], shared, hidden, length, maskError: error,
    rank: [check.passed && paper ? 0 : 1, kinds.size, Math.round(error / .005), shared ? 0 : 1, hidden, Math.round(length)]};
}

/** The share of the target's observed mask cells the solution weaves wrong. */
function maskError(solution) {
  const source = solution.graph.target.sourceImage;
  if (!source?.mask || !source.resolution) return 0;
  const woven = sampleWeave(solution, source.resolution);
  let wrong = 0, counted = 0;
  for (let i = 0; i < woven.length; i++) if (!source.validMask || source.validMask[i]) { counted++; wrong += woven[i] !== source.mask[i]; }
  return counted ? wrong / counted : 0;
}

export const better = (a, b) => { for (let i = 0; i < a.rank.length; i++) if (a.rank[i] !== b.rank[i]) return a.rank[i] < b.rank[i]; return false; };

/** The exact search on the traced `outline` from the fitter's `template`
 * within `deadline`, under the `symmetry` ties: {found: {solution,
 * assessment} or null, report}. */
export async function exactSearch(outline, template, cfg, {deadline, reserve = 4, onProgress = () => {}, symmetry = [], geometry = false} = {}) {
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
    if (start.error) return {found: null, report: {...report, error: start.error}};
    const left = seconds - (performance.now() - began) / 1000, coarse = start.how !== 'template' ? {spacing: 1.5, neighbours: 4} : {};
    found = await exactFromTemplate(outline, template, cfg, {seconds: left, symmetry, exact, witness: start.witness, onProgress, geometry, ...coarse});
  } catch (error) {
    return {found: null, report: {...report, error: String(error.message || error)}};
  }
  if (found.error) return {found: null, report: {...report, error: found.error, search: found.report}};
  const assessment = assess(found.solution, cfg);
  return {found: {solution: found.solution, assessment}, report: {...report, search: found.report, exactOutline: assessment}};
}
