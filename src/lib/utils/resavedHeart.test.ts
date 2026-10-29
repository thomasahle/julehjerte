import { describe, expect, it, vi } from 'vitest';
import { gallerySvgs, loadHeart } from '$lib/laser/testHearts.test-helpers';
import { t } from '$lib/i18n';
import type { HeartDesign } from '$lib/types/heart';
import { parseHeartFromSVG, serializeHeartToSVG } from './heartDesign';
import { heartName } from './heartName';
import { restoreResavedHeart, type HeartMeta } from './resavedHeart.js';
import metaJson from '$lib/data/heart-meta.json';
import textsJson from '$lib/data/heart-descriptions.json';

const meta = metaJson as unknown as Record<string, HeartMeta>;
const texts = textsJson as Record<string, { da: string; en: string }>;

/** The gallery heart as the editor's "Eksportér SVG" writes its copy: as loadDesignFromGallery and createHeartDesign make it. */
function editorCopy(design: HeartDesign, lang: 'da' | 'en', name = `${heartName(design, lang)} ${t('copy', lang)}`): string {
	return serializeHeartToSVG({
		...design,
		name,
		names: undefined,
		author: '',
		authorUrl: undefined,
		publisher: undefined,
		publisherUrl: undefined,
		source: undefined,
		date: undefined,
		description: undefined,
		descriptions: undefined,
		colors: { left: '#ffffff', right: '#b91313' }
	});
}

function parse(svg: string): HeartDesign {
	const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
	try {
		return parseHeartFromSVG(svg, 'heart.svg')!;
	} finally {
		warn.mockRestore();
	}
}

describe('a gallery heart saved over from the editor', () => {
	// Bølger is credited, published and dated; Origami credited only; Khatam has a tile.
	it.each(['boelger', 'origami', 'khatam'])('%s gets its names, texts and credit back, its cuts as they are', (id) => {
		const gallery = loadHeart(id);
		for (const lang of ['da', 'en'] as const) {
			const copy = editorCopy(gallery, lang);
			const restored = restoreResavedHeart(copy, meta[id]!, texts[id]);
			expect(restored?.keptName).toBeNull();
			const heart = parse(restored!.svg);
			for (const key of ['name', 'names', 'author', 'authorUrl', 'publisher', 'publisherUrl', 'source', 'date', 'descriptions'] as const) {
				expect(heart[key], `${lang} ${key}`).toEqual(gallery[key]);
			}
			expect(heart.colors).toBeUndefined();
			expect(heart.pattern).toEqual(gallery.pattern);
			expect(restored!.svg.slice(restored!.svg.indexOf('  <path'))).toBe(copy.slice(copy.indexOf('  <path')));
			// and once is enough
			expect(restoreResavedHeart(restored!.svg, meta[id]!, texts[id])).toBeNull();
		}
	});

	it('keeps a name typed in place of the copy\'s, without the other language\'s', () => {
		const restored = restoreResavedHeart(editorCopy(loadHeart('boelger'), 'da', 'Havbølger'), meta.boelger!, texts.boelger);
		expect(restored?.keptName).toBe('Havbølger');
		const heart = parse(restored!.svg);
		expect(heart.name).toBe('Havbølger');
		expect(heart.names).toBeUndefined();
		expect(heart.author).toBe('Hans H. Koch');
		expect(heart.descriptions).toEqual(texts.boelger);
	});

	it('leaves every gallery heart as it is now alone', () => {
		for (const [file, svg] of Object.entries(gallerySvgs)) {
			const id = file.replace('/static/hearts/', '').replace('.svg', '');
			if (meta[id]) expect(restoreResavedHeart(svg, meta[id], texts[id]), id).toBeNull();
		}
	});
});
