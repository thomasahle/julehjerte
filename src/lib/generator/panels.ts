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
	ray,
	distance,
	support,
	dot,
	direction,
	area,
	forest,
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
 * keeps all disconnected pieces. Touching contours may share a vertex, but each
 * returned contour is a closed cycle. */
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
	if ([...adj.values()].some((ids) => ids.length % 2))
		throw new ConstructionError('topology', 'Unpaired clipping vertex');
	if ([...adj.values()].some((ids) => ids.length > 2)) {
		// A kissing contour is not an open or branching boundary. Extract each
		// closed walk at its repeated vertex instead of joining the touching
		// rings into one self-touching outline. The edge set and even-odd fill
		// stay unchanged; the eventual paper paths still need full validation.
		const used = new Set<number>(), rings: Ring[] = [];
		for (let start = 0; start < edges.length; start++) {
			if (used.has(start)) continue;
			const path: Point[] = [edges[start][0]], positions = new Map([[key(path[0]), 0]]);
			let at = path[0];
			for (;;) {
				const id = adj.get(key(at))!.find(i => !used.has(i));
				if (id === undefined) break;
				used.add(id);
				const edge = edges[id];
				at = key(edge[0]) === key(at) ? edge[1] : edge[0];
				const existing = positions.get(key(at));
				if (existing === undefined) {
					positions.set(key(at), path.length);
					path.push(at);
				} else {
					const ring = path.slice(existing);
					if (ring.length >= 3 && Math.abs(area(ring)) > 1e-6) rings.push(ring);
					for (const point of path.slice(existing + 1)) positions.delete(key(point));
					path.splice(existing + 1);
				}
			}
			if (path.length !== 1) throw new ConstructionError('topology', 'Open clipped contour');
		}
		return rings;
	}
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
export function stitch(edges: Edge[], dividers: number[], axis: 0 | 1 = 0): Edge[] {
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

/** Attach both neighbours inside the widest filled part of their shared seam.
 * Clipping opens counters onto that seam, so its midpoint may otherwise land
 * in a hole. Sorting geometrically also makes opposite contour orders agree. */
export function filledSeamGate(parts: Ring[], axis: 0 | 1, value: number, target: number): Point | undefined {
	const spans: [number, number][] = [];
	for (const ring of parts) for (const [i, a] of ring.entries()) {
		const b = ring[(i + 1) % ring.length];
		if (Math.abs(a[axis] - value) < 1e-6 && Math.abs(b[axis] - value) < 1e-6)
			spans.push([Math.min(a[1 - axis], b[1 - axis]), Math.max(a[1 - axis], b[1 - axis])]);
	}
	spans.sort((a, b) => a[0] - b[0]);
	const merged: [number, number][] = [];
	for (const span of spans) {
		const last = merged.at(-1);
		if (last && span[0] <= last[1] + 1e-6) last[1] = Math.max(last[1], span[1]);
		else merged.push([...span]);
	}
	const rounded = (x: number) => Math.round(x * 1e6);
	merged.sort((a, b) => rounded((b[1] - b[0]) - (a[1] - a[0])) ||
		rounded(Math.abs((a[0] + a[1]) / 2 - target) - Math.abs((b[0] + b[1]) / 2 - target)) || a[0] - b[0]);
	const span = merged[0];
	if (!span) return;
	const t = (span[0] + span[1]) / 2;
	return uprightToSheet(axis === 0 ? [value, t] : [t, value]);
}

/** A counter opened onto a seam can become a separate filled component.
 * Give that component the shared gate: placing every gate on the surrounding
 * background leaves no open approach to its small outline. */
export function componentSeamGate(parts: Ring[], axis: 0 | 1, value: number, target: number): Point | undefined {
	const roots = forest(parts).filter(node => node.ring.some((point, i) =>
		Math.abs(point[axis] - value) < 1e-6 &&
		Math.abs(node.ring[(i + 1) % node.ring.length][axis] - value) < 1e-6));
	roots.sort((a, b) => Math.abs(area(a.ring)) - Math.abs(area(b.ring)));
	return filledSeamGate(roots.length > 1 ? [roots[0].ring] : parts, axis, value, target);
}

/** Keep panel widths comparable while moving dividers away from contour vertices.
 * A midpoint in a wider coordinate gap avoids grazing a tip or creating a tiny
 * clipped fragment. This changes only the invisible partition, never the motif. */
export function panelDividers(values: number[], low: number, high: number, count: number) {
	const sorted = [...new Set(values)].sort((a, b) => a - b), width = (high - low) / count;
	return Array.from({ length: count - 1 }, (_, i) => {
		const target = low + (i + 1) * width;
		const gaps = sorted.slice(1).map((b, j) => ({ midpoint: (sorted[j] + b) / 2, width: b - sorted[j] }))
			.filter(gap => Math.abs(gap.midpoint - target) < width * .25 && gap.width > 1e-5);
		const score = (gap: typeof gaps[number]) => gap.width / (1 + Math.abs(gap.midpoint - target) / width);
		gaps.sort((a, b) => score(b) - score(a));
		return gaps[0]?.midpoint ?? target;
	});
}

/** Shared cuts may meet an internal seam only at that seam's agreed gate.
 * Bounds and flags follow the gates: top, right, bottom, left, in upright space.
 * Outer sides are unrestricted. Use the same tolerance as divider stitching. */
export function panelSeamGuard(gates: Point[], bounds: number[], internal: boolean[]) {
	return (point: Point) => {
		const u = (point[0] - point[1]) * Math.SQRT1_2,
			v = (point[0] + point[1] - 100) * Math.SQRT1_2;
		return internal.every((seam, side) => !seam ||
			Math.abs((side % 2 ? u : v) - bounds[side]) >= 1e-5 ||
			distance(point, gates[side]) < 1e-5);
	};
}

export function generatePanelFigure(
	rings: Ring[],
	frame: Frame | undefined,
	size: number,
	scale: number,
	count = 2,
	style: 'rays' | 'check' | 'plain' = 'rays',
	rows = 1,
	spread = false,
	route = fourPortMotif,
	attachments: 'support' | 'ray' | 'filled' | 'components' = 'support',
	adaptive = false,
	shear = 0,
	angleOffsets: readonly [number, number, number, number] = [0, 0, 0, 0],
	junction?: Point
) {
	const factor = size * scale * (frame === 'oval' ? 0.75 : 1);
	const artworkUpright = rings.map((r) =>
		r.map(([x, y]) => [x * factor, y * factor] as Point)
	);
	// Work in coordinates with horizontal panel seams, then undo the shear
	// before attaching the frame. Only the invisible partition is tilted:
	// the visible motif, counters and surrounding frame keep their shape.
	const upright = shear ? artworkUpright.map(r => r.map(([x, y]): Point => [x, y - shear * x])) : artworkUpright;
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
	const vertical = adaptive ? panelDividers(xs, left, right, count) : Array.from(
		{ length: count - 1 },
		(_, i) => left + (i + 1) * width
	);
	const horizontal = adaptive ? panelDividers(ys, top, bottom, rows) : Array.from(
		{ length: rows - 1 },
		(_, i) => top + (i + 1) * height
	);
	if (junction) {
		if (count !== 2 || rows !== 2 || !junction.every(Number.isFinite) ||
			junction[0] <= left || junction[0] >= right || junction[1] <= top || junction[1] >= bottom)
			throw new ConstructionError('topology', 'Invalid four-panel junction');
		vertical[0] = junction[0];
		horizontal[0] = junction[1];
	}
	const xLines = [left, ...vertical, right], yLines = [top, ...horizontal, bottom];
	let edges: Edge[] = [];
	const cells: Point[][][] = [];
	const swap = (r: Ring): Ring => r.map(([x, y]) => [y, x]);
	for (let row = 0; row < rows; row++) {
		cells.push([]);
		for (let col = 0; col < count; col++) {
			const lo = adaptive || junction ? xLines[col] : left + col * width,
				hi = adaptive || junction ? xLines[col + 1] : lo + width,
				up = adaptive || junction ? yLines[row] : top + row * height,
				down = adaptive || junction ? yLines[row + 1] : up + height;
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
			if (attachments === 'filled' || attachments === 'components') {
				const gate = attachments === 'components' ? componentSeamGate : filledSeamGate;
				if (row) gates[0] = gate(parts, 1, up, x) ?? gates[0];
				if (row < rows - 1) gates[2] = gate(parts, 1, down, x) ?? gates[2];
				if (col) gates[3] = gate(parts, 0, lo, y) ?? gates[3];
				if (col < count - 1) gates[1] = gate(parts, 0, hi, y) ?? gates[1];
			}
			const contours = parts.map(r => r.map(uprightToSheet));
			const angles = [Math.PI / 4, (3 * Math.PI) / 4, (-3 * Math.PI) / 4, -Math.PI / 4];
			if (!frame) {
				// In the close-fitting template, outer grid lines meet the actual
				// silhouette of each panel. Interior gates retain the shared seam.
				for (const [side, outside] of [row === 0, col === count - 1, row === rows - 1, col === 0].entries()) {
					if (!outside) continue;
					if (attachments !== 'support') {
						// An extremum at the seam can belong to both panels. Project
						// inward from this panel's side to give it its own attachment.
						const origin = gates[side];
						const hits = contours.flatMap(r => {
							try { return [ray(r, origin, angles[side]).point]; }
							catch (error) {
								if (!(error instanceof ConstructionError)) throw error;
								return [];
							}
						});
						if (hits.length) {
							gates[side] = hits.reduce((a, b) => distance(a, origin) < distance(b, origin) ? a : b);
							continue;
						}
					}
					// An outer support may move along the same silhouette without
					// changing the shared seam between neighbouring panels.
					const angle = angles[side] + Math.PI + angleOffsets[side], d = direction(angle);
					gates[side] = contours.map(r => support(r, angle).point)
						.reduce((a, b) => dot(a, d) > dot(b, d) ? a : b);
				}
			}
			route(
				edges,
				contours,
				gates,
				angles,
				gridClearance(count + rows + 1),
				undefined,
				undefined,
				attachments === 'components' ? { boundaryIslands: true } : undefined
			);
			cells[row].push(gates);
		}
	}
	edges = stitch(stitch(edges, vertical), horizontal, 1);
	if (shear) {
		const restore = (p: Point): Point => {
			const x = (p[0] - p[1]) * Math.SQRT1_2,
				y = (p[0] + p[1] - 100) * Math.SQRT1_2;
			return uprightToSheet([x, y + shear * x]);
		};
		edges = edges.map(edge => ({ ...edge, from: restore(edge.from), to: restore(edge.to) }));
		for (const row of cells) for (const gates of row)
			for (let side = 0; side < gates.length; side++) gates[side] = restore(gates[side]);
	}
	connectCellGrid(edges, cells, frame ? frameRing(frame, size) : undefined, style, spread);
	const artwork = artworkUpright.map(r => r.map(uprightToSheet));
	return {
		geometry: compile(edges),
		edges,
		artwork,
		...(!frame ? { domain: [...cells.flat(), ...artwork] } : {})
	};
}
