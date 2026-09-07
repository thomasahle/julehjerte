/**
 * Picking hearts at random — the front page's hero swaps its five hanging
 * hearts for a random set after hydration (docs/redesign/DESIGN.md §3).
 *
 * The hero is prerendered with a fixed set and only randomises **after mount**:
 * randomising during render would make the server and client markup disagree
 * and produce a hydration mismatch. Sizes and positions never change, so the
 * swap is a pure cross-fade with no layout shift.
 */
import { ALL_HEART_IDS } from '$lib/data/categories';

/**
 * The five hearts baked into the prerendered hero, in DOM order (long ribbons
 * first, so they pass behind the shorter hearts). Hydration replaces them with
 * a random set of the same size.
 */
export const HERO_HEART_IDS = [
	'nemt-hjerte',
	'snowflake',
	'jul',
	'classic-3x3',
	'stjerne'
] as const;

/** The three hearts of the stacked hero below 900px, in DOM order. */
export const HERO_HEART_IDS_MOBILE = ['jul', 'stjerne', 'classic-3x3'] as const;

export interface PickRandomHeartIdsOptions {
	/** Ids to choose from. Defaults to every gallery heart, in gallery order. */
	pool?: readonly string[];
	/** Ids to leave out, e.g. hearts already shown elsewhere on the page. */
	exclude?: Iterable<string>;
	/** Random source, for deterministic tests. Defaults to `Math.random`. */
	random?: () => number;
}

/**
 * `count` distinct heart ids picked at random.
 *
 * The default pool is `ALL_HEART_IDS`, i.e. the gallery hearts from
 * `hearts.json`, so hearts the visitor drew themselves are excluded by
 * construction — they live in localStorage and never enter this pool.
 *
 * No id is ever repeated. If the pool (after exclusions) is smaller than
 * `count`, every remaining id is returned, shuffled — the caller gets fewer
 * hearts rather than duplicates.
 */
export function pickRandomHeartIds(
	count: number,
	{ pool = ALL_HEART_IDS, exclude, random = Math.random }: PickRandomHeartIdsOptions = {}
): string[] {
	if (count <= 0) return [];

	const excluded = exclude ? new Set(exclude) : null;
	const candidates = excluded ? pool.filter((id) => !excluded.has(id)) : [...pool];

	// Partial Fisher-Yates: shuffle only as far as we need to draw.
	const wanted = Math.min(count, candidates.length);
	for (let i = 0; i < wanted; i++) {
		const j = i + Math.floor(random() * (candidates.length - i));
		[candidates[i], candidates[j]] = [candidates[j], candidates[i]];
	}
	return candidates.slice(0, wanted);
}
