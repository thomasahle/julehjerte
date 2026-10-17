/**
 * Cubic Béziers as polylines, for the DXF writer — docs/redesign/LASER.md.
 *
 * R12 has no curve a laser program reads reliably (SPLINE came later, and the
 * programs that do take it disagree about it), so a curved cut goes out as a
 * POLYLINE close enough to the curve that the difference is below the beam:
 * 0.05 mm by default, against a kerf of 0.1–0.2 mm.
 */
import type { Vec } from '$lib/types/heart';

export const FLATTEN_TOLERANCE_MM = 0.05;

/** Deep enough for any curve on a sheet of paper; the guard is for NaN input. */
const MAX_DEPTH = 18;

/** Distance from `p` to the segment a–b (not the infinite line: a control point past an end counts). */
function distanceToSegment(p: Vec, a: Vec, b: Vec): number {
	const dx = b.x - a.x;
	const dy = b.y - a.y;
	const len2 = dx * dx + dy * dy;
	const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
	return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

const mid = (a: Vec, b: Vec): Vec => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/**
 * The points after `p0` of a polyline within `tolerance` of the cubic
 * p0–p1–p2–p3, by halving until each piece is flat.
 *
 * A piece is flat when both control points lie within `tolerance` of its
 * chord: the curve stays inside the hull of its control points, so it is then
 * within `tolerance` of the chord too. A straight segment is flat at once and
 * comes out as its end point alone.
 */
export function flattenCubic(p0: Vec, p1: Vec, p2: Vec, p3: Vec, tolerance = FLATTEN_TOLERANCE_MM): Vec[] {
	const out: Vec[] = [];
	const visit = (a: Vec, b: Vec, c: Vec, d: Vec, depth: number) => {
		if (
			depth >= MAX_DEPTH ||
			Math.max(distanceToSegment(b, a, d), distanceToSegment(c, a, d)) <= tolerance
		) {
			out.push(d);
			return;
		}
		// de Casteljau at t = 1/2.
		const ab = mid(a, b);
		const bc = mid(b, c);
		const cd = mid(c, d);
		const abc = mid(ab, bc);
		const bcd = mid(bc, cd);
		const m = mid(abc, bcd);
		visit(a, ab, abc, m, depth + 1);
		visit(m, bcd, cd, d, depth + 1);
	};
	visit(p0, p1, p2, p3, 0);
	return out;
}

/**
 * Drops every vertex that lies on the straight line through its neighbours,
 * so a straight cut through the fold is two vertices, not three.
 */
export function dropCollinear(points: Vec[], tolerance = 1e-9): Vec[] {
	if (points.length < 3) return points.slice();
	const out = [points[0]!];
	for (let i = 1; i < points.length - 1; i++) {
		const prev = out[out.length - 1]!;
		const next = points[i + 1]!;
		const p = points[i]!;
		// Only a vertex *between* its neighbours is redundant; one the path turns
		// back at is a corner, however thin.
		const between = (p.x - prev.x) * (next.x - p.x) + (p.y - prev.y) * (next.y - p.y) > 0;
		if (!(between && distanceToSegment(p, prev, next) <= tolerance)) out.push(p);
	}
	out.push(points[points.length - 1]!);
	return out;
}
