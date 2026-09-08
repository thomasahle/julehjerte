import type { PageLoad } from './$types';
import { browser } from '$app/environment';
import index from '$lib/data/hearts.json';
import heartCards from '$lib/data/heart-cards.json';
import { appHasStarted } from '$lib/hydration';
import { CLAIM_PRERENDERED, type GalleryHeart } from '$lib/front/galleryHearts';
import { HERO_HEART_IDS, HERO_HEART_IDS_MOBILE } from '$lib/utils/randomHearts';
import { HERO_PICKS_ATTRIBUTE, heroBootstrapScript } from '$lib/front/heroBootstrap';
import { HERO_SLOTS_MOBILE } from '$lib/components/front/heroSlots';
import { t, type Language } from '$lib/i18n';
import type { HeartDesign } from '$lib/types/heart';
import type { DifficultyLevel } from '$lib/utils/difficulty';

// Enable SSR for meta tags (crawlers need them in initial HTML)
export const prerender = true;
export const ssr = true;

// name + difficulty per gallery heart, generated alongside heart-meta.json. It
// is the only thing about a heart the front page downloads, so it is its own
// file: heart-meta.json carries seven more fields the gallery never shows.
const CARDS = heartCards as Record<string, { name: string; difficulty: DifficultyLevel }>;

/**
 * The front page's hearts.
 *
 * The gallery is 38 finished heart SVGs and they are all in the prerendered
 * HTML, so this load function's job in the browser is mostly to *not* fetch
 * anything: the hearts' geometry is 295 KB and the browser has no use for a
 * drawing it is already showing. See $lib/front/galleryHearts.
 *
 * That leaves three cases, and `browser` alone tells apart only the first:
 *
 *   prerendering  draw every heart once, here, and hand the cards their SVG as
 *                 a string. The heart data is imported lazily so the 330 KB
 *                 stays in a chunk of its own, which the browser never asks for.
 *   hydrating     hand the cards CLAIM_PRERENDERED instead: the SVGs in the
 *                 HTML are adopted as they are and nothing is rebuilt. The hero
 *                 is read back out of the DOM, because the inline bootstrap has
 *                 already chosen its hearts (see $lib/front/heroBootstrap).
 *   navigating    a client-side navigation to the front page: none of that HTML
 *                 exists, so the hearts have to be drawn after all and the
 *                 designs are fetched like before.
 */
export const load: PageLoad = async ({ params }) => {
	const indexCategories = Array.isArray(index.categories) ? index.categories : [];
	const ids = indexCategories.flatMap((category) => category.hearts);
	const lang = (params.lang === 'en' ? 'en' : 'da') as Language;

	// What a card shows besides the heart: its name and its difficulty. The
	// difficulty used to be computed from the geometry, which is exactly what is
	// no longer downloaded, so it is read off the build-time data instead.
	const hearts: Record<string, GalleryHeart> = {};
	for (const id of ids) {
		const card = CARDS[id];
		if (card) hearts[id] = { id, name: card.name, difficulty: card.difficulty };
	}

	if (!browser) {
		const { getGalleryDesign } = await import('$lib/data/heartDesigns');
		const { renderHeartSvg } = await import('$lib/rendering/prerenderHeart');

		const markup: Record<string, string> = {};
		for (const id of ids) {
			const design = getGalleryDesign(id);
			if (design) markup[id] = renderHeartSvg(design, `card-${id}`);
		}
		// The hero's own copies: same hearts, but PaperHeartSVG's clip-path ids are
		// document-global, so each slot needs its own. Only a visitor without
		// JavaScript ever sees these — the bootstrap script replaces them.
		const heroSlot = (id: string, idPrefix: string) => {
			const design = getGalleryDesign(id);
			return design ? renderHeartSvg(design, idPrefix) : undefined;
		};

		return {
			indexCategories,
			hearts,
			markup,
			designs: null,
			heroIds: { desktop: [...HERO_HEART_IDS], mobile: [...HERO_HEART_IDS_MOBILE] },
			heroMarkup: {
				desktop: HERO_HEART_IDS.map((id, i) => heroSlot(id, `hero-d-${i}-${id}`)),
				mobile: HERO_HEART_IDS_MOBILE.map((id, i) => heroSlot(id, `hero-m-${i}-${id}`))
			},
			// The label still carries its {name} placeholder; the script fills in
			// whichever heart it hangs in the slot.
			heroScript: heroBootstrapScript(t('heroGoToHeart', lang)) as string | null
		};
	}

	if (appHasStarted()) {
		const { getGalleryDesign } = await import('$lib/data/heartDesigns');
		const designs: Record<string, HeartDesign> = {};
		for (const id of ids) {
			const design = getGalleryDesign(id);
			if (design) designs[id] = design;
		}
		return {
			indexCategories,
			hearts,
			markup: null,
			designs,
			heroIds: { desktop: [...HERO_HEART_IDS], mobile: [...HERO_HEART_IDS_MOBILE] },
			heroMarkup: null,
			heroScript: null as string | null
		};
	}

	// The bootstrap script ran while the page parsed and left its draw on the
	// root element. Rendering those hearts rather than the prerendered ones is
	// what keeps hydration from writing the wrong card link back over each slot.
	const picked = (document.documentElement.getAttribute(HERO_PICKS_ATTRIBUTE) ?? '')
		.split(' ')
		.filter((id) => id in hearts);
	const heroDesktopIds = picked.length === HERO_HEART_IDS.length ? picked : [...HERO_HEART_IDS];
	const claimed = Object.fromEntries(ids.map((id) => [id, CLAIM_PRERENDERED]));

	return {
		indexCategories,
		hearts,
		markup: claimed,
		designs: null,
		heroIds: {
			desktop: heroDesktopIds,
			mobile:
				picked.length === HERO_HEART_IDS.length
					? picked.slice(0, HERO_SLOTS_MOBILE.length)
					: [...HERO_HEART_IDS_MOBILE]
		},
		heroMarkup: {
			desktop: HERO_HEART_IDS.map(() => CLAIM_PRERENDERED),
			mobile: HERO_HEART_IDS_MOBILE.map(() => CLAIM_PRERENDERED)
		},
		heroScript: null as string | null
	};
};
