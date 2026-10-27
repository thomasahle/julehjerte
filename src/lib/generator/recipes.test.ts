import { describe, it, expect } from 'vitest';
import { chooseRecipe, isTopology, recipeEdges, recipeOutline, ringCorners, type MotifRecipe, type RecipeFile } from './recipes';
import { islandOn, motifFit, motifRings, nestingOf, topologyConstruction, topologyOf } from './topologyRecipes';
import { boardOutline } from './boardOutline';
import { generate, storedHearts } from './generate';
import { betterCuts, cutMeasures } from './cutQuality';
import { picture } from './picture';
import { lobesShareTemplate } from '$lib/utils/symmetry';
import type { Point, Ring } from './geometry';
import heart from '../../../static/generator/motifs/heart.json';
import star from '../../../static/generator/motifs/star.json';
import tree from '../../../static/generator/motifs/tree.json';
import nisse from '../../../static/generator/motifs/nisse.json';
import wreath from '../../../static/generator/motifs/mc-wreath.json';
import heartSolves from '../../../scripts/generator/solves/heart.board.json';
import nisseSolves from '../../../scripts/generator/solves/nisse.board.json';
import starRays from '../../../scripts/generator/solves/star.rays.json';
import board from '../../../static/generator/recipes/board.json';
import rays from '../../../static/generator/recipes/rays.json';

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
		const recipe: MotifRecipe = {
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
		const recipe: MotifRecipe = {
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
		const recipe: MotifRecipe = { style: 'board', strips: 5, steps: [71, 72], gap: 3, sig: [4], A: [], B: [] };
		expect(chooseRecipe([recipe], 'board', 5, .72, 3, o)).toBe(recipe);
		expect(chooseRecipe([recipe], 'board', 5, .73, 3, o)).toBeUndefined();
		expect(chooseRecipe([recipe], 'board', 5, .72, 4, o)).toBeUndefined();
		expect(chooseRecipe([recipe], 'board', 7, .72, 3, o)).toBeUndefined();
		expect(chooseRecipe([recipe], 'rays', undefined, .72, 3, o)).toBeUndefined();
		expect(chooseRecipe([{ ...recipe, sig: [5] }], 'board', 5, .72, 3, o)).toBeUndefined();
	});

	it('reads how a motif\'s rings nest, and orders them alike for every motif nesting alike', () => {
		const outer = square(0, 0, 60), hole = [...square(10, 10, 10)].reverse(), other = square(40, 10, 10), apart = square(80, 80, 10);
		expect(nestingOf([outer])).toBe('()');
		expect(nestingOf([hole, outer])).toBe('(())');
		expect(nestingOf([outer, hole, other, apart])).toBe('(()())()');
		// Outer rings first, each followed by those inside it, every one running with positive area.
		const rings = motifRings([hole, apart, outer]);
		expect(rings.map(r => r.from)).toEqual([2, 0, 1]);
		expect(rings[1].turned).toBe(true);
		expect(rings[1].ring).toEqual(square(10, 10, 10));
	});

	it('finds a motif an island where the board\'s rings cancel round it, not where it crosses the outline', () => {
		// A check and its part inside the circle cancel even–odd: the circle's inside is one colour.
		const check = square(20, 20, 60);
		expect(islandOn([check, check], [square(30, 30, 10)])).toBe(true);
		expect(islandOn([check], [square(30, 30, 10)])).toBe(true);
		expect(islandOn([check], [square(70, 40, 20)])).toBe(false);
	});

	it('draws one motif\'s solve as its topology\'s on another motif nesting alike', () => {
		const colors = { left: '#ffffff', right: '#b91313' };
		const request = (contours: Ring[], scale: number) => ({ mode: 'figure' as const, name: 'Motif', contours, colors, style: 'board' as const, frame: 'circle' as const, frameSize: 70, scale, gap: 3 });
		const solve = (heartSolves as { recipes: MotifRecipe[] }).recipes.find(r => r.strips === 5 && r.steps.includes(60))!;
		const shown = picture(request(heart.contours as Ring[], .6), solve.known)!, topology = topologyOf(solve, shown)!;
		// One outline, its places named by their order round it; the board's as before.
		expect(topology.motif).toBe('()');
		expect(topology.places).toHaveLength(1);
		// Its board is the board's outline as the picture shows it.
		expect(topology.outline).toBe(boardOutline(shown.rings.slice(0, shown.motif)).sig);
		// The star's tips take the places the heart's dip and lobes had.
		const made = storedHearts(request(star.contours as Ring[], .6), [{ ...topology, steps: [60] }], true);
		expect(made).toHaveLength(1);
		expect(made[0].hardToCut).toBeUndefined();
	});

	it('draws a solve in the rays as its topology\'s on another motif, the frame\'s corners its board', () => {
		const colors = { left: '#ffffff', right: '#b91313' };
		const request = (contours: Ring[], scale: number) => ({ mode: 'figure' as const, name: 'Motif', contours, colors, style: 'rays' as const, frame: 'circle' as const, frameSize: 70, scale, gap: 3 });
		const solve = (starRays as { recipes: MotifRecipe[] }).recipes.find(r => r.steps.includes(72))!;
		const shown = picture(request(star.contours as Ring[], .72), solve.known)!, topology = topologyOf(solve, shown)!;
		// The four corners the frame's cuts turn over come first, then the motif, an island in its circle.
		expect(shown.motif).toBe(4);
		expect(topology.motif).toBe('()');
		expect(topology.outline).toBe(boardOutline(shown.rings.slice(0, 4)).sig);
		// The star's solve draws on the heart.
		const made = storedHearts(request(heart.contours as Ring[], .72), [{ ...topology, steps: [72] }], true);
		expect(made).toHaveLength(1);
		expect(made[0].hardToCut).toBeUndefined();
	});

	it('draws a motif\'s own solve at a size it was solved for without the generator\'s own heart', () => {
		const colors = { left: '#ffffff', right: '#b91313' }, recipes = (rays as unknown as RecipeFile).recipes;
		// The wreath in the rays at 90%: its own heart takes twenty seconds, its solve a fraction of one.
		const asked = { mode: 'figure' as const, name: 'Motif', contours: wreath.contours as Ring[], colors, style: 'rays' as const, frame: 'circle' as const, frameSize: 70, scale: .9, gap: 3 };
		const shown = picture(asked)!, held = recipes.filter(isTopology).find(r => r.solved?.includes(90) && motifFit(r, shown) < .005)!;
		expect(held.held).toBe(true);
		const made = generate({ ...asked, recipes }), drawn = storedHearts(asked, [held], true)[0];
		expect(made.hardToCut).toBeUndefined();
		expect(cutMeasures(made.design, shown.rings)[0]).toBe(cutMeasures(drawn.design, shown.rings)[0]);
	});

	it('keeps a symmetric solve symmetric on another motif its own mirror image', () => {
		const colors = { left: '#ffffff', right: '#b91313' };
		const request = (contours: Ring[], scale: number) => ({ mode: 'figure' as const, name: 'Motif', contours, colors, style: 'board' as const, frame: 'circle' as const, frameSize: 70, scale, gap: 3 });
		const solve = (heartSolves as { recipes: MotifRecipe[] }).recipes.find(r => r.strips === 5 && r.steps.includes(60))!;
		const topology = topologyOf(solve, picture(request(heart.contours as Ring[], .6), solve.known)!)!;
		// The heart's places, made short on the tree, in mirror pairs: one template for both lobes.
		const made = storedHearts(request(tree.contours as Ring[], .6), [{ ...topology, steps: [60] }], true)[0];
		expect(lobesShareTemplate(made.design.fingers, made.design.gridSize)).toBe(true);
	});

	it('holds a solve\'s places where its cut runs on in the line of an outline side', () => {
		const solve = (nisseSolves as { recipes: MotifRecipe[] }).recipes.find(r => r.strips === 5 && r.steps.includes(87))!;
		const colors = { left: '#ffffff', right: '#b91313' };
		const shown = picture({ mode: 'figure', name: 'Motif', contours: nisse.contours as Ring[], colors, style: 'board', frame: 'circle', frameSize: 70, scale: .87, gap: 3 }, solve.known)!;
		// A cut between two corners of the nisse goes on from a side ending at one:
		// held, the topology recipe draws every piece the solve drew.
		const key = (e: { family?: string; from: Point; to: Point }) => `${e.family}:${[e.from, e.to].map(q => q.map(v => v.toFixed(3)).join(',')).sort().join('>')}`;
		const held = topologyConstruction({ ...topologyOf(solve, shown)!, held: true }, shown)!.edges;
		expect(new Set(held.map(key))).toEqual(new Set(recipeEdges(solve, recipeOutline(shown.rings)).map(key)));
	});

	it('takes its topology\'s stored cuts only where they beat the generator\'s own heart', () => {
		const colors = { left: '#ffffff', right: '#b91313' }, recipes = (board as unknown as RecipeFile).recipes;
		const request = (contours: Ring[], scale: number) => ({ mode: 'figure' as const, name: 'Motif', contours, colors, style: 'board' as const, frame: 'circle' as const, frameSize: 70, scale, gap: 3 });
		// The star at 60% on five strips: one of its topology's recipes, with fewer sharp tips.
		const asked = request(star.contours as Ring[], .6), own = generate(asked), made = generate({ ...asked, recipes });
		const rings = picture(asked)!.rings;
		expect(made.design.fingers).not.toEqual(own.design.fingers);
		expect(betterCuts(cutMeasures(made.design, rings), cutMeasures(own.design, rings))).toBe(true);
	});
});
