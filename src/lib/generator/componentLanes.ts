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
 * corners. A lane holding no part of the motif runs straight through the
 * parts reaching across it, or within the cutting clearance of one (`passes`
 * says whether one does), unless `pass`: then it moves within its column to
 * where it passes farthest from the motif, and an open frame's lane with no
 * place clear of it is left out. A moved lane runs straight above and below
 * the motif. */
export function generateComponentLanes(rings: Ring[], frame: Frame | OpenFrame, size = 70, scale = .7,
	style: 'rays' | 'check' = 'rays', aligned = false, extraStrips = 0, pass = false) {
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
	const margin = gridClearance(columns + 1 + (open ? 0 : extraStrips));
	const spans = forest(upright).map(node => {
		const xs = node.ring.map(p => p[0]);
		return [Math.min(...xs), Math.max(...xs)];
	});
	// How far a lane at x passes from the nearest part of the motif.
	const room = (x: number) => Math.min(...spans.map(([a, b]) => x < a ? a - x : x > b ? x - b : 0));
	const middles = Array.from({ length: columns }, (_, col) => (lines[col] + lines[col + 1]) / 2);
	let past = middles.map((middle, col) => {
		if (parts[col].length || room(middle) > margin) return middle;
		const [x] = Array.from({ length: 21 }, (_, k) => lines[col] + (lines[col + 1] - lines[col]) * k / 20)
			.sort((a, b) => room(b) - room(a));
		return room(x) > margin ? x : open ? undefined : middle;
	});
	// Two lanes at the least: one would leave two strips a side.
	if (past.filter(x => x !== undefined).length < 2) past = past.map((x, col) => x ?? middles[col]);
	const moving = past.map((x, col) => x === undefined || Math.abs(x - middles[col]) > 1e-9);
	const passes = moving.includes(true), lanes = pass ? past : middles, moved = pass ? moving : moving.map(() => false);
	if (open) {
		// Each lane's approach needs some room to reach the motif's outline.
		const gap = Math.max(open.gap, 3), ends = [top - gap, bottom + gap];
		for (const [col, x] of lanes.entries()) {
			if (x === undefined) continue;
			const gates = ends.map(y => uprightToSheet([x, y]));
			for (const [i, gate] of gates.entries()) {
				const corner: Point = i ? [100, 100] : [0, 0];
				add(edges, [gate, openLeg(gate, corner, 1, open.taper)], 'A', 'frame');
				add(edges, [gate, openLeg(gate, corner, 0, open.taper)], 'B', 'frame');
			}
			const contours = parts[col].map(r => r.map(uprightToSheet));
			if (contours.length) twoPortMotif(edges, contours, gates, margin, { compound: true });
			else add(edges, gates, 'AB', 'shared');
		}
		edges = rerouteSharedCuts(edges, margin);
		const domain = [[left, ends[0]], [right, ends[0]], [right, ends[1]], [left, ends[1]]].map(p => uprightToSheet(p as Point));
		return { edges, geometry: compile(edges), artwork: upright.map(r => r.map(uprightToSheet)), domain: [domain], passes };
	}
	const boundary = frameRing(frame as Frame, size), fan = style === 'rays' ? .72 : 1,
		half = Math.PI / (2 * columns) * .3;
	for (let col = 0; col < columns; col++) {
		const angle = (col + .5) * Math.PI / (2 * columns);
		const outside = [
			framedGate(edges, boundary, Math.PI + angle, half, fan, true),
			framedGate(edges, boundary, Math.PI / 2 - angle, half, fan, true)
		];
		// Aligned approaches run above and below the artwork before meeting the
		// frame. The direct variant can be better when the frame is very flat.
		const x = lanes[col]!, above = aligned || moved[col];
		const gates = above ? [uprightToSheet([x, top]), uprightToSheet([x, bottom])] : outside;
		if (above) for (let i = 0; i < 2; i++) add(edges, [outside[i], gates[i]], 'AB', 'shared');
		const contours = parts[col].map(r => r.map(uprightToSheet));
		if (contours.length) twoPortMotif(edges, contours, gates, margin, { compound: true });
		else add(edges, gates, 'AB', 'shared');
	}
	// A connection to an island must also clear the islands in other lanes.
	edges = rerouteSharedCuts(edges, margin);
	return { edges, geometry: compile(edges), artwork: upright.map(r => r.map(uprightToSheet)), domain: [boundary], passes };
}
