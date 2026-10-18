import { SITE_NAME, SITE_TITLE, SITE_TITLE_EN, SITE_URL } from '$lib/config';
import { t, type Language } from '$lib/i18n';
import type { RouteKey } from '$lib/i18n/routes';
import { plainDescription } from '$lib/utils/descriptionLinks';
import { truncateAtSentence, truncateAtWord } from '$lib/utils/text';

/** Keep the browser title and social title in agreement on every public route. */
export function pageTitle(route: RouteKey | null, lang: Language): string {
	if (route === 'howTo') return `${t('howToBrowserTitle', lang)} | ${SITE_NAME}`;
	if (route === 'noPrinter') return `${t('noPrinterTitle', lang)} | ${SITE_NAME}`;
	if (route === 'about') return `${t('aboutTitle', lang)} | ${SITE_NAME}`;
	if (route === 'editor') return `${t('heroDesignHeart', lang)} | ${SITE_NAME}`;
	if (route === 'paint') return `${t('paintPageTitle', lang)} | ${SITE_NAME}`;
	return lang === 'en' ? SITE_TITLE_EN : SITE_TITLE;
}

export function heartPageTitle(id: string, name: string, lang: Language): string {
	if (id === 'classic-3x3') return `${t('classicHeartBrowserTitle', lang)} | ${SITE_NAME}`;
	if (id === 'stjerne') return `${t('starHeartBrowserTitle', lang)} | ${SITE_NAME}`;
	return `${t('heartBrowserTitle', lang, { name })} | ${SITE_NAME}`;
}

// A new path prevents old artwork at /og/<id>.png from being reused from image
// caches. Public gallery hearts have static cards; browser-only shared designs
// cannot have a bespoke crawler preview without server-side storage.
export function socialImage(lang: Language, heartId?: string): string {
	return `${SITE_URL}/og/social/${lang}/${heartId ?? 'home'}.png`;
}

/**
 * The longest meta description a heart page writes. A search result shows
 * about 160 characters; the margin keeps a few for the "…" engines add.
 */
export const META_DESCRIPTION_MAX = 155;

/**
 * A heart page's meta description: the one-line intro (name and grid), as many
 * whole sentences of the page's paragraph as fit, and the download line —
 * never more than META_DESCRIPTION_MAX characters.
 *
 * The download line is the first thing to go when the prose needs the room: a
 * sentence about the heart says more than an offer every page makes. If not
 * even the paragraph's first sentence fits after the intro, it is cut at a word
 * with "…". The paragraph on the page itself is never shortened.
 */
export function heartMetaDescription(
	heart: { name: string; x: number; y: number },
	description: string | null,
	lang: Language
): string {
	const intro = t('heartMetaDescription', lang, heart);
	const download = t('heartMetaDownload', lang);
	const max = META_DESCRIPTION_MAX;
	const join = (...parts: string[]) => parts.filter(Boolean).join(' ');
	// Links in the paragraph are plain words here (descriptionLinks).
	const prose = plainDescription(description?.trim() ?? '').replace(/([^.!?])$/, '$1.');

	if (prose) {
		// Room left for prose with and without the download line (each part is
		// preceded by a space).
		const withDownload = max - intro.length - download.length - 2;
		const alone = max - intro.length - 1;
		for (const [room, tail] of [
			[withDownload, download],
			[alone, '']
		] as const) {
			const cut = room > 0 ? truncateAtSentence(prose, room) : '';
			if (cut && !cut.endsWith('…')) return join(intro, cut, tail);
		}
		if (alone > 1) return join(intro, truncateAtWord(prose, alone));
	}
	return truncateAtWord(join(intro, download), max);
}
