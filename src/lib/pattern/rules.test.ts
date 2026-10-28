import { describe, expect, it } from 'vitest';
import type { BezierSegment, Vec } from '$lib/types/heart';
import { ALL_RULES, SIDE_LINKS, freeSides, halfOf, isRedCell, latticeOf, moveBy, neighbours, ofType, opposite, ruleInfo, ruleKey, ruleMotions, type Lattice, type SideLink, type TileRule } from './rules';
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
		case 'two':
		case 'three':
			// McLean's other types say what they are by the motions that make them (types.test holds
			// those to his and Kaplan's descriptions, two.test finds every way of two shapes); here, that
			// the tiles drawn keep to them
			return ruleMotions(rule).map((m, k) => {
				const centre = moveBy(m, { x: 0.5, y: 0.5 });
				return { name: `${ruleKey(rule)} motion ${k}`, map: (p) => moveBy(m, p), swaps: !isRedCell(Math.floor(centre.x), Math.floor(centre.y)) };
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
		// thirteen ways of tying the sides in three families, nineteen more of McLean's types, seventeen more
		// ways of two shapes, and ten of three
		expect(ALL_RULES).toHaveLength(59);
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
		for (const offset of [{ x: 0.35, y: -0.2 }, { x: -0.6, y: 0.45 }]) {
			const corners = [offset.x, offset.y];
			// Two shapes: the red tiles are still copies of one another, moved
			const free: PatternTile = { ...lopsidedTile(freeSides()), corners };
			const step = { x: crossing(free, 1, 1).x - crossing(free, 0, 0).x, y: crossing(free, 1, 1).y - crossing(free, 0, 0).y };
			expect(sameOutline(move(cellOutline(free, 0, 0), (p) => ({ x: p.x + step.x, y: p.y + step.y })), cellOutline(free, 1, 1))).toBe(true);
			// S sides: turned half round about the middle of the side the red tile shares with each white neighbour
			const half: PatternTile = { ...lopsidedTile(opposite('turn', 'turn')), corners };
			for (const [[a, b], [c, d]] of [
				[[crossing(half, 1, 0), crossing(half, 1, 1)], [1, 0]],
				[[crossing(half, 0, 1), crossing(half, 1, 1)], [0, 1]]
			] as const) {
				const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
				expect(sameOutline(move(cellOutline(half, 0, 0), (p) => ({ x: 2 * m.x - p.x, y: 2 * m.y - p.y })), cellOutline(half, c, d))).toBe(true);
			}
		}
	});

	// Two and three shapes: no motion of the grid but the type's own takes the tiling onto itself, in the tiles the
	// tab starts from too: the red tiles onto no white ones, and the white ones of one kind onto none of the other.
	it.each(ALL_RULES.filter((rule) => rule.sides === 'two' || rule.sides === 'three').map((rule) => [ruleKey(rule), rule] as const))('%s keeps no motion but its own', (_key, rule) => {
		const LINEAR = [[1, 0, 0, 1], [-1, 0, 0, -1], [0, -1, 1, 0], [0, 1, -1, 0], [-1, 0, 0, 1], [1, 0, 0, -1], [0, 1, 1, 0], [0, -1, -1, 0]] as const;
		const mod4 = (v: number) => ((v % 4) + 4) % 4;
		const key = (m: { a: number; b: number; c: number; d: number; e: number; f: number }) => [m.a, m.b, m.c, m.d, mod4(m.e), mod4(m.f)].join(',');
		// the type's own motions, modulo moves by four
		const own = new Set([key({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 })]);
		const queue = [{ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }];
		while (queue.length) {
			const m = queue.pop()!;
			for (const g of ruleMotions(rule)) {
				const n = { a: g.a * m.a + g.b * m.c, b: g.a * m.b + g.b * m.d, c: g.c * m.a + g.d * m.c, d: g.c * m.b + g.d * m.d, e: mod4(g.a * m.e + g.b * m.f + g.e), f: mod4(g.c * m.e + g.d * m.f + g.f) };
				if (!own.has(key(n))) {
					own.add(key(n));
					queue.push(n);
				}
			}
		}
		for (const [what, tile] of [['lopsided', lopsidedTile(rule)], ['start', start(rule)]] as const) {
			for (const [a, b, c, d] of LINEAR)
				for (let e = 0; e < 4; e++)
					for (let f = 0; f < 4; f++) {
						if (own.has(key({ a, b, c, d, e, f }))) continue;
						const map = (p: Vec) => ({ x: a * p.x + b * p.y + e, y: c * p.x + d * p.y + f });
						const centre = map({ x: 0.5, y: 0.5 });
						const swaps = !isRedCell(Math.floor(centre.x), Math.floor(centre.y));
						expect(holds(tile, { name: 'not its own', map, swaps }), `${what}: ${[a, b, c, d, e, f]}`).toBe(false);
					}
		}
	});

	// A shape of the cells (`PatternTile.shape`) of each kind: its columns, where (1, 0) and (0, 1) go.
	const SHAPES: Record<Lattice, [Vec, Vec]> = {
		oblique: [{ x: 1.3, y: 0.2 }, { x: -0.4, y: 0.8 }],
		rectangular: [{ x: 1.4 * Math.cos(0.3), y: 1.4 * Math.sin(0.3) }, { x: -0.7 * Math.sin(0.3), y: 0.7 * Math.cos(0.3) }],
		rhombic: [{ x: 1.1 * Math.cos(0.2), y: 1.1 * Math.sin(0.2) }, { x: 1.1 * Math.cos(1.9), y: 1.1 * Math.sin(1.9) }],
		square: [{ x: 1.2 * Math.cos(0.4), y: 1.2 * Math.sin(0.4) }, { x: -1.2 * Math.sin(0.4), y: 1.2 * Math.cos(0.4) }]
	};
	const WITHIN: Record<Lattice, Lattice[]> = {
		oblique: ['oblique', 'rectangular', 'rhombic', 'square'],
		rectangular: ['rectangular', 'square'],
		rhombic: ['rhombic', 'square'],
		square: ['square']
	};

	it.each(ALL_RULES.map((rule) => [ruleKey(rule), rule] as const))(
		'lets the %s cells take the shapes its motions stay motions of the plane under, and no others',
		(_key, rule) => {
			const lattice = latticeOf(rule);
			for (const kind of Object.keys(SHAPES) as Lattice[]) {
				const [a, b] = SHAPES[kind];
				const det = a.x * b.y - b.x * a.y;
				// each motion's turn, seen through the shape: S·M·S⁻¹, and whether it is a turn or mirror of the plane
				const keeps = ruleMotions(rule).every((m) => {
					const sm = [a.x * m.a + b.x * m.c, a.x * m.b + b.x * m.d, a.y * m.a + b.y * m.c, a.y * m.b + b.y * m.d];
					const l = [(sm[0]! * b.y - sm[1]! * a.y) / det, (-sm[0]! * b.x + sm[1]! * a.x) / det, (sm[2]! * b.y - sm[3]! * a.y) / det, (-sm[2]! * b.x + sm[3]! * a.x) / det];
					const [p, q, r, t] = l as [number, number, number, number];
					return Math.abs(p * p + r * r - 1) < 1e-9 && Math.abs(q * q + t * t - 1) < 1e-9 && Math.abs(p * q + r * t) < 1e-9;
				});
				expect(keeps, `${lattice} cells shaped ${kind}`).toBe(WITHIN[lattice].includes(kind));
			}
		}
	);

	it("names each lattice as Kaplan's tables have the type's", () => {
		expect([opposite('move', 'move'), opposite('turn', 'turn'), opposite('move', 'turn'), freeSides(), ofType(57)].map(latticeOf)).toEqual(Array(5).fill('oblique'));
		expect([opposite('move', 'mirror'), opposite('mirror', 'mirror'), opposite('mirror', 'turn'), ofType(42)].map(latticeOf)).toEqual(Array(4).fill('rectangular'));
		expect([neighbours('mirror'), ofType(53), ofType(68)].map(latticeOf)).toEqual(Array(3).fill('rhombic'));
		expect([neighbours('turn'), neighbours('both'), ofType(56), ofType(62)].map(latticeOf)).toEqual(Array(4).fill('square'));
	});
});
