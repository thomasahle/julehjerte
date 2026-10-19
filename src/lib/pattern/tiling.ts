/**
 * Escher's way of drawing a woven heart: one tile, repeated.
 *
 * A woven heart is a chequerboard bent out of shape. Every cell is bounded by
 * four stretches of cut, two from each lobe, and every crossing joins two red
 * and two white cells. A *regular division of the plane* in M.C. Escher's sense
 * is the same thing with every red cell the same shape — and then a handful of
 * curves, the sides of one tile, draw the whole heart. A rule says which curve
 * each stretch of cut carries, and which way round.
 *
 * ## Frames
 *
 * Square: the raw 0–100 frame `toHeartDesign` builds in. Right-lobe cuts are
 * vertical (x = k·h, running y = 0 → 100), left-lobe cuts horizontal (y = k·h,
 * running x = 0 → 100), h = 100 / n for an n × n heart. Cell (c, d) spans
 * x ∈ [c·h, (c+1)·h], y ∈ [d·h, (d+1)·h]. With `weaveParity` 1 the cells whose
 * c + d is even show the right lobe's colour; those are the tiles the visitor
 * draws ("the red tile").
 *
 * Stretch: `V(k, d)` is vertical cut k between y = d·h and (d+1)·h, `H(c, k)`
 * horizontal cut k between x = c·h and (c+1)·h. Each runs from its low end to
 * its high end; indices may be negative or past the square, since the pattern
 * is infinite and the heart is a window onto it.
 *
 * Curve: a side curve lives in its stretch's own frame, from (0, 0) to (1, 0),
 * with y pointing to the stretch's high side (+x for a vertical stretch, +y for
 * a horizontal one), in units of h. A curve that is half of an S (a side of an
 * opposite pair tied by `turn`, see `TileRule`) runs from (0, 0) to (0.5, 0) and
 * is completed by a half turn about (0.5, 0); half of a side that is its own mirror image
 * (neighbours tied `both` ways) runs from (0, 0) to the side's middle, anywhere on
 * x = 0.5, and is completed by its mirror image across that line.
 *
 * In the heart as the site shows it the square stands on its corner: (0, 0) is
 * the notch, (100, 100) the tip, +x points down to the right and +y down to the
 * left. So a cell's low-x side is its upper-left side (`nw`), low y its
 * upper-right (`ne`), high x its lower-right (`se`) and high y its lower-left
 * (`sw`). The rules name the red tile's sides that way, as the visitor sees them.
 */

import type { BezierSegment, HeartDesign, Vec } from '$lib/types/heart';
import { reverseSegments, segmentsToPathData } from '$lib/geometry/bezierSegments';
import { normalizeHeartDesign } from '$lib/utils/heartDesign';
import { HEART_CLEARANCE_UNITS } from '$lib/geometry/returnSearch';

/** How a pair of the red tile's sides is tied together (see `TileRule`). */
export type SideLink = 'move' | 'mirror' | 'turn';
export const SIDE_LINKS: SideLink[] = ['move', 'mirror', 'turn'];

/** How the two left sides of the red tile are tied together, and the two right ones (see `TileRule`). */
export type NeighbourLink = 'mirror' | 'turn' | 'both';
export const NEIGHBOUR_LINKS: NeighbourLink[] = ['mirror', 'turn', 'both'];

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

/** A side curve in its stretch's own frame (see the module comment). */
export type SideCurve = BezierSegment[];

/** The lines of the infinite tiling one family of the heart's cuts follows: the first, and how many. */
export interface HeartLines {
	first: number;
	count: number;
}

export interface PatternTile {
	rule: TileRule;
	/**
	 * The size of the tiles: the heart's square is cuts + 1 cells across, and
	 * unless the pattern has been moved (`lines`), it has that many cuts in each lobe.
	 */
	cuts: number;
	/** The rule's curves, by key. A key the rule needs and the tile lacks reads as a straight side. */
	curves: Partial<Record<CurveKey, SideCurve>>;
	/**
	 * How far the tile's two odd corners stand off the plain grid, in cells (the
	 * rules that `canLean`). Escher's tiles are seldom squares: moving a
	 * corner moves the same corner of every tile, and the heart becomes a window
	 * onto the tiling, its cuts clipped at the square's edges.
	 */
	offset?: Vec;
	/**
	 * How far the whole pattern is moved within the heart, in cells (any rule).
	 * A point the tile itself fixes — a corner the rule keeps on the grid, the
	 * middle of a half-turn S — moves only with the whole pattern, so dragging
	 * one moves this. The heart cuts whichever lines of the tiling are nearest
	 * its middle (`firstLine`), so the pattern can move without end; a pan is
	 * kept within one repeat of the tiling (`ruleRepeat`), from half a repeat back
	 * to half a repeat on.
	 */
	pan?: Vec;
	/**
	 * The lines the heart cuts, each way, when the pattern has been moved: the
	 * cuts + 1 nearest the middle and, where an edge strip has grown wider than a
	 * cell, the next line in it too, so the pattern fills the heart like a window
	 * onto the infinite tiling (`fitLines`). Absent, the cuts + 1 nearest the middle.
	 */
	lines?: Record<StretchKind, HeartLines>;
}

/**
 * Whether a rule lets its tiles lean (see `PatternTile.offset`): its motions keep
 * the tiles' odd corners together. Free sides do, and opposite sides that are all
 * S; moving a pair across the tile takes odd corners onto even ones.
 */
export function canLean(rule: TileRule): boolean {
	return rule.sides === 'free' || (rule.sides === 'opposite' && rule.v === 'turn' && rule.h === 'turn');
}

/** The tile's corner offset, or none for a rule that keeps the plain grid. */
export function tileOffset(tile: PatternTile): Vec {
	return canLean(tile.rule) && tile.offset ? tile.offset : { x: 0, y: 0 };
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
export const shift = (dx: number, dy: number) => gm(1, 0, 0, 1, dx, dy);
/** Turned half round about (cx, cy). */
export const halfTurn = (cx: number, cy: number) => gm(-1, 0, 0, -1, 2 * cx, 2 * cy);
/** Turned a quarter round about (cx, cy), +x towards +y. */
export const quarterTurn = (cx: number, cy: number) => gm(0, -1, 1, 0, cx + cy, cy - cx);
/** Mirrored across the line x = c. */
export const mirrorX = (c: number) => gm(-1, 0, 0, 1, 2 * c, 0);
/** Mirrored across the line y = c. */
export const mirrorY = (c: number) => gm(1, 0, 0, -1, 0, 2 * c);
/** Mirrored across the line x − y = c, which the heart, standing on its corner, shows upright. */
export const mirrorDiagonal = (c: number) => gm(0, 1, 1, 0, c, -c);
/** Mirrored across the line x + y = c, which the heart shows level. */
export const mirrorAntidiagonal = (c: number) => gm(0, -1, -1, 0, c, c);
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

export const TYPE_NUMBERS = Object.keys(TYPE_MOTIONS).map(Number) as TypeNumber[];
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

const ZERO: Vec = { x: 0, y: 0 };
function lineSegment(a: Vec, b: Vec): BezierSegment {
	return {
		p0: a,
		p1: { x: a.x + (b.x - a.x) / 3, y: a.y + (b.y - a.y) / 3 },
		p2: { x: a.x + (2 * (b.x - a.x)) / 3, y: a.y + (2 * (b.y - a.y)) / 3 },
		p3: b
	};
}

/** A straight side, as the editor starts one: two pieces, so there is a node to pull. */
export function straightCurve(half = false): SideCurve {
	const end = half ? 0.5 : 1;
	const mid = { x: end / 2, y: 0 };
	return [lineSegment(ZERO, mid), lineSegment(mid, { x: end, y: 0 })];
}

const mapCurve = (curve: SideCurve, f: (p: Vec) => Vec): SideCurve =>
	curve.map((s) => ({ p0: f(s.p0), p1: f(s.p1), p2: f(s.p2), p3: f(s.p3) }));

/** A half-S completed by a half turn about (0.5, 0). */
export function completeHalfTurn(half: SideCurve): SideCurve {
	const turned = reverseSegments(mapCurve(half, (p) => ({ x: 1 - p.x, y: -p.y })));
	return [...half, ...turned];
}

/** Half a side, from (0, 0) to the side's middle, completed by its mirror image across x = 0.5. */
export function completeMirror(half: SideCurve): SideCurve {
	const mirrored = reverseSegments(mapCurve(half, (p) => ({ x: 1 - p.x, y: p.y })));
	return [...half, ...mirrored];
}

/** The full side curve a source describes, in the stretch's own frame. A mirror line of the tiling is one straight piece. */
export function sourceCurve(tile: PatternTile, src: StretchSource): SideCurve {
	if (ruleInfo(tile.rule).straight.includes(src.curve)) return [lineSegment(ZERO, { x: 1, y: 0 })];
	const half = halfOf(tile.rule, src.curve);
	let curve = tile.curves[src.curve] ?? straightCurve(!!half);
	if (half) curve = half === 'mirror' ? completeMirror(curve) : completeHalfTurn(curve);
	if (src.negate) curve = mapCurve(curve, (p) => ({ x: p.x, y: -p.y }));
	if (src.reverse) curve = reverseSegments(mapCurve(curve, (p) => ({ x: 1 - p.x, y: p.y })));
	return curve;
}

export function stretchCurve(tile: PatternTile, kind: StretchKind, i: number, j: number): SideCurve {
	return sourceCurve(tile, stretchSource(tile.rule, kind, i, j));
}

/** A point of stretch `kind (i, j)`'s own frame in the square, for cells of size `h`. */
export function stretchToSquare(kind: StretchKind, i: number, j: number, h: number, p: Vec): Vec {
	return kind === 'V' ? { x: (i + p.y) * h, y: (j + p.x) * h } : { x: (i + p.x) * h, y: (j + p.y) * h };
}

/** The inverse of `stretchToSquare`. */
export function squareToStretch(kind: StretchKind, i: number, j: number, h: number, q: Vec): Vec {
	return kind === 'V' ? { x: q.y / h - j, y: q.x / h - i } : { x: q.x / h - i, y: q.y / h - j };
}

/** Crossing (i, j) of the infinite tiling, in cells: on the plain grid, the odd ones moved by the offset. */
export function crossing(tile: PatternTile, i: number, j: number): Vec {
	const o = mod2(i + j) === 1 ? tileOffset(tile) : { x: 0, y: 0 };
	return { x: i + o.x, y: j + o.y };
}

/**
 * A stretch's own frame on the infinite tiling, in cells: from its low-end
 * crossing `a` along the chord `d` to its high end, with `n` the chord turned to
 * the high side. On the plain grid it is `stretchToSquare`'s frame; with leaning
 * tiles every stretch keeps its own curve, turned and scaled with its chord.
 */
export interface StretchFrame {
	a: Vec;
	d: Vec;
	n: Vec;
}

export function stretchFrame(tile: PatternTile, kind: StretchKind, i: number, j: number): StretchFrame {
	const a = crossing(tile, i, j);
	const b = kind === 'V' ? crossing(tile, i, j + 1) : crossing(tile, i + 1, j);
	const d = { x: b.x - a.x, y: b.y - a.y };
	return { a, d, n: kind === 'V' ? { x: d.y, y: -d.x } : { x: -d.y, y: d.x } };
}

export const toFrame = (f: StretchFrame, p: Vec): Vec => ({ x: f.a.x + p.x * f.d.x + p.y * f.n.x, y: f.a.y + p.x * f.d.y + p.y * f.n.y });

export function fromFrame(f: StretchFrame, q: Vec): Vec {
	const r = { x: q.x - f.a.x, y: q.y - f.a.y };
	const len2 = f.d.x * f.d.x + f.d.y * f.d.y || 1;
	return { x: (r.x * f.d.x + r.y * f.d.y) / len2, y: (r.x * f.n.x + r.y * f.n.y) / len2 };
}

const bezierAt = (s: BezierSegment, t: number): Vec => {
	const u = 1 - t;
	return {
		x: u * u * u * s.p0.x + 3 * u * u * t * s.p1.x + 3 * u * t * t * s.p2.x + t * t * t * s.p3.x,
		y: u * u * u * s.p0.y + 3 * u * u * t * s.p1.y + 3 * u * t * t * s.p2.y + t * t * t * s.p3.y
	};
};

function splitAt(s: BezierSegment, t: number): [BezierSegment, BezierSegment] {
	const lerp = (p: Vec, q: Vec): Vec => ({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });
	const p01 = lerp(s.p0, s.p1);
	const p12 = lerp(s.p1, s.p2);
	const p23 = lerp(s.p2, s.p3);
	const p012 = lerp(p01, p12);
	const p123 = lerp(p12, p23);
	const m = lerp(p012, p123);
	return [
		{ p0: s.p0, p1: p01, p2: p012, p3: m },
		{ p0: m, p1: p123, p2: p23, p3: s.p3 }
	];
}

const samePoint = (p: Vec, q: Vec) => Math.abs(p.x - q.x) < 1e-6 && Math.abs(p.y - q.y) < 1e-6;

/** The first parameter at which coordinate `axis` of the segment reaches `v` from below, or null. */
function firstCrossing(s: BezierSegment, axis: 'x' | 'y', v: number): number | null {
	const STEPS = 64;
	let prev = bezierAt(s, 0)[axis];
	if (prev >= v) return 0;
	for (let k = 1; k <= STEPS; k++) {
		const cur = bezierAt(s, k / STEPS)[axis];
		if (cur >= v) {
			let lo = (k - 1) / STEPS;
			let hi = k / STEPS;
			for (let it = 0; it < 40; it++) {
				const mid = (lo + hi) / 2;
				if (bezierAt(s, mid)[axis] >= v) hi = mid;
				else lo = mid;
			}
			return hi;
		}
		prev = cur;
	}
	return prev >= v ? 1 : null;
}

/**
 * Where a segment of a generated cut comes from: segment `index` of stretch
 * `kind (i, j)`'s curve, of `count` segments. When the square's edge cuts it
 * short (`clipped`), `range` is the part of the segment's parameter it keeps.
 */
export interface CutPiece {
	kind: StretchKind;
	i: number;
	j: number;
	index: number;
	count: number;
	clipped: boolean;
	range: [number, number];
}

/** The part of a piece kept when its segment is split at `t` (of the part it already keeps). */
function keepPart(piece: CutPiece, t: number, keep: 'after' | 'before'): CutPiece {
	const [a, b] = piece.range;
	const at = a + t * (b - a);
	return { ...piece, clipped: true, range: keep === 'after' ? [at, b] : [a, at] };
}

/** A cut in the raw 0–100 square, with where each of its segments comes from. */
export interface TracedCut {
	segments: BezierSegment[];
	pieces: CutPiece[];
}

/** The part of a chain between where coordinate `axis` first reaches `lo` and where it then reaches `hi`. */
function clipChain(chain: BezierSegment[], pieces: CutPiece[], axis: 'x' | 'y', lo: number, hi: number): TracedCut {
	const EPS = 1e-9;
	// A crossing within a hair of a segment's end is at its end: where a curve meets the edge
	// nearly along it, the search otherwise finds it a rounding error early.
	const atStart = (s: BezierSegment, t: number) => t < EPS || samePoint(bezierAt(s, t), s.p0);
	const atEnd = (s: BezierSegment, t: number) => t > 1 - EPS || samePoint(bezierAt(s, t), s.p3);
	const out: BezierSegment[] = [];
	const from: CutPiece[] = [];
	let k = 0;
	for (; k < chain.length; k++) {
		const t = firstCrossing(chain[k]!, axis, lo);
		if (t === null) continue;
		if (atStart(chain[k]!, t)) {
			out.push(chain[k]!);
			from.push(pieces[k]!);
		} else if (!atEnd(chain[k]!, t)) {
			out.push(splitAt(chain[k]!, t)[1]);
			from.push(keepPart(pieces[k]!, t, 'after'));
		}
		k++;
		break;
	}
	const finish = (s: BezierSegment, piece: CutPiece): boolean => {
		const t = firstCrossing(s, axis, hi);
		if (t === null) {
			out.push(s);
			from.push(piece);
			return false;
		}
		if (atEnd(s, t)) {
			out.push(s);
			from.push(piece);
		} else if (!atStart(s, t)) {
			out.push(splitAt(s, t)[0]);
			from.push(keepPart(piece, t, 'before'));
		}
		return true;
	};
	const done = () => ({ segments: snapEnds(out, axis, lo, hi), pieces: from });
	// The entry segment may leave again on its own.
	if (out.length && finish(out.pop()!, from.pop()!)) return done();
	for (; k < chain.length; k++) if (finish(chain[k]!, pieces[k]!)) break;
	return done();
}

function snapEnds(chain: BezierSegment[], axis: 'x' | 'y', lo: number, hi: number): BezierSegment[] {
	const first = chain[0];
	const last = chain[chain.length - 1];
	if (first) first.p0 = { ...first.p0, [axis]: lo };
	if (last) last.p3 = { ...last.p3, [axis]: hi };
	return chain;
}

/**
 * Where the heart's square sits on the infinite tiling, in cells: on the plain
 * grid exactly over cells 0…n−1; with leaning tiles moved by half the lean, so
 * its n − 1 cuts each way keep an even margin from its edges; and moved by the
 * opposite of the tile's `pan`, which moves the pattern within the heart.
 */
export function patternWindow(tile: PatternTile): Vec {
	const o = tileOffset(tile);
	const pan = tile.pan ?? { x: 0, y: 0 };
	return { x: o.x / 2 - pan.x, y: o.y / 2 - pan.y };
}

/** A point of the raw 0–100 square in cells of the infinite tiling, the frame crossings and stretch frames live in. */
export function rawToCells(tile: PatternTile, q: Vec): Vec {
	const h = 100 / (tile.cuts + 1);
	const w = patternWindow(tile);
	return { x: q.x / h + w.x, y: q.y / h + w.y };
}

const panOf = (tile: PatternTile, kind: StretchKind) => (kind === 'V' ? (tile.pan?.x ?? 0) : (tile.pan?.y ?? 0));

/**
 * The n − 1 lines of family `kind` nearest the middle of the heart's square:
 * line k lies k + pan cells in (the lean moves the window with it), so the first
 * is the one between half a cell and one and a half in, and neither edge strip
 * is narrower than half a cell or wider than one and a half. As the pattern
 * moves, a line that leaves at one edge comes in again at the other.
 */
function nearestLines(tile: PatternTile, kind: StretchKind): HeartLines {
	return { first: Math.ceil(0.5 - panOf(tile, kind) - 1e-9), count: tile.cuts };
}

/** The lines of the infinite tiling the heart cuts in family `kind` (see `PatternTile.lines`). */
export const heartLines = (tile: PatternTile, kind: StretchKind): HeartLines => tile.lines?.[kind] ?? nearestLines(tile, kind);

/** The line of the infinite tiling the heart's first cut of family `kind` is. */
export const firstLine = (tile: PatternTile, kind: StretchKind): number => heartLines(tile, kind).first;

/** How many cuts the heart has in each family: `V` the right lobe's, `H` the left lobe's. */
export const cutCounts = (tile: PatternTile): Record<StretchKind, number> => ({ V: heartLines(tile, 'V').count, H: heartLines(tile, 'H').count });

/**
 * The heart's cut `k` of family `kind` (`V` the right lobe's, `H` the left lobe's)
 * in the raw 0–100 square, with where each segment comes from: the tiling's line
 * `firstLine` + k − 1.
 */
export function tracedCut(tile: PatternTile, kind: StretchKind, k: number): TracedCut {
	return traceLine(tile, kind, firstLine(tile, kind) + k - 1);
}

/** Line `line` of family `kind` of the infinite tiling, where it crosses the heart's square (see `tracedCut`). */
function traceLine(tile: PatternTile, kind: StretchKind, line: number): TracedCut {
	const n = tile.cuts + 1;
	const h = 100 / n;
	const w = patternWindow(tile);
	const toRaw = (p: Vec): Vec => ({ x: (p.x - w.x) * h, y: (p.y - w.y) * h });
	const chain: BezierSegment[] = [];
	const pieces: CutPiece[] = [];
	const start = Math.floor(kind === 'V' ? w.y : w.x) - 2;
	const end = Math.ceil((kind === 'V' ? w.y : w.x) + n) + 2;
	for (let a = start; a < end; a++) {
		const [i, j] = kind === 'V' ? [line, a] : [a, line];
		const frame = stretchFrame(tile, kind, i, j);
		const curve = stretchCurve(tile, kind, i, j);
		mapCurve(curve, (p) => toRaw(toFrame(frame, p))).forEach((seg, index) => {
			chain.push(seg);
			pieces.push({ kind, i, j, index, count: curve.length, clipped: false, range: [0, 1] });
		});
	}
	// Butt the pieces exactly: neighbouring stretches meet at a crossing.
	for (let s = 1; s < chain.length; s++) chain[s]!.p0 = chain[s - 1]!.p3;
	return clipChain(chain, pieces, kind === 'V' ? 'y' : 'x', 0, 100);
}

/** The tile's cuts in the raw 0–100 square: left lobe horizontal, right lobe vertical. */
export function patternCuts(tile: PatternTile): { left: BezierSegment[][]; right: BezierSegment[][] } {
	const counts = cutCounts(tile);
	const cuts = (kind: StretchKind) => Array.from({ length: counts[kind] }, (_, k) => tracedCut(tile, kind, k + 1).segments);
	return { left: cuts('H'), right: cuts('V') };
}

/**
 * How close to the square's edge a moved pattern's extra line may come, in the
 * square's 100 units: twice the paper Tegn keeps between two cuts, and at least
 * 0.15 of a cell, so the edge strip it leaves can be cut and woven.
 */
const edgeMargin = (tile: PatternTile) => Math.max(0.15 * (100 / (tile.cuts + 1)), 2 * HEART_CLEARANCE_UNITS);

/** Whether the cut along line `line` of family `kind` lies inside the square, `edgeMargin` from its edges. */
function lineFits(tile: PatternTile, kind: StretchKind, line: number): boolean {
	const margin = edgeMargin(tile);
	const axis = kind === 'V' ? 'x' : 'y';
	for (const s of traceLine(tile, kind, line).segments) {
		for (let k = 0; k <= 12; k++) {
			// A cut exactly at the margin fits, whichever way the rounding falls.
			const v = bezierAt(s, k / 12)[axis];
			if (v < margin - 1e-6 || v > 100 - margin + 1e-6) return false;
		}
	}
	return true;
}

/**
 * The tile with the lines the heart cuts fitted to where the pattern now is:
 * the n − 1 nearest the middle, and where an edge strip is wider than a cell,
 * the next line in it as well, if its whole cut keeps `edgeMargin` from the
 * edge. So the pattern fills the heart like a window onto the infinite tiling,
 * with a strip more where the pattern has moved off a whole line; no line the
 * heart cuts is ever dropped, and a pattern that has not moved is as before.
 * For anything that moves the pattern, leans its tiles, or sizes or rules it
 * afresh; edits to the curves keep the lines they started from.
 */
export function fitLines(tile: PatternTile): PatternTile {
	const { lines: _old, ...plain } = tile;
	const n = plain.cuts + 1;
	const fit = (kind: StretchKind): HeartLines => {
		const near = nearestLines(plain, kind);
		const pan = panOf(plain, kind);
		let { first, count } = near;
		const below = near.first - 1;
		if (below + pan > 0 && lineFits(plain, kind, below)) {
			first = below;
			count++;
		}
		const above = near.first + near.count;
		if (above + pan < n && lineFits(plain, kind, above)) count++;
		return { first, count };
	};
	const lines = { V: fit('V'), H: fit('H') };
	const moved = (['V', 'H'] as const).some((kind) => lines[kind].count !== nearestLines(plain, kind).count);
	return moved ? { ...plain, lines } : plain;
}

/** The outline of cell (c, d), counter-clockwise in the square's frame, in units of a cell. */
export function cellOutline(tile: PatternTile, c: number, d: number): BezierSegment[] {
	const place = (kind: StretchKind, i: number, j: number, backwards: boolean) => {
		const frame = stretchFrame(tile, kind, i, j);
		const curve = mapCurve(stretchCurve(tile, kind, i, j), (p) => toFrame(frame, p));
		return backwards ? reverseSegments(curve) : curve;
	};
	return [
		...place('H', c, d, false), // low y, from (c, d) to (c + 1, d)
		...place('V', c + 1, d, false), // high x, up to (c + 1, d + 1)
		...place('H', c, d + 1, true), // high y, back to (c, d + 1)
		...place('V', c, d, true) // low x, back to (c, d)
	];
}

const SMOOTH_COS = Math.cos((10 * Math.PI) / 180);
function isSmoothJoin(a: BezierSegment, b: BezierSegment): boolean {
	const t1 = { x: a.p3.x - a.p2.x, y: a.p3.y - a.p2.y };
	const t2 = { x: b.p1.x - b.p0.x, y: b.p1.y - b.p0.y };
	const l1 = Math.hypot(t1.x, t1.y);
	const l2 = Math.hypot(t2.x, t2.y);
	if (l1 < 1e-9 || l2 < 1e-9) return false;
	return (t1.x * t2.x + t1.y * t2.y) / (l1 * l2) > SMOOTH_COS;
}

function rawFinger(segments: BezierSegment[], lobe: 'left' | 'right', index: number) {
	const nodeTypes: Record<string, 'corner' | 'smooth'> = { '0': 'corner', [String(segments.length)]: 'corner' };
	for (let i = 1; i < segments.length; i++) nodeTypes[String(i)] = isSmoothJoin(segments[i - 1]!, segments[i]!) ? 'smooth' : 'corner';
	return { id: `${lobe === 'left' ? 'L' : 'R'}-cut-${index}`, lobe, pathData: segmentsToPathData(segments), nodeTypes };
}

/**
 * The tile as one of our hearts, through `normalizeHeartDesign` like every
 * other heart (it adds the square's edges and moves everything into pixels).
 */
export function patternToDesign(tile: PatternTile, opts: { name: string; author?: string }): HeartDesign {
	const { left, right } = patternCuts(tile);
	const design = normalizeHeartDesign({
		id: '',
		name: opts.name,
		author: opts.author ?? '',
		weaveParity: 1,
		gridSize: { x: right.length + 1, y: left.length + 1 },
		// A moved pattern can have a strip more one way than the other: the square stays square.
		...(right.length === left.length ? {} : { overlapAspectRatio: 1 }),
		fingers: [...left.map((s, i) => rawFinger(s, 'left', i)), ...right.map((s, i) => rawFinger(s, 'right', i))]
	});
	if (!design) throw new Error('The pattern did not make a heart.');
	return design;
}
