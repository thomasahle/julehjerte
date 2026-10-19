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

import type { BezierSegment, HeartDesign, Vec } from '$lib/types/heart';
import { reverseSegments, segmentsToPathData } from '$lib/geometry/bezierSegments';
import { normalizeHeartDesign } from '$lib/utils/heartDesign';
import { HEART_CLEARANCE_UNITS } from '$lib/geometry/returnSearch';
import { canLean, halfOf, ruleInfo, stretchSource, type CurveKey, type StretchKind, type StretchSource, type TileRule } from './rules';

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
