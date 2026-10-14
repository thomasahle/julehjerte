/** Whole-cut proximity geometry shared by the editor and the reconstruction worker.
 * This module contains no solver, image-processing or UI dependencies.
 */
export type ReturnPoint = [number, number];
type Point = ReturnPoint;
type Pair = [number, number];
type Box = [number, number, number, number];
type Flattened = { points: Point[]; ts: number[]; };
export interface ReturnCurveLike {
	p: Point[];
	point(t: number): Point;
	derivative(t: number): Point;
	second(t: number): Point;
	reversed(): ReturnCurveLike;
	flatten(tolerance: number, maxStep: number, parameters: true): Flattened;
}

/** All distances use the same units as the supplied curve coordinates. */
export interface ReturnOptions {
	margin: number;
	local?: number;
	tolerance?: number;
	endpointTolerance?: number;
}
export interface ReturnWitness {
	curves: Pair;
	parameters: Pair;
	points: [Point, Point];
	distanceUpper: number;
	required: number;
	arcSeparation: number;
	stationary: boolean;
	totalTurning: number | null;
}
type TurningData = { roots: number[]; fallback: Point; };
type Interval = { p: [Point, Point]; ts: Pair; arc: number; length: number; order: number; };
type Estimate = { u: number; v: number; gap: number; };
type Evaluation = { cost: number; parameters?: Pair; };
const add = (a: Point, b: Point): Point => [a[0] + b[0], a[1] + b[1]];
const sub = (a: Point, b: Point): Point => [a[0] - b[0], a[1] - b[1]];
const mul = (a: Point, s: number): Point => [a[0] * s, a[1] * s];
const dot = (a: Point, b: Point) => a[0] * b[0] + a[1] * b[1];
const cross = (a: Point, b: Point) => a[0] * b[1] - a[1] * b[0];
const norm = (a: Point) => Math.hypot(...a);
const distance = (a: Point, b: Point) => norm(sub(a, b));
const mix = (a: Point, b: Point, t: number): Point => add(mul(a, 1 - t), mul(b, t));
const clamp = (t: number, a: number, b: number) => Math.max(a, Math.min(b, t));
function segmentDistance(p: Point, a: Point, b: Point) {
	const d = sub(b, a);
	return distance(p, add(a, mul(d, clamp(dot(sub(p, a), d) / (dot(d, d) || 1), 0, 1))));
}

/** Only the cubic operations the return search needs. The worker can also pass
 * its existing native cubic objects through ReturnCurveLike. */
export class ReturnCurve implements ReturnCurveLike {
	p: Point[];
	constructor(p: Point[]) {
		if (p.length !== 4 || p.some(q => q.length !== 2 || q.some(x => !Number.isFinite(x))))
			throw new Error('A cubic needs four finite 2D control points.');
		this.p = p.map(q => [...q] as Point);
	}
	point(t: number): Point {
		const u = 1 - t;
		return [0, 1].map(k => u * u * u * this.p[0][k] + 3 * u * u * t * this.p[1][k] + 3 * u * t * t * this.p[2][k] + t * t * t * this.p[3][k]) as Point;
	}
	derivative(t: number): Point {
		const u = 1 - t;
		return [0, 1].map(k => 3 * (u * u * (this.p[1][k] - this.p[0][k]) + 2 * u * t * (this.p[2][k] - this.p[1][k]) + t * t * (this.p[3][k] - this.p[2][k]))) as Point;
	}
	second(t: number): Point {
		return [0, 1].map(k => 6 * ((1 - t) * (this.p[2][k] - 2 * this.p[1][k] + this.p[0][k]) + t * (this.p[3][k] - 2 * this.p[2][k] + this.p[1][k]))) as Point;
	}
	reversed() {
		return new ReturnCurve([...this.p].reverse());
	}
	split(t = .5): [ReturnCurve, ReturnCurve] {
		const a = [0, 1, 2].map(i => mix(this.p[i], this.p[i + 1], t)), b = [0, 1].map(i => mix(a[i], a[i + 1], t)), q = mix(b[0], b[1], t);
		return [new ReturnCurve([this.p[0], a[0], b[0], q]), new ReturnCurve([q, b[1], a[2], this.p[3]])];
	}
	flatness() {
		return Math.max(...this.p.map(p => segmentDistance(p, this.p[0], this.p[3])));
	}
	// The editor can reuse a curve object after moving its controls. Keep
	// flattening local to this call; a persistent cache would become stale.
	flatten(tolerance = .01, maxStep = Infinity): Flattened {
		if (!(tolerance > 0 && maxStep > 0))
			throw new Error('Positive flattening tolerances required.');
		const points = [this.p[0]], ts = [0], stack: Array<[ReturnCurve, number, number, number]> = [[this, 0, 1, 0]];
		while (stack.length) {
			const [c, a, b, depth] = stack.pop()!;
			if (c.flatness() <= tolerance && distance(c.p[0], c.p[3]) <= maxStep) {
				points.push(c.p[3]);
				ts.push(b);
			}
			else {
				if (depth >= 24)
					throw new Error('Curve subdivision tolerance not reached.');
				const [l, r] = c.split(), m = (a + b) / 2;
				stack.push([r, m, b, depth + 1], [l, a, m, depth + 1]);
			}
		}
		return { points, ts };
	}
}

// Keep operation order identical to the existing native critical-point search.
const polyTrim = (input: number[]) => {
	const p = [...input], s = Math.max(...p.map(Math.abs), 1e-30);
	while (p.length > 1 && Math.abs(p.at(-1)!) < s * 1e-13)
		p.pop();
	return p;
};
const evalPoly = (p: number[], t: number) => p.reduceRight((s, a) => s * t + a, 0);
const deriv = (p: number[]) => p.slice(1).map((a, i) => a * (i + 1));
function realRoots01(raw: number[]): number[] {
	const p = polyTrim(raw), scale = Math.max(...p.map(Math.abs), 1e-30);
	if (p.length < 2)
		return [];
	if (p.length === 2) {
		const t = -p[0] / p[1];
		return t > 0 && t < 1 ? [t] : [];
	}
	const critical = realRoots01(deriv(p)), grid = [0, ...critical, 1], roots = critical.filter(t => Math.abs(evalPoly(p, t)) < scale * 1e-10);
	for (let i = 1; i < grid.length; i++) {
		let a = grid[i - 1], b = grid[i], fa = evalPoly(p, a);
		const fb = evalPoly(p, b);
		if (fa * fb >= 0)
			continue;
		for (let j = 0; j < 60; j++) {
			const m = (a + b) / 2, f = evalPoly(p, m);
			if (fa * f <= 0) {
				b = m;
			}
			else {
				a = m;
				fa = f;
			}
		}
		roots.push((a + b) / 2);
	}
	return [...new Set(roots.map(x => +x.toFixed(12)))].sort((a, b) => a - b);
}

function bbox(points: ReadonlyArray<Point>): Box {
	let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
	for (const [x, y] of points) {
		x0 = Math.min(x0, x);
		y0 = Math.min(y0, y);
		x1 = Math.max(x1, x);
		y1 = Math.max(y1, y);
	}
	return [x0, y0, x1, y1];
}

function boxDistanceForComparison(a: Box, b: Box, limit: number) {
	const x = Math.max(0, a[0] - b[2], b[0] - a[2]), y = Math.max(0, a[1] - b[3], b[1] - a[3]);
	if (x > limit && y >= 0)
		return x;
	if (y > limit && x >= 0)
		return y;
	return Math.hypot(x, y);
}

function* nearbyPairs(items: ReadonlyArray<ReadonlyArray<Point>>, radius = 0): Generator<Pair> {
	const boxes = items.map((p, i) => ({ box: bbox(p), i })).sort((a, b) => a.box[0] - b.box[0]);
	for (let i = 0; i < boxes.length; i++)
		for (let j = i + 1; j < boxes.length && boxes[j].box[0] <= boxes[i].box[2] + radius; j++) {
			if (boxDistanceForComparison(boxes[i].box, boxes[j].box, radius) <= radius)
				yield [boxes[i].i, boxes[j].i];
		}
}

/** A continuous path whose derivative control vectors fit a right-angle cone
 * cannot satisfy this return rule. Its chord is at least arc / sqrt(2).
 * The two partial flattening intervals can overestimate arc by at most 2/5
 * of the margin; (2 - 2/5) / sqrt(2) is still greater than 1. This bound relies
 * on the margin/5 maximum flattening step and the 2*margin arc threshold below.
 * Exact continuity and every nonzero derivative control vector are checked.
 */
export function excludesReturnByCone(curves: ReadonlyArray<ReturnCurveLike>) {
	const angles: number[] = [];
	let previous: Point | null = null;
	for (const curve of curves) {
		const p = curve.p;
		if (p.some(q => q.some(v => !Number.isFinite(v))))
			return false;
		if (previous && (previous[0] !== p[0][0] || previous[1] !== p[0][1]))
			return false;
		previous = p[3];
		for (let k = 1; k < 4; k++) {
			const dx = p[k][0] - p[k - 1][0], dy = p[k][1] - p[k - 1][1];
			if (!Number.isFinite(dx) || !Number.isFinite(dy))
				return false;
			if (dx !== 0 || dy !== 0)
				angles.push(Math.atan2(dy, dx));
		}
	}
	if (angles.length < 2)
		return true;
	angles.sort((a, b) => a - b);
	let gap = angles[0] + 2 * Math.PI - angles.at(-1)!;
	for (let i = 1; i < angles.length; i++)
		gap = Math.max(gap, angles[i] - angles[i - 1]);
	return 2 * Math.PI - gap <= Math.PI / 2;
}

/** Bounded numerical search for a cut that returns close to itself.
 * Candidate distances use both curve branches, including adjacent cubics.
 * A stationary close pair or a close path turning at least 180 degrees counts
 * as a return. Exact subdivision should not create a new sharp bend.
 * These numerical predicates are experimental, not a paper-strength proof.
 * Broad crossing/clearance checks and editor validation remain separate.
 */
function project(p: Point, a: Point, b: Point): { t: number; point: Point ;} {
	const d = sub(b, a), t = clamp(dot(sub(p, a), d) / (dot(d, d) || 1), 0, 1);
	return { t, point: [a[0] + t * d[0], a[1] + t * d[1]] };
}

function closest(a: Point, b: Point, c: Point, d: Point): Estimate {
	let best: Estimate | null = null;
	const retain = (u: number, v: number, p: Point, q: Point) => {
		const gap = distance(p, q);
		if (!best || gap < best.gap)
			best = { u, v, gap };
	};
	for (const [p, u] of [[a, 0], [b, 1]] as Array<[Point, number]>) {
		const q = project(p, c, d);
		retain(u, q.t, p, q.point);
	}
	for (const [p, v] of [[c, 0], [d, 1]] as Array<[Point, number]>) {
		const q = project(p, a, b);
		retain(q.t, v, q.point, p);
	}
	return best!;
}

function localMinimum(curves: ReadonlyArray<ReturnCurveLike>, index: number, t: number, delta: Point) {
	const directions: Array<{ tangent: Point; sign: number ;}> = [];
	const add = (curve: ReturnCurveLike, at: number, sign: number) => {
		let tangent = curve.derivative(at);
		if (Math.hypot(...tangent) < 1e-9)
			tangent = sub(curve.point(Math.min(1, at + 1e-4)), curve.point(Math.max(0, at - 1e-4)));
		directions.push({ tangent, sign });
	};
	if (t > 1e-5)
		add(curves[index], t, -1);
	else
		if (index > 0)
			add(curves[index - 1], 1, -1);
	if (t < 1 - 1e-5)
		add(curves[index], t, 1);
	else
		if (index + 1 < curves.length)
			add(curves[index + 1], 0, 1);
	return directions.every(({ tangent, sign }) => sign * dot(delta, tangent) >= -1e-3 * Math.hypot(...delta) * Math.hypot(...tangent));
}

function totalTurning(curves: ReadonlyArray<ReturnCurveLike>, first: number, last: number, parameters: Pair, cache: WeakMap<ReturnCurveLike, TurningData> | null = null) {
	const directions: Point[] = [];
	for (let index = first; index <= last; index++) {
		const curve = curves[index], p = curve.p;
		const lo = index === first ? parameters[0] : 0, hi = index === last ? parameters[1] : 1;
		let data = cache?.get(curve);
		if (!data) {
			const d = [0, 1].map(k => [3 * (p[1][k] - p[0][k]), 6 * (p[2][k] - 2 * p[1][k] + p[0][k]), 3 * (p[3][k] - 3 * p[2][k] + 3 * p[1][k] - p[0][k])]);
			const v = [0, 1, 2].map(i => d.map(axis => axis[i]) as Point);
			const turns = [cross(v[0], v[1]), 2 * cross(v[0], v[2]), cross(v[1], v[2])];
			data = { roots: [...realRoots01(d[0]), ...realRoots01(d[1]), ...realRoots01(turns)], fallback: v[2] };
			cache?.set(curve, data);
		}
		// Axis roots prevent angle wrapping; curvature roots separate changes in
		// turn direction. These are floating-point polynomial roots, not a proof.
		const knots = [lo, ...data.roots.filter(t => t > lo && t < hi).sort((a, b) => a - b), hi];
		const tangent = (t: number, side: number): Point => {
			let value = curve.derivative(t);
			if (Math.hypot(...value) < 1e-9) {
				value = curve.second(t).map(x => x * side) as Point;
				if (Math.hypot(...value) < 1e-9)
					value = data.fallback;
			}
			return value;
		};
		if (lo === hi)
			directions.push(tangent(lo, lo === 1 ? -1 : 1));
		for (let k = 1; k < knots.length; k++)
			directions.push(tangent(knots[k - 1], 1), tangent(knots[k], -1));
	}
	return directions.slice(1).reduce((sum, d, i) => sum + Math.abs(Math.atan2(cross(directions[i], d), dot(directions[i], d))) * 180 / Math.PI, 0);
}

function polish(a: ReturnCurveLike, b: ReturnCurveLike, ta: Pair, tb: Pair, u: number, v: number): Pair {
	let cost = distance(a.point(u), b.point(v)) ** 2;
	for (let iteration = 0; iteration < 20; iteration++) {
		const delta = sub(a.point(u), b.point(v)), du = a.derivative(u), dv = b.derivative(v), gu = dot(delta, du), gv = -dot(delta, dv);
		const aa = dot(du, du) + dot(delta, a.second(u)), bb = dot(dv, dv) - dot(delta, b.second(v)), ab = -dot(du, dv), det = aa * bb - ab * ab;
		const nu = aa > 0 && bb > 0 && det > 1e-12 ? (bb * gu - ab * gv) / det : gu / (dot(du, du) || 1);
		const nv = aa > 0 && bb > 0 && det > 1e-12 ? (aa * gv - ab * gu) / det : gv / (dot(dv, dv) || 1);
		let accepted = false;
		for (let step = 1; step > 1e-6; step /= 2) {
			const pu = clamp(u - step * nu, ...ta), pv = clamp(v - step * nv, ...tb), next = distance(a.point(pu), b.point(pv)) ** 2;
			if (next < cost - 1e-16) {
				u = pu;
				v = pv;
				cost = next;
				accepted = true;
				break;
			}
		}
		if (!accepted)
			break;
	}
	return [u, v];
}

function* turningBoundaryCandidates(curves: ReadonlyArray<ReturnCurveLike>, a: Interval, b: Interval, margin: number, local: number, cache: WeakMap<ReturnCurveLike, TurningData>): Generator<Pair> {
	// Turning increases as the later point moves forward and decreases as the
	// earlier point moves forward. Search that feasible boundary, rather than
	// hoping a flattening sample happens to land on its narrow valid interval.
	const turning = (u: number, v: number) => totalTurning(curves, a.order, b.order, [u, v], cache);
	if (turning(a.ts[0], b.ts[1]) < 180)
		return;
	const ta = a.ts[1] - a.ts[0], tb = b.ts[1] - b.ts[0];
	const lo = a.ts[0] + ta * clamp((b.arc - local - a.arc) / a.length, 0, 1);
	const hi = a.ts[0] + ta * clamp((b.arc + b.length - 2 * margin - a.arc) / a.length, 0, 1);
	if (hi < lo)
		return;
	const evaluate = (u: number): Evaluation => {
		const arc = a.arc + (u - a.ts[0]) / ta * a.length;
		if (b.arc + b.length < arc + 2 * margin || b.arc > arc + local)
			return { cost: Infinity };
		let lower = b.ts[0] + tb * clamp((arc + 2 * margin - b.arc) / b.length, 0, 1);
		const upper = b.ts[0] + tb * clamp((arc + local - b.arc) / b.length, 0, 1);
		if (turning(u, upper) < 180)
			return { cost: Infinity };
		if (turning(u, lower) < 180) {
			let below = lower, above = upper;
			for (let i = 0; i < 28; i++) {
				const middle = (below + above) / 2;
				if (turning(u, middle) < 180)
					below = middle;
				else
					above = middle;
			}
			lower = above;
		}
		const parameters = polish(curves[a.order], curves[b.order], [u, u], [lower, upper], u, lower);
		return { parameters, cost: distance(curves[a.order].point(parameters[0]), curves[b.order].point(parameters[1])) };
	};
	for (const u of [lo, (lo + hi) / 2, hi]) {
		const result = evaluate(u);
		if (result.cost < margin)
			yield result.parameters!;
	}
	// The small, flattened intervals make a bounded one-dimensional search a
	// useful supplement. It remains numerical, not a global clearance proof.
	let left = lo, right = hi;
	const ratio = (Math.sqrt(5) - 1) / 2;
	let u = right - ratio * (right - left), v = left + ratio * (right - left), aValue = evaluate(u), bValue = evaluate(v);
	for (let i = 0; i < 18; i++) {
		for (const result of [aValue, bValue])
			if (result.cost < margin)
				yield result.parameters!;
		if (aValue.cost < bValue.cost) {
			right = v;
			v = u;
			bValue = aValue;
			u = right - ratio * (right - left);
			aValue = evaluate(u);
		}
		else {
			left = u;
			u = v;
			aValue = bValue;
			v = left + ratio * (right - left);
			bValue = evaluate(v);
		}
	}
}

export function pathReturns(curves: ReadonlyArray<ReturnCurveLike>, { margin, local = Infinity, tolerance = .01, endpointTolerance = 0 }: ReturnOptions): ReturnWitness[] {
	const cache = new WeakMap<ReturnCurveLike, TurningData>(), issues: ReturnWitness[] = [], segments: Interval[] = [];
	let arc = 0;
	if (!(margin > 0) || local < 2 * margin || !curves.length || excludesReturnByCone(curves))
		return issues;
	curves.forEach((curve, order) => {
		const { points, ts } = curve.flatten(tolerance, margin / 5, true);
		for (let i = 1; i < points.length; i++) {
			const length = distance(points[i - 1], points[i]);
			if (length < 1e-10)
				continue;
			segments.push({ p: [points[i - 1], points[i]], ts: [ts[i - 1], ts[i]], arc, length, order });
			arc += length;
		}
	});
	const found = new Set<string>();
	let reversedCurves: ReturnCurveLike[] | null = null;
	for (const [i, j] of nearbyPairs(segments.map(s => s.p), margin)) {
		const [a, b] = segments[i].arc < segments[j].arc ? [segments[i], segments[j]] : [segments[j], segments[i]];
		if (found.has(`${a.order}:${b.order}`))
			continue;
		if (b.arc + b.length - a.arc < 2 * margin || b.arc - a.arc - a.length > local)
			continue;
		const q = closest(...a.p, ...b.p);
		if (q.gap >= margin)
			continue;
		const nearest = polish(curves[a.order], curves[b.order], a.ts, b.ts, a.ts[0] + q.u * (a.ts[1] - a.ts[0]), b.ts[0] + q.v * (b.ts[1] - b.ts[0]));
		// The nearest pair need not satisfy the turning constraint. Other points
		// in the same close interval can form a return even while that pair is an
		// ordinary bend. Preserve those witnesses instead of discarding the pair.
		function* candidates(): Generator<Pair> {
			yield nearest;
			for (const u of [a.ts[0], (a.ts[0] + a.ts[1]) / 2, a.ts[1]])
				for (const v of [b.ts[0], (b.ts[0] + b.ts[1]) / 2, b.ts[1]])
					yield [u, v];
			yield* turningBoundaryCandidates(curves, a, b, margin, local, cache);
			// Reversing a cut swaps which point is held fixed by the one-dimensional
			// search. Probe both parameter axes so that a reflected/reversed path
			// cannot hide a feasible boundary interval on the other branch.
			reversedCurves ??= curves.toReversed().map(c => c.reversed());
			const reverse = (s: Interval): Interval => ({ ...s, order: curves.length - 1 - s.order, ts: [1 - s.ts[1], 1 - s.ts[0]], arc: arc - s.arc - s.length });
			for (const [u, v] of turningBoundaryCandidates(reversedCurves, reverse(b), reverse(a), margin, local, cache))
				yield [1 - v, 1 - u];
		}
		for (const parameters of candidates()) {
			const u = (parameters[0] - a.ts[0]) / (a.ts[1] - a.ts[0]), v = (parameters[1] - b.ts[0]) / (b.ts[1] - b.ts[0]);
			const along = b.arc + v * b.length - a.arc - u * a.length;
			if (along < 2 * margin || along > local)
				continue;
			const points: [Point, Point] = [curves[a.order].point(parameters[0]), curves[b.order].point(parameters[1])], gap = distance(...points);
			if (gap >= margin)
				continue;
			if (points.some(p => [curves[0].p[0], curves.at(-1)!.p[3]].some(end => distance(p, end) < endpointTolerance)))
				continue;
			const delta = sub(...points);
			const stationary = localMinimum(curves, a.order, parameters[0], delta) && localMinimum(curves, b.order, parameters[1], delta.map(v => -v) as Point);
			const turning = stationary ? null : totalTurning(curves, a.order, b.order, parameters, cache);
			if (!stationary && turning !== null && turning < 180 - 1e-6)
				continue;
			const key = `${a.order}:${b.order}`;
			if (found.has(key))
				continue;
			found.add(key);
			issues.push({ curves: [a.order, b.order], parameters, points, distanceUpper: gap, required: margin, arcSeparation: along, stationary, totalTurning: turning });
			break;
		}
		if (found.size >= 4)
			break;
	}
	return issues;
}

