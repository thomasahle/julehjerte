/**
 * Every gallery heart's name per site language: the SVG's plain `<title>` is its
 * own name, and `<title xml:lang="da">` / `<title xml:lang="en">` override it
 * where the language needs another (docs/ADDING-A-HEART.md). This reads each
 * listed SVG as it is on disk, through the site's own parser, and checks that
 * every heart has a name in both languages, that no two hearts share one in
 * either, and that the generated heart-meta.json and heart-cards.json carry
 * the same names — i.e. that `npm run generate:heart-data` was run after the
 * SVG was edited.
 */
import { describe, expect, it } from 'vitest';
import { ALL_HEART_IDS } from './categories';
import meta from './heart-meta.json';
import cards from './heart-cards.json';
import { parseHeartFromSVG } from '$lib/utils/heartDesign';
import { heartName } from '$lib/utils/heartName';
import type { HeartNames } from '$lib/types/heart';

const SVG_TEXT = import.meta.glob<string>('/static/hearts/*.svg', {
	query: '?raw',
	import: 'default',
	eager: true
});
type Named = { name: string; names?: HeartNames };
const META = meta as Record<string, Named>;
const CARDS = cards as Record<string, Named & { difficulty: string }>;

const designs = Object.fromEntries(
	ALL_HEART_IDS.map((id) => [id, parseHeartFromSVG(SVG_TEXT[`/static/hearts/${id}.svg`]!, `${id}.svg`)!])
);

describe('gallery heart names', () => {
	for (const lang of ['da', 'en'] as const) {
		it(`gives every heart a non-empty ${lang} name, none shared by two hearts`, () => {
			const names = ALL_HEART_IDS.map((id) => heartName(designs[id]!, lang).trim());
			for (const [i, name] of names.entries()) expect(name, ALL_HEART_IDS[i]).not.toBe('');
			const twice = names.filter((name, i) => names.indexOf(name) !== i);
			expect(twice, `${lang} names used by more than one heart`).toEqual([]);
		});
	}

	it('gives the hearts named in the other language a name of their own (spot checks)', () => {
		expect(heartName(designs['amy-weave-1']!, 'da')).toBe('Flet 1');
		expect(heartName(designs['amy-weave-1']!, 'en')).toBe('Weave 1');
		expect(heartName(designs['flower']!, 'da')).toBe('Blomst');
		expect(heartName(designs['flower']!, 'en')).toBe('Flower');
		// No language title: the plain one in both.
		expect(designs['jul']!.names).toBeUndefined();
		expect(heartName(designs['jul']!, 'en')).toBe('JUL');
	});

	it('heart-meta.json and heart-cards.json carry the SVGs\' names (run npm run generate:heart-data)', () => {
		for (const id of ALL_HEART_IDS) {
			const { name, names } = designs[id]!;
			expect({ name: META[id]!.name, names: META[id]!.names }, `meta ${id}`).toEqual({ name, names });
			expect({ name: CARDS[id]!.name, names: CARDS[id]!.names }, `cards ${id}`).toEqual({ name, names });
			// A card stays small: its name(s) and difficulty, nothing else.
			expect(Object.keys(CARDS[id]!).sort(), `cards ${id}`).toEqual(
				names ? ['difficulty', 'name', 'names'] : ['difficulty', 'name']
			);
		}
	});
});
