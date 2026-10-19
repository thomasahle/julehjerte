import { gridClearance } from '$lib/geometry/clearance';
import {
	ConstructionError, type Ring, type Point, type Edge, type Frame, type Contour, type OpenFrame,
	forest, centroid, uprightToSheet, frameRing, framedGate, twoPortMotif, openLeg, add, compile
} from './geometry';
import { rerouteSharedCuts } from './sharedCuts';

const contoursOf = (node: Contour): Ring[] => [node.ring, ...node.children.flatMap(contoursOf)];

/** Three parallel lanes keep separate islands with their own open cutting paths.
 * A counter stays with its parent; two coincident connections open it into the
 * lane. This avoids forcing a steam curl and the cup below it into adjoining
 * four-port cells. Every visible outline and the requested frame stay fixed.
 * Without a centre panel, each lane ends a gap above and below the motif, and
 * the frame's legs run from there to the paper edges at the top and bottom
 * corners. */
export function generateComponentLanes(rings: Ring[], frame: Frame | OpenFrame, size = 70, scale = .7,
	style: 'rays' | 'check' = 'rays', aligned = false, extraStrips = 0) {
	const factor = size * scale;
	const upright = rings.map(r => r.map(([x, y]): Point => [x * factor, y * factor]));
	const points = upright.flat();
	if (!points.length) throw new ConstructionError('empty', 'No contour');
	const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
	const left = Math.min(...xs) - 2, right = Math.max(...xs) + 2,
		top = Math.min(...ys) - 2, bottom = Math.max(...ys) + 2;
	const columns = 3, lines = [left,
		...Array.from({ length: columns - 1 }, (_, i) => left + (right - left) * (i + 1) / columns), right];
	const parts: Ring[][] = Array.from({ length: columns }, () => []);
	for (const node of forest(upright)) {
		const x = centroid(node.ring)[0];
		const col = Math.max(0, Math.min(columns - 1, lines.findIndex(value => value > x) - 1));
		parts[col].push(...contoursOf(node));
	}
	let edges: Edge[] = [];
	const open = typeof frame === 'string' ? undefined : frame;
	if (open) {
		// Each lane's approach needs some room to reach the motif's outline.
		const gap = Math.max(open.gap, 3), ends = [top - gap, bottom + gap];
		for (let col = 0; col < columns; col++) {
			const x = (lines[col] + lines[col + 1]) / 2, gates = ends.map(y => uprightToSheet([x, y]));
			for (const [i, gate] of gates.entries()) {
				const corner: Point = i ? [100, 100] : [0, 0];
				add(edges, [gate, openLeg(gate, corner, 1, open.taper)], 'A', 'frame');
				add(edges, [gate, openLeg(gate, corner, 0, open.taper)], 'B', 'frame');
			}
			const contours = parts[col].map(r => r.map(uprightToSheet));
			if (contours.length) twoPortMotif(edges, contours, gates, gridClearance(columns + 1), { compound: true });
			else add(edges, gates, 'AB', 'shared');
		}
		edges = rerouteSharedCuts(edges, gridClearance(columns + 1));
		const domain = [[left, ends[0]], [right, ends[0]], [right, ends[1]], [left, ends[1]]].map(p => uprightToSheet(p as Point));
		return { edges, geometry: compile(edges), artwork: upright.map(r => r.map(uprightToSheet)), domain: [domain] };
	}
	const boundary = frameRing(frame as Frame, size), fan = style === 'rays' ? .72 : 1,
		half = Math.PI / (2 * columns) * .3,
		margin = gridClearance(columns + 1 + extraStrips);
	for (let col = 0; col < columns; col++) {
		const angle = (col + .5) * Math.PI / (2 * columns);
		const outside = [
			framedGate(edges, boundary, Math.PI + angle, half, fan, true),
			framedGate(edges, boundary, Math.PI / 2 - angle, half, fan, true)
		];
		// Aligned approaches run above and below the artwork before meeting the
		// frame. The direct variant can be better when the frame is very flat.
		const x = (lines[col] + lines[col + 1]) / 2;
		const gates = aligned ? [uprightToSheet([x, top]), uprightToSheet([x, bottom])] : outside;
		if (aligned) for (let i = 0; i < 2; i++) add(edges, [outside[i], gates[i]], 'AB', 'shared');
		const contours = parts[col].map(r => r.map(uprightToSheet));
		if (contours.length) twoPortMotif(edges, contours, gates, margin, { compound: true });
		else add(edges, gates, 'AB', 'shared');
	}
	// A connection to an island must also clear the islands in other lanes.
	edges = rerouteSharedCuts(edges, margin);
	return { edges, geometry: compile(edges), artwork: upright.map(r => r.map(uprightToSheet)), domain: [boundary] };
}
