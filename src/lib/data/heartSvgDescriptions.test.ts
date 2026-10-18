/**
 * Every gallery heart's two written paragraphs live in its SVG as
 * `<desc xml:lang="da">` and `<desc xml:lang="en">` (docs/ADDING-A-HEART.md).
 * This reads each listed SVG as it is on disk, through the site's own parser,
 * and checks that both texts are there and that the generated
 * heart-descriptions.json (what the detail page serves) matches them — i.e.
 * that `npm run generate:heart-data` was run after the SVG was edited.
 */
import { describe, expect, it } from 'vitest';
import { ALL_HEART_IDS } from './categories';
import generated from './heart-descriptions.json';
import { parseHeartFromSVG } from '$lib/utils/heartDesign';

const SVG_TEXT = import.meta.glob<string>('/static/hearts/*.svg', {
	query: '?raw',
	import: 'default',
	eager: true
});
const GENERATED: Record<string, { da: string; en: string }> = generated;

describe('gallery SVG descriptions', () => {
	it.each(ALL_HEART_IDS)('static/hearts/%s.svg has non-empty da and en <desc>', (id) => {
		const text = SVG_TEXT[`/static/hearts/${id}.svg`];
		expect(text, `static/hearts/${id}.svg`).toBeTypeOf('string');
		const doc = new DOMParser().parseFromString(text!, 'image/svg+xml');
		const XML_NS = 'http://www.w3.org/XML/1998/namespace';
		const langs = Array.from(doc.getElementsByTagName('desc'))
			.map((el) => el.getAttributeNS(XML_NS, 'lang'))
			.filter(Boolean);
		expect(langs.sort(), `${id}: one <desc> per language`).toEqual(['da', 'en']);

		const design = parseHeartFromSVG(text!, `${id}.svg`);
		expect(design?.descriptions?.da?.trim(), `${id}.da is empty`).toBeTruthy();
		expect(design?.descriptions?.en?.trim(), `${id}.en is empty`).toBeTruthy();
	});

	it('heart-descriptions.json is what the SVGs hold (run npm run generate:heart-data)', () => {
		const fromSvgs = Object.fromEntries(
			ALL_HEART_IDS.map((id) => {
				const design = parseHeartFromSVG(SVG_TEXT[`/static/hearts/${id}.svg`]!, `${id}.svg`);
				return [id, { da: design?.descriptions?.da, en: design?.descriptions?.en }];
			})
		);
		expect(GENERATED).toEqual(fromSvgs);
		expect(Object.keys(GENERATED)).toEqual(ALL_HEART_IDS);
	});
});
