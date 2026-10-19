import { describe, expect, it } from 'vitest';
import type { BezierSegment, Vec } from '$lib/types/heart';
import { ALL_RULES, SIDE_LINKS, canLean, freeSides, halfOf, isRedCell, moveBy, neighbours, opposite, ruleInfo, ruleKey, ruleMotions, type SideLink, type TileRule } from './rules';
import { cellOutline, crossing, type PatternTile, type SideCurve } from './tiling';
import { ruleStart } from './starts';

// The Escher tab says how the white tile follows from the red one, from which of the red tile's
// sides belong together and how. These tests hold every answer to its word: the motion it names
// takes the whole tiling onto itself, every tile onto a tile of the colour it says.

const at = (s: BezierSegment, t: number): Vec => {
	const u = 1 - t;
	return {
		x: u * u * u * s.p0.x + 3 * u * u * t * s.p1.x + 3 * u * t * t * s.p2.x + t * t * t * s.p3.x,
		y: u * u * u * s.p0.y + 3 * u * u * t * s.p1.y + 3 * u * t * t * s.p2.y + t * t * t * s.p3.y
	};
};
const sample = (outline: BezierSegment[], perSegment: number) =>
	outline.flatMap((s) => Array.from({ length: perSegment }, (_, k) => at(s, k / perSegment)));

/**
 * Whether every point of `ps` lies within a hundredth of a cell of one of `qs`. The `qs` are sorted
 * into squares that size, so only the nine squares round each point are searched; the squares are
 * counted once and stepped by whole numbers, since x ± 0.01 need not land in the next square.
 */
function within(ps: Vec[], qs: Vec[]): boolean {
	const square = (v: number) => Math.floor(v / 0.01);
	const squares = new Map<string, Vec[]>();
	for (const q of qs) {
		const key = `${square(q.x)},${square(q.y)}`;
		const list = squares.get(key);
		if (list) list.push(q);
		else squares.set(key, [q]);
	}
	return ps.every((p) => {
		const [i, j] = [square(p.x), square(p.y)];
		for (let di = -1; di <= 1; di++) {
			for (let dj = -1; dj <= 1; dj++) {
				if (squares.get(`${i + di},${j + dj}`)?.some((q) => (p.x - q.x) ** 2 + (p.y - q.y) ** 2 < 1e-4)) return true;
			}
		}
		return false;
	});
}

/** Whether two outlines are the same closed curve, as sets of points (to a hundredth of a cell). */
function sameOutline(a: BezierSegment[], b: BezierSegment[]): boolean {
	const fine = (o: BezierSegment[]) => sample(o, 240);
	const coarse = (o: BezierSegment[]) => sample(o, 24);
	return within(coarse(a), fine(b)) && within(coarse(b), fine(a));
}

const move = (outline: BezierSegment[], f: (p: Vec) => Vec): BezierSegment[] =>
	outline.map((s) => ({ p0: f(s.p0), p1: f(s.p1), p2: f(s.p2), p3: f(s.p3) }));

/** A curve with no symmetry of its own, whole or the first half of a side, a little different for each `k`. */
function lopsided(k: number, half: boolean): SideCurve {
	const end = half ? 0.5 : 1;
	return [
		{ p0: { x: 0, y: 0 }, p1: { x: 0.15 * end, y: 0.12 + 0.03 * k }, p2: { x: 0.45 * end, y: 0.2 }, p3: { x: 0.6 * end, y: 0.04 } },
		{ p0: { x: 0.6 * end, y: 0.04 }, p1: { x: 0.75 * end, y: -0.1 }, p2: { x: 0.9 * end, y: -0.04 * (k + 1) }, p3: { x: end, y: 0 } }
	];
}

/** The rule with every curve lopsided, so a motion the rule does not make cannot pass for one it does. */
const lopsidedTile = (rule: TileRule): PatternTile => ({
	rule,
	cuts: 4,
	curves: Object.fromEntries(ruleInfo(rule).curves.map((key, k) => [key, lopsided(k, !!halfOf(rule, key))]))
});

/** The tile Tegn's Escher tab starts a rule from when it has nothing to keep. */
const start = (rule: TileRule) => ruleStart(rule, 4);

interface Motion {
	name: string;
	map: (p: Vec) => Vec;
	/** Whether it takes red tiles onto white ones, or keeps the colours. */
	swaps: boolean;
}

// A tied pair of opposite sides takes the red tile (0, 0) onto the white tile across that pair:
// (1, 0) across its lower-right side, (0, 1) across its lower-left one.
const ACROSS_V: Record<SideLink, Motion> = {
	move: { name: 'moved one square', map: (p) => ({ x: p.x + 1, y: p.y }), swaps: true },
	mirror: { name: 'mirrored in the line through its middle and moved one square along it', map: (p) => ({ x: p.x + 1, y: 1 - p.y }), swaps: true },
	turn: { name: 'turned half round about the middle of its lower-right side', map: (p) => ({ x: 2 - p.x, y: 1 - p.y }), swaps: true }
};
const ACROSS_H: Record<SideLink, Motion> = {
	move: { name: 'moved one square', map: (p) => ({ x: p.x, y: p.y + 1 }), swaps: true },
	mirror: { name: 'mirrored in the line through its middle and moved one square along it', map: (p) => ({ x: 1 - p.x, y: p.y + 1 }), swaps: true },
	turn: { name: 'turned half round about the middle of its lower-left side', map: (p) => ({ x: 1 - p.x, y: 2 - p.y }), swaps: true }
};

/** The four lines a tile could be its own mirror image across: through the middles of its opposite sides, and its diagonals. */
const OWN_MIRRORS: Motion[] = [
	{ name: 'its own mirror image across the line through its upper-right and lower-left sides', map: (p) => ({ x: 1 - p.x, y: p.y }), swaps: false },
	{ name: 'its own mirror image across the line through its upper-left and lower-right sides', map: (p) => ({ x: p.x, y: 1 - p.y }), swaps: false },
	{ name: 'its own mirror image, left and right swapped', map: (p) => ({ x: p.y, y: p.x }), swaps: false },
	{ name: 'its own mirror image, top and bottom swapped', map: (p) => ({ x: 1 - p.y, y: 1 - p.x }), swaps: false }
];

/** What the Escher tab says each answer does, as motions of the plane in cell coordinates. */
function claims(rule: TileRule): Motion[] {
	switch (rule.sides) {
		case 'free':
			// two shapes: every red tile the same tile, only moved, and every white one
			return [
				{ name: 'red moved onto red, one way', map: (p) => ({ x: p.x + 1, y: p.y + 1 }), swaps: false },
				{ name: 'red moved onto red, the other way', map: (p) => ({ x: p.x + 1, y: p.y - 1 }), swaps: false }
			];
		case 'opposite':
			return [ACROSS_V[rule.v], ACROSS_H[rule.h]];
		case 'neighbour':
			if (rule.link === 'mirror') {
				// the heart stands on its corner, so its left-right mirror is (x, y) → (y, x); then down one step
				return [{ name: 'mirrored, left and right swapped, and moved', map: (p) => ({ x: p.y + 1, y: p.x }), swaps: true }];
			}
			if (rule.link === 'turn') {
				// each pair turned a quarter about the corner it shares
				return [
					{ name: 'the right sides turned a quarter about the right corner', map: (p) => ({ x: 1 + p.y, y: 1 - p.x }), swaps: true },
					{ name: 'the left sides turned a quarter about the left corner', map: (p) => ({ x: 1 - p.y, y: 1 + p.x }), swaps: true }
				];
			}
			// both, and so every tile its own mirror image across the lines joining the middles of its
			// opposite sides
			return [...claims(neighbours('mirror')), ...claims(neighbours('turn')), ...OWN_MIRRORS.slice(0, 2)];
		case 'type':
			// McLean's other types say what they are by the motions that make them (types.test holds
			// those to his and Kaplan's descriptions); here, that the tiles drawn keep to them
			return ruleMotions(rule).map((m, k) => {
				const centre = moveBy(m, { x: 0.5, y: 0.5 });
				return { name: `IH${rule.ih} motion ${k}`, map: (p) => moveBy(m, p), swaps: !isRedCell(Math.floor(centre.x), Math.floor(centre.y)) };
			});
	}
}

/**
 * Whether `m` takes the tiling onto itself: every tile round the red one onto the tile it lands on,
 * of the colour it should be. The rules repeat every two tiles each way, so these nine tiles stand
 * for all of them.
 */
function holds(tile: PatternTile, m: Motion): boolean {
	for (let c = -1; c <= 1; c++) {
		for (let d = -1; d <= 1; d++) {
			const centre = m.map({ x: c + 0.5, y: d + 0.5 });
			const [c2, d2] = [Math.floor(centre.x), Math.floor(centre.y)];
			if ((isRedCell(c, d) !== isRedCell(c2, d2)) !== m.swaps) return false;
			if (!sameOutline(move(cellOutline(tile, c, d), m.map), cellOutline(tile, c2, d2))) return false;
		}
	}
	return true;
}

describe('every way of tying the sides does what the Escher tab says', () => {
	it('has every way of tying the sides, once, and the types a woven heart allows besides', () => {
		// thirteen ways of tying the sides in three families, and nineteen more of McLean's types
		expect(ALL_RULES).toHaveLength(32);
		expect(new Set(ALL_RULES.map(ruleKey)).size).toBe(ALL_RULES.length);
	});

	it.each(ALL_RULES.map((rule) => [ruleKey(rule), rule] as const))('%s', (_key, rule) => {
		for (const [what, tile] of [['lopsided', lopsidedTile(rule)], ['start', start(rule)]] as const) {
			for (const m of claims(rule)) expect(holds(tile, m), `${what}: ${m.name}`).toBe(true);
		}
	});

	// Also for the tiles the Escher tab starts from: plain as they are, they show their rule and no other.
	it.each([
		['lopsided', lopsidedTile],
		['start', start]
	] as const)('and no more: a pair tied one way is not also tied another (%s)', (_what, make) => {
		for (const v of SIDE_LINKS) {
			for (const h of SIDE_LINKS) {
				const tile = make(opposite(v, h));
				for (const other of SIDE_LINKS.filter((l) => l !== v)) expect(holds(tile, ACROSS_V[other]), `${v}+${h} as ${other} across`).toBe(false);
				for (const other of SIDE_LINKS.filter((l) => l !== h)) expect(holds(tile, ACROSS_H[other]), `${v}+${h} as ${other} along`).toBe(false);
			}
		}
		// two shapes: the white tile is none of the red one's images
		const free = make(freeSides());
		for (const m of [...Object.values(ACROSS_V), ...Object.values(ACROSS_H)]) expect(holds(free, m), m.name).toBe(false);
		// neighbours mirrored are not turned, nor turned ones mirrored, and neither tile is its own mirror image
		const [mirrored, turned] = [make(neighbours('mirror')), make(neighbours('turn'))];
		for (const m of [...claims(neighbours('turn')), ...OWN_MIRRORS]) expect(holds(mirrored, m), `mirrored neighbours ${m.name}`).toBe(false);
		for (const m of [...claims(neighbours('mirror')), ...OWN_MIRRORS]) expect(holds(turned, m), `turned neighbours ${m.name}`).toBe(false);
	});

	it('the rules that let tiles lean keep their word when they lean', () => {
		expect(ALL_RULES.filter(canLean).map(ruleKey)).toEqual(['free', 'opposite:turn:turn']);
		for (const offset of [{ x: 0.35, y: -0.2 }, { x: -0.6, y: 0.45 }]) {
			// Two shapes: the red tiles are still copies of one another, moved
			const free: PatternTile = { ...lopsidedTile(freeSides()), offset };
			const step = { x: crossing(free, 1, 1).x - crossing(free, 0, 0).x, y: crossing(free, 1, 1).y - crossing(free, 0, 0).y };
			expect(sameOutline(move(cellOutline(free, 0, 0), (p) => ({ x: p.x + step.x, y: p.y + step.y })), cellOutline(free, 1, 1))).toBe(true);
			// S sides: turned half round about the middle of the side the red tile shares with each white neighbour
			const half: PatternTile = { ...lopsidedTile(opposite('turn', 'turn')), offset };
			for (const [[a, b], [c, d]] of [
				[[crossing(half, 1, 0), crossing(half, 1, 1)], [1, 0]],
				[[crossing(half, 0, 1), crossing(half, 1, 1)], [0, 1]]
			] as const) {
				const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
				expect(sameOutline(move(cellOutline(half, 0, 0), (p) => ({ x: 2 * m.x - p.x, y: 2 * m.y - p.y })), cellOutline(half, c, d))).toBe(true);
			}
		}
	});
});
