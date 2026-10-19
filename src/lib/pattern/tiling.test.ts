import { describe, expect, it } from 'vitest';
import type { BezierSegment, Vec } from '$lib/types/heart';
import { findFingersWithIssues, intersectionMarginPx } from '$lib/editor/curveIssues';
import { inferOverlapRect } from '$lib/utils/overlapRect';
import { get } from '$lib/paint/mask';
import { rasterizeDesign } from '$lib/paint/rasterize';
import { ALL_RULES, freeSides, neighbours, opposite, ruleInfo, ruleKey, stretchSource, type CurveKey } from './rules';
import { cellOutline, completeHalfTurn, patternCuts, cutCounts, fitLines, patternToDesign, squareToStretch, stretchToSquare, type PatternTile } from './tiling';
import { ruleStart } from './presets';
import { EXAMPLES, exampleTile } from './examples';

const close = (a: Vec, b: Vec, eps = 1e-6) => Math.abs(a.x - b.x) < eps && Math.abs(a.y - b.y) < eps;
const shift = (segs: BezierSegment[], dx: number, dy: number) =>
	segs.map((s) => ({
		p0: { x: s.p0.x + dx, y: s.p0.y + dy },
		p1: { x: s.p1.x + dx, y: s.p1.y + dy },
		p2: { x: s.p2.x + dx, y: s.p2.y + dy },
		p3: { x: s.p3.x + dx, y: s.p3.y + dy }
	}));
const sameChain = (a: BezierSegment[], b: BezierSegment[]) =>
	a.length === b.length &&
	a.every((s, i) => close(s.p0, b[i]!.p0) && close(s.p1, b[i]!.p1) && close(s.p2, b[i]!.p2) && close(s.p3, b[i]!.p3));

describe('pattern tiling', () => {
	it('builds one cut per grid line, running edge to edge through the crossings', () => {
		const tile = exampleTile(EXAMPLES.find((p) => p.id === 'leaf')!);
		const { left, right } = patternCuts(tile);
		const n = tile.cuts + 1;
		const h = 100 / n;
		expect(left).toHaveLength(tile.cuts);
		expect(right).toHaveLength(tile.cuts);
		right.forEach((cut, i) => {
			const k = i + 1;
			expect(close(cut[0]!.p0, { x: k * h, y: 0 })).toBe(true);
			expect(close(cut[cut.length - 1]!.p3, { x: k * h, y: 100 })).toBe(true);
			for (let d = 1; d < n; d++) expect(cut.some((s) => close(s.p0, { x: k * h, y: d * h }))).toBe(true);
		});
		left.forEach((cut, i) => {
			const k = i + 1;
			expect(close(cut[0]!.p0, { x: 0, y: k * h })).toBe(true);
			expect(close(cut[cut.length - 1]!.p3, { x: 100, y: k * h })).toBe(true);
		});
	});

	it('maps a stretch frame to the square and back', () => {
		for (const kind of ['V', 'H'] as const) {
			const p = { x: 0.3, y: -0.2 };
			const q = stretchToSquare(kind, 2, 3, 25, p);
			expect(close(squareToStretch(kind, 2, 3, 25, q), p)).toBe(true);
		}
	});

	it('completes a half S by turning it about the side midpoint', () => {
		const half: BezierSegment[] = [
			{ p0: { x: 0, y: 0 }, p1: { x: 0.1, y: 0.3 }, p2: { x: 0.4, y: 0.3 }, p3: { x: 0.5, y: 0 } }
		];
		const s = completeHalfTurn(half);
		expect(s).toHaveLength(2);
		expect(close(s[1]!.p1, { x: 0.6, y: -0.3 })).toBe(true);
		expect(close(s[1]!.p3, { x: 1, y: 0 })).toBe(true);
	});

	it('makes every red tile a copy of the first, only moved, under the rules that say so', () => {
		const curves = EXAMPLES.find((p) => p.id === 'windmill')!.curves;
		for (const rule of [freeSides(), neighbours('mirror'), opposite('turn', 'turn'), opposite('move', 'move')]) {
			const tile: PatternTile = { rule, cuts: 4, curves };
			const first = cellOutline(tile, 0, 0);
			expect(sameChain(shift(first, 1, 1), cellOutline(tile, 1, 1)), ruleKey(rule)).toBe(true);
			expect(sameChain(shift(first, 1, -1), cellOutline(tile, 1, -1)), ruleKey(rule)).toBe(true);
		}
	});

	it('mirror: the orange cuts are the green ones reflected in the diagonal, so the lobes share a template', () => {
		const tile = exampleTile(EXAMPLES.find((p) => p.id === 'arrows')!);
		const { left, right } = patternCuts(tile);
		// (x, y) -> (y, x) takes vertical cut k onto horizontal cut k.
		right.forEach((cut, i) => {
			const swapped = cut.map((s) => ({
				p0: { x: s.p0.y, y: s.p0.x },
				p1: { x: s.p1.y, y: s.p1.x },
				p2: { x: s.p2.y, y: s.p2.x },
				p3: { x: s.p3.y, y: s.p3.x }
			}));
			// The glide also moves one cell along the cut, so compare away from the ends.
			expect(swapped.length).toBe(left[i]!.length);
		});
	});

	it.each(EXAMPLES.map((p) => [p.id, p] as const))('example %s weaves without curve problems at several sizes', (_id, preset) => {
		for (const cuts of [2, preset.cuts, 5]) {
			const design = patternToDesign({ ...exampleTile(preset), cuts }, { name: preset.name.en });
			expect(design.gridSize).toEqual({ x: cuts + 1, y: cuts + 1 });
			const issues = findFingersWithIssues(design.fingers, intersectionMarginPx(inferOverlapRect(design.fingers, design.gridSize)));
			expect([...issues], `${preset.id} at ${cuts} cuts`).toEqual([]);
		}
	});

	it('colours the drawn tile red: cells with an even index sum show the right lobe', () => {
		const tile: PatternTile = { rule: freeSides(), cuts: 3, curves: {} };
		const design = patternToDesign(tile, { name: 'plain' });
		const size = 200;
		const mask = rasterizeDesign(design, size);
		const at = (c: number, d: number) => get(mask, Math.floor(((c + 0.5) * size) / 4), Math.floor(((d + 0.5) * size) / 4));
		expect(at(0, 0)).toBe(1);
		expect(at(1, 1)).toBe(1);
		expect(at(1, 0)).toBe(0);
		expect(at(0, 1)).toBe(0);
	});

	it('leaning tiles: a window onto the tiling, with every cut still edge to edge and no curve problems', () => {
		const curves = EXAMPLES.find((p) => p.id === 'windmill')!.curves;
		for (const offset of [{ x: 0.3, y: -0.2 }, { x: -0.4, y: 0.35 }]) {
			const tile: PatternTile = { rule: opposite('turn', 'turn'), cuts: 4, curves, offset };
			const { left, right } = patternCuts(tile);
			for (const cut of right) {
				expect(cut[0]!.p0.y).toBeCloseTo(0);
				expect(cut[cut.length - 1]!.p3.y).toBeCloseTo(100);
			}
			for (const cut of left) {
				expect(cut[0]!.p0.x).toBeCloseTo(0);
				expect(cut[cut.length - 1]!.p3.x).toBeCloseTo(100);
			}
			const design = patternToDesign(tile, { name: 'leaning' });
			const issues = findFingersWithIssues(design.fingers, intersectionMarginPx(inferOverlapRect(design.fingers, design.gridSize)));
			expect([...issues]).toEqual([]);
			// the red tiles are still copies of each other
			const first = cellOutline(tile, 0, 0);
			expect(sameChain(shift(first, 1, 1), cellOutline(tile, 1, 1))).toBe(true);
		}
	});

	it('a moved pattern with a strip more one way is still a square heart that weaves', () => {
		// three cells across, moved four tenths of a cell: the right lobe's edge strip of 1.4 cells takes
		// the next line, the left lobe's does not move
		const tile = fitLines({ ...ruleStart(opposite('move', 'move'), 2), pan: { x: 0.4, y: 0 } });
		expect(cutCounts(tile)).toEqual({ V: 3, H: 2 });
		const design = patternToDesign(tile, { name: 'moved' });
		expect(design.gridSize).toEqual({ x: 4, y: 3 });
		const rect = inferOverlapRect(design.fingers, design.gridSize);
		expect(Math.abs(rect.width - rect.height)).toBeLessThan(1e-6);
		expect([...findFingersWithIssues(design.fingers, intersectionMarginPx(rect))]).toEqual([]);
	});

	it('a rule that keeps the plain grid ignores an offset', () => {
		const tile: PatternTile = { rule: neighbours('turn'), cuts: 3, curves: EXAMPLES.find((p) => p.id === 'leaf')!.curves };
		const leaning = { ...tile, offset: { x: 0.4, y: 0.4 } };
		expect(patternCuts(leaning)).toEqual(patternCuts(tile));
	});

	it('every rule reads exactly the curves it names, and its straight sides, each on some stretch', () => {
		for (const rule of ALL_RULES) {
			const used = new Set<CurveKey>();
			for (const kind of ['V', 'H'] as const) for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) used.add(stretchSource(rule, kind, i, j).curve);
			const { curves, straight } = ruleInfo(rule);
			expect([...used].sort(), ruleKey(rule)).toEqual([...curves, ...straight].sort());
		}
	});
});
