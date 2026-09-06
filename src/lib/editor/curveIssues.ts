import type { Finger, Vec } from '$lib/types/heart';
import type { BezierSegment } from '$lib/geometry/bezierSegments';
import { fingerToSegments } from '$lib/geometry/bezierSegments';
import { bezierBBox, closestPointOnBezier, closestPointsBetweenBeziers, intersectBezierCurves } from '$lib/geometry/curves';
import { vecDist, vecLerp } from '$lib/geometry/vec';

/**
 * Detection of cuts that would ruin a woven heart: curves in the same lobe that cross, touch
 * or come closer than a small physical margin (GitHub issue #4). Coordinates are the editor's
 * internal pixels; the overlap square is 100 x 100 heart units (~100 mm when printed).
 */

/** Two cuts closer than this many heart units leave a sliver of paper that falls apart. */
export const INTERSECTION_MARGIN_UNITS = 1.5;

const INTERSECTION_EPS = 0.5;
const MAX_INTERSECTION_DEPTH = 18;
const SELF_INTERSECTION_EPS = 0.2;
// Self-intersection checks ignore hits this close to the curve's own endpoints.
const SELF_ENDPOINT_TOLERANCE = 2;

type BBox = { x: number; y: number; width: number; height: number };

/** The margin in internal pixels for an overlap rectangle of the given size. */
export function intersectionMarginPx(overlap: { width: number; height: number }): number {
	const unit = (overlap.width + overlap.height) / 200;
	return INTERSECTION_MARGIN_UNITS * unit;
}

export function bboxesOverlap(a: BBox, b: BBox): boolean {
	return a.x <= b.x + b.width && a.x + a.width >= b.x && a.y <= b.y + b.height && a.y + a.height >= b.y;
}

function bboxDistanceSq(a: BBox, b: BBox): number {
	const ax0 = a.x;
	const ay0 = a.y;
	const ax1 = a.x + a.width;
	const ay1 = a.y + a.height;
	const bx0 = b.x;
	const by0 = b.y;
	const bx1 = b.x + b.width;
	const by1 = b.y + b.height;

	let dx = 0;
	if (ax1 < bx0) dx = bx0 - ax1;
	else if (bx1 < ax0) dx = ax0 - bx1;

	let dy = 0;
	if (ay1 < by0) dy = by0 - ay1;
	else if (by1 < ay0) dy = ay0 - by1;

	return dx * dx + dy * dy;
}

/** True when any segment of `a` crosses any segment of `b` (same array: non-adjacent pairs only). */
export function segmentsIntersect(a: BezierSegment[], b: BezierSegment[], opts: { skipAdjacent?: boolean } = {}): boolean {
	const same = a === b;
	const skipAdjacent = opts.skipAdjacent ?? false;
	for (let i = 0; i < a.length; i++) {
		const sa = a[i]!;
		const ba = bezierBBox(sa);
		const start = same ? i + (skipAdjacent ? 2 : 1) : 0;
		for (let j = start; j < b.length; j++) {
			const sb = b[j]!;
			const bb = bezierBBox(sb);
			if (!bboxesOverlap(ba, bb)) continue;
			if (intersectBezierCurves(sa, sb).length > 0) return true;
		}
	}
	return false;
}

export function bezierPointAt(seg: BezierSegment, t: number): Vec {
	const tt = Math.max(0, Math.min(1, t));
	const u = 1 - tt;
	const b0 = u * u * u;
	const b1 = 3 * u * u * tt;
	const b2 = 3 * u * tt * tt;
	const b3 = tt * tt * tt;
	return {
		x: b0 * seg.p0.x + b1 * seg.p1.x + b2 * seg.p2.x + b3 * seg.p3.x,
		y: b0 * seg.p0.y + b1 * seg.p1.y + b2 * seg.p2.y + b3 * seg.p3.y
	};
}

function cross(a: Vec, b: Vec): number {
	return a.x * b.y - a.y * b.x;
}

function cubicDerivativeAt(seg: BezierSegment, t: number): Vec {
	const tt = Math.max(0, Math.min(1, t));
	const ax = -seg.p0.x + 3 * seg.p1.x - 3 * seg.p2.x + seg.p3.x;
	const bx = 3 * seg.p0.x - 6 * seg.p1.x + 3 * seg.p2.x;
	const cx = -3 * seg.p0.x + 3 * seg.p1.x;
	const ay = -seg.p0.y + 3 * seg.p1.y - 3 * seg.p2.y + seg.p3.y;
	const by = 3 * seg.p0.y - 6 * seg.p1.y + 3 * seg.p2.y;
	const cy = -3 * seg.p0.y + 3 * seg.p1.y;
	return { x: (3 * ax * tt + 2 * bx) * tt + cx, y: (3 * ay * tt + 2 * by) * tt + cy };
}

const GAUSS_5_X = [-0.9061798459, -0.5384693101, 0, 0.5384693101, 0.9061798459];
const GAUSS_5_W = [0.2369268851, 0.4786286705, 0.5688888889, 0.4786286705, 0.2369268851];

function cubicArcLength(seg: BezierSegment, t0: number, t1: number): number {
	if (t0 === t1) return 0;
	let a = t0;
	let b = t1;
	if (a > b) [a, b] = [b, a];
	const half = (b - a) / 2;
	const mid = (a + b) / 2;
	let sum = 0;
	for (let i = 0; i < GAUSS_5_X.length; i++) {
		const t = mid + half * GAUSS_5_X[i]!;
		const d = cubicDerivativeAt(seg, t);
		sum += GAUSS_5_W[i]! * Math.hypot(d.x, d.y);
	}
	return sum * half;
}

function cubicSelfIntersectionParams(seg: BezierSegment): { t1: number; t2: number } | null {
	const a = {
		x: -seg.p0.x + 3 * seg.p1.x - 3 * seg.p2.x + seg.p3.x,
		y: -seg.p0.y + 3 * seg.p1.y - 3 * seg.p2.y + seg.p3.y
	};
	const b = {
		x: 3 * seg.p0.x - 6 * seg.p1.x + 3 * seg.p2.x,
		y: 3 * seg.p0.y - 6 * seg.p1.y + 3 * seg.p2.y
	};
	const c = { x: -3 * seg.p0.x + 3 * seg.p1.x, y: -3 * seg.p0.y + 3 * seg.p1.y };
	const ab = cross(a, b);
	if (Math.abs(ab) < 1e-9) return null;
	const u = -cross(a, c) / ab;
	let v: number | null = null;
	if (Math.abs(a.x) > 1e-9) v = u * u + (b.x * u + c.x) / a.x;
	else if (Math.abs(a.y) > 1e-9) v = u * u + (b.y * u + c.y) / a.y;
	if (v == null) return null;
	const disc = u * u - 4 * v;
	if (disc <= 1e-9) return null;
	const root = Math.sqrt(disc);
	const t1 = 0.5 * (u - root);
	const t2 = 0.5 * (u + root);
	if (t1 <= 0 || t1 >= 1 || t2 <= 0 || t2 >= 1) return null;
	if (Math.abs(t1 - t2) < 1e-4) return null;
	return { t1, t2 };
}

function cubicSelfIntersectionLoopSize(seg: BezierSegment): number | null {
	const params = cubicSelfIntersectionParams(seg);
	if (!params) return null;
	const p1 = bezierPointAt(seg, params.t1);
	const p2 = bezierPointAt(seg, params.t2);
	if (vecDist(p1, p2) > SELF_INTERSECTION_EPS) return null;
	const t1 = Math.min(params.t1, params.t2);
	const t2 = Math.max(params.t1, params.t2);
	const total = cubicArcLength(seg, 0, 1);
	if (total <= 0) return null;
	const part = cubicArcLength(seg, t1, t2);
	return Math.min(part, total - part);
}

function splitBezierSegment(seg: BezierSegment, t: number): [BezierSegment, BezierSegment] {
	const tt = Math.max(0, Math.min(1, t));
	const a = vecLerp(seg.p0, seg.p1, tt);
	const b = vecLerp(seg.p1, seg.p2, tt);
	const c = vecLerp(seg.p2, seg.p3, tt);
	const d = vecLerp(a, b, tt);
	const e = vecLerp(b, c, tt);
	const p = vecLerp(d, e, tt);
	return [
		{ p0: seg.p0, p1: a, p2: d, p3: p },
		{ p0: p, p1: e, p2: c, p3: seg.p3 }
	];
}

function lineSegmentIntersection(p1: Vec, p2: Vec, p3: Vec, p4: Vec): Vec | null {
	const den = (p4.y - p3.y) * (p2.x - p1.x) - (p4.x - p3.x) * (p2.y - p1.y);
	if (Math.abs(den) < 1e-12) return null;
	const ua = ((p4.x - p3.x) * (p1.y - p3.y) - (p4.y - p3.y) * (p1.x - p3.x)) / den;
	const ub = ((p2.x - p1.x) * (p1.y - p3.y) - (p2.y - p1.y) * (p1.x - p3.x)) / den;
	if (ua < 0 || ua > 1 || ub < 0 || ub > 1) return null;
	return { x: p1.x + ua * (p2.x - p1.x), y: p1.y + ua * (p2.y - p1.y) };
}

function hasAdjacentIntersection(segA: BezierSegment, segB: BezierSegment, join: Vec, minDist: number): boolean {
	const stack: Array<{ a: BezierSegment; b: BezierSegment; depth: number }> = [{ a: segA, b: segB, depth: 0 }];
	while (stack.length) {
		const next = stack.pop();
		if (!next) break;
		const { a, b, depth } = next;
		const ba = bezierBBox(a);
		const bb = bezierBBox(b);
		if (!bboxesOverlap(ba, bb)) continue;

		const sizeA = Math.max(ba.width, ba.height);
		const sizeB = Math.max(bb.width, bb.height);
		if (depth >= MAX_INTERSECTION_DEPTH || (sizeA <= INTERSECTION_EPS && sizeB <= INTERSECTION_EPS)) {
			const hit = lineSegmentIntersection(a.p0, a.p3, b.p0, b.p3);
			if (!hit) continue;
			if (vecDist(hit, join) < minDist) continue;
			return true;
		}

		if (sizeA >= sizeB) {
			const [a0, a1] = splitBezierSegment(a, 0.5);
			stack.push({ a: a0, b, depth: depth + 1 }, { a: a1, b, depth: depth + 1 });
		} else {
			const [b0, b1] = splitBezierSegment(b, 0.5);
			stack.push({ a, b: b0, depth: depth + 1 }, { a, b: b1, depth: depth + 1 });
		}
	}
	return false;
}

function curveLoopSizeBetween(
	segs: BezierSegment[],
	prefixLengths: number[],
	idxA: number,
	tA: number,
	idxB: number,
	tB: number
): number | null {
	if (prefixLengths.length !== segs.length + 1) return null;
	const total = prefixLengths[prefixLengths.length - 1]!;
	if (total <= 0) return null;
	let i = idxA;
	let j = idxB;
	let ti = tA;
	let tj = tB;
	if (i > j) {
		[i, j] = [j, i];
		[ti, tj] = [tj, ti];
	}
	if (i === j || i < 0 || j >= segs.length) return null;
	let forward = cubicArcLength(segs[i]!, ti, 1);
	if (j > i + 1) {
		forward += prefixLengths[j]! - prefixLengths[i + 1]!;
	}
	forward += cubicArcLength(segs[j]!, 0, tj);
	const other = Math.max(0, total - forward);
	return Math.min(forward, other);
}

function segmentsHaveIssues(
	segsA: BezierSegment[],
	bboxesA: BBox[],
	endpointsA: { start: Vec; end: Vec },
	segsB: BezierSegment[],
	bboxesB: BBox[],
	endpointsB: { start: Vec; end: Vec },
	opts: {
		minDistance: number;
		endpointTolerance: number;
		proximityEndpointTolerance: number;
		skipAdjacent?: boolean;
		intersectionLoopThreshold?: number;
	}
): boolean {
	const same = segsA === segsB;
	const skipAdjacent = opts.skipAdjacent ?? false;
	const minDist2 = opts.minDistance * opts.minDistance;
	const loopThreshold = same ? opts.intersectionLoopThreshold : undefined;
	const intersectionEps = loopThreshold != null ? 0.2 : INTERSECTION_EPS;
	let prefixLengths: number[] | null = null;
	if (loopThreshold != null) {
		prefixLengths = [0];
		let total = 0;
		for (const seg of segsA) {
			total += cubicArcLength(seg, 0, 1);
			prefixLengths.push(total);
		}
	}
	for (let i = 0; i < segsA.length; i++) {
		const sa = segsA[i]!;
		const ba = bboxesA[i]!;
		const start = same ? i + (skipAdjacent ? 2 : 1) : 0;
		for (let j = start; j < segsB.length; j++) {
			const sb = segsB[j]!;
			const bb = bboxesB[j]!;
			if (bboxesOverlap(ba, bb)) {
				const ix = intersectBezierCurves(sa, sb);
				for (const pt of ix) {
					if (loopThreshold != null && prefixLengths) {
						const hitA = closestPointOnBezier(sa, pt);
						if (hitA.distance > intersectionEps) continue;
						const hitB = closestPointOnBezier(sb, pt);
						if (hitB.distance > intersectionEps) continue;
						if (vecDist(hitA.point, hitB.point) > intersectionEps) continue;
						const atEndpoint =
							vecDist(hitA.point, endpointsA.start) < opts.endpointTolerance ||
							vecDist(hitA.point, endpointsA.end) < opts.endpointTolerance ||
							vecDist(hitB.point, endpointsB.start) < opts.endpointTolerance ||
							vecDist(hitB.point, endpointsB.end) < opts.endpointTolerance;
						if (atEndpoint) continue;
						const loopSize = curveLoopSizeBetween(segsA, prefixLengths, i, hitA.t, j, hitB.t);
						if (loopSize != null && loopSize < loopThreshold) continue;
						return true;
					}
					const atEndpoint =
						vecDist(pt, endpointsA.start) < opts.endpointTolerance ||
						vecDist(pt, endpointsA.end) < opts.endpointTolerance ||
						vecDist(pt, endpointsB.start) < opts.endpointTolerance ||
						vecDist(pt, endpointsB.end) < opts.endpointTolerance;
					if (!atEndpoint) return true;
				}
			}

			if (bboxDistanceSq(ba, bb) >= minDist2) continue;
			const hit = closestPointsBetweenBeziers(sa, sb, { samplesPerCurve: 5, maxSeeds: 8, newtonIterations: 10 });
			if (vecDist(hit.pointA, endpointsA.start) < opts.proximityEndpointTolerance) continue;
			if (vecDist(hit.pointA, endpointsA.end) < opts.proximityEndpointTolerance) continue;
			if (vecDist(hit.pointB, endpointsB.start) < opts.proximityEndpointTolerance) continue;
			if (vecDist(hit.pointB, endpointsB.end) < opts.proximityEndpointTolerance) continue;
			if (hit.distance < opts.minDistance) return true;
		}
	}
	return false;
}

/**
 * Whether a curve would ruin the heart: it loops back on itself, or it crosses, touches or
 * comes within `minDistance` (internal px, see intersectionMarginPx) of another curve in the
 * same lobe — anywhere along the curves, including where they meet the fold line.
 */
export function fingerHasIntersectionIssues(finger: Finger, fingers: Finger[], minDistance: number): boolean {
	const segs = fingerToSegments(finger);
	const n = segs.length;
	if (!n) return false;
	const start = segs[0]!.p0;
	const end = segs[n - 1]!.p3;
	const segBBoxes = segs.map(bezierBBox);
	const endpoints = { start, end };

	// Loops smaller than the margin are slivers below the physical resolution; ignore them.
	for (const seg of segs) {
		const loopSize = cubicSelfIntersectionLoopSize(seg);
		if (loopSize != null && loopSize >= minDistance) return true;
	}

	for (let i = 0; i < n - 1; i++) {
		const join = segs[i]!.p3;
		if (hasAdjacentIntersection(segs[i]!, segs[i + 1]!, join, minDistance)) return true;
	}

	if (
		segmentsHaveIssues(segs, segBBoxes, endpoints, segs, segBBoxes, endpoints, {
			minDistance,
			endpointTolerance: SELF_ENDPOINT_TOLERANCE,
			proximityEndpointTolerance: SELF_ENDPOINT_TOLERANCE * 2,
			skipAdjacent: true,
			intersectionLoopThreshold: minDistance
		})
	) {
		return true;
	}

	for (const other of fingers) {
		if (other.id === finger.id) continue;
		if (other.lobe !== finger.lobe) continue;
		const otherSegs = fingerToSegments(other);
		const m = otherSegs.length;
		if (!m) continue;
		const otherBBoxes = otherSegs.map(bezierBBox);
		const otherEndpoints = { start: otherSegs[0]!.p0, end: otherSegs[m - 1]!.p3 };
		// No endpoint exemption between different curves: two cuts that meet or nearly meet on the
		// fold line (the "baseline") leave a strip with no paper holding it, so flag those too.
		if (
			segmentsHaveIssues(segs, segBBoxes, endpoints, otherSegs, otherBBoxes, otherEndpoints, {
				minDistance,
				endpointTolerance: 0,
				proximityEndpointTolerance: 0
			})
		) {
			return true;
		}
	}

	return false;
}

/** Ids of every curve that has an intersection issue with itself or another curve in its lobe. */
export function findFingersWithIssues(fingers: Finger[], minDistance: number): Set<string> {
	const set = new Set<string>();
	for (const finger of fingers) {
		if (fingerHasIntersectionIssues(finger, fingers, minDistance)) set.add(finger.id);
	}
	return set;
}
