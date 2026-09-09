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

/** The stages during which the fitter is working on one particular seed. */
const RUNNING_STAGES: readonly string[] = ['directFitting', 'directRefining'];

/** Every stage the direct fitter emits; seeing one settles the route. */
const FITTER_STAGES: readonly string[] = [
	'directInitializing',
	'directFitting',
	'directClearance',
	'directRefining',
	'directSharing',
	'directPolishing'
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

/** How each grid seed is getting on. */
export type AttemptState = 'done' | 'running' | 'waiting';

/** One strip-count pair the fitter announced, and what became of it. */
export type Attempt = {
	counts: [number, number];
	/** The last error measured for it, or null while it has only been announced. */
	error: number | null;
	state: AttemptState;
};

/** Which way the error has moved since the last checkpoint of this attempt. */
export type ErrorTrend = 'falling' | 'flat' | 'rising';

export type SearchProgress = {
	stage: StageKey;
	/** The strip counts being tried now, `[A, B]`, or null before there are any. */
	counts: [number, number] | null;
	/** Share of the square the current candidate gets wrong, 0…1. */
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
 * The panel prints one decimal of a percent, so a move of 0.0001 of the square
 * is the smallest one that shows on screen. Calling anything under it "falling"
 * would put a word on the panel that the number beside it contradicts.
 */
export const TREND_EPSILON = 1e-4;

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
		// it goes in as waiting.
		//
		// The same pair arrives more than once — the count search scores each pair
		// at both phases, and the star's own recorded run announces every pair
		// twice — and an attempt is one pair (a phase is not something the panel
		// could say anything useful about). The pair keeps the *better* of its seed
		// errors, because that is the one the fitter carries forward: `gridFinalists`
		// ranks the finalists by error, so the worse phase is not what will be tried.
		const at = attempts.findIndex((a) => same(a.counts, counts));
		attempts =
			at === -1
				? [...attempts, { counts, error, state: 'waiting' as const }]
				: attempts.map((a, i) =>
						i === at
							? { ...a, error: a.error === null || error === null ? (error ?? a.error) : Math.min(a.error, error) }
							: a
					);
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
