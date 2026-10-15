import type { CutGeometry } from '$lib/inverse/toHeartDesign';
import type { HeartDesign, Vec } from '$lib/types/heart';
import type { Edge, Point } from './geometry';

/** Count narrow paper tips at joins of the actual cutting paths. A turn of
 * more than 150° leaves a tip below 30°; more than 135° leaves one below 45°.
 * Prefer removing the narrowest tips first. Spacing is checked separately. */
export function cutTipCounts(cuts: CutGeometry | Pick<HeartDesign, 'fingers'>): [number, number] {
	const paths = 'fingers' in cuts ? cuts.fingers.map(f => f.segments)
		: [...cuts.A_overlap_paths, ...cuts.B_overlap_paths].map(path => path.map(ref => {
			const points = cuts.curves[ref.curve].control_points.map(([x, y]) => ({ x, y }));
			if (ref.reverse) points.reverse();
			return { p0: points[0], p1: points[1], p2: points[2], p3: points[3] };
		}));
	const tangent = (a: Vec, candidates: Vec[]) => {
		for (const b of candidates) {
			const d = { x: b.x - a.x, y: b.y - a.y };
			if (Math.hypot(d.x, d.y) > 1e-10) return d;
		}
		return { x: 0, y: 0 };
	};
	let needles = 0, sharp = 0;
	for (const path of paths) for (let i = 1; i < path.length; i++) {
		const a = path[i - 1], b = path[i];
		const incoming = tangent(a.p3, [a.p2, a.p1, a.p0]);
		const outgoing = tangent(b.p0, [b.p1, b.p2, b.p3]);
		if (!(incoming.x || incoming.y) || !(outgoing.x || outgoing.y)) continue;
		const turn = Math.atan2(Math.abs(incoming.x * outgoing.y - incoming.y * outgoing.x),
			-incoming.x * outgoing.x - incoming.y * outgoing.y);
		if (turn > 5 * Math.PI / 6) needles++;
		if (turn > 3 * Math.PI / 4) sharp++;
	}
	return [needles, sharp];
}

export function fewerCutTips(a: [number, number], b: [number, number]): boolean {
	return a[0] < b[0] || a[0] === b[0] && a[1] < b[1];
}

/** Count a cell's tips before joining it to the checkerboard. Each gate has
 * one shared cut and two opposite grid continuations, one on each sheet.
 * Include those joins: a locally smooth letter can still meet the grid sharply.
 * This ranks existing connections only; the complete cuts must be validated. */
export function cellTipCounts(edges: Edge[], gates: { point: Point; axis: number }[]): [number, number] {
	const joins = [new Map<string, Point[]>(), new Map<string, Point[]>()];
	const add = (family: number, point: Point, vector: Point) => {
		const key = point.map(v => v.toFixed(7)).join(',');
		const vectors = joins[family].get(key) ?? [];
		vectors.push(vector);
		joins[family].set(key, vectors);
	};
	for (const edge of edges) for (const family of [0, 1]) {
		if (edge.family !== 'AB' && edge.family !== (family ? 'B' : 'A')) continue;
		add(family, edge.from, [edge.to[0] - edge.from[0], edge.to[1] - edge.from[1]]);
		add(family, edge.to, [edge.from[0] - edge.to[0], edge.from[1] - edge.to[1]]);
	}
	for (const { point, axis } of gates) for (const family of [0, 1]) {
		const vector: Point = [0, 0];
		vector[axis] = family ? 1 : -1;
		add(family, point, vector);
	}
	let needles = 0, sharp = 0;
	for (const sheet of joins) for (const vectors of sheet.values()) {
		if (vectors.length !== 2) return [Infinity, Infinity];
		const [a, b] = vectors;
		const turn = Math.atan2(Math.abs(a[0] * b[1] - a[1] * b[0]), -a[0] * b[0] - a[1] * b[1]);
		if (turn > 5 * Math.PI / 6) needles++;
		if (turn > 3 * Math.PI / 4) sharp++;
	}
	return [needles, sharp];
}
