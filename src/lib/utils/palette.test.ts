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
	EDGE_COLOR,
	IDENTITY,
	contrastRatio,
	iconPairs,
	isPermutation,
	paletteVariables,
	randomPermutation,
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

	it("leaves out the site's own red and white, either way round: it has its own button", () => {
		for (const pair of PALETTE) {
			const sides = [pair.left, pair.right].sort();
			expect(sides, pair.name).not.toEqual([DEFAULT_COLORS_HEX.left, DEFAULT_COLORS_HEX.right].sort());
			expect(pair.left, pair.name).not.toBe(DEFAULT_COLORS_HEX.right);
			expect(pair.right, pair.name).not.toBe(DEFAULT_COLORS_HEX.right);
		}
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

	// The site's classic red (#b91313, 0.65) is the cap; a
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

	it('puts the first gallery heart in slot 0', () => {
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
	it.each([2, 3, 4, 5, 6])("never puts a card in a neighbour's slot, %i columns", (columns) => {
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

	it('writes the slot into the markup, reading the shuffle with the unshuffled pair as fallback', () => {
		const first = pairAttributes(CATEGORIES[0].hearts[0]);
		expect(first['data-pair']).toBe('0');
		expect(first.style).toBe(
			`--pair-left: var(--pal-0-l, ${PALETTE[0].left}); --pair-right: var(--pal-0-r, ${PALETTE[0].right}); ` +
				`--pair-edge: var(--pal-0-o, ${PALETTE[0].edge ? EDGE_COLOR : 'transparent'});`
		);
		const second = pairAttributes(CATEGORIES[0].hearts[1]);
		expect(second['data-pair']).toBe('1');
		expect(second.style).toContain('--pair-edge: var(--pal-1-o, transparent);');
	});
});

/** A seeded generator, so a failing shuffle can be replayed. */
function mulberry32(seed: number): () => number {
	return () => {
		seed = (seed + 0x6d2b79f5) | 0;
		let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

describe('the shuffle', () => {
	it('is always a permutation of the palette, and never the one it avoids', () => {
		const random = mulberry32(1);
		let last: number[] = [...IDENTITY];
		const seen = new Set<string>();
		for (let i = 0; i < 500; i++) {
			const p = randomPermutation(random, last);
			expect(isPermutation(p)).toBe(true);
			expect(p).not.toEqual(last);
			seen.add(p.join(','));
			last = p;
		}
		expect(seen.size).toBeGreaterThan(490);
	});

	it('moves every pair around: none is stuck in slot 0', () => {
		const random = mulberry32(2);
		const slotsOfClassic = new Set(Array.from({ length: 200 }, () => randomPermutation(random).indexOf(0)));
		expect(slotsOfClassic.size).toBe(PALETTE.length);
	});

	it('knows a permutation when it sees one', () => {
		expect(isPermutation([...IDENTITY])).toBe(true);
		expect(isPermutation(IDENTITY.slice(1))).toBe(false);
		expect(isPermutation([...IDENTITY.slice(1), 1])).toBe(false);
		expect(isPermutation([...IDENTITY.slice(1), 12])).toBe(false);
		expect(isPermutation([...IDENTITY.slice(1), 0.5])).toBe(false);
	});

	it('keeps the neighbour rule for any shuffle, at 2 to 6 columns', () => {
		const random = mulberry32(3);
		for (let round = 0; round < 50; round++) {
			const p = randomPermutation(random);
			const shown = (id: string) => p[pairIndex(id)];
			for (const columns of [2, 3, 4, 5, 6]) {
				for (const category of CATEGORIES) {
					const hearts = category.hearts;
					for (let i = 0; i < hearts.length; i++) {
						for (const j of [i + 1, i + columns - 1, i + columns, i + columns + 1]) {
							if (j >= hearts.length) continue;
							// Same row only for the one to the right; the others are on the next row.
							const sameRow = Math.floor(i / columns) === Math.floor(j / columns);
							if (j === i + 1 && !sameRow) continue;
							if (j !== i + 1 && Math.floor(j / columns) !== Math.floor(i / columns) + 1) continue;
							expect(shown(hearts[j])).not.toBe(shown(hearts[i]));
						}
					}
				}
			}
		}
	});

	it('sets three variables per slot, from the pair the slot shows', () => {
		const p = [...IDENTITY].reverse();
		const vars = paletteVariables(p);
		expect(Object.keys(vars)).toHaveLength(PALETTE.length * 3 + 4);
		const last = PALETTE.length - 1;
		expect(vars['--pal-0-l']).toBe(PALETTE[last].left);
		expect(vars['--pal-0-r']).toBe(PALETTE[last].right);
		expect(vars[`--pal-${last}-l`]).toBe(PALETTE[0].left);
		expect(vars[`--pal-${last}-o`]).toBe(PALETTE[0].edge ? EDGE_COLOR : 'transparent');
		expect(vars['--pal-1-o']).toBe(PALETTE[last - 1].edge ? EDGE_COLOR : 'transparent');
	});

	it("picks the colourful button's four cells from four colour families, in shuffle order", () => {
		const random = mulberry32(4);
		for (let round = 0; round < 200; round++) {
			const p = randomPermutation(random);
			const picked = iconPairs(p);
			expect(picked).toHaveLength(4);
			expect(new Set(picked.map((i) => PALETTE[i].family)).size).toBe(4);
			// In shuffle order, and each the first of its family.
			const positions = picked.map((i) => p.indexOf(i));
			expect([...positions].sort((a, b) => a - b)).toEqual(positions);
			for (const i of picked) {
				const first = p.find((j) => PALETTE[j].family === PALETTE[i].family);
				expect(first).toBe(i);
			}
			const vars = paletteVariables(p);
			expect([0, 1, 2, 3].map((k) => vars[`--pal-icon-${k}`])).toEqual(picked.map((i) => PALETTE[i].right));
		}
	});
});
