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

/** The motif upright at its size, on the paper. */
function placeFitted(rings: Ring[], size: number, scale: number): Ring[] {
	return rings.filter(r => r.length).map(r => r.map(p => uprightToSheet([p[0] * size * scale, p[1] * size * scale])));
}

/** The corner of the paper the legs from gate `i` run to. */
const legCorner = (i: number): Point => [i === 0 || i === 3 ? 0 : 100, i < 2 ? 0 : 100];

/** Where the legs meet the motif: its support points in the four diagonal
 * directions, each moved out by the frame's gap. Moving a support direction
 * within its quadrant chooses another actual silhouette point with clear
 * outward projections; the motif never moves. In a frame with outer strips,
 * whose legs fit the motif, the space moves those strips instead. */
function fittedGates(artwork: Ring[], extent: number, open: OpenFrame, symmetric: boolean, padding = 0,
	angleOffsets: readonly [number, number, number, number] = [0, 0, 0, 0]) {
	const angles = [-3 * Math.PI / 4, -Math.PI / 4, Math.PI / 4, 3 * Math.PI / 4].map((angle, i) => angle + angleOffsets[i]);
	const legGap = open.border ? 0 : open.gap;
	const gates = angles.map(angle => symmetricSupport(artwork, angle, extent, symmetric))
		.map((p, i): Point => [
			p[0] + (padding * gridClearance(5) + legGap) * Math.cos(angles[i]),
			p[1] + (padding * gridClearance(5) + legGap) * Math.sin(angles[i])
		]);
	return { angles, gates };
}

/** An open frame's picture, before its cuts are found (see `picture`): the
 * motif, the wedge each pair of legs closes off towards its corner, and, in a
 * frame with outer strips, the strips, as `generateFittedFigure` builds them
 * with symmetric gates. */
export function fittedPicture(rings: Ring[], size = 70, scale = .7, open: OpenFrame = FITTED): Ring[] {
	const artwork = placeFitted(rings, size, scale), points = artwork.flat();
	if (!points.length) return [];
	const out = [...artwork];
	for (const [i, p] of fittedGates(artwork, size * scale, open, true).gates.entries()) {
		const corner = legCorner(i);
		out.push([p, openLeg(p, corner, 1, open.taper), corner, openLeg(p, corner, 0, open.taper)]);
	}
	if (open.border) {
		const band = 4 + open.gap, xs = points.map(p => p[0]), ys = points.map(p => p[1]);
		const [left, right, top, bottom] = [Math.min(...xs) - band, Math.max(...xs) + band, Math.min(...ys) - band, Math.max(...ys) + band];
		// Each strip line turns the colour over on one side of it.
		out.push([[0, 0], [left, 0], [left, 100], [0, 100]], [[right, 0], [100, 0], [100, 100], [right, 100]],
			[[0, 0], [100, 0], [100, top], [0, top]], [[0, bottom], [100, bottom], [100, 100], [0, 100]]);
	}
	return out;
}

export function generateFittedFigure(rings: Ring[], size = 70, scale = .7, route = fourPortMotif,
	angleOffsets: readonly [number, number, number, number] = [0, 0, 0, 0], padding = 0, open: OpenFrame = FITTED,
	symmetric = true) {
	const artwork = placeFitted(rings, size, scale);
	const points = artwork.flat();
	if (!points.length) throw new ConstructionError('empty', 'No contour');
	const { angles, gates } = fittedGates(artwork, size * scale, open, symmetric, padding, angleOffsets);
	const band = 4 + (open.border ? open.gap : 0);
	// An outward offset leaves space for a coincident connection to a detached
	// part before reaching the main silhouette. It adds no visible frame edge.
	// Each support point has clear outward horizontal and vertical projections.
	const edges: Edge[] = [];
	route(edges, artwork, gates, angles.map(a => a + Math.PI), gridClearance(open.border ? 5 : 3));
	for (const [i, p] of gates.entries()) {
		const corner = legCorner(i);
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
