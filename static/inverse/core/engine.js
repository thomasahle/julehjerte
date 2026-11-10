import {repairFinalPaper} from './direct/final-paper-repair.js';
import {finalMaterialAudit} from './geometric-material.js';
import {repairFinalReturns} from './direct/final-return-repair.js';
/** Shared browser/Node API. Production execution is JavaScript + local WASM. */
import {prepareAutomatic, solveAutomatic} from './automatic.js';
import {finalFeatureAudit} from './feature-shapes.js';
import {progressReporter} from './progress.js';
import {fitDirect} from './direct/fit.js';
import {transposeTarget} from './symmetry.js';
import {symmetryReport} from './direct/symmetry.js';
import {Cubic} from './bezier.js';
import {settings} from './settings.js';
import {loadSVG, preprocessPixels, preprocessBinaryMask, colorsSafe, sampleTarget} from './input.js';
import {referenceError} from './image-reference.js';
import {loadSolutionJSON, reindex} from './graph.js';
import {solveBoundary} from './routing.js';
import {validate, verdict, easeMetrics, sampleWeave} from './validate.js';
import {materialAudit, perturbationAudit, verifiedPaperSettings} from './material.js';
import {roundHidden} from './rounding.js';
import {boundarySVG, targetSVG, resultFiles} from './export.js';
import {solvePolynomialTarget} from './direct/polynomial.js';
import {openClose, withoutSpecks} from './exact/raster.js';
import {cheapBounds} from './exact/bounds.js';
import {betterResult} from './result-rank.js';
import {exactOutline} from './exact/snap.js';
import {noteError} from './errors.js';
import {
  appSymmetry,
  assess,
  closer,
  exactSearch as searchExact,
  exactSymmetry,
  exactTarget,
  whyCannotStart,
  UNEVEN,
  exportable,
  returnTips
} from './exact/stage.js';
/** Structured cloning retains coordinates but not Cubic methods, including
 * the cached boundary seed used by the topology initializer. Rebuild derived
 * curve caches locally; a transferred cache must not hide edited coordinates. */
export function restorePrepared(target) {
  return {
    ...target,
    curves: target.curves.map(c => new Cubic(c.p)),
    ...(target.boundarySeed ? {boundarySeed: restorePrepared(target.boundarySeed)} : {})
  };
}
export function scaleTarget(target, width, colors) {
  const factor = width / target.width;
  return {
    ...target,
    width,
    curves: target.curves.map(c => new Cubic(c.p.map(p => p.map(v => v * factor)))),
    metadata: {...target.metadata, paperColors: colorsSafe(colors || target.metadata.paperColors)}
  };
}
/** The most curves the traced routes take; the automatic route fits more as an image. */
export const MAX_TRACED_CURVES = 1000;
export function prepare(input, raw = {}, onProgress = () => {}) {
  if (raw.algorithm === 'auto') return prepareAutomatic(input, raw, onProgress);
  const cfg = settings(raw),
    pre = {
      resolution: 400,
      fitTolerance: 0.5,
      maxSpan: 15,
      ...raw,
      width: cfg.width,
      nominalWidth: cfg.nominalWidth,
      paperColors: colorsSafe(cfg.paperColors),
      geometryTolerance: cfg.geometryTolerance
    };
  for (const [k, lo, hi] of [['fitTolerance', 0.01, 3], ['maxSpan', 2, 40], ['snapRadius', 0, 3]])
    if (pre[k] !== undefined && (!Number.isFinite(pre[k]) || pre[k] < lo || pre[k] > hi))
      throw new Error(`${k} must be between ${lo} and ${hi}.`);
  onProgress({stage: 'preprocessing'});
  let target, rgb = null, mask = null, n = 240;
  if (input.type === 'svg') {
    target = loadSVG(input.text, {width: cfg.width, maxSpan: pre.maxSpan || 12, tolerance: cfg.geometryTolerance});
    target.metadata.paperColors = colorsSafe(cfg.paperColors);
    if (raw.invert) target.phase ^= 1;
    mask = sampleTarget(target, n);
  } else if (input.type === 'pixels') {
    ({target, rgb, mask, n} = preprocessPixels({...input, settings: pre}));
  } else if (input.type === 'mask') {
    if (!['direct', 'polynomial'].includes(cfg.algorithm))
      throw new Error('Binary masks use automatic, direct or polynomial fitting.');
    ({target, mask, n} = preprocessBinaryMask(input, {...pre, algorithm: 'direct'}));
  } else throw new Error('Prepare accepts pixels, a binary mask or a plain SVG.');
  if (cfg.algorithm === 'direct' && input.type === 'svg') {
    const source = sampleTarget(target, 256);
    target = {
      ...target,
      curves: [],
      sourceImage: {mask: source, probability: Float32Array.from(source), resolution: 256},
      metadata: {...target.metadata, direct: true, input: 'Rasterized visible SVG for direct fitting'}
    };
    n = 256;
    mask = source;
  }
  if (raw.identicalSheets && cfg.algorithm !== 'direct' && cfg.algorithm !== 'polynomial')
    target = transposeTarget(target);
  if (target.curves.length > MAX_TRACED_CURVES && !raw.manyCurves)
    throw new Error('Too much traced detail. Increase fitting tolerance or remove small details.');
  const vector = target.metadata.direct ? maskSVG(mask, n) : targetSVG(target);
  return {
    target,
    preview: {
      vector,
      boundaries: boundarySVG(target),
      mask,
      rgb,
      resolution: n,
      ...(target.sourceImage?.validMask ? {validMask: target.sourceImage.validMask} : {}),
      ...(target.sourceImage?.weights ? {weights: target.sourceImage.weights} : {}),
      metadata: {...target.metadata, curves: target.curves.length, width: target.width}
    }
  };
}
export async function solveTarget(target, raw = {}, onProgress = () => {}, {onCandidate} = {}) {
  const cfg = settings(raw), scaled = scaleTarget(target, cfg.width, cfg.paperColors);
  onProgress = progressReporter(onProgress, cfg.progressGeometry, {onCandidate});
  if (cfg.algorithm === 'auto') return solveAutomatic(scaled, cfg, onProgress);
  if (cfg.algorithm === 'polynomial') return solvePolynomialTarget(scaled, cfg);
  if (cfg.algorithm === 'direct') {
    if (!target.metadata.direct) throw new Error('Prepare the image with direct fitting selected first.');
    return fitDirect(scaled, cfg, onProgress);
  }
  return solveBoundary(scaled, cfg, {
    onProgress,
    coreGate: cfg.requireMaterialCore ? s => materialAudit(s, cfg) : null
  });
}
/** The most seconds a design with the exact search takes, fitter included, of
 * which the last EXACT_FINISH_SECONDS are the final checks' and export's. */
export const EXACT_SECONDS = 60, EXACT_FINISH_SECONDS = 10;
/** How many minutes' worth of stages a time limit buys: the stages below are
 * written for the standard minute and grow in proportion with a longer limit
 * (the visitor's choice, Avanceret), never shrink with a shorter one. */
export const timeScale = limit => Math.max(1, limit / EXACT_SECONDS);
/** In a picture's minute: the exact search on the traced outline until
 * TRACED_SECONDS, then (its template failing) on the outline with tips rounded
 * by TIP_ROUNDING_MM (within TIP_SPOT_MM of where the template comes too close to
 * itself) until ROUNDED_SECONDS, given ROUNDED_LEAST at least: most traced
 * outlines that pass do so within 20 s, and a rounded outline hides more cut
 * and lies further from the mask, so it comes second. The fitter has what is left.
 * Alone (`exactRoute: 'exact'`, the fitter in a worker beside it), the traced
 * outline has until ALONE_TRACED_SECONDS and the rounded one the rest. A
 * passing template with tips coming back to themselves has RETURNS_LEAST (or
 * as long as it took) for one with them rounded. (history: docs/inverse/SEARCH-CONSTANTS.md#traced-seconds) */
const TRACED_SECONDS = 22,
  ROUNDED_SECONDS = 40,
  ALONE_TRACED_SECONDS = 30,
  LADDER_FIRST_SHARE = 0.5,
  TRACED_FIRST_WEIGHT = 2,
  LADDER_LEAST = 2,
  LOOSE_LEAST = 90,
  LOOSE_MM = 0.05,
  STRICT_SECONDS = 50,
  ROUNDED_LEAST = 6,
  RETURNS_LEAST = 10,
  TIP_ROUNDING_MM = 0.8,
  TIP_SPOT_MM = 4,
  RETURN_REPAIR_SECONDS = 4,
  RETURN_REPAIR_TRIES = 2,
  ROUGH_ONE = 1.1,
  ROUGH_TWO = 1.3;
/** The fitter's seconds beside the exact search (`exactRoute: 'fitter'`): what
 * it had when it came first, which photographs need to keep their details. */
const FITTER_SECONDS = 45;
export async function design(target, raw = {}, onProgress = () => {}, options = {}) {
  const cfg = settings(raw), symmetry = exactSymmetry(cfg.symmetry);
  // A picture in Mal (`exactOutline`, a mask without curves): the exact search
  // lays the cuts on the outline traced from the mask, with the requested
  // symmetry's ties, and its template stands whenever the export passes it
  // (cutting rules, paper, the picture's regions and fidelity); the fitter's
  // only when it finds none. It cannot keep identical sheets, a free frame band,
  // each curve turned about its middle or a photograph's crop missing much of
  // the picture (exactWeights), so those have the fitter's alone;
  // with it a design takes at most EXACT_SECONDS. `exactRoute` splits the two
  // for workers side by side (worker-controller.js): 'exact' the exact search
  // alone, failing with code NO_EXACT_TEMPLATE, 'fitter' the fitter alone.
  const route = raw.exactRoute,
    exactOn =
      cfg.exactOutline &&
      !target.curves?.length &&
      !raw.identicalSheets &&
      exactWeights(target.sourceImage) &&
      symmetry !== null;
  const noExact = report =>
    Object.assign(new Error('The exact search found no template the export passes.'), {
      code: 'NO_EXACT_TEMPLATE',
      report: {exactOutline: report}
    });
  if (route === 'exact' && !exactOn)
    throw noExact({chosen: 'fitter', error: 'The exact search cannot keep these settings.'});
  if (!exactOn || route === 'fitter') {
    const limit = exactOn ? Math.min(cfg.timeLimit, FITTER_SECONDS * timeScale(cfg.timeLimit)) : cfg.timeLimit,
      deadline = performance.now() + 1000 * cfg.timeLimit;
    const solution = await solveTarget(target, {...raw, timeLimit: limit}, onProgress, options);
    return finish(solution, settings(solution.automaticSettings || raw), onProgress, {deadline});
  }
  const seconds = cfg.timeLimit,
    scale = timeScale(seconds),
    start = performance.now(),
    deadline = start + 1000 * seconds,
    searchEnd = deadline - 1000 * EXACT_FINISH_SECONDS;
  const alone = route === 'exact', cfgExact = settings({...raw, symmetry: cfg.symmetry});
  const {solution, nearest, report} = await exactTemplate(target, cfg, cfgExact, symmetry, onProgress, {
    // The ladder alone (beside today's search, in its own worker) has nothing after the traced outline: all the time.
    tracedEnd:
      raw.ladderOnly === true
        ? searchEnd
        : Math.min(searchEnd, start + 1000 * scale * (alone ? ALONE_TRACED_SECONDS : TRACED_SECONDS)),
    roundedEnd: alone ? searchEnd : Math.min(searchEnd, start + 1000 * scale * ROUNDED_SECONDS),
    maps: raw.cutMaps ?? null,
    ladderOnly: raw.ladderOnly === true,
    part: ladderPart(raw.ladderPart)
  });
  if (solution) {
    solution.report = {...solution.report, exactOutline: {...report, chosen: 'exact'}};
    return finish(solution, cfgExact, onProgress, {deadline});
  }
  // The exact search's best template that misses some check (a clearance by
  // a hair, a lost region) is never thrown away: alone it is the answer, else
  // the fitter's stands only when it is better (result-rank.js).
  const near = nearest
    ? ((nearest.report = {...nearest.report, exactOutline: {...report, chosen: 'exact', nearMiss: true}}),
      finish(nearest, cfgExact, onProgress, {deadline}))
    : null;
  if (alone) {
    if (near) return near;
    throw noExact(report);
  }
  const fitted = await solveTarget(
    target,
    {...raw, timeLimit: Math.max(0.1, (searchEnd - performance.now()) / 1000)},
    onProgress,
    options
  );
  fitted.report = {...fitted.report, exactOutline: report};
  return betterResult(near, finish(fitted, settings(fitted.automaticSettings || raw), onProgress, {deadline}));
}
/** Whether the exact search can keep a picture's weights: none, or only its
 * observed pixels' (a photograph's crop reaching past the picture, which the
 * outline is traced across: raster.js fillUnobserved) with at most
 * MISSING_SHARE unobserved. Of the 80 scraped photographs six hearts miss up to
 * 0.6% of their square, four instruction sheets 7-18%. */
const MISSING_SHARE = 0.02;
function exactWeights(source) {
  if (!source?.weights) return true;
  const observed = source.validMask;
  if (!observed || observed.length !== source.weights.length) return false;
  let missing = 0;
  for (let i = 0; i < observed.length; i++) {
    if (source.weights[i] !== observed[i]) return false;
    missing += observed[i] ? 0 : 1;
  }
  return missing <= MISSING_SHARE * observed.length;
}
/** `exactSearch`, the templates it finds that the export rejects set aside
 * in `options.sink` for exactTemplate's last resort (returnRepaired). */
async function exactSearch(outline, template, cfg, options) {
  const found = await searchExact(outline, template, cfg, options);
  if (found.found && !exportable(found.found.assessment, cfg)) options.sink?.push(found);
  return found;
}
/** The last resort once every stage has failed: a rejected template whose only
 * broken rule is a short return of a cut onto itself, repaired as the export
 * repairs one (repairFinal: the returns moved apart, RETURN_REPAIR_SECONDS each
 * whatever the stages have left) and taken when it then passes the export,
 * where the fitter's would be the only one. First, not instead of the rounded
 * outline's, whose templates hide less. (history: docs/inverse/SEARCH-CONSTANTS.md#return-repair) */
function returnRepaired(candidates, cfg) {
  const near = candidates
    .filter(c => {
      const a = c.found.assessment;
      return a.issues.length && a.issues.every(issue => issue === 'short_self_clearance');
    })
    .sort((x, y) => x.found.assessment.maskError - y.found.assessment.maskError);
  for (const found of near.slice(0, RETURN_REPAIR_TRIES)) {
    try {
      const done = repairFinal(found.found.solution, cfg, {
          refine: false,
          deadline: performance.now() + 1000 * RETURN_REPAIR_SECONDS
        }),
        repaired = assess(done.solution, cfg);
      if (exportable(repaired, cfg))
        return {
          ...found,
          found: {solution: done.solution, assessment: repaired},
          report: {...found.report, exactOutline: repaired, repairedReturns: true}
        };
    } catch (error) {
      noteError('engine.js returnRepaired', error);
      // then the next
    }
  }
  return null;
}
/** Pixels below which a region is a stray speck of a hand painting (120 of 400²
 * pixels, n²/1333; a blob of 4 pixels' radius is 49, of 6 is 113), 0 when the
 * mask has none: below the smallest real region of the gallery's, library's, web
 * and generator masks (144 pixels), inside and at the square's edge, where a
 * speck painted bites into the edge. (history: docs/inverse/SEARCH-CONSTANTS.md#mask-specks) */
export function maskSpecks(source) {
  const n = source?.resolution;
  if (!source?.mask || !n) return 0;
  const limit = Math.round((n * n) / 1333);
  return withoutSpecks(source.mask, n, limit, true) ? limit : 0;
}
/** Pixels of boundary of a mask over those of its opening by a pixel (1 for a
 * smooth one): 0 when the mask is smooth enough, else the pixels to open by. */
export function maskRoughness(source) {
  const n = source?.resolution,
    limit = maskSpecks(source),
    mask = limit ? withoutSpecks(source.mask, n, limit) : source?.mask;
  if (!mask || !n) return 0;
  const edges = m => {
    let k = 0;
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        if (x + 1 < n && m[y * n + x] !== m[y * n + x + 1]) k++;
        if (y + 1 < n && m[y * n + x] !== m[(y + 1) * n + x]) k++;
      }
    return k;
  };
  const opened = edges(openClose(mask, n, 1));
  const ratio = opened ? edges(mask) / opened : 1;
  return ratio >= ROUGH_TWO ? 2 : ratio >= ROUGH_ONE ? 1 : 0;
}
/** The first outline the exact search can start from, traced by `traceAt(open, way)`
 * ({scaled, why} or null), and the way that traced it; else why the first trace
 * cannot start. A mask with wobbling edges (hand-painted, its boundary a tenth
 * longer than after opening by a pixel) is traced opened by `rough` pixels (1, or
 * 2 from a third longer: its model otherwise grows with every wobble); one ending
 * unevenly then read paired; then opened by 1 and 2. The first trace's reason
 * stands, opened or not, so an uneven crop traced opened is read paired too.
 * (history: docs/inverse/SEARCH-CONSTANTS.md#rough) */
export function firstTrace(rough, traceAt) {
  // `code`: the first trace's reason's code (exact/stage.js whyCannotStart), traceAt's `code`.
  let cannot = 'No outline was traced from the mask.', code = null;
  for (const [k, way] of [{open: rough}, {open: rough, paired: true}, {open: 1}, {open: 2}].entries()) {
    if (way.paired && code !== UNEVEN) continue;
    try {
      const traced = traceAt(way.open, way);
      if (traced) {
        if (!traced.why) return {outline: traced.scaled, way};
        if (!k) {
          cannot = traced.why;
          code = traced.code ?? null;
        }
      }
    } catch (error) {
      if (!k) {
        cannot = String(error.message || error);
        code = null;
      }
    }
  }
  return {outline: null, way: null, cannot};
}
/** One of n ladders side by side (worker-controller.js), [i, n], else the only one: [0, 1]. */
function ladderPart(part) {
  return Array.isArray(part) && part.length === 2 && part.every(Number.isInteger) && part[0] >= 0 && part[0] < part[1]
    ? part
    : [0, 1];
}
/** The exact search's template for a picture the export passes, or none:
 * {solution, report}. On the outline traced from the mask until `tracedEnd`,
 * then on it with its tips rounded until `roundedEnd`. */
async function exactTemplate(
  target,
  cfg,
  cfgExact,
  symmetry,
  onProgress,
  {tracedEnd, roundedEnd, maps = null, ladderOnly = false, part = [0, 1]}
) {
  // The outline traced from the mask first (tens of milliseconds): where its
  // cut ends cannot pair up the exact search cannot start.
  // A trace whose curves meet where the pixels only nearly touch (a vertex of
  // six curves) or a border sliver can stop it: then the mask opened by a
  // pixel or two first (raster.js openClose), a tenth of a second each. A
  // photograph's crop a little off the square can end it unevenly on opposite
  // sides: then first its sides read as deep as each pair needs (`paired`),
  // as every later trace of it then is.
  let base = {specks: maskSpecks(target.sourceImage)};
  const traceAt = (open, near = {}) => {
    const traced = exactTarget(target, cfg, {...base, open, ...near}),
      scaled = traced && scaleTarget(traced, cfg.width, cfg.paperColors);
    const why = scaled && whyCannotStart(scaled, cfg);
    return scaled ? {scaled, why: why?.message ?? null, code: why?.code ?? null} : null;
  };
  const {outline, way, cannot} = firstTrace(maskRoughness(target.sourceImage), traceAt);
  if (!outline) return {solution: null, report: {chosen: 'fitter', error: cannot}};
  if (way.paired) base = {...base, paired: true};
  let ties = symmetry;
  const sink = [], search = end => ({deadline: end, onProgress, symmetry: ties, geometry: cfg.progressGeometry, sink});
  const began = performance.now();
  // The ladder alone (a worker beside today's search, worker-controller.js):
  // the traced outline and the ones today's search goes on to, with tips
  // rounded, each searched by the ladder in two phases (exact/stage.js): its
  // cheap rungs on every outline first, then its long ones: some templates
  // (5star's) lie on a rounded outline, most on the traced one.
  // (history: docs/inverse/SEARCH-CONSTANTS.md#ladder-outlines)
  if (ladderOnly) {
    const n = target.sourceImage.resolution,
      px = n / cfgExact.width,
      radius = Math.max(1, Math.round((TIP_ROUNDING_MM * n) / target.width));
    let tips = [];
    try {
      tips = returnTips(outline, cfgExact).map(([x, y]) => [x * px, y * px]);
    } catch (error) {
      noteError('engine.js exactTemplate: return tips', error);
      tips = [];
    }
    const outlines = [outline];
    for (const way of [
      ...(tips.length ? [{open: radius, spots: tips, within: TIP_SPOT_MM * px}] : []),
      {open: radius},
      {open: 2 * radius, wider: true}
    ]) {
      try {
        const traced = traceAt(way.open, way);
        if (traced && !traced.why) outlines.push(traced.scaled);
      } catch {
        // An outline that cannot be traced (exactTarget throws) is left out.
      }
    }
    // The outline moved off the paper's sides where it runs closer to one than
    // the outer strip may be wide (border.js outerStripBand), when it does.
    try {
      const traced = traceAt(way.open, {outerStrip: true});
      if (traced && !traced.why) outlines.push(traced.scaled);
    } catch {
      // An outline that cannot be traced (exactTarget throws): none.
    }
    // The traced outline's lower bound: no template on it has fewer hidden
    // segments, so a ladder template with no more than that (on whichever
    // outline) is as good as today's search can find there, and the page need
    // not wait for it (worker-controller.js).
    let tracedBound = null;
    try {
      tracedBound = cheapBounds(
        ...(ex => [ex.st, ex.outline])(exactOutline(outline, cfgExact, 'tight', {symmetry: []}))
      ).lb;
    } catch (error) {
      noteError('engine.js exactTemplate: the traced outline\'s bound', error);
      tracedBound = null;
    }
    // With no template the export takes on any outline, the nearest the ladder
    // had on any (design() finishes it as a near miss): the page never gets
    // nothing from the ladder while it found a template.
    let last = null, near = null;
    // With more than LOOSE_LEAST seconds (a longer search chosen under Avanceret), once the ladder has
    // had what the one-minute search gives it (STRICT_SECONDS, or a third), the rest goes through it again
    // with the model's clearances LOOSE_MM lower, judged by the export's own (the 0.1 mm it tolerates).
    // Not sooner: lowered from the start, some templates' returns fail once smoothed.
    // (history: docs/inverse/SEARCH-CONSTANTS.md#loose)
    const total = roundedEnd - performance.now(),
      strictEnd =
        total >= 1000 * LOOSE_LEAST ? performance.now() + Math.max(1000 * STRICT_SECONDS, total / 3) : roundedEnd;
    for (const [cfgPass, passEnd, loose] of [
      [cfgExact, strictEnd, false],
      ...(strictEnd < roundedEnd ? [[{...cfgExact, modelTolerance: LOOSE_MM}, roundedEnd, true]] : [])
    ])
      for (const [phase, share] of [['first', LADDER_FIRST_SHARE], ['second', 1]]) {
        const phaseEnd = performance.now() + share * (passEnd - performance.now());
        // One of n ladders side by side searches the outlines k with k % n === i, with all the time (the
        // traced outline's cheap rungs get more of the first phase).
        // (history: docs/inverse/SEARCH-CONSTANTS.md#ladder-part)
        const mine = [...outlines.entries()].filter(([k]) => k % part[1] === part[0]);
        // One ladder over every outline counts the traced one TRACED_FIRST_WEIGHT times in the first phase, a
        // third of it with five outlines, as the part with it has of two ladders: its rungs to K300 then fit
        // there. (history: docs/inverse/SEARCH-CONSTANTS.md#traced-first-weight)
        const weight = k => (phase === 'first' && k === 0 && part[1] === 1 ? TRACED_FIRST_WEIGHT : 1);
        for (const [j, [k, traced]] of mine.entries()) {
          const left = phaseEnd - performance.now(),
            rest = mine.slice(j).reduce((sum, [other]) => sum + weight(other), 0);
          if (left < 1000 * LADDER_LEAST) break;
          last = await exactSearch(traced, null, cfgPass, {
            ...search(performance.now() + (left * weight(k)) / rest),
            reserve: 0.5,
            maps,
            ladderOnly,
            phase
          });
          if (last.found)
            return {
              solution: last.found.solution,
              report: {
                ...last.report,
                chosen: 'exact',
                ladderOnly: true,
                outline: k,
                phase,
                tracedBound,
                ...(loose ? {loose: true} : {})
              }
            };
          if (closer(last.near?.assessment, near?.assessment)) near = {...last.near, outline: k, phase};
        }
      }
    if (near)
      return {
        solution: null,
        nearest: near.solution,
        report: {
          ...near.report,
          chosen: 'fitter',
          ladderOnly: true,
          outline: near.outline,
          phase: near.phase,
          tracedBound
        }
      };
    return {solution: null, report: {...(last?.report ?? {}), chosen: 'fitter', ladderOnly: true}};
  }
  // The cut-proposal network's maps (raw.cutMaps, made by the worker from the
  // mask: neural/cuts.js) give the traced outline's search its ladder first.
  let found = await exactSearch(outline, null, cfgExact, {...search(tracedEnd), maps, ladderOnly});
  // A template under part of the symmetry (exact/stage.js subgroupsOf): the
  // searches with tips rounded keep to that part.
  if (found.report.subgroup) ties = found.report.subgroup.to;
  const tracedMs = performance.now() - began,
    n = target.sourceImage.resolution,
    px = n / cfgExact.width,
    radius = Math.max(1, Math.round((TIP_ROUNDING_MM * n) / target.width));
  const segments = f => f.report.search?.attempts?.at(-1)?.hidden ?? Infinity;
  // A tip that comes back within 1.5 mm of itself (mostly one or two pixels
  // wide, traced as a box) makes the slit along it change papers there, which
  // takes hidden segments: a template with more than the count's lower bound
  // is searched for again with those tips rounded (within TIP_SPOT_MM), for as
  // long as the first search took (RETURNS_LEAST at least: it has a template
  // already), and taken with fewer (tulipan 4 -> 0, its true design's).
  let tips = [];
  try {
    tips = returnTips(outline, cfgExact).map(([x, y]) => [x * px, y * px]);
  } catch (error) {
    noteError('engine.js exactTemplate: return tips', error);
    tips = [];
  }
  if (
    tips.length &&
    exportable(found.found?.assessment, cfgExact) &&
    segments(found) > (found.report.search?.bound ?? 0) &&
    roundedEnd - performance.now() >= 1000 * ROUNDED_LEAST
  ) {
    let rounded = null;
    try {
      const traced = traceAt(radius, {spots: tips, within: TIP_SPOT_MM * px});
      rounded = traced && !traced.why ? traced.scaled : null;
    } catch {
      // An outline that cannot be traced (exactTarget throws): none.
      rounded = null;
    }
    const again =
      rounded &&
      (await exactSearch(
        rounded,
        null,
        cfgExact,
        search(Math.min(roundedEnd, performance.now() + Math.max(1000 * RETURNS_LEAST, tracedMs)))
      ));
    if (again && exportable(again.found?.assessment, cfgExact) && segments(again) < segments(found))
      found = {...again, report: {...again.report, rounded: 'returns'}};
  }
  // A template failing the cutting rules mostly follows a tip narrower than
  // a cut's clearance: again on the outline with its tips rounded, first only
  // within TIP_SPOT_MM of where it comes too close to itself when it says, or
  // comes back to itself (sharp corners elsewhere stay sharp: 5star,
  // triple-heart), then everywhere (fisk-kors-shot), the first with 3/5 of the
  // time when both are to run; in what time that leaves, everywhere twice as
  // much (mor-og-barn: a template 0.52% from its mask in 4 s, where 0.8 mm
  // left its chin and its child's nose closer than a slit may come).
  // An outline running closer to a side than the outer strip may be wide
  // without reaching it has no template keeping the rules (border.js
  // outerStripBand: balls' circles 2.14 mm from the edge, against 2.5): moved
  // off the side there, it is searched next, with half the time left, and the
  // outlines with tips rounded after it are moved too. Most pictures have none.
  let strip = {};
  if (!exportable(found.found?.assessment, cfgExact) && roundedEnd - performance.now() >= 1000 * ROUNDED_LEAST) {
    let moved = null;
    try {
      const traced = traceAt(way.open, {outerStrip: true});
      moved = traced && !traced.why ? traced.scaled : null;
    } catch {
      // An outline that cannot be traced (exactTarget throws): none.
      moved = null;
    }
    if (moved) {
      strip = {outerStrip: true};
      const again = await exactSearch(
        moved,
        null,
        cfgExact,
        search(performance.now() + 0.5 * (roundedEnd - performance.now()))
      );
      if (exportable(again.found?.assessment, cfgExact) || closer(again.found?.assessment, found.found?.assessment))
        found = {...again, report: {...again.report, outerStrip: true}};
    }
  }
  if (!exportable(found.found?.assessment, cfgExact) && roundedEnd - performance.now() >= 1000 * ROUNDED_LEAST) {
    const spots = [
      ...(found.found
        ? validate(found.found.solution, cfgExact, {finalGeometry: true})
            .issues.filter(i => i.type === 'short_self_clearance' && i.points)
            .flatMap(i => i.points.map(([x, y]) => [x * px, y * px]))
        : []),
      ...tips
    ];
    const ways = [
      ...(spots.length ? [{open: radius, spots, within: TIP_SPOT_MM * px}] : []),
      {open: radius},
      {open: 2 * radius, wider: true}
    ];
    for (const [k, way] of ways.entries()) {
      if (exportable(found.found?.assessment, cfgExact) || roundedEnd - performance.now() < 1000 * ROUNDED_LEAST) break;
      let rounded = null;
      try {
        const traced = traceAt(way.open, {...way, ...strip});
        rounded = traced && !traced.why ? traced.scaled : null;
      } catch {
        // An outline that cannot be traced (exactTarget throws): the next way.
        rounded = null;
      }
      if (!rounded) continue;
      const end = way.spots ? performance.now() + 0.6 * (roundedEnd - performance.now()) : roundedEnd;
      const again = await exactSearch(rounded, null, cfgExact, search(end));
      if (exportable(again.found?.assessment, cfgExact) || closer(again.found?.assessment, found.found?.assessment))
        found = {
          ...again,
          report: {...again.report, ...strip, rounded: way.spots ? 'near' : way.wider ? 'wider' : true}
        };
    }
  }
  if (!exportable(found.found?.assessment, cfgExact)) {
    const repaired = returnRepaired(sink, cfgExact);
    if (repaired) found = repaired;
  }
  // `held`: the symmetries the template was searched under, in the app's
  // names, for the page to hold the rows it can when that is only part of
  // those asked for (roed-blomst: its two lobes alike, not their mirrors).
  const report = {
    ...found.report,
    chosen: 'fitter',
    held: appSymmetry(found.report.symmetry ?? []),
    ...(base.paired ? {paired: true} : {}),
    ...(base.specks ? {specks: base.specks} : {})
  };
  const passing = exportable(found.found?.assessment, cfgExact);
  return {
    solution: passing ? found.found.solution : null,
    nearest: !passing && found.found?.solution ? found.found.solution : null,
    report
  };
}
export function inspectSaved(text, raw = {}, onProgress = () => {}) {
  const cfg = settings(raw), solution = loadSolutionJSON(text), factor = cfg.width / solution.graph.target.width;
  solution.graph.edges.forEach(e => (e.curve = new Cubic(e.curve.p.map(p => p.map(x => x * factor)))));
  solution.graph.target = scaleTarget(solution.graph.target, cfg.width, cfg.paperColors);
  reindex(solution.graph);
  return finish(solution, cfg, onProgress);
}
export function inputImageError(solution) {
  const source = solution.graph.target.sourceImage;
  return source ? errorFromSamples(source, sampleWeave(solution, source.resolution)) : null;
}
function errorFromSamples(source, rendered) {
  if (!source) return null;
  const error = referenceError(source, rendered);
  if (!Number.isFinite(error.mismatchFraction)) throw new Error('The crop contains no observed image pixels.');
  return {
    reference: source.validMask
      ? 'Observed image pixels; outside-source padding is excluded and observed coverage is reported separately'
      : source.weights
        ? 'Original artwork with image-importance weights; whole-image and permitted changes reported separately'
        : 'Classified input crop before border repair, cleanup or tracing',
    resolution: source.resolution,
    ...error,
    method: 'Forward sampling of both slit families at input resolution',
    independentExportRenderer: false
  };
}
/** The repairs before export: hidden cuts rounded, then the editor's
 * complete-cut rule and the paper audit's bounded repairs. design() runs them
 * before deciding whether the exact search must rescue a template, and hands
 * them to finish() as `repaired`. */
export function repairFinal(solution, cfg, {onProgress = () => {}, refine = true, deadline = Infinity} = {}) {
  cfg = verifiedPaperSettings(solution, cfg);
  onProgress({stage: 'validating'});
  let refinement = null;
  if (refine && cfg.roundHidden && cfg.minRadius > 0 && validate(solution, cfg).passed) {
    onProgress({stage: 'rounding'});
    refinement = roundHidden(solution, cfg, {onProgress, budgetSeconds: 15});
  }
  // Keep the cheaper search guidance inside fitting. The final pair uses the
  // same complete-cut rule as the editor, with bounded repair before export.
  const returnRepair = repairFinalReturns(solution, cfg, {deadline});
  // A detected disconnected core needs real curve updates after its initial
  // audit. Use otherwise idle caller time, retaining a second for final
  // checks, instead of imposing the short-request cap on a longer request.
  // Saved-template inspection has no finite caller budget and keeps its cap.
  const paperRepairMilliseconds = Number.isFinite(deadline)
    ? Math.min(4500, Math.max(1500, deadline - performance.now() - 1000))
    : 1500;
  const paperRepair = repairFinalPaper(returnRepair.solution, cfg, {
    deadline,
    maxMilliseconds: paperRepairMilliseconds,
    includeMaps: true
  });
  return {solution: paperRepair.solution, cfg, refinement, returnRepair, paperRepair};
}
export function finish(
  solution,
  cfg,
  onProgress = () => {},
  {refine = true, stoppedEarly = false, alternatives = [], deadline = Infinity, repaired = null} = {}
) {
  const started = performance.now();
  const done = repaired ?? repairFinal(solution, cfg, {onProgress, refine, deadline}),
    {refinement, returnRepair, paperRepair} = done;
  solution = paperRepair.solution;
  cfg = verifiedPaperSettings(solution, done.cfg);
  const check = verdict(validate(solution, cfg, {finalGeometry: true}));
  onProgress({stage: 'paper'});
  const material = paperRepair.material || finalMaterialAudit(solution, cfg, {includeMaps: true}),
    perturbation = check.passed
      ? perturbationAudit(solution, cfg, {onProgress})
      : {summary: {trials: 0, skipped: 'Nominal geometry failed validation.'}, trials: [], worst: null},
    metrics = easeMetrics(solution, cfg),
    source = solution.graph.target.sourceImage,
    comparison = {
      resolution: source?.resolution ?? 240,
      wovenMask: sampleWeave(solution, source?.resolution ?? 240),
      validMask: source?.validMask,
      ...(source?.weights ? {weights: source.weights} : {})
    },
    imageError = errorFromSamples(source, comparison.wovenMask),
    imagePassed = !imageError || imageError.mismatchFraction <= cfg.maxImageError,
    features = finalFeatureAudit(source, comparison.wovenMask, cfg),
    allowTemplates = features.passed && check.passed && (!cfg.requireMaterialCore || material.passed) && imagePassed,
    symmetry = symmetryReport(solution, cfg.symmetry),
    warnings = [];
  // A dropped symmetry request belongs in the warnings the app already reads,
  // not only in a report field: the traced routes cannot enforce one at all.
  const unhonoured = symmetry.requested.filter(name => !symmetry.honoured.includes(name));
  if (unhonoured.length)
    warnings.push(
      `The exported cuts do not satisfy the requested symmetry ${unhonoured.join(', ')} (${symmetry.maxDeviationMm === null ? 'no paired cuts exist for these slit counts' : `largest deviation ${symmetry.maxDeviationMm.toFixed(3)} mm`}). Only the direct fitter enforces a requested symmetry.`
    );
  if (!features.passed)
    warnings.push(
      `${features.missing.length} substantial interior artwork region(s) lost their colour or enclosure. Inspect the original mask and comparison.`
    );
  if (!imagePassed)
    warnings.push(
      `The exported weave differs from the original classified artwork by ${(100 * imageError.mismatchFraction).toFixed(2)}%, above the ${(100 * cfg.maxImageError).toFixed(2)}% limit. This limit measures image fidelity, not similarity to unknown original cutting paths.`
    );
  if (!check.passed)
    warnings.push('Nominal geometry failed independent validation. Inspect the template and paper-support views.');
  if (material.status !== 'pass')
    warnings.push(
      `The paper-core test is ${material.status}. Inspect the unfolded paper-support views; a disconnected core needs a geometry change.`
    );
  if (!cfg.requireMaterialCore)
    warnings.push(
      'Strict paper-core rejection was disabled. Treat any exported template as an unchecked manufacturing candidate.'
    );
  if (metrics.hiddenCurvesBelowRadius)
    warnings.push(
      `${metrics.hiddenCurvesBelowRadius} hidden curve(s) remain below the desired radius. The radius is a refinement goal, not a globally enforced feasibility guarantee.`
    );
  if (perturbation.summary.invalidTopologyTrials)
    warnings.push(
      `${perturbation.summary.invalidTopologyTrials} synthetic cutting-error trials had invalid topology. These trials are failures, not zero-error successes.`
    );
  const trace = solution.graph.target.metadata.preprocessing;
  if (trace && trace.sourceMaskComponents !== trace.vectorSampleComponents)
    warnings.push('Tracing changed the sampled component count. Inspect the processed artwork.');
  if (!solution.paths[0].length || !solution.paths[1].length)
    warnings.push(
      'This pattern has no slits in at least one sheet. A normal woven basket construction is not established.'
    );
  const report = {
    application: 'juleflet JavaScript',
    version: '1.0.0',
    createdAt: new Date().toISOString(),
    settings: cfg,
    input: solution.graph.target.metadata,
    templateExportAllowed: true,
    templateChecksPassed: allowTemplates,
    slits: {left: solution.paths[1].length, right: solution.paths[0].length},
    solver: solution.report,
    validation: check,
    manufacturing: material.summary,
    refinement,
    ease: metrics,
    tolerance: perturbation.summary,
    toleranceTrials: perturbation.trials,
    warnings,
    postprocessSeconds: (performance.now() - started) / 1000,
    assurance: {
      physicalAssemblyTested: false,
      stressSimulation: false,
      exactAreaCertificate: false,
      curveIntersections: 'adaptive chord approximation; floating-point predicates',
      paperAnalysis:
        'guarded rolling-disk lattice and independent polygon offsets of unfolded cuts; finite numerical probes',
      continuousOptimization: stoppedEarly
        ? 'Retained a validated checkpoint and applied standard shared-cut and primitive cleanup'
        : solution.report.algorithm === 'hybrid-bezier-trace'
          ? 'Fresh image-based grid initialization followed by traced MILP routing to preserve missing features'
          : solution.report.algorithm === 'direct-bezier'
            ? 'Analytic grid gradients and continuous boundary-motion Bézier gradients with Adam and geometry checkpoints'
            : 'local shared-fillet and handle search, not SciPy SLSQP',
      candidateGraph: solution.graph.metadata.candidateMethod || 'Imported cutting paths'
    }
  };
  report.finalPaperRepair = paperRepair.report;
  report.finalReturnRepair = returnRepair.report;
  report.imageError = imageError;
  report.symmetry = symmetry;
  report.imageFidelity = {
    passed: imagePassed && features.passed,
    features,
    maximumMismatchFraction: cfg.maxImageError,
    referenceAvailable: !!imageError
  };
  if (stoppedEarly) {
    report.stoppedEarly = true;
    report.alternatives = alternatives;
  }
  onProgress({stage: 'exporting'});
  const files = resultFiles(solution, cfg, report, material, perturbation);
  return {report, files, comparison};
}

function maskSVG(mask, n) {
  const runs = [];
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n;) {
      if (!mask[y * n + x]) {
        x++;
        continue;
      }
      const start = x;
      while (x < n && mask[y * n + x]) x++;
      runs.push(`M${start},${y}h${x - start}v1h${start - x}Z`);
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}"><rect width="${n}" height="${n}" fill="white"/><path d="${runs.join(' ')}" fill="#bd1111"/></svg>`;
}
