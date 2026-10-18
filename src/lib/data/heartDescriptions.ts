/**
 * The paragraph the detail page prints under each gallery heart's name.
 *
 * The texts live in `hearts.json`, beside each heart's id and category, so
 * adding a heart means editing one file (see docs/ADDING-A-HEART.md). They are
 * not in `heart-meta.json`: that file is regenerated from the SVGs by
 * `scripts/generate-heart-data.mjs` and carries one single-language
 * `description` per heart, and these are written by hand in both site
 * languages. The detail route resolves the visitor's language in its `load`
 * (see `src/routes/[[lang=lang]]/hjerte/[id]/+page.ts`) and imports this module
 * lazily, so the prose stays out of the bundle every page loads —
 * `$lib/data/categories` reads hearts.json through `?index`, without it.
 *
 * They are *not* translation keys: `translations.ts` holds the site's interface
 * strings. `heartDescriptions.test.ts` and `hearts.test.ts` guard them instead.
 *
 * House style, because the owner will read every one of them: two to four plain
 * sentences saying what the woven pattern shows, how many strips each half has
 * and whether they are cut straight or curved, whether one template covers both
 * halves, and the difficulty with one practical tip. The first sentence is
 * short, since it doubles as the page's meta description. Facts only — the
 * name, author, grid, difficulty and symmetry in `heart-meta.json` and what the
 * design itself shows. No history or authorship that is not already recorded
 * there.
 *
 * Hearts a visitor drew or received by link are not in this map; they keep
 * whatever description their maker typed into the editor.
 */
import hearts from '../../../hearts.json';
import type { Language } from '$lib/i18n';

/** The same paragraph in both site languages. */
export type HeartDescription = Record<Language, string>;

export const HEART_DESCRIPTIONS: Record<string, HeartDescription> = Object.fromEntries(
	hearts.categories.flatMap((category) =>
		category.hearts.map((heart) => [heart.id, heart.description] as const)
	)
);

/** The written paragraph for a gallery heart, or `null` for any other heart. */
export function heartDescription(id: string, lang: Language): string | null {
	return HEART_DESCRIPTIONS[id]?.[lang] ?? null;
}
