/** exactTemplate's schedule (static/inverse/core/engine.js) on a fake clock with scripted collaborators (its
 * `tools`, engine.js SEARCH_TOOLS): every call they get is recorded with what it was asked, and what
 * exactTemplate returns, as a trace. Seeded: a scenario's trace is the same on every run, so two versions of the
 * schedule are the same where their traces are (search-schedule.test.mjs). Not the searches themselves: each
 * scripted search moves the clock and returns an outcome drawn for it. */
import {UNEVEN} from '../../static/inverse/core/exact/stage.js';
import {NO_TEMPLATE, NOT_SYMMETRIC} from '../../static/inverse/core/exact/search.js';

/** A stream of numbers in [0, 1) from a 32-bit seed (mulberry32). */
function stream(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The scenario's own stream for one kind of call: an extra or a missing call of one kind leaves the others'
 * outcomes as they were. */
function streamFor(seed, kind) {
  let h = 2166136261 ^ seed;
  for (const c of kind) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return stream(h);
}

const pick = (r, list) => list[Math.floor(r() * list.length)];
const int = (r, lo, hi) => lo + Math.floor(r() * (hi - lo + 1));

const PARTS = [[0, 1], [0, 1], [0, 2], [1, 2], [0, 3], [1, 3], [2, 3]];
const SYMMETRIES = [[], [], ['mirrorX'], ['mirrorX', 'mirrorY'], ['antiTranspose'], ['rotate180', 'mirrorX'], ['transpose', 'mirrorY']];

/** What a scenario sets: the branch (`ladderOnly`), its budget, and how likely each scripted outcome is. */
export function scenario(seed) {
  const r = streamFor(seed, 'scenario'), ladderOnly = r() < 0.4;
  const start = int(r, 1000, 2000);
  let tracedIn, roundedIn;
  if (ladderOnly) {
    // The ladder alone has the whole search: short, long (a second, loose pass), or about LOOSE_LEAST.
    const kind = r();
    roundedIn = kind < 0.45 ? int(r, 500, 89000) : kind < 0.8 ? int(r, 90000, 400000) : int(r, 86000, 94000);
    tracedIn = roundedIn;
  } else {
    tracedIn = int(r, 200, 40000);
    roundedIn = tracedIn + int(r, -3000, 90000);
  }
  return {
    seed,
    ladderOnly,
    part: ladderOnly ? pick(r, PARTS) : [0, 1],
    start,
    tracedIn,
    roundedIn,
    maps: (ladderOnly ? r() < 0.9 : r() < 0.5) ? {$id: 'maps'} : null,
    symmetry: pick(r, SYMMETRIES),
    rough: int(r, 0, 2),
    specks: r() < 0.3 ? 120 : 0,
    targetWidth: pick(r, [90, 100, 120]),
    resolution: pick(r, [200, 400]),
    geometry: r() < 0.5,
    traceNull: pick(r, [0, 0.15, 0.4]),
    traceThrow: pick(r, [0, 0.1]),
    why: pick(r, [0, 0.2, 0.5]),
    tipsEmpty: pick(r, [0.2, 0.6]),
    // How often a search finds a template the export takes, one it does not, a near miss only, no time.
    found: pick(
      r,
      ladderOnly
        ? [
            [0.02, 0.1, 0.6, 0.1],
            [0.1, 0.1, 0.5, 0.1],
            [0.3, 0.1, 0.4, 0.1]
          ]
        : [
            [0.05, 0.35, 0.35, 0.15],
            [0.3, 0.3, 0.2, 0.1],
            [0.6, 0.2, 0.1, 0.05],
            [0.8, 0.1, 0.05, 0.03],
            [0, 0.5, 0.3, 0.1]
          ]
    ),
    searchThrow: pick(r, [0, 0, 0.03]),
    repaired: pick(r, [0, 0.5]),
    // Only the searches move the clock, some to exactly a few seconds before the search's end: the time rules'
    // edges (ROUNDED_LEAST's `>=`) are then met exactly.
    still: r() < 0.3
  };
}

/** The trace of `exactTemplate` (engine.js's signature, its tools last) on the scenario of `seed`:
 * {calls, result}, plain data. */
export async function traceSchedule(exactTemplate, seed) {
  const sc = scenario(seed), calls = [], count = {};
  const streams = {};
  const r = kind => (streams[kind] ??= streamFor(seed, kind))(), of = kind => () => r(kind);
  const next = kind => (count[kind] = (count[kind] ?? 0) + 1) - 1;
  let clock = sc.start;
  const cfg = {width: 100, paperColors: ['#bd1111', '#ffffff'], progressGeometry: sc.geometry, maxImageError: 0.01};
  const cfgExact = {...cfg, symmetry: sc.symmetry};
  const target = {width: sc.targetWidth, curves: [], metadata: {}, sourceImage: {resolution: sc.resolution}};
  const onProgress = () => {};
  const sinks = [];
  // Which settings a call got: cfg or cfgExact themselves, else a copy of cfgExact with what it changes.
  const cfgName = c => {
    if (c === cfg) return 'cfg';
    if (c === cfgExact) return 'exact';
    const keys = [...new Set([...Object.keys(c), ...Object.keys(cfgExact)])].sort();
    return 'copy' + JSON.stringify(Object.fromEntries(keys.filter(k => c[k] !== cfgExact[k]).map(k => [k, c[k] ?? null])));
  };
  const id = value => (value && typeof value === 'object' ? (value.$id ?? '?') : (value ?? null));
  const assessment = (kind, n) => {
    const a = of('assess'), k = kind === 'pass' ? -1 : int(a, 0, 2);
    return {
      $id: `a${n}`,
      passes: k !== 0,
      features: k !== 1,
      maskError: k === 2 ? 0.02 : 0.004,
      issues: k === 0 ? [pick(a, ['short_self_clearance', 'crossing'])] : [],
      near: kind === 'pass' ? [0, 0, 0, int(a, 0, 2), 1, 30] : [1, int(a, 0, 2), int(a, 0, 3) / 10, int(a, 0, 2), 1, 30]
    };
  };
  // Each call as a line: what it was asked; what every call of its kind is asked alike (the settings, the
  // target, the progress callback, the one sink) only where it is not so, after a `!`.
  const odd = checks => {
    const off = Object.entries(checks).filter(([, ok]) => !ok).map(([what]) => what);
    return off.length ? ` !${off.join(',')}` : '';
  };
  const json = value => JSON.stringify(value)?.replace(/"/g, '');
  const tools = {
    now: () => clock,
    exactTarget(t, c, options) {
      const n = next('T');
      calls.push(`T ${json(options)}${odd({target: t === target, cfg: c === cfg})}`);
      if (!sc.still) clock += int(of('T'), 20, 200);
      const u = r('T');
      if (u < sc.traceThrow) throw new Error(`trace ${n} failed`);
      if (u < sc.traceThrow + sc.traceNull) return null;
      return {$id: `o${n}`, width: 400, curves: [], metadata: {nearTouch: 0.9}};
    },
    whyCannotStart(outline, c) {
      calls.push(`W ${id(outline)}${odd({cfg: c === cfg, scaled: outline.width === cfg.width})}`);
      if (!sc.still) clock += 5;
      if (r('W') >= sc.why) return null;
      return r('W') < 0.5 ? {code: UNEVEN, message: 'uneven'} : {code: null, message: `cannot ${id(outline)}`};
    },
    maskSpecks(source) {
      calls.push(`MS${odd({source: source === target.sourceImage})}`);
      return sc.specks;
    },
    maskRoughness(source) {
      calls.push(`MR${odd({source: source === target.sourceImage})}`);
      if (!sc.still) clock += 3;
      return sc.rough;
    },
    returnTips(outline, c) {
      calls.push(`R ${id(outline)}${odd({cfg: c === cfgExact})}`);
      if (!sc.still) clock += 10;
      const u = r('R');
      if (u < 0.05) throw new Error('no tips');
      if (u < 0.05 + sc.tipsEmpty) return [];
      return Array.from({length: int(of('R'), 1, 3)}, () => [int(of('R'), 0, 99), int(of('R'), 0, 99)]);
    },
    exactOutline(outline, c, mode, options) {
      calls.push(`O ${id(outline)} ${mode} ${json(options)}${odd({cfg: c === cfgExact})}`);
      if (!sc.still) clock += 15;
      if (r('O') < 0.05) throw new Error('no structure');
      return {st: {$id: `st-${id(outline)}`}, outline: {$id: `ol-${id(outline)}`}};
    },
    cheapBounds(st, outline) {
      calls.push(`B ${id(st)} ${id(outline)}`);
      if (!sc.still) clock += 5;
      if (r('B') < 0.05) throw new Error('no bound');
      return {lb: int(of('B'), 0, 12)};
    },
    async exactSearch(outline, template, c, options) {
      const n = next('S'), left = options.deadline - clock;
      if (options.sink && !sinks.includes(options.sink)) sinks.push(options.sink);
      const known = ['deadline', 'onProgress', 'symmetry', 'geometry', 'sink', 'reserve', 'maps', 'ladderOnly', 'phase'];
      const keys = Object.keys(options).filter(k => !known.includes(k) || options[k] === undefined);
      calls.push(
        `S ${id(outline)} ${cfgName(c)} ${left} ${options.reserve ?? '-'} ${json(options.symmetry)} ${id(options.maps)} ` +
          `${options.ladderOnly ?? '-'} ${options.phase ?? '-'}` +
          odd({
            template: template === null,
            geometry: options.geometry === cfg.progressGeometry,
            progress: options.onProgress === onProgress,
            sink: sinks.indexOf(options.sink) === 0,
            [`keys:${keys.join('+')}`]: !keys.length
          })
      );
      const u = r('S');
      if (u < sc.searchThrow) {
        clock += 100;
        throw new Error(`search ${n} crashed`);
      }
      const mode = r('S'), edge = sc.start + sc.roundedIn - 1000 * pick(of('S'), [6, 2, 10]);
      clock +=
        mode < 0.2
          ? int(of('S'), 50, 2000)
          : mode < 0.35 && edge > clock
            ? edge - clock
            : mode < 0.8
              ? Math.max(0, Math.round(left * (0.3 + 0.7 * r('S'))))
              : Math.max(0, Math.round(left)) + int(of('S'), 0, 3000);
      const v = r('S'), [pass, fail, none, idle] = sc.found;
      const kind = v < pass ? 'pass' : v < pass + fail ? 'fail' : v < pass + fail + none ? 'none' : v < pass + fail + none + idle ? 'idle' : 'error';
      if (kind === 'idle') return {found: null, report: {attempted: false, symmetry: options.symmetry, reason: 'no time left'}};
      const w = r('S');
      const search =
        w < 0.7
          ? {attempts: [{hidden: int(of('S'), 0, 6)}], ...(r('S') < 0.8 ? {bound: int(of('S'), 0, 6)} : {})}
          : w < 0.8
            ? {attempts: []}
            : undefined;
      const subgroup = options.symmetry?.length && r('S') < 0.15 ? {from: options.symmetry, to: options.symmetry.slice(1)} : null;
      const report = {
        n,
        symmetry: subgroup ? subgroup.to : options.symmetry,
        ...(search ? {search} : {}),
        ...(subgroup ? {subgroup} : {})
      };
      const near = () => ({solution: {$id: `n${n}`}, assessment: assessment(r('S') < 0.2 ? 'pass' : 'fail', `n${n}`), report: {n, near: 1}});
      if (kind === 'pass') return {found: {solution: {$id: `s${n}`}, assessment: assessment('pass', n)}, report};
      if (kind === 'fail')
        return {found: {solution: {$id: `s${n}`}, assessment: assessment('fail', n)}, report, ...(r('S') < 0.3 ? {near: near()} : {})};
      if (kind === 'none') return {found: null, ...(r('S') < 0.6 ? {near: near()} : {}), report: {...report, error: 'none'}};
      return {found: null, report: {...report, error: `error ${n}`}};
    },
    validate(solution, c, options) {
      calls.push(`V ${id(solution)} ${json(options)}${odd({cfg: c === cfgExact})}`);
      if (!sc.still) clock += 30;
      if (r('V') < 0.02) throw new Error('validate crashed');
      const point = () => [int(of('V'), 0, 99), int(of('V'), 0, 99)];
      return {
        issues: Array.from({length: int(of('V'), 0, 3)}, () => {
          const u = r('V');
          return u < 0.5
            ? {type: 'short_self_clearance', points: [point(), ...(r('V') < 0.5 ? [point()] : [])]}
            : u < 0.75
              ? {type: 'short_self_clearance'}
              : {type: 'inter_slit_clearance', points: [point()]};
        })
      };
    },
    returnRepaired(sink, c) {
      calls.push(`RR ${json(sink.map(f => f.report.n))}${odd({sink: sinks.indexOf(sink) === 0, cfg: c === cfgExact})}`);
      if (!sc.still) clock += int(of('RR'), 0, 4000);
      if (!sink.length || r('RR') >= sc.repaired) return null;
      const chosen = sink[Math.floor(r('RR') * sink.length)];
      return {
        ...chosen,
        found: {solution: {$id: `rep${chosen.report.n}`}, assessment: assessment('pass', `rep${chosen.report.n}`)},
        report: {...chosen.report, exactOutline: {$id: 'repaired'}, repairedReturns: true}
      };
    },
    noteError(where, error) {
      calls.push(`E ${where}: ${error?.message ?? error}`);
    }
  };
  let result;
  try {
    result = await exactTemplate(
      target,
      cfg,
      cfgExact,
      sc.symmetry,
      onProgress,
      {
        tracedEnd: sc.start + sc.tracedIn,
        roundedEnd: sc.start + sc.roundedIn,
        maps: sc.maps,
        ladderOnly: sc.ladderOnly,
        part: sc.part
      },
      tools
    );
  } catch (error) {
    result = {thrown: String(error?.message ?? error)};
  }
  // Stub objects by their ids; the rest as JSON has it (undefined dropped, key order kept).
  const plain = value =>
    JSON.parse(JSON.stringify(value, (key, v) => (v && typeof v === 'object' && Object.hasOwn(v, '$id') ? `$${v.$id}` : v)) ?? 'null');
  return {calls: plain(calls), result: plain(result)};
}

const TIES = [[], ['mirrorX'], ['mirrorX', 'mirrorY'], ['mirrorX', 'mirrorY', 'antiTranspose'], ['transpose', 'antiTranspose'], ['rotate180'], ['antiTranspose']];

/** What a scenario of one outline's search (exact/stage.js exactSearch) sets: its options, and how likely each
 * scripted outcome is. */
export function stageScenario(seed) {
  const r = streamFor(seed, 'stage'), maps = r() < 0.5 ? {$id: 'maps'} : null, ladderOnly = Boolean(maps) && r() < 0.6;
  const span = r();
  return {
    seed,
    symmetry: pick(r, TIES),
    nearTouch: pick(r, [0, 0.9]),
    template: r() < 0.3 ? {$id: 'template'} : null,
    start: int(r, 1000, 2000),
    seconds: span < 0.3 ? int(r, 500, 9000) : span < 0.7 ? int(r, 9000, 30000) : int(r, 30000, 120000),
    reserve: pick(r, [undefined, undefined, 0.5]),
    maps,
    ladderOnly,
    phase: ladderOnly ? pick(r, ['first', 'second', null]) : null,
    fallback: r() < 0.85 ? undefined : false,
    even: r() < 0.1 ? true : undefined,
    multi: pick(r, [undefined, true]),
    geometry: pick(r, [undefined, true]),
    // How often a search under ties finds the outline not symmetric enough, finds no template, the ladder one.
    notSymmetric: pick(r, [0, 0.4, 0.8]),
    noTemplate: pick(r, [0.2, 0.5]),
    ladderFound: pick(r, [0.1, 0.4]),
    passes: pick(r, [0.1, 0.4, 0.8]),
    still: r() < 0.3
  };
}

/** The trace of `exactSearch` (exact/stage.js's signature, its tools last) on the scenario of `seed`, its
 * collaborators scripted (STAGE_TOOLS): {calls, result}, plain data. Its own fallbacks run as they do, each a
 * call of itself, so they show in the calls their searches make. */
export async function traceExactSearch(exactSearch, seed) {
  const sc = stageScenario(seed), calls = [], count = {}, streams = {};
  const r = kind => (streams[kind] ??= streamFor(seed, kind))(), of = kind => () => r(kind);
  const next = kind => (count[kind] = (count[kind] ?? 0) + 1) - 1;
  let clock = sc.start;
  const cfg = {width: 100, maxImageError: 0.01}, onProgress = event => calls.push(`P ${event?.stage}`);
  const outline = {$id: 'outline', metadata: {nearTouch: sc.nearTouch}};
  const id = value =>
    value && typeof value === 'object'
      ? value.metadata
        ? `${value.$id}~${value.metadata.nearTouch}`
        : (value.$id ?? (value.positions instanceof Map ? 'empty' : '?'))
      : (value ?? null);
  const json = value => JSON.stringify(value)?.replace(/"/g, '');
  const odd = checks => {
    const off = Object.entries(checks).filter(([, ok]) => !ok).map(([what]) => what);
    return off.length ? ` !${off.join(',')}` : '';
  };
  const spend = (kind, seconds) => {
    const u = r(kind);
    if (u < 0.3) clock += int(of(kind), 10, 1500);
    else if (u < 0.9) clock += Math.max(0, Math.round(1000 * seconds * (0.2 + 0.8 * r(kind))));
    else clock += Math.max(0, Math.round(1000 * seconds)) + int(of(kind), 0, 3000);
  };
  const assessment = n => {
    const a = of('assessment'), passes = r('assessment') < sc.passes, k = passes ? -1 : int(a, 0, 2);
    return {
      $id: `as${n}`,
      passes: k !== 0,
      features: k !== 1,
      maskError: k === 2 ? 0.02 : int(a, 0, 9) / 1000,
      issues: k === 0 ? ['short_self_clearance'] : [],
      rank: [k === 0 ? 1 : 0, k === 0 ? 1 : 0, k === 1 ? 1 : 0, int(a, 0, 3), int(a, 0, 1), int(a, 0, 4), int(a, 20, 22)],
      near: [passes ? 0 : 1, int(a, 0, 2), int(a, 0, 3) / 10, int(a, 0, 3), int(a, 0, 4), 30]
    };
  };
  // How likely a search finds the outline not symmetric enough for its ties: less made symmetric (`even`), and
  // rarely untied (exactPositions failing: search.js).
  const asymmetric = (symmetry, exact) => (!symmetry.length ? 0.02 : exact.tied ? sc.notSymmetric / 3 : sc.notSymmetric);
  // A template's drawing and, sometimes, its redrawing in a few cubics (search.js).
  const drawn = (n, report) => ({
    solution: {$id: `d${n}`},
    ...(r('F') < 0.5 ? {refined: {$id: `d${n}r`}} : {}),
    report: {n, penalty: pick(of('F'), [0, 0, 0, 0.5, 2]), hidden: int(of('F'), 0, 8), ...report}
  });
  const tools = {
    now: () => clock,
    exactOutline(on, c, mode, options) {
      const n = next('X');
      calls.push(`X ${id(on)} ${mode} ${json(options)}${odd({cfg: c === cfg})}`);
      if (!sc.still) clock += 20;
      if (r('X') < 0.03) throw new Error('no structure');
      return {$id: `ex${n}`, tied: options.symmetry.length > 0};
    },
    async networkLadder(on, template, c, exact, options) {
      const n = next('L');
      const {seconds, symmetry, multi, geometry, refine, maps, alone, phase, onProgress: progress, ...rest} = options;
      calls.push(
        `L ${id(on)} ${id(exact)} ${seconds} ${json(symmetry)} ${multi} ${geometry} ${refine} ${id(maps)} ${alone} ${phase}` +
          odd({template: template === sc.template, cfg: c === cfg, progress: progress === onProgress, [`keys:${Object.keys(rest)}`]: !Object.keys(rest).length})
      );
      spend('L', seconds);
      if (r('L') < 0.03) throw new Error('ladder crashed');
      const rungs = [{k: 10, n}];
      if (r('L') < sc.ladderFound) return {found: drawn(`L${n}`, {ladder: 10}), rungs};
      const nearest = r('L') < 0.5 ? {solution: {$id: `ln${n}`}, assessment: assessment(`ln${n}`), report: {n, ladder: 30}} : null;
      const notSymmetric = r('L') < asymmetric(symmetry, exact);
      return {found: null, nearest, rungs, error: notSymmetric ? 'not symmetric' : 'none', code: notSymmetric ? NOT_SYMMETRIC : null};
    },
    async exactStart(exact, template, {deadline, ...rest}) {
      const n = next('ST');
      calls.push(`ST ${id(exact)} ${deadline - clock}${odd({template: template === sc.template, [`keys:${Object.keys(rest)}`]: !Object.keys(rest).length})}`);
      spend('ST', Math.max(0, (deadline - clock) / 1000));
      const u = r('ST');
      if (u < 0.03) throw new Error('start crashed');
      if (template && u < 0.5) return {how: 'template', witness: {$id: `w${n}`}};
      if (u < 0.75) return {how: 'topology', witness: {$id: `w${n}`}};
      return {error: 'timed out'};
    },
    async exactFromTemplate(on, template, c, options) {
      const n = next('F');
      const {multi, seconds, symmetry, exact, witness, onProgress: progress, geometry, refine, spacing, neighbours, ...rest} = options;
      calls.push(
        `F ${id(on)} ${id(exact)} ${seconds} ${json(symmetry)} ${spacing ?? '-'} ${neighbours ?? '-'} ${id(witness)} ${multi} ` +
          `${geometry} ${refine}` +
          odd({template: template === sc.template, cfg: c === cfg, progress: progress === onProgress, [`keys:${Object.keys(rest)}`]: !Object.keys(rest).length})
      );
      spend('F', seconds);
      const u = r('F');
      if (u < 0.03) throw new Error('model crashed');
      if (u < 0.03 + asymmetric(symmetry, exact))
        return {error: 'not symmetric', code: NOT_SYMMETRIC, report: {n}};
      if (r('F') < sc.noTemplate) return {error: NO_TEMPLATE, report: {n}};
      if (r('F') < 0.05) return {error: 'model failed', report: {n}};
      return drawn(n, r('F') < 0.7 ? {bound: int(of('F'), 0, 8)} : {});
    },
    assess(solution) {
      const n = next('A');
      calls.push(`A ${id(solution)}`);
      if (!sc.still) clock += 40;
      if (r('A') < 0.02) throw new Error('assess crashed');
      return assessment(n);
    },
    noteError(where, error) {
      calls.push(`E ${where}: ${error?.message ?? error}`);
    }
  };
  const options = {
    deadline: sc.start + sc.seconds,
    onProgress,
    symmetry: sc.symmetry,
    ...Object.fromEntries(
      Object.entries({
        reserve: sc.reserve,
        maps: sc.maps,
        ladderOnly: sc.ladderOnly || undefined,
        phase: sc.phase ?? undefined,
        fallback: sc.fallback,
        even: sc.even,
        multi: sc.multi,
        geometry: sc.geometry
      }).filter(([, v]) => v !== undefined)
    )
  };
  let result;
  try {
    result = await exactSearch(outline, sc.template, cfg, options, tools);
  } catch (error) {
    result = {thrown: String(error?.message ?? error)};
  }
  const plain = value =>
    JSON.parse(JSON.stringify(value, (key, v) => (v && typeof v === 'object' && Object.hasOwn(v, '$id') ? `$${v.$id}` : v)) ?? 'null');
  return {calls, result: plain(result)};
}
