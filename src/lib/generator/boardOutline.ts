/**
 * A board's outline as its picture shows it: where the colour changes, the
 * sides that cancel even–odd (a check and its part inside the circle, two
 * checks of one colour side by side) left out. As a graph: its vertices are
 * where three or more pieces of it meet, where it meets the paper's edge, or
 * where it turns more than `CORNER_TURN`; its edges the stretches between
 * them. A lens the circle cuts into a check as it passes a line leaves the
 * graph as it was (the check's edge just follows the circle there), so two
 * pictures with the same graph are one topology for the stored cuts (see
 * `recipes`), whatever their rings.
 *
 * Vertices and edges are numbered by the graph itself, so that the numbers
 * hold while the circle grows and the outline keeps its shape: from the
 * leftmost vertex on the paper's top edge (or the topmost, where none is
 * there), breadth first, each vertex's edges taken round it clockwise from
 * the one it was reached by. A closed stretch with no vertex (a circle
 * crossing nothing) starts at its topmost point.
 */
import type { Point, Ring } from './geometry';

/** The least turn, in degrees, that makes a point of the outline a vertex (as `recipes`' corners). */
const TURN = 20;
const EPS = 1e-7;

export type OutlineEdge = { from: number; to: number; points: Point[]; cum: number[] };
export type BoardOutline = { vertices: Point[]; edges: OutlineEdge[]; sig: string; pieces: [Point, Point][] };

function inside(p: Point, ring: Ring) {
	let c = false;
	for (let i = 0, j = ring.length - 1; i < ring.length; j = i++)
		if ((ring[i][1] > p[1]) !== (ring[j][1] > p[1]) && p[0] < (ring[j][0] - ring[i][0]) * (p[1] - ring[i][1]) / (ring[j][1] - ring[i][1]) + ring[i][0]) c = !c;
	return c;
}
const colourAt = (p: Point, rings: Ring[]) => rings.reduce((v, ring) => v ^ Number(inside(p, ring)), 0);

/** The pieces of the rings' sides the colour changes across: every side split
 * where another crosses or overlaps it, each piece once. */
export function outlinePieces(rings: Ring[]): [Point, Point][] {
	const sides = rings.flatMap(r => r.map((a, i): [Point, Point] => [a, r[(i + 1) % r.length]])).filter(([a, b]) => Math.hypot(b[0] - a[0], b[1] - a[1]) > EPS);
	const box = sides.map(([a, b]) => [Math.min(a[0], b[0]), Math.max(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[1], b[1])]);
	const pieces: [Point, Point][] = [], seen = new Set<string>();
	const key = (p: Point) => `${p[0].toFixed(6)},${p[1].toFixed(6)}`;
	sides.forEach(([a, b], s) => {
		const d = [b[0] - a[0], b[1] - a[1]], l2 = d[0] * d[0] + d[1] * d[1], ts = [0, 1], [x0, x1, y0, y1] = box[s];
		sides.forEach(([c, e], o) => {
			const [u0, u1, v0, v1] = box[o];
			if (o === s || u1 < x0 - EPS || u0 > x1 + EPS || v1 < y0 - EPS || v0 > y1 + EPS) return;
			const f = [e[0] - c[0], e[1] - c[1]], den = d[0] * f[1] - d[1] * f[0];
			if (Math.abs(den) > 1e-12) {
				const t = ((c[0] - a[0]) * f[1] - (c[1] - a[1]) * f[0]) / den, u = ((c[0] - a[0]) * d[1] - (c[1] - a[1]) * d[0]) / den;
				if (t > EPS && t < 1 - EPS && u > -EPS && u < 1 + EPS) ts.push(t);
			} else if (Math.abs((c[0] - a[0]) * d[1] - (c[1] - a[1]) * d[0]) / Math.sqrt(l2) < EPS)
				for (const q of [c, e]) {
					const t = ((q[0] - a[0]) * d[0] + (q[1] - a[1]) * d[1]) / l2;
					if (t > EPS && t < 1 - EPS) ts.push(t);
				}
		});
		ts.sort((x, y) => x - y);
		for (let k = 1; k < ts.length; k++) {
			if (ts[k] - ts[k - 1] < EPS) continue;
			const p: Point = [a[0] + ts[k - 1] * d[0], a[1] + ts[k - 1] * d[1]], q: Point = [a[0] + ts[k] * d[0], a[1] + ts[k] * d[1]];
			const m: Point = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2], l = Math.hypot(q[0] - p[0], q[1] - p[1]), n = [-(q[1] - p[1]) / l * 1e-4, (q[0] - p[0]) / l * 1e-4];
			if (colourAt([m[0] + n[0], m[1] + n[1]], rings) === colourAt([m[0] - n[0], m[1] - n[1]], rings)) continue;
			const id = [key(p), key(q)].sort().join('|');
			if (!seen.has(id)) { seen.add(id); pieces.push([p, q]); }
		}
	});
	return pieces;
}


/** The board's outline as a graph (see the module's comment). */
export function boardOutline(board: Ring[]): BoardOutline {
	const pieces = outlinePieces(board), key = (p: Point) => `${p[0].toFixed(5)},${p[1].toFixed(5)}`;
	const nodes = new Map<string, { p: Point; to: Point[] }>();
	for (const [p, q] of pieces) for (const [u, v] of [[p, q], [q, p]]) {
		const k = key(u);
		if (!nodes.has(k)) nodes.set(k, { p: u, to: [] });
		nodes.get(k)!.to.push(v);
	}
	const turn = (n: { p: Point; to: Point[] }) => {
		const [a, b] = n.to, u = [n.p[0] - a[0], n.p[1] - a[1]], v = [b[0] - n.p[0], b[1] - n.p[1]];
		return Math.abs(Math.atan2(u[0] * v[1] - u[1] * v[0], u[0] * v[0] + u[1] * v[1])) * 180 / Math.PI;
	};
	const isVertex = (n: { p: Point; to: Point[] }) => n.to.length !== 2 || n.p.some(c => Math.abs(c) < 1e-6 || Math.abs(c - 100) < 1e-6) || turn(n) > TURN;
	const vertexKeys = [...nodes.entries()].filter(([, n]) => isVertex(n)).map(([k]) => k);
	const at = new Map(vertexKeys.map((k, i) => [k, i]));
	const used = new Set<string>(), raw: { a: number; b: number; points: Point[] }[] = [];
	const step = (from: Point, to: Point) => [key(from), key(to)].sort().join('|');
	// Each stretch from a vertex to the next.
	for (const k of vertexKeys) for (const first of nodes.get(k)!.to) {
		if (used.has(step(nodes.get(k)!.p, first))) continue;
		const points: Point[] = [nodes.get(k)!.p];
		let prev = nodes.get(k)!.p, cur = first;
		used.add(step(prev, cur));
		while (!at.has(key(cur))) {
			points.push(cur);
			const n = nodes.get(key(cur))!, next = n.to.find(x => key(x) !== key(prev))!;
			used.add(step(cur, next));
			prev = cur;
			cur = next;
		}
		points.push(cur);
		raw.push({ a: at.get(k)!, b: at.get(key(cur))!, points });
	}
	// Closed stretches with no vertex, each from its topmost point (then leftmost).
	const loops: Point[][] = [];
	for (const [k, n] of nodes) for (const q of n.to) {
		if (used.has(step(n.p, q))) continue;
		const loop: Point[] = [n.p];
		let prev = n.p, cur = q;
		used.add(step(prev, cur));
		while (key(cur) !== k) {
			loop.push(cur);
			const m = nodes.get(key(cur))!, next = m.to.find(x => key(x) !== key(prev))!;
			used.add(step(cur, next));
			prev = cur;
			cur = next;
		}
		const start = loop.reduce((best, p, i) => p[1] < loop[best][1] - 1e-9 || (Math.abs(p[1] - loop[best][1]) <= 1e-9 && p[0] < loop[best][0]) ? i : best, 0);
		loops.push([...loop.slice(start), ...loop.slice(0, start), loop[start]]);
	}
	// Each vertex's ends of edges, clockwise round it (the sheet's y runs down).
	const darts = vertexKeys.map(() => [] as { edge: number; out: boolean; angle: number }[]);
	raw.forEach(({ a, b, points }, edge) => {
		const n = points.length;
		darts[a].push({ edge, out: true, angle: Math.atan2(points[1][1] - points[0][1], points[1][0] - points[0][0]) });
		darts[b].push({ edge, out: false, angle: Math.atan2(points[n - 2][1] - points[n - 1][1], points[n - 2][0] - points[n - 1][0]) });
	});
	darts.forEach(list => list.sort((x, y) => x.angle - y.angle));
	// Breadth first from a root on the paper's top edge, each vertex's edges from the one it was reached by.
	const top = (i: number): Point => nodes.get(vertexKeys[i])!.p;
	const order: number[] = [], edgeOrder: { edge: number; reversed: boolean }[] = [], label = new Map<number, number>(), edgeLabel = new Map<number, number>();
	const rows: string[] = [];
	const remaining = new Set(vertexKeys.map((_, i) => i));
	while (remaining.size) {
		const root = [...remaining].reduce((best, i) => {
			const p = top(i), q = top(best), onTop = (x: Point) => Math.abs(x[1]) < 1e-6;
			if (onTop(p) !== onTop(q)) return onTop(p) ? i : best;
			return p[1] < q[1] - 1e-6 || (Math.abs(p[1] - q[1]) <= 1e-6 && p[0] < q[0]) ? i : best;
		});
		label.set(root, order.length);
		order.push(root);
		remaining.delete(root);
		const from = new Map<number, number>([[root, -Math.PI / 2]]);
		for (let k = order.length - 1; k < order.length; k++) {
			const v = order[k], list = darts[v], enter = from.get(v)!;
			// Clockwise from the edge it was reached by (the root: from straight up).
			const first = list.findIndex(d => d.angle > enter + 1e-12), shift = first < 0 ? 0 : first;
			const row: string[] = [];
			for (let j = 0; j < list.length; j++) {
				const d = list[(shift + j) % list.length], { a, b } = raw[d.edge], w = d.out ? b : a;
				if (!edgeLabel.has(d.edge)) { edgeLabel.set(d.edge, edgeOrder.length); edgeOrder.push({ edge: d.edge, reversed: !d.out }); }
				if (!label.has(w)) {
					label.set(w, order.length);
					order.push(w);
					remaining.delete(w);
					const back = darts[w].find(x => x.edge === d.edge && x.out !== d.out) ?? darts[w].find(x => x.edge === d.edge)!;
					from.set(w, back.angle);
				}
				row.push(`${label.get(w)}:${edgeLabel.get(d.edge)}`);
			}
			rows.push(row.join(' '));
		}
	}
	const edges = [
		...edgeOrder.map(({ edge, reversed }) => {
			const { a, b, points } = raw[edge];
			return reversed ? { from: label.get(b)!, to: label.get(a)!, points: [...points].reverse() } : { from: label.get(a)!, to: label.get(b)!, points };
		}),
		...loops.sort((p, q) => p[0][1] - q[0][1] || p[0][0] - q[0][0]).map(points => ({ from: -1, to: -1, points }))
	].map(({ from, to, points }) => {
		const cum = [0];
		for (let i = 1; i < points.length; i++) cum.push(cum[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]));
		return { from, to, points, cum };
	});
	const vertices = order.map(i => nodes.get(vertexKeys[i])!.p);
	return { vertices, edges, sig: `${rows.join('|')}|loops ${loops.length}`, pieces };
}

/** The point `t` of the way along an edge, by its length. */
export function alongEdge(e: OutlineEdge, t: number): Point {
	const s = t * e.cum[e.cum.length - 1];
	let i = 0;
	while (i < e.points.length - 2 && e.cum[i + 1] < s) i++;
	const span = e.cum[i + 1] - e.cum[i], u = span ? Math.max(0, Math.min(1, (s - e.cum[i]) / span)) : 0;
	return [e.points[i][0] + u * (e.points[i + 1][0] - e.points[i][0]), e.points[i][1] + u * (e.points[i + 1][1] - e.points[i][1])];
}

/** The part of an edge between shares `t0` and `t1` of it (backwards where `t1` is less), as points. */
export function edgeStretch(e: OutlineEdge, t0: number, t1: number): Point[] {
	const L = e.cum[e.cum.length - 1], [lo, hi] = [Math.min(t0, t1) * L, Math.max(t0, t1) * L];
	const inner = e.points.filter((_, i) => e.cum[i] > lo + 1e-9 && e.cum[i] < hi - 1e-9);
	const out = [alongEdge(e, Math.min(t0, t1)), ...inner, alongEdge(e, Math.max(t0, t1))];
	return t0 <= t1 ? out : out.reverse();
}

/** Where a point lies on the outline: the edge it is on and how far along it,
 * or none where it is on none (within `tol`). */
export function onOutline(o: BoardOutline, p: Point, tol = 1e-5): { e: number; t: number } | undefined {
	let best: { e: number; t: number; d: number } | undefined;
	o.edges.forEach((edge, e) => {
		const L = edge.cum[edge.cum.length - 1];
		for (let i = 0; i + 1 < edge.points.length; i++) {
			const a = edge.points[i], b = edge.points[i + 1], dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
			const u = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0, d = Math.hypot(a[0] + u * dx - p[0], a[1] + u * dy - p[1]);
			if (d < tol && (!best || d < best.d)) best = { e, t: L ? (edge.cum[i] + u * Math.sqrt(l2)) / L : 0, d };
		}
	});
	return best && { e: best.e, t: best.t < 1e-9 ? 0 : best.t > 1 - 1e-9 ? 1 : best.t };
}
