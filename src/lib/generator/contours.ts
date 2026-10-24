import { type Ring, type Point, cross, sub, dot, mix, distance, inside } from './geometry';

/** Check complete outline segments against a frame, which need not be convex.
 * Testing vertices or a few samples can miss an excursion between them. */
export function contoursWithinBoundary(rings: Ring[], boundary: Ring): boolean {
	if (boundary.length < 3) return false;
	const edges = boundary.map((a, i) => ({ a, b: boundary[(i + 1) % boundary.length] }));
	const contains = (point: Point) => inside(point, boundary) || edges.some(({ a, b }) => {
		const d = sub(b, a), t = Math.max(0, Math.min(1, dot(sub(point, a), d) / Math.max(1e-20, dot(d, d))));
		return distance(point, mix(a, b, t)) < 1e-7;
	});
	for (const ring of rings) for (const [i, a] of ring.entries()) {
		if (!contains(a)) return false;
		const b = ring[(i + 1) % ring.length], d = sub(b, a), splits = [0, 1];
		for (const { a: u, b: v } of edges) {
			const e = sub(v, u), denominator = cross(d, e);
			if (Math.abs(denominator) < 1e-12) continue;
			const q = sub(u, a), t = cross(q, e) / denominator, s = cross(q, d) / denominator;
			if (t > 0 && t < 1 && s >= 0 && s <= 1) splits.push(t);
		}
		splits.sort((a, b) => a - b);
		for (let j = 1; j < splits.length; j++)
			if (!contains(mix(a, b, (splits[j - 1] + splits[j]) / 2))) return false;
	}
	return true;
}

/** Rounded catalogue coordinates can repeat a vertex or collapse a contour.
 * Split a closed walk at repeated vertices without moving any edge. The
 * resulting cycles have exactly the same even-odd fill as the source walk. */
export function normalizeContours(rings: Ring[]): Ring[] {
	const result: Ring[] = [];
	for (const source of rings) {
		if (!source.length) continue;
		const stack: Point[] = [], indices = new Map<string, number>();
		for (const p of [...source, source[0]]) {
			const key = p.join(','), index = indices.get(key);
			if (index === undefined) {
				indices.set(key, stack.length);
				stack.push(p);
				continue;
			}
			const cycle = stack.slice(index);
			if (cycle.length >= 3 && cycle.some(q => cross(sub(q, cycle[0]), sub(cycle[1], cycle[0])) !== 0)) result.push(cycle);
			for (const q of stack.splice(index + 1)) indices.delete(q.join(','));
		}
	}
	// Leave already clean contour arrays as-is.
	return result.length === rings.length && result.every((r, i) => r.length === rings[i].length && r.every((p, j) => p === rings[i][j])) ? rings : result;
}

/** A catalogue path can overshoot a corner and come back along itself, a
 * spur thinner than a 400th of the motif where the outline turns back past
 * 150°. It draws nothing anyone sees, but every cut along it turns there, a
 * needle of paper. Leave out such a vertex, or it and a neighbour, where they
 * lie along the line that replaces them and that leaves fewer needles nearby;
 * trimming the motif's own point would only move its needle along, so a
 * point keeps its vertices. */
export function withoutSpurs(rings: Ring[]): Ring[] {
	const points = rings.flat();
	if (!points.length) return rings;
	const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
	const width = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) / 400;
	let changed = false;
	const result = rings.map(ring => {
		let r = [...ring];
		const at = (k: number) => r[(k % r.length + r.length) % r.length];
		const needle = (k: number) => {
			const a = sub(at(k), at(k - 1)), b = sub(at(k + 1), at(k));
			return !!(a[0] || a[1]) && !!(b[0] || b[1]) && Math.atan2(Math.abs(cross(a, b)), dot(a, b)) > 5 * Math.PI / 6;
		};
		const thin = (k: number) => {
			const a = sub(at(k), at(k - 1)), b = sub(at(k + 1), at(k));
			return Math.abs(cross(a, b)) / Math.max(Math.hypot(...a), Math.hypot(...b)) < width;
		};
		const needles = (from: number, to: number) => {
			let n = 0;
			for (let k = from; k <= to; k++) n += Number(needle(k));
			return n;
		};
		for (let i = 0; i < r.length && r.length > 4;) {
			if (!needle(i) || !thin(i)) { i++; continue; }
			let kept = false;
			for (const [first, count] of [[i, 1], [i, 2], [i - 1, 2]]) {
				// The vertices left out lie along the line that replaces them.
				const from = at(first - 1), to = at(first + count), d = sub(to, from), length = Math.hypot(...d);
				if (!length || Array.from({ length: count }, (_, k) => at(first + k))
					.some(p => Math.abs(cross(d, sub(p, from))) / length >= width)) continue;
				const before = needles(first - 2, first + count + 1), saved = r;
				const start = (first % r.length + r.length) % r.length;
				r = start + count <= r.length ? [...r.slice(0, start), ...r.slice(start + count)]
					: r.slice((start + count) % r.length, start);
				// The same vertices around the join, now one line apart.
				const join = r.indexOf(from);
				if (needles(join - 1, join + 2) < before) {
					kept = true;
					i = Math.max(0, join - 1);
					break;
				}
				r = saved;
			}
			if (kept) changed = true;
			else i++;
		}
		return r;
	});
	return changed ? result : rings;
}
