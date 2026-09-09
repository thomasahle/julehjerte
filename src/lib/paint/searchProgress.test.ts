/**
 * The live-search reducer, against a real solve.
 *
 * The shapes the engine sends are undocumented and easy to guess wrong — the
 * same stage name arrives twice with different fields, `directInitializing`
 * both bare and with counts, `solving` both from the round loop and from the
 * MILP's logging callback. So the fixture beside this file is not written by
 * hand: it is every progress event of one real search for the star's cuts,
 * recorded by the capture below and committed. The reducer is then checked
 * against it, which is the only way to know it survives what the engine
 * actually does rather than what this file assumes.
 *
 * ## Re-recording the fixture
 *
 *     CAPTURE_PROGRESS=1 npx vitest run src/lib/paint/searchProgress.test.ts
 *
 * It runs the engine's own `design()` for up to three minutes, so it is off in
 * the ordinary run; everything else here reads the committed JSON.
 */
import { describe, expect, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import {
	candidateGeometry,
	createGeometryThrottle,
	IDLE_PROGRESS,
	reduceAll,
	reduceProgress,
	TREND_EPSILON,
	type SearchProgress,
	type ThrottleClock
} from './searchProgress';
import { maskPrepareSettings, maskToPixels, solveSettings } from '$lib/inverse/engine';
import type { EngineProgress } from '$lib/inverse/engine';
import { cutGeometryToDesign, type CutGeometry } from '$lib/inverse/toHeartDesign';
import { MASK_SIZE, type Mask } from './mask';
import { NO_SYMMETRY } from './symmetry';
// The engine as shipped, through the alias that keeps `svelte-check` out of it
// (see src/lib/inverse/engine-modules.d.ts).
import { design, prepare } from '$inverse/core/engine.js';
import { loadSolutionJSON } from '$inverse/core/graph.js';
import { sampleWeave } from '$inverse/core/validate.js';
import starSolution from '../../../static/inverse/examples/star.saved.json';
import recorded from './fixtures/starProgress.json';

const COLORS = { left: '#ffffff', right: '#b91313' };

const FIXTURE_PATH = 'src/lib/paint/fixtures/starProgress.json';

/** The star's own woven square, which is the mask a visitor gets from "Prøv stjernen". */
function starMask(): Mask {
	const cells = sampleWeave(loadSolutionJSON(starSolution), MASK_SIZE);
	return { size: MASK_SIZE, data: Uint8Array.from(cells) };
}

const events = recorded as unknown as EngineProgress[];

describe.runIf(process.env.CAPTURE_PROGRESS)('recording a solve', () => {
	it('writes every progress event of a search for the star', { timeout: 400_000 }, async () => {
		const mask = starMask();
		const prepared = prepare(maskToPixels(mask, COLORS), maskPrepareSettings(COLORS));
		const captured: unknown[] = [];
		await design(
			prepared.target,
			solveSettings({ colors: COLORS, symmetry: { ...NO_SYMMETRY } }),
			(event) => captured.push(event)
		);
		expect(captured.length).toBeGreaterThan(10);
		// A path from the project root, which is vitest's own working directory:
		// `import.meta.url` is not a file URL once the module has been transformed.
		writeFileSync(FIXTURE_PATH, JSON.stringify(captured, null, 1) + '\n');
	});
});

describe('the recorded solve', () => {
	it('is a real stream: bare stages, scored seeds and refinement checkpoints', () => {
		const stages = new Set(events.map((e) => e.stage));
		expect(stages.has('directInitializing')).toBe(true);
		expect(stages.has('directRefining')).toBe(true);
		// The bare `{stage}` the engine sends at the start of a phase, which is
		// what makes every field optional in `EngineProgress`.
		expect(events.some((e) => Object.keys(e).length === 1)).toBe(true);
		// And the full checkpoint record, with the fields the panel prints.
		expect(
			events.some((e) => e.stage === 'directRefining' && typeof e.error === 'number' && e.counts)
		).toBe(true);
	});

	it('is folded into one picture of the search', () => {
		const state = reduceAll(events);
		// Eight pairs announced, each once however many times the engine scored it,
		// in the order the count search ranked them; three of them were refined and
		// the rest never came up before the answer was good enough.
		expect(state.attempts.map((a) => a.counts)).toEqual([
			[4, 4],
			[5, 5],
			[6, 6],
			[8, 8],
			[7, 7],
			[3, 3],
			[2, 2],
			[1, 1]
		]);
		expect(state.attempts.map((a) => a.state)).toEqual([
			'done',
			'done',
			'running',
			'waiting',
			'waiting',
			'waiting',
			'waiting',
			'waiting'
		]);
		// Each finished attempt keeps the last error it reached, not its seed error.
		expect(state.attempts[0].error!).toBeLessThan(0.08);
		expect(state.counts).toEqual([6, 6]);
		expect(state.error!).toBeGreaterThan(0);
		expect(state.error!).toBeLessThan(0.05);
	});

	it('stays with the fitter through the graph and the model inside it', () => {
		// The recorded run has 'connectors', 'model' and 'solving' in the middle of
		// it: that is `recoverImageFeatures` routing through the MILP *inside* the
		// direct fit, not the automatic route falling back to it. Reading those as
		// a change of route would put the MILP's face on the panel mid-search.
		expect(events.map((e) => e.stage)).toContain('model');
		expect(reduceAll(events).route).toBe('fitter');
	});

	it('says the error is falling somewhere in the run, which is what the line claims', () => {
		// Replayed one event at a time, because a trend is a statement about two
		// consecutive checkpoints and the final state only holds the last of them.
		let state = IDLE_PROGRESS;
		const trends = new Set<string>();
		for (const event of events) {
			state = reduceProgress(state, event);
			if (state.errorTrend) trends.add(state.errorTrend);
		}
		expect(trends.has('falling')).toBe(true);
	});

	it('never announces a stage it has no words for', () => {
		let state = IDLE_PROGRESS;
		for (const event of events) {
			state = reduceProgress(state, event);
			expect(state.stage).not.toBe(undefined);
		}
	});
});

/** A state built by hand, for the cases the star's own solve does not reach. */
function reduce(...list: EngineProgress[]): SearchProgress {
	return reduceAll(list);
}

describe('attempts', () => {
	it('lists a seed as waiting until the fitter reaches it', () => {
		const state = reduce(
			{ stage: 'directInitializing', counts: [4, 4], error: 0.08 },
			{ stage: 'directInitializing', counts: [5, 5], error: 0.12 }
		);
		expect(state.attempts).toEqual([
			{ counts: [4, 4], error: 0.08, state: 'waiting' },
			{ counts: [5, 5], error: 0.12, state: 'waiting' }
		]);
	});

	it('keeps the better of a pair’s two phases, which is the one that will be tried', () => {
		// The count search scores every pair at both phases and announces both; the
		// star's recorded run does it for all eight pairs it looked at.
		const state = reduce(
			{ stage: 'directInitializing', counts: [4, 4], error: 0.08 },
			{ stage: 'directInitializing', counts: [4, 4], error: 0.13 }
		);
		expect(state.attempts).toEqual([{ counts: [4, 4], error: 0.08, state: 'waiting' }]);
	});

	it('moves the running mark on and leaves the finished one its last error', () => {
		const state = reduce(
			{ stage: 'directInitializing', counts: [4, 4], error: 0.08 },
			{ stage: 'directInitializing', counts: [5, 5], error: 0.12 },
			{ stage: 'directRefining', counts: [4, 4], step: 0, error: 0.05 },
			{ stage: 'directRefining', counts: [4, 4], step: 40, error: 0.02 },
			{ stage: 'directRefining', counts: [5, 5], step: 0, error: 0.04 }
		);
		expect(state.attempts).toEqual([
			{ counts: [4, 4], error: 0.02, state: 'done' },
			{ counts: [5, 5], error: 0.04, state: 'running' }
		]);
		expect(state.counts).toEqual([5, 5]);
	});

	it('shows a seed the initializer never announced rather than hiding it', () => {
		// The topology and feature-recovery routes reach refinement without a
		// `directInitializing` of their own.
		const state = reduce({ stage: 'directRefining', counts: [3, 3], step: 0, error: 0.07 });
		expect(state.attempts).toEqual([{ counts: [3, 3], error: 0.07, state: 'running' }]);
	});

	it('ignores a bare stage event, which carries no counts at all', () => {
		const state = reduce(
			{ stage: 'directInitializing', counts: [4, 4], error: 0.08 },
			{ stage: 'directRefining' },
			{ stage: 'directClearance' }
		);
		expect(state.attempts).toEqual([{ counts: [4, 4], error: 0.08, state: 'waiting' }]);
		expect(state.stage).toBe('directClearance');
	});
});

describe('the error trend', () => {
	const step = (error: number): EngineProgress => ({
		stage: 'directRefining',
		counts: [4, 4],
		error
	});

	it('has no opinion on the first checkpoint of an attempt', () => {
		expect(reduce(step(0.05)).errorTrend).toBeNull();
	});

	it('reads falling, flat and rising off consecutive checkpoints', () => {
		expect(reduce(step(0.05), step(0.03)).errorTrend).toBe('falling');
		expect(reduce(step(0.05), step(0.05 + TREND_EPSILON / 2)).errorTrend).toBe('flat');
		expect(reduce(step(0.03), step(0.05)).errorTrend).toBe('rising');
	});

	it('starts again when the fitter moves to another seed', () => {
		const state = reduce(step(0.05), step(0.03), {
			stage: 'directRefining',
			counts: [5, 5],
			error: 0.09
		});
		// 0.09 against 0.03 is not a rise: it is a different attempt's first number.
		expect(state.errorTrend).toBeNull();
	});
});

describe('the MILP route', () => {
	it('follows the round, the gap and the incumbent', () => {
		const state = reduce(
			{ stage: 'graph' },
			{ stage: 'model', variables: 4000, constraints: 9000 },
			{ stage: 'solving', round: 1, remaining: 40, validatedIncumbent: false },
			{ stage: 'solving', round: 1, nodes: 120, gap: 0.31 },
			{ stage: 'validating', round: 1 },
			{ stage: 'solving', round: 2, remaining: 20, validatedIncumbent: true },
			{ stage: 'solving', round: 2, nodes: 900, gap: 0.03 }
		);
		expect(state.route).toBe('milp');
		expect(state.round).toBe(2);
		expect(state.gap).toBeCloseTo(0.03);
		expect(state.incumbent).toBe(true);
	});

	it('drops the previous round’s gap rather than showing it under a new round', () => {
		const state = reduce(
			{ stage: 'solving', round: 1, nodes: 120, gap: 0.31 },
			{ stage: 'solving', round: 2, remaining: 20, validatedIncumbent: true }
		);
		expect(state.gap).toBeNull();
	});

	it('hands the route to the fitter and keeps it there', () => {
		// `automatic.js` tries the traced route first and falls back to the fitter;
		// the fitter then builds graphs and solves models of its own inside feature
		// recovery, which must not read as a return to the MILP.
		const state = reduce(
			{ stage: 'model', variables: 10, constraints: 10 },
			{ stage: 'directInitializing', counts: [4, 4], error: 0.08 },
			{ stage: 'graph' },
			{ stage: 'model', variables: 20, constraints: 20 }
		);
		expect(state.route).toBe('fitter');
	});
});

describe('the stage', () => {
	it('names the stages the panel has words for', () => {
		expect(reduce({ stage: 'directPolishing' }).stage).toBe('directPolishing');
		expect(reduce({ stage: 'exporting' }).stage).toBe('exporting');
	});

	it('falls back to working for one it has not', () => {
		expect(reduce({ stage: 'somethingNewInCore' }).stage).toBe('working');
	});
});

describe('a candidate’s geometry', () => {
	it('is not the validity flag the engine sends today', () => {
		// `refineCurves` puts `check.passed` in `geometry`. Reading that as a
		// solution would draw a candidate made of nothing over the visitor's mask.
		expect(candidateGeometry({ stage: 'directRefining', geometry: true })).toBeNull();
		expect(candidateGeometry({ stage: 'directRefining', geometry: false })).toBeNull();
		expect(candidateGeometry({ stage: 'directRefining' })).toBeNull();
	});

	it('becomes a heart when the engine starts sending the real thing', () => {
		// PAINT.md §12 (a): the same `heartcurves-2` JSON as the result, on a
		// refinement checkpoint. Both forms it may take, object and string.
		for (const geometry of [starSolution, JSON.stringify(starSolution)]) {
			const event: EngineProgress = {
				stage: 'directRefining',
				counts: [4, 4],
				step: 80,
				error: 0.012,
				geometry: geometry as CutGeometry | string
			};

			// The reducer takes it in its stride: geometry is not part of the picture
			// it folds, and an event carrying a solution still updates the numbers.
			const state = reduceProgress(IDLE_PROGRESS, event);
			expect(state.counts).toEqual([4, 4]);
			expect(state.error).toBeCloseTo(0.012);

			const carried = candidateGeometry(event);
			expect(carried).not.toBeNull();
			const heart = cutGeometryToDesign(carried!, {
				name: 'candidate',
				tolerance: 1.0
			});
			// Four cuts a side, plus the square's own edges the normaliser adds.
			expect(heart.gridSize).toEqual({ x: 5, y: 5 });
			expect(heart.fingers.filter((f) => f.id.startsWith('L-cut-')).length).toBe(4);
			expect(heart.fingers.filter((f) => f.id.startsWith('R-cut-')).length).toBe(4);
		}
	});
});

describe('the candidate throttle', () => {
	/** A clock that only moves when the test says so. */
	function clock() {
		let time = 0;
		let pending: { run: () => void; at: number } | null = null;
		const api: ThrottleClock = {
			now: () => time,
			schedule: (run, ms) => {
				pending = { run, at: time + ms };
				return pending;
			},
			cancel: () => (pending = null)
		};
		return {
			api,
			advance(ms: number) {
				time += ms;
				if (pending && pending.at <= time) {
					const run = pending.run;
					pending = null;
					run();
				}
			}
		};
	}

	it('lets the first candidate through at once and the latest of a burst after it', () => {
		const seen: string[] = [];
		const time = clock();
		const gate = createGeometryThrottle<string>((v) => seen.push(v), 250, time.api);
		gate.push('a');
		expect(seen).toEqual(['a']);
		gate.push('b');
		gate.push('c');
		gate.push('d');
		// Still one: the burst is held, and only the last of it is waiting.
		expect(seen).toEqual(['a']);
		time.advance(250);
		expect(seen).toEqual(['a', 'd']);
	});

	it('holds to four a second however fast the engine talks', () => {
		const at: number[] = [];
		const time = clock();
		const gate = createGeometryThrottle<number>(() => at.push(time.api.now()), 250, time.api);
		// A hundred events at one every ten milliseconds: a second of a fast machine.
		for (let i = 0; i < 100; i++) {
			gate.push(i);
			time.advance(10);
		}
		expect(at).toEqual([0, 250, 500, 750, 1000]);
		// Which is the promise: no two conversions closer together than a quarter
		// of a second, whatever the engine does.
		for (let i = 1; i < at.length; i++) expect(at[i] - at[i - 1]).toBeGreaterThanOrEqual(250);
	});

	it('drops what is waiting when the search ends', () => {
		const seen: string[] = [];
		const time = clock();
		const gate = createGeometryThrottle<string>((v) => seen.push(v), 250, time.api);
		gate.push('a');
		gate.push('b');
		gate.stop();
		time.advance(1000);
		expect(seen).toEqual(['a']);
	});
});
