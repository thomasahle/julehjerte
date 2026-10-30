import { describe, it, expect } from 'vitest';
import { alignCorners, carryTopology, outlineFrame, transferTopology } from './topologyTransfer';
import { storedHearts } from './generate';
import { boardSetting } from './boardMotif';
import { picture } from './picture';
import { boardOutline } from './boardOutline';
import { nestingOf, topologyOf } from './topologyRecipes';
import { isTopology, type MotifRecipe, type RecipeFile, type TopologyRecipe } from './recipes';
import type { Ring } from './geometry';
import star from '../../../static/generator/motifs/star.json';
import tree from '../../../static/generator/motifs/tree.json';
import starSolves from '../../../scripts/generator/solves/star.board.json';
import treeSolves from '../../../scripts/generator/solves/tree.board.json';
import board from '../../../static/generator/recipes/board.json';

const colors = { left: '#ffffff', right: '#b91313' };
const request = (scale: number) => ({ mode: 'figure' as const, name: 'Star', contours: star.contours as Ring[], colors, style: 'board' as const, board: 5, frame: 'circle' as const, frameSize: 70, scale, gap: 3 });
// The star on five strips with a circle of a radius: its size, its picture, and the board's part of it.
const at = (radius: number) => {
	const scale = boardSetting(radius, 5), shown = picture(request(scale))!;
	return { scale, step: Math.round(scale * 100), shown, board: shown.rings.slice(0, shown.motif) };
};
// The circle meeting the middle lines a cutting clearance short of the paper's edge, short of it,
// and meeting the edge past them.
const SHORT = 49.5, PAST = 51.4;
// The recipes stored for the star's pair with the circle short of the edge (its board's blobs, its
// rings' nesting), each carried from the outline it was solved on to this one.
let found: TopologyRecipe[] | undefined;
const listed = () => found ??= (() => {
	const { shown, board: b } = at(SHORT), nest = nestingOf(shown.rings.slice(shown.motif)), blobs = boardOutline(b, 360).sig;
	return (board as unknown as RecipeFile).recipes.filter(isTopology).filter(r => r.frame?.blobs === blobs && r.motif === nest)
		.map(r => carryTopology(r, r.frame!, b)).filter(r => r !== undefined);
})();

describe("a topology's recipe carried to a board of the same blobs", () => {
	it('pairs the corners along a blob edge in order, leaving out one gone', () => {
		expect(alignCorners([.3, .9], [.3, .9])).toEqual([[.3, .3], [.9, .9]]);
		// The corner where a middle line met the circle near the edge goes, with the stretch to it.
		expect(alignCorners([.04, .31, .95], [.28, .93])).toEqual([[.31, .28], [.95, .93]]);
		expect(alignCorners([.28], [.04, .31])).toEqual([[.28, .31]]);
	});

	it('is the same blobs on five strips short of the edge and past the middle lines, another graph only where it turns', () => {
		const [a, b] = [at(SHORT), at(PAST)];
		expect(boardOutline(a.board).sig).not.toBe(boardOutline(b.board).sig);
		expect(boardOutline(a.board, 360).sig).toBe(boardOutline(b.board, 360).sig);
		// Each place on the board carried lands on the other outline, the recipe its topology's there.
		const carried = listed().map(r => transferTopology(r, a.board, b.board)).filter(r => r !== undefined);
		expect(carried.length).toBeGreaterThan(0);
		for (const r of carried) expect(r.outline).toBe(boardOutline(b.board).sig);
		// Not to a board of other blobs: inside the middle lines.
		const inside = at(31).board;
		expect(listed().slice(0, 3).map(r => transferTopology(r, a.board, inside)).filter(r => r !== undefined)).toEqual([]);
	});

	it('draws a recipe stored with the outline it was solved on where the outline turns elsewhere', () => {
		// The star's solve at 83% on three strips: at 90% its board's blobs are the same, its outline another graph.
		const solve = (starSolves as { recipes: MotifRecipe[] }).recipes.find(r => r.strips === 3 && r.steps[0] === 83)!;
		const on = (p: number) => ({ ...request(p / 100), board: 3 }), shown = picture(on(83), solve.known)!;
		const topology = topologyOf(solve, shown)!, frame = outlineFrame(shown.rings.slice(0, shown.motif))!, there = picture(on(90), solve.known)!;
		expect(boardOutline(there.rings.slice(0, there.motif)).sig).not.toBe(topology.outline);
		const drawn = (recipe: TopologyRecipe) => storedHearts(on(90), [recipe], true, 1, solve.known).length;
		expect(drawn({ ...topology, steps: [90] })).toBe(0);
		expect(drawn({ ...topology, steps: [], frame })).toBe(1);
	});

	it('frames a board whose blobs touch at a corner, an edge running from there round to it', () => {
		const solve = (treeSolves as { recipes: MotifRecipe[] }).recipes.find(r => r.strips === 5 && r.steps[0] === 71)!;
		const shown = picture({ ...request(.71), contours: tree.contours as Ring[] }, solve.known)!;
		expect(outlineFrame(shown.rings.slice(0, shown.motif))).toBeDefined();
	});
});
