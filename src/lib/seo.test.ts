/**
 * Heart pages' meta descriptions: every gallery heart's, in both languages,
 * fits in a search result, and is built from whole sentences where it can be.
 */
import { describe, expect, it } from 'vitest';
import heartMeta from '$lib/data/heart-meta.json';
import { ALL_HEART_IDS } from '$lib/data/categories';
import { heartDescription } from '$lib/data/heartDescriptions';
import { META_DESCRIPTION_MAX, heartMetaDescription } from './seo';
import { t, type Language } from '$lib/i18n';

type Meta = { name: string; gridSize: { x: number; y: number } };
const META = heartMeta as unknown as Record<string, Meta>;
const IDS = ALL_HEART_IDS;
const LANGS: Language[] = ['da', 'en'];

/** What the heart page passes for a gallery heart. */
function describeHeart(id: string, lang: Language): string {
	const meta = META[id];
	return heartMetaDescription(
		{ name: meta.name, x: meta.gridSize.x, y: meta.gridSize.y },
		heartDescription(id, lang),
		lang
	);
}

describe('heartMetaDescription', () => {
	it('covers the gallery', () => {
		expect(IDS.length).toBeGreaterThan(40);
		for (const id of IDS) expect(META[id], id).toBeDefined();
	});

	it.each(LANGS)('keeps every gallery heart within 160 characters (%s)', (lang) => {
		const tooLong = IDS.map((id) => [id, describeHeart(id, lang)] as const).filter(
			([, d]) => d.length > 160
		);
		expect(tooLong).toEqual([]);
		for (const id of IDS) expect(describeHeart(id, lang).length).toBeLessThanOrEqual(META_DESCRIPTION_MAX);
	});

	it.each(LANGS)('starts with the intro and keeps a whole first sentence where one fits (%s)', (lang) => {
		for (const id of IDS) {
			const meta = META[id];
			const intro = t('heartMetaDescription', lang, { name: meta.name, ...meta.gridSize });
			const out = describeHeart(id, lang);
			expect(out.startsWith(intro), id).toBe(true);
			expect(out, id).toMatch(/[.!?…]$/);
		}
	});

	it('uses whole sentences and the download line when they fit', () => {
		const out = heartMetaDescription({ name: 'Jul', x: 3, y: 3 }, 'Et kort hjerte. Let at klippe.', 'da');
		expect(out).toBe(
			`${t('heartMetaDescription', 'da', { name: 'Jul', x: 3, y: 3 })} Et kort hjerte. Let at klippe. ${t('heartMetaDownload', 'da')}`
		);
	});

	it('drops the download line before a sentence about the heart', () => {
		const heart = { name: 'Jul', x: 3, y: 3 };
		const intro = t('heartMetaDescription', 'da', heart);
		const download = t('heartMetaDownload', 'da');
		// One sentence that fits only without the download line.
		const room = META_DESCRIPTION_MAX - intro.length - 1;
		const sentence = `${'a'.repeat(room - 1)}.`;
		expect(heartMetaDescription(heart, sentence, 'da')).toBe(`${intro} ${sentence}`);
		expect(heartMetaDescription(heart, sentence, 'da')).not.toContain(download);
	});

	it('cuts a first sentence that does not fit at a word, with an ellipsis', () => {
		const heart = { name: 'Jul', x: 3, y: 3 };
		const long = `${'ord '.repeat(60).trim()}. Kort.`;
		const out = heartMetaDescription(heart, long, 'en');
		expect(out.length).toBeLessThanOrEqual(META_DESCRIPTION_MAX);
		expect(out.endsWith('ord…')).toBe(true);
	});

	it('keeps intro and download line for a heart without prose', () => {
		const heart = { name: 'Mit hjerte', x: 4, y: 4 };
		expect(heartMetaDescription(heart, null, 'da')).toBe(
			`${t('heartMetaDescription', 'da', heart)} ${t('heartMetaDownload', 'da')}`
		);
		expect(heartMetaDescription({ ...heart, name: 'x'.repeat(300) }, null, 'da').length).toBeLessThanOrEqual(
			META_DESCRIPTION_MAX
		);
	});
});
