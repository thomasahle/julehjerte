/**
 * The colourful mode's palette and who gets which pair ($lib/utils/palette).
 */
import { describe, expect, it } from 'vitest';
import { CATEGORIES } from '$lib/data/categories';
import { DEFAULT_COLORS_HEX } from '$lib/stores/colors';
import {
	PAGE_BACKGROUND,
	PAGE_CONTRAST_MIN,
	PAIR_CONTRAST_MIN,
	PALETTE,
	contrastRatio,
	luminance,
	pairAttributes,
	pairIndex
} from './palette';

/** Chroma, max(r, g, b) - min(r, g, b) on 0..1: 1 is neon, 0 is grey. */
function chroma(hex: string): number {
	const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
	return Math.max(r, g, b) - Math.min(r, g, b);
}

describe('contrast', () => {
	it('measures as WCAG does', () => {
		expect(luminance('#000000')).toBe(0);
		expect(luminance('#ffffff')).toBeCloseTo(1, 10);
		expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 10);
		expect(contrastRatio('#777777', '#ffffff')).toBeCloseTo(4.48, 2);
		expect(contrastRatio('#123456', '#123456')).toBe(1);
	});

	it('refuses what is not #rrggbb', () => {
		expect(() => luminance('rgb(1, 2, 3)')).toThrow();
	});
});

describe('the palette', () => {
	it('has ten to twelve pairs, all different', () => {
		expect(PALETTE.length).toBeGreaterThanOrEqual(10);
		expect(PALETTE.length).toBeLessThanOrEqual(12);
		expect(new Set(PALETTE.map((p) => `${p.left} ${p.right}`)).size).toBe(PALETTE.length);
		expect(new Set(PALETTE.map((p) => p.name)).size).toBe(PALETTE.length);
	});

	it('starts with the classic red and white, the site default', () => {
		expect({ left: PALETTE[0].left, right: PALETTE[0].right }).toEqual(DEFAULT_COLORS_HEX);
	});

	it.each(PALETTE.map((p) => [p.name, p] as const))('%s: the weave reads', (_, pair) => {
		expect(contrastRatio(pair.left, pair.right)).toBeGreaterThanOrEqual(PAIR_CONTRAST_MIN);
	});

	it.each(PALETTE.map((p) => [p.name, p] as const))(
		'%s: the lighter paper on the left, so the ribbon is the strong one',
		(_, pair) => {
			expect(luminance(pair.left)).toBeGreaterThan(luminance(pair.right));
		}
	);

	it.each(PALETTE.map((p) => [p.name, p] as const))(
		'%s: a paper close to the page background is outlined',
		(_, pair) => {
			const closest = Math.min(
				contrastRatio(pair.left, PAGE_BACKGROUND),
				contrastRatio(pair.right, PAGE_BACKGROUND)
			);
			expect(Boolean(pair.edge)).toBe(closest < PAGE_CONTRAST_MIN);
		}
	);

	// The classic red (#b91313, 0.65) is the most vivid paper of the set; a
	// neon green is 1.
	it('has no neon: no paper more vivid than the classic red', () => {
		for (const pair of PALETTE) {
			expect(chroma(pair.left), pair.name).toBeLessThanOrEqual(chroma(DEFAULT_COLORS_HEX.right));
			expect(chroma(pair.right), pair.name).toBeLessThanOrEqual(chroma(DEFAULT_COLORS_HEX.right));
		}
	});
});

describe('which heart gets which pair', () => {
	it('is the same every time for the same heart', () => {
		for (const id of ['classic-3x3', 'stjerne', 'user-1712345678901', 'shared-abc']) {
			expect(pairIndex(id)).toBe(pairIndex(id));
			expect(pairAttributes(id)).toEqual(pairAttributes(id));
		}
	});

	it('gives the first gallery heart the classic pair', () => {
		expect(pairIndex(CATEGORIES[0].hearts[0])).toBe(0);
	});

	it('stays inside the palette for any id', () => {
		for (const id of ['', 'a', 'user-1', 'x'.repeat(200), 'æøå']) {
			const i = pairIndex(id);
			expect(Number.isInteger(i)).toBe(true);
			expect(i).toBeGreaterThanOrEqual(0);
			expect(i).toBeLessThan(PALETTE.length);
		}
	});

	it('spreads hearts outside the gallery over the palette', () => {
		const seen = new Set(Array.from({ length: 200 }, (_, i) => pairIndex(`user-${1700000000000 + i * 7919}`)));
		expect(seen.size).toBe(PALETTE.length);
	});

	// The gallery's grid is `repeat(auto-fill, minmax(204px, 1fr))` in a column
	// at most 1280px wide: two (phones) to six columns.
	it.each([2, 3, 4, 5, 6])('never repeats a pair next to a card, %i columns', (columns) => {
		for (const category of CATEGORIES) {
			const hearts = category.hearts;
			for (let i = 0; i < hearts.length; i++) {
				const row = Math.floor(i / columns);
				const col = i % columns;
				for (const [dr, dc] of [
					[0, 1],
					[1, -1],
					[1, 0],
					[1, 1]
				]) {
					const r = row + dr;
					const c = col + dc;
					if (c < 0 || c >= columns) continue;
					const j = r * columns + c;
					if (j >= hearts.length) continue;
					expect(pairIndex(hearts[j]), `${hearts[i]} / ${hearts[j]}`).not.toBe(pairIndex(hearts[i]));
				}
			}
		}
	});

	it('writes the pair into the markup, with the outline flag where it applies', () => {
		const first = pairAttributes(CATEGORIES[0].hearts[0]);
		expect(first['data-pair']).toBe('0');
		expect(first['data-pair-edge']).toBe('');
		expect(first.style).toBe(`--pair-left: ${PALETTE[0].left}; --pair-right: ${PALETTE[0].right};`);
		const second = pairAttributes(CATEGORIES[0].hearts[1]);
		expect(second['data-pair']).toBe('1');
		expect(second['data-pair-edge']).toBeUndefined();
	});
});
