import { describe, it, expect } from 'vitest';
import { designStartArt } from './designStart';
import { defaults } from '$lib/generator/state';
import component from '$lib/components/DesignStart.svelte?raw';

describe('design start art', () => {
	it('draws every heart the start screen shows, each with its own ids, in the site paper colours', async () => {
		const art = await designStartArt();
		const used = [...component.matchAll(/@render heart\('([^']+)'\)/g)].map((m) => m[1]);
		expect(used.length).toBeGreaterThan(5);
		expect(Object.keys(art.hearts).sort()).toEqual([...new Set(used)].sort());
		for (const [slot, heart] of Object.entries(art.hearts)) {
			expect(heart.markup).toContain(`id="start-${slot}-overlap"`);
			expect(heart.markup).toContain('fill="var(--paper-right)"');
			expect(heart.markup).not.toMatch(/\.\d{3}/);
		}
		expect(art.motifs.map((m) => m.id)).toEqual(['star', 'tree', 'heart', 'snow', 'angel', 'bell']);
		expect(art.name).toBe(defaults.text);
	}, 20000);
});
