import type { BezierSegment, Vec } from '$lib/types/heart';
import { reverseSegments, splitBezierAt } from './bezierSegments';
import { cubicDerivativeRoots } from './curves';

type Rectangle = { left: number; right: number; top: number; bottom: number };
type Plane = { axis: 'x' | 'y'; bound: number; sign: 1 | -1 };

/** A straight connector represented as a cubic, without approximating its locus. */
export function straightBezier(p0: Vec, p3: Vec): BezierSegment {
	return { p0, p1: p0, p2: p3, p3 };
}

function coordinateAt(values: number[], t: number) {
	const u = 1 - t;
	return u * u * u * values[0]! + 3 * u * u * t * values[1]! + 3 * u * t * t * values[2]! + t * t * t * values[3]!;
}

/** All crossings and tangencies, partitioned into monotone scalar intervals. */
function roots(values: number[]) {
	const knots = [0, ...cubicDerivativeRoots(values[0]!, values[1]!, values[2]!, values[3]!).filter(t => t > 0 && t < 1), 1].sort((a, b) => a - b);
	const result: number[] = [];
	for (let i = 0; i < knots.length; i++) {
		const t = knots[i]!, value = coordinateAt(values, t);
		if (value === 0 && t > 0 && t < 1) result.push(t);
		if (i === 0) continue;
		let lo = knots[i - 1]!, hi = t;
		const below = coordinateAt(values, lo) < 0;
		if (coordinateAt(values, lo) === 0 || value === 0 || below === (value < 0)) continue;
		for (let step = 0; step < 54; step++) {
			const mid = (lo + hi) / 2;
			if (mid === lo || mid === hi) break;
			if ((coordinateAt(values, mid) < 0) === below) lo = mid; else hi = mid;
		}
		result.push((lo + hi) / 2);
	}
	return [...new Set(result)].sort((a, b) => a - b);
}

function insidePieces(segment: BezierSegment, plane: Plane): BezierSegment[] {
	const values = [segment.p0, segment.p1, segment.p2, segment.p3].map(p => (p[plane.axis] - plane.bound) * plane.sign);
	if (values.every(v => v >= 0)) return [segment];
	if (values.every(v => v <= 0)) return [];
	const cuts = roots(values), pieces: BezierSegment[] = [];
	let rest = segment, previous = 0;
	for (const t of [...cuts, 1]) {
		if (t <= previous || t > 1) continue;
		let piece: BezierSegment;
		if (t === 1) piece = rest;
		else {
			const [left, right] = splitBezierAt(rest, (t - previous) / (1 - previous));
			// Both adjoining pieces use exactly the same intersection coordinate.
			const intersection = { ...left.p3, [plane.axis]: plane.bound };
			piece = { ...left, p3: intersection };
			rest = { ...right, p0: intersection };
		}
		if (coordinateAt(values, (previous + t) / 2) >= 0) pieces.push(piece);
		previous = t;
	}
	return pieces;
}

/** Sutherland–Hodgman clipping of closed cubic loops. Concave/disconnected
 * results may use retraced boundary connectors; these cancel under even-odd
 * filling. A clipper owns caches so reversed shared curves are split once and
 * reuse exactly the same controls across every loop in a rendered weave. */
export function createBezierLoopClipper(rectangle: Rectangle) {
	const planes: Plane[] = [
		{ axis: 'x', bound: rectangle.left, sign: 1 },
		{ axis: 'x', bound: rectangle.right, sign: -1 },
		{ axis: 'y', bound: rectangle.top, sign: 1 },
		{ axis: 'y', bound: rectangle.bottom, sign: -1 }
	];
	const caches = planes.map(() => new Map<string, BezierSegment[]>());
	const same = (a: Vec, b: Vec) => a.x === b.x && a.y === b.y;
	return (input: BezierSegment[]): BezierSegment[] => {
		let loop = input;
		for (let i = 0; i < planes.length && loop.length; i++) {
			const kept: BezierSegment[] = [], cache = caches[i]!;
			for (const segment of loop) {
				const points = [segment.p0, segment.p1, segment.p2, segment.p3];
				const forward = points.map(p => `${p.x},${p.y}`).join(';'), backward = points.toReversed().map(p => `${p.x},${p.y}`).join(';');
				const reversed = backward < forward, key = reversed ? backward : forward;
				let pieces = cache.get(key);
				if (!pieces) {
					pieces = insidePieces(reversed ? reverseSegments([segment])[0]! : segment, planes[i]!);
					cache.set(key, pieces);
				}
				kept.push(...(reversed ? reverseSegments(pieces) : pieces));
			}
			loop = [];
			for (let j = 0; j < kept.length; j++) {
				const segment = kept[j]!, next = kept[(j + 1) % kept.length]!;
				loop.push(segment);
				if (!same(segment.p3, next.p0)) loop.push(straightBezier(segment.p3, next.p0));
			}
		}
		return loop;
	};
}
