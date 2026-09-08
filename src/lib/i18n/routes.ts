import { base } from '$app/paths';
import { langFromPathname } from './index';
import type { Language } from './translations';

/**
 * The site's URLs in both languages, in one place.
 *
 * Danish is the default and has no prefix; English lives under /en/. Most pages
 * mirror by prefixing (/editor/ ↔ /en/editor/), but the guide and about pages
 * have different slugs per language (/saadan-goer-du/ ↔ /en/how-to/), so the old
 * "slice /en off the pathname" trick produces wrong URLs for them. Everything
 * that maps a URL from one language to the other — the language toggle, the
 * hreflang alternates in the root layout and the sitemap — must go through this
 * module.
 *
 * Paths here are root-absolute and always end in a slash (trailingSlash =
 * 'always'). They do NOT include SvelteKit's `base`; use href()/heartHref() for
 * link targets, and the raw paths for absolute URLs built from SITE_URL.
 */
export type RouteKey = 'home' | 'editor' | 'paint' | 'howTo' | 'about';

export const ROUTES: Record<RouteKey, Record<Language, string>> = {
	home: { da: '/', en: '/en/' },
	editor: { da: '/editor/', en: '/en/editor/' },
	// The editor's second mode (docs/redesign/PAINT.md §1). The two slugs differ,
	// so the language toggle and the hreflang alternates have to read them here.
	paint: { da: '/editor/mal/', en: '/en/editor/paint/' },
	howTo: { da: '/saadan-goer-du/', en: '/en/how-to/' },
	about: { da: '/om/', en: '/en/about/' }
};

export const ROUTE_KEYS = Object.keys(ROUTES) as RouteKey[];

const LANGUAGES: Language[] = ['da', 'en'];

/** The path of a known page, without `base`. */
export function path(key: RouteKey, lang: Language): string {
	return ROUTES[key][lang];
}

/** The path of a known page as a link target (i.e. with `base` applied). */
export function href(key: RouteKey, lang: Language): string {
	return `${base}${ROUTES[key][lang]}`;
}

/** /hjerte/<id>/ in the given language, without `base`. */
export function heartPath(id: string, lang: Language): string {
	return `${lang === 'en' ? '/en' : ''}/hjerte/${id}/`;
}

/** /hjerte/<id>/ as a link target. */
export function heartHref(id: string, lang: Language): string {
	return `${base}${heartPath(id, lang)}`;
}

/**
 * A link to an anchor on the front page, e.g. `/#stjerner` or
 * `/en/#heart-jul`. The detail page and the editor both link back this way.
 */
export function homeAnchorHref(anchor: string, lang: Language): string {
	return `${href('home', lang)}#${anchor}`;
}

/**
 * A link to one gallery category on the front page, e.g. `/#stjerner`.
 * The category ids are the ones in hearts.json and are the same in both
 * languages (klassiske, stjerner, moenstre, figurer, hjerter).
 */
export function categoryHref(categoryId: string, lang: Language): string {
	return homeAnchorHref(categoryId, lang);
}

/**
 * A link into the editor, e.g. `/en/editor/?from=jul` — `suffix` is the query
 * string and/or `#design=` fragment the editor reads its input from.
 */
export function editorHref(lang: Language, suffix = ''): string {
	return `${href('editor', lang)}${suffix}`;
}

export function otherLanguage(lang: Language): Language {
	return lang === 'en' ? 'da' : 'en';
}

function stripBase(pathname: string, basePath = ''): string {
	let p = pathname;
	if (basePath && p.startsWith(basePath)) p = p.slice(basePath.length) || '/';
	if (!p.startsWith('/')) p = `/${p}`;
	return p;
}

function withTrailingSlash(p: string): string {
	return p.endsWith('/') ? p : `${p}/`;
}

/** The route key a path belongs to, in either language, or null. */
export function routeKeyFromPathname(pathname: string, basePath = ''): RouteKey | null {
	const p = withTrailingSlash(stripBase(pathname, basePath));
	for (const key of ROUTE_KEYS) {
		for (const lang of LANGUAGES) {
			if (ROUTES[key][lang] === p) return key;
		}
	}
	return null;
}

/**
 * The same page in the given language, as a root-absolute path without `base`.
 * Known pages come from the table (so differing slugs are handled); everything
 * else — /hjerte/<id>/ and any future prefixed route — falls back to adding or
 * removing the /en prefix.
 */
export function pathInLanguage(pathname: string, lang: Language, basePath = ''): string {
	const p = withTrailingSlash(stripBase(pathname, basePath));
	const key = routeKeyFromPathname(p);
	if (key) return ROUTES[key][lang];

	const neutral = p === '/en/' ? '/' : p.startsWith('/en/') ? p.slice('/en'.length) : p;
	if (lang === 'da') return neutral;
	return neutral === '/' ? '/en/' : `/en${neutral}`;
}

/** Both language variants of a path, for hreflang/canonical tags and the sitemap. */
export function alternatePaths(pathname: string, basePath = ''): Record<Language, string> {
	return {
		da: pathInLanguage(pathname, 'da', basePath),
		en: pathInLanguage(pathname, 'en', basePath)
	};
}

/**
 * Link target for the language toggle: the current page in the other language,
 * with `base` applied and the current query string and hash carried over.
 */
export function otherLanguageUrl(pathname: string, search = '', hash = '', basePath = base): string {
	const lang = langFromPathname(pathname, basePath);
	return `${basePath}${pathInLanguage(pathname, otherLanguage(lang), basePath)}${search}${hash}`;
}
