import { describe, expect, it } from 'vitest';
import type { BezierSegment, Vec } from '$lib/types/heart';
import { ALL_RULES, freeSides, halfOf, moveBy, neighbours, opposite, ruleInfo, ruleKey, ruleMotions, type TileRule } from './rules';
import { cornerFreedom, cornerShift, jointFreedom, jointsOfLength, nearestCorners } from './corners';
import { cellOutline, type PatternTile, type SideCurve } from './tiling';

// A rule's motions have to take its tiling onto itself wherever the corners it lets move stand: each motion
// of the grid, p ↦ M·p + e, becomes p ↦ M·p + e + s of the tiling, s its own.

const at = (s: BezierSegment, t: number): Vec => {
	const u = 1 - t;
	return {
		x: u * u * u * s.p0.x + 3 * u * u * t * s.p1.x + 3 * u * t * t * s.p2.x + t * t * t * s.p3.x,
		y: u * u * u * s.p0.y + 3 * u * u * t * s.p1.y + 3 * u * t * t * s.p2.y + t * t * t * s.p3.y
	};
};
const sample = (outline: BezierSegment[], n: number) => outline.flatMap((s) => Array.from({ length: n }, (_, k) => at(s, k / n)));
/** Whether every point of `a`'s outline lies within a hundredth of a cell of `b`'s, and the other way. */
function sameOutline(a: BezierSegment[], b: BezierSegment[]): boolean {
	const near = (ps: Vec[], qs: Vec[]) => ps.every((p) => qs.some((q) => Math.hypot(p.x - q.x, p.y - q.y) < 0.01));
	return near(sample(a, 12), sample(b, 120)) && near(sample(b, 12), sample(a, 120));
}

/** A curve with no symmetry of its own, whole or the first half of a side, a little different for each `k`. */
function lopsided(k: number, half: boolean): SideCurve {
	const end = half ? 0.5 : 1;
	return [
		{ p0: { x: 0, y: 0 }, p1: { x: 0.15 * end, y: 0.12 + 0.03 * k }, p2: { x: 0.45 * end, y: 0.2 }, p3: { x: 0.6 * end, y: 0.04 } },
		{ p0: { x: 0.6 * end, y: 0.04 }, p1: { x: 0.75 * end, y: -0.1 }, p2: { x: 0.9 * end, y: -0.04 * (k + 1) }, p3: { x: end, y: 0 } }
	];
}

const lopsidedTile = (rule: TileRule, corners: number[]): PatternTile => ({
	rule,
	cuts: 4,
	curves: Object.fromEntries(ruleInfo(rule).curves.map((key, k) => [key, lopsided(k, !!halfOf(rule, key))])),
	corners
});

describe('corners off the grid', () => {
	it('two shapes, and opposite sides each their own S, let every other corner move both ways: the old lean', () => {
		for (const rule of [freeSides(), opposite('turn', 'turn')]) {
			const freedom = cornerFreedom(rule);
			expect(freedom.free).toEqual([
				{ i: 0, j: 1, axis: 'x' },
				{ i: 0, j: 1, axis: 'y' }
			]);
			for (let i = 0; i < 4; i++)
				for (let j = 0; j < 4; j++) expect(cornerShift(freedom, [0.3, -0.2], i, j)).toEqual((i + j) % 2 ? { x: 0.3, y: -0.2 } : { x: 0, y: 0 });
		}
	});

	it('moved both ways, nothing moves; moved and mirrored, the mirror slides and every other column with it', () => {
		expect(cornerFreedom(opposite('move', 'move')).free).toEqual([]);
		expect(cornerFreedom(neighbours('turn')).free).toEqual([]);
		const glide = cornerFreedom(opposite('mirror', 'move'));
		expect(glide.free).toEqual([{ i: 1, j: 0, axis: 'y' }]);
		for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) expect(cornerShift(glide, [0.6], i, j)).toEqual({ x: 0, y: i % 2 ? 0.6 : 0 });
	});

	it.each(ALL_RULES.filter((rule) => cornerFreedom(rule).free.length).map((rule) => [ruleKey(rule), rule] as const))(
		'%s keeps its word wherever its corners stand',
		(_key, rule) => {
			const freedom = cornerFreedom(rule);
			for (const seed of [1, 2]) {
				const corners = freedom.free.map((_, k) => (0.35 - 0.11 * k) * (seed === 1 ? 1 : -1.3));
				const tile = lopsidedTile(rule, corners);
				const shift = (i: number, j: number) => cornerShift(freedom, corners, i, j);
				for (const m of ruleMotions(rule)) {
					// The motion's own shift, from where it takes the crossing (0, 0).
					const to = moveBy(m, { x: 0, y: 0 });
					const s0 = shift(to.x, to.y);
					const o = shift(0, 0);
					const s = { x: s0.x - (m.a * o.x + m.b * o.y), y: s0.y - (m.c * o.x + m.d * o.y) };
					const motion = (p: Vec): Vec => {
						const q = moveBy(m, p);
						return { x: q.x + s.x, y: q.y + s.y };
					};
					for (const [c, d] of [
						[0, 0],
						[1, 0],
						[0, 1],
						[1, 1],
						[2, 1]
					] as const) {
						const image = [moveBy(m, { x: c, y: d }), moveBy(m, { x: c + 1, y: d }), moveBy(m, { x: c, y: d + 1 }), moveBy(m, { x: c + 1, y: d + 1 })];
						const cell = { c: Math.min(...image.map((p) => p.x)), d: Math.min(...image.map((p) => p.y)) };
						const moved = cellOutline(tile, c, d).map((seg) => ({ p0: motion(seg.p0), p1: motion(seg.p1), p2: motion(seg.p2), p3: motion(seg.p3) }));
						expect(sameOutline(moved, cellOutline(tile, cell.c, cell.d)), `cell (${c}, ${d}) seed ${seed}`).toBe(true);
					}
				}
			}
		}
	);

	it('lets crossings open into joints where no motion swaps the colours: two shapes, and only they', () => {
		for (const rule of ALL_RULES) {
			const two = rule.sides === 'free' || rule.sides === 'two';
			for (const join of ['red', 'white'] as const) expect(!!jointFreedom(rule, join)?.free.length, `${ruleKey(rule)} ${join}`).toBe(two);
		}
	});

	it.each(ALL_RULES.filter((rule) => jointFreedom(rule, 'white')).map((rule) => [ruleKey(rule), rule] as const))(
		'%s keeps its word with its crossings opened into joints, either colour joining',
		(_key, rule) => {
			for (const join of ['white', 'red'] as const) {
				const freedom = jointFreedom(rule, join)!;
				const tile: PatternTile = { ...lopsidedTile(rule, []), joints: { join, free: jointsOfLength(freedom, join, 0.2).map((w, k) => w * (1 + 0.1 * k)) } };
				for (const m of ruleMotions(rule)) {
					const motion = (p: Vec): Vec => moveBy(m, p);
					for (const [c, d] of [
						[0, 0],
						[1, 0],
						[0, 1],
						[1, 1]
					] as const) {
						const image = [moveBy(m, { x: c, y: d }), moveBy(m, { x: c + 1, y: d }), moveBy(m, { x: c, y: d + 1 }), moveBy(m, { x: c + 1, y: d + 1 })];
						const cell = { c: Math.min(...image.map((p) => p.x)), d: Math.min(...image.map((p) => p.y)) };
						const moved = cellOutline(tile, c, d).map((seg) => ({ p0: motion(seg.p0), p1: motion(seg.p1), p2: motion(seg.p2), p3: motion(seg.p3) }));
						expect(sameOutline(moved, cellOutline(tile, cell.c, cell.d)), `${join}: cell (${c}, ${d})`).toBe(true);
					}
				}
			}
		}
	);

	it('finds the corners nearest a wanted shift, the least that does where several do', () => {
		const freedom = cornerFreedom(freeSides());
		const [x, y] = nearestCorners(freedom, [{ i: 1, j: 0, shift: { x: 0.25, y: 0.5 } }]);
		expect(x).toBeCloseTo(0.25, 6);
		expect(y).toBeCloseTo(0.5, 6);
		// a crossing that cannot move asks for nothing
		expect(nearestCorners(freedom, [{ i: 0, j: 0, shift: { x: 0.25, y: 0.5 } }])).toEqual([0, 0]);
	});
});
