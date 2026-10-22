import { describe, expect, it } from 'vitest';
import { randomHeart, randomHeartIsValid } from './randomHeart';
import { detectSymmetryModes } from '$lib/utils/symmetry';
import { inferOverlapRect } from '$lib/utils/overlapRect';
import { CENTER, STRIP_WIDTH } from '$lib/constants';

/** A small seeded generator (mulberry32), so the draws are the same on every run. */
function seeded(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

const HEARTS = Array.from({ length: 150 }, (_, i) => randomHeart(seeded(i + 1)));

describe('randomHeart', () => {
	it('is the same heart for the same random numbers', () => {
		expect(randomHeart(seeded(42))).toEqual(randomHeart(seeded(42)));
	});

	it('draws square grids of 2 to 6 strips, with the outer edges and the cuts the editor numbers', () => {
		for (const heart of HEARTS) {
			const n = heart.gridSize.x;
			expect(heart.gridSize.y).toBe(n);
			expect(n).toBeGreaterThanOrEqual(2);
			expect(n).toBeLessThanOrEqual(6);
			const ids = heart.fingers.map((f) => f.id);
			expect(ids).toEqual([...Array.from({ length: n + 1 }, (_, i) => `L-${i}`), ...Array.from({ length: n + 1 }, (_, i) => `R-${i}`)]);
			// The square sits where the editor puts an n × n grid.
			const rect = inferOverlapRect(heart.fingers, heart.gridSize);
			expect(rect.width).toBeCloseTo(n * STRIP_WIDTH, 6);
			expect(rect.left + rect.width / 2).toBeCloseTo(CENTER.x, 6);
		}
	});

	it('never makes a red cut: every cut keeps its distance from its neighbours and itself', () => {
		for (const heart of HEARTS) expect(randomHeartIsValid(heart.fingers, heart.gridSize.x)).toBe(true);
	});

	it('keeps every symmetry row it opens with', () => {
		for (const heart of HEARTS) {
			const found = detectSymmetryModes(heart.fingers);
			const rows = [
				['withinCurveMode', heart.symmetry.withinCurveMode, found.withinCurveMode],
				['withinLobeMode', heart.symmetry.withinLobeMode, found.withinLobeMode],
				['betweenLobesMode', heart.symmetry.betweenLobesMode, found.betweenLobesMode]
			] as const;
			for (const [row, chosen, detected] of rows) {
				if (chosen === 'off') continue;
				// The detector reports Sym where both hold (a straight cut is both), so Anti may read as Sym.
				const ok = detected === chosen || (chosen === 'anti' && detected === 'sym');
				expect(ok, `${row}: chose ${chosen}, found ${detected} (${heart.shape}, ${heart.arrangement}, ${heart.gridSize.x})`).toBe(true);
			}
		}
	});

	it('is never just the straight grid, and varies its grid, shape, arrangement and symmetry', () => {
		for (const heart of HEARTS) {
			const curved = heart.fingers.some((f) => f.segments.length > 1 || f.segments.some((s) => s.p1.x !== s.p0.x && s.p1.y !== s.p0.y));
			expect(curved).toBe(true);
		}
		const kinds = (key: (h: (typeof HEARTS)[number]) => string) => new Set(HEARTS.map(key)).size;
		expect(kinds((h) => String(h.gridSize.x))).toBe(5);
		expect(kinds((h) => h.shape)).toBe(5);
		expect(kinds((h) => h.arrangement)).toBe(6);
		expect(kinds((h) => h.symmetry.withinCurveMode + h.symmetry.withinLobeMode + h.symmetry.betweenLobesMode)).toBeGreaterThan(15);
	});
});
