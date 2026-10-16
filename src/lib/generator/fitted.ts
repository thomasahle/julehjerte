/** The grid meets diagonal support points of the silhouette itself. There is
 * no separate circle or polygon between the motif and its surrounding strips. */
import {
	add, compile, fourPortMotif, support, uprightToSheet, dot, direction,
	ConstructionError, type Ring, type Edge
} from './geometry';
import { gridClearance } from '$lib/geometry/clearance';

export function generateFittedFigure(rings: Ring[], size = 70, scale = .7, route = fourPortMotif,
	angleOffsets: readonly [number, number, number, number] = [0, 0, 0, 0], padding = 0) {
	const artwork = rings.filter(r => r.length).map(r =>
		r.map(p => uprightToSheet([p[0] * size * scale, p[1] * size * scale]))
	);
	const points = artwork.flat();
	if (!points.length) throw new ConstructionError('empty', 'No contour');
	// Moving a support direction within its quadrant chooses another actual
	// silhouette point with clear outward projections. The motif never moves.
	const angles = [-3 * Math.PI / 4, -Math.PI / 4, Math.PI / 4, 3 * Math.PI / 4]
		.map((angle, i) => angle + angleOffsets[i]);
	const gates = angles.map(angle => artwork.map(r => support(r, angle).point)
		.reduce((a, b) => dot(a, direction(angle)) > dot(b, direction(angle)) ? a : b))
		.map((p, i): [number, number] => [
			p[0] + padding * gridClearance(5) * Math.cos(angles[i]),
			p[1] + padding * gridClearance(5) * Math.sin(angles[i])
		]);
	// An outward offset leaves space for a coincident connection to a detached
	// part before reaching the main silhouette. It adds no visible frame edge.
	// Each support point has clear outward horizontal and vertical projections.
	const edges: Edge[] = [];
	route(edges, artwork, gates, angles.map(a => a + Math.PI), gridClearance(5));
	for (const [i, p] of gates.entries()) {
		add(edges, [[p[0], i < 2 ? 0 : 100], p], 'A', 'frame');
		add(edges, [[i === 0 || i === 3 ? 0 : 100, p[1]], p], 'B', 'frame');
	}
	const minX = Math.min(...points.map(p => p[0])), maxX = Math.max(...points.map(p => p[0]));
	const minY = Math.min(...points.map(p => p[1])), maxY = Math.max(...points.map(p => p[1]));
	const band = 4;
	if (Math.min(minX, minY, 100 - maxX, 100 - maxY) <= band)
		throw new ConstructionError('clearance', 'No room for the outer strips');
	for (const x of [minX - band, maxX + band]) add(edges, [[x, 0], [x, 100]], 'A', 'frame');
	for (const y of [minY - band, maxY + band]) add(edges, [[0, y], [100, y]], 'B', 'frame');
	// The central quadrilateral and every part of the motif must reproduce the
	// original artwork. The grid may change colour outside that fitted region.
	return { edges, artwork, geometry: compile(edges), domain: [gates, ...artwork] };
}
