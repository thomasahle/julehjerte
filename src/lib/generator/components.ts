import {
	forest, centroid, area, sub, dot, inside, distance, mix, frameRing, ray,
	uprightToSheet, fourPortMotif, connectCellGrid, compile, ConstructionError,
	type Ring, type Point, type Edge, type Contour, type Frame
} from './geometry';
import { clipContours, stitch, filledSeamGate } from './panels';
import { rerouteSharedCuts } from './sharedCuts';
import { gridClearance } from '$lib/geometry/clearance';

const contoursOf = (node: Contour): Ring[] => [node.ring, ...node.children.flatMap(contoursOf)];

/** Give separate motif islands their own cells instead of clipping all of them
 * with the same rectangular dividers. Counters stay with their parent island.
 * An odd island count divides the largest island into two neighbouring cells. */
export function generateComponentFigure(rings: Ring[], frame: Frame = 'circle', size = 70, scale = .7,
	style: 'rays' | 'check' | 'plain' = 'rays', route = fourPortMotif) {
	const upright = rings.map(r => r.map(([x, y]): Point => [
		x * size * scale * (frame === 'oval' ? .75 : 1), y * size * scale * (frame === 'oval' ? .75 : 1)
	]));
	const nodes = forest(upright);
	if (nodes.length < 2 || nodes.length > 8)
		throw new ConstructionError('topology', 'Component grid needs 2–8 islands');
	const parts = nodes.map(contoursOf);
	let split: number | undefined, splitParts: Ring[][] = [];
	if (parts.length % 2) {
		const biggest = nodes.reduce((a, b) => Math.abs(area(a.ring)) > Math.abs(area(b.ring)) ? a : b),
			i = nodes.indexOf(biggest);
		split = centroid(biggest.ring)[0];
		const left = clipContours(parts[i], split, true), right = clipContours(parts[i], split, false);
		if (!left.length || !right.length) throw new ConstructionError('topology', 'Empty component panel');
		splitParts = [left, right];
		parts.splice(i, 1, left, right);
	}
	parts.sort((a, b) => centroid(a.flat())[1] - centroid(b.flat())[1]);
	const matrix: Ring[][][] = [];
	for (let i = 0; i < parts.length; i += 2)
		matrix.push(parts.slice(i, i + 2).sort((a, b) => centroid(a.flat())[0] - centroid(b.flat())[0]));
	const rows = matrix.length, boundary = frameRing(frame, size), margin = gridClearance(rows + 3),
		cells: Point[][][] = matrix.map(row => row.map(() => []));
	const contact = (a: Ring[], b: Ring[]): Point => {
		if (split !== undefined && splitParts.includes(a) && splitParts.includes(b)) {
			const p = filledSeamGate(a, 0, split, (centroid(a.flat())[1] + centroid(b.flat())[1]) / 2);
			if (p) return p;
		}
		let best = Infinity, p: Point = [0, 0];
		const rootsA = forest(a).map(n => n.ring), rootsB = forest(b).map(n => n.ring);
		for (const [first, second] of [[rootsA, rootsB], [rootsB, rootsA]])
			for (const r of first) for (const u of r) for (const s of second) for (let i = 0; i < s.length; i++) {
				const v = s[i], w = s[(i + 1) % s.length], d = sub(w, v),
					t = Math.max(0, Math.min(1, dot(sub(u, v), d) / Math.max(1e-20, dot(d, d)))),
					q = mix(v, w, t), gap = distance(u, q);
				if (gap < best) { best = gap; p = mix(u, q, .5); }
			}
		const obstacles = parts.filter(part => part !== a && part !== b).flat();
		const segmentDistance = (p: Point, a: Point, b: Point) => {
			const d = sub(b, a), t = Math.max(0, Math.min(1, dot(sub(p, a), d) / Math.max(1e-20, dot(d, d))));
			return distance(p, mix(a, b, t));
		};
		const clear = (p: Point) => !obstacles.some(r => inside(p, r) ||
			r.some((a, i) => segmentDistance(p, a, r[(i + 1) % r.length]) < margin * 1.5));
		if (!clear(p)) {
			// A third island can occupy the midpoint. Move the shared gate into
			// the surrounding space, then route its connections around obstacles.
			const vector = sub(centroid(b.flat()), centroid(a.flat())), length = Math.hypot(...vector);
			if (length > 1e-7) {
				const normal: Point = [-vector[1] / length, vector[0] / length], origin = p;
				let found = false;
				for (let i = 1; i <= 40 && !found; i++) for (const sign of [-1, 1]) {
					const candidate: Point = [origin[0] + normal[0] * i * margin * sign, origin[1] + normal[1] * i * margin * sign];
					if (clear(candidate)) { p = candidate; found = true; break; }
				}
			}
		}
		return uprightToSheet(p);
	};
	const exterior = (side: number, index: number, count: number) => {
		const step = Math.PI / (2 * count), angle = side === 0 ? Math.PI + (index + .5) * step
			: side === 2 ? Math.PI / 2 - (index + .5) * step
				: side === 3 ? Math.PI - (index + .5) * step : 3 * Math.PI / 2 + (index + .5) * step;
		return ray(boundary, [50, 50], angle).point;
	};
	for (let row = 0; row < rows; row++) for (let col = 0; col < 2; col++) {
		const gates = cells[row][col], part = matrix[row][col];
		gates[0] = row ? cells[row - 1][col][2] : exterior(0, col, 2);
		gates[3] = col ? cells[row][col - 1][1] : exterior(3, row, rows);
		gates[1] = col === 0 ? contact(part, matrix[row][1]) : exterior(1, row, rows);
		gates[2] = row < rows - 1 ? contact(part, matrix[row + 1][col]) : exterior(2, col, 2);
	}
	let edges: Edge[] = [];
	for (let row = 0; row < rows; row++) for (let col = 0; col < 2; col++) {
		const contours = matrix[row][col].map(r => r.map(uprightToSheet)), gates = cells[row][col],
			center = centroid(contours.flat());
		route(edges, contours, gates, gates.map(p => Math.atan2(center[1] - p[1], center[0] - p[0])), margin);
	}
	if (split !== undefined) edges = stitch(edges, [split]);
	connectCellGrid(edges, cells, boundary, style, true);
	edges = rerouteSharedCuts(edges, margin);
	const artwork = upright.map(r => r.map(uprightToSheet));
	return { edges, artwork, geometry: compile(edges), domain: [boundary] };
}
