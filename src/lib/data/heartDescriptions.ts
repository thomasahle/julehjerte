/**
 * The paragraph the detail page prints under each gallery heart's name.
 *
 * The texts are written into each gallery SVG as `<desc xml:lang="da">` and
 * `<desc xml:lang="en">` right after its `<title>` (see docs/ADDING-A-HEART.md
 * for the house style). `scripts/generate-heart-data.mjs` collects them into
 * `heart-descriptions.json`, which this module serves. They are kept out of
 * `heart-meta.json` and `heart-designs.json`, which carry the parser's one
 * single-language legacy `description` per heart: the detail route resolves the
 * visitor's language in its `load` (see
 * `src/routes/[[lang=lang]]/hjerte/[id]/+page.ts`) and imports this module
 * lazily, so the prose stays out of the bundle every page loads.
 *
 * They are *not* translation keys: `translations.ts` holds the site's interface
 * strings. `heartDescriptions.test.ts` and `heartSvgDescriptions.test.ts` guard
 * them instead.
 *
 * Hearts a visitor drew or received by link are not in this map; they keep
 * whatever description their maker typed into the editor.
 */
import descriptions from './heart-descriptions.json';
import type { Language } from '$lib/i18n';

/** The same paragraph in both site languages. */
export type HeartDescription = Record<Language, string>;

export const HEART_DESCRIPTIONS: Record<string, HeartDescription> = descriptions;

/** The written paragraph for a gallery heart, or `null` for any other heart. */
export function heartDescription(id: string, lang: Language): string | null {
	return HEART_DESCRIPTIONS[id]?.[lang] ?? null;
}
