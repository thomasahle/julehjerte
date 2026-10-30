/**
 * A topology's recipe carried to a board whose outline is another graph only
 * where it turns: the same blobs, whose outline (see `boardOutline` with no
 * turns) has its vertices only where pieces of it meet or meet the paper's
 * edge, with corners come or gone along it. On five strips the circle at 98%
 * meets the middle lines a cutting clearance short of the paper's edge, and at
 * 99% meets the edge past them: each blob on a side loses the corner where a
 * line met the circle, and is the same blob, between the same edges.
 *
 * A place on the board keeps its place along its blob's edge, between the
 * corners matched on both boards (`alignCorners`); a stretch of the outline
 * follows the other board's outline between its ends, and drops out where it
 * shrinks to nothing (a line between the circle and the edge, gone).
 */
import type { Point, Ring } from './geometry';
import { alongEdge, boardOutline, type BoardOutline, type OutlineEdge } from './boardOutline';
import type { TopologyAnchor, TopologyPiece, TopologyRecipe } from './recipes';

/** A turn no outline makes: its blobs' outline has no corners for turns. */
const NO_TURNS = 360;
/** How near a point lies to an edge it is on (the outlines share their points). */
const ON = 1e-4;

/** Where a point lies along an edge, as a share of its length, and how far off it. */
function shareOn(edge: OutlineEdge, p: Point): { t: number; d: number } {
	const L = edge.cum[edge.cum.length - 1];
	let best = { t: 0, d: Infinity };
	for (let i = 0; i + 1 < edge.points.length; i++) {
		const a = edge.points[i], b = edge.points[i + 1], dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
		const u = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0, d = Math.hypot(a[0] + u * dx - p[0], a[1] + u * dy - p[1]);
		if (d < best.d) best = { t: L ? (edge.cum[i] + u * Math.sqrt(l2)) / L : 0, d };
	}
	return best;
}

/** The blob edge a fine edge lies along (by its middle), and the shares of its ends along it. */
function placeIn(blobs: BoardOutline, edge: OutlineEdge): { E: number; a: number; b: number } | undefined {
	const middle = alongEdge(edge, .5);
	let E = -1, least = ON;
	blobs.edges.forEach((blob, k) => { const { d } = shareOn(blob, middle); if (d < least) { least = d; E = k; } });
	if (E < 0) return;
	// A closed stretch is its blob's whole loop; one that runs past where a loop starts is not carried.
	if (edge.from < 0) return { E, a: 0, b: 1 };
	let a = shareOn(blobs.edges[E], edge.points[0]).t, b = shareOn(blobs.edges[E], edge.points[edge.points.length - 1]).t;
	const m = shareOn(blobs.edges[E], middle).t;
	// A blob edge from a vertex round back to it (blobs touching at a corner) starts and ends there.
	if ((m - a) * (m - b) > 0 && blobs.edges[E].from === blobs.edges[E].to) {
		const other = (t: number) => t < 1e-6 ? 1 : t > 1 - 1e-6 ? 0 : t;
		if ((m - other(a)) * (m - b) <= 0) a = other(a);
		else if ((m - a) * (m - other(b)) <= 0) b = other(b);
	}
	return (m - a) * (m - b) <= 0 ? { E, a, b } : undefined;
}

/** The corners of each blob edge: the outline's vertices inside it, by their shares along it. */
function cornersOf(fine: BoardOutline, blobs: BoardOutline): number[][] {
	const corners = blobs.edges.map(() => [] as number[]);
	for (const v of fine.vertices) blobs.edges.forEach((blob, E) => {
		const { t, d } = shareOn(blob, v);
		if (d < ON && t > 1e-6 && t < 1 - 1e-6) corners[E].push(t);
	});
	return corners.map(list => list.sort((a, b) => a - b));
}

/** The corners of one blob edge on two boards paired in order, those of the
 * longer list that pair with none (come or gone) left out where that leaves
 * the pairs nearest, as shares along it. */
export function alignCorners(from: number[], to: number[]): [number, number][] {
	const [long, short, swapped] = from.length >= to.length ? [from, to, false] : [to, from, true];
	// cost[i][j]: the least distance pairing the first j of the short with j of the first i of the long.
	const n = long.length, m = short.length, cost = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(Infinity));
	for (let i = 0; i <= n; i++) cost[i][0] = 0;
	for (let i = 1; i <= n; i++) for (let j = 1; j <= Math.min(i, m); j++)
		cost[i][j] = Math.min(cost[i - 1][j], cost[i - 1][j - 1] + Math.abs(long[i - 1] - short[j - 1]));
	const pairs: [number, number][] = [];
	for (let i = n, j = m; j > 0; i--) if (cost[i][j] !== cost[i - 1][j]) { pairs.push(swapped ? [short[j - 1], long[i - 1]] : [long[i - 1], short[j - 1]]); j--; }
	return pairs.reverse();
}

/** A share along a blob edge on one board, on the other: piecewise between
 * the paired corners, a corner gone collapsing into the nearer of the paired
 * ones either side (or the edge's end), the stretch between them with it. */
function mapShare(s: number, pairs: [number, number][], corners: number[]): number {
	const paired: [number, number][] = [[0, 0], ...pairs, [1, 1]], points = [...paired];
	for (const c of corners) {
		if (pairs.some(([a]) => a === c)) continue;
		const after = paired.findIndex(([a]) => a > c), [a0, b0] = paired[after - 1], [a1, b1] = paired[after];
		points.push([c, c - a0 <= a1 - c ? b0 : b1]);
	}
	points.sort((x, y) => x[0] - y[0]);
	for (let k = 1; k < points.length; k++) {
		const [a0, b0] = points[k - 1], [a1, b1] = points[k];
		if (s <= a1 || k === points.length - 1) return a1 > a0 ? b0 + (Math.min(s, a1) - a0) / (a1 - a0) * (b1 - b0) : b1;
	}
	return s;
}

/** The recipe drawn on `fromBoard`'s outline carried to `toBoard`'s, where
 * they are the same blobs (see the module's comment); none where they are not,
 * or a place falls off the other's outline. */
export function transferTopology(recipe: TopologyRecipe, fromBoard: Ring[], toBoard: Ring[]): TopologyRecipe | undefined {
	if (boardOutline(fromBoard).sig !== recipe.outline) return;
	const frame = outlineFrame(fromBoard);
	return frame && carryTopology(recipe, frame, toBoard);
}

/** A board's outline as a recipe drawn on it is carried to another board of
 * the same blobs (see `carryTopology`): the blobs' outline (its signature, and
 * each edge's ends, middle and whether it runs along the paper's edge), the
 * corners along each blob edge, and the blob edge each of the outline's edges
 * lies along with the shares of its ends. */
export type OutlineFrame = { blobs: string; edges: { from: number; to: number; mid: Point; paper: boolean }[]; corners: number[][]; fine: { E: number; a: number; b: number }[] };

/** Whether an edge runs along the paper's edge. */
const alongPaper = (e: OutlineEdge) => e.points.every(q => q.some(c => Math.abs(c) < 1e-6 || Math.abs(c - 100) < 1e-6));

/** The blobs' outline of a board (see `boardOutline` with no turns). */
export const blobsOf = (board: Ring[]) => boardOutline(board, NO_TURNS);

/** A board's outline's frame (see `OutlineFrame`); none where an edge of it
 * lies along no blob edge. */
export function outlineFrame(board: Ring[]): OutlineFrame | undefined {
	const fine = boardOutline(board), blobs = blobsOf(board), places = fine.edges.map(edge => placeIn(blobs, edge));
	if (places.some(p => !p)) return;
	return { blobs: blobs.sig, edges: blobs.edges.map(e => ({ from: e.from, to: e.to, mid: alongEdge(e, .5), paper: alongPaper(e) })), corners: cornersOf(fine, blobs), fine: places as OutlineFrame['fine'] };
}

/** A recipe drawn on the outline `frame` describes carried to `toBoard`'s, as
 * `transferTopology` carries it. */
export function carryTopology(recipe: TopologyRecipe, frame: OutlineFrame, toBoard: Ring[]): TopologyRecipe | undefined {
	const to = boardOutline(toBoard);
	if (to.sig === recipe.outline) return recipe;
	const blobsTo = blobsOf(toBoard);
	if (frame.blobs !== blobsTo.sig) return;
	// Each blob edge's on the other board: of those between the same vertices (a blob meeting the
	// paper's edge twice has two, its stretch along the edge and the rest), the one along the
	// paper's edge where it is, and the nearest by its middle.
	const middle = (e: OutlineEdge) => alongEdge(e, .5), apart = (p: Point, q: Point) => Math.hypot(p[0] - q[0], p[1] - q[1]);
	const same = frame.edges.map(edge => blobsTo.edges.reduce((best, other, k) => other.from === edge.from && other.to === edge.to
		&& alongPaper(other) === edge.paper && (best < 0 || apart(middle(other), edge.mid) < apart(middle(blobsTo.edges[best]), edge.mid)) ? k : best, -1));
	if (same.some(k => k < 0) || new Set(same).size !== same.length) return;
	const cornersFrom = frame.corners, cornersTo = cornersOf(to, blobsTo);
	const pairs = cornersFrom.map((list, E) => alignCorners(list, cornersTo[same[E]]));
	const fineFrom = frame.fine, fineTo = to.edges.map(edge => placeIn(blobsTo, edge));
	if (fineTo.some(p => !p)) return;
	// A point of the from board's outline: its blob edge and share along it, carried over.
	const carry = (e: number, t: number) => {
		const { E, a, b } = fineFrom[e];
		return { E: same[E], s: mapShare(a + t * (b - a), pairs[E], cornersFrom[E]) };
	};
	// The to board's outline at a blob edge's share: the fine edge it lies on, and how far along.
	const onTo = (E: number, s: number): { e: number; t: number } | undefined => {
		let best: { e: number; t: number; d: number } | undefined;
		fineTo.forEach((f, e) => {
			if (f!.E !== E) return;
			const [lo, hi] = [Math.min(f!.a, f!.b), Math.max(f!.a, f!.b)], d = s < lo ? lo - s : s > hi ? s - hi : 0;
			if (!best || d < best.d) best = { e, t: f!.b === f!.a ? 0 : Math.max(0, Math.min(1, (s - f!.a) / (f!.b - f!.a))), d };
		});
		return best && best.d < 1e-6 ? { e: best.e, t: best.t } : undefined;
	};
	let lost = false;
	const anchor = (an: TopologyAnchor): TopologyAnchor => {
		if (!('e' in an)) return an;
		const { E, s } = carry(an.e, an.t), at = onTo(E, s);
		if (!at) { lost = true; return an; }
		return at;
	};
	const piece = (p: TopologyPiece): TopologyPiece[] => {
		if ('h' in p) return [{ ...p, h: [anchor(p.h[0]), anchor(p.h[1])] }];
		if (!('e' in p)) return [p];
		const start = carry(p.e, p.t[0]), end = carry(p.e, p.t[1]);
		if (start.E !== end.E) { lost = true; return [p]; }
		// The to board's fine edges along the stretch, in its direction; nothing where it shrank to a point.
		const [lo, hi] = [Math.min(start.s, end.s), Math.max(start.s, end.s)], forward = end.s >= start.s, out: (TopologyPiece & { from: number })[] = [];
		if (hi - lo < 1e-9) return [];
		fineTo.forEach((f, e) => {
			if (f!.E !== start.E || f!.a === f!.b) return;
			const a = Math.max(lo, Math.min(f!.a, f!.b)), b = Math.min(hi, Math.max(f!.a, f!.b));
			if (b - a < 1e-9) return;
			const t = (s: number) => (s - f!.a) / (f!.b - f!.a), [s0, s1] = forward ? [a, b] : [b, a];
			out.push({ e, t: [t(s0), t(s1)], from: forward ? a : -b });
		});
		return out.sort((x, y) => x.from - y.from).map(({ from: _from, ...rest }) => rest);
	};
	const slits = (family: TopologyPiece[][]) => family.map(slit => slit.flatMap(piece));
	const A = slits(recipe.A), B = slits(recipe.B);
	return lost ? undefined : { ...recipe, outline: to.sig, A, B };
}
