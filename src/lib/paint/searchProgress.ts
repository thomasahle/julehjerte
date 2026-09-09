/**
 * What the engine is doing right now, folded out of its progress events —
 * docs/redesign/PAINT.md §2 ("mens der søges") and §12.
 *
 * The engine reports a great deal per event and none of it is a summary: the
 * count search announces every grid seed it scored, the refiner sends a
 * checkpoint every forty steps with the error it is down to, and the MILP route
 * sends a round, a gap and whether it has a validated incumbent. Turning that
 * stream into the handful of numbers a panel can show is arithmetic with a
 * memory — which attempt is running, what the error was one checkpoint ago —
 * so it is a reducer here rather than a pile of `$state` in the page: it can be
 * fed a recorded solve and checked, and the panel keeps no state of its own.
 *
 * Everything is read defensively. `fit.js` sends a bare `{stage}` at the start
 * of each phase and the full record at each checkpoint, an old engine may send
 * neither, and a stage nobody has words for still has to leave the panel
 * saying something true.
 */

import type { EngineProgress } from '$lib/inverse/engine';
import type { CutGeometry } from '$lib/inverse/toHeartDesign';

/**
 * A stage the panel has words for, or `'working'` for one it has not.
 *
 * A closed set on purpose: the panel prints a translated sentence, so a stage
 * name that arrives without one must land on the general phrase rather than on
 * the engine's own camel-cased English.
 */
export type StageKey =
	| 'preprocessing'
	| 'directInitializing'
	| 'directFitting'
	| 'directClearance'
	| 'directRefining'
	| 'directSharing'
	| 'directPolishing'
	| 'directMatching'
	| 'graph'
	| 'connectors'
	| 'model'
	| 'solving'
	| 'validating'
	| 'rounding'
	| 'paper'
	| 'tolerances'
	| 'exporting'
	| 'working';

const STAGE_KEYS: readonly StageKey[] = [
	'preprocessing',
	'directInitializing',
	'directFitting',
	'directClearance',
	'directRefining',
	'directSharing',
	'directPolishing',
	'directMatching',
	'graph',
	'connectors',
	'model',
	'solving',
	'validating',
	'rounding',
	'paper',
	'tolerances',
	'exporting'
];

/**
 * The stages during which the fitter is working on one particular seed.
 *
 * One name, because one name is all the engine attaches counts and an error to:
 * `refineCurves`'s checkpoint record is forwarded as `{stage:'directRefining',
 * counts, ...rec}` (`fit.js`), and every other `direct*` stage is posted by the
 * bare `stage()` helper, which sends the name and nothing else. 'directFitting'
 * was in this list for a while and could never fire.
 */
const RUNNING_STAGES: readonly string[] = ['directRefining'];

/**
 * Stages that leave the refinement where it was.
 *
 * Everything else ends it: the loop's clearance belongs to the seed about to be
 * refined and the seed announcements all come before any refinement, but
 * sharing, polishing, the paper check and the matching search are about the
 * winner, and none of them measures the mask error again. So when one of those
 * arrives the running attempt is finished and the live number is stale — see
 * `reduceProgress`.
 */
const CONTINUES_ATTEMPT: readonly string[] = ['directClearance', 'directInitializing'];

/** Every stage the direct fitter emits; seeing one settles the route. */
const FITTER_STAGES: readonly string[] = [
	'directInitializing',
	'directFitting',
	'directClearance',
	'directRefining',
	'directSharing',
	'directPolishing',
	'directMatching'
];

/**
 * Stages only the MILP route emits.
 *
 * 'graph' and 'validating' are deliberately not here. `automatic.js` runs the
 * traced route first and the fitter after it, so the route has to be allowed to
 * move — but the fitter itself builds a graph and validates inside feature
 * recovery, and those are its own business, not a second route.
 */
const MILP_STAGES: readonly string[] = ['model', 'solving'];

/**
 * How each grid seed is getting on.
 *
 * 'waiting' is "announced but not reached", not "queued": the count search
 * scores and announces every pair it considered, and `gridFinalists` then hands
 * the refiner three of them, so most of a long list is never tried at all. The
 * panel's word for it says that much and no more.
 */
export type AttemptState = 'done' | 'running' | 'waiting';

/** One strip-count pair the fitter announced, and what became of it. */
export type Attempt = {
	counts: [number, number];
	/** The last error the refiner measured for it, or null until it has run. */
	error: number | null;
	state: AttemptState;
};

/** Which way the error has moved since the last checkpoint of this attempt. */
export type ErrorTrend = 'falling' | 'flat' | 'rising';

export type SearchProgress = {
	stage: StageKey;
	/** The strip counts being tried now, `[A, B]`, or null before there are any. */
	counts: [number, number] | null;
	/**
	 * The refiner's own rough measure of the candidate under the gradient, 0…1 —
	 * null when nothing is being refined.
	 *
	 * Not the number the answer prints, and the panel must not word it as if it
	 * were. This is `mismatch(renderCurves(…), prob)` from `refine.js`: the
	 * candidate against the symmetry-averaged target at the fitting resolution
	 * (256 at most), over every cell of the square, before simplification and
	 * before our own symmetry correction. The answer's "forskel fra masken" is
	 * measured on the converted heart that is about to be drawn. Measured on Uret
	 * v2 the two differ by about a factor of two, the live one being the rosier —
	 * so it goes as soon as the refinement it describes is over, rather than
	 * standing through the two stages that improve the answer without reporting
	 * an error at all.
	 */
	error: number | null;
	errorTrend: ErrorTrend | null;
	attempts: Attempt[];
	/** MILP only: the cutting-plane round. */
	round: number | null;
	/** MILP only: relative distance to the best possible answer, 0…1. */
	gap: number | null;
	/** MILP only: whether a validated candidate is already in hand. */
	incumbent: boolean;
	route: 'fitter' | 'milp' | null;
};

/** Nothing has been heard from the engine yet. */
export const IDLE_PROGRESS: SearchProgress = {
	stage: 'working',
	counts: null,
	error: null,
	errorTrend: null,
	attempts: [],
	round: null,
	gap: null,
	incumbent: false,
	route: null
};

/**
 * Below this the error counts as unchanged.
 *
 * One unit of the last digit the panel prints. The line reads "afvigelse 0,8 %
 * og faldende", so the word has to be about the number beside it: measured on
 * Uret v2's own search, a finer threshold had the word alternating between
 * faldende, stigende and stabil once a second under a number that stayed at
 * 0,8 % throughout — three claims a second, none of which the visitor could
 * check. At one decimal of a percent, "faldende" means the number they are
 * looking at is on its way down.
 */
export const TREND_EPSILON = 1e-3;

/** At most four candidate conversions a second (PAINT.md §12 (a)). */
export const GEOMETRY_INTERVAL_MS = 250;

function stageKey(stage: unknown): StageKey {
	return typeof stage === 'string' && (STAGE_KEYS as readonly string[]).includes(stage)
		? (stage as StageKey)
		: 'working';
}

/** A pair of strip counts, or null for anything that is not one. */
function countsOf(event: EngineProgress): [number, number] | null {
	const counts = event.counts;
	if (!Array.isArray(counts) || counts.length !== 2) return null;
	const [a, b] = counts;
	return Number.isFinite(a) && Number.isFinite(b) ? [a, b] : null;
}

function numberOf(value: unknown): number | null {
	return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function same(a: [number, number], b: [number, number]): boolean {
	return a[0] === b[0] && a[1] === b[1];
}

function trend(previous: number | null, next: number): ErrorTrend | null {
	if (previous === null) return null;
	const delta = next - previous;
	if (Math.abs(delta) < TREND_EPSILON) return 'flat';
	return delta < 0 ? 'falling' : 'rising';
}

/**
 * The candidate's cuts, when a progress event carries them.
 *
 * `geometry` on a refinement checkpoint is a boolean today — `check.passed`,
 * the validity flag — and PAINT.md §12 (a) asks the engine to send the current
 * candidate's `heartcurves-2` solution under the same name instead. The two are
 * told apart by type and nothing else: a boolean is the flag, an object or a
 * JSON string is geometry. This is the one place that decides, so the day the
 * engine changes, the UI changes nowhere.
 */
export function candidateGeometry(event: EngineProgress): string | CutGeometry | null {
	const geometry = event.geometry;
	if (typeof geometry === 'string') return geometry.trim() ? geometry : null;
	// `typeof null` is 'object', and an array is not a solution either.
	if (!geometry || typeof geometry !== 'object' || Array.isArray(geometry)) return null;
	return geometry as unknown as CutGeometry;
}

/**
 * One event, folded into the picture the panel draws.
 *
 * Pure: the same state and event always give the same answer, and the state is
 * replaced rather than mutated so a component can hold it in `$state.raw`.
 */
export function reduceProgress(state: SearchProgress, event: EngineProgress): SearchProgress {
	const stage = stageKey(event.stage);
	const raw = typeof event.stage === 'string' ? event.stage : '';
	const counts = countsOf(event);
	const error = numberOf(event.error);

	// The route, once the fitter has spoken, stays the fitter's: `automatic.js`
	// may try the traced route first and fall back, but the fitter never falls
	// back to the MILP — the graph and the solver it reaches for inside feature
	// recovery are steps of its own search.
	const route: SearchProgress['route'] =
		state.route === 'fitter'
			? 'fitter'
			: FITTER_STAGES.includes(raw)
				? 'fitter'
				: MILP_STAGES.includes(raw)
					? 'milp'
					: state.route;

	let attempts = state.attempts;
	let current = state.counts;
	let nextError = state.error;
	let nextTrend = state.errorTrend;

	if (raw === 'directInitializing' && counts) {
		// A seed the count search scored. It is announced before anything runs, so
		// it goes in as waiting, and its own error is deliberately dropped: that
		// number is the mismatch of an *unrefined* uniform grid at 64 cells a side
		// (`countHypotheses`), which is neither the refiner's number above it in
		// the panel nor the answer's, and a column of percentages that mean three
		// different things is worse than a column with a gap in it.
		//
		// The same pair arrives more than once — the count search scores each pair
		// at both phases, and the star's own recorded run announces every pair
		// twice — and an attempt is one pair, because a phase is not something the
		// panel could say anything useful about.
		if (!attempts.some((a) => same(a.counts, counts))) {
			attempts = [...attempts, { counts, error: null, state: 'waiting' as const }];
		}
	} else if (counts && RUNNING_STAGES.includes(raw)) {
		// The fitter has moved on to this seed. Whatever was running is done with
		// the last error it reported; a seed the initializer never announced (the
		// topology and feature-recovery routes reach refinement on their own) is
		// added here rather than hidden, because the panel must show what has been
		// seen and nothing else.
		const running = attempts.findIndex((a) => a.state === 'running');
		const at = attempts.findIndex((a) => same(a.counts, counts));
		if (at !== running || at === -1) {
			attempts = attempts.map((a, i) =>
				i === running ? { ...a, state: 'done' as const } : i === at ? { ...a, state: 'running' as const } : a
			);
			if (at === -1) attempts = [...attempts, { counts, error, state: 'running' as const }];
			// A different attempt: its error is not comparable with the last one's,
			// so the trend starts again rather than reporting a jump between seeds.
			nextTrend = null;
			nextError = null;
		}
		current = counts;
	} else if (!RUNNING_STAGES.includes(raw) && !CONTINUES_ATTEMPT.includes(raw)) {
		// The refinement is over. `fit.js` breaks out of its loop the moment a
		// candidate passes, so nothing else ever marks the winner finished, and the
		// panel used to say "4 + 4 · 0,8 % · i gang" through sharing, polishing,
		// the paper check and the export — a claim about the present that had
		// stopped being true a stage ago. The counts stay, because those really are
		// the winner's; the error goes, because the stages that follow improve the
		// answer without measuring it again (see `SearchProgress.error`).
		if (attempts.some((a) => a.state === 'running')) {
			attempts = attempts.map((a) => (a.state === 'running' ? { ...a, state: 'done' as const } : a));
		}
		nextError = null;
		nextTrend = null;
	}

	if (error !== null && RUNNING_STAGES.includes(raw)) {
		nextTrend = trend(nextError, error);
		nextError = error;
		attempts = attempts.map((a) => (a.state === 'running' ? { ...a, error } : a));
	}

	let { round, gap, incumbent } = state;
	if (raw === 'solving') {
		const nextRound = numberOf(event.round);
		if (nextRound !== null && nextRound !== round) {
			round = nextRound;
			// The gap belongs to the round that produced it; a new round starts with
			// nothing measured rather than with the last round's number standing.
			gap = null;
		}
		const nextGap = numberOf(event.gap);
		if (nextGap !== null) gap = nextGap;
		if (typeof event.validatedIncumbent === 'boolean') incumbent = event.validatedIncumbent;
	}

	return {
		stage,
		counts: current,
		error: nextError,
		errorTrend: nextTrend,
		attempts,
		round,
		gap,
		incumbent,
		route
	};
}

/** The whole of a recorded run, for tests and for the fixture. */
export function reduceAll(events: EngineProgress[], from: SearchProgress = IDLE_PROGRESS) {
	return events.reduce(reduceProgress, from);
}

/** What `createGeometryThrottle` needs from its surroundings, so a test can supply it. */
export type ThrottleClock = {
	now: () => number;
	schedule: (run: () => void, ms: number) => unknown;
	cancel: (handle: unknown) => void;
};

const REAL_CLOCK: ThrottleClock = {
	now: () => (typeof performance === 'undefined' ? Date.now() : performance.now()),
	schedule: (run, ms) => setTimeout(run, ms),
	cancel: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>)
};

/**
 * A gate that passes at most one value every `intervalMs`, and always the
 * latest one.
 *
 * Converting a candidate is a full `cutGeometryToDesign` — simplification,
 * normalisation, a rasterised symmetry comparison where one is asked for — so
 * it must not run once per checkpoint on a fast machine. Leading edge, so the
 * first candidate appears at once; trailing edge, so the last one of a burst is
 * the one left on screen rather than a stale frame from the middle of it.
 *
 * `stop()` drops anything still waiting: the search is over, and a candidate
 * arriving after the answer would replace the answer.
 */
export function createGeometryThrottle<T>(
	emit: (value: T) => void,
	intervalMs = GEOMETRY_INTERVAL_MS,
	clock: ThrottleClock = REAL_CLOCK
) {
	let last = -Infinity;
	let pending: { value: T } | null = null;
	let handle: unknown = null;

	const flush = () => {
		handle = null;
		if (!pending) return;
		const { value } = pending;
		pending = null;
		last = clock.now();
		emit(value);
	};

	return {
		push(value: T): void {
			const now = clock.now();
			const wait = intervalMs - (now - last);
			pending = { value };
			if (wait <= 0) {
				if (handle !== null) clock.cancel(handle);
				flush();
			} else if (handle === null) {
				handle = clock.schedule(flush, wait);
			}
		},
		stop(): void {
			if (handle !== null) clock.cancel(handle);
			handle = null;
			pending = null;
			last = -Infinity;
		}
	};
}
