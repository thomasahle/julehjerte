/**
 * The front page's difficulty filter (docs/redesign/GALLERY-BAR.md, "As built:
 * difficulty filter"): toggle chips in the gallery bar, any number of levels
 * at once, none meaning "show all". The choice is mirrored into
 * `?level=let,mellem` (like `?selected=`, see $lib/front/selection) and into
 * sessionStorage, so it survives a reload, a Back and a "Vis i galleri" link
 * from a heart's page within the same tab.
 *
 * Pure string and Set work, kept out of the route so it can be tested. Every
 * function returns a *new* Set: the page swaps the value to re-render.
 *
 * The URL's words are Danish in both languages, so a shared link means the
 * same on /en/. $lib/front/strandBootstrap repeats the parsing in plain
 * JavaScript for the first paint; it is given LEVEL_SLUGS and the storage key
 * from here.
 */
import { LEVELS, LEVEL_LABEL_KEYS, type DifficultyLevel } from '$lib/utils/difficulty';
import { makeHeartAnchorId } from '$lib/utils/heartAnchors';
import { getSessionStorage, readStorage, removeStorage, writeStorage } from '$lib/utils/safeStorage';

/** The levels, easiest first (the chips' order), and their names: kept in $lib/utils/difficulty. */
export { LEVELS, LEVEL_LABEL_KEYS };

/** The level's word in `?level=`. */
export const LEVEL_SLUGS: Readonly<Record<DifficultyLevel, string>> = {
	easy: 'let',
	medium: 'mellem',
	hard: 'svaer',
	expert: 'ekspert'
};

export const LEVEL_PARAM = 'level';

/** Where the filter is kept for the tab (sessionStorage). */
export const LEVEL_STORAGE_KEY = 'juleflet-level';

const BY_SLUG = new Map(LEVELS.map((level) => [LEVEL_SLUGS[level], level]));

/** The levels in a `let,mellem` value; unknown words are dropped. */
export function parseLevelValue(raw: string | null | undefined): Set<DifficultyLevel> {
	const levels = new Set<DifficultyLevel>();
	for (const word of (raw ?? '').split(',')) {
		const level = BY_SLUG.get(word.trim().toLowerCase());
		if (level) levels.add(level);
	}
	return levels;
}

/**
 * The levels in `?level=`, or null when the URL does not say (no parameter, or
 * an empty one): then the tab's stored choice applies.
 */
export function parseLevels(search: string): Set<DifficultyLevel> | null {
	const raw = new URLSearchParams(search).get(LEVEL_PARAM);
	if (!raw) return null;
	return parseLevelValue(raw);
}

/** `levels` as the parameter's value, easiest first ('' for none). */
export function levelValue(levels: ReadonlySet<DifficultyLevel>): string {
	return LEVELS.filter((level) => levels.has(level))
		.map((level) => LEVEL_SLUGS[level])
		.join(',');
}

/** `levels` with `level` added if it was absent, removed if it was present. */
export function toggleLevel(
	levels: ReadonlySet<DifficultyLevel>,
	level: DifficultyLevel
): Set<DifficultyLevel> {
	const next = new Set(levels);
	if (!next.delete(level)) next.add(level);
	return next;
}

/** Whether a heart of `difficulty` shows under the filter: none chosen shows all. */
export function matchesLevels(
	levels: ReadonlySet<DifficultyLevel>,
	difficulty: DifficultyLevel | undefined
): boolean {
	return levels.size === 0 || (difficulty !== undefined && levels.has(difficulty));
}

/**
 * `search` with `level` set to `levels` — the query string including its `?`,
 * or '' when nothing is left. Other parameters are kept, in their own order.
 * The commas are written as they are, not as %2C, like `?selected=`.
 */
export function levelSearch(search: URLSearchParams, levels: ReadonlySet<DifficultyLevel>): string {
	const next = new URLSearchParams(search);
	const value = levelValue(levels);
	if (value) next.set(LEVEL_PARAM, value);
	else next.delete(LEVEL_PARAM);
	const query = next.toString().replace(/%2C/gi, ',');
	return query ? `?${query}` : '';
}

/**
 * The filter a page load starts with: the URL's when it names one, otherwise
 * what the tab last chose (`stored`, the sessionStorage value).
 */
export function initialLevels(search: string, stored: string | null): Set<DifficultyLevel> {
	return parseLevels(search) ?? parseLevelValue(stored);
}

/** The tab's stored choice, or null; never throws (private mode, blocked storage). */
export function readStoredLevels(): string | null {
	return readStorage(LEVEL_STORAGE_KEY, getSessionStorage());
}

/** Remember `levels` for the tab, or forget the filter when none is chosen. */
export function storeLevels(levels: ReadonlySet<DifficultyLevel>): void {
	// Blocked storage just forgets: the URL still carries it.
	const value = levelValue(levels);
	if (value) writeStorage(LEVEL_STORAGE_KEY, value, getSessionStorage());
	else removeStorage(LEVEL_STORAGE_KEY, getSessionStorage());
}

/**
 * Whether `levels` hides the gallery category or card that `anchor` (a hash
 * without its `#`: a category id or `heart-<id>`) names. The page drops the
 * filter then, so a heart's breadcrumb (`/#moenstre`) or a hero heart's link
 * to its card never lands on nothing. Anything else ("Mine hjerter", a
 * visitor's own heart, `#skabeloner`) is never hidden.
 */
export function filterHidesAnchor(
	anchor: string,
	categories: readonly { id: string; hearts: readonly { id: string; difficulty?: DifficultyLevel }[] }[],
	levels: ReadonlySet<DifficultyLevel>
): boolean {
	if (levels.size === 0 || !anchor) return false;
	let id = anchor;
	try {
		id = decodeURIComponent(anchor);
	} catch {
		// A malformed escape: look it up as it is.
	}
	const category = categories.find((c) => c.id === id);
	if (category) return !category.hearts.some((h) => matchesLevels(levels, h.difficulty));
	const heart = categories.flatMap((c) => c.hearts).find((h) => makeHeartAnchorId(h.id) === id);
	return heart !== undefined && !matchesLevels(levels, heart.difficulty);
}
