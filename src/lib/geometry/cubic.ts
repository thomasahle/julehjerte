/**
 * The cubic Bézier primitives everything else builds on: a point at t, a split
 * at t, and where two straight pieces cross.
 *
 * Which cuts are legal and what the generator builds depend on these to the
 * last bit, so each function here is one exact sequence of floating-point
 * operations. Two ways of computing the same thing that round differently are
 * two functions (`bezierPoint`, `bezierPointByPowers`), not one: a caller that
 * switched between them would change hearts.
 */
import type { BezierSegment, Vec } from '$lib/types/heart';
import { vecLerp } from '$lib/geometry/vec';
import { clamp01 } from '$lib/utils/math';

/** One coordinate of a cubic Bézier at t, by its Bernstein polynomials, multiplied left to right. */
export function cubicAt(p0: number, p1: number, p2: number, p3: number, t: number): number {
	const u = 1 - t;
	return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
}

/** A cubic Bézier's point at t, each coordinate by `cubicAt`; t is used as given, also outside [0, 1]. */
export function bezierPoint(seg: BezierSegment, t: number): Vec {
	return {
		x: cubicAt(seg.p0.x, seg.p1.x, seg.p2.x, seg.p3.x, t),
		y: cubicAt(seg.p0.y, seg.p1.y, seg.p2.y, seg.p3.y, t)
	};
}

/** `bezierPoint` with t first clamped to [0, 1]. */
export function bezierPointClamped(seg: BezierSegment, t: number): Vec {
	return bezierPoint(seg, clamp01(t));
}

/**
 * A cubic Bézier's point at t from the powers (1 − t)², (1 − t)³, t², t³. The
 * same curve as `bezierPoint`, but 3 (1 − t)² t is 3 · ((1 − t)(1 − t)) · t
 * here and (3 (1 − t)) (1 − t) · t there, so the last bits can differ: the
 * template PDF, the difficulty estimate and the path validator use this one.
 */
export function bezierPointByPowers(seg: BezierSegment, t: number): Vec {
	const t2 = t * t;
	const t3 = t2 * t;
	const mt = 1 - t;
	const mt2 = mt * mt;
	const mt3 = mt2 * mt;
	return {
		x: mt3 * seg.p0.x + 3 * mt2 * t * seg.p1.x + 3 * mt * t2 * seg.p2.x + t3 * seg.p3.x,
		y: mt3 * seg.p0.y + 3 * mt2 * t * seg.p1.y + 3 * mt * t2 * seg.p2.y + t3 * seg.p3.y
	};
}

/**
 * A cubic Bézier split at t by de Casteljau's construction: the two halves
 * share the point at t, and keep the original's end points as they are.
 */
export function splitBezierAt(seg: BezierSegment, t: number): [BezierSegment, BezierSegment] {
	const p0 = seg.p0;
	const p1 = seg.p1;
	const p2 = seg.p2;
	const p3 = seg.p3;

	const p01 = vecLerp(p0, p1, t);
	const p12 = vecLerp(p1, p2, t);
	const p23 = vecLerp(p2, p3, t);

	const p012 = vecLerp(p01, p12, t);
	const p123 = vecLerp(p12, p23, t);

	const p0123 = vecLerp(p012, p123, t);

	return [
		{ p0, p1: p01, p2: p012, p3: p0123 },
		{ p0: p0123, p1: p123, p2: p23, p3 }
	];
}

/**
 * Where the segments p1–p2 and p3–p4 cross, ends included; null where they
 * miss, and where the cross product of their directions is under 1e-12
 * (parallel, overlapping collinear ones too).
 */
export function segmentIntersection(p1: Vec, p2: Vec, p3: Vec, p4: Vec): Vec | null {
	const den = (p4.y - p3.y) * (p2.x - p1.x) - (p4.x - p3.x) * (p2.y - p1.y);
	if (Math.abs(den) < 1e-12) return null;
	const ua = ((p4.x - p3.x) * (p1.y - p3.y) - (p4.y - p3.y) * (p1.x - p3.x)) / den;
	const ub = ((p2.x - p1.x) * (p1.y - p3.y) - (p2.y - p1.y) * (p1.x - p3.x)) / den;
	if (ua < 0 || ua > 1 || ub < 0 || ub > 1) return null;
	return { x: p1.x + ua * (p2.x - p1.x), y: p1.y + ua * (p2.y - p1.y) };
}
