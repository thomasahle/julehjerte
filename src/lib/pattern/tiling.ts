/**
 * Escher's way of drawing a woven heart: one tile, repeated.
 *
 * A woven heart is a chequerboard bent out of shape. Every cell is bounded by
 * four stretches of cut, two from each lobe, and every crossing joins two red
 * and two white cells. A *regular division of the plane* in M.C. Escher's sense
 * is the same thing with every red cell the same shape — and then a handful of
 * curves, the sides of one tile, draw the whole heart. A rule says which curve
 * each stretch of cut carries, and which way round (`rules.ts`); this module
 * lays a tile's curves out over the heart and cuts them to its square.
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

import type { BezierSegment, HeartDesign, NodeType, Vec } from '$lib/types/heart';
import { reverseSegments, segmentsToPathData } from '$lib/geometry/bezierSegments';
import { normalizeHeartDesign } from '$lib/utils/heartDesign';
import { HEART_CLEARANCE_UNITS } from '$lib/geometry/returnSearch';
import { canLean, halfOf, latticeOf, ruleInfo, stretchSource, type CurveKey, type StretchKind, type StretchSource, type TileRule } from './rules';

const mod2 = (x: number) => ((x % 2) + 2) % 2;

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
	 * How the cells are sized, stretched, slanted and turned in the heart (`Shape`),
	 * about the middle of its square: absent, the plain grid, cuts + 1 cells across.
	 * Dragging a point the tile places sizes, stretches and slants the cells, within
	 * the shapes the rule's motions keep (`latticeOf`); the turn control turns them
	 * (`turn`). The heart cuts as many lines each way as fit.
	 */
	shape?: Shape;
	/**
	 * How far the whole pattern is turned, in radians: `shape` is the cells' own
	 * shape (`unturnedShape`) turned this far. Kept apart, as tiled.art keeps its
	 * rotation tool apart from its corner points, so that dragging a point never
	 * turns the pattern and turning it never slants the cells. Absent with a shape
	 * saved before it was kept apart, it is the turn the shape's sides share (`tileTurn`).
	 */
	turn?: number;
	/**
	 * How far the whole pattern is moved within the heart, in cells (any rule).
	 * Dragging a cut or an edge of the square moves this. The heart cuts whichever
	 * lines of the tiling fit in its square (`fitLines`), so the pattern can move
	 * without end; a pan is kept within one repeat of the tiling (`ruleRepeat`),
	 * from half a repeat back to half a repeat on.
	 */
	pan?: Vec;
	/**
	 * The lines the heart cuts, each way, once the pattern has been moved,
	 * stretched or turned: every line of the tiling whose cut fits in the square,
	 * so the pattern fills the heart like a window onto the infinite tiling
	 * (`fitLines`). Absent, the cuts + 1 nearest the middle.
	 */
	lines?: Record<StretchKind, HeartLines>;
	/**
	 * The types the visitor gave nodes of the tile's curves, by curve and by the
	 * node's place in it (1 to its length − 1; of a curve drawn in halves, in the
	 * half): a corner keeps its handles apart though they lie in line, a
	 * symmetric node its handles alike. Every copy of a curve shows them
	 * (`chosenNodeType`), through every edit after; every other node is smooth
	 * where its handles lie in line and a corner where not.
	 */
	nodeTypes?: Partial<Record<CurveKey, Record<string, NodeType>>>;
}

/**
 * A cell's shape in the heart: where its side along a left-lobe cut (`x`, the
 * cell's (1, 0)) and its side along a right-lobe cut (`y`, its (0, 1)) go, in
 * cells of the plain grid. The columns of a 2 × 2 matrix.
 */
export interface Shape {
	x: Vec;
	y: Vec;
}

const PLAIN: Shape = { x: { x: 1, y: 0 }, y: { x: 0, y: 1 } };

/** The tile's shape: the plain grid unless it has been sized, stretched, slanted or turned. */
export const tileShape = (tile: PatternTile): Shape => tile.shape ?? PLAIN;

const angleOf = (v: Vec) => Math.atan2(v.y, v.x);
const rotated = (v: Vec, a: number): Vec => ({ x: v.x * Math.cos(a) - v.y * Math.sin(a), y: v.x * Math.sin(a) + v.y * Math.cos(a) });

/** A shape turned by `angle` radians, both its sides. */
export const turnShape = (shape: Shape, angle: number): Shape => ({ x: rotated(shape.x, angle), y: rotated(shape.y, angle) });

/**
 * How far the tile's pattern is turned, in radians (`PatternTile.turn`): for a
 * shape kept without one, the turn its sides share, each off its own axis.
 */
export function tileTurn(tile: PatternTile): number {
	if (tile.turn !== undefined) return tile.turn;
	if (!tile.shape) return 0;
	return (angleOf(tile.shape.x) + angleOf(tile.shape.y) - Math.PI / 2) / 2;
}

/** The cells' own shape, before the pattern's turn: how dragging its points left them. */
export const unturnedShape = (tile: PatternTile): Shape => turnShape(tileShape(tile), -tileTurn(tile));

/**
 * A tile's `shape` and `turn` for cells of their own shape `unturned`, the pattern
 * turned by `turn`: none for the plain grid unturned. Cells the rule keeps
 * rectangular or square cannot slant, so a turn of their own is the pattern's.
 */
export function shapeFields(rule: TileRule, unturned: Shape, turn: number): { shape?: Shape; turn?: number } {
	let own = unturned;
	let by = turn;
	if (['rectangular', 'square'].includes(latticeOf(rule))) {
		const off = angleOf(own.x);
		own = turnShape(own, -off);
		by += off;
	}
	const plain = Math.abs(own.x.x - 1) + Math.abs(own.x.y) + Math.abs(own.y.x) + Math.abs(own.y.y - 1) < 1e-9;
	if (plain && Math.abs(by) < 1e-12) return {};
	return { shape: turnShape(own, by), turn: by };
}

/** The shape the tile would have under `rule`: the nearest its motions keep (`latticeOf`), the size the same. */
export function shapeFor(rule: TileRule, shape: Shape): Shape {
	const len = (v: Vec) => Math.hypot(v.x, v.y);
	const scale = (v: Vec, k: number) => ({ x: v.x * k, y: v.y * k });
	// A quarter turn on, the way (1, 0) turns to (0, 1).
	const turned = (v: Vec) => ({ x: -v.y, y: v.x });
	const lattice = latticeOf(rule);
	if (lattice === 'oblique') return shape;
	if (lattice === 'rhombic') {
		const side = Math.sqrt(len(shape.x) * len(shape.y));
		return { x: scale(shape.x, side / len(shape.x)), y: scale(shape.y, side / len(shape.y)) };
	}
	const area = Math.abs(shape.x.x * shape.y.y - shape.y.x * shape.x.y);
	const x = lattice === 'square' ? scale(shape.x, Math.sqrt(area) / len(shape.x)) : shape.x;
	return { x, y: scale(turned(x), (lattice === 'square' ? len(x) : len(shape.y)) / len(x)) };
}

/** The tile's corner offset, or none for a rule that keeps the plain grid. */
export function tileOffset(tile: PatternTile): Vec {
	return canLean(tile.rule) && tile.offset ? tile.offset : { x: 0, y: 0 };
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
function completeMirror(half: SideCurve): SideCurve {
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

/**
 * The node of the visitor's curve that node `s` of a stretch carrying it
 * (`src`, see `sourceCurve`) is, numbered as `PatternTile.nodeTypes` numbers it;
 * null where it is none: on a straight side, at the middle where a curve drawn in
 * halves meets its other half, or at an end.
 */
export function curveNodeOf(tile: PatternTile, src: StretchSource, s: number): number | null {
	if (ruleInfo(tile.rule).straight.includes(src.curve)) return null;
	const own = tile.curves[src.curve]?.length ?? 1;
	const half = halfOf(tile.rule, src.curve);
	const total = half ? 2 * own : own;
	let k = src.reverse ? total - s : s;
	if (half) {
		if (k === own) return null;
		// The other half runs back: its nodes are the half's, counted from the middle.
		if (k > own) k = total - k;
	}
	return k >= 1 && k < own ? k : null;
}

/**
 * The type the visitor gave the node where segments `r − 1` and `r` of a traced
 * cut meet, where that is a node of one of the tile's curves and they gave it one.
 */
export function chosenNodeType(tile: PatternTile, traced: TracedCut, r: number): NodeType | undefined {
	const a = traced.pieces[r - 1];
	const b = traced.pieces[r];
	if (!a || !b || a.kind !== b.kind || a.i !== b.i || a.j !== b.j || b.index !== a.index + 1) return undefined;
	const src = stretchSource(tile.rule, b.kind, b.i, b.j);
	const node = curveNodeOf(tile, src, b.index);
	return node === null ? undefined : tile.nodeTypes?.[src.curve]?.[String(node)];
}

/**
 * The visitor's node types carried from the tile `before` an edit to the tile
 * `after` it: a curve with as many nodes keeps them where they are; one that
 * gained or lost a node keeps them on the nodes that stayed put, and drops the
 * type of one removed.
 */
export function carryNodeTypes(before: PatternTile, after: PatternTile): PatternTile {
	const { nodeTypes: _types, ...rest } = after;
	if (!before.nodeTypes) return rest;
	const next: Partial<Record<CurveKey, Record<string, NodeType>>> = {};
	for (const [key, chosen] of Object.entries(before.nodeTypes) as Array<[CurveKey, Record<string, NodeType>]>) {
		const was = before.curves[key];
		const now = after.curves[key];
		if (!was || !now) continue;
		if (was.length === now.length) {
			next[key] = chosen;
			continue;
		}
		const kept: Record<string, NodeType> = {};
		for (const [k, type] of Object.entries(chosen)) {
			const p = was[Number(k)]?.p0;
			const at = p ? now.findIndex((seg, n) => n > 0 && Math.hypot(seg.p0.x - p.x, seg.p0.y - p.y) < 1e-6) : -1;
			if (at > 0) kept[String(at)] = type;
		}
		if (Object.keys(kept).length) next[key] = kept;
	}
	return Object.keys(next).length ? { ...rest, nodeTypes: next } : rest;
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

/** Coordinate `axis` of `bezierAt(s, t)`, without the other. */
const coordAt = (s: BezierSegment, axis: 'x' | 'y', t: number): number => {
	const u = 1 - t;
	return u * u * u * s.p0[axis] + 3 * u * u * t * s.p1[axis] + 3 * u * t * t * s.p2[axis] + t * t * t * s.p3[axis];
};

/** The first parameter at which coordinate `axis` of the segment reaches `v` from below, or null. */
function firstCrossing(s: BezierSegment, axis: 'x' | 'y', v: number): number | null {
	const c0 = s.p0[axis], c1 = s.p1[axis], c2 = s.p2[axis], c3 = s.p3[axis];
	// Its points are weighted means of its control points, so it stays below a `v` they all lie
	// well below, rounding and all.
	if (Math.max(c0, c1, c2, c3) + 1e-9 * (1 + Math.abs(c0) + Math.abs(c1) + Math.abs(c2) + Math.abs(c3)) < v) return null;
	const STEPS = 64;
	let prev = coordAt(s, axis, 0);
	if (prev >= v) return 0;
	for (let k = 1; k <= STEPS; k++) {
		const cur = coordAt(s, axis, k / STEPS);
		if (cur >= v) {
			let lo = (k - 1) / STEPS;
			let hi = k / STEPS;
			for (let it = 0; it < 40; it++) {
				const mid = (lo + hi) / 2;
				if (coordAt(s, axis, mid) >= v) hi = mid;
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
 * The point of the infinite tiling, in cells, at the middle of the heart's
 * square: on the plain grid the square lies exactly over cells 0…n−1; with
 * leaning tiles it moves by half the lean, so the cuts keep an even margin from
 * the edges; and it moves by the opposite of the tile's `pan`, which moves the
 * pattern within the heart. The tile's shape turns and stretches about it.
 */
function patternMiddle(tile: PatternTile): Vec {
	const n = tile.cuts + 1;
	const o = tileOffset(tile);
	const pan = tile.pan ?? { x: 0, y: 0 };
	return { x: n / 2 + o.x / 2 - pan.x, y: n / 2 + o.y / 2 - pan.y };
}

/** A point of the infinite tiling, in cells, in the raw 0–100 square. */
export function cellsToRaw(tile: PatternTile, p: Vec): Vec {
	const h = 100 / (tile.cuts + 1);
	const m = patternMiddle(tile);
	const { x: a, y: b } = tileShape(tile);
	const d = { x: p.x - m.x, y: p.y - m.y };
	return { x: 50 + h * (a.x * d.x + b.x * d.y), y: 50 + h * (a.y * d.x + b.y * d.y) };
}

/** A point of the raw 0–100 square in cells of the infinite tiling, the frame crossings and stretch frames live in. */
export function rawToCells(tile: PatternTile, q: Vec): Vec {
	const h = 100 / (tile.cuts + 1);
	const m = patternMiddle(tile);
	const { x: a, y: b } = tileShape(tile);
	const det = a.x * b.y - b.x * a.y;
	const r = { x: (q.x - 50) / h, y: (q.y - 50) / h };
	return { x: m.x + (b.y * r.x - b.x * r.y) / det, y: m.y + (a.x * r.y - a.y * r.x) / det };
}

const CORNERS: Vec[] = [
	{ x: 0, y: 0 },
	{ x: 100, y: 0 },
	{ x: 0, y: 100 },
	{ x: 100, y: 100 }
];

/** Where the heart's square lies on the tiling along cell axis `axis`, from its corners: the least and the most. */
function squareSpan(tile: PatternTile, axis: 'x' | 'y'): [number, number] {
	const at = CORNERS.map((q) => rawToCells(tile, q)[axis]);
	return [Math.min(...at), Math.max(...at)];
}

const panOf = (tile: PatternTile, kind: StretchKind) => (kind === 'V' ? (tile.pan?.x ?? 0) : (tile.pan?.y ?? 0));

/**
 * The n − 1 lines of family `kind` nearest the middle of the heart's square, on
 * the plain grid: line k lies k + pan cells in (the lean moves the window with
 * it), so the first is the one between half a cell and one and a half in. The
 * lines a tile that has not been moved, sized or turned cuts.
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
	const chain: BezierSegment[] = [];
	const pieces: CutPiece[] = [];
	// The stretches along the line where the square can be, and two more each way for leaning tiles and curves.
	const [from, to] = squareSpan(tile, kind === 'V' ? 'y' : 'x');
	for (let a = Math.floor(from) - 2; a < Math.ceil(to) + 2; a++) {
		const [i, j] = kind === 'V' ? [line, a] : [a, line];
		const frame = stretchFrame(tile, kind, i, j);
		const curve = stretchCurve(tile, kind, i, j);
		mapCurve(curve, (p) => cellsToRaw(tile, toFrame(frame, p))).forEach((seg, index) => {
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

/** How far apart the lines of family `kind` are in the square, square across them, in its 100 units. */
export function lineSpacing(tile: PatternTile, kind: StretchKind): number {
	const { x: a, y: b } = tileShape(tile);
	const along = kind === 'V' ? b : a;
	return ((100 / (tile.cuts + 1)) * Math.abs(a.x * b.y - b.x * a.y)) / Math.hypot(along.x, along.y);
}

/**
 * How close to the square's edge a cut may come, in the square's 100 units:
 * twice the paper Tegn keeps between two cuts, and at least 0.15 of the way to
 * the next line, so the edge strip it leaves can be cut and woven.
 */
const edgeMargin = (tile: PatternTile, kind: StretchKind) => Math.max(0.15 * lineSpacing(tile, kind), 2 * HEART_CLEARANCE_UNITS);

/** Whether the cut along line `line` of family `kind` lies inside the square, `edgeMargin` from its edges. */
function lineFits(tile: PatternTile, kind: StretchKind, line: number): boolean {
	const margin = edgeMargin(tile, kind);
	const [axis, run] = kind === 'V' ? (['x', 'y'] as const) : (['y', 'x'] as const);
	// A crossing of the line across the square from the margin answers it without tracing the curves.
	const [from, to] = squareSpan(tile, run);
	for (let a = Math.floor(from); a <= Math.ceil(to); a++) {
		const q = cellsToRaw(tile, kind === 'V' ? crossing(tile, line, a) : crossing(tile, a, line));
		if (q[run] >= 0 && q[run] <= 100 && (q[axis] < margin - 1e-6 || q[axis] > 100 - margin + 1e-6)) return false;
	}
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
 * every line of the tiling whose whole cut keeps `edgeMargin` from the edges,
 * from the first to the last. So the pattern fills the heart like a window onto
 * the infinite tiling, with a strip more where it has moved off a whole line, and
 * as many strips each way as its tiles' size and shape let fit; a pattern that has
 * not been moved, sized or turned is as before. For anything that moves, sizes,
 * turns or rules the pattern afresh; edits to the curves keep the lines they
 * started from.
 */
export function fitLines(tile: PatternTile): PatternTile {
	const { lines: _old, ...plain } = tile;
	const fit = (kind: StretchKind): HeartLines => {
		// The lines that can cross the square, and one more each way for leaning tiles and curves; the
		// first and the last that fit, looked for from each end.
		const [from, to] = squareSpan(plain, kind === 'V' ? 'x' : 'y');
		const [lo, hi] = [Math.floor(from) - 1, Math.ceil(to) + 1];
		let first = lo;
		while (first <= hi && !lineFits(plain, kind, first)) first++;
		let last = hi;
		while (last > first && !lineFits(plain, kind, last)) last--;
		return first <= hi ? { first, count: last - first + 1 } : { first: 0, count: 0 };
	};
	const lines = { V: fit('V'), H: fit('H') };
	const moved = (['V', 'H'] as const).some((kind) => lines[kind].count !== nearestLines(plain, kind).count || lines[kind].first !== nearestLines(plain, kind).first);
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
