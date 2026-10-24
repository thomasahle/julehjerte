/** The exact-outline search from a template (the reference solver's
 * sat_exact.exact_witness with template=): the template read on the target's
 * exact outline is the MILP's start and its routes are candidates; the rules it
 * breaks start soft, and HiGHS removes what it can, then shortens. */
import {readTemplate} from './template.js';
import {exactPositions} from './positions.js';
import {Candidates, tokenKey} from './candidates.js';
import {visibleNogoods, routeNogoods, runOf, nogoodKey} from './nogoods.js';
import {ExactModel} from './model.js';
import {exactOutline} from './snap.js';
import {slitPiecesOn} from './nogoods.js';
import {drawing, drawingSolution} from './draw.js';
import {paperSpots, tightNogoods} from './paper.js';
import {cheapBounds} from './bounds.js';
import {StructureSymmetry, act, group} from './symmetry.js';

// Whether every literal of a nogood holds for labels, used keys and switches.
function holds(nogood, labels, used, switches) {
  return nogood.every(([kind, ref, v]) => kind === 'lab' ? (labels.get(ref.join(',')) ?? 0) === v
    : kind === 'x' ? used.has(ref) === Boolean(v) : switches.has(ref.join(',')) === Boolean(v));
}

/** The exact template nearest the given one: {solution, report} or {error}. */
export async function exactFromTemplate(target, template, cfg, {seconds = 20, neighbours = 8, spacing = .75, paperRetries = 2, exact = exactOutline(target, cfg), symmetry = [], sheets = true, witness: given = null} = {}) {
  // The start: `witness` (exactStart's, start.js), or the template read here.
  const t0 = performance.now(), {st, outline, routes} = exact, witness = given || await readTemplate(template, outline);
  if (witness.error) return {error: witness.error};
  // The grid, with the template's switches among its positions, closed under
  // the requested symmetries (reference-frame names), whose ties then hold
  // every label, side and segment to its image.
  let sym = null, positions, ties = [];
  try {
    sym = symmetry.length ? new StructureSymmetry(outline, group(symmetry)) : null;
    positions = exactPositions(outline, {forced: witness.positions, sym, spacing});
    if (sym) ties = sym.ties(positions, sheets);
  } catch (error) {
    return {error: `The outline is not symmetric enough: ${error.message}`};
  }
  const indexOf = (e, s) => {
    const grid = positions.get(e);
    let best = 0;
    grid.forEach((x, i) => { if (Math.abs(x - s) < Math.abs(grid[best] - s)) best = i; });
    return best + 1;
  };
  const move = t => ['s', t[1], indexOf(t[1], witness.positions.get(t[1])[t[2] - 1]), t[3]];
  const cand = new Candidates(st, outline, routes, positions, {deadline: t0 + seconds * 400});
  // Each route from its tokens' grid points: under symmetry the grid holds a
  // switch's image, a little off where the template had it.
  const pairs = witness.chords.map(c => {
    const a = move(c.a), b = move(c.b);
    return {a, b, route: [cand.point(a), ...c.route.slice(1, -1), cand.point(b)]};
  });
  for (const c of pairs) cand.add(c.a, c.b, c.route);
  cand.symmetric(ties);
  // A paper-swapping mirror forces a switch where it crosses the outline, whose
  // segment must end at another such point (any other partner would be tied
  // to a second segment there): those segments along the mirror stay.
  const along = [];
  for (const tie of ties) if (tie.swaps) {
    const fixed = [...tie.tokens].filter(([k, t]) => tokenKey(t) === k).map(([, t]) => t);
    for (let i = 0; i < fixed.length; i++) for (let j = i + 1; j < fixed.length; j++)
      if (cand.faceOf.get(tokenKey(fixed[i])) === cand.faceOf.get(tokenKey(fixed[j]))) along.push([fixed[i], fixed[j]]);
  }
  cand.prune(neighbours, [...pairs.map(c => [c.a, c.b]), ...along], ties);
  // Segments of the start without a candidate: uncuttable, at a penalty, drawn
  // as the template drew them; under ties, their images too.
  const fallback = new Map(), used = new Set(), length = route => route.reduce((s, p, i) => i ? s + Math.hypot(p[0] - route[i - 1][0], p[1] - route[i - 1][1]) : 0, 0);
  const uncuttable = (a, b, route) => {
    const key = cand.keyOf(a, b);
    if (cand.cost.has(key) || fallback.has(key) || cand.faceOf.get(tokenKey(a)) !== cand.faceOf.get(tokenKey(b))) return key;
    fallback.set(key, length(route));
    const forward = key.split('|')[1] === tokenKey(a);
    cand.route.set(key, forward ? route : [...route].reverse());
    cand.pair.set(key, forward ? [cand.faceOf.get(tokenKey(a)), a, b] : [cand.faceOf.get(tokenKey(a)), b, a]);
    cand.kind.set(key, 'fallback');
    return key;
  };
  for (const c of pairs) {
    used.add(uncuttable(c.a, c.b, c.route));
    for (const tie of ties) {
      const x = tie.tokens.get(tokenKey(c.a)), y = tie.tokens.get(tokenKey(c.b));
      if (x && y) uncuttable(x, y, c.route.map(p => act(tie.name, p)));
    }
  }
  // The start's labels on the grid: each run takes the template's run it lies
  // in, switching exactly where the template's switches moved to.
  const labels = new Map();
  for (const [e, grid] of positions) {
    const at = (witness.positions.get(e) || []).map(s => indexOf(e, s));
    for (let i = 0; i <= grid.length; i++) labels.set(`${e},${i}`, witness.labels.get(`${e},${at.filter(j => j <= i).length}`) ?? 0);
  }
  const switches = new Set();
  for (const [e, grid] of positions) for (let j = 1; j <= grid.length; j++)
    if (labels.get(`${e},${j - 1}`) !== labels.get(`${e},${j}`)) switches.add(`${e},${j}`);
  const statics = [...visibleNogoods(outline, cand), ...routeNogoods(outline, cand)];
  const soft = new Set(statics.filter(n => holds(n, labels, used, switches)).map(nogoodKey));
  if (globalThis.process?.env?.EXACT_DEBUG) {
    const kinds = new Map();
    for (const n of statics) { const k = n.map(l => l[0]).sort().join('+'); kinds.set(k, (kinds.get(k) || 0) + 1); }
    console.error('statics', visibleNogoods(outline, cand).length, 'visible', [...kinds].map(([k, c]) => `${k} ${c}`).join(', '), 'soft', soft.size);
  }
  // The count's lower bound lets the count stage stop once the start's count is proven.
  const bound = Math.min(cheapBounds(st, outline).lb, used.size);
  const built = performance.now(), deadline = t0 + seconds * 1000, attempts = [];
  // Solve; a drawing the paper audit rejects is solved again with the narrow
  // paper around what it doubts forbidden (paper.js), while time is left.
  let extra = [], best = null;
  for (let attempt = 0; attempt <= paperRetries; attempt++) {
    const model = new ExactModel({st, outline, cand, h: bound, statics: [...statics, ...extra], soft, fallback, ties});
    const start = model.startValues(labels, [...used]);
    // The paper audit as a lazy check: where it doubts the paper of a solution
    // keeping every rule, the narrow paper there is penalised from then on.
    const audit = values => {
      const {labels: lab, used: chosen} = model.read(values);
      let spots = null;
      try { spots = paperSpots(drawingSolution(drawing(slitPiecesOn(st, outline, cand, lab, chosen)), target, cfg), cfg); } catch { spots = null; }
      if (!spots) return [];
      return tightNogoods(model, values, spots).map(n => model.rowOf(n)).filter(Boolean).map(([terms, rhs]) => ['paper', terms, rhs]);
    };
    const {values, report} = await model.solve({start, deadline, audit});
    attempts.push({...report, extra: extra.length, startBroken: model.broken(start)});
    if (!values) break;
    const {labels: lab, used: chosen} = model.read(values);
    const xy = drawing(slitPiecesOn(st, outline, cand, lab, chosen)), solution = drawingSolution(xy, target, cfg);
    let spots = null;
    try { spots = report.penalty > 1e-6 ? null : paperSpots(solution, cfg); } catch { spots = null; }
    const result = {solution, xy, report, paperPassed: !spots};
    if (!best || (result.paperPassed && !best.paperPassed)) best = result;
    if (result.paperPassed || !spots || performance.now() > deadline - 2000) break;
    extra = [...extra, ...tightNogoods(model, values, spots)];
  }
  if (!best) return {error: 'No exact template found.', report: attempts.at(-1)};
  return {solution: best.solution, xy: best.xy, report: {...best.report, bound, attempts, candidates: cand.cost.size, statics: statics.length,
    softStart: soft.size, uncuttableStart: fallback.size, buildSeconds: (built - t0) / 1000, seconds: (performance.now() - t0) / 1000}};
}

export {runOf};
