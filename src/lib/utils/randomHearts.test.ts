import { describe, it, expect } from 'vitest';
import { ALL_HEART_IDS } from '$lib/data/categories';
import { HERO_HEART_IDS, HERO_HEART_IDS_MOBILE } from './randomHearts';

describe('the prerendered hero sets', () => {
	it('name real gallery hearts and never repeat one', () => {
		for (const set of [HERO_HEART_IDS, HERO_HEART_IDS_MOBILE]) {
			expect(new Set(set).size).toBe(set.length);
			for (const id of set) expect(ALL_HEART_IDS).toContain(id);
		}
	});

	it('has one heart per hero slot', async () => {
		const { HERO_SLOTS_DESKTOP, HERO_SLOTS_MOBILE } = await import(
			'$lib/components/front/heroSlots'
		);
		expect(HERO_HEART_IDS).toHaveLength(HERO_SLOTS_DESKTOP.length);
		expect(HERO_HEART_IDS_MOBILE).toHaveLength(HERO_SLOTS_MOBILE.length);
	});
});
