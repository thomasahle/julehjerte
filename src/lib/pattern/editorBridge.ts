/**
 * The Escher tab in Tegn: a tile, written out as Tegn's own cuts and read back
 * from them.
 *
 * With a rule chosen, every cut in the heart is generated from one tile (see
 * `tiling.ts`), and each stretch of cut between two crossings carries one of
 * the rule's curves. Tegn keeps its ordinary editing — drag a node or a handle,
 * double-click to add a node — and after every edit the stretches that changed
 * are read back into the tile and the whole heart is generated again, so every
 * stretch that carries the same curve follows. Dragging a crossing leans every
 * tile (`leanTo`), where the rule allows it.
 *
 * Tegn's frame: the overlap rectangle in pixels; left-lobe cuts `L-k` run from
 * the right edge to the left one, right-lobe cuts `R-k` from the bottom edge to
 * the top, k counting from the top and from the left. The tile's own square
 * frame runs the other way along both, so the two differ by a scale and a
 * reversal.
 */

import type { BezierSegment, Finger, NodeType, Vec } from '$lib/types/heart';
import { reverseSegments, splitBezierAt } from '$lib/geometry/bezierSegments';
import type { OverlapRect } from '$lib/utils/overlapRect';
import { canLean, ruleRepeat, halfOf, ruleInfo, stretchSource, type CurveKey, type StretchKind, type StretchSource, type TileRule } from './rules';
import { crossing, cutCounts, firstLine, fitLines, heartLines, fromFrame, patternCuts, rawToCells, squareToStretch, stretchCurve, stretchFrame, tileOffset, toFrame, tracedCut, type CutPiece, type PatternTile, type SideCurve } from './tiling';

const mapSegs = (segs: BezierSegment[], f: (p: Vec) => Vec): BezierSegment[] =>
	segs.map((s) => ({ p0: f(s.p0), p1: f(s.p1), p2: f(s.p2), p3: f(s.p3) }));

const toPx = (rect: OverlapRect) => (p: Vec): Vec => ({ x: rect.left + (p.x / 100) * rect.width, y: rect.top + (p.y / 100) * rect.height });
const fromPx = (rect: OverlapRect) => (p: Vec): Vec => ({ x: ((p.x - rect.left) / rect.width) * 100, y: ((p.y - rect.top) / rect.height) * 100 });

/**
 * Which cut a finger id names, and in which family, or null for the square's edges and anything
 * else: `cuts` is how many cuts there are each way, or in each family (`cutCounts`).
 */
export function cutOfFinger(id: string, cuts: number | Record<StretchKind, number>): { kind: StretchKind; index: number } | null {
	const m = /^([LR])-(\d+)$/.exec(id);
	if (!m) return null;
	const index = Number(m[2]);
	// Right-lobe cuts are the vertical ones, left-lobe cuts the horizontal ones.
	const kind: StretchKind = m[1] === 'R' ? 'V' : 'H';
	if (index < 1 || index > (typeof cuts === 'number' ? cuts : cuts[kind])) return null;
	return { kind, index };
}

const SMOOTH_COS = Math.cos((10 * Math.PI) / 180);
function nodeTypesFor(segments: BezierSegment[]): Record<string, NodeType> {
	const types: Record<string, NodeType> = { '0': 'corner', [String(segments.length)]: 'corner' };
	for (let i = 1; i < segments.length; i++) {
		const a = segments[i - 1]!;
		const b = segments[i]!;
		const u = { x: a.p3.x - a.p2.x, y: a.p3.y - a.p2.y };
		const v = { x: b.p1.x - b.p0.x, y: b.p1.y - b.p0.y };
		const lu = Math.hypot(u.x, u.y);
		const lv = Math.hypot(v.x, v.y);
		types[String(i)] = lu > 1e-9 && lv > 1e-9 && (u.x * v.x + u.y * v.y) / (lu * lv) > SMOOTH_COS ? 'smooth' : 'corner';
	}
	return types;
}

/** The tile's inner cuts as Tegn's fingers, in Tegn's frame, ids and direction. */
export function generateEditorFingers(tile: PatternTile, rect: OverlapRect): Finger[] {
	const { left, right } = patternCuts(tile);
	const px = toPx(rect);
	const finger = (segs: BezierSegment[], lobe: 'left' | 'right', k: number): Finger => {
		const segments = reverseSegments(mapSegs(segs, px));
		return { id: `${lobe === 'left' ? 'L' : 'R'}-${k}`, lobe, segments, nodeTypes: nodeTypesFor(segments) };
	};
	return [...left.map((s, i) => finger(s, 'left', i + 1)), ...right.map((s, i) => finger(s, 'right', i + 1))];
}

/** A finger's segments in the tile's square frame, running from the cut's low end to its high end. */
function rawCut(finger: Finger, rect: OverlapRect): BezierSegment[] {
	return reverseSegments(mapSegs(finger.segments, fromPx(rect)));
}

/**
 * Cut `index` of family `kind` split at its crossings: one chain per stretch, in
 * the stretch's own frame, with its ends put back exactly on the crossings (a
 * dragged crossing goes back where it was, its handles with it). Null when the
 * cut has no node near some crossing — it was not drawn from a tile.
 */
export function stretchesOfCut(segments: BezierSegment[], kind: StretchKind, index: number, cuts: number): SideCurve[] | null {
	const n = cuts + 1;
	const h = 100 / n;
	const anchors = [segments[0]?.p0, ...segments.map((s) => s.p3)];
	if (!segments.length) return null;
	const crossing = (a: number): Vec => (kind === 'V' ? { x: index * h, y: a * h } : { x: a * h, y: index * h });
	const tolerance = h * 0.2;
	// The node nearest each crossing, in order along the cut.
	const at: number[] = [];
	let from = 0;
	for (let a = 0; a <= n; a++) {
		const c = crossing(a);
		let best = -1;
		let bestD = Infinity;
		for (let k = from; k < anchors.length; k++) {
			const p = anchors[k]!;
			const d = Math.hypot(p.x - c.x, p.y - c.y);
			if (d < bestD) {
				bestD = d;
				best = k;
			}
		}
		if (best < 0 || bestD > tolerance) return null;
		at.push(best);
		from = best + 1;
	}
	const out: SideCurve[] = [];
	for (let a = 0; a < n; a++) {
		const slice = segments.slice(at[a], at[a + 1]).map((s) => ({ p0: { ...s.p0 }, p1: { ...s.p1 }, p2: { ...s.p2 }, p3: { ...s.p3 } }));
		if (!slice.length) return null;
		const start = crossing(a);
		const end = crossing(a + 1);
		const first = slice[0]!;
		const last = slice[slice.length - 1]!;
		const d0 = { x: start.x - first.p0.x, y: start.y - first.p0.y };
		const d1 = { x: end.x - last.p3.x, y: end.y - last.p3.y };
		first.p0 = start;
		first.p1 = { x: first.p1.x + d0.x, y: first.p1.y + d0.y };
		last.p3 = end;
		last.p2 = { x: last.p2.x + d1.x, y: last.p2.y + d1.y };
		const [i, j] = kind === 'V' ? [index, a] : [a, index];
		out.push(mapSegs(slice, (p) => squareToStretch(kind, i, j, h, p)));
	}
	return out;
}

/** A stretch's curve back in the frame of the free curve it carries (both flips undone). */
function unflip(src: StretchSource, curve: SideCurve): SideCurve {
	const mapped = mapSegs(curve, (p) => ({ x: src.reverse ? 1 - p.x : p.x, y: src.negate ? -p.y : p.y }));
	return src.reverse ? reverseSegments(mapped) : mapped;
}

/**
 * The first half of a side, up to its middle node: (0.5, 0) for an S, anywhere on
 * x = 0.5 for a side that is its own mirror image (`mirror`), the node going back
 * there with its handle. The middle is node `middle` when the caller knows it,
 * else the node nearest where it belongs; the whole curve when it has no node there.
 */
function firstHalf(curve: SideCurve, mirror = false, middle?: number): SideCurve {
	let best = middle !== undefined && middle > 0 && middle < curve.length ? middle - 1 : -1;
	if (best < 0) {
		let bestD = Infinity;
		curve.slice(0, -1).forEach((s, k) => {
			const d = mirror ? Math.abs(s.p3.x - 0.5) : Math.hypot(s.p3.x - 0.5, s.p3.y);
			if (d < bestD) {
				bestD = d;
				best = k;
			}
		});
		if (best < 0 || bestD > 0.05) return curve;
	}
	const half = curve.slice(0, best + 1);
	const end = half[half.length - 1]!;
	const to = { x: 0.5, y: mirror ? end.p3.y : 0 };
	half[half.length - 1] = { ...end, p2: plus(end.p2, minus(to, end.p3)), p3: to };
	return half;
}

/** A half-turn side's curve turned about its middle: the other half takes the place of the first. */
const turnAboutMiddle = (curve: SideCurve): SideCurve => reverseSegments(mapSegs(curve, (p) => ({ x: 1 - p.x, y: -p.y })));
/** A mirrored side's curve mirrored across its middle: the other half takes the place of the first. */
const mirrorAboutMiddle = (curve: SideCurve): SideCurve => reverseSegments(mapSegs(curve, (p) => ({ x: 1 - p.x, y: p.y })));

/**
 * A stretch's curve as the free curve it carries. A side drawn in halves is read
 * off the half that segment `edited` (of `count` before the edit) is in: the
 * other half is the same curve turned about the middle (an S) or mirrored across
 * it, so an edit to either reaches both.
 */
function freeCurveOf(rule: TileRule, src: StretchSource, curve: SideCurve, edited = 0, count = curve.length): SideCurve {
	const free = unflip(src, curve);
	const half = halfOf(rule, src.curve);
	if (!half) return free;
	const at = src.reverse ? count - 1 - edited : edited;
	const other = half === 'mirror' ? mirrorAboutMiddle : turnAboutMiddle;
	// An edit that adds or removes no node keeps every node in its place, so a mirrored side's
	// middle is still node count / 2, however far along the side it was dragged.
	const middle = half === 'mirror' && curve.length === count && count % 2 === 0 ? count / 2 : undefined;
	return firstHalf(at >= count / 2 ? other(free) : free, half === 'mirror', middle);
}

/** Whether a stretch is a straight side, one the tiling mirrors its tiles across: nothing on it is drawn. */
const isStraightStretch = (rule: TileRule, piece: CutPiece) => ruleInfo(rule).straight.includes(stretchSource(rule, piece.kind, piece.i, piece.j).curve);

/** Whether a stretch is an S (its curve drawn as half, completed by a half turn), whose middle the side turns about. */
const isSStretch = (rule: TileRule, piece: CutPiece) => halfOf(rule, stretchSource(rule, piece.kind, piece.i, piece.j).curve) === 'turn';

/** Every stretch on an inner cut, in a fixed order: vertical cuts first. */
function* innerStretches(cuts: number): Generator<{ kind: StretchKind; index: number; a: number }> {
	const n = cuts + 1;
	for (let index = 1; index < n; index++) for (let a = 0; a < n; a++) yield { kind: 'V', index, a };
	for (let index = 1; index < n; index++) for (let a = 0; a < n; a++) yield { kind: 'H', index, a };
}

const stretchIndices = (kind: StretchKind, index: number, a: number): [number, number] => (kind === 'V' ? [index, a] : [a, index]);

/**
 * The tile Tegn's cuts were drawn from, read off the first stretch that carries
 * each curve. Null when the cuts do not have nodes on the plain grid's crossings.
 */
export function extractTile(fingers: Finger[], rule: TileRule, cuts: number, rect: OverlapRect): PatternTile | null {
	const byId = new Map(fingers.map((f) => [f.id, f]));
	const curves: Partial<Record<CurveKey, SideCurve>> = {};
	const cache = new Map<string, SideCurve[] | null>();
	for (const key of ruleInfo(rule).curves) {
		for (const { kind, index, a } of innerStretches(cuts)) {
			const [i, j] = stretchIndices(kind, index, a);
			const src = stretchSource(rule, kind, i, j);
			if (src.curve !== key) continue;
			const id = `${kind === 'V' ? 'R' : 'L'}-${index}`;
			if (!cache.has(id)) {
				const f = byId.get(id);
				cache.set(id, f ? stretchesOfCut(rawCut(f, rect), kind, index, cuts) : null);
			}
			const stretches = cache.get(id);
			if (!stretches) return null;
			curves[key] = freeCurveOf(rule, src, stretches[a]!);
			break;
		}
	}
	return { rule, cuts, curves };
}

const samePoint = (p: Vec, q: Vec, eps = 1e-6) => Math.abs(p.x - q.x) < eps && Math.abs(p.y - q.y) < eps;
const sameCurve = (a: SideCurve, b: SideCurve, eps = 1e-6) =>
	a.length === b.length &&
	a.every((s, k) => samePoint(s.p0, b[k]!.p0, eps) && samePoint(s.p1, b[k]!.p1, eps) && samePoint(s.p2, b[k]!.p2, eps) && samePoint(s.p3, b[k]!.p3, eps));

/**
 * Whether the cuts are exactly the ones `tile` makes: every stretch of every
 * inner cut is the curve the tile puts there (to `tolerance`, in cells).
 * `extractTile` reads each curve off one stretch only, so it also finds a tile in
 * cuts that were never drawn from one — a leaning tile, or a free drawing with
 * nodes near the crossings. Opening the Escher tab asks this first, and starts from
 * straight sides when the answer is no.
 */
export function fitsTile(fingers: Finger[], tile: PatternTile, rect: OverlapRect, tolerance = 1e-3): boolean {
	const byId = new Map(fingers.map((f) => [f.id, f]));
	const cache = new Map<string, SideCurve[] | null>();
	for (const { kind, index, a } of innerStretches(tile.cuts)) {
		const id = `${kind === 'V' ? 'R' : 'L'}-${index}`;
		if (!cache.has(id)) {
			const f = byId.get(id);
			cache.set(id, f ? stretchesOfCut(rawCut(f, rect), kind, index, tile.cuts) : null);
		}
		const actual = cache.get(id)?.[a];
		const [i, j] = stretchIndices(kind, index, a);
		if (!actual || !sameCurve(actual, stretchCurve(tile, kind, i, j), tolerance)) return false;
	}
	return true;
}

const EPS = 1e-6;
const samePt = (p: Vec, q: Vec) => Math.abs(p.x - q.x) < EPS && Math.abs(p.y - q.y) < EPS;
const sameSeg = (a: BezierSegment, b: BezierSegment) => samePt(a.p0, b.p0) && samePt(a.p1, b.p1) && samePt(a.p2, b.p2) && samePt(a.p3, b.p3);
const sameStretch = (a: CutPiece, b: CutPiece) => a.kind === b.kind && a.i === b.i && a.j === b.j;
const mod2 = (x: number) => ((x % 2) + 2) % 2;
const plus = (p: Vec, d: Vec): Vec => ({ x: p.x + d.x, y: p.y + d.y });
const minus = (p: Vec, q: Vec): Vec => ({ x: p.x - q.x, y: p.y - q.y });
const times = (p: Vec, k: number): Vec => ({ x: p.x * k, y: p.y * k });
const isZero = (p: Vec) => Math.abs(p.x) < EPS && Math.abs(p.y) < EPS;

/** The raw axis along the edges a cut ends on: the right lobe's cuts end on the top and bottom edges, the left lobe's on the sides. */
const edgeAxis = (kind: StretchKind): 'x' | 'y' => (kind === 'V' ? 'x' : 'y');

/** Below this share of a segment showing, a handle on what shows would swing the rest of it too far. */
const MIN_SHOWN = 0.15;

/** How far the tiles may lean, in cells. */
const MAX_LEAN = 1.2;

/** The crossing a cut reaches at the end of `piece`'s stretch. Odd crossings move with the lean, even ones against it. */
function crossingAfter(piece: CutPiece): { i: number; j: number; odd: boolean } {
	const [i, j] = piece.kind === 'V' ? [piece.i, piece.j + 1] : [piece.i + 1, piece.j];
	return { i, j, odd: mod2(i + j) === 1 };
}

/** The cut the tile makes for a finger, with where each segment comes from, or null for the square's edges. */
function tracedFinger(tile: PatternTile, fingerId: string) {
	const cut = cutOfFinger(fingerId, cutCounts(tile));
	return cut ? { cut, ...tracedCut(tile, cut.kind, cut.index) } : null;
}

/**
 * The crossing at the cut's raw anchor `r`, or null: between two stretches, or
 * at an end of the cut that falls exactly on one (the plain grid's cuts end on
 * corners on the square's edges).
 */
function cornerAt(pieces: CutPiece[], r: number): { i: number; j: number; odd: boolean } | null {
	const m = pieces.length;
	if (r > 0 && r < m) return sameStretch(pieces[r - 1]!, pieces[r]!) ? null : crossingAfter(pieces[r - 1]!);
	if (r === 0) {
		const p = pieces[0];
		return p && !p.clipped && p.index === 0 ? { i: p.i, j: p.j, odd: mod2(p.i + p.j) === 1 } : null;
	}
	const p = pieces[m - 1];
	return r === m && p && !p.clipped && p.index === p.count - 1 ? crossingAfter(p) : null;
}

/**
 * A node the tile places rather than a curve, and what dragging it does:
 * - 'lean': a crossing, under a rule whose tiles may lean: every tile leans with it.
 * - 'edge': an end of the cut on a corner on the square's edge, same rules: it
 *   slides along the edge, leaning the tiles that way.
 * - 'pan': a point the rule fixes in the tiling — a corner of a rule that keeps
 *   its tiles square, the middle of a half-turn S: the whole pattern moves with it.
 * - 'pan-edge': such a corner at an end of the cut, on the edge: the whole
 *   pattern moves along the edge with it.
 * - 'slide': an end of the cut where the edge cuts a curve: it slides along the
 *   edge, reshaping the curve in every copy. Where the edge cuts a straight side
 *   instead, which may not bend, it is a 'pan-edge'.
 * None of them is locked.
 */
export type SpecialNode = 'lean' | 'edge' | 'pan' | 'pan-edge' | 'slide';

/** The nodes of a cut the tile makes that it places itself, by Tegn's anchor index (see `SpecialNode`). */
export function specialNodes(tile: PatternTile, fingerId: string): Map<number, SpecialNode> {
	const out = new Map<number, SpecialNode>();
	const traced = tracedFinger(tile, fingerId);
	if (!traced) return out;
	const { pieces } = traced;
	const m = pieces.length;
	const leaning = canLean(tile.rule);
	// Tegn runs every cut the other way, so the raw anchor r is its anchor m − r. The middle of an S
	// is the point it turns about; a mirrored side's middle only moves across it, like any node.
	for (let r = 0; r <= m; r++) {
		const end = r === 0 || r === m;
		if (cornerAt(pieces, r)) out.set(m - r, leaning ? (end ? 'edge' : 'lean') : end ? 'pan-edge' : 'pan');
		else if (end) out.set(m - r, isStraightStretch(tile.rule, pieces[r === 0 ? 0 : m - 1]!) ? 'pan-edge' : 'slide');
		else if (pieces[r]!.index === pieces[r]!.count / 2 && isSStretch(tile.rule, pieces[r]!)) out.set(m - r, 'pan');
	}
	return out;
}

/** A point the tile places, by what it is: a crossing, or the middle of a stretch. Kept across a drag that remakes the cuts. */
export type PlacedPoint = { crossing: { i: number; j: number } } | { middle: { kind: StretchKind; i: number; j: number } };

/** What the node at Tegn's anchor `anchor` of a cut the tile makes is, if the tile places it. */
export function placedPointAt(tile: PatternTile, fingerId: string, anchor: number): PlacedPoint | null {
	const traced = tracedFinger(tile, fingerId);
	if (!traced) return null;
	const r = traced.pieces.length - anchor;
	const corner = cornerAt(traced.pieces, r);
	if (corner) return { crossing: { i: corner.i, j: corner.j } };
	const piece = traced.pieces[r];
	if (piece && r > 0 && piece.index === piece.count / 2 && isSStretch(tile.rule, piece)) return { middle: { kind: piece.kind, i: piece.i, j: piece.j } };
	return null;
}

/** Tegn's anchor index of a placed point on a cut the tile makes, or -1 when the cut does not show it. */
export function anchorOfPlacedPoint(tile: PatternTile, fingerId: string, point: PlacedPoint): number {
	if ('crossing' in point) return anchorOfCrossing(tile, fingerId, point.crossing);
	const traced = tracedFinger(tile, fingerId);
	if (!traced) return -1;
	const { kind, i, j } = point.middle;
	const m = traced.pieces.length;
	for (let r = 1; r < m; r++) {
		const p = traced.pieces[r]!;
		if (p.kind === kind && p.i === i && p.j === j && p.index === p.count / 2 && sameStretch(traced.pieces[r - 1]!, p)) return m - r;
	}
	return -1;
}

/**
 * Tegn's indices on cut `fingerId` found again after an edit made `after` from
 * `before` (curves edited, the same lines): a segment is the same segment of the
 * same stretch, an anchor the start of the same segment, and the cut's ends stay
 * its ends. The square's edge may now cut off more or less of a curve at the
 * cut's ends, so the cut can have nodes more or fewer before them. -1 for what
 * the cut does not show any more.
 */
export function followEdit(before: PatternTile, after: PatternTile, fingerId: string): { segment: (s: number) => number; anchor: (a: number) => number } {
	const was = tracedFinger(before, fingerId)?.pieces ?? [];
	const now = tracedFinger(after, fingerId)?.pieces ?? [];
	// Tegn runs every cut the other way: its segment s is the raw segment m − 1 − s.
	const segment = (s: number) => {
		const piece = was[was.length - 1 - s];
		const r = piece ? now.findIndex((p) => sameStretch(p, piece) && p.index === piece.index) : -1;
		return r < 0 ? -1 : now.length - 1 - r;
	};
	const anchor = (a: number) => (a === 0 ? 0 : a === was.length ? now.length : segment(a));
	return { segment, anchor };
}

/** A pan brought into one repeat of the tiling, [−repeat / 2, repeat / 2): moving the whole pattern a repeat changes nothing. */
const withinRepeat = (v: number, repeat: number) => v - repeat * Math.floor((v + repeat / 2) / repeat);

/**
 * The whole pattern moved within the heart so that the point at Tegn's anchor
 * `anchor` of cut `fingerId` moves by `delta` pixels — along the edge, for an end
 * of the cut. It moves without end: the heart cuts the lines nearest its middle,
 * and the next one where an edge strip has grown wider than a cell (`fitLines`);
 * the pan is kept within one repeat of the pattern.
 */
function panTo(base: PatternTile, fingerId: string, anchor: number, delta: Vec, rect: OverlapRect): PatternTile | null {
	const traced = tracedFinger(base, fingerId);
	if (!traced) return null;
	const m = traced.pieces.length;
	const along = anchor === 0 || anchor === m ? edgeAxis(traced.cut.kind) : null;
	return panBy(base, along === 'x' ? { x: delta.x, y: 0 } : along === 'y' ? { x: 0, y: delta.y } : delta, rect);
}

/**
 * The whole pattern moved within the heart by `delta` pixels: what dragging a
 * cut, or the square's edge, does. It moves without end, as `panTo` says.
 */
export function panBy(base: PatternTile, delta: Vec, rect: OverlapRect): PatternTile {
	const n = base.cuts + 1;
	const pan = base.pan ?? { x: 0, y: 0 };
	const repeat = ruleRepeat(base.rule);
	return fitLines({
		...base,
		pan: { x: withinRepeat(pan.x + (delta.x * n) / rect.width, repeat.x), y: withinRepeat(pan.y + (delta.y * n) / rect.height, repeat.y) }
	});
}

/**
 * The weave parity that shows the drawn ("red") tiles in the right lobe's
 * colour: the heart's cells are the tiling's moved by the lines it starts at
 * (`firstLine`), so a pattern moved past half a cell swaps which of the heart's
 * cells those are.
 */
export function weaveParityOf(tile: PatternTile): 0 | 1 {
	return ((((firstLine(tile, 'V') + firstLine(tile, 'H') + 1) % 2) + 2) % 2) as 0 | 1;
}

/**
 * Where a placed point shows in the heart after the pattern moved: the cut of
 * family `kind` and Tegn's anchor there, of the copy of the point nearest `near`
 * (in Tegn's pixels) — the point itself, or one a whole number of repeats of the
 * tiling away, so a point dragged across repeats stays under the pointer. Null
 * when that copy is not on a cut the heart shows.
 */
export function locatePlacedPoint(tile: PatternTile, point: PlacedPoint, kind: StretchKind, near: Vec, rect: OverlapRect): { fingerId: string; anchor: number } | null {
	const at = 'crossing' in point ? crossing(tile, point.crossing.i, point.crossing.j) : toFrame(stretchFrame(tile, point.middle.kind, point.middle.i, point.middle.j), { x: 0.5, y: 0 });
	const target = rawToCells(tile, fromPx(rect)(near));
	const repeat = ruleRepeat(tile.rule);
	const dx = Math.round((target.x - at.x) / repeat.x) * repeat.x;
	const dy = Math.round((target.y - at.y) / repeat.y) * repeat.y;
	const moved: PlacedPoint =
		'crossing' in point ? { crossing: { i: point.crossing.i + dx, j: point.crossing.j + dy } } : { middle: { ...point.middle, i: point.middle.i + dx, j: point.middle.j + dy } };
	// The cut the copy's line is, of the family dragged.
	const line = 'crossing' in moved ? (kind === 'V' ? moved.crossing.i : moved.crossing.j) : moved.middle.kind === kind ? (kind === 'V' ? moved.middle.i : moved.middle.j) : null;
	if (line === null) return null;
	const k = line - firstLine(tile, kind) + 1;
	if (k < 1 || k > heartLines(tile, kind).count) return null;
	const fingerId = `${kind === 'V' ? 'R' : 'L'}-${k}`;
	const anchor = anchorOfPlacedPoint(tile, fingerId, moved);
	return anchor < 0 ? null : { fingerId, anchor };
}

/**
 * A point the tile places, dragged by `delta` pixels from where it was in `base`:
 * a corner leans every tile where the rule lets tiles lean; any other corner, and
 * the middle of a half-turn S, moves the whole pattern within the heart. Either
 * way the point follows the pointer (along the edge, for an end of the cut).
 */
export function dragPlacedPoint(base: PatternTile, fingerId: string, anchor: number, delta: Vec, rect: OverlapRect): PatternTile | null {
	const kind = specialNodes(base, fingerId).get(anchor);
	if (kind === 'lean' || kind === 'edge') return leanTo(base, fingerId, anchor, delta, rect);
	if (kind === 'pan' || kind === 'pan-edge') return panTo(base, fingerId, anchor, delta, rect);
	return null;
}

/** Tegn's anchor index of a crossing on a cut the tile makes, or -1 when the cut does not show it. */
function anchorOfCrossing(tile: PatternTile, fingerId: string, crossing: { i: number; j: number }): number {
	const traced = tracedFinger(tile, fingerId);
	if (!traced) return -1;
	const m = traced.pieces.length;
	for (let r = 0; r <= m; r++) {
		const c = cornerAt(traced.pieces, r);
		if (c && c.i === crossing.i && c.j === crossing.j) return m - r;
	}
	return -1;
}

/**
 * The tile leaned so that the crossing at Tegn's anchor `anchor` of cut `fingerId`
 * moves by `delta` pixels: every crossing of its kind moves with it and the
 * others the opposite way. The heart is a window onto the tiling that moves by
 * half the lean, so the lean changes by twice the move, and the lines it cuts are
 * fitted again (`fitLines`). A corner at an end of the cut, on the square's edge,
 * only slides along it. Null when the anchor is not a crossing or the rule keeps
 * its tiles square.
 */
export function leanTo(base: PatternTile, fingerId: string, anchor: number, delta: Vec, rect: OverlapRect): PatternTile | null {
	if (!canLean(base.rule)) return null;
	const traced = tracedFinger(base, fingerId);
	if (!traced) return null;
	const m = traced.pieces.length;
	const corner = cornerAt(traced.pieces, m - anchor);
	if (!corner) return null;
	const along = anchor === 0 || anchor === m ? edgeAxis(traced.cut.kind) : null;
	const d = along === 'x' ? { x: delta.x, y: 0 } : along === 'y' ? { x: 0, y: delta.y } : delta;
	const n = base.cuts + 1;
	const sign = corner.odd ? 2 : -2;
	const o = tileOffset(base);
	const clamp = (v: number) => Math.max(-MAX_LEAN, Math.min(MAX_LEAN, v));
	return fitLines({
		...base,
		offset: { x: clamp(o.x + (sign * d.x * n) / rect.width), y: clamp(o.y + (sign * d.y * n) / rect.height) }
	});
}

/**
 * The tile with a node where the square's edge cuts the curve at an end of cut
 * `fingerId` (Tegn's anchor 0 or the last), the curve's shape unchanged: the
 * point a drag on that end moves. The tile itself when there is a node there
 * already; null when that end is a corner.
 */
export function nodeAtCutEnd(tile: PatternTile, fingerId: string, anchor: number): PatternTile | null {
	const traced = tracedFinger(tile, fingerId);
	if (!traced) return null;
	const m = traced.pieces.length;
	const r = m - anchor;
	if ((r !== 0 && r !== m) || cornerAt(traced.pieces, r)) return null;
	const piece = r === 0 ? traced.pieces[0]! : traced.pieces[m - 1]!;
	if (!piece.clipped) return tile;
	const { curve, src } = editableStretch(tile, piece);
	const [a, b] = splitBezierAt(curve[piece.index]!, r === 0 ? piece.range[0] : piece.range[1]);
	curve.splice(piece.index, 1, a, b);
	return { ...tile, curves: { ...tile.curves, [src.curve]: freeCurveOf(tile.rule, src, settle(curve), piece.index, piece.count) } };
}

/**
 * The end of cut `fingerId` (Tegn's `first` anchor or its `last`) slid along the
 * square's edge by `delta` pixels, where the edge cuts a curve: the node there
 * (see `nodeAtCutEnd`, which `base` has to have been through) moves along the
 * edge with its handles, and with it the curve in every copy.
 */
export function slideCutEnd(base: PatternTile, fingerId: string, end: 'first' | 'last', delta: Vec, rect: OverlapRect): PatternTile | null {
	const traced = tracedFinger(base, fingerId);
	if (!traced) return null;
	const m = traced.pieces.length;
	// Tegn's first anchor is the raw end of the cut, its last the raw start.
	const atStart = end === 'last';
	const piece = atStart ? traced.pieces[0]! : traced.pieces[m - 1]!;
	const q = piece.index;
	if (piece.clipped || (atStart ? q === 0 : q === piece.count - 1)) return null;
	const axis = edgeAxis(traced.cut.kind);
	const node = atStart ? traced.segments[0]!.p0 : traced.segments[m - 1]!.p3;
	// Less than half a pixel along the edge is no move yet: the tile as it was (the same one, so a caller can tell).
	if (Math.abs(axis === 'x' ? delta.x : delta.y) < 0.5) return base;
	const shift = axis === 'x' ? (delta.x / rect.width) * 100 : (delta.y / rect.height) * 100;
	const target = { ...node, [axis]: Math.max(0, Math.min(100, node[axis] + shift)) };
	const { curve, toStretch, src } = editableStretch(base, piece);
	const move = minus(toStretch(target), toStretch(node));
	const [after, before] = atStart ? [q, q - 1] : [q + 1, q];
	curve[after] = { ...curve[after]!, p0: plus(curve[after]!.p0, move), p1: plus(curve[after]!.p1, move) };
	curve[before] = { ...curve[before]!, p2: plus(curve[before]!.p2, move), p3: plus(curve[before]!.p3, move) };
	return { ...base, curves: { ...base.curves, [src.curve]: freeCurveOf(base.rule, src, settle(curve), q, piece.count) } };
}

/** A stretch's curve, copied to be edited, and the map from the raw square into its frame. */
function editableStretch(tile: PatternTile, piece: CutPiece) {
	const frame = stretchFrame(tile, piece.kind, piece.i, piece.j);
	const curve = stretchCurve(tile, piece.kind, piece.i, piece.j).map((seg) => ({ ...seg }));
	const toStretch = (q: Vec): Vec => fromFrame(frame, rawToCells(tile, q));
	return { curve, toStretch, src: stretchSource(tile.rule, piece.kind, piece.i, piece.j) };
}

/** A stretch's curve with its segments butted and its ends back on its crossings, their handles going back with them. */
function settle(curve: SideCurve): SideCurve {
	const out = curve.map((seg) => ({ ...seg }));
	for (let q = 1; q < out.length; q++) out[q]!.p0 = out[q - 1]!.p3;
	const first = out[0]!;
	const last = out[out.length - 1]!;
	first.p1 = plus(first.p1, minus({ x: 0, y: 0 }, first.p0));
	first.p0 = { x: 0, y: 0 };
	last.p2 = plus(last.p2, minus({ x: 1, y: 0 }, last.p3));
	last.p3 = { x: 1, y: 0 };
	return out;
}

/** Nodes and handles moved: every stretch they are on, read back into the curve it carries (the first change to a curve wins). */
function readMoves(tile: PatternTile, before: BezierSegment[], pieces: CutPiece[], now: BezierSegment[]): PatternTile {
	const curves = { ...tile.curves };
	const done = new Set<CurveKey>();
	for (let r = 0; r < pieces.length; ) {
		let e = r;
		while (e + 1 < pieces.length && sameStretch(pieces[e + 1]!, pieces[r]!)) e++;
		if (isStraightStretch(tile.rule, pieces[r]!)) {
			r = e + 1;
			continue;
		}
		const { curve, toStretch, src } = editableStretch(tile, pieces[r]!);
		let edited = -1;
		for (let k = r; k <= e; k++) {
			if (sameSeg(now[k]!, before[k]!)) continue;
			const piece = pieces[k]!;
			const q = piece.index;
			const seg = mapSegs([now[k]!], toStretch)[0]!;
			if (!piece.clipped) {
				curve[q] = seg;
				if (edited < 0) edited = q;
				continue;
			}
			// Cut short by the square's edge: what shows is the segment between the parameters
			// `range`. Its node inside the square moves with its handle, as Tegn moves nodes; that
			// handle is the curve's own, cut to the share that shows, so moving it moves the curve's
			// by as much again. The end on the edge, and its handle, only mark where the edge cuts
			// the curve, so they stay.
			const was = mapSegs([before[k]!], toStretch)[0]!;
			const orig = curve[q]!;
			const [a, b] = piece.range;
			if (b === 1 && a > 0) {
				const node = minus(seg.p3, was.p3);
				const handle = minus(seg.p2, was.p2);
				if (!isZero(node)) curve[q] = { ...orig, p2: plus(orig.p2, node), p3: seg.p3 };
				else if (!isZero(handle) && 1 - a >= MIN_SHOWN) curve[q] = { ...orig, p2: plus(orig.p2, times(handle, 1 / (1 - a))) };
				else continue;
			} else if (a === 0 && b < 1) {
				const node = minus(seg.p0, was.p0);
				const handle = minus(seg.p1, was.p1);
				if (!isZero(node)) curve[q] = { ...orig, p0: seg.p0, p1: plus(orig.p1, node) };
				else if (!isZero(handle) && b >= MIN_SHOWN) curve[q] = { ...orig, p1: plus(orig.p1, times(handle, 1 / b)) };
				else continue;
			} else continue;
			if (edited < 0) edited = q;
		}
		if (edited >= 0 && !done.has(src.curve)) {
			done.add(src.curve);
			curves[src.curve] = freeCurveOf(tile.rule, src, settle(curve), edited);
		}
		r = e + 1;
	}
	return { ...tile, curves };
}

/** A node added or removed: the stretch it was on, read back whole, when the square shows all of it. */
function readNodeChange(tile: PatternTile, before: BezierSegment[], pieces: CutPiece[], now: BezierSegment[]): PatternTile {
	let p = 0;
	while (p < before.length && p < now.length && sameSeg(now[p]!, before[p]!)) p++;
	let s = 0;
	while (s < before.length - p && s < now.length - p && sameSeg(now[now.length - 1 - s]!, before[before.length - 1 - s]!)) s++;
	const at = Math.min(p, before.length - 1);
	const piece = pieces[at];
	if (!piece) return tile;
	let r0 = at;
	while (r0 > 0 && sameStretch(pieces[r0 - 1]!, piece)) r0--;
	let r1 = at;
	while (r1 + 1 < pieces.length && sameStretch(pieces[r1 + 1]!, piece)) r1++;
	// The change has to lie inside the one stretch, and the square has to show all of it; a straight
	// side takes no nodes.
	if (before.length - s - 1 > r1 || r1 - r0 + 1 !== piece.count) return tile;
	if (isStraightStretch(tile.rule, piece)) return tile;
	if (pieces.slice(r0, r1 + 1).some((x) => x.clipped)) return tile;
	// A side drawn in halves keeps its middle node, which the halves meet at.
	const delta = now.length - before.length;
	const src0 = stretchSource(tile.rule, piece.kind, piece.i, piece.j);
	if (halfOf(tile.rule, src0.curve) && delta < 0 && p + 1 - r0 === piece.count / 2) return tile;
	const { toStretch, src } = editableStretch(tile, piece);
	const curve = mapSegs(now.slice(r0, r1 + 1 + delta), toStretch);
	if (!curve.length) return tile;
	return { ...tile, curves: { ...tile.curves, [src.curve]: freeCurveOf(tile.rule, src, settle(curve), p - r0, piece.count) } };
}

/**
 * The tile after Tegn edited one of the cuts it makes, read against those cuts:
 * nodes and handles moved are read back stretch by stretch, a node added or
 * removed reads its stretch back whole. The square's edge cuts the stretches at
 * the ends of a cut short: their nodes count, the handles the edge gave them do
 * not, and a node is added or removed only where the whole stretch shows.
 * Crossings stay where the tile puts them — dragging one leans the tiles, which
 * is `leanTo` — and so does the middle of a half-turn S.
 */
export function tileAfterFingerEdit(tile: PatternTile, edited: Finger, rect: OverlapRect): PatternTile {
	const traced = tracedFinger(tile, edited.id);
	if (!traced) return tile;
	const now = rawCut(edited, rect);
	return now.length === traced.segments.length
		? readMoves(tile, traced.segments, traced.pieces, now)
		: readNodeChange(tile, traced.segments, traced.pieces, now);
}
