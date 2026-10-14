import { gridClearance } from '$lib/geometry/clearance';
/** Divide a complicated motif into neighbouring woven cells. Clipped boundaries
 * are not visible seams: the two cells contribute opposite sheet families there,
 * producing exactly coincident cuts after the pieces are stitched together. */
import {
	ConstructionError,
	type Ring,
	type Point,
	type Edge,
	type Frame,
	near,
	area,
	mix,
	add,
	compile,
	frameRing,
	uprightToSheet,
	fourPortMotif,
	connectCellGrid
} from './geometry';

const key = (p: Point) => p.map((x) => x.toFixed(6)).join(',');

/** Clip an even-odd contour forest, joining crossings in filled-interval order.
 * Unlike clipping rings separately, this opens holes that meet the divider and
 * keeps all disconnected pieces. Every retained vertex must have degree two. */
export function clipContours(rings: Ring[], x: number, left: boolean): Ring[] {
	const edges: [Point, Point][] = [];
	const keep = (p: Point) => (left ? p[0] <= x : p[0] >= x);
	for (const r of rings)
		for (const [i, a] of r.entries()) {
			const b = r[(i + 1) % r.length],
				ka = keep(a),
				kb = keep(b);
			if (ka && kb) {
				if (!near(a, b)) edges.push([a, b]);
			} else if (ka !== kb) {
				const p = mix(a, b, (x - a[0]) / (b[0] - a[0]));
				p[0] = x;
				const pair: [Point, Point] = ka ? [a, p] : [p, b];
				if (!near(...pair)) edges.push(pair);
			}
		}
	const adjacency = () => {
		const map = new Map<string, number[]>();
		for (const [i, pair] of edges.entries())
			for (const p of pair) map.set(key(p), [...(map.get(key(p)) ?? []), i]);
		return map;
	};
	let adj = adjacency();
	const ends = [...adj.entries()]
		.filter(([, ids]) => ids.length === 1)
		.map(([k, ids]) => edges[ids[0]].find((p) => key(p) === k)!)
		.sort((a, b) => a[1] - b[1]);
	if (ends.length % 2)
		throw new ConstructionError('topology', 'Unpaired clipping intersection');
	for (let i = 0; i < ends.length; i += 2) edges.push([ends[i], ends[i + 1]]);
	adj = adjacency();
	if ([...adj.values()].some((ids) => ids.length !== 2))
		throw new ConstructionError('topology', 'Ambiguous clipping vertex');
	const used = new Set<number>(),
		result: Ring[] = [];
	for (let start = 0; start < edges.length; start++) {
		if (used.has(start)) continue;
		let p = edges[start][0];
		const ring: Ring = [];
		for (;;) {
			ring.push(p);
			const i = adj.get(key(p))!.find((i) => !used.has(i));
			if (i === undefined) break;
			used.add(i);
			const e = edges[i];
			p = key(e[0]) === key(p) ? e[1] : e[0];
			if (key(p) === key(ring[0])) break;
		}
		if (key(p) !== key(ring[0]))
			throw new ConstructionError('topology', 'Open clipped contour');
		if (ring.length >= 3 && Math.abs(area(ring)) > 1e-6) result.push(ring);
	}
	return result;
}

/** Atomic divider segments cancel within a sheet, or combine into an AB cut.
 * Splitting at every endpoint handles the different port positions of two cells. */
function stitch(edges: Edge[], dividers: number[], axis: 0 | 1 = 0): Edge[] {
	let result = edges;
	const uprightX = (p: Point) =>
		(axis === 0 ? p[0] - p[1] : p[0] + p[1] - 100) * Math.SQRT1_2;
	const uprightY = (p: Point) =>
		(axis === 0 ? p[0] + p[1] - 100 : p[0] - p[1]) * Math.SQRT1_2;
	for (const x of dividers) {
		const on = (e: Edge) =>
			Math.abs(uprightX(e.from) - x) < 1e-5 &&
			Math.abs(uprightX(e.to) - x) < 1e-5;
		const selected = result.filter(on);
		const vertices = selected
			.flatMap((e) => [e.from, e.to])
			.sort((a, b) => uprightY(a) - uprightY(b))
			.filter(
				(p, i, all) => !i || Math.abs(uprightY(p) - uprightY(all[i - 1])) > 1e-5
			);
		const positions = vertices.map(uprightY);
		const canonical = (p: Point) =>
			Math.abs(uprightX(p) - x) < 1e-5
				? (vertices.find((q) => Math.abs(uprightY(p) - uprightY(q)) < 1e-5) ??
					p)
				: p;
		result = result
			.filter((e) => !on(e))
			.map((e) => ({ ...e, from: canonical(e.from), to: canonical(e.to) }));
		for (let i = 1; i < positions.length; i++) {
			const a = positions[i - 1],
				b = positions[i],
				y = (a + b) / 2;
			let bits = 0;
			for (const e of selected) {
				const lo = Math.min(uprightY(e.from), uprightY(e.to)),
					hi = Math.max(uprightY(e.from), uprightY(e.to));
				if (y > lo && y < hi)
					bits ^= e.family === 'A' ? 1 : e.family === 'B' ? 2 : 3;
			}
			if (bits)
				add(
					result,
					[vertices[i - 1], vertices[i]],
					bits === 3 ? 'AB' : bits === 1 ? 'A' : 'B',
					bits === 3 ? 'shared' : 'outline'
				);
		}
	}
	return result;
}

export function generatePanelFigure(
	rings: Ring[],
	frame: Frame,
	size: number,
	scale: number,
	count = 2,
	style: 'rays' | 'check' | 'plain' = 'rays',
	rows = 1,
	spread = false
) {
	const factor = size * scale * (frame === 'oval' ? 0.75 : 1);
	const upright = rings.map((r) =>
		r.map(([x, y]) => [x * factor, y * factor] as Point)
	);
	const points = upright.flat();
	if (!points.length) throw new ConstructionError('empty', 'No contour');
	const xs = points.map((p) => p[0]),
		ys = points.map((p) => p[1]);
	const left = Math.min(...xs) - 2,
		right = Math.max(...xs) + 2,
		top = Math.min(...ys) - 2,
		bottom = Math.max(...ys) + 2;
	const width = (right - left) / count,
		height = (bottom - top) / rows;
	const vertical = Array.from(
		{ length: count - 1 },
		(_, i) => left + (i + 1) * width
	);
	const horizontal = Array.from(
		{ length: rows - 1 },
		(_, i) => top + (i + 1) * height
	);
	let edges: Edge[] = [];
	const cells: Point[][][] = [];
	const swap = (r: Ring): Ring => r.map(([x, y]) => [y, x]);
	for (let row = 0; row < rows; row++) {
		cells.push([]);
		for (let col = 0; col < count; col++) {
			const lo = left + col * width,
				hi = lo + width,
				up = top + row * height,
				down = up + height;
			let parts = upright;
			if (col) parts = clipContours(parts, lo, false);
			if (col < count - 1) parts = clipContours(parts, hi, true);
			if (row) parts = clipContours(parts.map(swap), up, false).map(swap);
			if (row < rows - 1)
				parts = clipContours(parts.map(swap), down, true).map(swap);
			if (!parts.length) throw new ConstructionError('topology', 'Empty panel');
			const x = (lo + hi) / 2,
				y = (up + down) / 2;
			const gates = [
				[x, up],
				[hi, y],
				[x, down],
				[lo, y]
			].map((p) => uprightToSheet(p as Point));
			fourPortMotif(
				edges,
				parts.map((r) => r.map(uprightToSheet)),
				gates,
				[Math.PI / 4, (3 * Math.PI) / 4, (-3 * Math.PI) / 4, -Math.PI / 4],
				gridClearance(count + rows + 1)
			);
			cells[row].push(gates);
		}
	}
	edges = stitch(stitch(edges, vertical), horizontal, 1);
	connectCellGrid(edges, cells, frameRing(frame, size), style, spread);
	return {
		geometry: compile(edges),
		edges,
		artwork: upright.map((r) => r.map(uprightToSheet))
	};
}
