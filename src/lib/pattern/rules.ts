/**
 * The rules a woven Escher heart's tile follows: which of the red tile's sides
 * are tied together, and how. Three families say it in words — no sides tied (two
 * shapes), opposite sides moved, mirrored or turned onto each other, neighbours
 * mirrored, turned or both — and McLean's other types say it by number. Each rule
 * is the motions of the infinite square grid that make its tiling
 * (`ruleMotions`); following them gives which stretches of cut carry one curve,
 * which way round, and what each side may be: any shape, its own S, its own
 * mirror image, or straight (`ruleEdges`). Cells, stretches and sides are named
 * as in `tiling.ts`.
 */

import type { Vec } from '$lib/types/heart';

/** How a pair of the red tile's sides is tied together (see `TileRule`). */
export type SideLink = 'move' | 'mirror' | 'turn';
export const SIDE_LINKS: SideLink[] = ['move', 'mirror', 'turn'];

/** How the two left sides of the red tile are tied together, and the two right ones (see `TileRule`). */
export type NeighbourLink = 'mirror' | 'turn' | 'both';
const NEIGHBOUR_LINKS: NeighbourLink[] = ['mirror', 'turn', 'both'];

/**
 * How the red tile's sides are tied together: three families of rules, by which
 * sides belong together and how, and McLean's other types by number.
 * - `free`: none. Each colour is one tile, only moved, and red and white are two shapes.
 * - `opposite`: upper-left with lower-right (`v`, the sides on the vertical cuts) and
 *   upper-right with lower-left (`h`), each pair moved across the tile, mirror images
 *   of each other, or each side its own S: Heesch's TTTT, TGTG, TCTC, G1G2G1G2, CGCG
 *   and CCCC.
 * - `neighbour`: the two left sides and the two right ones, each pair mirror images of
 *   each other (G1G1G2G2), turned a quarter about the corner they share (C4C4C4C4), or
 *   both. Both, the tiles turn about every corner and all four sides are one curve,
 *   its own mirror image.
 * - `type`: another of the types a woven heart can make, by Grünbaum and Shephard's
 *   number, as the motions that make its tiling (`TYPE_MOTIONS`).
 */
export type TileRule =
	| { sides: 'free' }
	| { sides: 'opposite'; v: SideLink; h: SideLink }
	| { sides: 'neighbour'; link: NeighbourLink }
	| { sides: 'type'; ih: TypeNumber };

export const freeSides = (): TileRule => ({ sides: 'free' });
export const opposite = (v: SideLink, h: SideLink): TileRule => ({ sides: 'opposite', v, h });
export const neighbours = (link: NeighbourLink): TileRule => ({ sides: 'neighbour', link });

/** Every rule: no sides tied, the nine ways of tying opposite pairs, the three of tying neighbours, and McLean's other types. */
export const ALL_RULES: TileRule[] = [
	freeSides(),
	...SIDE_LINKS.flatMap((v) => SIDE_LINKS.map((h) => opposite(v, h))),
	...NEIGHBOUR_LINKS.map((link) => neighbours(link)),
	...([42, 45, 49, 50, 53, 54, 56, 57, 58, 59, 61, 62, 64, 66, 67, 68, 69, 71, 74] as const).map((ih): TileRule => ({ sides: 'type', ih }))
];

/** A rule as a string, the same for the same rule: to compare rules, and to key things by rule. */
export function ruleKey(rule: TileRule): string {
	if (rule.sides === 'free') return 'free';
	if (rule.sides === 'opposite') return `opposite:${rule.v}:${rule.h}`;
	if (rule.sides === 'type') return `ih${rule.ih}`;
	return `neighbour:${rule.link}`;
}

export const sameRule = (a: TileRule, b: TileRule) => ruleKey(a) === ruleKey(b);

/** A curve the visitor draws: a side of the red tile, a family's one curve, or the one curve of all sides. */
export type CurveKey = 'nw' | 'ne' | 'se' | 'sw' | 'vertical' | 'horizontal' | 'side';

export type StretchKind = 'V' | 'H';

/**
 * Whether a rule lets its tiles lean (see `PatternTile.offset`): its motions keep
 * the tiles' odd corners together. Free sides do, and opposite sides that are all
 * S; moving a pair across the tile takes odd corners onto even ones.
 */
export function canLean(rule: TileRule): boolean {
	return rule.sides === 'free' || (rule.sides === 'opposite' && rule.v === 'turn' && rule.h === 'turn');
}

/** How a curve drawn as half a side is completed: by a half turn about the side's middle (an S), or by its mirror image. */
export type HalfKind = 'turn' | 'mirror';

export interface RuleInfo {
	/** The curves the visitor draws, in the order the editor lists them. Each is the red tile's side of that name, as drawn. */
	curves: CurveKey[];
	/** The curves drawn as half a side, and how each is completed; the others are drawn whole. */
	halves: Partial<Record<CurveKey, HalfKind>>;
	/** Sides the tiling mirrors its tiles across: always straight, so not drawn at all. */
	straight: CurveKey[];
}

/**
 * The curves a rule reads, one for each class of sides its motions make (see
 * `ruleEdges`), in the order of the red tile's upper-left, lower-right,
 * upper-right and lower-left side. A pair of opposite sides moved or mirrored onto
 * each other is one curve (`vertical` for the upper-left and lower-right sides,
 * `horizontal` for the other two); a side that is its own S is drawn as half,
 * completed by a half turn, one that is its own mirror image as half, completed by
 * its mirror image; a mirror line of the tiling is straight.
 */
export function ruleInfo(rule: TileRule): RuleInfo {
	const classes = edgeClasses(rule);
	const drawn = classes.filter((c) => c.shape !== 'I');
	const halves = drawn.flatMap((c): Array<[CurveKey, HalfKind]> => (c.shape === 'S' ? [[c.key, 'turn']] : c.shape === 'U' ? [[c.key, 'mirror']] : []));
	return { curves: drawn.map((c) => c.key), halves: Object.fromEntries(halves), straight: classes.filter((c) => c.shape === 'I').map((c) => c.key) };
}

/** Whether a rule draws curve `key` as half a side, and how the half is completed. */
export function halfOf(rule: TileRule, key: CurveKey): HalfKind | null {
	return ruleInfo(rule).halves[key] ?? null;
}

/** Which curve a stretch carries, and turned which way. */
export interface StretchSource {
	curve: CurveKey;
	/** Run the curve from the stretch's high end to its low end. */
	reverse: boolean;
	/** Bulge to the low side where the curve bulges to the high side. */
	negate: boolean;
}

const mod2 = (x: number) => ((x % 2) + 2) % 2;
/** The drawn ("red") tiles: c + d even. */
export const isRedCell = (c: number, d: number) => mod2(c + d) === 0;

/**
 * A motion of the infinite square grid onto itself, in cells: p ↦ (a·x + b·y + e,
 * c·x + d·y + f), the matrix one of the square's eight symmetries and (e, f)
 * whole cells, so crossings go to crossings and cells to cells.
 */
export interface GridMotion {
	a: number;
	b: number;
	c: number;
	d: number;
	e: number;
	f: number;
}

const gm = (a: number, b: number, c: number, d: number, e: number, f: number): GridMotion => ({ a, b, c, d, e, f });
/** Moved by (dx, dy). */
const shift = (dx: number, dy: number) => gm(1, 0, 0, 1, dx, dy);
/** Turned half round about (cx, cy). */
const halfTurn = (cx: number, cy: number) => gm(-1, 0, 0, -1, 2 * cx, 2 * cy);
/** Turned a quarter round about (cx, cy), +x towards +y. */
const quarterTurn = (cx: number, cy: number) => gm(0, -1, 1, 0, cx + cy, cy - cx);
/** Mirrored across the line x = c. */
const mirrorX = (c: number) => gm(-1, 0, 0, 1, 2 * c, 0);
/** Mirrored across the line y = c. */
const mirrorY = (c: number) => gm(1, 0, 0, -1, 0, 2 * c);
/** Mirrored across the line x − y = c, which the heart, standing on its corner, shows upright. */
const mirrorDiagonal = (c: number) => gm(0, 1, 1, 0, c, -c);
/** Mirrored across the line x + y = c, which the heart shows level. */
const mirrorAntidiagonal = (c: number) => gm(0, -1, -1, 0, c, c);
/** `m`, then `n`. */
export const andThen = (m: GridMotion, n: GridMotion): GridMotion =>
	gm(n.a * m.a + n.b * m.c, n.a * m.b + n.b * m.d, n.c * m.a + n.d * m.c, n.c * m.b + n.d * m.d, n.a * m.e + n.b * m.f + n.e, n.c * m.e + n.d * m.f + n.f);
const inverse = (m: GridMotion): GridMotion => gm(m.a, m.c, m.b, m.d, -(m.a * m.e + m.c * m.f), -(m.b * m.e + m.d * m.f));
export const moveBy = (m: GridMotion, p: Vec): Vec => ({ x: m.a * p.x + m.b * p.y + m.e, y: m.c * p.x + m.d * p.y + m.f });

/** McLean's types (by Grünbaum and Shephard's numbers) a woven heart can make besides the ones the three families name. */
export type TypeNumber = 42 | 45 | 49 | 50 | 53 | 54 | 56 | 57 | 58 | 59 | 61 | 62 | 64 | 66 | 67 | 68 | 69 | 71 | 74;

/**
 * Each type as motions that make its tiling, in cells, the red tile (0, 0) standing
 * on [0, 1]²: what takes it onto its neighbours, and what turns or mirrors it onto
 * itself. Its upper-left side is x = 0 (nw), upper-right y = 0 (ne), lower-right
 * x = 1 (se), lower-left y = 1 (sw); its corners (0, 0) top, (1, 0) right, (1, 1)
 * bottom, (0, 1) left. A side that is a mirror line of the tiling stays straight.
 */
const TYPE_MOTIONS: Record<TypeNumber, GridMotion[]> = {
	// moved across one pair; the other two sides mirror lines
	42: [shift(1, 0), mirrorY(0), mirrorY(1)],
	// mirrored and moved across one pair; the other two sides mirror lines
	45: [andThen(mirrorY(0.5), shift(1, 0)), mirrorY(0), mirrorY(1)],
	// each of one pair its own S; the other two sides mirror lines
	49: [halfTurn(0, 0.5), halfTurn(1, 0.5), mirrorY(0), mirrorY(1)],
	// moved across one pair, the third side its own S, the fourth a mirror line
	50: [shift(1, 0), halfTurn(0.5, 1), mirrorY(0)],
	// the two upper sides each their own S, the two lower ones mirrored onto each other
	53: [halfTurn(0, 0.5), halfTurn(0.5, 0), andThen(mirrorAntidiagonal(1.5), shift(-0.5, 0.5))],
	// one side its own S, the three others mirror lines
	54: [halfTurn(1, 0.5), mirrorX(0), mirrorY(0), mirrorY(1)],
	// the two upper sides turned a quarter about the top corner; the lower two mirror lines
	56: [quarterTurn(0, 0), mirrorX(1), mirrorY(1)],
	// the same turned half round; every side its own S
	57: [halfTurn(0.5, 0.5), halfTurn(0, 0.5), halfTurn(0.5, 0)],
	// the same turned half round; one pair each its own S, the other two mirror lines
	58: [halfTurn(0.5, 0.5), halfTurn(0, 0.5), mirrorY(0), mirrorY(1)],
	// the same turned half round; the two left sides mirrored onto each other
	59: [halfTurn(0.5, 0.5), andThen(mirrorDiagonal(0), shift(0, 1))],
	// the same turned half round; the two upper sides turned a quarter about the top corner
	61: [halfTurn(0.5, 0.5), quarterTurn(0, 0)],
	// the same turned a quarter round; every side its own S
	62: [quarterTurn(0.5, 0.5), halfTurn(0, 0.5)],
	// its own mirror image across the line through its left and right sides' middles; moved
	// across that pair, the other two sides mirror lines
	64: [mirrorY(0.5), shift(1, 0), mirrorY(0)],
	// the same mirror; moved across that pair, the other two each their own S
	66: [mirrorY(0.5), shift(1, 0), halfTurn(0.5, 0)],
	// its own mirror image across the line through its upper-right and lower-left sides'
	// middles; those two sides mirror lines, the others each their own S
	67: [mirrorX(0.5), halfTurn(0, 0.5), mirrorY(0), mirrorY(1)],
	// its own mirror image left and right; moved across each pair
	68: [mirrorDiagonal(0), shift(1, 0)],
	// its own mirror image left and right; every side its own S
	69: [mirrorDiagonal(0), halfTurn(0, 0.5), halfTurn(1, 0.5)],
	// its own mirror image left and right; the two left sides turned a quarter about the left corner
	71: [mirrorDiagonal(0), quarterTurn(0, 1)],
	// its own mirror image left and right and up and down; every side its own S
	74: [mirrorDiagonal(0), mirrorAntidiagonal(1), halfTurn(0, 0.5)]
};

export const ofType = (ih: TypeNumber): TileRule => ({ sides: 'type', ih });

/** The motion a way of tying a pair of opposite sides takes the red tile across its lower-right side (`v`) or lower-left one (`h`) with. */
const ACROSS_MOTIONS: Record<'v' | 'h', Record<SideLink, GridMotion>> = {
	v: { move: shift(1, 0), mirror: andThen(mirrorY(0.5), shift(1, 0)), turn: halfTurn(1, 0.5) },
	h: { move: shift(0, 1), mirror: andThen(mirrorX(0.5), shift(0, 1)), turn: halfTurn(0.5, 1) }
};

/**
 * The motions that make a rule's tiling. Two shapes: the red tiles only moved onto
 * each other. Opposite pairs: the motion across each pair. Neighbours: mirrored, the
 * glide that swaps left and right and moves one cell; turned, the quarter turns about
 * the left and the right corner; both, those and the tile's own two mirror lines. The
 * three families' rules all repeat every two cells.
 */
export function ruleMotions(rule: TileRule): GridMotion[] {
	const repeat = [shift(2, 0), shift(0, 2)];
	switch (rule.sides) {
		case 'free':
			return [shift(1, 1), shift(1, -1)];
		case 'opposite':
			return [ACROSS_MOTIONS.v[rule.v], ACROSS_MOTIONS.h[rule.h], ...repeat];
		case 'neighbour': {
			const mirrored = [andThen(mirrorDiagonal(0), shift(1, 0))];
			const turned = [quarterTurn(1, 0), quarterTurn(0, 1)];
			if (rule.link === 'mirror') return [...mirrored, ...repeat];
			if (rule.link === 'turn') return [...turned, ...repeat];
			return [...mirrored, ...turned, mirrorX(0.5), mirrorY(0.5), ...repeat];
		}
		case 'type':
			return TYPE_MOTIONS[rule.ih];
	}
}

/**
 * What a side can be, as Kaplan and McLean say: any shape (J), its own S (S), its
 * own mirror image across the line through its middle (U), or straight, a mirror
 * line of the tiling (I).
 */
export type EdgeShape = 'J' | 'S' | 'U' | 'I';

/**
 * A class of stretches that carry one curve: its key, what it can be, the red tile's
 * sides in it, and whether the motions also run it the other way onto itself
 * (always, for S and U; for some straight sides).
 */
export interface EdgeClass {
	key: CurveKey;
	shape: EdgeShape;
	sides: Array<'nw' | 'ne' | 'se' | 'sw'>;
	eitherWay: boolean;
}

/** Where a motion takes stretch `kind (i, j)`, and whether it runs it the other way and turns its high side low. */
function moveStretch(m: GridMotion, kind: StretchKind, i: number, j: number) {
	const p = moveBy(m, { x: i, y: j });
	const q = moveBy(m, kind === 'V' ? { x: i, y: j + 1 } : { x: i + 1, y: j });
	const vertical = Math.abs(p.x - q.x) < 1e-9;
	const reversed = vertical ? q.y < p.y : q.x < p.x;
	const low = reversed ? q : p;
	const normal = kind === 'V' ? { x: m.a, y: m.c } : { x: m.b, y: m.d };
	const flipped = vertical ? normal.x < 0 : normal.y < 0;
	return { kind: (vertical ? 'V' : 'H') as StretchKind, i: Math.round(low.x), j: Math.round(low.y), reversed, flipped };
}

/** The red tile's sides as stretches, in the order their classes are named and listed. */
const RED_SIDES: Array<{ side: 'nw' | 'ne' | 'se' | 'sw'; kind: StretchKind; i: number; j: number }> = [
	{ side: 'nw', kind: 'V', i: 0, j: 0 },
	{ side: 'se', kind: 'V', i: 1, j: 0 },
	{ side: 'ne', kind: 'H', i: 0, j: 0 },
	{ side: 'sw', kind: 'H', i: 0, j: 1 }
];

interface RuleEdges {
	classes: EdgeClass[];
	/** By stretch, its indices taken modulo 4: every tiling here repeats within four cells each way. */
	sources: Map<string, StretchSource>;
}

const mod4 = (x: number) => ((x % 4) + 4) % 4;
const stretchKey = (kind: StretchKind, i: number, j: number) => `${kind}${mod4(i)},${mod4(j)}`;
const edgesByRule = new Map<string, RuleEdges>();

/**
 * Which stretches carry one curve, and which way round, from the motions that make
 * the tiling: each of the red tile's sides, in turn, and everything the motions take
 * it to. A class is named after the first of the red tile's sides in it — or
 * `vertical` for the upper-left and lower-right side together, `horizontal` for the
 * other two, `side` for all four — and its curve is drawn in that side's own frame.
 * A motion that takes a stretch of the class onto itself, the other way round,
 * makes the class an S (turned half round), U (mirrored across its middle) or I
 * (mirrored onto itself: straight).
 */
function ruleEdges(rule: TileRule): RuleEdges {
	const cached = edgesByRule.get(ruleKey(rule));
	if (cached) return cached;
	const motions = ruleMotions(rule);
	const all = [...motions, ...motions.map(inverse)];
	const state = new Map<string, { cls: number; reverse: boolean; negate: boolean }>();
	const found: Array<{ sides: EdgeClass['sides']; self: Set<string> }> = [];
	for (const start of RED_SIDES) {
		const known = state.get(stretchKey(start.kind, start.i, start.j));
		if (known) {
			found[known.cls]!.sides.push(start.side);
			continue;
		}
		const cls = found.length;
		found.push({ sides: [start.side], self: new Set() });
		const queue = [{ ...start, reverse: false, negate: false }];
		state.set(stretchKey(start.kind, start.i, start.j), { cls, reverse: false, negate: false });
		while (queue.length) {
			const at = queue.shift()!;
			for (const m of all) {
				const to = moveStretch(m, at.kind, at.i, at.j);
				const reverse = at.reverse !== to.reversed;
				const negate = at.negate !== to.flipped;
				const key = stretchKey(to.kind, to.i, to.j);
				const seen = state.get(key);
				if (!seen) {
					state.set(key, { cls, reverse, negate });
					queue.push({ side: start.side, kind: to.kind, i: to.i, j: to.j, reverse, negate });
				} else if (seen.reverse !== reverse || seen.negate !== negate) {
					found[cls]!.self.add(`${seen.reverse !== reverse ? 'r' : ''}${seen.negate !== negate ? 'n' : ''}`);
				}
			}
		}
	}
	const classes: EdgeClass[] = found.map(({ sides, self }) => {
		const shape: EdgeShape = self.has('n') || (self.has('rn') && self.has('r')) ? 'I' : self.has('rn') ? 'S' : self.has('r') ? 'U' : 'J';
		const both = (a: string, b: string) => sides.length === 2 && sides.includes(a as never) && sides.includes(b as never);
		const key: CurveKey = sides.length === 4 ? 'side' : both('nw', 'se') ? 'vertical' : both('ne', 'sw') ? 'horizontal' : sides[0]!;
		return { key, shape, sides, eitherWay: self.has('r') || self.has('rn') };
	});
	const sources = new Map<string, StretchSource>();
	for (const [key, { cls, reverse, negate }] of state) sources.set(key, { curve: classes[cls]!.key, reverse, negate });
	const edges = { classes, sources };
	edgesByRule.set(ruleKey(rule), edges);
	return edges;
}

/** A rule's classes of sides (see `ruleEdges`). */
export const edgeClasses = (rule: TileRule): EdgeClass[] => ruleEdges(rule).classes;

const motionKey = (m: GridMotion) => [m.a, m.b, m.c, m.d, mod4(m.e), mod4(m.f)].join(',');
const groupByRule = new Map<string, Set<string>>();

/**
 * Every motion that takes a rule's tiling onto itself, each once, its move taken
 * modulo four cells (every tiling of squares here repeats within four), as keys.
 */
function motionGroup(rule: TileRule): Set<string> {
	const cached = groupByRule.get(ruleKey(rule));
	if (cached) return cached;
	const motions = ruleMotions(rule);
	const all = [...motions, ...motions.map(inverse)];
	const seen = new Set([motionKey(shift(0, 0))]);
	const queue = [shift(0, 0)];
	while (queue.length) {
		const m = queue.shift()!;
		for (const g of all) {
			const n = andThen(m, g);
			const reduced = { ...n, e: mod4(n.e), f: mod4(n.f) };
			if (!seen.has(motionKey(reduced))) {
				seen.add(motionKey(reduced));
				queue.push(reduced);
			}
		}
	}
	groupByRule.set(ruleKey(rule), seen);
	return seen;
}

/**
 * How far a rule's tiling repeats along each axis, in cells: the shortest moves
 * straight along x and along y its motions make. One, two or four: every tiling
 * of squares here repeats within four.
 */
export function ruleRepeat(rule: TileRule): Vec {
	const group = motionGroup(rule);
	const along = (dx: number, dy: number) => [1, 2].find((k) => group.has(motionKey(shift(dx * k, dy * k)))) ?? 4;
	return { x: along(1, 0), y: along(0, 1) };
}

/**
 * How symmetric a rule's tiling is: how many motions take it onto itself within
 * the four cells every tiling here repeats in. Cuts that are a tile of several
 * rules are most truly a tile of the one with the most: each rule's motions are
 * what its tiles keep to, and a drawing keeps to all of them only on purpose.
 */
export const ruleSymmetry = (rule: TileRule): number => motionGroup(rule).size;

/** Which curve stretch `kind (i, j)` carries, `V(k = i, d = j)` or `H(c = i, k = j)`, and which way round, from the rule's motions (see `ruleEdges`). */
export function stretchSource(rule: TileRule, kind: StretchKind, i: number, j: number): StretchSource {
	const src = ruleEdges(rule).sources.get(stretchKey(kind, i, j));
	if (!src) throw new Error(`No curve reaches stretch ${kind}(${i}, ${j}) under ${ruleKey(rule)}.`);
	return src;
}
