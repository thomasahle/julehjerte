/**
 * The gallery's categories: their ids, their order, the hearts in them and
 * their names in both languages.
 *
 * The ids and the heart lists are the ones in `hearts.json` — that file is the
 * single source of truth for *which* hearts exist and in what order; each
 * heart's texts live in its own SVG. What lives here is the
 * mapping from a category id to its translation keys, plus the lookups several
 * pages need (the front page renders every category; the detail page needs the
 * category a heart belongs to and its siblings for the "Flere {kategori}" grid).
 *
 * The category ids double as the front page's section anchors
 * (`/#stjerner`), so they must not be renamed — see `categoryHref()` in
 * `$lib/i18n/routes`.
 */
import hearts from '../../../hearts.json';
import { SITE_DOMAIN, SITE_URL } from '$lib/config';
import { t, type Language } from '$lib/i18n';
import { escherEditorHref, generatorHref, heartPath, href } from '$lib/i18n/routes';
import type { TranslationKey } from '$lib/i18n/translations';

export type CategoryId = 'klassiske' | 'stjerner' | 'moenstre' | 'fliser' | 'figurer' | 'tekst' | 'hjerter';

/**
 * The synthetic category the front page appends for hearts the visitor drew
 * themselves. It is not in `hearts.json` (those hearts live in localStorage),
 * but it is titled the same way, so it gets a title key here too.
 */
export const MY_HEARTS_CATEGORY_ID = 'mine';

export interface Category {
	id: CategoryId;
	/** Heart ids, in gallery order. */
	hearts: string[];
	/** "Stjerner" / "Stars" — headings, breadcrumbs. */
	titleKey: TranslationKey;
	/**
	 * "stjerner" / "stars" — the lower-case form used mid-sentence, e.g.
	 * "Flere stjerner" and "Se alle 10 stjerner". Danish and English differ in
	 * more than casing here ("hjerter" → "hearts", "klassiske" → "classic
	 * hearts"), so it is a separate key rather than a `toLowerCase()`.
	 */
	lowerTitleKey: TranslationKey;
}

const TITLE_KEYS: Record<CategoryId, TranslationKey> = {
	klassiske: 'categoryKlassiske',
	stjerner: 'categoryStjerner',
	moenstre: 'categoryMoenstre',
	fliser: 'categoryFliser',
	figurer: 'categoryFigurer',
	tekst: 'categoryTekst',
	hjerter: 'categoryHjerter'
};

const LOWER_TITLE_KEYS: Record<CategoryId, TranslationKey> = {
	klassiske: 'categoryKlassiskeLower',
	stjerner: 'categoryStjernerLower',
	moenstre: 'categoryMoenstreLower',
	fliser: 'categoryFliserLower',
	figurer: 'categoryFigurerLower',
	tekst: 'categoryTekstLower',
	hjerter: 'categoryHjerterLower'
};

/** Every category, in the order `hearts.json` lists them (= gallery order). */
export const CATEGORIES: Category[] = hearts.categories.map((category) => {
	const id = category.id as CategoryId;
	return {
		id,
		hearts: [...category.hearts],
		titleKey: TITLE_KEYS[id],
		lowerTitleKey: LOWER_TITLE_KEYS[id]
	};
});

export const CATEGORY_IDS: CategoryId[] = CATEGORIES.map((category) => category.id);

/** Every gallery heart id, in gallery order. Excludes user-created hearts. */
export const ALL_HEART_IDS: string[] = CATEGORIES.flatMap((category) => category.hearts);

const BY_ID = new Map<string, Category>(CATEGORIES.map((category) => [category.id, category]));

const BY_HEART_ID = new Map<string, Category>(
	CATEGORIES.flatMap((category) => category.hearts.map((id) => [id, category] as const))
);

const GALLERY_IDS = new Set<string>(ALL_HEART_IDS);

/**
 * Whether `id` is a gallery heart: one of hearts.json's, with a page of its
 * own. A heart drawn in the editor, or received by link (/hjerte/delt/), is not.
 */
export function isGalleryHeart(id: string): boolean {
	return GALLERY_IDS.has(id);
}

/**
 * Where a file that leaves the site says a heart can be found again: a gallery
 * heart's own page in `lang`, or null for any other heart. Such a heart exists
 * only in its maker's browser (or in a link), so its page would be a dead
 * address for anyone the file reaches; the caller then names the site.
 *
 * `absolute`: a link, `https://juleflet.dk/en/hjerte/<id>/` (the laser file's
 * `<desc>`); otherwise the shortest text that gets there,
 * `juleflet.dk/en/hjerte/<id>` (printed in a PDF template's ear).
 */
export function heartAddress(id: string, lang: Language, { absolute }: { absolute: boolean }): string | null {
	if (!isGalleryHeart(id)) return null;
	const page = heartPath(id, lang);
	return absolute ? `${SITE_URL}${page}` : `${SITE_DOMAIN}${page.replace(/\/$/, '')}`;
}

export function getCategory(id: string): Category | null {
	return BY_ID.get(id) ?? null;
}

/** The category a gallery heart belongs to, or null for user/shared hearts. */
export function categoryOfHeart(heartId: string): Category | null {
	return BY_HEART_ID.get(heartId) ?? null;
}

/**
 * The other hearts in the same category, in gallery order. Empty for a heart
 * that is not in the gallery (a user-created or shared design).
 */
export function siblingHeartIds(heartId: string): string[] {
	const category = categoryOfHeart(heartId);
	if (!category) return [];
	return category.hearts.filter((id) => id !== heartId);
}

/**
 * Where a visitor makes their own heart of a category's kind, for the gallery's last card in it
 * (MakeOwnCard): a pattern in Tegn, a tiling in its Escher tab, a figure or a text on the design page.
 */
const MAKE_OWN: Partial<Record<CategoryId, { label: TranslationKey; href: (lang: Language) => string }>> = {
	moenstre: { label: 'makeOwnPattern', href: (lang) => href('editor', lang) },
	fliser: { label: 'makeOwnTiling', href: escherEditorHref },
	figurer: { label: 'makeOwnFigure', href: (lang) => generatorHref(lang, 'figure') },
	tekst: { label: 'makeOwnText', href: (lang) => generatorHref(lang, 'text') }
};

/** The link and words of a category's "make your own" card, or null for a category without one. */
export function makeOwnLink(id: string, lang: Language): { href: string; label: string } | null {
	const make = MAKE_OWN[id as CategoryId];
	return make ? { href: make.href(lang), label: t(make.label, lang) } : null;
}

/** "Stjerner" / "Stars". Also handles the synthetic "mine" category. */
export function categoryTitle(id: string, lang: Language): string {
	if (id === MY_HEARTS_CATEGORY_ID) return t('categoryMine', lang);
	const category = getCategory(id);
	return category ? t(category.titleKey, lang) : id;
}

/** "stjerner" / "stars" — for use mid-sentence. */
export function categoryTitleLower(id: string, lang: Language): string {
	const category = getCategory(id);
	return category ? t(category.lowerTitleKey, lang) : categoryTitle(id, lang).toLowerCase();
}
