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
 * (`frameTo`); the turn control turns the whole pattern (`turnedTo`); dragging a
 * cut or an edge of the square moves it (`panBy`).
 *
 * Tegn's frame: the overlap rectangle in pixels; left-lobe cuts `L-k` run from
 * the right edge to the left one, right-lobe cuts `R-k` from the bottom edge to
 * the top, k counting from the top and from the left. The tile's own square
 * frame runs the other way along both, so the two differ by a scale and a
 * reversal.
 */

import type { BezierSegment, Finger, GridSize, NodeType, Vec } from '$lib/types/heart';
import { MAX_GRID_SIZE, MIN_GRID_SIZE } from '$lib/constants';
import { reverseSegments, segmentsToPathData, splitBezierAt } from '$lib/geometry/bezierSegments';
import type { OverlapRect } from '$lib/utils/overlapRect';
import { READ_TOLERANCE, sharedCrossings, type SharedCrossing } from './crossings';
import { arrowheadsInFrame, CURVE_COLORS, templateStretches } from './template';
import { isRedCell, keepsColours, latticeOf, ruleRepeat, halfOf, ruleInfo, stretchSource, type CurveKey, type StretchKind, type StretchSource, type TileRule } from './rules';
import { cornerClass, cornerFreedom, cornerShift, crossingMoves, JOINS, jointFreedom, meanShift, nearestCorners, sameWayAt } from './corners';
import {
	carryNodeTypes,
	cellOutline,
	cellsToRaw,
	chosenNodeType,
	crossing,
	curveNodeOf,
	jointHalf,
	samePiece,
	cutCounts,
	firstLine,
	fitLines,
	heartLines,
	fromFrame,
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

/**
 * The tile's inner cuts as Tegn's fingers, in Tegn's frame, ids and direction. A
 * node is smooth where its handles lie in line and a corner where not, unless the
 * visitor gave that node of the curve a type (`PatternTile.nodeTypes`): then every
 * copy of it has that. A point of the tiling (a crossing, a joint's end) is a corner
 * always, its two handles each their own.
 */
export function generateEditorFingers(tile: PatternTile, rect: OverlapRect): Finger[] {
	const counts = cutCounts(tile);
	const px = toPx(rect);
	const finger = (kind: StretchKind, k: number): Finger => {
		const traced = tracedCut(tile, kind, k);
		const segments = reverseSegments(mapSegs(traced.segments, px));
		const nodeTypes = nodeTypesFor(segments);
		// Tegn runs a cut the other way: the raw anchor r is its n − r.
		const n = segments.length;
		for (let r = 1; r < n; r++) {
			const chosen = chosenNodeType(tile, traced, r);
			if (chosen) nodeTypes[String(n - r)] = chosen;
			// A point of the tiling, where the cut goes on from one curve to the next, keeps its two handles
			// apart whichever way they lie: drawn smooth, as they start, a handle dragged would turn the other
			// with it, and the corner could never be made sharp.
			else if (cornerAt(traced.pieces, r) || jointEndAt(tile, traced.pieces, r)) nodeTypes[String(n - r)] = 'corner';
		}
		return { id: `${kind === 'H' ? 'L' : 'R'}-${k}`, lobe: kind === 'H' ? 'left' : 'right', segments, nodeTypes };
	};
	const family = (kind: StretchKind) => Array.from({ length: counts[kind] }, (_, k) => finger(kind, k + 1));
	return [...family('H'), ...family('V')];
}

/**
 * How far above its chord a side curve stands at abscissa `x`, in the stretch's own frame (the curve
 * runs from (0, 0) to (1, 0)): found by sampling, the first time the curve passes `x`; 0 where it does not.
 */
export function sideHeight(curve: SideCurve): (x: number) => number {
	const points: Vec[] = [curve[0]?.p0 ?? { x: 0, y: 0 }];
	for (const s of curve) {
		for (let k = 1; k <= 16; k++) {
			const t = k / 16;
			const u = 1 - t;
			points.push({
				x: u * u * u * s.p0.x + 3 * u * u * t * s.p1.x + 3 * u * t * t * s.p2.x + t * t * t * s.p3.x,
				y: u * u * u * s.p0.y + 3 * u * u * t * s.p1.y + 3 * u * t * t * s.p2.y + t * t * t * s.p3.y
			});
		}
	}
	return (x) => {
		for (let k = 1; k < points.length; k++) {
			const [a, b] = [points[k - 1]!, points[k]!];
			if ((a.x - x) * (b.x - x) <= 0 && a.x !== b.x) return a.y + ((x - a.x) / (b.x - a.x)) * (b.y - a.y);
		}
		return 0;
	};
}

/** How tall the half arrowheads stand on the heart's cell, against their buttons': they are the cell's marks, not its picture. */
const HEAD_SCALE = 0.6;

/** The raw square's four corners. */
const SQUARE_CORNERS: Vec[] = [
	{ x: 0, y: 0 },
	{ x: 100, y: 0 },
	{ x: 0, y: 100 },
	{ x: 100, y: 100 }
];

/**
 * The cells over the heart ("Vis felter"), in Tegn's pixels: the grid the tile's crossings make,
 * each crossing joined to the next along its row and its column by a straight line, so that how far
 * the curves bend from it shows, and what the corners and the black points move; and the outline of
 * the tile's own cell, the one drawn — the red cell nearest the heart's middle — with its curved
 * sides, and the half arrowheads of the type's template on its sides (`templateStretches`), as on
 * the type's button, standing on the curves. All follow the tile as it is dragged.
 */
export function cellOverlay(tile: PatternTile, rect: OverlapRect, headScale = HEAD_SCALE): { grid: string; cell: string; at: { c: number; d: number }; heads: Array<{ d: string; color: string }> } {
	const px = toPx(rect);
	const at = (i: number, j: number) => px(cellsToRaw(tile, crossing(tile, i, j)));
	const cells = SQUARE_CORNERS.map((q) => rawToCells(tile, q));
	// Every crossing the square can show, and one more each way for the corners that move.
	const [i0, i1] = [Math.floor(Math.min(...cells.map((p) => p.x))) - 1, Math.ceil(Math.max(...cells.map((p) => p.x))) + 1];
	const [j0, j1] = [Math.floor(Math.min(...cells.map((p) => p.y))) - 1, Math.ceil(Math.max(...cells.map((p) => p.y))) + 1];
	const num = (n: number) => Math.round(n * 100) / 100;
	const through = (points: Vec[]) => points.map((p, k) => `${k ? 'L' : 'M'} ${num(p.x)} ${num(p.y)}`).join(' ');
	const lines: string[] = [];
	for (let j = j0; j <= j1; j++) lines.push(through(Array.from({ length: i1 - i0 + 1 }, (_, k) => at(i0 + k, j))));
	for (let i = i0; i <= i1; i++) lines.push(through(Array.from({ length: j1 - j0 + 1 }, (_, k) => at(i, j0 + k))));
	// The tile's own cell: of the red ones, that whose middle is nearest the heart's.
	const middle = rawToCells(tile, { x: 50, y: 50 });
	let best = { c: 0, d: 0, away: Infinity };
	for (let c = Math.floor(middle.x) - 2; c <= Math.floor(middle.x) + 2; c++) {
		for (let d = Math.floor(middle.y) - 2; d <= Math.floor(middle.y) + 2; d++) {
			const away = Math.hypot(c + 0.5 - middle.x, d + 0.5 - middle.y);
			if (isRedCell(c, d) && away < best.away) best = { c, d, away };
		}
	}
	const outline = cellOutline(tile, best.c, best.d).map((s) => ({ p0: px(cellsToRaw(tile, s.p0)), p1: px(cellsToRaw(tile, s.p1)), p2: px(cellsToRaw(tile, s.p2)), p3: px(cellsToRaw(tile, s.p3)) }));
	// The type's template laid over it, as on its button: half an arrowhead on each of the cell's sides, and
	// where the template shows white tiles beside it, on theirs, in the colour of the curve the side carries.
	const heads = templateStretches(tile.rule).flatMap(({ kind, i, j }) => {
		const [si, sj] = [best.c + i, best.d + j];
		const frame = stretchFrame(tile, kind, si, sj);
		const color = CURVE_COLORS[stretchSource(tile.rule, kind, si, sj).curve];
		// Each stands on the side's curve, not on its chord: a vertex on the side keeps its place along it and
		// lies on the curve, one off it is the same distance above.
		const along = sideHeight(stretchCurve(tile, kind, si, sj));
		return arrowheadsInFrame(tile.rule, kind, si, sj).map((head) => ({
			d: `${through(head.map((p) => px(cellsToRaw(tile, toFrame(frame, { x: p.x, y: p.y * headScale + along(p.x) })))))} Z`,
			color
		}));
	});
	return { grid: lines.join(' '), cell: `${segmentsToPathData(outline)} Z`, at: { c: best.c, d: best.d }, heads };
}

/**
 * The tile with node type `type` given to the nodes of its curves at Tegn's
 * anchors `anchors` of cut `fingerId` (`PatternTile.nodeTypes`), so that every
 * copy of them has it, through every edit after. Anchors that are no node of a
 * curve — the tiling's own points, the cut's ends — are left as they are.
 */
export function typedTile(tile: PatternTile, fingerId: string, anchors: number[], type: NodeType): PatternTile {
	const traced = tracedFinger(tile, fingerId);
	if (!traced) return tile;
	const m = traced.pieces.length;
	let types = tile.nodeTypes;
	for (const anchor of anchors) {
		const r = m - anchor;
		const [a, b] = [traced.pieces[r - 1], traced.pieces[r]];
		if (!a || !b || !sameStretch(a, b) || b.index !== a.index + 1) continue;
		const src = stretchSource(tile.rule, b.kind, b.i, b.j);
		const node = curveNodeOf(tile, src, b.index);
		if (node === null) continue;
		types = { ...types, [src.curve]: { ...types?.[src.curve], [String(node)]: type } };
	}
	return types === tile.nodeTypes ? tile : { ...tile, nodeTypes: types };
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

/** Whether a piece is straight and drawn by no curve: a side the tiling mirrors its tiles across, or a joint. Nothing on it is drawn. */
const isStraightStretch = (rule: TileRule, piece: CutPiece) => !!piece.joint || ruleInfo(rule).straight.includes(stretchSource(rule, piece.kind, piece.i, piece.j).curve);

/** Whether a stretch is an S (its curve drawn as half, completed by a half turn), whose middle the side turns about. */
const isSStretch = (rule: TileRule, piece: CutPiece) => !piece.joint && halfOf(rule, stretchSource(rule, piece.kind, piece.i, piece.j).curve) === 'turn';

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

/**
 * The solution of the least squares problem rows · x = values, by its normal equations; null where they are
 * singular. A `damping` share of each diagonal added makes an unknown the rows say nothing about 0.
 */
function leastSquares(rows: number[][], values: number[], damping = 0): number[] | null {
	const n = rows[0]!.length;
	const m = Array.from({ length: n }, (_, r) => [
		...Array.from({ length: n }, (_, c) => rows.reduce((sum, row) => sum + row[r]! * row[c]!, 0)),
		rows.reduce((sum, row, k) => sum + row[r]! * values[k]!, 0)
	]);
	m.forEach((row, r) => (row[r]! += damping * (1 + row[r]!)));
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
 * The crossings of a heart's cuts as the rule's tiling lying under it, its repeat
 * starting at `first`: crossing (i, j) of `R-i` and `L-j` is the tiling's crossing
 * c = first + (i − 1, j − 1), at t + c'·a + c''·b in the raw 0–100 square, c' and c''
 * its place in cells once the corners have moved it (`cornerShift`, for free
 * coordinates `corners`). Fitted by least squares, the corners and the cells' sides
 * multiplying, by Gauss and Newton's steps from the plain grid; `off` the farthest a
 * crossing lies from its place. Null where the crossings do not fix the cells.
 */
export function fitCrossings(points: Vec[][], rule: TileRule, first: Vec): { t: Vec; a: Vec; b: Vec; corners: number[]; off: number } | null {
	const freedom = cornerFreedom(rule);
	const k = freedom.basis.length;
	const at = points.flatMap((row, j) => row.map((p, i) => ({ i: first.x + i, j: first.y + j, p })));
	// Unknowns: t, a, b, and the corners' free coordinates.
	let x = [0, 0, 0, 0, 0, 0, ...new Array<number>(k).fill(0)];
	const place = (c: { i: number; j: number }, w: number[]) => {
		const o = cornerShift(freedom, w, c.i, c.j);
		return { x: c.i + o.x, y: c.j + o.y };
	};
	const residuals = (v: number[]) =>
		at.flatMap((c) => {
			const q = place(c, v.slice(6));
			return [v[0]! + q.x * v[2]! + q.y * v[4]! - c.p.x, v[1]! + q.x * v[3]! + q.y * v[5]! - c.p.y];
		});
	for (let step = 0; step < 40; step++) {
		const rows: number[][] = [];
		for (const c of at) {
			const q = place(c, x.slice(6));
			const pull = freedom.basis.map((field) => field[cornerClass(c.i, c.j)]!);
			rows.push([1, 0, q.x, 0, q.y, 0, ...pull.map((u) => u.x * x[2]! + u.y * x[4]!)]);
			rows.push([0, 1, 0, q.x, 0, q.y, ...pull.map((u) => u.x * x[3]! + u.y * x[5]!)]);
		}
		const r = residuals(x);
		const d = leastSquares(rows, r.map((v) => -v), 1e-10);
		if (!d) return null;
		x = x.map((v, q) => v + d[q]!);
		if (Math.max(...d.map(Math.abs)) < 1e-12) break;
	}
	const r = residuals(x);
	let off = 0;
	for (let q = 0; q < r.length; q += 2) off = Math.max(off, Math.hypot(r[q]!, r[q + 1]!));
	return { t: { x: x[0]!, y: x[1]! }, a: { x: x[2]!, y: x[3]! }, b: { x: x[4]!, y: x[5]! }, corners: x.slice(6), off };
}

/**
 * The tile, its curves still to read, that puts the heart's crossings where
 * `fit` has them, its tiling lying so that `R-1` is line `first.x` and `L-1`
 * line `first.y`: the size of a cell the nearest plain grid's, its shape what is
 * left, the corners and the pan what the fit says. Null where the cells' shape is
 * not one the rule keeps (`latticeOf`).
 */
function gridTile(rule: TileRule, fit: { t: Vec; a: Vec; b: Vec; corners: number[] }, first: Vec, counts: Vec, tolerance: number): PatternTile | null {
	const { t, a, b } = fit;
	const det = a.x * b.y - b.x * a.y;
	if (det <= 0) return null;
	const n = Math.min(MAX_GRID_SIZE, Math.max(MIN_GRID_SIZE, Math.round(100 / Math.sqrt(det))));
	const h = 100 / n;
	const read: Shape = { x: times(a, 1 / h), y: times(b, 1 / h) };
	const shape = shapeFor(rule, read);
	const off = (p: Vec, q: Vec) => Math.hypot(p.x - q.x, p.y - q.y);
	if (off(shape.x, read.x) + off(shape.y, read.y) > (2 * tolerance) / h) return null;
	const plain = off(shape.x, { x: 1, y: 0 }) + off(shape.y, { x: 0, y: 1 }) < tolerance / h;
	// Corners that moved no further than the crossings may lie off their places stayed on the grid.
	const moved = fit.corners.some((w) => Math.abs(w) * h > tolerance);
	const base: PatternTile = { rule, cuts: n - 1, curves: {}, ...(plain ? {} : { shape }), ...(moved ? { corners: fit.corners } : {}) };
	// Where the tiling's origin lies in cells of `base`, which is not moved, is how far it has to move to lie at t.
	return { ...base, pan: rawToCells(base, t), lines: { V: { first: first.x, count: counts.x }, H: { first: first.y, count: counts.y } } };
}

export { READ_TOLERANCE };

/**
 * A tile Tegn's cuts were drawn from, of the first of `rules` that has one,
 * wherever its tiles stand in the heart — moved, sized, stretched, turned, or
 * with corners off the grid — or null. The cuts have to cross at nodes of both
 * (`sharedCrossings`), the crossings lie where the rule's tiling can put them
 * (`fitCrossings`: on a grid the rule's cells can take, `latticeOf`, with the
 * corners moved as the rule lets them), and every cut has to be the one the tile makes,
 * node for node, to `tolerance` pixels. Each rule is tried at every way its tiling
 * can lie under the heart — where its four-cell repeat starts — that shows the
 * drawn tiles in the heart's own colours (`weaveParity`), each curve read off the
 * first stretch that carries it.
 */
export function readTile(heart: { fingers: Finger[]; gridSize: GridSize; rect: OverlapRect; weaveParity: 0 | 1 }, rules: TileRule[], tolerance = READ_TOLERANCE): PatternTile | null {
	const { fingers, gridSize } = heart;
	if (gridSize.x < 3 || gridSize.y < 3) return null;
	const crossings = sharedCrossings(fingers, gridSize, tolerance);
	if (!crossings) return null;
	// Cuts that run together along a stretch at their crossings are a tile with joints, or a tile whose sides run
	// together there of themselves, crossing at one end (`sharedCrossings` would have chosen the other).
	const read = readCrossings(heart, crossings, rules, tolerance);
	if (read || !crossings.some((row) => row.some((c) => c.along))) return read;
	return readCrossings(heart, crossings.map((row) => row.map((c) => (c.along ? { ...c.along } : c))), rules, tolerance);
}

/** `readTile`, the heart's cuts crossing where `crossings` has them. */
function readCrossings(
	heart: { fingers: Finger[]; gridSize: GridSize; rect: OverlapRect; weaveParity: 0 | 1 },
	crossings: SharedCrossing[][],
	rules: TileRule[],
	tolerance: number
): PatternTile | null {
	const { fingers, gridSize, rect, weaveParity } = heart;
	const counts = { x: gridSize.x - 1, y: gridSize.y - 1 };
	const square = fromPx(rect);
	// Where each crossing is: the crossing itself, or the middle of its joint.
	const points = crossings.map((row) => row.map((c) => (c.along ? times(plus(square(c.at), square(c.along.at)), 0.5) : square(c.at))));
	const tol = (tolerance / rect.width) * 100;
	const byId = new Map(fingers.map((f) => [f.id, f]));
	/** A crossing's anchors on a cut, raw, as the cut runs: where it comes in and goes out (one anchor but at a joint). */
	const span = (c: (typeof crossings)[number][number], side: 'left' | 'right', length: number): [number, number] => {
		const at = [c[side], c.along?.[side] ?? c[side]].map((a) => length - a);
		return [Math.min(...at), Math.max(...at)];
	};
	// Every whole stretch of an inner cut, in the square's frame from its low end: between the crossings
	// with two neighbouring cuts of the other lobe, by heart indices.
	const stretches: Array<{ kind: StretchKind; i: number; j: number; segments: BezierSegment[] }> = [];
	for (let j = 1; j <= counts.y; j++) {
		const cut = rawCut(byId.get(`L-${j}`)!, rect);
		const at = crossings[j - 1]!.map((c) => span(c, 'left', cut.length));
		for (let i = 1; i < counts.x; i++) stretches.push({ kind: 'H', i, j, segments: cut.slice(at[i - 1]![1], at[i]![0]) });
	}
	for (let i = 1; i <= counts.x; i++) {
		const cut = rawCut(byId.get(`R-${i}`)!, rect);
		const at = crossings.map((row) => span(row[i - 1]!, 'right', cut.length));
		for (let j = 1; j < counts.y; j++) stretches.push({ kind: 'V', i, j, segments: cut.slice(at[j - 1]![1], at[j]![0]) });
	}
	// The joints, by heart indices: the end the right lobe's cut comes in at, raw (the one it reaches first), the
	// other, and whether the left lobe's cut comes in there too.
	const joints = crossings.flatMap((row, j) =>
		row.flatMap((c, i) => {
			if (!c.along) return [];
			const [first, second] = c.along.right < c.right ? [c.at, c.along.at] : [c.along.at, c.at];
			const leftFirst = c.along.left < c.left ? c.at : c.along.at;
			return [{ i: i + 1, j: j + 1, first: square(first), second: square(second), sameWay: leftFirst === first }];
		})
	);
	// Where the tiling's repeat can start under the heart, the colours the heart's own.
	const starts = [0, 1, 2, 3].flatMap((x) => [0, 1, 2, 3].map((y) => ({ x, y })));
	// Showing the drawn tiles in the heart's own colours; for two or three shapes, either colour, the tiling's red
	// tiles shown white where they are (`PatternTile.inverted`).
	const inverts = (f: Vec) => (f.x + f.y + 1) % 2 !== weaveParity;
	for (const rule of rules) {
		// The least moved first: a tile drawn in the tab and not moved comes back as it was drawn, not
		// as one of the other tiles its heart is also made of.
		const tiles = starts.flatMap((first) => {
			if (inverts(first) && !keepsColours(rule)) return [];
			const fit = fitCrossings(points, rule, first);
			const grid = fit && fit.off <= tol ? gridTile(rule, fit, first, counts, tol) : null;
			const read = grid && joints.length ? withJointsRead(grid, joints, first) : grid;
			const tile = read && inverts(first) ? { ...read, inverted: true as const } : read;
			return fit && tile ? [{ tile, first, fit }] : [];
		});
		// The colours as drawn first, then the least moved.
		const moved = (t: PatternTile) => (t.inverted ? 100 : 0) + Math.hypot(t.pan?.x ?? 0, t.pan?.y ?? 0);
		tiles.sort((a, b) => moved(a.tile) - moved(b.tile));
		for (const { tile, first, fit } of tiles) {
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
			const eps = (4 * tol) / Math.sqrt(fit.a.x * fit.b.y - fit.b.x * fit.a.y);
			if (!framed.every(({ kind, si, sj, curve }) => sameCurve(curve, stretchCurve(read, kind, si, sj), eps))) continue;
			if (cutsAre(fingers, generateEditorFingers(read, rect), tolerance)) return read;
		}
	}
	return null;
}

/**
 * The tile with the joints its heart's crossings open out into (`readTile`'s
 * `joints`, by heart indices, the heart lying on the tiling from `first`): the
 * colour that joins across them, the same at every one, and their free
 * coordinates, as near as the rule lets them (`nearestCorners`). Null where the
 * colour is not the same everywhere, or the rule lets none join.
 */
function withJointsRead(tile: PatternTile, joints: Array<{ i: number; j: number; first: Vec; second: Vec; sameWay: boolean }>, first: Vec): PatternTile | null {
	const at = joints.map((k) => ({ ...k, i: first.x + k.i - 1, j: first.y + k.j - 1 }));
	// Which tiles join across them, the same at every one: the cuts run along a joint the same way where the tiles
	// beside it join (`sameWayAt`). A colour floating first, then rows, then columns.
	const join = JOINS.find((j) => at.every((k) => k.sameWay === sameWayAt(j, k.i, k.j)) && jointFreedom(tile.rule, j)?.free.length);
	const freedom = join ? jointFreedom(tile.rule, join) : null;
	if (!join || !freedom) return null;
	const half = (k: (typeof at)[number]) => times(minus(rawToCells(tile, k.second), rawToCells(tile, k.first)), 0.5);
	return { ...tile, joints: { join, free: nearestCorners(freedom, at.map((k) => ({ i: k.i, j: k.j, shift: half(k) }))) } };
}

const sameStretch = samePiece;
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
	if (r > 0 && r < m) return sameStretch(pieces[r - 1]!, pieces[r]!) || pieces[r - 1]!.joint || pieces[r]!.joint ? null : crossingAfter(pieces[r - 1]!);
	if (r === 0) {
		const p = pieces[0];
		return p && !p.clipped && p.index === 0 ? { i: p.i, j: p.j } : null;
	}
	const p = pieces[m - 1];
	return r === m && p && !p.clipped && p.index === p.count - 1 ? crossingAfter(p) : null;
}

/**
 * The end of a joint at the cut's raw anchor `r`, or null: where the cut comes
 * off a stretch onto a crossing's joint, or off the joint onto the next stretch —
 * which of the joint's ends (`crossingEnds`: the first, where the right lobe's
 * cut comes in, or the second).
 */
function jointEndAt(tile: PatternTile, pieces: CutPiece[], r: number): JointEnd | null {
	const [before, after] = [pieces[r - 1], pieces[r]];
	const joint = after?.joint && (!before || !before.joint) ? after : before?.joint && (!after || !after.joint) ? before : null;
	if (!joint) return null;
	// The cut comes in at the joint's start, its first anchor, and goes out at its end.
	const coming = joint === after;
	const forward = joint.kind === 'V' || !tile.joints || sameWayAt(tile.joints.join, joint.i, joint.j);
	return { i: joint.i, j: joint.j, end: coming === forward ? 'first' : 'second' };
}

/** An end of the joint crossing (i, j) opens out into: the first, where the right lobe's cut comes in, or the second. */
export interface JointEnd {
	i: number;
	j: number;
	end: 'first' | 'second';
}

/** Where a joint's end is, in cells. */
function jointEndPoint(tile: PatternTile, end: JointEnd): Vec {
	const c = crossing(tile, end.i, end.j);
	const u = jointHalf(tile, end.i, end.j);
	return end.end === 'first' ? minus(c, u) : plus(c, u);
}

/**
 * A node the tile places rather than a curve, and what dragging it does:
 * - 'frame': a point of the tiling itself — a crossing that holds the cells'
 *   size and shape, the middle of a half-turn S, an end of the cut where the edge
 *   cuts a corner or a straight side, which may not bend: the tiles are sized,
 *   stretched and slanted so that it follows the pointer (`frameTo`).
 * - 'corner': a crossing the rule lets move off the grid (`crossingMoves`): it
 *   follows the pointer as far as the rule lets it, and the same corner of every
 *   tile with it, the cells keeping their size and shape (`cornerTo`).
 * - 'joint': an end of a joint a crossing opens out into (`PatternTile.joints`):
 *   it follows the pointer as far as the rule lets it, the joint turning and
 *   growing about its middle, and every joint with it (`jointTo`).
 * - 'slide': an end of the cut where the edge cuts a curve: it slides along the
 *   edge, reshaping the curve in every copy.
 * None of them is locked, and none moves the pattern: dragging a cut does that.
 */
export type SpecialNode = 'frame' | 'corner' | 'joint' | 'slide';

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
		const corner = cornerAt(pieces, r);
		if (corner) out.set(m - r, crossingMoves(tile.rule, corner.i, corner.j) ? 'corner' : 'frame');
		else if (jointEndAt(tile, pieces, r)) out.set(m - r, 'joint');
		else if (end) out.set(m - r, isStraightStretch(tile.rule, pieces[r === 0 ? 0 : m - 1]!) ? 'frame' : 'slide');
		else if (pieces[r]!.index === pieces[r]!.count / 2 && isSStretch(tile.rule, pieces[r]!)) out.set(m - r, 'frame');
	}
	return out;
}

/** A point the tile places, by what it is: a crossing, the middle of a stretch, or an end of a joint. Kept across a drag that remakes the cuts. */
export type PlacedPoint = { crossing: { i: number; j: number } } | { middle: { kind: StretchKind; i: number; j: number } } | { joint: JointEnd };

/** What the node at Tegn's anchor `anchor` of a cut the tile makes is, if the tile places it. */
export function placedPointAt(tile: PatternTile, fingerId: string, anchor: number): PlacedPoint | null {
	const traced = tracedFinger(tile, fingerId);
	if (!traced) return null;
	const r = traced.pieces.length - anchor;
	const corner = cornerAt(traced.pieces, r);
	if (corner) return { crossing: { i: corner.i, j: corner.j } };
	const joint = jointEndAt(tile, traced.pieces, r);
	if (joint) return { joint };
	const piece = traced.pieces[r];
	if (piece && r > 0 && piece.index === piece.count / 2 && isSStretch(tile.rule, piece)) return { middle: { kind: piece.kind, i: piece.i, j: piece.j } };
	return null;
}

/** Tegn's anchor index of a placed point on a cut the tile makes, or -1 when the cut does not show it. */
export function anchorOfPlacedPoint(tile: PatternTile, fingerId: string, point: PlacedPoint): number {
	if ('crossing' in point) return anchorOfCrossing(tile, fingerId, point.crossing);
	const traced = tracedFinger(tile, fingerId);
	if (!traced) return -1;
	if ('joint' in point) {
		const { i, j, end } = point.joint;
		for (let r = 0; r <= traced.pieces.length; r++) {
			const at = jointEndAt(tile, traced.pieces, r);
			if (at && at.i === i && at.j === j && at.end === end) return traced.pieces.length - r;
		}
		return -1;
	}
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
	const parity = (((firstLine(tile, 'V') + firstLine(tile, 'H') + 1) % 2) + 2) % 2;
	return (tile.inverted ? 1 - parity : parity) as 0 | 1;
}

/**
 * Where a placed point shows in the heart after the pattern moved: the cut of
 * family `kind` and Tegn's anchor there, of the copy of the point nearest `near`
 * (in Tegn's pixels) — the point itself, or one a whole number of repeats of the
 * tiling away, so a point dragged across repeats stays under the pointer. Null
 * when that copy is not on a cut the heart shows.
 */
export function locatePlacedPoint(tile: PatternTile, point: PlacedPoint, kind: StretchKind, near: Vec, rect: OverlapRect): { fingerId: string; anchor: number } | null {
	const at =
		'crossing' in point
			? crossing(tile, point.crossing.i, point.crossing.j)
			: 'joint' in point
				? jointEndPoint(tile, point.joint)
				: toFrame(stretchFrame(tile, point.middle.kind, point.middle.i, point.middle.j), { x: 0.5, y: 0 });
	const target = rawToCells(tile, fromPx(rect)(near));
	const repeat = ruleRepeat(tile.rule);
	const dx = Math.round((target.x - at.x) / repeat.x) * repeat.x;
	const dy = Math.round((target.y - at.y) / repeat.y) * repeat.y;
	const moved: PlacedPoint =
		'crossing' in point
			? { crossing: { i: point.crossing.i + dx, j: point.crossing.j + dy } }
			: 'joint' in point
				? { joint: { ...point.joint, i: point.joint.i + dx, j: point.joint.j + dy } }
				: { middle: { ...point.middle, i: point.middle.i + dx, j: point.middle.j + dy } };
	// The cut the copy's line is, of the family dragged: a crossing and its joint lie on one of each.
	const onBoth = 'crossing' in moved ? moved.crossing : 'joint' in moved ? moved.joint : null;
	const line = onBoth ? (kind === 'V' ? onBoth.i : onBoth.j) : 'middle' in moved && moved.middle.kind === kind ? (kind === 'V' ? moved.middle.i : moved.middle.j) : null;
	if (line === null) return null;
	const k = line - firstLine(tile, kind) + 1;
	if (k < 1 || k > heartLines(tile, kind).count) return null;
	const fingerId = `${kind === 'V' ? 'R' : 'L'}-${k}`;
	const anchor = anchorOfPlacedPoint(tile, fingerId, moved);
	return anchor < 0 ? null : { fingerId, anchor };
}

/** A point of the tiling the tile places, dragged by `delta` pixels from where it was in `base` (`frameTo`, `cornerTo`). */
export function dragPlacedPoint(base: PatternTile, fingerId: string, anchor: number, delta: Vec, rect: OverlapRect): PatternTile | null {
	const special = specialNodes(base, fingerId).get(anchor);
	if (special === 'corner') return cornerTo(base, fingerId, anchor, delta, rect);
	if (special === 'joint') return jointTo(base, fingerId, anchor, delta, rect);
	return special === 'frame' ? frameTo(base, fingerId, anchor, delta, rect) : null;
}

/** How near the grid a corner dragged is drawn to it, in cells of its free coordinates: as the cells are to the plain grid (`magnet`). */
const SNAP_CORNER = 0.03;
/** How near the grid a corner let go settles on it exactly (`settledTile`). */
const SETTLE_CORNER = 0.003;

/**
 * The tile with the crossing at Tegn's anchor `anchor` of cut `fingerId` — one
 * the rule lets move (`SpecialNode` 'corner') — moved by `delta` pixels as far as
 * the rule lets it, the least change of the corners that does (`nearestCorners`),
 * and the same corner of every tile with it. The crossings that hold the cells
 * stay where they are, and so do the cells' size and shape: the pattern moves by
 * as much as the corners took its middle (`patternMiddle`). Near the grid the
 * corners are drawn to it (`magnet`). Null for an anchor that is no crossing, or
 * where no line of a family would fit.
 */
export function cornerTo(base: PatternTile, fingerId: string, anchor: number, delta: Vec, rect: OverlapRect): PatternTile | null {
	const traced = tracedFinger(base, fingerId);
	if (!traced) return null;
	const c = cornerAt(traced.pieces, traced.pieces.length - anchor);
	if (!c) return null;
	const freedom = cornerFreedom(base.rule);
	const from = cellsToRaw(base, crossing(base, c.i, c.j));
	const to = { x: from.x + (delta.x / rect.width) * 100, y: from.y + (delta.y / rect.height) * 100 };
	const want = minus(rawToCells(base, to), rawToCells(base, from));
	const step = nearestCorners(freedom, [{ i: c.i, j: c.j, shift: want }]);
	const was = base.corners ?? [];
	const moved = freedom.free.map((_, k) => (was[k] ?? 0) + step[k]!);
	// Drawn to the grid as a whole, so that a corner several coordinates move together still follows the pointer.
	const far = Math.max(...moved.map(Math.abs));
	const pull = far > 0 ? magnet(far, SNAP_CORNER) / far : 1;
	return withCorners(base, moved.map((w) => w * pull));
}

/**
 * The tile with the end of a joint at Tegn's anchor `anchor` of cut `fingerId`
 * (`SpecialNode` 'joint') moved by `delta` pixels as far as the rule lets it: the
 * joint turns and grows about its middle, which stays, the least change of the
 * joints that does (`nearestCorners`), and every joint the rule ties to it with it.
 * Null for an anchor that is no end of a joint, or where no line would fit.
 */
export function jointTo(base: PatternTile, fingerId: string, anchor: number, delta: Vec, rect: OverlapRect): PatternTile | null {
	const traced = tracedFinger(base, fingerId);
	const joints = base.joints;
	if (!traced || !joints) return null;
	const end = jointEndAt(base, traced.pieces, traced.pieces.length - anchor);
	const freedom = jointFreedom(base.rule, joints.join);
	if (!end || !freedom) return null;
	const from = cellsToRaw(base, jointEndPoint(base, end));
	const to = { x: from.x + (delta.x / rect.width) * 100, y: from.y + (delta.y / rect.height) * 100 };
	// The first end is the middle less half the joint, the second the middle and it.
	const want = times(minus(rawToCells(base, to), rawToCells(base, from)), end.end === 'first' ? -1 : 1);
	const step = nearestCorners(freedom, [{ i: end.i, j: end.j, shift: want }]);
	const next = fitLines({ ...base, joints: { join: joints.join, free: freedom.free.map((_, k) => (joints.free[k] ?? 0) + step[k]!) } });
	const counts = cutCounts(next);
	return counts.V > 0 && counts.H > 0 ? next : null;
}

/** The tile with its corners at `corners`, the crossings that hold the cells where they were (see `cornerTo`). */
function withCorners(base: PatternTile, corners: number[]): PatternTile | null {
	const freedom = cornerFreedom(base.rule);
	const { corners: _was, ...rest } = base;
	const next: PatternTile = corners.some((w) => w !== 0) ? { ...rest, corners } : rest;
	// The middle moves with the corners' mean: the pan moves with it, so that the cells stay put.
	const shift = minus(meanShift(freedom, corners), meanShift(freedom, base.corners ?? []));
	const moved = fitLines(panned(next, shift));
	const counts = cutCounts(moved);
	return counts.V > 0 && counts.H > 0 ? moved : null;
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
 * How near the plain grid a drag is drawn to it: a side within this slant of its
 * axis is pulled towards it, and within this share of a plain cell's length, or
 * of the other side's, towards that length (`magnet`). So the tiles come back
 * square and straight, without the point sticking and then jumping.
 */
const SNAP_TURN = (2.5 * Math.PI) / 180;
const SNAP_SIZE = 0.025;

/**
 * `x` drawn towards 0 within `zone` of it, without a jump: inside, it eases from 0
 * up to x (smoothstep), so a point dragged off the plain grid leaves it slowly at
 * first and is under the pointer again by the zone's edge, moving all the way.
 * Holding the tiles at the plain grid until the pointer left the zone made the
 * point stand still and then jump the whole zone at once.
 */
function magnet(x: number, zone: number): number {
	const t = Math.abs(x) / zone;
	return t >= 1 ? x : x * t * t * (3 - 2 * t);
}

/** How near the plain grid a drag let go settles on it exactly (`settledTile`): well inside the pull, where the point is a pixel or so off it. */
const SETTLE_TURN = (0.25 * Math.PI) / 180;
const SETTLE_SIZE = 0.0025;

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
 * tiles as small as they go. Near the plain grid the cells are drawn to it, square
 * and straight (`magnet`); let go there, they settle on it (`settledTile`).
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
		slant = magnet(slant, SNAP_TURN);
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
	// One pull for lengths whose pulls would overlap (the other side as long as a plain cell, say): two
	// at once would make the point catch up too fast. The other side keeps its length through a drag, so
	// the pulls do not change while it lasts.
	const lengths = [1, length(own[other])];
	const targets = Math.abs(lengths[1]! - 1) < 2 * SNAP_SIZE ? [1] : lengths;
	for (const target of targets) grow = target * (1 + magnet(grow / target - 1, SNAP_SIZE));
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

/** Whether a tile's cells are the plain grid's, square and straight, the pattern turned or not. */
function onPlainGrid(tile: PatternTile): boolean {
	const own = unturnedShape(tile);
	return Math.abs(own.x.x - 1) + Math.abs(own.x.y) + Math.abs(own.y.x) + Math.abs(own.y.y - 1) < 1e-12;
}

/**
 * The tile with its cells on the plain grid exactly, square and straight, where a
 * drag from `base` let go of them a hair from it (`SETTLE_TURN`, `SETTLE_SIZE`) —
 * the pull of `magnet` brings them close but never quite there — the pattern
 * keeping its turn. A drag that started on the plain grid is back where it started
 * (`base`); any other keeps the heart's middle where it is. Corners a drag let go a
 * hair from the grid (`SETTLE_CORNER`) settle on it the same way. Null where
 * neither is that near the grid, or is on it already.
 */
export function settledTile(tile: PatternTile, base: PatternTile): PatternTile | null {
	// Corners dragged, let go a hair from the grid, settle on it.
	const corners = tile.corners;
	if (corners !== base.corners && corners?.length && corners.every((w) => Math.abs(w) < SETTLE_CORNER)) return withCorners(tile, corners.map(() => 0));
	if (!tile.shape || onPlainGrid(tile)) return null;
	const own = unturnedShape(tile);
	const off = (v: Vec, axis: number) => Math.abs(angleOf(v) - axis);
	const size = (v: Vec) => Math.abs(Math.hypot(v.x, v.y) - 1);
	if (off(own.x, 0) > SETTLE_TURN || off(own.y, Math.PI / 2) > SETTLE_TURN || size(own.x) > SETTLE_SIZE || size(own.y) > SETTLE_SIZE) return null;
	if (onPlainGrid(base) && tileTurn(base) === tileTurn(tile)) return base;
	return reshaped(tile, { x: { x: 1, y: 0 }, y: { x: 0, y: 1 } }, tileTurn(tile), rawToCells(tile, { x: 50, y: 50 }));
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
	if (piece.joint) return null;
	if (!piece.clipped) return tile;
	const { curve, src } = editableStretch(tile, piece);
	const [a, b] = splitBezierAt(curve[piece.index]!, r === 0 ? piece.range[0] : piece.range[1]);
	curve.splice(piece.index, 1, a, b);
	return carryNodeTypes(tile, { ...tile, curves: { ...tile.curves, [src.curve]: freeCurveOf(tile.rule, src, settle(curve), piece.index, piece.count) } });
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
	if (piece.joint || piece.clipped || (atStart ? q === 0 : q === piece.count - 1)) return null;
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
 * Crossings stay where the tile puts them — dragging one sizes the tiles or moves
 * their corners (`frameTo`, `cornerTo`) — and so does the middle of a half-turn S.
 */
export function tileAfterFingerEdit(tile: PatternTile, edited: Finger, rect: OverlapRect): PatternTile {
	const traced = tracedFinger(tile, edited.id);
	if (!traced) return tile;
	const now = rawCut(edited, rect);
	// The node types the visitor gave stay on their nodes, as a curve gains or loses one.
	return now.length === traced.segments.length
		? readMoves(tile, traced.segments, traced.pieces, now)
		: carryNodeTypes(tile, readNodeChange(tile, traced.segments, traced.pieces, now));
}
