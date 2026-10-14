/** Matching cuts fan out from two checked tips. Three lanes distribute separate
 * components, with empty outer lanes travelling beside the central artwork. */
import {
	add, compile, contourChain, forest, uprightToSheet,
	ConstructionError, type Ring, type Edge, type Point
} from './geometry';

export function generateCornerChecks(rings: Ring[], size = 70, scale = .7) {
	const points = rings.flat();
	if (!points.length) throw new ConstructionError('empty', 'No contour');
	const artwork = rings.map(r => r.map(([x, y]) => uprightToSheet([x * size * scale, y * size * scale])));
	const half = Math.max(...points.map(p => Math.abs(p[0]))) * size * scale + 4;
	const top = Math.min(...points.map(p => p[1])) * size * scale - 3;
	const bottom = Math.max(...points.map(p => p[1])) * size * scale + 3;
	const edges: Edge[] = [];
	const lanes = Array.from({ length: 3 }, () => [] as ReturnType<typeof forest>);
	for (const node of forest(artwork)) {
		const xs = node.ring.map(p => (p[0] - p[1]) * Math.SQRT1_2);
		const center = (Math.min(...xs) + Math.max(...xs)) / 2;
		lanes[center < -half * .45 ? 0 : center > half * .45 ? 2 : 1].push(node);
	}
	for (let col = 0; col < 3; col++) {
		const start: Point = [18 + col * 6, 30 - col * 6], end: Point = [70 + col * 6, 82 - col * 6];
		add(edges, [[start[0], 0], start], 'A', 'frame');
		add(edges, [[0, start[1]], start], 'B', 'frame');
		if (col === 1) contourChain(edges, lanes[col], Math.PI / 4, start, end, 'B');
		else {
			const x = col === 0 ? -half : half;
			const entry = uprightToSheet([x, top]), exit = uprightToSheet([x, bottom]);
			add(edges, [start, entry], 'AB', 'shared');
			contourChain(edges, lanes[col], Math.PI / 4, entry, exit, 'B');
			add(edges, [exit, end], 'AB', 'shared');
		}
		add(edges, [end, [end[0], 100]], 'A', 'frame');
		add(edges, [end, [100, end[1]]], 'B', 'frame');
	}
	for (const t of [6, 94]) {
		add(edges, [[t, 0], [t, 100]], 'A', 'frame');
		add(edges, [[0, t], [100, t]], 'B', 'frame');
	}
	// Exclude only the two checked corners and the narrow outer bands from the
	// solid-field check. No decorative colours may appear elsewhere in the field.
	const domain: Ring = [[30, 6], [94, 6], [94, 70], [70, 70], [70, 94], [6, 94], [6, 30], [30, 30]];
	return { edges, geometry: compile(edges), artwork, domain: [domain, ...artwork] };
}
