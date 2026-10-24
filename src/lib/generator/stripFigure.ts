/** The figure formed by the strips themselves, as in a sixth of real figure
 * hearts (the gallery's notched stars, clovers and hearts): a regular board of
 * equal squares whose every square swaps colour inside the motif. The board's
 * lines and the motif's outline are all the visible cuts there are. Every
 * junction and every crossing of the outline with a line then joins four
 * cuts, two in each sheet; which cut lies in which sheet is free inside the
 * motif and is chosen so that every strip still runs from one edge of the
 * paper to the other. Where no such choice exists, a hidden cut shared by both
 * sheets crosses one of the motif's pieces of board: the visible cut beside
 * each of its ends changes sheet there. */
import {
	ConstructionError,
	add,
	area,
	compile,
	inside,
	mix,
	uprightToSheet,
	type Edge,
	type Point,
	type Ring
} from './geometry';
import { gridClearance } from '$lib/geometry/clearance';

type Sheet = 'A' | 'B';
/** A visible piece's sheet, or for a hidden piece whether it is cut in both
 * sheets ('AB') or left whole ('-'). */
export type Value = Sheet | 'AB' | '-';
/** A piece of cut between two vertices: part of a board line, of the motif's
 * outline, or a hidden cut across a face of the board. A line keeps its own
 * sheet where it meets the paper's edge, and away from the motif. */
type Piece = { points: Point[]; from: number; to: number; kind: 'frame' | 'outline' | 'shared'; fixed?: Value; prefer: Value };
type Vertex = { point: Point; pieces: number[] };
type Crossing = { ring: number; segment: number; t: number; point: Point; axis: 0 | 1; line: number };

/** The motif's box, as a fraction of the paper's side, at the default size. */
const DEFAULT_FILL = .62;
/** Points of the cuts closer than this are one point. */
const GAP = 1e-5;
/** The board's lines and the outline's corners and crossings closer than
 * this are moved apart. */
const APART = 1e-4;
/** Hidden cuts leave only sides at least this long. */
const SIDE = .3;
/** The strips per side of the figure in the checks unless the request has a
 * `board`: most real hearts whose strips form the figure have four. */
export const STRIPS = 4;
/** Why no figure in the checks came out: no sheets keep every strip whole. */
export const NO_WHOLE_STRIPS = 'No sheet for every cut keeps the strips whole';
/** The motif keeps this far inside the paper's edges. */
const MARGIN = 3;
/** The paper upright is |x| + |y| ≤ 50√2 about its centre; the motif keeps
 * within |x| + |y| ≤ PAPER. */
const PAPER = (50 - MARGIN) * Math.SQRT2;

export type StripFigure = {
	edges: Edge[];
	artwork: Ring[];
	geometry: ReturnType<typeof compile>;
	domain: Ring[];
	overlapAspectRatio: number;
	/** How far the motif moved down the heart's middle. */
	shift: number;
};

/** The motif (upright, y down) on a board of `strips` strips per sheet, its
 * box `scale / .7` of the default fill of the paper: the first of
 * `stripFigures`. */
export function generateStripFigure(rings: Ring[], strips: number, scale = .7, budget = 4000): StripFigure {
	for (const figure of stripFigures(rings, strips, scale, budget)) return figure;
	throw new ConstructionError('topology', NO_WHOLE_STRIPS);
}

/** The figure in the checks at the places it can go, the best first: the
 * motif moves a little along the heart's middle where its outline keeps
 * clearer of the board's lines. Of the clearest few places, those whose
 * sheets leave the fewest cuts of one sheet too close, then the fewest hidden
 * cuts, come first; the further places follow, should none of those finish.
 * A shift to `keep` comes before them all, or is the only place tried
 * (`alone`), or is left out (`elsewhere`). */
export function* stripFigures(rings: Ring[], strips: number, scale = .7, budget = 4000, keep?: number,
	places: 'first' | 'alone' | 'elsewhere' = 'first', side = 0): Generator<StripFigure> {
	if (!rings.flat().length) throw new ConstructionError('empty', 'No contour');
	rings = untouch(rings);
	type Choice = { placed: Ring[]; graph: StripGraph; values: Value[]; crowded: number; hidden: number; order: number };
	const order = shifts(rings, strips, scale, side), choices: Choice[] = [];
	if (keep !== undefined) order.splice(0, order.length, ...places === 'elsewhere' ? [] : [keep],
		...places === 'alone' ? [] : order.filter(shift => shift !== keep));
	const evaluate = (k: number) => {
		const found: Choice[] = [];
		// A line through a vertex of the outline, or a junction on it, would
		// make one vertex of more than four cuts: move the motif a hair off it.
		for (const nudge of [0, 1e-3, 2.3e-3, 4.1e-3, 7.7e-3]) {
			const placed = placeMotif(rings, scale, order[k], nudge, side);
			const graphs = (['motif', 'near'] as const).map(reach => arrangement(placed, strips, reach));
			if (graphs.some(graph => graph === 'degenerate')) continue;
			for (const graph of graphs as StripGraph[]) {
				const values = solve(graph, budget);
				if (values) found.push({ placed, graph, values, crowded: stripStats.crowded, hidden: stripStats.hidden, order: k });
			}
			break;
		}
		return found;
	};
	let k = 0;
	for (; k < order.length; k++) {
		choices.push(...evaluate(k));
		if (choices.length && (keep !== undefined || k >= 5 || choices.some(c => !c.crowded && c.hidden <= 2))) { k++; break; }
	}
	choices.sort((a, b) => a.crowded - b.crowded || a.hidden - b.hidden || a.order - b.order);
	const figure = (choice: Choice): StripFigure | undefined => {
		const edges = choice.graph.draw(choice.values), artwork = [...choice.placed, ...boardChecks(strips)];
		if (tangled(edges)) return;
		try {
			return { edges, artwork, geometry: compile(edges), domain: [[[0, 0], [100, 0], [100, 100], [0, 100]]], overlapAspectRatio: 1, shift: order[choice.order] };
		} catch (error) {
			if (!(error instanceof ConstructionError)) throw error;
		}
	};
	for (const choice of choices) {
		const result = figure(choice);
		if (result) yield result;
	}
	for (; k < order.length; k++)
		for (const choice of evaluate(k).sort((a, b) => a.crowded - b.crowded || a.hidden - b.hidden)) {
			const result = figure(choice);
			if (result) yield result;
		}
}

/** Whether two cuts of one sheet cross, other than where they meet. */
function tangled(edges: Edge[]): boolean {
	const boxes = edges.map(e => ({ e, x0: Math.min(e.from[0], e.to[0]), x1: Math.max(e.from[0], e.to[0]),
		y0: Math.min(e.from[1], e.to[1]), y1: Math.max(e.from[1], e.to[1]) })).sort((a, b) => a.x0 - b.x0);
	const same = (p: Point, q: Point) => Math.hypot(p[0] - q[0], p[1] - q[1]) < GAP;
	for (let i = 0; i < boxes.length; i++)
		for (let j = i + 1; j < boxes.length && boxes[j].x0 <= boxes[i].x1; j++) {
			const { e: a } = boxes[i], { e: b } = boxes[j];
			if (boxes[j].y0 > boxes[i].y1 || boxes[i].y0 > boxes[j].y1) continue;
			if (a.family !== b.family && a.family !== 'AB' && b.family !== 'AB') continue;
			if ([a.from, a.to].some(p => same(p, b.from) || same(p, b.to))) continue;
			if (crosses(a.from, a.to, b.from, b.to)) return true;
		}
	return false;
}

/** Outlines that touch would meet at a point of more than four cuts. Where
 * two pass through one point, crossing there, each is joined on to the
 * other's way out, which leaves the picture as it was; then one of the two
 * moves off the other there, by a thousandth of the motif's size. A point of
 * one outline on another's side becomes a corner of both first; an outline
 * touches itself only between points far apart along it. */
export function untouch(rings: Ring[]): Ring[] {
	const points = rings.flat(), size = Math.max(...[0, 1].map(axis => Math.max(...points.map(p => p[axis])) - Math.min(...points.map(p => p[axis]))));
	const close = size * 2e-5, cut = size * 1e-3;
	let out = rings.map(ring => ring.map(p => [...p] as Point));
	const near = (p: Point, q: Point) => Math.hypot(p[0] - q[0], p[1] - q[1]) < close;
	// How far apart along ring r two of its corners are, the shorter way, from
	// the lengths along each ring up to each corner.
	let along: number[][] = [];
	const apart = (r: number, i: number, j: number) => {
		const lengths = along[r], forward = Math.abs(lengths[j] - lengths[i]);
		return Math.min(forward, lengths[lengths.length - 1] - forward);
	};
	const boxes = () => out.map(ring => [0, 1].map(axis => [Math.min(...ring.map(p => p[axis])) - close, Math.max(...ring.map(p => p[axis])) + close]));
	const contact = (): [number, number, number, number] | undefined => {
		const box = boxes();
		along = out.map(ring => {
			const lengths = [0];
			for (let k = 0; k < ring.length; k++)
				lengths.push(lengths[k] + Math.hypot(ring[(k + 1) % ring.length][0] - ring[k][0], ring[(k + 1) % ring.length][1] - ring[k][1]));
			return lengths;
		});
		for (let a = 0; a < out.length; a++)
			for (let b = a; b < out.length; b++) {
				if (box[a].some(([lo, hi], axis) => lo > box[b][axis][1] || hi < box[b][axis][0])) continue;
				for (let i = 0; i < out[a].length; i++)
					for (let j = 0; j < out[b].length; j++) {
						const k = (j + 1) % out[b].length, self = a === b;
						if (self && (j === i || apart(a, i, j) < 50 * cut)) continue;
						if ((!self || j > i) && near(out[a][i], out[b][j])) return [a, i, b, j];
						// A corner on the other's side: make it a corner of that side too.
						if (self && (k === i || apart(a, i, k) < 50 * cut)) continue;
						if (!near(out[a][i], out[b][j]) && !near(out[a][i], out[b][k]) && distanceTo(out[a][i], out[b][j], out[b][k]) < close) {
							out[b].splice(j + 1, 0, [...out[a][i]] as Point);
							return contact();
						}
					}
			}
	};
	for (let guard = 0; guard < 64; guard++) {
		const found = contact();
		if (!found) break;
		const [a, , b] = found, [i, j] = a === b && found[3] < found[1] ? [found[3], found[1]] : [found[1], found[3]];
		const p = out[a][i];
		const around = (r: number, k: number) => [out[r][(k - 1 + out[r].length) % out[r].length], out[r][(k + 1) % out[r].length]];
		const [u0, w0] = around(a, i), [u1, w1] = around(b, j);
		const angle = (q: Point) => Math.atan2(q[1] - p[1], q[0] - p[0]);
		const between = (x: number, lo: number, hi: number) => (x - lo + 4 * Math.PI) % (2 * Math.PI) < (hi - lo + 4 * Math.PI) % (2 * Math.PI);
		const crossing = between(angle(u1), angle(u0), angle(w0)) !== between(angle(w1), angle(u0), angle(w0));
		if (crossing) {
			if (a !== b) {
				const joined = [...out[a].slice(0, i + 1), ...out[b].slice(j + 1), ...out[b].slice(0, j + 1), ...out[a].slice(i + 1)];
				out = [...out.filter((_, r) => r !== a && r !== b), joined];
			} else {
				const ring = out[a];
				out = [...out.filter((_, r) => r !== a), ring.slice(i, j), [...ring.slice(0, i), ...ring.slice(j)]];
			}
			continue;
		}
		// Move the second one's point off the first, square to it, to its own side.
		const n: Point = [-(w0[1] - u0[1]), w0[0] - u0[0]], l = Math.hypot(n[0], n[1]) || 1;
		const side = Math.sign(n[0] * ((u1[0] + w1[0]) / 2 - p[0]) + n[1] * ((u1[1] + w1[1]) / 2 - p[1])) || 1;
		out[b][j] = [p[0] + side * cut * n[0] / l, p[1] + side * cut * n[1] / l];
	}
	return out.filter(ring => ring.length >= 3);
}

/** The motif's shifts down the heart's middle, the clearest first. */
export function shifts(rings: Ring[], strips: number, scale: number, side = 0): number[] {
	return Array.from({ length: 27 }, (_, k) => (k % 2 ? 1 : -1) * Math.ceil(k / 2) * .75)
		.map(shift => ({ shift, score: crowding(placeMotif(rings, scale, shift, 0, side), strips) + 1.5 * Math.abs(shift) }))
		.sort((a, b) => a.score - b.score).map(({ shift }) => shift);
}

/** How crowded the board's lines are by the outline, where the paper between
 * them gets narrow: the outline within the cutting clearance of a line, the
 * closer the more, near a junction twice over; much more where it passes near
 * a junction, which crowds two cuts of each sheet, or crosses a line twice in
 * quick succession, leaving a sliver between. */
export function crowding(rings: Ring[], strips: number): number {
	const width = 100 / strips, room = gridClearance(strips) * 1.15;
	let total = 0;
	const junctions: number[] = Array.from({ length: (strips - 1) ** 2 }, () => Infinity);
	for (const ring of rings)
		for (let i = 0; i < ring.length; i++) {
			const a = ring[i], b = ring[(i + 1) % ring.length];
			const length = Math.hypot(b[0] - a[0], b[1] - a[1]), steps = Math.max(1, Math.ceil(length / .25));
			for (let k = 0; k < steps; k++) {
				const p = mix(a, b, (k + .5) / steps);
				for (const v of p) {
					const line = Math.round(v / width);
					if (line > 0 && line < strips && Math.abs(v - line * width) < room) total += (1 - Math.abs(v - line * width) / room) * length / steps;
				}
			}
			for (let x = 1; x < strips; x++)
				for (let y = 1; y < strips; y++) {
					const j = (x - 1) * (strips - 1) + y - 1;
					junctions[j] = Math.min(junctions[j], distanceTo([x * width, y * width], a, b));
				}
		}
	for (const d of junctions) total += 50 * Math.max(0, 1 - d / (2 * room));
	// Crossings of each line in order along it: two close ones with the
	// outline between them on one side enclose a sliver.
	for (const axis of [0, 1])
		for (let line = 1; line < strips; line++) {
			const c = line * width, along: number[] = [];
			for (const ring of rings)
				for (let i = 0; i < ring.length; i++) {
					const a = ring[i], b = ring[(i + 1) % ring.length];
					if ((a[axis] - c) * (b[axis] - c) < 0) along.push(a[1 - axis] + (b[1 - axis] - a[1 - axis]) * (c - a[axis]) / (b[axis] - a[axis]));
				}
			along.sort((u, v) => u - v);
			for (let k = 1; k < along.length; k++) total += 20 * Math.max(0, 1 - (along[k] - along[k - 1]) / (3 * room));
		}
	return total;
}

/** The cuts' graph: board lines and outline split at junctions, crossings
 * and the ends of the hidden cuts that may cross the motif's pieces of board;
 * `exclusive` pairs hidden cuts that would cross or crowd each other, and
 * `crowdedOnly` says which of those only crowd. */
export type StripGraph = {
	vertices: Vertex[];
	pieces: Piece[];
	exclusive: [number, number][];
	crowdedOnly: boolean[];
	/** Whether a hidden cut was left out only for coming too close. */
	crowdedLeftOut: boolean;
	loops: { pieces: number[]; not: Sheet[] }[];
	/** Pieces that had better not share a sheet. */
	apart: [number, number][];
	draw: (values: Value[]) => Edge[];
};

/** The motif's box, and how far the motif reaches from the box's centre, in
 * boxes, towards the paper's lower sides (`down`) and upper sides (`up`): of
 * size s and moved t down the heart's middle, it fits while
 * s · down ≤ PAPER − t and s · up ≤ PAPER + t. */
function reaches(rings: Ring[]) {
	const points = rings.flat(), xs = points.map(p => p[0]), ys = points.map(p => p[1]);
	const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
	const box = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
	// Towards each side of the paper's diamond: lower right, lower left,
	// upper right, upper left.
	let rd = 0, ld = 0, ru = 0, lu = 0;
	for (const [x, y] of points) {
		const u = (x - cx) / box, v = (y - cy) / box;
		[rd, ld, ru, lu] = [Math.max(rd, u + v), Math.max(ld, v - u), Math.max(ru, u - v), Math.max(lu, -u - v)];
	}
	return { cx, cy, box, rd, ld, ru, lu, down: Math.max(rd, ld), up: Math.max(ru, lu) };
}

/** How large the motif can be moved `shift` down the heart's middle and
 * `side` across it (see `reaches`). */
function fits({ rd, ld, ru, lu }: ReturnType<typeof reaches>, shift: number, side: number): number {
	return Math.min((PAPER - side - shift) / rd, (PAPER + side - shift) / ld, (PAPER - side + shift) / ru, (PAPER + side + shift) / lu);
}

/** How far down the heart's middle the motif fits largest. */
export function roomiestPlace(rings: Ring[]): number {
	const { down, up } = reaches(rings);
	return PAPER * (up - down) / (up + down);
}

/** Where the motif lies at `scale`, its default size having put it at
 * `place`: there up to the default size, and above it sliding towards where it
 * fits largest, which 100% reaches. */
export function slidePlace(rings: Ring[], scale: number, place: number): number {
	return scale > .7 ? place + (roomiestPlace(rings) - place) * Math.min(1, (scale - .7) / .3) : place;
}

/** The board's dark squares, every other one: with the motif, whose squares
 * they swap, the picture's rings. */
export function boardChecks(strips: number): Ring[] {
	const width = 100 / strips, checks: Ring[] = [];
	for (let i = 0; i < strips; i++)
		for (let j = 0; j < strips; j++)
			if ((i + j) % 2 === 0)
				checks.push([[i * width, j * width], [(i + 1) * width, j * width], [(i + 1) * width, (j + 1) * width], [i * width, (j + 1) * width]]);
	return checks;
}

/** The motif upright on the paper, moved `shift` down the heart's middle,
 * `side` across it and `nudge` off the board's lines, and kept MARGIN inside
 * the paper. Its box is `scale / .7` of the default fill up to the default
 * size; from there it grows towards the largest that fits the paper, which
 * 100% reaches at the roomiest place. */
export function placeMotif(rings: Ring[], scale: number, shift = 0, nudge = 0, side = 0): Ring[] {
	const reach = reaches(rings), { cx, cy, box } = reach;
	const size = Math.min(motifSize(reach, scale), fits(reach, shift, side));
	return rings.map(ring => ring.map(([x, y]) =>
		uprightToSheet([(x - cx) / box * size + side + nudge, (y - cy) / box * size + shift + nudge * .618])));
}

/** The motif's box at `scale` wherever it has room (see `placeMotif`). */
function motifSize({ down, up }: ReturnType<typeof reaches>, scale: number): number {
	const fill = 100 * DEFAULT_FILL, largest = 2 * PAPER / (up + down);
	return scale <= .7 ? fill * scale / .7 : fill + (largest - fill) * Math.min(1, (scale - .7) / .3);
}

/** Where the motif can go at `scale` and keep its size; further, it would
 * shrink to stay on the paper. On the paper the bounds are a rectangle: of
 * its place and side added (along the paper's x) and of its place less its
 * side (along the paper's y). */
export type PlaceBounds = { sum: [number, number]; difference: [number, number] };
export function placeBounds(rings: Ring[], scale: number): PlaceBounds {
	const reach = reaches(rings), size = motifSize(reach, scale);
	return { sum: [size * reach.lu - PAPER, PAPER - size * reach.rd], difference: [size * reach.ru - PAPER, PAPER - size * reach.ld] };
}

/** The nearest place and side within the bounds; with a `step`, in steps
 * along the paper's sides wherever the bounds have room for one. */
export function clampPlace({ sum, difference }: PlaceBounds, place: number, side: number, step = 0): [number, number] {
	const near = (value: number, [low, high]: [number, number]) => {
		const [a, b] = step ? [Math.ceil(low / step) * step, Math.floor(high / step) * step] : [low, high];
		return a <= b ? Math.max(a, Math.min(b, step ? Math.round(value / step) * step : value)) : (low + high) / 2;
	};
	const a = near(place + side, sum), b = near(place - side, difference);
	return [(a + b) / 2, (a - b) / 2];
}

/** A polyline cut at fractions (increasing, in (0, 1)) of its length. */
function cutAt(points: Point[], fractions: number[]): { parts: Point[][]; marks: Point[] } {
	const lengths = [0];
	for (let i = 1; i < points.length; i++)
		lengths.push(lengths[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]));
	const total = lengths.at(-1)!, parts: Point[][] = [], marks: Point[] = [];
	let current: Point[] = [points[0]], i = 1;
	const push = (p: Point) => { const last = current.at(-1)!; if (last[0] !== p[0] || last[1] !== p[1]) current.push(p); };
	for (const f of fractions) {
		const target = f * total;
		while (i < points.length - 1 && lengths[i] < target) push(points[i++]);
		let mark = mix(points[i - 1], points[i], (target - lengths[i - 1]) / (lengths[i] - lengths[i - 1]));
		// A mark on a corner of the polyline is that corner: the cut's
		// geometry tells points apart only to a millionth.
		for (const corner of [points[i - 1], points[i]])
			if (Math.hypot(mark[0] - corner[0], mark[1] - corner[1]) < GAP) mark = corner;
		push(mark);
		parts.push(current);
		marks.push(mark);
		current = [mark];
	}
	while (i < points.length) push(points[i++]);
	parts.push(current);
	return { parts, marks };
}

/** Whether segments ab and cd cross other than where one ends on the other. */
function crosses(a: Point, b: Point, c: Point, d: Point): boolean {
	const side = (p: Point, q: Point, r: Point) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
	return side(c, d, a) * side(c, d, b) < 0 && side(a, b, c) * side(a, b, d) < 0;
}
/** Where two outlines come nearest each other, as fractions of the way along
 * each from its first point; with `apart`, away from those ends, by a quarter
 * of the way round the first and a fifth of the way along the second, round
 * it too if it closes. */
function closest(a: Point[], b: Point[], apart?: [number, number]): [number, number] {
	const closed = (pts: Point[]) => pts[0][0] === pts.at(-1)![0] && pts[0][1] === pts.at(-1)![1];
	const along = (p: number, q: number, round: boolean) => round ? Math.min(Math.abs(p - q), 1 - Math.abs(p - q)) : Math.abs(p - q);
	const [ra, rb] = [closed(a), closed(b)];
	const lengths = (pts: Point[]) => {
		const out = [0];
		for (let k = 1; k < pts.length; k++) out.push(out[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
		return out;
	};
	const [la, lb] = [lengths(a), lengths(b)];
	let best = Infinity, ends: [number, number] = [0, 0];
	// Each corner of one against every side of the other, both ways round.
	for (const [from, to, lf, lt, swap] of [[a, b, la, lb, false], [b, a, lb, la, true]] as const)
		for (let i = 0; i < from.length; i++)
			for (let k = 1; k < to.length; k++) {
				const d = distanceTo(from[i], to[k - 1], to[k]);
				if (d >= best) continue;
				const dx = to[k][0] - to[k - 1][0], dy = to[k][1] - to[k - 1][1], l = dx * dx + dy * dy;
				const t = l ? Math.max(0, Math.min(1, ((from[i][0] - to[k - 1][0]) * dx + (from[i][1] - to[k - 1][1]) * dy) / l)) : 0;
				const u = lf[i] / lf.at(-1)!, v = (lt[k - 1] + t * (lt[k] - lt[k - 1])) / lt.at(-1)!;
				const [x, y] = swap ? [v, u] : [u, v];
				if (apart && (along(x, apart[0], ra) < .25 || along(y, apart[1], rb) < .2)) continue;
				[best, ends] = [d, [x, y]];
			}
	return ends;
}

/** The distance from p to the segment ab. */
function distanceTo(p: Point, a: Point, b: Point): number {
	const dx = b[0] - a[0], dy = b[1] - a[1], l = dx * dx + dy * dy;
	const t = l ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l)) : 0;
	return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

/** `reach` 'motif': hidden cuts only inside the motif and around islands in
 * it, the board keeping its own sheets outside; 'near': in every face of a
 * cell the motif touches, whose lines may then change sheet. */
export function arrangement(rings: Ring[], strips: number, reach: 'motif' | 'near' = 'motif'): StripGraph | 'degenerate' {
	const width = 100 / strips, lines = Array.from({ length: strips - 1 }, (_, k) => (k + 1) * width);
	const motif = (p: Point) => rings.reduce((odd, ring) => odd !== inside(p, ring), false);
	const cellOf = (p: Point) => `${Math.min(strips - 1, Math.floor(p[0] / width))},${Math.min(strips - 1, Math.floor(p[1] / width))}`;
	// Where the outline crosses the board's lines.
	const crossings: Crossing[] = [];
	for (const [r, ring] of rings.entries())
		for (let i = 0; i < ring.length; i++) {
			const p = ring[i], q = ring[(i + 1) % ring.length];
			for (const axis of [0, 1] as const)
				for (const [line, c] of lines.entries()) {
					if (Math.abs(p[axis] - c) < APART) return 'degenerate';
					if ((p[axis] - c) * (q[axis] - c) >= 0) continue;
					const t = (c - p[axis]) / (q[axis] - p[axis]), point = mix(p, q, t);
					point[axis] = c;
					crossings.push({ ring: r, segment: i, t, point, axis, line });
				}
		}
	const vertices: Vertex[] = [];
	const vertex = (point: Point) => vertices.push({ point, pieces: [] }) - 1;
	const junctions = lines.map(x => lines.map(y => vertex([x, y])));
	const at = crossings.map(c => vertex(c.point));
	// The visible cuts between vertices, before hidden cuts split them. A
	// line's segment keeps its own sheet where it meets the paper's edge, and
	// everywhere unless a hidden cut may leave it. An island, an outline
	// crossing no line, is one closed segment.
	type Segment = {
		points: Point[]; from: number; to: number; kind: 'frame' | 'outline';
		own?: Sheet; edge?: 'from' | 'to'; motif?: boolean; cell?: string; closed?: boolean;
	};
	const segments: Segment[] = [];
	// Each line's segments in order along it, for the cells' sides.
	const runs: { s0: number; s1: number; index: number }[][][] = [[], []];
	// The board's lines, cut where they meet each other and the outline. A line
	// of sheet A runs from top to bottom (constant x), one of sheet B across.
	for (const axis of [0, 1] as const)
		for (const [k, c] of lines.entries()) {
			const along = 1 - axis, stops: { s: number; id: number }[] = [
				{ s: 0, id: vertex(axis ? [0, c] : [c, 0]) },
				{ s: 100, id: vertex(axis ? [100, c] : [c, 100]) },
				...lines.map((s, m) => ({ s, id: axis ? junctions[m][k] : junctions[k][m] })),
				...crossings.flatMap((cr, i) => cr.axis === axis && cr.line === k ? [{ s: cr.point[along], id: at[i] }] : [])
			].sort((a, b) => a.s - b.s);
			runs[axis][k] = [];
			for (let i = 1; i < stops.length; i++) {
				if (stops[i].s - stops[i - 1].s < APART) return 'degenerate';
				const a = vertices[stops[i - 1].id].point, b = vertices[stops[i].id].point;
				runs[axis][k].push({ s0: stops[i - 1].s, s1: stops[i].s, index: segments.length });
				segments.push({ points: [a, b], from: stops[i - 1].id, to: stops[i].id, kind: 'frame', own: axis ? 'B' : 'A',
					edge: i === 1 ? 'from' : i === stops.length - 1 ? 'to' : undefined, motif: motif(mix(a, b, .5)) });
			}
		}
	// The outline between consecutive crossings, each arc inside one cell.
	const islands: number[] = [];
	for (const [r, ring] of rings.entries()) {
		const own = crossings.map((c, i) => ({ c, i })).filter(({ c }) => c.ring === r)
			.sort((a, b) => a.c.segment - b.c.segment || a.c.t - b.c.t);
		if (!own.length) {
			islands.push(segments.push({ points: [...ring, ring[0]], from: -1, to: -1, kind: 'outline', cell: cellOf(ring[0]), closed: true }) - 1);
			continue;
		}
		for (let k = 0; k < own.length; k++) {
			// Forward along the ring from one crossing to the next, through the
			// ring's vertices between them (all of them when the next lies
			// behind on the same segment).
			const a = own[k], b = own[(k + 1) % own.length], path: Point[] = [a.c.point];
			let count = (b.c.segment - a.c.segment + ring.length) % ring.length;
			if (!count && b.c.t <= a.c.t) count = ring.length;
			for (let j = 1; j <= count; j++) path.push(ring[(a.c.segment + j) % ring.length]);
			path.push(b.c.point);
			segments.push({ points: path, from: at[a.i], to: at[b.i], kind: 'outline', cell: cellOf(mix(path[0], path[1], .5)) });
		}
	}
	// The faces of every cell: its sides, cut where the outline meets them,
	// joined by the outline's arcs across the cell, each traced with the face
	// on its right; islands are holes in the face around them, and faces too.
	type Entry = { segment: number; forward: boolean };
	type Face = { cell: string; entries: (Entry | undefined)[]; outline: Point[]; holes: number[]; island?: number };
	const arcs = new Map<string, number>();
	for (const [i, s] of segments.entries())
		if (s.kind === 'outline' && !s.closed) for (const v of [s.from, s.to]) arcs.set(`${v}:${s.cell}`, i);
	const start = (e: Entry) => e.forward ? segments[e.segment].from : segments[e.segment].to;
	const end = (e: Entry) => e.forward ? segments[e.segment].to : segments[e.segment].from;
	const points = (e: Entry) => e.forward ? segments[e.segment].points : [...segments[e.segment].points].reverse();
	const faces: Face[] = [];
	for (let i = 0; i < strips; i++)
		for (let j = 0; j < strips; j++) {
			const cell = `${i},${j}`, items: (Entry | Point[])[] = [];
			// A side on line k (axis 0: x = const), between lo and hi along it;
			// the paper's edge, from corner to corner, where there is no line.
			const side = (axis: 0 | 1, k: number, lo: number, hi: number, forward: boolean, corners: Point[]) => {
				if (k < 0 || k >= lines.length) return items.push(corners);
				const run = runs[axis][k].filter(e => e.s0 > lo - GAP && e.s1 < hi + GAP).map(e => ({ segment: e.index, forward }));
				items.push(...(forward ? run : run.reverse()));
			};
			const x0 = i * width, x1 = (i + 1) * width, y0 = j * width, y1 = (j + 1) * width;
			side(1, j - 1, x0, x1, true, [[x0, y0], [x1, y0]]);
			side(0, i, y0, y1, true, [[x1, y0], [x1, y1]]);
			side(1, j, x0, x1, false, [[x1, y1], [x0, y1]]);
			side(0, i - 1, y0, y1, false, [[x0, y1], [x0, y0]]);
			const used = new Set<number>();
			for (let first = 0; first < items.length; first++) {
				if (used.has(first)) continue;
				const entries: (Entry | undefined)[] = [], outline: Point[] = [];
				let b = first, steps = 0;
				do {
					// Arcs that do not close up a face: the outline touches a line.
					if (b < 0 || ++steps > 4 * items.length) return 'degenerate';
					used.add(b);
					const item = items[b];
					if (Array.isArray(item)) { entries.push(undefined); outline.push(...item); b = (b + 1) % items.length; continue; }
					entries.push(item);
					outline.push(...points(item));
					const arc = arcs.get(`${end(item)}:${cell}`);
					if (arc === undefined) { b = (b + 1) % items.length; continue; }
					const forward = segments[arc].from === end(item), e = { segment: arc, forward };
					entries.push(e);
					outline.push(...points(e));
					b = items.findIndex(x => !Array.isArray(x) && start(x) === end(e));
				} while (b !== first);
				faces.push({ cell, entries, outline, holes: [] });
			}
		}
	// An island is a hole in the innermost face around it: an island around it
	// in the same cell, else a face of the cell.
	for (const r of islands) faces.push({ cell: segments[r].cell!, entries: [], outline: segments[r].points, holes: [], island: r });
	for (const r of islands) {
		const p = segments[r].points[0];
		const around = faces.filter(f => f.cell === segments[r].cell && f.island !== r && inside(p, f.outline));
		const inner = around.filter(f => f.island !== undefined);
		const host = inner.length ? inner.reduce((a, b) => Math.abs(area(a.outline)) < Math.abs(area(b.outline)) ? a : b) : around[0];
		if (!host) throw new ConstructionError('topology', 'An island lies in no face');
		host.holes.push(r);
	}
	// Candidate hidden cuts across every face of a cell the motif touches:
	// between two of its sides that do not meet, from a side to an island
	// and between two islands, each straight and clear of the face's other
	// cuts. Those leaving one side are spread along it in the order of their
	// other ends.
	const touched = new Set(segments.filter(s => s.kind === 'outline' || s.motif).map(s => s.cell ?? ''));
	for (const s of segments) if (s.kind === 'frame' && s.motif) {
		const m = mix(s.points[0], s.points.at(-1)!, .5);
		for (const dx of [-GAP, GAP]) for (const dy of [-GAP, GAP]) touched.add(cellOf([m[0] + dx, m[1] + dy]));
	}
	type Attach = { segment: number; key: number; chord: number };
	const attaches: Attach[] = [];
	const chords: { face: number; ends: [number, number] }[] = [];
	const nearest = (segment: number, target: Point) => {
		const pts = segments[segment].points;
		let best = 0, length = 0, total = 0, closest = Infinity;
		for (let k = 1; k < pts.length; k++) total += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]);
		for (let k = 1; k < pts.length; k++) {
			const l = Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]);
			const d = distanceTo(target, pts[k - 1], pts[k]);
			if (d < closest) {
				const dx = pts[k][0] - pts[k - 1][0], dy = pts[k][1] - pts[k - 1][1];
				const t = l ? Math.max(0, Math.min(1, ((target[0] - pts[k - 1][0]) * dx + (target[1] - pts[k - 1][1]) * dy) / (l * l))) : 0;
				closest = d;
				best = (length + t * l) / total;
			}
			length += l;
		}
		return best;
	};
	const centre = (segment: number) => {
		const pts = segments[segment].points;
		return [pts.reduce((a, p) => a + p[0], 0) / pts.length, pts.reduce((a, p) => a + p[1], 0) / pts.length] as Point;
	};
	const long = (segment: number) => {
		const pts = segments[segment].points;
		let length = 0;
		for (let k = 1; k < pts.length && length < SIDE; k++) length += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]);
		return length >= SIDE;
	};
	const inMotif = (face: Face) => face.entries.every(e => e && (segments[e.segment].kind === 'outline' || segments[e.segment].motif))
		&& (face.island === undefined || motif(mix(segments[face.island].points[0], centre(face.island), 1e-3)));
	const candidate = faces.map(face => reach === 'near'
		? touched.has(face.cell) || face.island !== undefined || face.holes.length > 0
		: face.entries.length ? inMotif(face) : face.holes.length > 0);
	for (const [f, face] of faces.entries()) {
		if (!candidate[f]) continue;
		const m = face.entries.length;
		const chord = (a: Attach, b: Attach) => {
			if (!long(a.segment) || !long(b.segment)) return;
			chords.push({ face: f, ends: [attaches.length, attaches.length + 1] });
			attaches.push(a, b);
		};
		// Between sides: spread along each side in the order of the other ends.
		for (let i = 0; i < m; i++)
			for (let j = i + 2; j < m; j++) {
				const a = face.entries[i], b = face.entries[j];
				if (!a || !b || (i === 0 && j === m - 1)) continue;
				const key = (e: Entry, k: number) => { const u = ((m - 2 - k) + .5) / (m - 3); return e.forward ? u : 1 - u; };
				chord({ segment: a.segment, key: key(a, j - i), chord: chords.length }, { segment: b.segment, key: key(b, m - (j - i)), chord: chords.length });
			}
		const holes = face.island === undefined ? face.holes : [face.island, ...face.holes];
		for (const [k, r] of holes.entries()) {
			if (face.island === undefined || k) for (const e of face.entries) if (e) {
				const mid = mix(segments[e.segment].points[0], segments[e.segment].points.at(-1)!, .5);
				chord({ segment: e.segment, key: nearest(e.segment, centre(r)), chord: chords.length }, { segment: r, key: nearest(r, mid), chord: chords.length });
			}
			for (const q of holes.slice(k + 1))
				chord({ segment: r, key: nearest(r, centre(q)), chord: chords.length }, { segment: q, key: nearest(q, centre(r)), chord: chords.length });
		}
	}
	// Lines bounding a face of a touched cell may change sheet when reaching near.
	const near = new Set(faces.flatMap((face, f) => candidate[f] ? face.entries.flatMap(e => e ? [e.segment] : []) : []));
	// Where on its segment each candidate leaves: open segments spread their
	// candidates evenly in order; islands keep theirs where they point.
	const spot = attaches.map(() => 0);
	for (const [s, segment] of segments.entries()) {
		const here = attaches.map((a, i) => ({ a, i })).filter(({ a }) => a.segment === s).sort((x, y) => x.a.key - y.a.key);
		here.forEach(({ a, i }, k) => spot[i] = segment.closed ? (a.key + k * 1e-3) % 1 : (k + 1) / (here.length + 1));
	}
	const pointAt = (segment: number, f: number): Point => cutAt(segments[segment].points, [f]).marks[0];
	const route = chords.map(c => c.ends.map(e => pointAt(attaches[e].segment, spot[e])) as [Point, Point]);
	// A hidden cut must stay inside its face, clear of the face's cuts.
	const room = gridClearance(strips) * 1.15;
	const walls = faces.map(f => [...f.entries.flatMap(e => e ? [e.segment] : []), ...f.holes]);
	// The direction of a segment where a point lies on it.
	const along = (segment: number, x: Point): Point => {
		const pts = segments[segment].points;
		let best = Infinity, direction: Point = [1, 0];
		for (let k = 1; k < pts.length; k++) {
			const d = distanceTo(x, pts[k - 1], pts[k]), l = Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]);
			if (d < best && l) { best = d; direction = [(pts[k][0] - pts[k - 1][0]) / l, (pts[k][1] - pts[k - 1][1]) / l]; }
		}
		return direction;
	};
	const clear = (c: number, [a, b]: [Point, Point] = route[c]) => {
		const face = faces[chords[c].face], mid = mix(a, b, .5);
		if (!inside(mid, face.outline) || face.holes.some(r => inside(mid, segments[r].points))) return false;
		// It leaves each side at 60° to 120°, so that neither sheet's cut
		// turns onto it more sharply.
		const l = Math.hypot(b[0] - a[0], b[1] - a[1]), ends = chords[c].ends.map(e => attaches[e].segment);
		for (const [e, x] of [[chords[c].ends[0], a], [chords[c].ends[1], b]] as const) {
			const t = along(attaches[e].segment, x);
			if (Math.abs(t[0] * (b[0] - a[0]) + t[1] * (b[1] - a[1])) > .5 * l) return false;
		}
		// Clear of the face's other cuts all along, and of those it leaves at
		// its middle. Its ends lie on the cuts it leaves, to rounding. Where
		// crowded hidden cuts are allowed, a tenth of the room will do.
		const [p, q] = [mix(a, b, 1e-4), mix(a, b, 1 - 1e-4)], samples = [.1, .2, .3, .4, .5, .6, .7, .8, .9].map(t => mix(a, b, t));
		const within = (space: number) => walls[chords[c].face].some(segment => {
			const line = segments[segment].points, own = ends.includes(segment);
			for (let k = 1; k < line.length; k++)
				if (own ? distanceTo(mid, line[k - 1], line[k]) < Math.min(space, .4 * l) : samples.some(x => distanceTo(x, line[k - 1], line[k]) < space)) return true;
			return false;
		});
		for (const segment of walls[chords[c].face]) {
			const line = segments[segment].points;
			for (let k = 1; k < line.length; k++) if (crosses(p, q, line[k - 1], line[k])) return false;
		}
		if (!within(room)) return true;
		if (!within(room / 10)) crowdedOnly ||= !crowdedHiddenCuts;
		return crowdedHiddenCuts && !within(room / 10);
	};
	// Whether a hidden cut was left out only for coming too close, which
	// crowded hidden cuts allow (see `withCrowdedHiddenCuts`).
	let crowdedOnly = false;
	const kept = chords.map((_, c) => clear(c));
	// An island needs two hidden cuts, between which its outline changes
	// sheet. One these leave short of that, such as a letter's counter inside
	// its stroke, may also be reached the shortest ways from the sides and
	// islands of its face, once where they come nearest and once elsewhere,
	// those cuts' ends staying where they point.
	const cutsTo = (r: number) => chords.filter((c, k) => kept[k] && c.ends.some(e => attaches[e].segment === r)).length;
	if (islands.some(r => cutsTo(r) < 2))
		for (const [f, face] of faces.entries()) {
			if (!candidate[f]) continue;
			const holes = face.island === undefined ? face.holes : [face.island, ...face.holes];
			const sides = face.entries.flatMap(e => e && long(e.segment) ? [e.segment] : []);
			for (const [k, r] of holes.entries())
				for (const q of [...sides, ...holes.slice(k + 1)]) {
					if (cutsTo(r) >= 2 && (sides.includes(q) || cutsTo(q) >= 2)) continue;
					const first = closest(segments[r].points, segments[q].points);
					for (const ends of [first, closest(segments[r].points, segments[q].points, first)]) {
						const c = chords.length;
						chords.push({ face: f, ends: [attaches.length, attaches.length + 1] });
						for (const [s, key] of [[r, ends[0]], [q, ends[1]]] as const) {
							// Clear of the side's ends and of the other cuts leaving it.
							let at = segments[s].closed ? key : Math.max(.05, Math.min(.95, key));
							while (attaches.some((a, i) => a.segment === s && Math.abs(spot[i] - at) < 1e-3)) at = (at + 2e-3) % 1;
							spot.push(at);
							attaches.push({ segment: s, key, chord: c });
						}
						route.push([pointAt(r, spot.at(-2)!), pointAt(q, spot.at(-1)!)]);
						kept.push(clear(c));
					}
				}
		}
	const crowded = ([p, q]: [Point, Point], [r, t]: [Point, Point]) =>
		crosses(p, q, r, t) || [0, .1, .2, .3, .4, .5, .6, .7, .8, .9, 1].some(u => distanceTo(mix(p, q, u), r, t) < room || distanceTo(mix(r, t, u), p, q) < room);
	// Hidden cuts across one face that would cross or crowd each other.
	const exclusive: [number, number][] = [], crowdedPairs: boolean[] = [];
	for (let a = 0; a < chords.length; a++)
		for (let b = a + 1; b < chords.length; b++) {
			if (!kept[a] || !kept[b] || chords[a].face !== chords[b].face) continue;
			if (crowded(route[a], route[b])) {
				exclusive.push([a, b]);
				crowdedPairs.push(!crosses(...route[a], ...route[b]));
			}
		}
	// Split the visible cuts where hidden cuts may leave them; a segment no
	// hidden cut leaves keeps its line's own sheet outside the motif.
	const pieces: Piece[] = [];
	const piece = (p: Piece) => {
		const index = pieces.push(p) - 1;
		vertices[p.from].pieces.push(index);
		vertices[p.to].pieces.push(index);
		return index;
	};
	const switches = attaches.map(() => -1), parts: number[][] = segments.map(() => []);
	for (const [s, segment] of segments.entries()) {
		const here = attaches.map((a, i) => ({ a, i })).filter(({ a }) => a.segment === s && kept[a.chord]).sort((x, y) => spot[x.i] - spot[y.i]);
		const { parts: lines, marks } = cutAt(segment.points, here.map(({ i }) => spot[i]));
		const ids = marks.map(mark => vertex(mark));
		here.forEach(({ i }, k) => switches[i] = ids[k]);
		const lone = !here.length && !segment.motif && segment.kind === 'frame' && !(reach === 'near' && near.has(s));
		const prefer: Sheet = segment.kind === 'outline' ? 'A' : segment.motif ? (segment.own === 'A' ? 'B' : 'A') : segment.own!;
		if (segment.closed) {
			// Around the island from its first mark back to it.
			if (!ids.length) {
				const v = vertex(segment.points[0]);
				parts[s].push(piece({ points: segment.points, from: v, to: v, kind: 'outline', prefer }));
				continue;
			}
			for (let k = 1; k < lines.length - 1; k++) parts[s].push(piece({ points: lines[k], from: ids[k - 1], to: ids[k], kind: 'outline', prefer }));
			parts[s].push(piece({ points: [...lines.at(-1)!, ...lines[0].slice(1)], from: ids.at(-1)!, to: ids[0], kind: 'outline', prefer }));
			continue;
		}
		const stops = [segment.from, ...ids, segment.to];
		lines.forEach((points, k) => parts[s].push(piece({
			points, from: stops[k], to: stops[k + 1], kind: segment.kind, prefer,
			fixed: lone || (segment.edge === 'from' && k === 0) || (segment.edge === 'to' && k === lines.length - 1) ? segment.own : undefined
		})));
	}
	// No face may be closed by cuts of one sheet, nor a strip turn back
	// round one: its sides between two meetings with the paper's edge.
	const loops: { pieces: number[]; not: Sheet[] }[] = [];
	for (const face of faces) {
		const sides: number[][] = [[]];
		const ring = face.island === undefined ? face.entries : [{ segment: face.island, forward: true }];
		for (const e of ring) {
			if (!e) { sides.push([]); continue; }
			const own = parts[e.segment];
			sides.at(-1)!.push(...(e.forward ? own : [...own].reverse()));
		}
		if (sides.length > 1) { sides[0] = [...sides.pop()!, ...sides[0]]; }
		for (const side of sides) {
			if (!side.length || side.every(q => pieces[q].fixed)) continue;
			if (sides.length === 1) { loops.push({ pieces: side, not: ['A', 'B'] }); continue; }
			const ends = [pieces[side[0]], pieces[side.at(-1)!]].map(p => [vertices[p.from].point, vertices[p.to].point].find(q => q.some(v => v === 0 || v === 100)));
			if (ends.some(q => !q)) continue;
			const [a, b] = ends as Point[], top = (q: Point) => q[1] === 0 ? 't' : q[1] === 100 ? 'b' : q[0] === 0 ? 'l' : 'r';
			if (top(a) === top(b)) loops.push({ pieces: side, not: ['A', 'B'] });
			else if (top(a) + top(b) === 'tb' || top(a) + top(b) === 'bt') loops.push({ pieces: side, not: ['B'] });
			else if (top(a) + top(b) === 'lr' || top(a) + top(b) === 'rl') loops.push({ pieces: side, not: ['A'] });
		}
	}
	const hidden = chords.map((c, k) => kept[k] ? piece({
		points: route[k], from: switches[c.ends[0]], to: switches[c.ends[1]], kind: 'shared', prefer: '-'
	}) : -1);
	// Cuts of one sheet keep the cutting clearance apart, or the paper between
	// them is too narrow to cut. Pieces leaving a vertex at under 60°, or
	// running close elsewhere, had better lie in different sheets (a hidden
	// cut, in both, had better be left out): the search counts the pairs that
	// do not. Pieces of one line or outline follow on from each other.
	const origin = pieces.map(() => -1), apart = new Map<string, [number, number]>();
	parts.forEach((list, s) => list.forEach(q => origin[q] = s));
	const pair = (p: number, q: number) => {
		if (p !== q && !(pieces[p].fixed && pieces[q].fixed) && !(origin[p] >= 0 && origin[p] === origin[q]))
			apart.set(`${Math.min(p, q)},${Math.max(p, q)}`, [p, q]);
	};
	const heading = (q: number, v: number): Point => {
		const pts = pieces[q].points;
		// Two hidden cuts leaving one corner of a small counter cut its outline
		// to a single point there, which heads nowhere.
		if (pts.length < 2) return [0, 0];
		const [a, b] = pieces[q].from === v ? [pts[0], pts[1]] : [pts.at(-1)!, pts.at(-2)!];
		const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
		return [(b[0] - a[0]) / l, (b[1] - a[1]) / l];
	};
	for (const [vi, v] of vertices.entries())
		for (let i = 0; i < v.pieces.length; i++)
			for (let j = i + 1; j < v.pieces.length; j++) {
				const [a, b] = [heading(v.pieces[i], vi), heading(v.pieces[j], vi)];
				if (a[0] * b[0] + a[1] * b[1] > .5) pair(v.pieces[i], v.pieces[j]);
			}
	// Points along each piece, every half unit, with how far along they are.
	const samples = pieces.map(p => {
		const out: { x: Point; s: number }[] = [];
		let s = 0;
		for (let k = 1; k < p.points.length; k++) {
			const a = p.points[k - 1], b = p.points[k], l = Math.hypot(b[0] - a[0], b[1] - a[1]), steps = Math.max(1, Math.ceil(l / .5));
			for (let t = 0; t < steps; t++) out.push({ x: mix(a, b, t / steps), s: s + l * t / steps });
			s += l;
		}
		out.push({ x: p.points.at(-1)!, s });
		return out;
	});
	const boxes = pieces.map(p => [0, 1].map(axis => [Math.min(...p.points.map(x => x[axis])), Math.max(...p.points.map(x => x[axis]))]));
	for (let p = 0; p < pieces.length; p++)
		for (let q = p + 1; q < pieces.length; q++) {
			if (boxes[p].some(([lo, hi], axis) => lo > boxes[q][axis][1] + room || hi < boxes[q][axis][0] - room)) continue;
			// Pieces meeting at a vertex are one cut there if they share a
			// sheet: narrow where they come close after running apart along it
			// for twice the clearance, as the cutting check measures.
			const meets = [pieces[p].from, pieces[p].to].filter(v => v === pieces[q].from || v === pieces[q].to);
			const far = (a: { s: number }, b: { s: number }) => meets.every(v => {
				const from = (r: number, x: { s: number }) => pieces[r].from === v ? x.s : samples[r].at(-1)!.s - x.s;
				return from(p, a) + from(q, b) >= 2 * room;
			});
			if (samples[p].some(a => samples[q].some(b => far(a, b) && Math.hypot(a.x[0] - b.x[0], a.x[1] - b.x[1]) < room))) pair(p, q);
		}
	// The cuts of a solution. The hidden cuts it keeps are spread evenly along
	// the sides they leave, unless that brings one too close to a cut.
	const draw = (values: Value[]): Edge[] => {
		const present = chords.map((_, k) => kept[k] && values[hidden[k]] === 'AB');
		const moved = spot.slice();
		for (const [s, segment] of segments.entries()) {
			if (segment.closed) continue;
			const here = attaches.map((a, i) => ({ a, i })).filter(({ a }) => a.segment === s && present[a.chord]).sort((x, y) => spot[x.i] - spot[y.i]);
			here.forEach(({ i }, k) => moved[i] = (k + 1) / (here.length + 1));
		}
		const paths = chords.map((c, k) => present[k] ? c.ends.map(e => pointAt(attaches[e].segment, moved[e])) as [Point, Point] : route[k]);
		const spread = paths.every((path, k) => !present[k] || clear(k, path))
			&& paths.every((path, a) => !present[a] || paths.every((other, b) => b <= a || !present[b] || chords[a].face !== chords[b].face || !crowded(path, other)));
		const edges: Edge[] = [];
		for (const [s, segment] of segments.entries()) {
			const subs = parts[s];
			if (segment.closed || !spread) {
				for (const q of subs) add(edges, pieces[q].points, values[q] as Sheet, segment.kind);
				continue;
			}
			// Runs of one sheet between the hidden cuts that leave this side.
			const here = attaches.map((a, i) => ({ a, i })).filter(({ a }) => a.segment === s && kept[a.chord]).sort((x, y) => spot[x.i] - spot[y.i]);
			const cuts = here.flatMap(({ a, i }, k) => present[a.chord] ? [{ i, k }] : []);
			const { parts: lines } = cutAt(segment.points, cuts.map(({ i }) => moved[i]));
			lines.forEach((points, r) => add(edges, points, values[subs[r ? cuts[r - 1].k + 1 : 0]] as Sheet, segment.kind));
		}
		for (const [k, path] of paths.entries()) if (present[k]) add(edges, spread ? path : route[k], 'AB', 'shared');
		return edges;
	};
	return { vertices, pieces, exclusive: exclusive.map(([a, b]) => [hidden[a], hidden[b]]), crowdedOnly: crowdedPairs,
		crowdedLeftOut: crowdedOnly, loops, apart: [...apart.values()], draw };
}

/** Whether two hidden cuts across one face that come too close, without
 * crossing, may both be cut, counted among the crowded pairs: only once a
 * request has been refused without it, so that every heart built without it
 * keeps its cuts, and the letters or motif are hard to cut rather than
 * refused. */
let crowdedHiddenCuts = false, setAside = 0;
/** How many searches without it failed where it could have helped: a request
 * that failed none would fail the same way again. */
export const crowdedHiddenCutsSetAside = () => setAside;
export function withCrowdedHiddenCuts<T>(build: () => T): T {
	const before = crowdedHiddenCuts;
	crowdedHiddenCuts = true;
	try {
		return build();
	} finally {
		crowdedHiddenCuts = before;
	}
}

/** What the last `solve` did: strips learned, crowded pairs and hidden cuts
 * left, searches run, and how it ended. */
export const stripStats = { learned: 0, hidden: 0, crowded: 0, steps: 0, end: '' };
/** A value for every piece: two of each sheet at every vertex where four
 * visible cuts meet, a hidden cut wherever a visible one changes sheet, and
 * every strip running from edge to edge. The vertices' rules are clauses for
 * a conflict-learning search; a strip that closes on itself in a full choice
 * becomes one more clause. Each answer is then bettered by asking for fewer
 * crowded pairs of cuts, then fewer hidden cuts, while the search finds one
 * in its budget. */
export function solve(graph: StripGraph, budget: number): Value[] | undefined {
	const { vertices, pieces } = graph;
	Object.assign(stripStats, { learned: 0, hidden: 0, crowded: 0, steps: 0, end: '' });
	// Literal 2q: piece q in sheet A, or cut when hidden; 2q + 1: the opposite.
	const hidden = (q: number) => pieces[q].kind === 'shared';
	const clauses: number[][] = [];
	for (const [q, p] of pieces.entries()) if (p.fixed) clauses.push([2 * q + (p.fixed === 'A' || p.fixed === 'AB' ? 0 : 1)]);
	for (const v of vertices) {
		if (v.pieces.length === 4) {
			// Two of each sheet: no three alike.
			const [a, b, c, d] = v.pieces;
			for (const [x, y, z] of [[a, b, c], [a, b, d], [a, c, d], [b, c, d]])
				clauses.push([2 * x + 1, 2 * y + 1, 2 * z + 1], [2 * x, 2 * y, 2 * z]);
		} else if (v.pieces.length === 3) {
			// A hidden cut leaves exactly where the visible cut changes sheet.
			const c = v.pieces.find(hidden)!, [h, k] = v.pieces.filter(q => q !== c);
			clauses.push([2 * c + 1, 2 * h, 2 * k], [2 * c + 1, 2 * h + 1, 2 * k + 1], [2 * c, 2 * h + 1, 2 * k], [2 * c, 2 * h, 2 * k + 1]);
		}
	}
	const soft = crowdedHiddenCuts ? graph.exclusive.filter((_, k) => graph.crowdedOnly[k]) : [];
	for (const [k, [a, b]] of graph.exclusive.entries())
		if (!crowdedHiddenCuts || !graph.crowdedOnly[k]) clauses.push([2 * a + 1, 2 * b + 1]);
	for (const loop of graph.loops)
		for (const sheet of loop.not) {
			if (loop.pieces.some(q => pieces[q].fixed && pieces[q].fixed !== sheet)) continue;
			clauses.push(loop.pieces.filter(q => !pieces[q].fixed).map(q => 2 * q + (sheet === 'A' ? 1 : 0)));
		}
	// Every cut of a sheet carries its number, the k-th line's from the paper's
	// edge, through every vertex it passes: a strip's edge cannot turn back,
	// since it would join two numbers. Variable: the number at each vertex.
	const lanes = (['A', 'B'] as const).map(family => {
		const axis = family === 'A' ? 1 : 0;
		return vertices.flatMap((v, i) => v.pieces.length === 1 && (v.point[axis] === 0 || v.point[axis] === 100) && pieces[v.pieces[0]].fixed === family ? [i] : [])
			.filter(i => vertices[i].point[axis] === 0).map(i => vertices[i].point[1 - axis]).sort((a, b) => a - b);
	});
	const numbers = lanes[0].length, numbered = (f: number, v: number, c: number) => 2 * (pieces.length + (f * vertices.length + v) * numbers + c);
	const member = (f: number, q: number) => hidden(q) ? 2 * q : 2 * q + f;
	for (const f of [0, 1]) {
		const axis = f ? 0 : 1;
		for (const [q, p] of pieces.entries())
			if (p.from !== p.to)
				for (let c = 0; c < numbers; c++)
					clauses.push([member(f, q) ^ 1, numbered(f, p.from, c) ^ 1, numbered(f, p.to, c)], [member(f, q) ^ 1, numbered(f, p.from, c), numbered(f, p.to, c) ^ 1]);
		for (const [i, v] of vertices.entries()) {
			for (let c = 0; c < numbers; c++) for (let d = c + 1; d < numbers; d++) clauses.push([numbered(f, i, c) ^ 1, numbered(f, i, d) ^ 1]);
			const all = Array.from({ length: numbers }, (_, c) => numbered(f, i, c));
			for (const q of v.pieces) clauses.push([member(f, q) ^ 1, ...all]);
			if (v.pieces.length === 1 && (v.point[axis] === 0 || v.point[axis] === 100)) {
				const c = lanes[f].findIndex(x => Math.abs(x - v.point[1 - axis]) < GAP);
				if (c >= 0) clauses.push([numbered(f, i, c)]);
			}
		}
	}
	// Pieces that had better not share a sheet do, or a hidden cut among them
	// is cut, only where a relaxing variable allows it.
	const relaxed = graph.apart.map((_, k) => 2 * (pieces.length + 2 * vertices.length * numbers + k));
	for (const [k, [p, q]] of graph.apart.entries()) {
		if (hidden(p) || hidden(q)) clauses.push([...[p, q].filter(hidden).map(x => 2 * x + 1), relaxed[k]]);
		else clauses.push([2 * p, 2 * q, relaxed[k]], [2 * p + 1, 2 * q + 1, relaxed[k]]);
	}
	const after = pieces.length + 2 * vertices.length * numbers + graph.apart.length;
	const crowding = soft.map((_, k) => 2 * (after + k));
	for (const [k, [a, b]] of soft.entries()) clauses.push([2 * a + 1, 2 * b + 1, crowding[k]]);
	const variables = after + soft.length;
	// First tries: a line keeps its own sheet outside the motif and turns to
	// the other inside it, where the strips of each sheet run along the other
	// sheet's lines; hidden cuts are left out.
	const phase = pieces.map(p => p.prefer === 'A' || p.prefer === 'AB');
	const values = (bits: boolean[]): Value[] => pieces.map((p, q) => hidden(q) ? bits[q] ? 'AB' : '-' : bits[q] ? 'A' : 'B');
	const learned: number[][] = [];
	const check = (bits: boolean[]) => {
		const bad = brokenStrip(vertices, pieces, values(bits));
		if (!bad) return undefined;
		stripStats.learned++;
		const clause = bad.map(q => 2 * q + (bits[q] ? 1 : 0));
		learned.push(clause);
		return clause;
	};
	// Fewest crowded pairs first, then fewest hidden cuts: a search between
	// the most an answer has and the least none could be found below.
	const objectives = [[...relaxed, ...crowding], pieces.flatMap((p, q) => hidden(q) ? [2 * q] : [])];
	const kept: number[] = [];
	const holds = (bits: boolean[], literals: number[]) => literals.filter(l => bits[l >> 1]).length;
	const attempt = (bounds: number[], limit: number) => {
		let base = variables, extra: number[][] = [];
		for (const [k, bound] of bounds.entries()) {
			extra = extra.concat(atMost(objectives[k], bound, base));
			base += objectives[k].length * bound;
		}
		stripStats.steps++;
		return search(base, clauses.concat(learned, extra), phase, check, limit);
	};
	const first = attempt([], budget);
	if (!first || first === 'budget') {
		stripStats.end = first ?? 'exhausted';
		if (!crowdedHiddenCuts && (graph.crowdedOnly.includes(true) || graph.crowdedLeftOut)) setAside++;
		return undefined;
	}
	let best = first;
	for (const literals of objectives) {
		let low = 0, high = holds(best, literals);
		while (low < high) {
			const middle = Math.floor((low + high) / 2), found = attempt([...kept, middle], budget / 4);
			if (found && found !== 'budget') { best = found; high = holds(best, literals); }
			else low = middle + 1;
		}
		kept.push(high);
	}
	stripStats.end = 'fewest found';
	stripStats.crowded = kept[0];
	stripStats.hidden = kept[1];
	return values(best);
}

/** Clauses letting at most `k` of `literals` hold: a sequential counter on
 * the variables from `base` on (Sinz, 2005). */
function atMost(literals: number[], k: number, base: number): number[][] {
	if (!k) return literals.map(l => [l ^ 1]);
	const count = (i: number, j: number) => 2 * (base + i * k + j);
	const clauses: number[][] = [[literals[0] ^ 1, count(0, 0)]];
	for (let j = 1; j < k; j++) clauses.push([count(0, j) ^ 1]);
	for (let i = 1; i < literals.length; i++) {
		const x = literals[i];
		clauses.push([x ^ 1, count(i, 0)], [count(i - 1, 0) ^ 1, count(i, 0)]);
		for (let j = 1; j < k; j++) clauses.push([x ^ 1, count(i - 1, j - 1) ^ 1, count(i, j)], [count(i - 1, j) ^ 1, count(i, j)]);
		clauses.push([x ^ 1, count(i - 1, k - 1) ^ 1]);
	}
	return clauses;
}

/** A conflict-learning satisfiability search over `count` variables
 * (literal 2v: v true, 2v + 1: v false) that asks `check` about every full
 * assignment for one more clause it breaks, if any. Undefined when no
 * assignment satisfies them all, 'budget' after `budget` conflicts. */
function search(count: number, initial: number[][], phase: boolean[], check: (bits: boolean[]) => number[] | undefined, budget: number): boolean[] | undefined | 'budget' {
	const value = new Int8Array(count), level = new Int32Array(count), reason = new Int32Array(count).fill(-1);
	const activity = new Float64Array(count), saved = phase.slice(), mark = new Uint8Array(count);
	const db: number[][] = [], watches: number[][] = Array.from({ length: 2 * count }, () => []);
	const trail: number[] = [], limits: number[] = [];
	let head = 0, bump = 1;
	// Open variables by activity, most active (then lowest) first.
	const heap: number[] = [], position = new Int32Array(count).fill(-1);
	const before = (a: number, b: number) => activity[a] > activity[b] || activity[a] === activity[b] && a < b;
	const up = (i: number) => {
		const v = heap[i];
		for (let parent = (i - 1) >> 1; i > 0 && before(v, heap[parent]); i = parent, parent = (i - 1) >> 1) {
			heap[i] = heap[parent];
			position[heap[i]] = i;
		}
		heap[i] = v;
		position[v] = i;
	};
	const down = (i: number) => {
		const v = heap[i];
		for (let child = 2 * i + 1; child < heap.length; child = 2 * i + 1) {
			if (child + 1 < heap.length && before(heap[child + 1], heap[child])) child++;
			if (!before(heap[child], v)) break;
			heap[i] = heap[child];
			position[heap[i]] = i;
			i = child;
		}
		heap[i] = v;
		position[v] = i;
	};
	const insert = (v: number) => {
		if (position[v] >= 0) return;
		position[v] = heap.length;
		heap.push(v);
		up(heap.length - 1);
	};
	for (let v = 0; v < count; v++) insert(v);
	const truth = (l: number) => (l & 1 ? -value[l >> 1] : value[l >> 1]);
	const assign = (l: number, from: number) => {
		value[l >> 1] = l & 1 ? -1 : 1;
		level[l >> 1] = limits.length;
		reason[l >> 1] = from;
		trail.push(l);
	};
	const undo = (to: number) => {
		while (limits.length > to) {
			const stop = limits.pop()!;
			while (trail.length > stop) {
				const l = trail.pop()!;
				saved[l >> 1] = !(l & 1);
				value[l >> 1] = 0;
				reason[l >> 1] = -1;
				insert(l >> 1);
			}
		}
		head = Math.min(head, trail.length);
	};
	const store = (clause: number[]) => {
		const index = db.push(clause) - 1;
		if (clause.length > 1) { watches[clause[0]].push(index); watches[clause[1]].push(index); }
		return index;
	};
	// Unit propagation with two watched literals; the conflicting clause, if any.
	const propagate = (): number => {
		while (head < trail.length) {
			const off = trail[head++] ^ 1, list = watches[off];
			let i = 0, j = 0;
			while (i < list.length) {
				const ci = list[i++], c = db[ci];
				if (c[0] === off) { c[0] = c[1]; c[1] = off; }
				if (truth(c[0]) === 1) { list[j++] = ci; continue; }
				let moved = false;
				for (let k = 2; k < c.length; k++)
					if (truth(c[k]) !== -1) { c[1] = c[k]; c[k] = off; watches[c[1]].push(ci); moved = true; break; }
				if (moved) continue;
				list[j++] = ci;
				if (truth(c[0]) === -1) {
					while (i < list.length) list[j++] = list[i++];
					list.length = j;
					return ci;
				}
				assign(c[0], ci);
			}
			list.length = j;
		}
		return -1;
	};
	// The first unique implication point's clause, and the level to go back to.
	const analyze = (conflict: number): { learnt: number[]; back: number } => {
		const learnt = [-1];
		let open = 0, p = -1, index = trail.length - 1, c = conflict;
		do {
			const clause = db[c];
			for (let k = p < 0 ? 0 : 1; k < clause.length; k++) {
				const v = clause[k] >> 1;
				if (mark[v] || !level[v]) continue;
				mark[v] = 1;
				activity[v] += bump;
				if (position[v] >= 0) up(position[v]);
				if (level[v] === limits.length) open++;
				else learnt.push(clause[k]);
			}
			while (!mark[trail[index] >> 1]) index--;
			p = trail[index--];
			c = reason[p >> 1];
			mark[p >> 1] = 0;
			open--;
		} while (open > 0);
		learnt[0] = p ^ 1;
		let back = 0, at = 1;
		for (let k = 1; k < learnt.length; k++) {
			mark[learnt[k] >> 1] = 0;
			if (level[learnt[k] >> 1] > back) { back = level[learnt[k] >> 1]; at = k; }
		}
		if (learnt.length > 1) [learnt[1], learnt[at]] = [learnt[at], learnt[1]];
		bump *= 1.05;
		if (bump > 1e100) {
			for (let v = 0; v < count; v++) activity[v] *= 1e-100;
			bump *= 1e-100;
		}
		return { learnt, back };
	};
	// Learn from a conflicting clause and go back; false when nothing can.
	const resolve = (conflict: number): boolean => {
		const top = Math.max(...db[conflict].map(l => level[l >> 1]));
		if (!top) return false;
		undo(top);
		const { learnt, back } = analyze(conflict);
		undo(back);
		assign(learnt[0], store(learnt));
		return true;
	};
	for (const clause of initial) {
		if (!clause.length) return undefined;
		if (clause.length === 1) {
			if (truth(clause[0]) === -1) return undefined;
			if (!truth(clause[0])) assign(clause[0], store(clause));
		} else store(clause);
	}
	let conflicts = 0, restart = 64;
	for (;;) {
		const conflict = propagate();
		if (conflict >= 0) {
			if (++conflicts > budget) return 'budget';
			if (!resolve(conflict)) return undefined;
			continue;
		}
		if (conflicts >= restart) { restart = conflicts + 64 + restart / 2; undo(0); continue; }
		let pick = -1;
		while (heap.length && pick < 0) {
			const top = heap[0], last = heap.pop()!;
			position[top] = -1;
			if (heap.length) {
				heap[0] = last;
				position[last] = 0;
				down(0);
			}
			if (!value[top]) pick = top;
		}
		if (pick >= 0) {
			limits.push(trail.length);
			assign(2 * pick + (saved[pick] ? 0 : 1), -1);
			continue;
		}
		const broken = check(Array.from(value, x => x > 0));
		if (!broken) return Array.from(value, x => x > 0);
		if (!broken.length) return undefined;
		if (++conflicts > budget) return 'budget';
		const index = store([...broken].sort((a, b) => level[b >> 1] - level[a >> 1]));
		if (!resolve(index)) return undefined;
	}
}

/** The free pieces of a strip's edge that turns back to the paper edge it
 * left, or closes on itself, if any: a whole connected run of one sheet's
 * cuts, which no other choice elsewhere can mend. A hidden cut belongs to
 * both sheets. */
export function brokenStrip(vertices: Vertex[], pieces: Piece[], value: Value[]): number[] | undefined {
	for (const family of ['A', 'B'] as const) {
		const axis = family === 'A' ? 1 : 0, seen = new Uint8Array(pieces.length);
		const member = (q: number) => value[q] === family || value[q] === 'AB';
		for (let i = 0; i < pieces.length; i++) {
			if (!member(i) || seen[i]) continue;
			const run: number[] = [], stack = [i], ends: number[] = [];
			seen[i] = 1;
			while (stack.length) {
				const p = stack.pop()!;
				run.push(p);
				for (const v of [pieces[p].from, pieces[p].to]) {
					const here = vertices[v].pieces.filter(member);
					if (here.length === 1) ends.push(v);
					for (const q of here) if (!seen[q]) { seen[q] = 1; stack.push(q); }
				}
			}
			const sides = ends.map(v => vertices[v].point[axis]);
			if (ends.length !== 2 || !sides.includes(0) || !sides.includes(100)) return run.filter(q => !pieces[q].fixed);
		}
	}
	return undefined;
}
