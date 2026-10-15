/** Matching cuts fan out from two checked tips. Three lanes distribute separate
 * components, with empty outer lanes travelling beside the central artwork. */
import {
	add, compile, contourChain, twoPortMotif, forest, uprightToSheet,
	ConstructionError, type Contour, type Ring, type Edge, type Point
} from './geometry';
import { gridClearance } from '$lib/geometry/clearance';

const contoursOf = (node: Contour): Ring[] => [node.ring, ...node.children.flatMap(contoursOf)];

export function generateCornerChecks(rings: Ring[], size = 70, scale = .7,
	routing: 'chain' | 'practical' | 'separated' = 'chain', fitBorder = false) {
	const points = rings.flat();
	if (!points.length) throw new ConstructionError('empty', 'No contour');
	const artwork = rings.map(r => r.map(([x, y]) => uprightToSheet([x * size * scale, y * size * scale])));
	const half = Math.max(...points.map(p => Math.abs(p[0]))) * size * scale + 4;
	const top = Math.min(...points.map(p => p[1])) * size * scale - 3;
	const bottom = Math.max(...points.map(p => p[1])) * size * scale + 3;
	const margin = gridClearance(6);
	const space = Math.min(...artwork.flat().flatMap(([x, y]) => [x, y, 100 - x, 100 - y]));
	const inset = fitBorder ? Math.min(6, space / 2) : 6;
	if (inset < margin) throw new ConstructionError('clearance', 'No room for the outer strips');
	const safe = inset + margin * 1.25;
	let borderAdjusted = fitBorder && inset < 6 - 1e-6;
	const borderPoint = (point: Point): Point => {
		if (!fitBorder) return point;
		const clamped: Point = [
			Math.max(safe, Math.min(100 - safe, point[0])),
			Math.max(safe, Math.min(100 - safe, point[1]))
		];
		if (clamped.some((value, axis) => Math.abs(value - point[axis]) > 1e-6)) borderAdjusted = true;
		return clamped;
	};
	const edges: Edge[] = [];
	const lanes = Array.from({ length: 3 }, () => [] as ReturnType<typeof forest>);
	const separate = routing === 'separated';
	let changed = false;
	for (const node of forest(artwork)) {
		const xs = node.ring.map(p => (p[0] - p[1]) * Math.SQRT1_2);
		const center = (Math.min(...xs) + Math.max(...xs)) / 2;
		const laneAt = (threshold: number) => center < -half * threshold ? 0 : center > half * threshold ? 2 : 1;
		const lane = laneAt(separate ? .2 : .45);
		if (lane !== laneAt(.45)) changed = true;
		lanes[lane].push(node);
	}
	for (let col = 0; col < 3; col++) {
		const start: Point = [18 + col * 6, 30 - col * 6], end: Point = [70 + col * 6, 82 - col * 6];
		add(edges, [[start[0], 0], start], 'A', 'frame');
		add(edges, [[0, start[1]], start], 'B', 'frame');
		const route = (entry: Point, exit: Point) => {
			if (routing === 'chain') contourChain(edges, lanes[col], Math.PI / 4, entry, exit, 'B');
			else if (lanes[col].length) {
				// Each lane keeps one open path in each sheet. Counters and sharp
				// shoulders can use the same coincident bridges as repeated letters.
				// Three lanes plus two outer cuts give a six-strip grid.
				twoPortMotif(edges, lanes[col].flatMap(contoursOf), [entry, exit], margin, {
					compound: true, balanced: true
				});
			} else add(edges, [entry, exit], 'AB', 'shared');
		};
		if (col === 1) route(start, end);
		else {
			const x = col === 0 ? -half : half;
			const ys = separate ? lanes[col].flatMap(node => node.ring).map(p => (p[0] + p[1] - 100) * Math.SQRT1_2) : [];
			// The allowed sheet rectangle is a diamond in upright coordinates.
			// Keep the side bypass inside it when a large motif approaches a band.
			const lower = fitBorder ? (safe - 50) * Math.SQRT2 + Math.abs(x) : -Infinity,
				upper = fitBorder ? (50 - safe) * Math.SQRT2 - Math.abs(x) : Infinity;
			const low = Math.max(lower, ys.length ? Math.min(...ys) - 3 : top),
				high = Math.min(upper, ys.length ? Math.max(...ys) + 3 : bottom);
			if (Math.abs(low - Math.max(lower, top)) > 1e-6 || Math.abs(high - Math.min(upper, bottom)) > 1e-6) changed = true;
			const entry = uprightToSheet([x, low]), exit = uprightToSheet([x, high]);
			// Approach a separate island near its own height, then continue
			// outside the whole motif. A long diagonal from a steam curl to the
			// bottom corner would otherwise cut through the coffee cup below it.
			add(edges, [start, borderPoint(uprightToSheet([x, top])), entry], 'AB', 'shared');
			route(entry, exit);
			add(edges, [exit, borderPoint(uprightToSheet([x, bottom])), end], 'AB', 'shared');
		}
		add(edges, [end, [end[0], 100]], 'A', 'frame');
		add(edges, [end, [100, end[1]]], 'B', 'frame');
	}
	for (const t of [inset, 100 - inset]) {
		add(edges, [[t, 0], [t, 100]], 'A', 'frame');
		add(edges, [[0, t], [100, t]], 'B', 'frame');
	}
	// Exclude only the two checked corners and the narrow outer bands from the
	// solid-field check. No decorative colours may appear elsewhere in the field.
	const domain: Ring = [[30, inset], [100 - inset, inset], [100 - inset, 70], [70, 70], [70, 100 - inset], [inset, 100 - inset], [inset, 30], [30, 30]];
	return { edges, geometry: compile(edges), artwork, domain: [domain, ...artwork], separated: changed, borderAdjusted };
}
