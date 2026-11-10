import { describe, expect, it } from 'vitest';
import { HISTORY_LIMIT, emptyHistory, recorded, redone, undone, type History } from './history';

/** The history after recording `states` in turn, each the state before an edit. */
function after(states: number[], limit?: number): History<number> {
	return states.reduce((h, s) => recorded(h, s, limit), emptyHistory<number>());
}

describe('the editor history', () => {
	it('takes edits back newest first, and gives them again the other way', () => {
		// states 1, 2, 3 each left by an edit; the heart is at 4 now
		let h = after([1, 2, 3]);
		const back = undone(h, () => 4)!;
		expect(back.to).toBe(3);
		h = back.history;
		expect(h).toEqual({ undo: [1, 2], redo: [4] });
		const back2 = undone(h, () => 3)!;
		expect(back2.to).toBe(2);
		h = back2.history;
		const again = redone(h, () => 2)!;
		expect(again.to).toBe(3);
		expect(again.history).toEqual({ undo: [1, 2], redo: [4] });
	});

	it('forgets what Gentag had once a new edit is made', () => {
		const h = undone(after([1, 2]), () => 3)!.history;
		expect(h.redo).toEqual([3]);
		expect(recorded(h, 2)).toEqual({ undo: [1, 2], redo: [] });
	});

	it('has nothing to take back or give again when empty, and does not ask for the state then', () => {
		const ask = () => {
			throw new Error('asked');
		};
		expect(undone(emptyHistory(), ask)).toBeNull();
		expect(redone(after([1]), ask)).toBeNull();
	});

	it('keeps the states themselves, not copies, and changes no history in place', () => {
		const state = { cuts: [1, 2] };
		const h0 = emptyHistory<typeof state>();
		const h1 = recorded(h0, state);
		expect(h1.undo[0]).toBe(state);
		expect(h0).toEqual({ undo: [], redo: [] });
		const now = { cuts: [3] };
		const back = undone(h1, () => now)!;
		expect(back.to).toBe(state);
		expect(back.history.redo[0]).toBe(now);
		expect(h1.undo).toHaveLength(1);
	});

	it(`keeps at most ${HISTORY_LIMIT} steps, letting the oldest go`, () => {
		const states = Array.from({ length: HISTORY_LIMIT + 5 }, (_, i) => i);
		const h = after(states);
		expect(h.undo).toHaveLength(HISTORY_LIMIT);
		expect(h.undo[0]).toBe(5);
		expect(h.undo.at(-1)).toBe(HISTORY_LIMIT + 4);
		// Fortryd and Gentag together stay within it
		let walked = h;
		for (let i = 0; i < 3; i++) walked = undone(walked, () => -1)!.history;
		expect(walked.undo.length + walked.redo.length).toBe(HISTORY_LIMIT);
		expect(after([1, 2, 3, 4], 3).undo).toEqual([2, 3, 4]);
	});
});
