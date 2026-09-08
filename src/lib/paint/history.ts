/**
 * Undo and redo for the mask, as whole snapshots.
 *
 * A mask is 160 KB, so forty of them is 6.4 MB — cheap enough to buy the one
 * property that matters here: an undo step is a complete picture, which cannot
 * drift out of step with the mask the way a log of edits can when a stroke, a
 * flood fill and a symmetric copy all touch the same cells. Forty steps is the
 * cap; older ones fall off the bottom.
 */

import { cloneMask, type Mask } from './mask';

/** How many undo steps are kept. */
export const HISTORY_LIMIT = 40;

export type MaskHistory = { past: Mask[]; future: Mask[]; limit: number };

export function createHistory(limit: number = HISTORY_LIMIT): MaskHistory {
	return { past: [], future: [], limit: Math.max(1, limit) };
}

/**
 * Remember the mask as it was before an edit.
 *
 * Called with the state *before* the change, so undo restores it. A new edit
 * abandons whatever was undone, as everywhere else.
 */
export function record(history: MaskHistory, before: Mask): void {
	history.past.push(cloneMask(before));
	if (history.past.length > history.limit) history.past.splice(0, history.past.length - history.limit);
	history.future.length = 0;
}

export function canUndo(history: MaskHistory): boolean {
	return history.past.length > 0;
}

export function canRedo(history: MaskHistory): boolean {
	return history.future.length > 0;
}

/** The previous mask, with `current` kept for redo; null when there is nothing to undo. */
export function undo(history: MaskHistory, current: Mask): Mask | null {
	const previous = history.past.pop();
	if (!previous) return null;
	history.future.push(cloneMask(current));
	return previous;
}

/** The mask that was undone, with `current` put back on the undo stack; null when there is none. */
export function redo(history: MaskHistory, current: Mask): Mask | null {
	const next = history.future.pop();
	if (!next) return null;
	history.past.push(cloneMask(current));
	if (history.past.length > history.limit) history.past.splice(0, history.past.length - history.limit);
	return next;
}

/** Forget everything, for a mask that is replaced wholesale (import, "Mal på hjertet", Ryd). */
export function resetHistory(history: MaskHistory): void {
	history.past.length = 0;
	history.future.length = 0;
}
