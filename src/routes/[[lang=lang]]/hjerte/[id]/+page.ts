import type { PageLoad } from './$types';
import heartsData from '$lib/data/hearts.json';
import heartMeta from '$lib/data/heart-meta.json';
import { categoryOfHeart, siblingHeartIds, type CategoryId } from '$lib/data/categories';
import type { DifficultyLevel } from '$lib/utils/difficulty';
import type { HeartDesign } from '$lib/types/heart';
import { SHARED_HEART_ID } from '$lib/utils/shareDesign';

export const prerender = true;

export type HeartPhoto = { src: string; width: number; height: number };

// Build-time metadata for a gallery heart (see scripts/generate-heart-data.mjs).
export type HeartMeta = {
	name: string;
	author: string | null;
	authorUrl: string | null;
	publisher: string | null;
	publisherUrl: string | null;
	source: string | null;
	date: string | null;
	description: string | null;
	gridSize: { x: number; y: number };
	difficulty: DifficultyLevel;
	symmetry: {
		isClassic: boolean;
		curveSymmetry: boolean;
		lobeSymmetry: boolean;
		mirrorSymmetry: boolean;
		sharedTemplate: boolean;
	};
	photo: HeartPhoto | null;
};

/** One entry in the detail page's "Flere {kategori}" row. */
export type RelatedHeart = { id: string; name: string; design: HeartDesign };

/**
 * How many siblings the related row shows. The row is one line of the
 * `minmax(150px, 1fr)` grid on a 1280 px column, and the "Se alle N {kategori}"
 * link next to the heading leads to the rest — docs/redesign/DESIGN.md §4.
 */
const RELATED_LIMIT = 6;

const HEART_META = heartMeta as Record<string, HeartMeta>;

// Generate all possible heart page URLs for prerendering
export function entries() {
	const allHeartIds = heartsData.categories.flatMap((cat) => cat.hearts);

	// Generate entries for both languages (da = default/no lang, en). /hjerte/delt/
	// renders a user heart shared in the URL fragment (see $lib/utils/shareDesign).
	const ids = [...allHeartIds, SHARED_HEART_ID];
	return [
		...ids.map((id) => ({ lang: undefined, id })), // Danish (default)
		...ids.map((id) => ({ lang: 'en', id })) // English
	];
}

// Gallery hearts get their metadata and precomputed design at build time so the
// prerendered HTML has the real title, description, header and preview. User-created
// hearts (localStorage) have neither here and are loaded entirely in the browser.
//
// The related row is resolved here too — categoryOfHeart()/siblingHeartIds() are
// synchronous lookups over hearts.json — so "Flere {kategori}" is in the
// prerendered HTML and its links are crawlable.
export const load: PageLoad = async ({ params }) => {
	// Imported lazily so the ~330 KB of design data gets its own cacheable chunk.
	const { getGalleryDesign } = await import('$lib/data/heartDesigns');
	// Same reason: 38 hearts × two languages of prose belong in that chunk, not in
	// the bundle every page of the site loads.
	const { heartDescription } = await import('$lib/data/heartDescriptions');

	const category = categoryOfHeart(params.id);
	const related: RelatedHeart[] = [];
	for (const id of siblingHeartIds(params.id)) {
		if (related.length >= RELATED_LIMIT) break;
		const design = getGalleryDesign(id);
		if (design) related.push({ id, name: HEART_META[id]?.name ?? id, design });
	}

	return {
		meta: HEART_META[params.id] ?? null,
		design: getGalleryDesign(params.id),
		/**
		 * The written paragraph for a gallery heart, already in the language of this
		 * URL — `/hjerte/<id>/` is Danish and `/en/hjerte/<id>/` English, and both are
		 * prerendered, so only the one language ends up in each page's data. `null`
		 * for a user's own or a shared heart; those show what their maker typed.
		 */
		description: heartDescription(params.id, params.lang === 'en' ? 'en' : 'da'),
		shared: params.id === SHARED_HEART_ID,
		/** The gallery category this heart is in — null for user/shared hearts. */
		categoryId: (category?.id ?? null) as CategoryId | null,
		/** How many hearts that category holds in total (for "Se alle N …"). */
		categoryCount: category?.hearts.length ?? 0,
		related
	};
};
