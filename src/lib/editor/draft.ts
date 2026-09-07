/**
 * The editor's single unsaved heart, remembered per browser.
 *
 * A heart that is already in "Mine hjerter" autosaves straight into the
 * collection. A heart that is not — a blank editor, a copy of a gallery heart
 * (`?from=`), a shared `#design=` link — must not create a card before the
 * visitor presses "Gem", or every stray colour click would leave a "Mit hjerte"
 * behind. Its work in progress is kept here instead: one draft, under its own
 * key, offered back the next time the editor opens as a new heart.
 *
 * The rules, which is why this is a module and not a few lines in the route:
 *
 *   * there is exactly **one** draft — a second new heart replaces the first;
 *   * the stored draft is read **after mount**, never during render, so the
 *     server's markup and the browser's first markup agree;
 *   * anything that does not parse as a heart is treated as no draft at all,
 *     so a half-written or hand-edited value cannot break the editor;
 *   * storage failures are tolerated. `localStorage` throws outright in a
 *     browser configured to block site data, so even *reaching* it is guarded;
 *     the editor then simply does not remember the draft.
 *
 * All three functions take the Storage to use, so a test can hand them a stub.
 */

import type { HeartDesign } from '$lib/types/heart';
import { normalizeHeartDesign, serializeHeartDesign } from '$lib/utils/heartDesign';

/** localStorage key. Holds one JSON object, shaped like `StoredDraft` below. */
export const DRAFT_KEY = 'paperheart.draft';

/**
 * Where the heart in the draft came from. `'blank'` for an empty editor,
 * `'shared'` for a `#design=` link, `'import'` for an imported SVG, and
 * `gallery:<id>` for a copy of a gallery heart — prefixed so that a gallery id
 * can never be mistaken for one of the fixed words.
 */
export type DraftSource = string;

/** The source string for a copy of the gallery heart `id`. */
export function gallerySource(id: string): DraftSource {
	return `gallery:${id}`;
}

export type EditorDraft = {
	design: HeartDesign;
	source: DraftSource;
	/** When the draft was last written, in milliseconds since the epoch. */
	savedAt: number;
};

type StoredDraft = {
	design?: unknown;
	source?: unknown;
	savedAt?: unknown;
};

/** The browser's own localStorage, or null where there is none or it throws. */
function defaultStorage(): Storage | null {
	try {
		return typeof localStorage === 'undefined' ? null : localStorage;
	} catch {
		return null;
	}
}

/**
 * The stored draft, or null when there is none, when storage fails, or when
 * what is stored is not a heart we can load.
 */
export function readDraft(storage: Storage | null = defaultStorage()): EditorDraft | null {
	let stored: string | null;
	try {
		stored = storage?.getItem(DRAFT_KEY) ?? null;
	} catch {
		return null;
	}
	if (!stored) return null;

	let raw: unknown;
	try {
		raw = JSON.parse(stored);
	} catch {
		return null;
	}
	if (!raw || typeof raw !== 'object') return null;

	const { design: rawDesign, source, savedAt } = raw as StoredDraft;
	// The same validation the collection uses, so a draft can hold nothing the
	// collection could not hold either.
	const design = normalizeHeartDesign(rawDesign);
	if (!design) return null;

	return {
		design,
		source: typeof source === 'string' && source ? source : 'blank',
		savedAt: typeof savedAt === 'number' && Number.isFinite(savedAt) ? savedAt : 0
	};
}

/** Replace the draft. A storage failure is ignored: it only costs persistence. */
export function writeDraft(draft: EditorDraft, storage: Storage | null = defaultStorage()): void {
	try {
		storage?.setItem(
			DRAFT_KEY,
			JSON.stringify({
				design: serializeHeartDesign(draft.design),
				source: draft.source,
				savedAt: draft.savedAt
			})
		);
	} catch {
		// Storage unavailable or full: the draft just does not survive a reload.
	}
}

/** Forget the draft — it was saved, discarded, or replaced by another heart. */
export function clearDraft(storage: Storage | null = defaultStorage()): void {
	try {
		storage?.removeItem(DRAFT_KEY);
	} catch {
		// Nothing to do: if it cannot be removed it could not have been written.
	}
}
