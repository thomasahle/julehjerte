import { type Ring, type Point, cross, sub } from './geometry';

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
