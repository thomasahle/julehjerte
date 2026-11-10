/** The exact search's schedule for a picture in Mal: what it tries, in what order, with what share of its time
 * (engine.js design and exactTemplate, exact/stage.js exactSearch and networkLadder). Times are seconds of the
 * standard minute, which a longer limit stretches (timeScale). The measurements behind a value are in
 * docs/inverse/SEARCH-CONSTANTS.md, where it names a section. */

// A design's minute (engine.js design).

/** The most seconds a design with the exact search takes, fitter included. */
export const EXACT_SECONDS = 60;
/** The last seconds of a design's, kept for the final checks and the export. */
export const EXACT_FINISH_SECONDS = 10;
/** How many minutes' worth of stages a time limit buys: the stages below are written for the standard minute and
 * grow in proportion with a longer limit (the visitor's choice, Avanceret), never shrink with a shorter one. */
export const timeScale = limit => Math.max(1, limit / EXACT_SECONDS);
// In a picture's minute the exact search has the traced outline until TRACED_SECONDS, then (its template failing)
// the outline with tips rounded until ROUNDED_SECONDS: most traced outlines that pass do so within 20 s, and a
// rounded outline hides more cut and lies further from the mask, so it comes second. The fitter has what is left.
/** Until when the traced outline is searched.
 * (history: docs/inverse/SEARCH-CONSTANTS.md#traced-seconds) */
export const TRACED_SECONDS = 22;
/** Until when the outlines after it (tips rounded, moved off the outer strip) are.
 * (history: docs/inverse/SEARCH-CONSTANTS.md#traced-seconds) */
export const ROUNDED_SECONDS = 40;
/** Until when the traced outline is searched alone (`exactRoute: 'exact'`, the fitter in a worker beside it);
 * the rounded ones have the rest. (history: docs/inverse/SEARCH-CONSTANTS.md#traced-seconds) */
export const ALONE_TRACED_SECONDS = 30;
/** The fitter's seconds beside the exact search (`exactRoute: 'fitter'`): what it had when it came first, which
 * photographs need to keep their details. */
export const FITTER_SECONDS = 45;

// Today's search after the traced outline (engine.js exactTemplate).

/** The least seconds an outline after the traced one is searched for.
 * (history: docs/inverse/SEARCH-CONSTANTS.md#traced-seconds) */
export const ROUNDED_LEAST = 6;
/** The least seconds for the outline with returning tips rounded, once a passing template has some (else as long
 * as the traced outline's search took). (history: docs/inverse/SEARCH-CONSTANTS.md#traced-seconds) */
export const RETURNS_LEAST = 10;
/** How far (mm) a tip is rounded: the mask opened by as many pixels.
 * (history: docs/inverse/SEARCH-CONSTANTS.md#traced-seconds) */
export const TIP_ROUNDING_MM = 0.8;
/** Within how many mm of the spots (where a template comes too close to itself, or back to itself) tips are
 * rounded when only those are. (history: docs/inverse/SEARCH-CONSTANTS.md#traced-seconds) */
export const TIP_SPOT_MM = 4;
/** The most seconds the last resort repairs a rejected template's returns for.
 * (history: docs/inverse/SEARCH-CONSTANTS.md#return-repair) */
export const RETURN_REPAIR_SECONDS = 4;
/** How many rejected templates the last resort repairs, at most.
 * (history: docs/inverse/SEARCH-CONSTANTS.md#return-repair) */
export const RETURN_REPAIR_TRIES = 2;

// The network's ladder alone over several outlines (engine.js exactTemplate, `ladderOnly`).

/** The share of a pass's time its first phase (the cheap rungs on every outline) has.
 * (history: docs/inverse/SEARCH-CONSTANTS.md#ladder-outlines) */
export const LADDER_FIRST_SHARE = 0.5;
/** How many times the traced outline counts in the first phase of one ladder over every outline: a third of it
 * with five outlines, as the part with it has of two ladders, so its rungs to K300 fit there.
 * (history: docs/inverse/SEARCH-CONSTANTS.md#traced-first-weight) */
export const TRACED_FIRST_WEIGHT = 2;
/** The least seconds left in a phase for another outline's search. */
export const LADDER_LEAST = 2;
/** The seconds each of the ladder's searches keeps back from its deadline (exactSearch's `reserve`). */
export const LADDER_RESERVE = 0.5;
// With more than LOOSE_LEAST seconds (a longer search chosen under Avanceret), once the ladder has had what the
// one-minute search gives it (STRICT_SECONDS, or a third), the rest goes through it again with the model's
// clearances LOOSE_MM lower, judged by the export's own (the 0.1 mm it tolerates). Not sooner: lowered from the
// start, some templates' returns fail once smoothed.
/** The least seconds of a search with a second, loose pass. (history: docs/inverse/SEARCH-CONSTANTS.md#loose) */
export const LOOSE_LEAST = 90;
/** How much (mm) the loose pass lowers the model's clearances (its `modelTolerance`).
 * (history: docs/inverse/SEARCH-CONSTANTS.md#loose) */
export const LOOSE_MM = 0.05;
/** The strict pass's seconds before the loose one, a third of the search where that is more.
 * (history: docs/inverse/SEARCH-CONSTANTS.md#loose) */
export const STRICT_SECONDS = 50;

// One outline's search (exact/stage.js exactSearch).

/** The most seconds the search for a start takes. (history: docs/inverse/SEARCH-CONSTANTS.md#start-seconds) */
export const START_SECONDS = 3;
/** Under ties, the share of the search's time the fine grid from no start gets first, if at least BARE_FLOOR
 * seconds are left; the coarse grid after its template, if COARSE_AFTER_BARE are.
 * (history: docs/inverse/SEARCH-CONSTANTS.md#bare) */
export const BARE_SHARE = 0.5, BARE_FLOOR = 8, COARSE_AFTER_BARE = 4;
/** The seconds a search under part of the requested symmetry needs at least, once none keeps all of it.
 * (history: docs/inverse/SEARCH-CONSTANTS.md#turns-floor) */
export const TURNS_FLOOR = 6;

// The network's ladder (exact/stage.js networkLadder).

/** Its rungs beside today's search, as [K, seconds]. (history: docs/inverse/SEARCH-CONSTANTS.md#network-ladder) */
export const LADDER = [[10, 2], [30, 2], [100, 3], [300, 4]];
/** The most of a search's time it takes beside today's search.
 * (history: docs/inverse/SEARCH-CONSTANTS.md#network-ladder) */
export const LADDER_SHARE = 0.25;
/** The most seconds of the ladder's time its first rung may take to build the candidates every rung reuses
 * (venus's 420 positions take more than a rung's share). (history: docs/inverse/SEARCH-CONSTANTS.md#network-ladder) */
export const LADDER_BUILD = 8;
/** How many sampled rankings of the maps a rung tries alone after the plain one.
 * (history: docs/inverse/SEARCH-CONSTANTS.md#ladder-samples) */
export const LADDER_SAMPLES = 2;
/** Its rungs alone: K, the plain ranking's seconds, a sampled one's.
 * (history: docs/inverse/SEARCH-CONSTANTS.md#ladder-samples) */
export const LADDER_ALONE = [[10, 3, 2], [30, 4, 2], [100, 6, 3], [300, 10, 4], [1000, 15, 10]];
/** Its rungs alone over several outlines, as LADDER_ALONE's: the first phase's (cheap) and the second's (long).
 * (history: docs/inverse/SEARCH-CONSTANTS.md#first-order) */
export const LADDER_FIRST = [[10, 2, 1], [30, 2, 1], [100, 3, 2], [300, 6, 3]],
  LADDER_SECOND = [[300, 10, 4], [1000, 15, 10]];
/** The first phase's rungs as [K, ranking] (0 the plain one, then the samples): the plain K300 after the cheap
 * ones, before K100's and K300's samples. (history: docs/inverse/SEARCH-CONSTANTS.md#first-order) */
export const FIRST_ORDER = [
  [10, 0], [10, 1], [30, 0], [10, 2], [30, 1], [100, 0], [300, 0], [100, 1], [30, 2], [100, 2], [300, 1], [300, 2]
];

/** The ladder's rungs alone (`phase` from engine.js, or none: LADDER_ALONE), as [K, seconds, seed]. */
export function ladderRungs(phase) {
  if (phase === 'first')
    return FIRST_ORDER.map(([k, seed]) => {
      const [, plain, sample] = LADDER_FIRST.find(([K]) => K === k);
      return [k, seed ? sample : plain, seed];
    });
  const rungs = [];
  for (const [k, plain, sample] of phase === 'second' ? LADDER_SECOND : LADDER_ALONE)
    for (let seed = 0; seed <= LADDER_SAMPLES; seed++) rungs.push([k, seed ? sample : plain, seed]);
  return rungs;
}

// The outlines searched (engine.js exactTemplate).

/** The outlines the exact search goes on to after the one traced from the mask, each as the way to trace it
 * (engine.js traceAt's options), or none: from the tips' rounding `radius` in the mask's pixels, its `px` a mm, the
 * traced outline's `way`, and the `spots` to round near. */
export const OUTLINES = {
  /** Its tips rounded by TIP_ROUNDING_MM, only within TIP_SPOT_MM of the spots (where its template comes too
   * close to itself, or it comes back to itself): sharp corners elsewhere stay sharp (5star, triple-heart). */
  near: ({radius, px}, spots) => (spots.length ? {open: radius, spots, within: TIP_SPOT_MM * px} : null),
  /** Its tips rounded everywhere (fisk-kors-shot). */
  everywhere: ({radius}) => ({open: radius}),
  /** Its tips rounded everywhere, twice as much (mor-og-barn: a template 0.52% from its mask in 4 s, where
   * 0.8 mm left its chin and its child's nose closer than a slit may come). */
  wider: ({radius}) => ({open: 2 * radius, wider: true}),
  /** Moved off the paper's sides where it runs closer to one than the outer strip may be wide (border.js
   * outerStripBand), opened as the traced one was. An outline running so close without reaching the side has no
   * template keeping the rules (balls' circles 2.14 mm from the edge, against 2.5); most pictures have none. */
  outerStrip: ({way}) => ({open: way.open, outerStrip: true})
};

/** The ladder alone's outlines after the traced one, in order, the spots its tips that come back to themselves.
 * (history: docs/inverse/SEARCH-CONSTANTS.md#ladder-outlines) */
export const LADDER_OUTLINES = ['near', 'everywhere', 'wider', 'outerStrip'];
