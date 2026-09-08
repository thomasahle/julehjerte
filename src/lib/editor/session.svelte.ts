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
 *
 * The mask and the found heart are held with `$state.raw`, so that what the store
 * makes reactive is the *replacement* of a mask, not a write to a cell. A plain
 * `$state` object would be handed out as a deep proxy, and the tools read
 * `mask.data` in their innermost loops — a flood fill over the full mask is 160 000
 * proxied reads, which measures about fourteen times slower than the raw array and
 * lands straight on the canvas's frame budget. The other side of that coin is that
 * painting is invisible to reactivity by design: `$derived` and `$effect` never see
 * a stroke. The canvas repaints the box a tool reports (§8), which is what it wants
 * to do anyway; anything else that has to know must go through `setMask`.
 */

import type { HeartDesign } from '$lib/types/heart';
import { clearHandoff, handoffToDraw, takeHandoff } from './handoff';
import { createMask, packMask, unpackMask, type Mask } from '$lib/paint/mask';
import {
	clampFrameSize,
	DEFAULT_FRAME,
	shapeCells,
	type Frame,
	type FrameMode,
	type FrameShape
} from '$lib/paint/frame';
import {
	NO_SYMMETRY,
	symmetrize,
	transformsFor,
	type SymmetryMode,
	type SymmetrySettings
} from '$lib/paint/symmetry';

// The three rows live with the mask transforms they mean; both modes import them
// from here so nothing has to reach into $lib/paint to name a symmetry.
export type { SymmetryMode, SymmetrySettings };
export { NO_SYMMETRY };

// The frame is the same kind of setting, so it travels the same way.
export type { Frame, FrameMode, FrameShape };
export { DEFAULT_FRAME };

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
	report: {
		cuts: [number, number];
		clearanceMm: number;
		mismatch: number;
		identical: boolean;
		/**
		 * The difference inside the protected motif alone, when the band was free.
		 *
		 * Reported separately because a large, accurately woven band dilutes an error
		 * in the middle: MOTIF-BORDER.md's three-cell house passes the whole-image
		 * bar at 1.89 % while its centre is 4.60 % wrong. Undefined when the band was
		 * fixed, where the whole square *is* the motif.
		 */
		motifMismatch?: number;
	};
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
	/**
	 * "Kanten": which part of the square is the visitor's motif, and what happens
	 * to the band around it (PAINT.md §11).
	 *
	 * A setting beside the mask and not a layer inside it: the cells of the band
	 * exist and are painted on like any others, and the frame only says how the
	 * search should read them. That is also what keeps the door open for Codex's
	 * per-cell weights — a weight layer replaces `frameWeights`, not this.
	 */
	frame: Frame;
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
		sourceName: null,
		frame: { ...DEFAULT_FRAME }
	};
}

/**
 * The store itself. A class rather than one `$state` object because the two big
 * values in it — the mask's cells and a found heart's fingers — must not be wrapped
 * in a deep proxy (see the note at the top of the file); the small fields are
 * ordinary `$state`, so a component can read `session.symmetry.curve` and follow it.
 */
class Session implements PaintSession {
	mask = $state.raw<Mask | null>(null);
	maskDirty = $state(false);
	symmetry = $state<SymmetrySettings>({ ...NO_SYMMETRY });
	found = $state<SymmetrySettings | null>(null);
	result = $state.raw<PaintResult | null>(null);
	status = $state<PaintStatus>('idle');
	error = $state<PaintError | null>(null);
	sourceName = $state<string | null>(null);
	frame = $state<Frame>({ ...DEFAULT_FRAME });
}

export const session: PaintSession = new Session();

/**
 * Replace the mask wholesale — an import, "Mal på hjertet", "Prøv stjernen".
 *
 * The mask is not dirty afterwards: nothing has been painted on it yet, so leaving
 * for Tegn or importing again may go ahead without asking. Detection results come
 * in here too, because they belong to the mask that arrived with them — and so a
 * caller that has nothing to report clears the "fundet" tags rather than leaving
 * the last picture's behind, describing a mask that is gone.
 *
 * The three rows are the exception: they are the visitor's setting, not a property
 * of the mask, so they stay as they were unless the caller has a better answer. The
 * arriving mask is folded under whichever rows end up on — see `foldToSymmetry`; a
 * mask found symmetric within the detection tolerance is only nearly symmetric, and
 * painting needs it to be exactly so.
 */
export function setMask(
	mask: Mask,
	options: { sourceName?: string | null; symmetry?: SymmetrySettings; found?: SymmetrySettings | null } = {}
): void {
	session.mask = mask;
	session.maskDirty = false;
	session.sourceName = options.sourceName ?? null;
	if (options.symmetry) session.symmetry = { ...options.symmetry };
	session.found = options.found ? { ...options.found } : null;
	session.result = null;
	session.status = 'idle';
	session.error = null;
	foldToSymmetry();
}

/**
 * Switch the three rows, and fold the mask to match them.
 *
 * Every row the visitor turns on has to come through here rather than by assigning
 * `session.symmetry`, because painting under symmetry assumes the mask already
 * matches under the active transforms: `applySymmetric` spreads the brush colour
 * through the whole box a tool reports, and the box of a diagonal stroke is most of
 * the mask, so paint laid down earlier — with symmetry off, or under different rows
 * — would be mirrored along with the stroke. Folding first is what makes the
 * assumption true, and it is the same fold §5 does before solving.
 *
 * Switching a row off costs nothing: the mask is already symmetric under what is
 * left. The fold does not mark the mask dirty — it is the visitor's own
 * instruction, not an edit they have yet to notice — but it does change the cells,
 * so the page puts it on the undo stack, with the rows it was folded under
 * ($lib/paint/history): the cells and the rows are one state, and putting one back
 * without the other leaves the next stroke painting on an unfolded mask.
 */
export function setSymmetry(next: SymmetrySettings): void {
	session.symmetry = { ...next };
	foldToSymmetry();
}

/**
 * Change the frame, and fold the mask to whatever the rows now mean.
 *
 * Switching the band free narrows the region the fold covers, so the mask has to
 * be folded again — the other way round, switching it back to Fast, the band has
 * to catch up with the rows it was never folded under.
 */
export function setFrame(next: Frame): void {
	session.frame = { ...next };
	foldToSymmetry();
}

/**
 * The cells the symmetry rows apply to: the whole square, or — while the band is
 * free — the protected motif alone. Undefined rather than an all-ones array when
 * everything counts, so the common case costs nothing.
 */
export function symmetryRegion(): Uint8Array | undefined {
	if (!session.mask || session.frame.mode !== 'free') return undefined;
	return shapeCells(session.frame, session.mask.size);
}

/** Make the mask exactly symmetric under the rows that are on. */
function foldToSymmetry(): void {
	if (session.mask) symmetrize(session.mask, transformsFor(session.symmetry), symmetryRegion());
}

/** Ryd: an empty mask, and nothing left to say about where it came from. */
export function clearMask(): void {
	setMask(createMask(0));
}

/** Record that the visitor has painted, so the next destructive step asks first. */
export function markMaskDirty(): void {
	session.maskDirty = true;
}

/** Everything back to the start. Tests lean on this; the UI has no reason to. */
export function resetSession(): void {
	Object.assign(session, freshSession());
	clearHandoff();
}

/**
 * The heart Find snit found, waiting for the draw page.
 *
 * Not part of `session`: it is a one-shot message, taken exactly once by the page
 * that `/editor/?from=session` opens, and keeping it out of the store means a stale
 * result cannot be picked up by the next visit to Tegn. It lives in its own module
 * so that the draw page can take it without importing the mask and the symmetry
 * group along with it (see `./handoff`); both functions are re-exported here,
 * which is where PAINT.md §11 names them.
 */
export { handoffToDraw, takeHandoff };

/** The session as plain JSON-safe data. Unused for now; see the note at the top. */
export type SerializedSession = {
	mask: { size: number; cells: string } | null;
	symmetry: SymmetrySettings;
	found: SymmetrySettings | null;
	sourceName: string | null;
	frame: Frame;
};

export function serialize(): SerializedSession {
	return {
		mask: session.mask ? { size: session.mask.size, cells: packMask(session.mask) } : null,
		symmetry: { ...session.symmetry },
		found: session.found ? { ...session.found } : null,
		sourceName: session.sourceName,
		frame: { ...session.frame }
	};
}

function isMode(value: unknown): value is SymmetryMode {
	return value === 'off' || value === 'sym' || value === 'anti';
}

/** A frame out of stored data; anything unreadable falls back to the default. */
function readFrame(value: unknown): Frame {
	if (!value || typeof value !== 'object') return { ...DEFAULT_FRAME };
	const v = value as Record<string, unknown>;
	const mode: FrameMode = v.mode === 'free' ? 'free' : 'fixed';
	const shape: FrameShape =
		v.shape === 'circle' || v.shape === 'hexagon' ? v.shape : DEFAULT_FRAME.shape;
	const size = typeof v.size === 'number' ? clampFrameSize(v.size) : DEFAULT_FRAME.size;
	return { mode, shape, size };
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
	session.frame = readFrame(r.frame);
	return true;
}
