import { type Ring, type Point, cross, sub, dot, mix, distance, inside } from './geometry';

/** Check complete outline segments against a possibly concave frame. Testing
 * vertices or a few samples can miss an excursion through a narrow scallop. */
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
