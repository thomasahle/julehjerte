import { gridClearance } from '$lib/geometry/clearance';
import {
	ConstructionError, type Ring, type Point, type Edge, type Frame, type Contour,
	forest, centroid, uprightToSheet, frameRing, framedGate, twoPortMotif, add, compile
} from './geometry';
import { rerouteSharedCuts } from './sharedCuts';
import { contactChains, type ContourChain } from './chainContacts';

const contoursOf = (node: Contour): Ring[] => [node.ring, ...node.children.flatMap(contoursOf)];

/** Separate marks above a wider counter-bearing body need sideways lanes.
 * A vertical partition otherwise puts those marks and the body in the same
 * narrow column. Select by containment and bounds, never by a motif's name. */
export function hasStackedComponents(rings: Ring[]): boolean {
	const roots = forest(rings), bodies = roots.filter(node => node.children.length);
	if (roots.length < 2 || roots.length > 8 || bodies.length !== 1) return false;
	const body = bodies[0], left = Math.min(...body.ring.map(p => p[0])),
		right = Math.max(...body.ring.map(p => p[0])), top = Math.min(...body.ring.map(p => p[1]));
	return roots.filter(node => node !== body).every(node => !node.children.length &&
		Math.max(...node.ring.map(p => p[1])) < top - 1e-7 &&
		Math.min(...node.ring.map(p => p[0])) >= left && Math.max(...node.ring.map(p => p[0])) <= right);
}

/** Three parallel lanes keep separate islands with their own open cutting paths.
 * A counter stays with its parent; two coincident connections open it into the
 * lane. This avoids forcing a steam curl and the cup below it into adjoining
 * four-port cells. Every visible outline and the requested frame stay fixed. */
export function generateComponentLanes(rings: Ring[], frame: Frame, size = 70, scale = .7,
	style: 'rays' | 'check' | 'plain' = 'rays', aligned = false, extraStrips = 0,
	horizontalContacts?: { tilt: number }) {
	const factor = size * scale * (frame === 'oval' ? .75 : 1);
	// Change the partition axis, then restore coordinates before constructing
	// cuts. Neither the artwork nor the selected frame rotates.
	const toSheet = horizontalContacts ? (p: Point) => uprightToSheet([p[1], -p[0]]) : uprightToSheet;
	const upright = rings.map(r => r.map(([x, y]): Point => horizontalContacts
		? [-y * factor, x * factor] : [x * factor, y * factor]));
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
	const chains: ContourChain[] = [];
	const boundary = frameRing(frame, size), fan = style === 'rays' ? .72 : 1,
		half = Math.PI / (2 * columns) * (style === 'plain' ? .16 : .3),
		margin = gridClearance(columns + 1 + extraStrips);
	for (let col = 0; col < columns; col++) {
		const angle = (col + .5) * Math.PI / (2 * columns);
		const outside = [
			framedGate(edges, boundary, (horizontalContacts ? Math.PI / 2 : Math.PI) + angle, half, fan, true, columns),
			framedGate(edges, boundary, (horizontalContacts ? 0 : Math.PI / 2) - angle, half, fan, true, columns)
		];
		// Aligned approaches run above and below the artwork before meeting the
		// frame. The direct variant can be better when the frame is very flat.
		const x = (lines[col] + lines[col + 1]) / 2;
		const gates = aligned ? [toSheet([x, top]), toSheet([x, bottom])] : outside;
		if (aligned) for (let i = 0; i < 2; i++) add(edges, [outside[i], gates[i]], 'AB', 'shared');
		const contours = parts[col].map(r => r.map(toSheet));
		if (horizontalContacts) chains.push({ nodes: forest(contours), start: gates[0], end: gates[1] });
		else if (contours.length) twoPortMotif(edges, contours, gates, margin, { compound: true });
		else add(edges, gates, 'AB', 'shared');
	}
	if (horizontalContacts) edges.push(...contactChains(chains, -Math.PI / 4 + horizontalContacts.tilt, margin));
	// A connection to an island must also clear the islands in other lanes.
	edges = rerouteSharedCuts(edges, margin);
	return { edges, geometry: compile(edges), artwork: upright.map(r => r.map(toSheet)), domain: [boundary] };
}
