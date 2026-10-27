import { SITE_DESCRIPTION, SITE_DESCRIPTION_EN, SITE_NAME, SITE_TITLE, SITE_TITLE_EN, SITE_URL } from '$lib/config';
import { t, type Language } from '$lib/i18n';
import { ROUTES, heartPath, type RouteKey } from '$lib/i18n/routes';
import { HEART_IMAGE_SIZE, heartImagePath } from '$lib/heartImage';
import { plainDescription } from '$lib/utils/descriptionLinks';
import { truncateAtSentence, truncateAtWord } from '$lib/utils/text';

/**
 * An indexable page's robots directive. max-image-preview:large lets a search
 * result show its picture at full width (Google's default is "standard").
 */
export const ROBOTS_INDEX = 'index, follow, max-image-preview:large';

/** Keep the browser title and social title in agreement on every public route. */
export function pageTitle(route: RouteKey | null, lang: Language): string {
	if (route === 'howTo') return `${t('howToBrowserTitle', lang)} | ${SITE_NAME}`;
	if (route === 'noPrinter') return `${t('noPrinterTitle', lang)} | ${SITE_NAME}`;
	if (route === 'archive') return `${t('archiveTitle', lang)} | ${SITE_NAME}`;
	if (route === 'about') return `${t('aboutTitle', lang)} | ${SITE_NAME}`;
	if (route === 'generator') return `${t('generatorTitle', lang)} | ${SITE_NAME}`;
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
 * The front page's social card: seven gallery hearts on the page background,
 * with only the wordmark, so one image serves both languages. The text card at
 * socialImage(lang) is still built and still serves the other pages.
 */
export const FRONT_PAGE_SOCIAL_IMAGE = `${SITE_URL}/og/social/gallery.png`;

/** Absolute URL of a gallery heart's square picture ($lib/heartImage). */
export function heartImageUrl(id: string): string {
	return `${SITE_URL}${heartImagePath(id)}`;
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

type JsonLd = Record<string, unknown>;

/**
 * One `<script type="application/ld+json">` element for the head. Every `<`
 * in the JSON is written as `\u003c`, which JSON reads as the same character,
 * so no string in it (a heart's name, a description) can close the script
 * element or open a comment.
 */
export function jsonLdScript(data: JsonLd): string {
	const json = JSON.stringify(data).replace(/</g, '\\u003c');
	return `<script type="application/ld+json">${json}</script>`;
}

/** Credits that name no person: the traditional patterns. */
const NO_PERSON = new Set(['traditional', 'klassisk', 'ukendt', 'unknown']);

/**
 * The people a heart's credit names, as schema.org Persons: "Thomas Ahle &
 * Claude" is two. The credit's link belongs to a single author only.
 */
function authorPersons(author: string | null, authorUrl: string | null): JsonLd[] {
	const name = author?.trim();
	if (!name || NO_PERSON.has(name.toLowerCase())) return [];
	const names = name.split(/\s+&\s+/).filter(Boolean);
	return names.map((n) => ({
		'@type': 'Person',
		name: n,
		...(authorUrl && names.length === 1 ? { url: authorUrl } : {})
	}));
}

/** The HowTo's node id, so the page's WebPage can name it as its main entity. */
const howToId = (url: string) => `${url}#howto`;

/**
 * A gallery heart page's structured data: a schema.org HowTo for making that
 * heart. The steps are the guide's three stages, in the guide's own words, each
 * linking to its section of the guide page. The images are the square picture
 * first (what a search result's thumbnail is cut from) and the 1200x630 social
 * card second.
 */
export function heartHowToJsonLd(heart: {
	id: string;
	name: string;
	description: string;
	author: string | null;
	authorUrl: string | null;
	lang: Language;
}): JsonLd {
	const { id, lang } = heart;
	const url = `${SITE_URL}${heartPath(id, lang)}`;
	const guide = `${SITE_URL}${ROUTES.howTo[lang]}`;
	const step = (name: string, text: string, anchor: string) => ({
		'@type': 'HowToStep',
		name,
		text,
		url: `${guide}#${anchor}`
	});
	const author = authorPersons(heart.author, heart.authorUrl);
	return {
		'@context': 'https://schema.org',
		'@type': 'HowTo',
		'@id': howToId(url),
		name: heart.name,
		description: heart.description,
		url,
		inLanguage: lang,
		image: [
			{
				'@type': 'ImageObject',
				url: heartImageUrl(id),
				width: HEART_IMAGE_SIZE,
				height: HEART_IMAGE_SIZE
			},
			{ '@type': 'ImageObject', url: socialImage(lang, id), width: 1200, height: 630 }
		],
		supply: [{ '@type': 'HowToSupply', name: t('howToSupplyPaper', lang) }],
		tool: [{ '@type': 'HowToTool', name: t('howToToolScissors', lang) }],
		step: [
			step(t('guidePrepareTitle', lang), t('guidePrepareNote', lang), 'prepare-heading'),
			step(t('guideWeaveTitle', lang), t('guideWeaveIntro', lang), 'weave-heading'),
			step(t('guideFinishTitle', lang), t('guideFinishText', lang), 'finish-heading')
		],
		...(author.length ? { author: author.length === 1 ? author[0] : author } : {})
	};
}

/**
 * A gallery heart page's other structured data: the page itself, a schema.org
 * WebPage whose primary image is the square picture and whose main entity is
 * the HowTo (heartHowToJsonLd). These are two of the ways Google lets a page
 * say which picture its search result should show.
 */
export function heartWebPageJsonLd(heart: { id: string; name: string; lang: Language }): JsonLd {
	const { id, lang } = heart;
	const url = `${SITE_URL}${heartPath(id, lang)}`;
	return {
		'@context': 'https://schema.org',
		'@type': 'WebPage',
		'@id': url,
		url,
		name: heartPageTitle(id, heart.name, lang),
		inLanguage: lang,
		primaryImageOfPage: {
			'@type': 'ImageObject',
			url: heartImageUrl(id),
			width: HEART_IMAGE_SIZE,
			height: HEART_IMAGE_SIZE
		},
		mainEntity: { '@id': howToId(url) }
	};
}

/**
 * The front page's structured data: a CollectionPage whose main entity is the
 * gallery, every heart in gallery order with its page and square picture.
 */
export function frontPageJsonLd(
	hearts: { id: string; name: string }[],
	lang: Language
): JsonLd {
	const url = `${SITE_URL}${ROUTES.home[lang]}`;
	return {
		'@context': 'https://schema.org',
		'@type': 'CollectionPage',
		name: pageTitle('home', lang),
		description: lang === 'en' ? SITE_DESCRIPTION_EN : SITE_DESCRIPTION,
		url,
		inLanguage: lang,
		image: FRONT_PAGE_SOCIAL_IMAGE,
		mainEntity: {
			'@type': 'ItemList',
			numberOfItems: hearts.length,
			itemListElement: hearts.map((heart, i) => ({
				'@type': 'ListItem',
				position: i + 1,
				url: `${SITE_URL}${heartPath(heart.id, lang)}`,
				name: heart.name,
				image: heartImageUrl(heart.id)
			}))
		}
	};
}
