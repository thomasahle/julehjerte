/**
 * The heart Mal found, waiting for Tegn to pick it up.
 *
 * A one-shot message rather than a field of the editor session: it is taken
 * exactly once, by the page that `/editor/?from=session` opens, so a stale
 * result cannot be picked up by the next visit to Tegn. `session.svelte.ts`
 * re-exports both functions, which is where PAINT.md §11 names them.
 *
 * It is a module of its own because of who reads it. Tegn has to take the
 * handoff while it is mounting, before it can render the heart, so it cannot
 * wait for a dynamic import — and importing the session store instead would
 * pull the mask and the symmetry group into the draw page's bundle for the sake
 * of one nullable variable (4 KB, measured). PAINT.md §8 asks that Mal cost the
 * draw page nothing; this is how it costs nothing.
 */

import type { HeartDesign } from '$lib/types/heart';

let handoff: HeartDesign | null = null;

/** Leave the found heart for the draw page. */
export function handoffToDraw(design: HeartDesign): void {
	handoff = design;
}

/** Take it, once. Null when there is none — an ordinary visit to Tegn. */
export function takeHandoff(): HeartDesign | null {
	const design = handoff;
	handoff = null;
	return design;
}

/** Forget an untaken heart. `resetSession` calls this; the UI has no reason to. */
export function clearHandoff(): void {
	handoff = null;
}
