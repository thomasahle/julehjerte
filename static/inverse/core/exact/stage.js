/** The exact-outline stage of the editor's pipeline: the fitter's template,
 * redrawn on the target's own outline by the exact search, replaces it when it
 * ranks better: passing every check first, then fewer kinds of failed check
 * (a template failing only the paper audit beats one whose cuts cross), then
 * exactly on the outline, one template for both papers, fewer hidden runs,
 * shorter. */
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

/** The outline the exact search reads: the target's own vector curves, or
 * with `raster` (the settings) the outline traced from its pixels (raster.js). */
export function exactTarget(target, {raster = null} = {}) {
  if (target.curves?.length) return target;
  return raster ? rasterOutline(target, raster) : null;
}

/** The reference-frame symmetries the exact search ties for the requested
 * ones, or null when one of them is beyond it (a symmetry within each curve). */
export function exactSymmetry(spec) {
  const requested = requestedSymmetry(spec);
  if (requested.some(name => !FROM_APP[name])) return null;
  return requested.map(name => FROM_APP[name]);
}

/** How a template ranks (lower is better), with what it measured. */
export function assess(solution, cfg, {exact = false, raster = false} = {}) {
  const check = validate(solution, cfg, {finalGeometry: true});
  let paper = false;
  try { paper = check.passed && finalMaterialAudit(solution, cfg).passed; } catch { paper = false; }
  const kinds = new Set(check.issues.map(i => i.type));
  if (check.passed && !paper) kinds.add('paper');
  const matching = matchingSummary(solution), hidden = routedComplexity(solution).hiddenRuns;
  const shared = Boolean(matching.identical || (matching.rmsTemplateDifferenceMm ?? Infinity) <= .1);
  const length = easeMetrics(solution, cfg).totalCutLength;
  // A picture's traced outline is no design: there the weave's disagreement
  // with the mask counts, in steps of half a percent, so a closer fit never
  // buys hidden cuts or a second template.
  const error = raster ? maskError(solution) : null, fidelity = raster ? Math.round(error / .005) : exact ? 0 : 1;
  return {passes: check.passed && paper, exact, failures: kinds.size, issues: [...kinds], shared, hidden, length, ...(raster ? {maskError: error} : {}),
    rank: [check.passed && paper ? 0 : 1, kinds.size, fidelity, shared ? 0 : 1, hidden, Math.round(length)]};
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

/** The exact search from `template` within `deadline`, under the `symmetry`
 * ties: {found: {solution, assessment} or null, report}. */
export async function exactSearch(target, template, cfg, {deadline, reserve = 4, onProgress = () => {}, symmetry = [], raster = false} = {}) {
  const outline = exactTarget(target), seconds = (deadline - performance.now()) / 1000 - reserve;
  const report = {attempted: false, symmetry};
  if (!outline || seconds < 1) return {found: null, report: {...report, reason: !outline ? 'no vector outline' : 'no time left'}};
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
    const left = seconds - (performance.now() - began) / 1000, coarse = start.how !== 'template' ? {spacing: +(globalThis.process?.env?.COARSE_SPACING ?? 1.5), neighbours: +(globalThis.process?.env?.COARSE_NEIGHBOURS ?? 4)} : {};
    found = await exactFromTemplate(outline, template, cfg, {seconds: left, symmetry, exact, witness: start.witness, ...coarse});
  } catch (error) {
    return {found: null, report: {...report, error: String(error.message || error)}};
  }
  if (found.error) return {found: null, report: {...report, error: found.error, search: found.report}};
  const assessment = assess(found.solution, cfg, {exact: true, raster});
  return {found: {solution: found.solution, assessment}, report: {...report, search: found.report, exactOutline: assessment}};
}

/** The better of the fitter's `solution` and its exact-outline version, within `deadline`. */
export async function exactStage(target, solution, cfg, options = {}) {
  const {found, report} = await exactSearch(target, solution, cfg, options);
  if (!found) return {solution, report};
  const fitted = assess(solution, cfg, {raster: options.raster}), chosen = better(found.assessment, fitted) ? 'exact' : 'fitter';
  return {solution: chosen === 'exact' ? found.solution : solution, report: {...report, chosen, fitter: fitted}};
}
