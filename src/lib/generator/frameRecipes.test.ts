import { describe, it, expect } from 'vitest';
import index from '../../../static/generator/recipes/index.json';

/** Every motif's stored recipes for a frame (scripts/generator/recipes.mjs writes them). */
const files = import.meta.glob<{ recipes: { style: string; steps: number[] }[] }>('../../../static/generator/recipes/*.*.json', { eager: true, import: 'default' });
const name = (file: string) => file.split('/').pop()!.replace(/\.json$/, '');

describe("a frame's stored recipes", () => {
	it('are listed for the page, every file that holds any', () => {
		expect(Object.keys(files).map(name)).toContain('star.rays');
		for (const [file, { recipes }] of Object.entries(files)) expect(index.files.includes(name(file))).toBe(recipes.length > 0);
	});

	it('cover only runs of at least three neighbouring sizes, so the slider never meets a lone template', () => {
		for (const [file, { recipes }] of Object.entries(files))
			for (const { steps } of recipes)
				for (const p of steps) {
					let lo = p, hi = p;
					while (steps.includes(lo - 1)) lo--;
					while (steps.includes(hi + 1)) hi++;
					expect(hi - lo + 1, `${name(file)} at ${p}%`).toBeGreaterThanOrEqual(3);
				}
	});

	it('list each size of a frame once', () => {
		for (const [file, { recipes }] of Object.entries(files)) {
			const sizes = recipes.flatMap((r) => r.steps.map((p) => `${r.style}@${p}`));
			expect(new Set(sizes).size, name(file)).toBe(sizes.length);
		}
	});
});
