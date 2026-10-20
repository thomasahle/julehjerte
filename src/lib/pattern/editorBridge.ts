/**
 * The Escher tab in Tegn: a tile, written out as Tegn's own cuts and read back
 * from them.
 *
 * With a rule chosen, every cut in the heart is generated from one tile (see
 * `tiling.ts`), and each stretch of cut between two crossings carries one of
 * the rule's curves. Tegn keeps its ordinary editing — drag a node or a handle,
 * double-click to add a node — and after every edit the stretches that changed
 * are read back into the tile and the whole heart is generated again, so every
 * stretch that carries the same curve follows. Dragging a point of the tiling —
 * a crossing, the middle of an S — sizes, stretches and slants every tile
 * (`frameTo`); the turn control turns the whole pattern (`turnedTo`); dragging an
 * edge of the square moves it (`panBy`).
 *
 * Tegn's frame: the overlap rectangle in pixels; left-lobe cuts `L-k` run from
 * the right edge to the left one, right-lobe cuts `R-k` from the bottom edge to
 * the top, k counting from the top and from the left. The tile's own square
 * frame runs the other way along both, so the two differ by a scale and a
 * reversal.
 */

import type { BezierSegment, Finger, GridSize, NodeType, Vec } from '$lib/types/heart';
import { MAX_GRID_SIZE, MIN_GRID_SIZE } from '$lib/constants';
import { reverseSegments, splitBezierAt } from '$lib/geometry/bezierSegments';
import type { OverlapRect } from '$lib/utils/overlapRect';
import { READ_TOLERANCE, sharedCrossings } from './crossings';
import { canLean, latticeOf, ruleRepeat, halfOf, ruleInfo, stretchSource, type CurveKey, type StretchKind, type StretchSource, type TileRule } from './rules';
import {
	cellsToRaw,
	crossing,
	cutCounts,
	firstLine,
	fitLines,
	heartLines,
	fromFrame,
	patternCuts,
	rawToCells,
	shapeFields,
	shapeFor,
	stretchCurve,
	stretchFrame,
	tileTurn,
	toFrame,
	unturnedShape,
	tracedCut,
	type CutPiece,
	type PatternTile,
	type Shape,
	type SideCurve
} from './tiling';

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

const EPS = 1e-6;
const samePt = (p: Vec, q: Vec, eps = EPS) => Math.abs(p.x - q.x) < eps && Math.abs(p.y - q.y) < eps;
const sameSeg = (a: BezierSegment, b: BezierSegment, eps = EPS) => samePt(a.p0, b.p0, eps) && samePt(a.p1, b.p1, eps) && samePt(a.p2, b.p2, eps) && samePt(a.p3, b.p3, eps);
const sameCurve = (a: SideCurve, b: SideCurve, eps: number) => a.length === b.length && a.every((s, k) => sameSeg(s, b[k]!, eps));

/** Whether the heart's cuts include exactly these: every one of `generated` is there, node for node, to `tolerance` pixels. */
export function cutsAre(fingers: Finger[], generated: Finger[], tolerance = 1e-6): boolean {
	const byId = new Map(fingers.map((f) => [f.id, f]));
	return generated.every((g) => {
		const segs = byId.get(g.id)?.segments;
		return !!segs && segs.length === g.segments.length && segs.every((seg, k) => sameSeg(seg, g.segments[k]!, tolerance));
	});
}

/** The solution of the least squares problem rows · x = values, by its normal equations; null where they are singular. */
function leastSquares(rows: number[][], values: number[]): number[] | null {
	const n = rows[0]!.length;
	const m = Array.from({ length: n }, (_, r) => [
		...Array.from({ length: n }, (_, c) => rows.reduce((sum, row) => sum + row[r]! * row[c]!, 0)),
		rows.reduce((sum, row, k) => sum + row[r]! * values[k]!, 0)
	]);
	for (let c = 0; c < n; c++) {
		const pivot = m.slice(c).reduce((best, row, k) => (Math.abs(row[c]!) > Math.abs(m[best]![c]!) ? c + k : best), c);
		if (Math.abs(m[pivot]![c]!) < 1e-12) return null;
		[m[c], m[pivot]] = [m[pivot]!, m[c]!];
		for (let r = 0; r < n; r++) {
			if (r === c) continue;
			const f = m[r]![c]! / m[c]![c]!;
			for (let k = c; k <= n; k++) m[r]![k]! -= f * m[c]![k]!;
		}
	}
	return m.map((row, r) => row[n]! / row[r]!);
}

/**
 * The crossings of a heart's cuts as a grid: crossing (i, j) of `R-i` and `L-j`
 * at t + i·a + j·b, and `odd` further where i + j is odd (leaning tiles), in the
 * raw 0–100 square, fitted by least squares; `off` the farthest a crossing lies
 * from its place.
 */
function fitGrid(points: Vec[][]): { t: Vec; a: Vec; b: Vec; odd: Vec; off: number } | null {
	const rows: number[][] = [];
	const at: Vec[] = [];
	points.forEach((row, j) =>
		row.forEach((p, i) => {
			rows.push([1, i + 1, j + 1, (i + j) % 2]);
			at.push(p);
		})
	);
	const cx = leastSquares(rows, at.map((p) => p.x));
	const cy = leastSquares(rows, at.map((p) => p.y));
	if (!cx || !cy) return null;
	const [t, a, b, odd] = [0, 1, 2, 3].map((k) => ({ x: cx[k]!, y: cy[k]! })) as [Vec, Vec, Vec, Vec];
	const off = Math.max(...rows.map((r, k) => Math.hypot(t.x + r[1]! * a.x + r[2]! * b.x + r[3]! * odd.x - at[k]!.x, t.y + r[1]! * a.y + r[2]! * b.y + r[3]! * odd.y - at[k]!.y)));
	return { t, a, b, odd, off };
}

/**
 * The tile, its curves still to read, that puts the heart's crossings where
 * `grid` has them, its tiling lying so that `R-1` is line `first.x` and `L-1`
 * line `first.y`: the size of a cell the nearest plain grid's, its shape what is
 * left, the lean and the pan what the grid says. Null where the cells' shape is
 * not one the rule keeps (`latticeOf`), or they lean and the rule's do not.
 */
function gridTile(rule: TileRule, grid: { t: Vec; a: Vec; b: Vec; odd: Vec }, first: Vec, counts: Vec, tolerance: number): PatternTile | null {
	const { t, a, b, odd } = grid;
	const lean = Math.hypot(odd.x, odd.y) > tolerance;
	if (lean && !canLean(rule)) return null;
	const det = a.x * b.y - b.x * a.y;
	if (det <= 0) return null;
	const n = Math.min(MAX_GRID_SIZE, Math.max(MIN_GRID_SIZE, Math.round(100 / Math.sqrt(det))));
	const h = 100 / n;
	const read: Shape = { x: times(a, 1 / h), y: times(b, 1 / h) };
	const shape = shapeFor(rule, read);
	const off = (p: Vec, q: Vec) => Math.hypot(p.x - q.x, p.y - q.y);
	if (off(shape.x, read.x) + off(shape.y, read.y) > (2 * tolerance) / h) return null;
	const plain = off(shape.x, { x: 1, y: 0 }) + off(shape.y, { x: 0, y: 1 }) < tolerance / h;
	const base: PatternTile = { rule, cuts: n - 1, curves: {}, ...(plain ? {} : { shape }) };
	// Raw vectors back in cells.
	const cells = (v: Vec) => minus(rawToCells(base, plus({ x: 50, y: 50 }, v)), rawToCells(base, { x: 50, y: 50 }));
	// Whether the tiling's odd crossings are the heart's odd ones: if not, the others lean.
	const even = (first.x + first.y) % 2 === 0;
	const offset = lean ? cells(even ? odd : times(odd, -1)) : null;
	const corner = even ? t : plus(t, odd);
	const middle = minus({ x: first.x - 1, y: first.y - 1 }, cells(minus(corner, { x: 50, y: 50 })));
	const o = offset ?? { x: 0, y: 0 };
	return {
		...base,
		...(offset ? { offset } : {}),
		pan: { x: n / 2 + o.x / 2 - middle.x, y: n / 2 + o.y / 2 - middle.y },
		lines: { V: { first: first.x, count: counts.x }, H: { first: first.y, count: counts.y } }
	};
}

export { READ_TOLERANCE };

/**
 * A tile Tegn's cuts were drawn from, of the first of `rules` that has one,
 * wherever its tiles stand in the heart — moved, sized, stretched, turned or
 * leaning — or null. The cuts have to cross at nodes of both (`sharedCrossings`),
 * the crossings lie on a grid the rule's cells can take (`latticeOf`), leaning only
 * where the rule lets tiles lean, and every cut has to be the one the tile makes,
 * node for node, to `tolerance` pixels. Each rule is tried at every way its tiling
 * can lie under the heart — where its four-cell repeat starts — that shows the
 * drawn tiles in the heart's own colours (`weaveParity`), each curve read off the
 * first stretch that carries it.
 */
export function readTile(heart: { fingers: Finger[]; gridSize: GridSize; rect: OverlapRect; weaveParity: 0 | 1 }, rules: TileRule[], tolerance = READ_TOLERANCE): PatternTile | null {
	const { fingers, gridSize, rect, weaveParity } = heart;
	const counts = { x: gridSize.x - 1, y: gridSize.y - 1 };
	if (counts.x < 2 || counts.y < 2) return null;
	const crossings = sharedCrossings(fingers, gridSize, tolerance);
	if (!crossings) return null;
	const square = fromPx(rect);
	const grid = fitGrid(crossings.map((row) => row.map((c) => square(c.at))));
	const tol = (tolerance / rect.width) * 100;
	if (!grid || grid.off > tol) return null;
	const byId = new Map(fingers.map((f) => [f.id, f]));
	// Every whole stretch of an inner cut, in the square's frame from its low end: between the crossings
	// with two neighbouring cuts of the other lobe, by heart indices.
	const stretches: Array<{ kind: StretchKind; i: number; j: number; segments: BezierSegment[] }> = [];
	for (let j = 1; j <= counts.y; j++) {
		const cut = rawCut(byId.get(`L-${j}`)!, rect);
		const at = crossings[j - 1]!.map((c) => cut.length - c.left);
		for (let i = 1; i < counts.x; i++) stretches.push({ kind: 'H', i, j, segments: cut.slice(at[i - 1], at[i]) });
	}
	for (let i = 1; i <= counts.x; i++) {
		const cut = rawCut(byId.get(`R-${i}`)!, rect);
		const at = crossings.map((row) => cut.length - row[i - 1]!.right);
		for (let j = 1; j < counts.y; j++) stretches.push({ kind: 'V', i, j, segments: cut.slice(at[j - 1], at[j]) });
	}
	// Where the tiling's repeat can start under the heart, the colours the heart's own.
	const starts = [0, 1, 2, 3].flatMap((x) => [0, 1, 2, 3].map((y) => ({ x, y }))).filter((f) => (f.x + f.y + 1) % 2 === weaveParity);
	for (const rule of rules) {
		// The least moved first: a tile drawn in the tab and not moved comes back as it was drawn, not
		// as one of the other tiles its heart is also made of.
		const tiles = starts.flatMap((first) => {
			const tile = gridTile(rule, grid, first, counts, tol);
			return tile ? [{ tile, first }] : [];
		});
		const moved = (t: PatternTile) => Math.hypot(t.pan?.x ?? 0, t.pan?.y ?? 0);
		tiles.sort((a, b) => moved(a.tile) - moved(b.tile));
		for (const { tile, first } of tiles) {
			// Each stretch in its own frame, its ends exactly on its crossings.
			const framed = stretches.map(({ kind, i, j, segments }) => {
				const [si, sj] = [first.x + i - 1, first.y + j - 1];
				const frame = stretchFrame(tile, kind, si, sj);
				return { kind, si, sj, curve: settle(mapSegs(segments, (p) => fromFrame(frame, rawToCells(tile, p)))) };
			});
			const curves: Partial<Record<CurveKey, SideCurve>> = {};
			for (const key of ruleInfo(rule).curves) {
				const carrier = framed.find(({ kind, si, sj }) => stretchSource(rule, kind, si, sj).curve === key);
				if (carrier) curves[key] = freeCurveOf(rule, stretchSource(rule, carrier.kind, carrier.si, carrier.sj), carrier.curve);
			}
			const read = { ...tile, curves };
			// Every whole stretch first, roughly; then every cut, its ends at the edges and all, exactly.
			const eps = (4 * tol) / Math.sqrt(grid.a.x * grid.b.y - grid.b.x * grid.a.y);
			if (!framed.every(({ kind, si, sj, curve }) => sameCurve(curve, stretchCurve(read, kind, si, sj), eps))) continue;
			if (cutsAre(fingers, generateEditorFingers(read, rect), tolerance)) return read;
		}
	}
	return null;
}

const sameStretch = (a: CutPiece, b: CutPiece) => a.kind === b.kind && a.i === b.i && a.j === b.j;
const plus = (p: Vec, d: Vec): Vec => ({ x: p.x + d.x, y: p.y + d.y });
const minus = (p: Vec, q: Vec): Vec => ({ x: p.x - q.x, y: p.y - q.y });
const times = (p: Vec, k: number): Vec => ({ x: p.x * k, y: p.y * k });
const isZero = (p: Vec) => Math.abs(p.x) < EPS && Math.abs(p.y) < EPS;

/** The raw axis along the edges a cut ends on: the right lobe's cuts end on the top and bottom edges, the left lobe's on the sides. */
const edgeAxis = (kind: StretchKind): 'x' | 'y' => (kind === 'V' ? 'x' : 'y');

/** Below this share of a segment showing, a handle on what shows would swing the rest of it too far. */
const MIN_SHOWN = 0.15;

/** The crossing a cut reaches at the end of `piece`'s stretch. */
function crossingAfter(piece: CutPiece): { i: number; j: number } {
	return piece.kind === 'V' ? { i: piece.i, j: piece.j + 1 } : { i: piece.i + 1, j: piece.j };
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
function cornerAt(pieces: CutPiece[], r: number): { i: number; j: number } | null {
	const m = pieces.length;
	if (r > 0 && r < m) return sameStretch(pieces[r - 1]!, pieces[r]!) ? null : crossingAfter(pieces[r - 1]!);
	if (r === 0) {
		const p = pieces[0];
		return p && !p.clipped && p.index === 0 ? { i: p.i, j: p.j } : null;
	}
	const p = pieces[m - 1];
	return r === m && p && !p.clipped && p.index === p.count - 1 ? crossingAfter(p) : null;
}

/**
 * A node the tile places rather than a curve, and what dragging it does:
 * - 'frame': a point of the tiling itself — a crossing, the middle of a half-turn
 *   S, an end of the cut where the edge cuts a corner or a straight side, which
 *   may not bend: the tiles are sized, stretched and slanted so that it follows
 *   the pointer (`frameTo`).
 * - 'slide': an end of the cut where the edge cuts a curve: it slides along the
 *   edge, reshaping the curve in every copy.
 * None of them is locked, and none moves the pattern: dragging an edge does that.
 */
export type SpecialNode = 'frame' | 'slide';

/** The nodes of a cut the tile makes that it places itself, by Tegn's anchor index (see `SpecialNode`). */
export function specialNodes(tile: PatternTile, fingerId: string): Map<number, SpecialNode> {
	const out = new Map<number, SpecialNode>();
	const traced = tracedFinger(tile, fingerId);
	if (!traced) return out;
	const { pieces } = traced;
	const m = pieces.length;
	// Tegn runs every cut the other way, so the raw anchor r is its anchor m − r. The middle of an S
	// is the point it turns about; a mirrored side's middle only moves across it, like any node.
	for (let r = 0; r <= m; r++) {
		const end = r === 0 || r === m;
		if (cornerAt(pieces, r)) out.set(m - r, 'frame');
		else if (end) out.set(m - r, isStraightStretch(tile.rule, pieces[r === 0 ? 0 : m - 1]!) ? 'frame' : 'slide');
		else if (pieces[r]!.index === pieces[r]!.count / 2 && isSStretch(tile.rule, pieces[r]!)) out.set(m - r, 'frame');
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

/** The tile with its pan moved by `d` cells, kept within one repeat of the tiling: moving the whole pattern a repeat changes nothing. */
function panned(tile: PatternTile, d: Vec): PatternTile {
	const pan = tile.pan ?? { x: 0, y: 0 };
	const repeat = ruleRepeat(tile.rule);
	return { ...tile, pan: { x: withinRepeat(pan.x + d.x, repeat.x), y: withinRepeat(pan.y + d.y, repeat.y) } };
}

/**
 * The whole pattern moved within the heart by `delta` pixels: what dragging a
 * cut, or the square's edge, does. It moves without end: the heart cuts the
 * lines of the tiling that fit in its square (`fitLines`), so a line that leaves
 * at one edge comes in again at the other; the pan is kept within one repeat.
 */
export function panBy(base: PatternTile, delta: Vec, rect: OverlapRect): PatternTile {
	const to = rawToCells(base, { x: (delta.x / rect.width) * 100, y: (delta.y / rect.height) * 100 });
	const from = rawToCells(base, { x: 0, y: 0 });
	return fitLines(panned(base, minus(to, from)));
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

/** A point of the tiling the tile places, dragged by `delta` pixels from where it was in `base` (`frameTo`). */
export function dragPlacedPoint(base: PatternTile, fingerId: string, anchor: number, delta: Vec, rect: OverlapRect): PatternTile | null {
	return specialNodes(base, fingerId).get(anchor) === 'frame' ? frameTo(base, fingerId, anchor, delta, rect) : null;
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
 * How far a side of the cells may lie off its axis in the heart, slanted and
 * turned together, in radians. Every cut has to run from one edge of the square to
 * the opposite one, and a slanting line runs across it aslant: much further, the
 * lines near the corners would leave it at the sides, and a 5 × 5 pattern would
 * keep three strips a side, a 3 × 3 one two.
 */
const MAX_TURN = (15 * Math.PI) / 180;

/** The shortest and the longest side a cell may have, in the square's 100 units: twelve strips across, and two. */
const SIDES: [number, number] = [100 / 12, 100 / 2];

/**
 * How near the plain grid a drag snaps to it: a side within this slant of its
 * axis lies on it, and within this share of a plain cell's length, or of the
 * other side's, is that long. So the tiles come back square and straight.
 */
const SNAP_TURN = (2.5 * Math.PI) / 180;
const SNAP_SIZE = 0.025;

/**
 * The crossing of line `line` of family `kind` that stays put when a point of the
 * line at `from` (in cells) is dragged: the one nearest the middle of the heart, so
 * that the middle stays where it was, and two stretches or more from the point, so
 * that a point near the middle has some way to move.
 */
function framePivot(tile: PatternTile, kind: StretchKind, line: number, from: Vec): Vec {
	const along = kind === 'V' ? 'y' : 'x';
	const middle = rawToCells(tile, { x: 50, y: 50 })[along];
	let best = kind === 'V' ? crossing(tile, line, Math.round(middle)) : crossing(tile, Math.round(middle), line);
	let bestD = Infinity;
	for (let a = Math.floor(middle) - 4; a <= Math.ceil(middle) + 4; a++) {
		const c = kind === 'V' ? crossing(tile, line, a) : crossing(tile, a, line);
		if (Math.abs(c[along] - from[along]) < 1.75) continue;
		const q = cellsToRaw(tile, c);
		const d = Math.hypot(q.x - 50, q.y - 50);
		if (d < bestD) {
			bestD = d;
			best = c;
		}
	}
	return best;
}

const angleOf = (v: Vec) => Math.atan2(v.y, v.x);
const dot = (p: Vec, q: Vec) => p.x * q.x + p.y * q.y;
const turn = (v: Vec, a: number): Vec => ({ x: v.x * Math.cos(a) - v.y * Math.sin(a), y: v.x * Math.sin(a) + v.y * Math.cos(a) });
const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

/**
 * The cells' own shape (`unturnedShape`) stretched and slanted, never turned, so
 * that the cells' vector `v` (from the pivot to the dragged point, a point of a cut
 * of family `kind`) comes to `w` in the square. The cell side along the dragged cut
 * follows the pointer, in length and in slant, the other side staying as it is:
 * the point is the pointer. Where the type keeps its cells rhombic, the other side
 * grows or shrinks with it; where it keeps them rectangular, the side cannot
 * slant and only grows longer or shorter, and square, both sides alike
 * (`latticeOf`). The side slants no further than `MAX_TURN` off its axis in the
 * heart, the pattern's turn with it, and is `SIDES` long at most and at least;
 * past those the point stops short, and a pointer dragged past the pivot leaves the
 * tiles as small as they go. Near the plain grid it snaps back square and straight.
 */
function slantedShape(tile: PatternTile, kind: StretchKind, v: Vec, w: Vec): Shape {
	const h = 100 / (tile.cuts + 1);
	const by = tileTurn(tile);
	const own = unturnedShape(tile);
	const lattice = latticeOf(tile.rule);
	const side = kind === 'V' ? 'y' : 'x';
	const other = side === 'x' ? 'y' : 'x';
	const axis = side === 'x' ? { x: 1, y: 0 } : { x: 0, y: 1 };
	// The side that puts the point at the pointer, in the cells' own frame: the point is v[side] of it
	// along from the pivot, and v[other] of the other side (none for a point of the pivot's own line).
	const pointer = turn(w, -by);
	const wanted = times(minus(times(pointer, 1 / h), times(own[other], v[other])), 1 / v[side]);
	let dir: Vec;
	if (lattice === 'oblique' || lattice === 'rhombic') {
		// Slanted towards the pointer, by how far it lies across the side against how far along, either
		// way, so that a pointer dragged on past the pivot slants nothing; straight near the axis.
		let slant = Math.atan2(axis.x * wanted.y - axis.y * wanted.x, Math.abs(dot(wanted, axis)));
		if (Math.abs(slant) < SNAP_TURN) slant = 0;
		dir = turn(axis, clamp(slant, -MAX_TURN - by, MAX_TURN - by));
	} else {
		// Square corners: across the other side, the way the side runs.
		const across = { x: -own[other].y, y: own[other].x };
		const len = Math.hypot(across.x, across.y);
		dir = times(across, (side === 'x' ? -1 : 1) / len);
	}
	// As long as brings the point nearest the pointer; within a hair of a plain cell's length, or of the
	// other side's, that long.
	const length = (u: Vec) => Math.hypot(u.x, u.y);
	let grow = Math.max(dot(wanted, dir), 0);
	for (const target of [1, length(own[other])]) if (Math.abs(grow / target - 1) < SNAP_SIZE) grow = target;
	grow = clamp(grow, SIDES[0] / h, SIDES[1] / h);
	const both = lattice === 'rhombic' || lattice === 'square';
	const others = both ? times(own[other], grow / length(own[other])) : own[other];
	const moved = times(dir, grow);
	return side === 'x' ? { x: moved, y: others } : { x: others, y: moved };
}

/**
 * The tile sized, stretched and slanted so that the point at Tegn's anchor
 * `anchor` of cut `fingerId` — a point of the tiling (`SpecialNode` 'frame') —
 * moves by `delta` pixels, the crossing of its line nearest the middle of the
 * heart staying where it is (`framePivot`): the side of the cells along the cut
 * follows the point, longer, shorter or aslant as the type lets the cells be
 * (`slantedShape`), and the pattern keeps its turn (`turnedTo` turns it). The
 * heart cuts the lines that then fit (`fitLines`), so a smaller tile makes more
 * strips, and a narrow one more one way than the other. Null for an anchor that
 * is no node of the cut, or where no line of a family would fit.
 */
export function frameTo(base: PatternTile, fingerId: string, anchor: number, delta: Vec, rect: OverlapRect): PatternTile | null {
	const traced = tracedFinger(base, fingerId);
	if (!traced) return null;
	const r = traced.pieces.length - anchor;
	const node = r === 0 ? traced.segments[0]?.p0 : traced.segments[r - 1]?.p3;
	if (!node) return null;
	const { kind, index } = traced.cut;
	const from = rawToCells(base, node);
	const pivot = framePivot(base, kind, firstLine(base, kind) + index - 1, from);
	const at = cellsToRaw(base, pivot);
	const to = { x: node.x + (delta.x / rect.width) * 100, y: node.y + (delta.y / rect.height) * 100 };
	return reshaped(base, slantedShape(base, kind, minus(from, pivot), minus(to, at)), tileTurn(base), pivot);
}

/**
 * The tile with cells of their own shape `own`, the pattern turned `by`, the
 * point `pivot` (in cells) staying where it was in the heart; null where no line
 * of a family would fit.
 */
function reshaped(base: PatternTile, own: Shape, by: number, pivot: Vec): PatternTile | null {
	const at = cellsToRaw(base, pivot);
	const { shape: _shape, turn: _turn, ...rest } = base;
	const shaped: PatternTile = { ...rest, ...shapeFields(base.rule, own, by) };
	// The pivot stays where it was: the pattern moves under it by as much as the new shape took it away.
	const next = fitLines(panned(shaped, minus(rawToCells(shaped, at), pivot)));
	const counts = cutCounts(next);
	return counts.V > 0 && counts.H > 0 ? next : null;
}

/**
 * How far the pattern may be turned, in radians, from and to: as far as keeps
 * every side of the cells within `MAX_TURN` of its axis, each slanted as it is.
 */
export function turnLimits(tile: PatternTile): [number, number] {
	const own = unturnedShape(tile);
	const slants = [angleOf(own.x), angleOf(own.y) - Math.PI / 2];
	return [Math.max(...slants.map((a) => -MAX_TURN - a)), Math.min(...slants.map((a) => MAX_TURN - a))];
}

/**
 * The whole pattern turned to `angle` radians (within `turnLimits`) about the
 * middle of the heart, the cells keeping their own shape: the turn control's
 * tile, as tiled.art's rotation tool turns the tessellation. Null where no line
 * of a family would fit.
 */
export function turnedTo(base: PatternTile, angle: number): PatternTile | null {
	const [lo, hi] = turnLimits(base);
	return reshaped(base, unturnedShape(base), clamp(angle, lo, hi), rawToCells(base, { x: 50, y: 50 }));
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
