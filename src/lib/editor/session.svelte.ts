/**
 * The editor session: what Tegn and Mal share while the visitor moves between them.
 *
 * Switching mode is ordinary navigation, so a page component cannot hold the mask
 * — it is destroyed on the way out. This module is the one place that survives:
 * one rune store, read and written by both modes, and a handoff slot for the heart
 * Find snit produced so the draw page can pick it up without putting a whole design
 * in the URL.
 *
 * Nothing here touches the DOM or storage. The mask deliberately does not survive
 * a reload: 160 KB per keystroke is more than the draft mechanism should carry, and
 * an unsaved drawing that disappears with the tab is what a visitor already expects.
 * `serialize`/`restore` exist so that decision can be reversed in one place.
 */

import type { HeartDesign } from '$lib/types/heart';
import { createMask, packMask, unpackMask, type Mask } from '$lib/paint/mask';
import { NO_SYMMETRY, type SymmetryMode, type SymmetrySettings } from '$lib/paint/symmetry';

// The three rows live with the mask transforms they mean; both modes import them
// from here so nothing has to reach into $lib/paint to name a symmetry.
export type { SymmetryMode, SymmetrySettings };
export { NO_SYMMETRY };

/** Where Find snit has got to. `importing` covers preparing a picture in the dialog. */
export type PaintStatus = 'idle' | 'importing' | 'searching' | 'done' | 'failed';

/**
 * Why Find snit gave up, in the three kinds the panel has words for: the search ran
 * out of time, the mask has no weavable pattern (including one our grid cannot hold),
 * or the engine itself never loaded.
 */
export type PaintErrorKind = 'timeout' | 'noSolution' | 'engine';
export type PaintError = { kind: PaintErrorKind; detail?: string };

/** A found heart and the numbers the panel reports: cuts per lobe, clearance, difference. */
export type PaintResult = {
	design: HeartDesign;
	report: { cuts: [number, number]; clearanceMm: number; mismatch: number; identical: boolean };
};

export type PaintSession = {
	/** The mask being painted, or null before there is one. */
	mask: Mask | null;
	/** Strokes since the mask was created, imported or rasterised — what a confirm asks about. */
	maskDirty: boolean;
	/** The three rows as the visitor has them. */
	symmetry: SymmetrySettings;
	/** What detection suggested, for the "fundet" tags; null before anything was detected. */
	found: SymmetrySettings | null;
	/** The last successful Find snit, which Gem and Download PDF act on. */
	result: PaintResult | null;
	status: PaintStatus;
	error: PaintError | null;
	/** The file or example the mask came from, e.g. "stjerne.png"; null when painted by hand. */
	sourceName: string | null;
};

function freshSession(): PaintSession {
	return {
		mask: null,
		maskDirty: false,
		symmetry: { ...NO_SYMMETRY },
		found: null,
		result: null,
		status: 'idle',
		error: null,
		sourceName: null
	};
}

export const session: PaintSession = $state(freshSession());

/**
 * Replace the mask wholesale — an import, "Mal på hjertet", "Prøv stjernen".
 *
 * The mask is not dirty afterwards: nothing has been painted on it yet, so leaving
 * for Tegn or importing again may go ahead without asking. Detection results come
 * in here too, because they belong to the mask that arrived with them.
 */
export function setMask(
	mask: Mask,
	options: { sourceName?: string | null; symmetry?: SymmetrySettings; found?: SymmetrySettings | null } = {}
): void {
	session.mask = mask;
	session.maskDirty = false;
	session.sourceName = options.sourceName ?? null;
	if (options.symmetry) session.symmetry = { ...options.symmetry };
	if (options.found !== undefined) session.found = options.found ? { ...options.found } : null;
	session.result = null;
	session.status = 'idle';
	session.error = null;
}

/** Ryd: an empty mask, no source, no suggested symmetry to explain. */
export function clearMask(): void {
	setMask(createMask(0), { sourceName: null, found: null });
}

/** Record that the visitor has painted, so the next destructive step asks first. */
export function markMaskDirty(): void {
	session.maskDirty = true;
}

/** Everything back to the start. Tests lean on this; the UI has no reason to. */
export function resetSession(): void {
	Object.assign(session, freshSession());
	handoff = null;
}

/**
 * The heart Find snit found, waiting for the draw page.
 *
 * Not part of `session`: it is a one-shot message, taken exactly once by the page
 * that `/editor/?from=session` opens, and keeping it out of the store means a stale
 * result cannot be picked up by the next visit to Tegn.
 */
let handoff: HeartDesign | null = null;

export function handoffToDraw(design: HeartDesign): void {
	handoff = design;
}

export function takeHandoff(): HeartDesign | null {
	const design = handoff;
	handoff = null;
	return design;
}

/** The session as plain JSON-safe data. Unused for now; see the note at the top. */
export type SerializedSession = {
	mask: { size: number; cells: string } | null;
	symmetry: SymmetrySettings;
	found: SymmetrySettings | null;
	sourceName: string | null;
};

export function serialize(): SerializedSession {
	return {
		mask: session.mask ? { size: session.mask.size, cells: packMask(session.mask) } : null,
		symmetry: { ...session.symmetry },
		found: session.found ? { ...session.found } : null,
		sourceName: session.sourceName
	};
}

function isMode(value: unknown): value is SymmetryMode {
	return value === 'off' || value === 'sym' || value === 'anti';
}

function readSettings(value: unknown): SymmetrySettings | null {
	if (!value || typeof value !== 'object') return null;
	const v = value as Record<string, unknown>;
	if (!isMode(v.curve) || !isMode(v.lobe) || !isMode(v.lobes)) return null;
	return { curve: v.curve, lobe: v.lobe, lobes: v.lobes };
}

/**
 * Put back what `serialize` produced. False when the data is not a session, in which
 * case the store is left alone — a half-written mask must never replace a good one.
 */
export function restore(raw: unknown): boolean {
	if (!raw || typeof raw !== 'object') return false;
	const r = raw as Record<string, unknown>;
	const symmetry = readSettings(r.symmetry);
	if (!symmetry) return false;

	let mask: Mask | null = null;
	if (r.mask) {
		const m = r.mask as Record<string, unknown>;
		if (typeof m.size !== 'number' || typeof m.cells !== 'string') return false;
		mask = unpackMask(m.size, m.cells);
		if (!mask) return false;
	}

	Object.assign(session, freshSession());
	session.mask = mask;
	session.symmetry = symmetry;
	session.found = readSettings(r.found);
	session.sourceName = typeof r.sourceName === 'string' ? r.sourceName : null;
	return true;
}
