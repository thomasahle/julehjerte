/**
 * Small moves of a construction's straight cuts that keep its weave: a switch
 * (where one paper's outline gives way to the other's and a shared cut leaves,
 * a point of an A edge, a B edge and an AB one) slid along its outline, the
 * edges it passes changing paper; a shared cut bent, or its bend moved,
 * across its course, or straightened, or laid along a circle the picture shows
 * elsewhere. Each returns the edges anew, or nothing where the move
 * does not fit (a switch slid past another, or off its outline's end); the
 * construction's own checks (`compile`, the cut audit, the editor's) judge the
 * rest.
 */
import type { Edge, Point } from './geometry';

const key = (p: Point) => `${p[0].toFixed(6)},${p[1].toFixed(6)}`;
const same = (p: Point, q: Point) => key(p) === key(q);
const length = (e: Edge) => Math.hypot(e.to[0] - e.from[0], e.to[1] - e.from[1]);

/** The edges at each point. */
function incidence(edges: Edge[]): Map<string, number[]> {
	const at = new Map<string, number[]>();
	edges.forEach((e, i) => {
		for (const p of [e.from, e.to]) {
			const k = key(p);
			if (!at.has(k)) at.set(k, []);
			at.get(k)!.push(i);
		}
	});
	return at;
}

/** Whether the edges at a point make a switch: an outline edge of each paper and a shared cut. */
function isSwitch(edges: Edge[], ids: number[]) {
	if (ids.length !== 3) return false;
	const kinds = ids.map(i => edges[i]!.family).sort().join(' ');
	return kinds === 'A AB B' && ids.filter(i => edges[i]!.kind === 'outline').length === 2;
}

/** The switches of a construction's edges. */
export function switchesOf(edges: Edge[]): Point[] {
	const at = incidence(edges), found: Point[] = [];
	for (const [, ids] of at) if (isSwitch(edges, ids)) {
		const e = edges[ids.find(i => edges[i]!.family === 'AB')!]!;
		found.push(at.get(key(e.from)) === ids ? e.from : e.to);
	}
	return found;
}

/** The shared cuts' straight pieces, as their ends. */
export function sharedPieces(edges: Edge[]): [Point, Point][] {
	return edges.filter(e => e.family === 'AB').map(e => [e.from, e.to]);
}

/**
 * The switch at `at` slid `by` along its outline: towards its A edge where
 * `by` is positive (the A outline it passes becomes B), towards its B edge
 * where negative. Along that paper's outline only through points where it
 * runs on alone (two edges of it, nothing else), so never past another switch
 * or a corner where cuts meet.
 */
export function slideSwitch(edges: Edge[], at: Point, by: number): Edge[] | undefined {
	const near = incidence(edges), ids = near.get(key(at));
	if (!ids || !isSwitch(edges, ids) || !by) return;
	const towards = by > 0 ? 'A' : 'B', other = by > 0 ? 'B' : 'A';
	const out = edges.map(e => ({ ...e }));
	const shared = ids.find(i => edges[i]!.family === 'AB')!;
	let left = Math.abs(by), point = at, edge = ids.find(i => edges[i]!.family === towards)!;
	for (;;) {
		const e = edges[edge]!, far = same(e.from, point) ? e.to : e.from, l = length(e);
		if (l > left + 1e-9) {
			// The new switch on this edge: the stretch behind it changes paper.
			const t = left / l, p: Point = [point[0] + (far[0] - point[0]) * t, point[1] + (far[1] - point[1]) * t];
			out[edge] = { from: p, to: far, family: towards, kind: 'outline' };
			out.push({ from: point, to: p, family: other, kind: 'outline' });
			const s = out[shared]!;
			out[shared] = same(s.from, at) ? { ...s, from: p } : { ...s, to: p };
			return out;
		}
		// Past this edge: it changes paper, if its paper runs on alone beyond it.
		const next = near.get(key(far))!.filter(i => i !== edge);
		if (next.length !== 1 || edges[next[0]!]!.family !== towards || edges[next[0]!]!.kind !== 'outline') return;
		out[edge] = { ...e, family: other };
		left -= l;
		point = far;
		edge = next[0]!;
	}
}

/** The least turn, in degrees, that makes a vertex of an outline a corner (see `slideToCorner`). */
const CORNER_TURN = 30;

/**
 * The switch at `at` slid along the outline of paper `towards` to that
 * outline's next corner (where it turns by more than CORNER_TURN: a blob's
 * corner on a board, a motif's tip or notch), and put on it: the outline it
 * passes changes paper, as in `slideSwitch`, so the other paper's line, which
 * came along it to the switch, now cuts it on to the corner, and `towards`'
 * line runs from the corner straight on into the shared cut, where it turned
 * back on itself at the switch. With the edges, the corner. None where the
 * outline meets another cut before a corner, or runs farther than `reach`.
 * A frame's own lines are outlines here: on a board the switch slides along
 * the circle to where it meets a line of the grid.
 */
export function slideToCorner(edges: Edge[], at: Point, towards: 'A' | 'B', reach = Infinity): { edges: Edge[]; to: Point } | undefined {
	const near = incidence(edges), ids = near.get(key(at));
	// A switch on the motif's outline or on the frame's own lines (a board's circle).
	if (!ids || ids.length !== 3 || ids.map(i => edges[i]!.family).sort().join(' ') !== 'A AB B') return;
	const other = towards === 'A' ? 'B' : 'A', out = edges.map(e => ({ ...e }));
	const shared = ids.find(i => edges[i]!.family === 'AB')!;
	let gone = 0, point = at, edge = ids.find(i => edges[i]!.family === towards)!;
	for (;;) {
		const e = edges[edge]!, far = same(e.from, point) ? e.to : e.from;
		gone += length(e);
		if (gone > reach) return;
		const next = near.get(key(far))!.filter(i => i !== edge);
		if (next.length !== 1 || edges[next[0]!]!.family !== towards) return;
		out[edge] = { ...e, family: other };
		const n = edges[next[0]!]!, on = same(n.from, far) ? n.to : n.from;
		const u = [far[0] - point[0], far[1] - point[1]], v = [on[0] - far[0], on[1] - far[1]];
		const turn = Math.abs(Math.atan2(u[0] * v[1] - u[1] * v[0], u[0] * v[0] + u[1] * v[1])) * 180 / Math.PI;
		if (turn > CORNER_TURN) {
			const s = out[shared]!;
			out[shared] = same(s.from, at) ? { ...s, from: far } : { ...s, to: far };
			return { edges: out, to: far };
		}
		point = far;
		edge = next[0]!;
	}
}

/** A construction's shared cuts, each from end to end through its bends (two
 * shared pieces meeting and nothing else): its points in order. */
export function sharedCuts(edges: Edge[]): Point[][] {
	const near = incidence(edges), bend = (p: Point) => { const ids = near.get(key(p))!; return ids.length === 2 && ids.every(i => edges[i]!.family === 'AB'); };
	const used = new Set<number>(), cuts: Point[][] = [];
	edges.forEach((first, i) => {
		if (first.family !== 'AB' || used.has(i)) return;
		// From this piece both ways to the cut's ends.
		const walk = (at: Point): Point[] => {
			const points = [at];
			let last = i, here = at;
			while (bend(here)) {
				const next = near.get(key(here))!.find(j => j !== last)!;
				if (used.has(next)) break;
				used.add(next);
				const e = edges[next]!;
				here = same(e.from, here) ? e.to : e.from;
				points.push(here);
				last = next;
			}
			return points;
		};
		used.add(i);
		cuts.push([...walk(first.from).reverse(), ...walk(first.to)]);
	});
	return cuts;
}

/** The shared cut through `points` (see `sharedCuts`) drawn anew, straight
 * from `from` to `to`: its pieces gone, one in their place. */
export function redrawShared(edges: Edge[], points: Point[], from: Point, to: Point): Edge[] | undefined {
	if (same(from, to)) return;
	const piece = (e: Edge) => e.family === 'AB' && points.some((p, k) => k + 1 < points.length
		&& ((same(e.from, p) && same(e.to, points[k + 1]!)) || (same(e.to, p) && same(e.from, points[k + 1]!))));
	const first = edges.find(piece);
	return first && [...edges.filter(e => !piece(e)), { ...first, from, to }];
}

/**
 * The shared cut's straight piece from `from` to `to` bent `by` to its left
 * (a new point at its middle, moved across it); where `from` is already a bend
 * of it (two shared pieces meeting and nothing else), that bend moved instead.
 */
export function bendShared(edges: Edge[], from: Point, to: Point, by: number): Edge[] | undefined {
	const i = edges.findIndex(e => e.family === 'AB' && ((same(e.from, from) && same(e.to, to)) || (same(e.from, to) && same(e.to, from))));
	if (i < 0 || !by) return;
	const d = [to[0] - from[0], to[1] - from[1]], l = Math.hypot(d[0], d[1]);
	if (!l) return;
	const n: Point = [-d[1] / l * by, d[0] / l * by];
	const bend = incidence(edges).get(key(from))!;
	if (bend.length === 2 && bend.every(j => edges[j]!.family === 'AB')) {
		const p: Point = [from[0] + n[0], from[1] + n[1]];
		return edges.map(e => e.family !== 'AB' ? e : same(e.from, from) ? { ...e, from: p } : same(e.to, from) ? { ...e, to: p } : e);
	}
	const mid: Point = [(from[0] + to[0]) / 2 + n[0], (from[1] + to[1]) / 2 + n[1]], e = edges[i]!;
	return [...edges.slice(0, i), { ...e, to: mid, from: e.from }, { ...e, from: mid, to: e.to }, ...edges.slice(i + 1)];
}

/** The bend of a shared cut at `at` (two shared pieces meeting and nothing
 * else) straightened: one piece between their far ends. */
export function straightenShared(edges: Edge[], at: Point): Edge[] | undefined {
	const ids = incidence(edges).get(key(at));
	if (!ids || ids.length !== 2 || !ids.every(i => edges[i]!.family === 'AB')) return;
	const [a, b] = ids.map(i => edges[i]!) as [Edge, Edge];
	const from = same(a.to, at) ? a.from : a.to, to = same(b.from, at) ? b.to : b.from;
	if (same(from, to)) return;
	return [...edges.filter((_, i) => i !== ids[0] && i !== ids[1]), { ...a, from, to }];
}

/** How near the circle, in the sheet's units, a shared piece's ends lie to be laid along it (see `followArc`). */
const ON_CIRCLE = .05;

/** The shared cut's straight piece from `from` to `to`, both ends on the
 * circle about `centre` of `radius`, laid along the circle between them the
 * shorter way round, in pieces of at most `step` radians: a hidden cut along a
 * stretch of a line the picture shows elsewhere, which looks better than one
 * across it. */
export function followArc(edges: Edge[], from: Point, to: Point, centre: Point, radius: number, step = Math.PI / 60): Edge[] | undefined {
	const i = edges.findIndex(e => e.family === 'AB' && ((same(e.from, from) && same(e.to, to)) || (same(e.from, to) && same(e.to, from))));
	if (i < 0) return;
	const e = edges[i]!, angle = (p: Point) => Math.atan2(p[1] - centre[1], p[0] - centre[0]);
	if ([e.from, e.to].some(p => Math.abs(Math.hypot(p[0] - centre[0], p[1] - centre[1]) - radius) > ON_CIRCLE)) return;
	const a = angle(e.from);
	let d = angle(e.to) - a;
	while (d > Math.PI) d -= 2 * Math.PI;
	while (d < -Math.PI) d += 2 * Math.PI;
	const n = Math.ceil(Math.abs(d) / step);
	if (n < 2) return;
	const points: Point[] = [e.from, ...Array.from({ length: n - 1 }, (_, k): Point => {
		const t = a + d * (k + 1) / n;
		return [centre[0] + radius * Math.cos(t), centre[1] + radius * Math.sin(t)];
	}), e.to];
	return [...edges.slice(0, i), ...points.slice(1).map((p, k) => ({ ...e, from: points[k]!, to: p })), ...edges.slice(i + 1)];
}
