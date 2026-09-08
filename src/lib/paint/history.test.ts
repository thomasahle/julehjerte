import { describe, it, expect } from 'vitest';
import { createMask, type Mask } from './mask';
import { canRedo, canUndo, createHistory, HISTORY_LIMIT, record, redo, resetHistory, undo } from './history';

/** A mask whose single cell says which step it is, so a restored one is identifiable. */
function step(n: number): Mask {
	const m = createMask(0, 4);
	m.data[0] = n % 2;
	m.data[1] = n;
	return m;
}

describe('history', () => {
	it('gives back the state before the edit, and takes it forward again', () => {
		const history = createHistory();
		const before = step(1);
		record(history, before);
		const after = step(2);

		expect(canUndo(history)).toBe(true);
		const undone = undo(history, after);
		expect(undone?.data[1]).toBe(1);
		expect(canRedo(history)).toBe(true);
		expect(redo(history, undone!)?.data[1]).toBe(2);
	});

	it('has nothing to undo or redo when it is new', () => {
		const history = createHistory();
		expect(undo(history, step(1))).toBeNull();
		expect(redo(history, step(1))).toBeNull();
		expect(canUndo(history)).toBe(false);
	});

	it('drops the oldest step once the cap is reached', () => {
		const history = createHistory();
		for (let i = 1; i <= HISTORY_LIMIT + 10; i++) record(history, step(i));
		expect(history.past.length).toBe(HISTORY_LIMIT);

		// The steps that survive are the last forty, newest first on the way back.
		let current = step(HISTORY_LIMIT + 11);
		const seen: number[] = [];
		for (let i = 0; i < HISTORY_LIMIT; i++) {
			const previous = undo(history, current)!;
			seen.push(previous.data[1]!);
			current = previous;
		}
		expect(seen[0]).toBe(HISTORY_LIMIT + 10);
		expect(seen[seen.length - 1]).toBe(11);
		expect(undo(history, current)).toBeNull();
	});

	it('snapshots rather than aliasing, so later painting cannot rewrite the past', () => {
		const history = createHistory();
		const live = step(1);
		record(history, live);
		live.data[1] = 99;
		expect(undo(history, live)?.data[1]).toBe(1);
	});

	it('abandons the redo stack when a new edit is recorded', () => {
		const history = createHistory();
		record(history, step(1));
		undo(history, step(2));
		expect(canRedo(history)).toBe(true);
		record(history, step(3));
		expect(canRedo(history)).toBe(false);
	});

	it('forgets everything when the mask is replaced', () => {
		const history = createHistory();
		record(history, step(1));
		undo(history, step(2));
		resetHistory(history);
		expect(canUndo(history)).toBe(false);
		expect(canRedo(history)).toBe(false);
	});
});
