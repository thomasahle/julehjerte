import type { PageLoad } from './$types';
import heartsData from '$lib/data/hearts.json';
import heartMeta from '$lib/data/heart-meta.json';
import type { DifficultyLevel } from '$lib/utils/difficulty';
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
export const load: PageLoad = async ({ params }) => {
	// Imported lazily so the ~330 KB of design data gets its own cacheable chunk.
	const { getGalleryDesign } = await import('$lib/data/heartDesigns');
	return {
		meta: HEART_META[params.id] ?? null,
		design: getGalleryDesign(params.id),
		shared: params.id === SHARED_HEART_ID
	};
};
