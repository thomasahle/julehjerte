import { describe, it, expect } from 'vitest';
import index from '../../../static/generator/recipes/index.json';

/** The stored recipes the page loads (scripts/generator/topology.mjs writes them). */
const files = import.meta.glob<{ recipes: { style: string; strips?: number; steps: number[]; outline?: string; motif?: string }[] }>('../../../static/generator/recipes/*.json', { eager: true, import: 'default' });
const name = (file: string) => file.split('/').pop()!.replace(/\.json$/, '');
const recipeFiles = Object.entries(files).filter(([file]) => name(file) !== 'index');

describe("a frame's stored recipes", () => {
	it('are listed for the page, every file that holds any', () => {
		expect(recipeFiles.map(([file]) => name(file))).toEqual(expect.arrayContaining(['board', 'rays']));
		for (const [file, { recipes }] of recipeFiles) expect(index.files.includes(name(file))).toBe(recipes.length > 0);
	});

	it("are its topologies', one file a frame, none a motif's own", () => {
		for (const [file, { recipes }] of recipeFiles) {
			expect(name(file), 'a frame, not a motif in it').not.toContain('.');
			for (const recipe of recipes) {
				expect(recipe.style, name(file)).toBe(name(file));
				expect(typeof recipe.outline === 'string' && typeof recipe.motif === 'string', `${name(file)} at ${recipe.steps[0]}%`).toBe(true);
			}
		}
	});
});
