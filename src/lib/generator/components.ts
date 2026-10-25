import {
	forest, centroid, area, sub, dot, inside, distance, mix, frameRing, ray,
	uprightToSheet, fourPortMotif, connectCellGrid, compile, convexEnvelope, ConstructionError,
	type Ring, type Point, type Edge, type Contour, type Frame, type OpenFrame
} from './geometry';
import { clipContours, stitch, filledSeamGate } from './panels';
import { rerouteSharedCuts } from './sharedCuts';
import { gridClearance } from '$lib/geometry/clearance';

const contoursOf = (node: Contour): Ring[] => [node.ring, ...node.children.flatMap(contoursOf)];

/** Give separate motif islands their own cells instead of clipping all of them
 * with the same rectangular dividers. Counters stay with their parent island.
 * Divide the largest islands until every row is full. A wider grid can keep
 * small neighbouring islands separate while sharing a larger body below them.
 * Optional fitted-envelope padding is measured in local clearance units. */
export function generateComponentFigure(rings: Ring[], frame: Frame | OpenFrame = 'circle', size = 70, scale = .7,
	style: 'rays' | 'check' = 'rays', route = fourPortMotif, columns: 2 | 3 | 4 = 2, extraStrips = 0,
	wideContacts = false, spread = true, envelopePadding = 0) {
	const upright = rings.map(r => r.map(([x, y]): Point => [
		x * size * scale, y * size * scale
	]));
	const nodes = forest(upright);
	if (nodes.length < 2 || nodes.length > 8)
		throw new ConstructionError('topology', 'Component grid needs 2–8 islands');
	const parts = nodes.map(contoursOf);
	const sources = new Map(parts.map((part, i) => [part, i]));
	const splits: number[] = [];
	const weight = (part: Ring[]) => forest(part).reduce((sum, node) => sum + Math.abs(area(node.ring)), 0);
	while (parts.length % columns) {
		const biggest = parts.reduce((a, b) => weight(a) > weight(b) ? a : b), i = parts.indexOf(biggest);
		const split = centroid(biggest.flat())[0];
		const left = clipContours(biggest, split, true), right = clipContours(biggest, split, false);
		if (!left.length || !right.length) throw new ConstructionError('topology', 'Empty component panel');
		for (const part of [left, right]) sources.set(part, sources.get(biggest)!);
		parts.splice(i, 1, left, right);
		splits.push(split);
	}
	parts.sort((a, b) => centroid(a.flat())[1] - centroid(b.flat())[1]);
	const matrix: Ring[][][] = [];
	for (let i = 0; i < parts.length; i += columns)
		matrix.push(parts.slice(i, i + columns).sort((a, b) => centroid(a.flat())[0] - centroid(b.flat())[0]));
	const open = typeof frame === 'string' ? undefined : frame,
		rows = matrix.length, boundary = open ? undefined : frameRing(frame as Frame, size), margin = gridClearance(rows + columns + 1 + extraStrips),
		cells: Point[][][] = matrix.map(row => row.map(() => []));
	const contact = (a: Ring[], b: Ring[]): Point => {
		// Split neighbours must meet inside their common filled seam, not
		// at the nearest point on an unrelated island or counter.
		if (sources.get(a) === sources.get(b)) {
			const xsA = a.flat().map(p => p[0]), xsB = b.flat().map(p => p[0]);
			for (const split of splits) if (
				Math.abs(Math.max(...xsA) - split) < 1e-6 && Math.abs(Math.min(...xsB) - split) < 1e-6 ||
				Math.abs(Math.max(...xsB) - split) < 1e-6 && Math.abs(Math.min(...xsA) - split) < 1e-6
			) {
				const p = filledSeamGate(a, 0, split, (centroid(a.flat())[1] + centroid(b.flat())[1]) / 2);
				if (p) return p;
			}
		}
		let best = Infinity, p: Point = [0, 0];
		const alternatives: { point: Point; gap: number }[] = [];
		const rootsA = forest(a).map(n => n.ring), rootsB = forest(b).map(n => n.ring);
		for (const [first, second] of [[rootsA, rootsB], [rootsB, rootsA]])
			for (const r of first) for (const u of r) for (const s of second) for (let i = 0; i < s.length; i++) {
				const v = s[i], w = s[(i + 1) % s.length], d = sub(w, v),
					t = Math.max(0, Math.min(1, dot(sub(u, v), d) / Math.max(1e-20, dot(d, d)))),
					q = mix(v, w, t), gap = distance(u, q);
				if (gap < best) { best = gap; p = mix(u, q, .5); }
				if (wideContacts && gap >= margin * 3) alternatives.push({ point: mix(u, q, .5), gap });
			}
		const obstacles = parts.filter(part => part !== a && part !== b).flat();
		if (wideContacts) obstacles.push(...rootsA, ...rootsB);
		const segmentDistance = (p: Point, a: Point, b: Point) => {
			const d = sub(b, a), t = Math.max(0, Math.min(1, dot(sub(p, a), d) / Math.max(1e-20, dot(d, d))));
			return distance(p, mix(a, b, t));
		};
		// Thousands of candidate joins are tried against every other island:
		// the outlines' segments go into a grid of cells as wide as the
		// clearance, so the segments within it of a point are those in its
		// cell and the eight around it, and a point beyond an island's box by
		// the clearance cannot be inside it.
		const reach = margin * 1.5, cells = new Map<number, [Point, Point][]>();
		const key = (x: number, y: number) => x * 65536 + y;
		for (const r of obstacles) for (let i = 0; i < r.length; i++) {
			const u = r[i]!, w = r[(i + 1) % r.length]!;
			for (let x = Math.floor(Math.min(u[0], w[0]) / reach); x <= Math.floor(Math.max(u[0], w[0]) / reach); x++)
				for (let y = Math.floor(Math.min(u[1], w[1]) / reach); y <= Math.floor(Math.max(u[1], w[1]) / reach); y++) {
					const list = cells.get(key(x, y));
					if (list) list.push([u, w]);
					else cells.set(key(x, y), [[u, w]]);
				}
		}
		const boxes = obstacles.map(r => {
			const xs = r.map(p => p[0]), ys = r.map(p => p[1]);
			return [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
		});
		const near = (p: Point) => {
			const x = Math.floor(p[0] / reach), y = Math.floor(p[1] / reach);
			for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++)
				for (const [u, w] of cells.get(key(x + dx, y + dy)) ?? []) if (segmentDistance(p, u, w) < reach) return true;
			return false;
		};
		const clear = (p: Point) => !near(p) && !obstacles.some((r, k) => {
			const [x0, x1, y0, y1] = boxes[k]!;
			return p[0] >= x0 && p[0] <= x1 && p[1] >= y0 && p[1] <= y1 && inside(p, r);
		});
		if (!clear(p)) {
			// Closest points can lie in a pinched gap between two toes. Prefer
			// a short join whose midpoint clears both participating outlines
			// as well as the other islands. Moving only normal to the closest
			// pair can put the gate on the wrong side of either component.
			const alternative = alternatives.sort((a, b) => a.gap - b.gap)
				.find(candidate => clear(candidate.point));
			if (alternative) return uprightToSheet(alternative.point);
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
	const envelope = boundary ?? convexEnvelope(upright.flat().map(uprightToSheet), margin * envelopePadding + (open?.gap ?? 0));
	const origin: Point = boundary ? [50, 50] : [
		envelope.reduce((sum, p) => sum + p[0], 0) / envelope.length,
		envelope.reduce((sum, p) => sum + p[1], 0) / envelope.length
	];
	const exterior = (side: number, index: number, count: number) => {
		const step = Math.PI / (2 * count), angle = side === 0 ? Math.PI + (index + .5) * step
			: side === 2 ? Math.PI / 2 - (index + .5) * step
				: side === 3 ? Math.PI - (index + .5) * step : 3 * Math.PI / 2 + (index + .5) * step;
		return ray(envelope, origin, angle).point;
	};
	for (let row = 0; row < rows; row++) for (let col = 0; col < columns; col++) {
		const gates = cells[row][col], part = matrix[row][col];
		gates[0] = row ? cells[row - 1][col][2] : exterior(0, col, columns);
		gates[3] = col ? cells[row][col - 1][1] : exterior(3, row, rows);
		gates[1] = col < columns - 1 ? contact(part, matrix[row][col + 1]) : exterior(1, row, rows);
		gates[2] = row < rows - 1 ? contact(part, matrix[row + 1][col]) : exterior(2, col, columns);
	}
	let edges: Edge[] = [];
	for (let row = 0; row < rows; row++) for (let col = 0; col < columns; col++) {
		const contours = matrix[row][col].map(r => r.map(uprightToSheet)), gates = cells[row][col],
			center = centroid(contours.flat());
		route(edges, contours, gates, gates.map(p => Math.atan2(center[1] - p[1], center[0] - p[0])), margin);
	}
	if (splits.length) edges = stitch(edges, [...new Set(splits)].sort((a, b) => a - b));
	connectCellGrid(edges, cells, boundary, style, spread, open);
	edges = rerouteSharedCuts(edges, margin);
	const artwork = upright.map(r => r.map(uprightToSheet));
	return { edges, artwork, geometry: compile(edges), domain: [envelope] };
}
