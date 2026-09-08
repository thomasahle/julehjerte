/**
 * Undo and redo for the mask, as whole snapshots.
 *
 * A mask is 160 KB, so forty of them is 6.4 MB — cheap enough to buy the one
 * property that matters here: an undo step is a complete picture, which cannot
 * drift out of step with the mask the way a log of edits can when a stroke, a
 * flood fill and a symmetric copy all touch the same cells. Forty steps is the
 * cap; older ones fall off the bottom.
 *
 * A step carries the three symmetry rows beside the cells, because under symmetry
 * those two are one state. Painting assumes the mask is *already* exactly
 * symmetric under the rows that are on — `applySymmetric` spreads the brush
 * colour from every cell of a tool's bounding box, so older paint under it is
 * mirrored too — and switching a row on is what makes that true, by folding the
 * mask. A step that put the cells back without their rows would therefore hand
 * the next stroke an unfolded mask with the rows still on, and the stroke would
 * smear paint the visitor never drew. The two travel together instead.
 */

import { cloneMask, type Mask } from './mask';
import type { SymmetrySettings } from './symmetry';

/** How many undo steps are kept. */
export const HISTORY_LIMIT = 40;

/** One step of the mask's life: its cells, and the rows they are folded under. */
export type MaskStep = { mask: Mask; symmetry: SymmetrySettings };

export type MaskHistory = { past: MaskStep[]; future: MaskStep[]; limit: number };

export function createHistory(limit: number = HISTORY_LIMIT): MaskHistory {
	return { past: [], future: [], limit: Math.max(1, limit) };
}

/** A copy that later painting cannot reach into. */
function snapshot(step: MaskStep): MaskStep {
	return { mask: cloneMask(step.mask), symmetry: { ...step.symmetry } };
}

/**
 * Remember the mask as it was before an edit.
 *
 * Called with the state *before* the change, so undo restores it. A new edit
 * abandons whatever was undone, as everywhere else.
 */
export function record(history: MaskHistory, before: MaskStep): void {
	history.past.push(snapshot(before));
	if (history.past.length > history.limit) history.past.splice(0, history.past.length - history.limit);
	history.future.length = 0;
}

export function canUndo(history: MaskHistory): boolean {
	return history.past.length > 0;
}

export function canRedo(history: MaskHistory): boolean {
	return history.future.length > 0;
}

/** The previous step, with `current` kept for redo; null when there is nothing to undo. */
export function undo(history: MaskHistory, current: MaskStep): MaskStep | null {
	const previous = history.past.pop();
	if (!previous) return null;
	history.future.push(snapshot(current));
	return previous;
}

/** The step that was undone, with `current` put back on the undo stack; null when there is none. */
export function redo(history: MaskHistory, current: MaskStep): MaskStep | null {
	const next = history.future.pop();
	if (!next) return null;
	history.past.push(snapshot(current));
	if (history.past.length > history.limit) history.past.splice(0, history.past.length - history.limit);
	return next;
}

/** Forget everything, for a mask that is replaced wholesale (import, "Mal på hjertet", Ryd). */
export function resetHistory(history: MaskHistory): void {
	history.past.length = 0;
	history.future.length = 0;
}
