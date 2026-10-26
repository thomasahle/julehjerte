import type { CutGeometry } from '$lib/inverse/toHeartDesign';
import type { HeartDesign, Vec } from '$lib/types/heart';
import { paperFaults } from '$lib/geometry/paperNecks';
import { lobesShareTemplate } from '$lib/utils/symmetry';
import { inferOverlapRect } from '$lib/utils/overlapRect';
import type { Edge, Point, Ring } from './geometry';

type Cuts = CutGeometry | Pick<HeartDesign, 'fingers'>;

function visitCutTips(cuts: Cuts, visit: (point: Vec, turn: number) => void) {
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
	for (const path of paths) for (let i = 1; i < path.length; i++) {
		const a = path[i - 1], b = path[i];
		const incoming = tangent(a.p3, [a.p2, a.p1, a.p0]);
		const outgoing = tangent(b.p0, [b.p1, b.p2, b.p3]);
		if (!(incoming.x || incoming.y) || !(outgoing.x || outgoing.y)) continue;
		const turn = Math.atan2(Math.abs(incoming.x * outgoing.y - incoming.y * outgoing.x),
			-incoming.x * outgoing.x - incoming.y * outgoing.y);
		if (turn > 3 * Math.PI / 4) visit(b.p0, turn);
	}
}

/** Count narrow paper tips at joins of the actual cutting paths. A turn of
 * more than 150° leaves a tip below 30°; more than 135° leaves one below 45°.
 * Prefer removing the narrowest tips first. Spacing is checked separately. */
export function cutTipCounts(cuts: Cuts): [number, number] {
	let needles = 0, sharp = 0;
	visitCutTips(cuts, (_point, turn) => {
		if (turn > 5 * Math.PI / 6) needles++;
		sharp++;
	});
	return [needles, sharp];
}

/** Joints below 45°, in the input's coordinate system. The same joint can be
 * present on both sheets; moving a coincident cut must affect both together. */
export function cutTipPoints(cuts: Cuts): Vec[] {
	const points: Vec[] = [];
	visitCutTips(cuts, point => points.push(point));
	return points;
}

export function fewerCutTips(a: [number, number], b: [number, number]): boolean {
	return a[0] < b[0] || a[0] === b[0] && a[1] < b[1];
}

/** A heart's cuts as hearts drawn by different means are compared: the places
 * its paper may tear (pieces hanging by less than 2 mm printed 80 mm wide, see
 * `paperFaults`, and needles), whether its two lobes need templates of their
 * own (1) rather than sharing one (0, see `lobesShareTemplate`), its sharp
 * tips, its turns of more than 25° along hidden cuts (where its picture, the
 * even–odd `rings` in the sheet's 100 units, has one colour on both sides),
 * and the length of all its cuts in those units. */
export function cutMeasures(design: HeartDesign, rings: Ring[]): [number, number, number, number, number] {
	const rect = inferOverlapRect(design.fingers, design.gridSize);
	const unit = (x: number, y: number): Point => [(x - rect.left) / rect.width * 100, (y - rect.top) / rect.height * 100];
	const inside = (x: number, y: number, ring: Ring) => {
		let c = false;
		for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
			const [xi, yi] = ring[i], [xj, yj] = ring[j];
			if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
		}
		return c;
	};
	const colour = (x: number, y: number) => rings.reduce((v, ring) => v ^ Number(inside(x, y, ring)), 0);
	let length = 0, turns = 0;
	for (const finger of design.fingers) {
		if (!finger.id.includes('-cut-')) continue;
		const pts: Point[] = [];
		for (const sg of finger.segments) for (let k = pts.length ? 1 : 0; k <= 8; k++) {
			const t = k / 8, u = 1 - t, at = (c: 'x' | 'y') => u * u * u * sg.p0[c] + 3 * u * u * t * sg.p1[c] + 3 * u * t * t * sg.p2[c] + t * t * t * sg.p3[c];
			pts.push(unit(at('x'), at('y')));
		}
		// Turns are looked for between points half a unit apart or more.
		let last: number | null = null, from = pts[0];
		for (let i = 1; i < pts.length; i++) {
			const p = pts[i], q = pts[i - 1], l = Math.hypot(p[0] - q[0], p[1] - q[1]);
			if (!l) continue;
			length += l;
			const m = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2], n = [-(p[1] - q[1]) / l, (p[0] - q[0]) / l];
			const hidden = colour(m[0] + .15 * n[0], m[1] + .15 * n[1]) === colour(m[0] - .15 * n[0], m[1] - .15 * n[1]);
			if (Math.hypot(p[0] - from[0], p[1] - from[1]) < .5) continue;
			const direction = Math.atan2(p[1] - from[1], p[0] - from[0]);
			if (last !== null && hidden) {
				let a = Math.abs(direction - last);
				if (a > Math.PI) a = 2 * Math.PI - a;
				if (a > 25 * Math.PI / 180) turns++;
			}
			last = direction;
			from = p;
		}
	}
	const [needles, sharp] = cutTipCounts(design);
	return [paperFaults(design).weak + needles, lobesShareTemplate(design.fingers, design.gridSize) ? 0 : 1, sharp, turns, Math.round(length)];
}

/** Whether cuts measured `a` (see `cutMeasures`) are better than `b`'s:
 * fewer places that may tear win outright, then one template for both lobes
 * over two; otherwise the first measure that differs decides, but a sharp tip
 * less buys no cuts much busier (a quarter more hidden turns, a twentieth
 * more length). */
export function betterCuts(a: readonly number[], b: readonly number[]): boolean {
	if (a[0] !== b[0]) return a[0] < b[0];
	if (a[1] !== b[1]) return a[1] < b[1];
	const i = a.findIndex((x, k) => x !== b[k]);
	return i >= 0 && a[i] < b[i] && a[3] <= 1.25 * b[3] + 2 && a[4] <= 1.05 * b[4];
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
