import { describe, it, expect } from 'vitest';
import { chooseRecipe, recipeEdges, recipeOutline, ringCorners, type Recipe, type RecipeFile } from './recipes';
import { generate } from './generate';
import { cutTipCounts } from './cutQuality';
import type { Point, Ring } from './geometry';
import heart from '../../../static/generator/motifs/heart.json';
import heartRecipes from '../../../static/generator/recipes/heart.board.json';

const square = (x: number, y: number, size: number): Ring => [[x, y], [x + size, y], [x + size, y + size], [x, y + size]];
const circle = (c: Point, r: number, n = 64): Ring => Array.from({ length: n }, (_, i): Point =>
	[c[0] + r * Math.cos(2 * Math.PI * i / n), c[1] + r * Math.sin(2 * Math.PI * i / n)]);

describe('stored recipes', () => {
	it('names a ring\'s corners by their turn, and where another ring meets it', () => {
		const ring = circle([50, 50], 20);
		expect(ringCorners([square(10, 10, 20)])).toEqual([[0, 1, 2, 3]]);
		// A circle has no corner: it is measured from its first vertex.
		expect(ringCorners([ring])).toEqual([[0]]);
		// Where a check's corner lies on the circle, it is the circle's only corner.
		expect(ringCorners([ring, [ring[16], [ring[16][0] + 10, ring[16][1]], [ring[16][0] + 10, ring[16][1] + 10]]])[0]).toEqual([16]);
	});

	it('draws a stretch along a ring between its places, and a hidden cut once for both papers', () => {
		const rings = [square(20, 20, 60)], o = recipeOutline(rings);
		const recipe: Recipe = {
			style: 'board', steps: [70], gap: 3, sig: [4],
			// From the first corner a third of the way along, the long way round
			// to half way along the third side; a hidden cut across.
			A: [[{ v: 0, a: { r: 0, k: 0, u: 1 / 3 }, b: { r: 0, k: 2, u: .5 }, f: false },
				{ h: [{ r: 0, k: 2, u: .5 }, { r: 0, k: 0, u: 1 / 3 }], bends: [[.5, .25]] }]],
			B: [[{ h: [{ r: 0, k: 0, u: 1 / 3 }, { r: 0, k: 2, u: .5 }], bends: [[.5, -.25]] }]]
		};
		const edges = recipeEdges(recipe, o), outline = edges.filter(e => e.kind === 'outline');
		// Against the ring's order: down the left side, along the bottom.
		expect(outline.map(e => [e.from, e.to])).toEqual([[[40, 20], [20, 20]], [[20, 20], [20, 80]], [[20, 80], [50, 80]]]);
		expect(outline.every(e => e.family === 'A')).toBe(true);
		// The hidden cut is drawn once, through its bend, both papers'.
		const hidden = edges.filter(e => e.kind === 'shared');
		expect(hidden.map(e => e.family)).toEqual(['AB', 'AB']);
		expect(hidden[0].from).toEqual([50, 80]);
		expect(hidden[1].to).toEqual([40, 20]);
	});

	it('draws a place where two rings cross at a vertex of neither at their crossing, for both stretches', () => {
		// The first square's right side crosses the second's bottom at (60, 30).
		const rings = [square(0, 0, 60), square(30, 30, 60)], o = recipeOutline(rings);
		// Named on the first ring, half way up its right side (corners 1 and 2:
		// (60, 0) and (60, 60)), slightly off the crossing; the other ring as x.
		const place = { r: 0, k: 1, u: .499, x: 1 };
		const recipe: Recipe = {
			style: 'board', steps: [70], gap: 3, sig: [4, 4],
			A: [[{ v: 0, a: { r: 0, k: 1, u: 0 }, b: place, f: true }, { v: 1, a: place, b: { r: 1, k: 1, u: 0 }, f: true }]],
			B: []
		};
		const edges = recipeEdges(recipe, o);
		expect(edges[0].to).toEqual([60, 30]);
		expect(edges[1].from).toEqual([60, 30]);
		expect(edges.at(-1)!.to).toEqual([90, 30]);
	});

	it('is only chosen at the sizes and space it was checked at, on its own outline', () => {
		const o = recipeOutline([square(20, 20, 60)]);
		const recipe: Recipe = { style: 'board', strips: 5, steps: [71, 72], gap: 3, sig: [4], A: [], B: [] };
		expect(chooseRecipe([recipe], 'board', 5, .72, 3, o)).toBe(recipe);
		expect(chooseRecipe([recipe], 'board', 5, .73, 3, o)).toBeUndefined();
		expect(chooseRecipe([recipe], 'board', 5, .72, 4, o)).toBeUndefined();
		expect(chooseRecipe([recipe], 'board', 7, .72, 3, o)).toBeUndefined();
		expect(chooseRecipe([recipe], 'rays', undefined, .72, 3, o)).toBeUndefined();
		expect(chooseRecipe([{ ...recipe, sig: [5] }], 'board', 5, .72, 3, o)).toBeUndefined();
	});

	it('draws the heart on five strips from its stored recipe where that was found better, and keeps its own elsewhere', () => {
		const recipes = (heartRecipes as RecipeFile).recipes, colors = { left: '#ffffff', right: '#b91313' };
		// The page leaves the board's strips out at the five it starts with.
		const request = (scale: number) => ({ mode: 'figure' as const, name: 'Heart', contours: heart.contours as Ring[], colors, style: 'board' as const, frame: 'circle' as const, frameSize: 70, scale, gap: 3 });
		const stored = generate({ ...request(.72), recipes }), own = generate(request(.72));
		expect(stored.hardToCut).toBeUndefined();
		expect(cutTipCounts(stored.design)).toEqual([0, 0]);
		expect(stored.design.fingers).not.toEqual(own.design.fingers);
		// At 55% its own four short cuts were better: the recipe lists no such size.
		expect(generate({ ...request(.55), recipes }).design.fingers).toEqual(generate(request(.55)).design.fingers);
	});
});
