import type { PageLoad } from './$types';
import heartsData from '$lib/data/hearts.json';
import heartMeta from '$lib/data/heart-meta.json';
import type { DifficultyLevel } from '$lib/utils/difficulty';

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

	// Generate entries for both languages (da = default/no lang, en)
	return [
		...allHeartIds.map((id) => ({ lang: undefined, id })), // Danish (default)
		...allHeartIds.map((id) => ({ lang: 'en', id })) // English
	];
}

// Gallery hearts get their metadata at build time so the prerendered HTML has the
// real title, description and header. User-created hearts (localStorage) have no
// metadata here and are loaded entirely in the browser.
export const load: PageLoad = ({ params }) => {
	return {
		meta: HEART_META[params.id] ?? null
	};
};
