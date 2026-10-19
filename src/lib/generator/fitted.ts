/** The grid meets diagonal support points of the silhouette itself. There is
 * no separate circle or polygon between the motif and its surrounding strips.
 * The same four gates carry the wedges, each a gap away from the motif. */
import {
	add, compile, fourPortMotif, support, uprightToSheet, dot, direction, distance, openLeg, FITTED,
	ConstructionError, type Ring, type Edge, type Point, type OpenFrame
} from './geometry';
import { gridClearance } from '$lib/geometry/clearance';

/** The motif's extreme point in direction `angle`. Separate extremes that tie,
 * like the two lower tips of a star, share a gate midway between them on their
 * common supporting line, so a symmetric motif gets a symmetric frame. An
 * invisible coincident cut then joins that gate to the motif. */
function symmetricSupport(artwork: Ring[], angle: number, extent: number, symmetric = true): Point {
	const d = direction(angle), across: Point = [-d[1], d[0]];
	const extreme = artwork.map(r => support(r, angle).point).reduce((a, b) => dot(a, d) > dot(b, d) ? a : b);
	if (!symmetric) return extreme;
	const reach = dot(extreme, d), tied = artwork.flat().filter(p => reach - dot(p, d) < .01 * extent).map(p => dot(p, across));
	const middle = (Math.min(...tied) + Math.max(...tied)) / 2;
	const gate: Point = [d[0] * reach + across[0] * middle, d[1] * reach + across[1] * middle];
	// A single extreme, or one flat side, keeps its point on the outline.
	return distance(gate, extreme) < 1 ? extreme : gate;
}

export function generateFittedFigure(rings: Ring[], size = 70, scale = .7, route = fourPortMotif,
	angleOffsets: readonly [number, number, number, number] = [0, 0, 0, 0], padding = 0, open: OpenFrame = FITTED,
	symmetric = true) {
	const artwork = rings.filter(r => r.length).map(r =>
		r.map(p => uprightToSheet([p[0] * size * scale, p[1] * size * scale]))
	);
	const points = artwork.flat();
	if (!points.length) throw new ConstructionError('empty', 'No contour');
	// Moving a support direction within its quadrant chooses another actual
	// silhouette point with clear outward projections. The motif never moves.
	const angles = [-3 * Math.PI / 4, -Math.PI / 4, Math.PI / 4, 3 * Math.PI / 4]
		.map((angle, i) => angle + angleOffsets[i]);
	// The space around the motif moves the legs out, or, in a frame with outer
	// strips, whose legs fit the motif, those strips.
	const legGap = open.border ? 0 : open.gap, band = 4 + (open.border ? open.gap : 0);
	const gates = angles.map(angle => symmetricSupport(artwork, angle, size * scale, symmetric))
		.map((p, i): [number, number] => [
			p[0] + (padding * gridClearance(5) + legGap) * Math.cos(angles[i]),
			p[1] + (padding * gridClearance(5) + legGap) * Math.sin(angles[i])
		]);
	// An outward offset leaves space for a coincident connection to a detached
	// part before reaching the main silhouette. It adds no visible frame edge.
	// Each support point has clear outward horizontal and vertical projections.
	const edges: Edge[] = [];
	route(edges, artwork, gates, angles.map(a => a + Math.PI), gridClearance(open.border ? 5 : 3));
	for (const [i, p] of gates.entries()) {
		const corner: [number, number] = [i === 0 || i === 3 ? 0 : 100, i < 2 ? 0 : 100];
		add(edges, [openLeg(p, corner, 1, open.taper), p], 'A', 'frame');
		add(edges, [openLeg(p, corner, 0, open.taper), p], 'B', 'frame');
	}
	if (!open.border) return { edges, artwork, geometry: compile(edges), domain: [gates, ...artwork] };
	const minX = Math.min(...points.map(p => p[0])), maxX = Math.max(...points.map(p => p[0]));
	const minY = Math.min(...points.map(p => p[1])), maxY = Math.max(...points.map(p => p[1]));
	if (Math.min(minX, minY, 100 - maxX, 100 - maxY) <= band)
		throw new ConstructionError('clearance', 'No room for the outer strips');
	for (const x of [minX - band, maxX + band]) add(edges, [[x, 0], [x, 100]], 'A', 'frame');
	for (const y of [minY - band, maxY + band]) add(edges, [[0, y], [100, y]], 'B', 'frame');
	// The central quadrilateral and every part of the motif must reproduce the
	// original artwork. The grid may change colour outside that fitted region.
	return { edges, artwork, geometry: compile(edges), domain: [gates, ...artwork] };
}
