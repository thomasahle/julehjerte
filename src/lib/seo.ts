import { SITE_NAME, SITE_TITLE, SITE_TITLE_EN, SITE_URL } from '$lib/config';
import { t, type Language } from '$lib/i18n';
import type { RouteKey } from '$lib/i18n/routes';

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
