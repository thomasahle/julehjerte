import { describe, it, expect } from 'vitest';
import { ALL_HEART_IDS } from '$lib/data/categories';
import { HERO_HEART_IDS, HERO_HEART_IDS_MOBILE, pickRandomHeartIds } from './randomHearts';

/** A deterministic stand-in for Math.random, cycling through fixed values. */
function seeded(values: number[]): () => number {
	let i = 0;
	return () => values[i++ % values.length];
}

describe('pickRandomHeartIds', () => {
	it('returns the requested number of distinct gallery hearts', () => {
		for (let run = 0; run < 200; run++) {
			const picked = pickRandomHeartIds(5);
			expect(picked).toHaveLength(5);
			expect(new Set(picked).size).toBe(5);
			for (const id of picked) expect(ALL_HEART_IDS).toContain(id);
		}
	});

	it('never returns an excluded heart', () => {
		const exclude = ALL_HEART_IDS.slice(0, 30);
		for (let run = 0; run < 100; run++) {
			const picked = pickRandomHeartIds(5, { exclude });
			for (const id of picked) expect(exclude).not.toContain(id);
		}
	});

	it('returns the whole pool rather than repeating when it is too small', () => {
		const picked = pickRandomHeartIds(5, { pool: ['a', 'b'] });
		expect(picked).toHaveLength(2);
		expect([...picked].sort()).toEqual(['a', 'b']);
	});

	it('returns nothing for a non-positive count or an empty pool', () => {
		expect(pickRandomHeartIds(0)).toEqual([]);
		expect(pickRandomHeartIds(-1)).toEqual([]);
		expect(pickRandomHeartIds(3, { pool: [] })).toEqual([]);
	});

	it('is driven entirely by the injected random source', () => {
		const pool = ['a', 'b', 'c', 'd'];
		const first = pickRandomHeartIds(3, { pool, random: seeded([0, 0, 0]) });
		const second = pickRandomHeartIds(3, { pool, random: seeded([0, 0, 0]) });
		expect(first).toEqual(second);
		expect(first).toEqual(['a', 'b', 'c']);
	});

	it('does not mutate the pool it was given', () => {
		const pool = [...ALL_HEART_IDS];
		pickRandomHeartIds(5, { pool });
		expect(pool).toEqual(ALL_HEART_IDS);
	});
});

describe('the prerendered hero sets', () => {
	it('name real gallery hearts and never repeat one', () => {
		for (const set of [HERO_HEART_IDS, HERO_HEART_IDS_MOBILE]) {
			expect(new Set(set).size).toBe(set.length);
			for (const id of set) expect(ALL_HEART_IDS).toContain(id);
		}
	});
});
