import { createLocalRouter } from './localRoutes';
import { completionLegs } from './boardCompletion';
import { BOARD_PATTERNS, WHOLE_PATTERNS, type BoardPattern } from './boardPatterns';
import { createSharedCutValidator } from './sharedCutValidation';
import { cellTipCounts, fewerCutTips } from './cutQuality';
import { gridClearance } from '$lib/geometry/clearance';
import { PAPER_NECK_MM, PRINT_WIDTH_MM } from '$lib/geometry/paperNecks';
/** Direct contour constructions. No image fitting, search solver, or raster mask.
 * A visible outline belongs to one sheet. A connecting cut belongs to both;
 * it cancels in the woven image. Every sheet must remain a set of disjoint open
 * edge-to-edge paths. The compiler checks that combinatorial invariant before
 * the geometric clearance check and conversion into the existing editor model.
 */
import { searchCurve, searchCurvePairIssues, searchCurveSelfIssues, type SearchCurve } from './searchClearance';
import type { Finger } from '$lib/types/heart';
import type { CutGeometry } from '$lib/inverse/toHeartDesign';
export type Point = [number, number];
export type Ring = Point[];
export type Family = 'A' | 'B' | 'AB';
export type Edge = {
	from: Point;
	to: Point;
	family: Family;
	kind: 'outline' | 'shared' | 'frame';
};
export type Port = { point: Point; index: number };
export type Contour = { ring: Ring; children: Contour[] };
export const FRAMES = ['circle'] as const;
export type Frame = (typeof FRAMES)[number];
/** The frames around a figure, in the order the generator offers them: the
 * default first, then the frames most real figure hearts use. */
export const FIGURE_STYLES = ['rays', 'wedges', 'corners', 'silhouette', 'motifs', 'squares', 'board', 'fitted', 'sunburst', 'layers', 'check', 'strips'] as const;
export type FigureStyle = (typeof FIGURE_STYLES)[number];
/** A frame without a centre panel joins each outer gate of the motif straight
 * to the two paper edges at its corner of the square. Legs meeting the edges
 * square on draw a checkerboard close around the motif; legs tapered toward
 * the corner draw a wedge pointing at it. `gap` keeps the wedge tips off the
 * motif, joined to it by an invisible coincident cut; `border` adds outer strips. */
export type OpenFrame = { taper: number; gap: number; border: boolean };
export const FITTED: OpenFrame = { taper: 1, gap: 0, border: true };
/** Where the circle with a double border (a medallion `size` wide) draws its
 * outer pair of lines: midway between the fitted frame's lines, 4 outside the
 * medallion, and the paper's edges, so its two bands are equally wide. */
export const layerInset = (size: number) => ((100 - size) / 2 - 4) / 2;
export const WEDGES: OpenFrame = { taper: .45, gap: 3, border: false };
/** A silhouette filling the square meets the edges near each corner, leaving
 * a small check there in the other colour. */
export const SILHOUETTE: OpenFrame = { taper: 1, gap: 0, border: false };
export type TextFrame = 'woven' | 'air' | 'checkered' | 'strips' | 'layers' | Frame;
/** The panel a text frame sets its letters in: its frame, or none for the
 * woven frames, the checkerboard, and the figure frames that take the text's
 * outline (see `textFigure`). */
export const textPanel = (frame: TextFrame): Frame | undefined => FRAMES.find(f => f === frame);
export class ConstructionError extends Error {
	constructor(
		public code: 'topology' | 'clearance' | 'empty' | 'character',
		message: string
	) {
		super(message);
	}
}
/** The local pieces exist, but joining them did not produce open paper strips. */
export class CompilationError extends ConstructionError {
	constructor(message: string) { super('topology', message); }
}
const EPS = 1e-7;
export const mix = (a: Point, b: Point, t: number): Point => [
	a[0] + (b[0] - a[0]) * t,
	a[1] + (b[1] - a[1]) * t
];
export const sub = (a: Point, b: Point): Point => [a[0] - b[0], a[1] - b[1]];
export const dot = (a: Point, b: Point) => a[0] * b[0] + a[1] * b[1];
export const cross = (a: Point, b: Point) => a[0] * b[1] - a[1] * b[0];
export const distance = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);
// Points apart in either coordinate are apart: the hypotenuse is never
// shorter than a side, so most pairs skip it.
export const near = (a: Point, b: Point) => {
	const dx = a[0] - b[0], dy = a[1] - b[1];
	return Math.abs(dx) < EPS && Math.abs(dy) < EPS && Math.hypot(dx, dy) < EPS;
};
export const direction = (a: number): Point => [Math.cos(a), Math.sin(a)];
export const area = (r: Ring) =>
	r.reduce((s, p, i) => s + cross(p, r[(i + 1) % r.length]), 0) / 2;
export function inside(p: Point, r: Ring): boolean {
	let odd = false;
	for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
		const a = r[i],
			b = r[j];
		if (
			a[1] > p[1] !== b[1] > p[1] &&
			p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]
		)
			odd = !odd;
	}
	return odd;
}
export function forest(rings: Ring[]): Contour[] {
	const nodes = rings.map((r) => ({
		ring: area(r) < 0 ? r.slice().reverse() : r,
		children: [] as Contour[]
	}));
	const bounds = new Map(nodes.map(n => [n, [
		Math.min(...n.ring.map(p => p[0])), Math.min(...n.ring.map(p => p[1])),
		Math.max(...n.ring.map(p => p[0])), Math.max(...n.ring.map(p => p[1]))
	]]));
	const contains = (parent: Contour, child: Contour) => {
		const a = bounds.get(parent)!, b = bounds.get(child)!;
		if (a[0] > b[0] + EPS || a[1] > b[1] + EPS || a[2] < b[2] - EPS || a[3] < b[3] - EPS) return false;
		// Touching walks often start at their shared vertex. A ray cast there
		// can misclassify a separate component as a hole. Use a point that is
		// strictly off the prospective parent's boundary instead.
		for (const p of child.ring.flatMap((p, i) => [p, mix(p, child.ring[(i + 1) % child.ring.length], .5)])) {
			const onBoundary = parent.ring.some((u, i) => {
				const v = parent.ring[(i + 1) % parent.ring.length], d = sub(v, u);
				const t = dot(sub(p, u), d) / dot(d, d);
				return t >= -EPS && t <= 1 + EPS && distance(p, mix(u, v, Math.max(0, Math.min(1, t)))) < EPS;
			});
			if (!onBoundary) return inside(p, parent.ring);
		}
		return false;
	};
	const roots: Contour[] = [];
	for (const node of nodes) {
		const parents = nodes.filter(
			(n) =>
				n !== node &&
				Math.abs(area(n.ring)) > Math.abs(area(node.ring)) &&
				contains(n, node)
		);
		parents.sort((a, b) => Math.abs(area(a.ring)) - Math.abs(area(b.ring)));
		if (parents[0]) parents[0].children.push(node);
		else roots.push(node);
	}
	return roots;
}
export function arc(r: Ring, a: Port, b: Port): Ring {
	const end = b.index <= a.index + EPS ? b.index + r.length : b.index,
		points = [a.point];
	for (let i = Math.floor(a.index) + 1; i < end - EPS; i++)
		points.push(r[i % r.length]);
	points.push(b.point);
	return points.filter((p, i) => !i || !near(p, points[i - 1]));
}
/** A missed trial ray is routine while placing connections, not an exception. */
function rayHit(r: Ring, origin: Point, angle: number): Port | null {
	// The nearest crossing, the first of equals: called for every counter at
	// every candidate bridge, so one pass without a list of hits.
	const v = direction(angle);
	let best: Port | null = null, nearest = Infinity;
	for (let i = 0; i < r.length; i++) {
		const p = r[i], next = r[(i + 1) % r.length],
			e0 = next[0] - p[0], e1 = next[1] - p[1],
			det = v[0] * e1 - v[1] * e0;
		if (Math.abs(det) < EPS) continue;
		const q0 = p[0] - origin[0], q1 = p[1] - origin[1],
			d = (q0 * e1 - q1 * e0) / det,
			t = (q0 * v[1] - q1 * v[0]) / det;
		if (d > EPS && t >= -EPS && t <= 1 + EPS && d < nearest) {
			nearest = d;
			best = { point: mix(p, next, Math.max(0, Math.min(1, t))), index: i + Math.max(0, Math.min(1, t)) };
		}
	}
	return best;
}
export function ray(r: Ring, origin: Point, angle: number): Port {
	const hit = rayHit(r, origin, angle);
	if (!hit)
		throw new ConstructionError('topology', 'No visible contour port');
	return hit;
}
/** Extreme support point, using the middle of a flat supporting edge. The ray
 * leading away from it cannot cross the same contour, even on a concave motif. */
export function support(r: Ring, angle: number): Port {
	// Called for every counter at every candidate bridge: one typed pass for
	// the values, no spread (the same numbers as before, far faster).
	const d = direction(angle), n = r.length, values = new Float64Array(n);
	let max = -Infinity, first = 0;
	for (let i = 0; i < n; i++) {
		const v = values[i] = dot(r[i], d);
		if (v > max) { max = v; first = i; }
	}
	for (let i = 0; i < n; i++)
		if (max - values[i] < EPS && max - values[(i + 1) % n] < EPS)
			return { point: mix(r[i], r[(i + 1) % n], 0.5), index: i + 0.5 };
	return { point: r[first], index: first };
}
export const add = (
	edges: Edge[],
	points: Ring,
	family: Family,
	kind: Edge['kind']
) => {
	for (let i = 1; i < points.length; i++)
		if (!near(points[i - 1], points[i]))
			edges.push({ from: points[i - 1], to: points[i], family, kind });
};
function outline(edges: Edge[], ring: Ring, ports: Port[], first: 'A' | 'B') {
	// The caller supplies cyclic order, starting at its entry port.
	for (let i = 0; i < ports.length; i++)
		add(
			edges,
			arc(ring, ports[i], ports[(i + 1) % ports.length]),
			i % 2 ? (first === 'A' ? 'B' : 'A') : first,
			'outline'
		);
}
function cyclic(r: Ring, ports: Port[]): boolean {
	const start = ports[0].index;
	const indices = ports.map((p) => (p.index - start + r.length) % r.length);
	return indices.every((v, i) => !i || v > indices[i - 1] + EPS);
}
/** Two-terminal contour block. Holes (and islands inside holes) run as an
 * ordered chain across the interior, transverse to the external connection.
 * The four ports must alternate outside/inside in contour order; otherwise
 * the attempted attachment would create a closed cutting loop and is refused. */
function block(
	edges: Edge[],
	node: Contour,
	entry: Port,
	exit: Port,
	first: 'A' | 'B'
) {
	if (!node.children.length) {
		outline(edges, node.ring, [entry, exit], first);
		return;
	}
	let a =
		Math.atan2(exit.point[1] - entry.point[1], exit.point[0] - entry.point[0]) +
		Math.PI / 2;
	if (node.children.length > 1) {
		const centres = node.children.map((n) => centroid(n.ring));
		const u = centres[0],
			v = centres.reduce(
				(p, q) => (distance(q, u) > distance(p, u) ? q : p),
				u
			);
		// Sibling holes form a chain along their own row (B: vertical; Ø: diagonal).
		if (distance(u, v) > EPS) {
			a = Math.atan2(v[1] - u[1], v[0] - u[0]);
		}
	}
	const children = node.children
		.slice()
		.sort(
			(u, v) =>
				dot(centroid(u.ring), direction(a)) -
				dot(centroid(v.ring), direction(a))
		);
	const starts = children.map((n) => support(n.ring, a + Math.PI)),
		ends = children.map((n) => support(n.ring, a));
	const inPort = ray(node.ring, starts[0].point, a + Math.PI),
		outPort = ray(node.ring, ends.at(-1)!.point, a);
	let ordered = [entry, inPort, exit, outPort];
	let forward = true;
	if (!cyclic(node.ring, ordered)) {
		ordered = [entry, outPort, exit, inPort];
		forward = false;
	}
	if (!cyclic(node.ring, ordered))
		throw new ConstructionError(
			'topology',
			'Hole ports do not alternate with the exterior ports'
		);
	outline(edges, node.ring, ordered, first);
	// At entry -> interior port the first colour arrives. To continue that path
	// through the child rather than closing it, orient the child's arcs likewise.
	let previous = inPort.point;
	for (let i = 0; i < children.length; i++) {
		add(edges, [previous, starts[i].point], 'AB', 'shared');
		block(
			edges,
			children[i],
			starts[i],
			ends[i],
			forward ? first : first === 'A' ? 'B' : 'A'
		);
		previous = ends[i].point;
	}
	add(edges, [previous, outPort.point], 'AB', 'shared');
}

const nestedBlocks = new WeakMap<Contour, Map<string, Edge[] | null>>();
/** A nested contour may have its two external attachments on the same side.
 * The straight sibling chain then cannot alternate with those attachments.
 * Open its counters around either attachment instead, preserving one complete
 * entry-to-exit path on each sheet. Try this only in the nested fallback. */
function nestedBlock(...args: Parameters<typeof block>) {
	const [edges, node, entry, exit, first] = args;
	// A contour's attachments recur across its parent's candidate routes:
	// each pair is worked out once.
	const known = nestedBlocks.get(node) ?? new Map<string, Edge[] | null>(), key = `${entry.point};${exit.point};${first}`;
	nestedBlocks.set(node, known);
	if (!known.has(key)) {
		try {
			const found: Edge[] = [];
			openNestedBlock(found, node, entry, exit, first);
			known.set(key, found);
		} catch (error) {
			if (!(error instanceof ConstructionError)) throw error;
			known.set(key, null);
		}
	}
	const found = known.get(key);
	if (!found) throw new ConstructionError('topology', 'No open nested contour construction');
	edges.push(...found.map(edge => ({ ...edge })));
}
/** `nestedBlock` for attachments not seen before. */
function openNestedBlock(...args: Parameters<typeof block>) {
	const [edges, node, entry, exit, first] = args;
	const original: Edge[] = [];
	try {
		block(original, node, entry, exit, first);
		edges.push(...original);
		return;
	} catch (error) {
		if (!(error instanceof ConstructionError)) throw error;
	}
	const contours = (node: Contour): Ring[] => [node.ring, ...node.children.flatMap(contours)];
	const rings = contours(node), routeLocal = createLocalRouter();
	const clearSharedCuts = createSharedCutValidator(rings);
	let best: Edge[] | undefined, cost = Infinity;
	for (const candidate of perforatedOutline(node, [entry, exit], [0, 1], false, false, true)) {
		const routes = routeLocal(candidate, [entry.point, exit.point]);
		if (!routes || !clearSharedCuts(candidate)) continue;
		const score = cuttingCost(routes, 1.5);
		if (score < cost) { cost = score; best = candidate; }
	}
	if (!best) throw new ConstructionError('topology', 'No open nested contour construction');
	// perforatedOutline starts with B. Restore the parent's requested orientation.
	edges.push(...best.map(edge => first === 'B' || edge.family === 'AB' ? edge : {
		...edge, family: edge.family === 'A' ? 'B' as const : 'A' as const
	}));
}
/** A ring's box: its least and greatest x and y. */
function ringBox(r: Ring): [number, number, number, number] {
	let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
	for (const [x, y] of r) {
		if (x < minX) minX = x;
		if (x > maxX) maxX = x;
		if (y < minY) minY = y;
		if (y > maxY) maxY = y;
	}
	return [minX, minY, maxX, maxY];
}
export const centroid = (r: Ring): Point => {
	const [minX, minY, maxX, maxY] = ringBox(r);
	return [(minX + maxX) / 2, (minY + maxY) / 2];
};
export function contourChain(
	edges: Edge[],
	nodes: Contour[],
	angle: number,
	start: Point,
	end: Point,
	first: 'A' | 'B' = 'A',
	visible = false,
	nested = false,
	boundaryGates = false,
	nearest = false
) {
	const atExtremes = !visible && !nearest && !nearestIslands;
	if (!visible && nearestIslands) nearest = true;
	const ordered = nodes
		.slice()
		.sort(
			(a, b) =>
				dot(centroid(a.ring), direction(angle)) -
				dot(centroid(b.ring), direction(angle))
		);
	if (visible && boundaryGates) {
		// A clipped island can own the panel's external gate. Enter that
		// island first, even when its centre projects behind another island.
		const first = ordered.findIndex(node => !!ringPort(node.ring, start));
		if (first >= 0) ordered.unshift(...ordered.splice(first, 1));
		const last = ordered.findIndex(node => !!ringPort(node.ring, end));
		if (last >= 0) ordered.push(...ordered.splice(last, 1));
	}
	let previous = start;
	for (const [index, node] of ordered.entries()) {
		const c = centroid(node.ring), next = index + 1 < ordered.length ? centroid(ordered[index + 1].ring) : end;
		// A hidden island is entered and left at its extremes along the chain,
		// or, `nearest`, where it comes nearest the way in and the way on: a
		// long bent one (the back card of a pair) has its extremes at its ends.
		const entry = visible ? (boundaryGates ? ringPort(node.ring, previous) : undefined) ?? ray(node.ring, previous, Math.atan2(c[1] - previous[1], c[0] - previous[0]))
				: nearest ? closestPort(node.ring, previous) : support(node.ring, angle + Math.PI),
			exit = visible ? (boundaryGates ? ringPort(node.ring, next) : undefined) ?? ray(node.ring, next, Math.atan2(c[1] - next[1], c[0] - next[0]))
				: nearest ? closestPort(node.ring, next) : support(node.ring, angle);
		if (nearest && near(entry.point, exit.point)) throw new ConstructionError('topology', 'Coincident island ports');
		if (atExtremes) portsAtExtremes.push(entry.point, exit.point);
		add(edges, [previous, entry.point], 'AB', 'shared');
		(nested ? nestedBlock : block)(edges, node, entry, exit, first);
		previous = exit.point;
	}
	add(edges, [previous, end], 'AB', 'shared');
}
export function frameRing(shape: Frame, size = 70): Ring {
	const r = size / 2;
	return Array.from(
		{ length: 160 },
		(_, i) =>
			[
				50 + r * Math.cos((i * 2 * Math.PI) / 160),
				50 + r * Math.sin((i * 2 * Math.PI) / 160)
			] as Point
	);
}
const boxPort = (t: number): Point => {
	const d = direction(t),
		r = 50 / Math.max(...d.map(Math.abs));
	return [50 + r * d[0], 50 + r * d[1]];
};
const edgeFamily = (p: Point): 'A' | 'B' =>
	Math.abs(p[1]) < EPS || Math.abs(p[1] - 100) < EPS ? 'A' : 'B';
export function outerFrame(
	edges: Edge[],
	frame: Ring,
	sectors: number[],
	style: 'rays' | 'check'
) {
	return sectors.map((i) => {
		const t = Math.PI / 4 + (i * Math.PI) / 2,
			low = ray(frame, [50, 50], t - Math.PI / 8),
			mid = ray(frame, [50, 50], t),
			high = ray(frame, [50, 50], t + Math.PI / 8);
		let lp = boxPort(t - Math.PI / 8),
			hp = boxPort(t + Math.PI / 8);
		if (style === 'check') {
			lp =
				edgeFamily(lp) === 'A' ? [low.point[0], lp[1]] : [lp[0], low.point[1]];
			hp =
				edgeFamily(hp) === 'A'
					? [high.point[0], hp[1]]
					: [hp[0], high.point[1]];
		}
		add(edges, [lp, ...arc(frame, low, mid)], edgeFamily(lp), 'frame');
		add(edges, [...arc(frame, mid, high), hp], edgeFamily(hp), 'frame');
		return { point: mid.point, low, high, lp, hp, angle: t };
	});
}
export function compile(edges: Edge[], phase: 0 | 1 = 1): CutGeometry {
	const key = (p: Point) => p.map((x) => x.toFixed(6)).join(','),
		curves: CutGeometry['curves'] = {},
		families: CutGeometry['A_overlap_paths'][] = [];
	edges.forEach((e, i) => {
		curves[i] = {
			control_points: [
				e.from,
				mix(e.from, e.to, 1 / 3),
				mix(e.from, e.to, 2 / 3),
				e.to
			],
			visible_boundary: e.family !== 'AB'
		};
	});
	for (const family of ['A', 'B'] as const) {
		const adj = new Map<string, number[]>(),
			ids: number[] = [];
		edges.forEach((e, i) => {
			if (!e.family.includes(family)) return;
			ids.push(i);
			for (const p of [e.from, e.to]) {
				const k = key(p);
				adj.set(k, [...(adj.get(k) ?? []), i]);
			}
		});
		const axis = family === 'A' ? 1 : 0;
		for (const [k, v] of adj) {
			const p = k.split(',').map(Number),
				boundary = p[axis] === 0 || p[axis] === 100;
			if (v.length !== (boundary ? 1 : 2))
				throw new CompilationError(
					`Invalid ${family} degree at ${k}`
				);
		}
		const starts = [...adj.keys()]
			.filter((k) => +k.split(',')[axis] === 0)
			.sort((a, b) => +a.split(',')[1 - axis] - +b.split(',')[1 - axis]);
		const seen = new Set<number>(),
			paths: CutGeometry['A_overlap_paths'] = [];
		for (const start of starts) {
			let at = start;
			const path: CutGeometry['A_overlap_paths'][number] = [];
			for (;;) {
				const id = adj.get(at)!.find((i) => !seen.has(i));
				if (id === undefined) break;
				const e = edges[id],
					reverse = key(e.to) === at;
				seen.add(id);
				path.push({ curve: String(id), reverse });
				at = key(reverse ? e.from : e.to);
			}
			if (+at.split(',')[axis] !== 100)
				throw new CompilationError(
					`${family} path ends on the wrong edge`
				);
			paths.push(path);
		}
		if (seen.size !== ids.length)
			throw new CompilationError(`Closed ${family} cutting cycle`);
		families.push(paths);
	}
	return {
		schema: 'heartcurves-2',
		units: 'mm',
		square_width_mm: 100,
		phase,
		curves,
		A_overlap_paths: families[0],
		B_overlap_paths: families[1]
	};
}
export const uprightToSheet = (p: Point): Point => [
	50 + (p[0] + p[1]) * Math.SQRT1_2,
	50 + (p[1] - p[0]) * Math.SQRT1_2
];
/** How far along the outline, in the square's hundredths, a ray that meets
 * the motif beside one of its points moves to the point: the editor's room
 * between cuts (HEART_CLEARANCE_UNITS). */
const POINT_REACH = 1.5;

/**
 * A ray's port moved to a point of the motif beside it: an outline corner of
 * at most a right angle within POINT_REACH along it. Met just beside its point,
 * the cut runs up to the point and back, the paper between it and the ray a
 * needle (the star's on the default heart, 1.49 units across where 1.5 are
 * asked); met at the point, the ray parts its two sides. Kept where the
 * straight way to the point would cross the outline.
 */
function pointedPort(r: Ring, port: Port, from: Point): Port {
	const n = r.length, turn = Math.sign(area(r));
	let best: Port | undefined, nearest = POINT_REACH;
	for (const direction of [-1, 1]) {
		// A port at the very end of the last side has index n: the first corner.
		let i = (direction < 0 ? Math.floor(port.index) : Math.ceil(port.index)) % n, along = distance(port.point, r[i]);
		for (let steps = 0; steps < n && along <= nearest; steps++) {
			const previous = r[(i + n - 1) % n], next = r[(i + 1) % n], a = sub(r[i], previous), b = sub(next, r[i]);
			// A convex corner of at most a right angle: the outline turns by at least one.
			if (Math.sign(cross(a, b)) === turn && dot(a, b) <= 0) {
				best = { point: r[i], index: i };
				nearest = along;
				break;
			}
			const j = (i + n + direction) % n;
			along += distance(r[i], r[j]);
			i = j;
		}
	}
	if (!best) return port;
	// The way from the gate to the point crosses no side of the outline but the two at the point.
	for (let k = 0; k < n; k++) {
		if (k === best.index || (k + 1) % n === best.index) continue;
		if (segmentsCross(from, best.point, r[k], r[(k + 1) % n])) return port;
	}
	return best;
}

function segmentsCross(p: Point, q: Point, a: Point, b: Point): boolean {
	const d = cross(sub(q, p), sub(b, a));
	if (Math.abs(d) < EPS) return false;
	const t = cross(sub(a, p), sub(b, a)) / d, u = cross(sub(a, p), sub(q, p)) / d;
	return t > EPS && t < 1 - EPS && u > -EPS && u < 1 + EPS;
}

export function generateFigure(
	rings: Ring[],
	shape: Frame = 'circle',
	size = 70,
	scale = 0.7,
	style: 'rays' | 'check' = 'rays'
) {
	const artwork = rings.map((r) =>
		r.map((p) =>
			uprightToSheet([
				p[0] * size * scale,
				p[1] * size * scale
			])
		)
	);
	const nodes = forest(artwork),
		frame = frameRing(shape, size),
		edges: Edge[] = [];
	if (!nodes.length) throw new ConstructionError('empty', 'No contour');
	// A simple silhouette can meet four frame gates. Perforated or disconnected
	// artwork uses the two-gate chain, allowing alternating nested contours.
	if (nodes.length === 1 && !nodes[0].children.length) {
		const gates = outerFrame(edges, frame, [0, 1, 2, 3], style),
			r = nodes[0].ring;
		const ports = gates.map((g) => pointedPort(r, ray(r, g.point, g.angle + Math.PI), g.point));
		if (!cyclic(r, ports))
			throw new ConstructionError(
				'topology',
				'Four ports are not in cyclic order'
			);
		for (let i = 0; i < 4; i++) {
			add(edges, [gates[i].point, ports[i].point], 'AB', 'shared');
			add(
				edges,
				arc(r, ports[i], ports[(i + 1) % 4]),
				i % 2 ? 'A' : 'B',
				'outline'
			);
		}
	} else {
		const centres =
			nodes.length === 1
				? nodes[0].children.map((n) => centroid(n.ring))
				: nodes.map((n) => centroid(n.ring));
		const upright = centres.map((p) => [
			(p[0] - p[1]) * Math.SQRT1_2,
			(p[0] + p[1]) * Math.SQRT1_2
		]);
		const range = (axis: number) =>
			Math.max(...upright.map((p) => p[axis])) -
			Math.min(...upright.map((p) => p[axis]));
		const vertical =
			centres.length > 1 &&
			(nodes.length === 1 ? range(0) > range(1) : range(1) > range(0));
		const gates = outerFrame(edges, frame, vertical ? [2, 0] : [1, 3], style);
		contourChain(
			edges,
			nodes,
			vertical ? Math.PI / 4 : -Math.PI / 4,
			gates[0].point,
			gates[1].point,
			vertical ? 'A' : 'B'
		);
	}
	return { geometry: compile(edges), edges, artwork };
}
export type Font = {
	glyphs: Record<string, { advance: number; contours: Ring[] }>;
};
/** A row of four-port letter cells, following the construction illustrated in
 * Brodal's slides (independent code and OFL font outlines). Adjacent E/W ports
 * share a cut; N/S ports continue as the ordinary A/B checkerboard. Counters
 * are connected to the outer contour by coincident cuts in both sheets.
 * Detached dots/accents are two-port islands on the nearest shared spoke. */
export function generateCheckedText(
	text: string,
	font: Font,
	air: boolean | number = false,
	frame?: Frame,
	fittedCells = false,
	letterScale = 1
) {
	const chars = [...text.normalize('NFC')];
	if (!chars.length || !text.trim())
		throw new ConstructionError('empty', 'Empty text');
	const letters = chars.map((char) => {
		const glyph = font.glyphs[char];
		if (!glyph) throw new ConstructionError('character', char);
		return { char, glyph };
	});
	const nonempty = letters.filter((l) => l.glyph.contours.length);
	const all = nonempty.flatMap((l) => l.glyph.contours.flat());
	if (!all.length) throw new ConstructionError('empty', 'No letter outlines');
	const height =
		Math.max(...all.map((p) => p[1])) - Math.min(...all.map((p) => p[1]));
	// Keep the font's baseline, including accents and descenders.
	const cy =
		(Math.min(...all.map((p) => p[1])) + Math.max(...all.map((p) => p[1]))) / 2;
	// The room around each letter, as a fraction of its height (see `roomOf`
	// in textGrid.ts): these cells keep a little less than the text grid's
	// cells, 0.16 for the woven frame's 0.22, the same from the airy frame's
	// 0.5 on.
	const room = typeof air === 'number' ? air : air ? .5 : .22;
	const pad = room >= .22 ? .16 + (room - .22) * (.34 / .28) : room * .16 / .22;
	// Square cells, as wide as the widest letter needs, keep every check of
	// the weave around the letters square. Cells fitted to each letter are the
	// fallback when square ones leave too little paper.
	const fitted = letters.map(({ glyph }) => {
		if (!glyph.contours.length) return Math.max(glyph.advance, height * 0.35);
		const xs = glyph.contours.flat().map((p) => p[0]);
		return Math.max(...xs) - Math.min(...xs) + height * pad;
	});
	const cellHeight = fittedCells ? height * (1 + pad)
		: Math.max(height * (1 + pad), ...fitted.filter((_, i) => letters[i].glyph.contours.length));
	const widths = fittedCells ? fitted : letters.map(() => cellHeight);
	const span = widths.reduce((a, b) => a + b, 0);
	const offset = Math.max(
		...nonempty.map(({ glyph }) => {
			const ys = glyph.contours.flat().map((p) => p[1]);
			return Math.abs((Math.min(...ys) + Math.max(...ys)) / 2 - cy);
		})
	);
	const fullHeight = cellHeight + 2 * offset;
	// Square cells without a frame lie on the regular checkerboard, as in
	// Brodal's hearts: the cells share one row, each one square's diagonal
	// wide, so the k letters sit on the middle row of a board of k + 2 strips
	// and every strip, the outer ones included, is one square wide.
	const regular = !fittedCells && !frame;
	// A cell is otherwise at most what one letter gets on the regular 3-strip
	// board, or less inside a frame.
	let scale = regular ? 100 * Math.SQRT2 / ((letters.length + 2) * cellHeight)
		: Math.min(128 / (span + fullHeight), (frame ? 38 : 100 * Math.SQRT2 / 3) / cellHeight);
	const boundary = frame ? frameRing(frame, 80) : null;
	// A frame holds the cells; without one they fill the heart like the
	// regular board does, so letter-sized cells keep the larger letters.
	if (boundary) {
		// Fit the complete cell envelope, including shifted accent/descender cells.
		for (const x of [-span / 2, 0, span / 2])
			for (const y of [-fullHeight / 2, fullHeight / 2]) {
				const p = uprightToSheet([x, y]),
					d = sub(p, [50, 50]);
				const hit = ray(boundary, [50, 50], Math.atan2(d[1], d[0]));
				scale = Math.min(
					scale,
					(0.9 * distance(hit.point, [50, 50])) / Math.hypot(x, y)
				);
			}
	}

	const cell = cellHeight * scale;
	let cursor = -span / 2;
	const edges: Edge[] = [],
		artwork: Ring[] = [],
		domain: Ring[] = [];
	const cells: Point[][] = [];
	const letterCuts = new Map<string, { x: number; edges: Edge[] }>();
	let previous: Point | null = null;
	for (let i = 0; i < letters.length; i++) {
		const { glyph } = letters[i];
		const x = (cursor + widths[i] / 2) * scale;
		const cellWidth = widths[i] * scale;
		cursor += widths[i];
		if (!glyph.contours.length) {
			// On the regular board a space keeps its square: the grid continues
			// through it with the ordinary four-port pairing.
			if (!regular) continue;
			const gates = [[x, -cell / 2], [x + cellWidth / 2, 0], [x, cell / 2], [x - cellWidth / 2, 0]]
				.map(p => uprightToSheet(p as Point));
			add(edges, [gates[0], gates[3]], 'A', 'frame');
			add(edges, [gates[1], gates[2]], 'A', 'frame');
			add(edges, [gates[0], gates[1]], 'B', 'frame');
			add(edges, [gates[2], gates[3]], 'B', 'frame');
			previous = connectLetterRow(edges, gates, previous);
			continue;
		}
		const pts = glyph.contours.flat(),
			xs = pts.map((p) => p[0]),
			ys = pts.map((p) => p[1]);
		const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
		// A letter's cell otherwise follows its accent or descender.
		const y = regular ? 0 : ((Math.min(...ys) + Math.max(...ys)) / 2 - cy) * scale;
		domain.push(
			[
				[-1, -1],
				[1, -1],
				[1, 1],
				[-1, 1]
			].map(([a, b]) =>
				uprightToSheet([x + (a * cellWidth) / 2, y + (b * cell) / 2])
			)
		);
		// The letter may be a little larger in its cell, which keeps its place.
		const contours = glyph.contours.map((r) =>
			r.map((p) =>
				uprightToSheet([x + (p[0] - cx) * scale * letterScale, (p[1] - cy) * scale * letterScale])
			)
		);
		artwork.push(...contours);
		const gates = [
			uprightToSheet([x, y - cell / 2]),
			uprightToSheet([x + cellWidth / 2, y]),
			uprightToSheet([x, y + cell / 2]),
			uprightToSheet([x - cellWidth / 2, y])
		];
		const angles = [Math.PI / 2, Math.PI, -Math.PI / 2, 0].map(
			(a) => a - Math.PI / 4
		);
		const cached = letterCuts.get(chars[i]);
		if (cached) {
			const dx = (x - cached.x) * Math.SQRT1_2;
			const translate = (p: Point): Point => [p[0] + dx, p[1] - dx];
			edges.push(
				...cached.edges.map((e) => ({
					...e,
					from: translate(e.from),
					to: translate(e.to)
				}))
			);
		} else {
			const local: Edge[] = [];
			fourPortMotif(
				local,
				contours,
				gates,
				angles,
				gridClearance((regular ? letters : nonempty).length + 2)
			);
			letterCuts.set(chars[i], { x, edges: local });
			edges.push(...local);
		}
		cells.push(gates);
		if (boundary) {
			if (previous) add(edges, [previous, gates[3]], 'AB', 'shared');
			previous = gates[1];
		} else previous = connectLetterRow(edges, gates, previous);
	}
	if (!previous) throw new ConstructionError('empty', 'Empty text');
	if (boundary) {
		const step = Math.PI / (2 * cells.length),
			half = step * 0.3;
		for (const [i, gates] of cells.entries()) {
			const north = framedGate(
				edges,
				boundary,
				Math.PI + (i + 0.5) * step,
				half
			);
			const south = framedGate(
				edges,
				boundary,
				Math.PI / 2 - (i + 0.5) * step,
				half
			);
			add(edges, [gates[0], north], 'AB', 'shared');
			add(edges, [gates[2], south], 'AB', 'shared');
		}
		add(
			edges,
			[
				cells[0][3],
				framedGate(edges, boundary, (3 * Math.PI) / 4, Math.PI / 8)
			],
			'AB',
			'shared'
		);
		add(
			edges,
			[previous, framedGate(edges, boundary, (7 * Math.PI) / 4, Math.PI / 8)],
			'AB',
			'shared'
		);
	} else {
		add(edges, [[previous[0], 0], previous], 'A', 'frame');
		add(edges, [previous, [100, previous[1]]], 'B', 'frame');
	}
	return {
		geometry: compile(edges),
		edges,
		artwork,
		domain: boundary ? [boundary] : domain
	};
}

/** Joins a cell of an unframed letter row to the weave: its north and south
 * gates continue to the sheet's edges, its west gate joins the previous cell
 * by a shared cut (the first cell's continues to the edges), and its east gate
 * is returned for the next cell. */
function connectLetterRow(edges: Edge[], [north, east, south, west]: Point[], previous: Point | null): Point {
	add(edges, [[north[0], 0], north], 'A', 'frame');
	add(edges, [[0, north[1]], north], 'B', 'frame');
	add(edges, [south, [south[0], 100]], 'A', 'frame');
	add(edges, [south, [100, south[1]]], 'B', 'frame');
	if (previous) add(edges, [previous, west], 'AB', 'shared');
	else {
		add(edges, [west, [west[0], 100]], 'A', 'frame');
		add(edges, [[0, west[1]], west], 'B', 'frame');
	}
	return east;
}

/** The order depends only on the number of gates and candidates. Reuse it
 * across letters and caps instead of rebuilding and sorting it at every call. */
const attachmentOrders = new Map<string, number[][]>();
function attachmentOrder(fan: number, count: number) {
	const key = `${fan}:${count}`;
	let choices = attachmentOrders.get(key);
	if (!choices) {
		choices = Array.from({ length: fan ** count }, (_, n) =>
			Array.from({ length: count }, (_, i) => Math.floor(n / fan ** i) % fan)
		).sort((a, b) =>
			a.filter(x => x !== 0).length - b.filter(x => x !== 0).length ||
			a.reduce((x, y) => x + y, 0) - b.reduce((x, y) => x + y, 0)
		);
		attachmentOrders.set(key, choices);
	}
	return choices;
}
/** Whether a port placed along an outline arc takes its index from the arc's
 * own points (see `perforatedOutline`). `arc` leaves out a vertex that meets
 * a port, and an index counted along what is left lies a vertex behind its
 * point, so the outline arc from there doubled back on itself. Hearts built
 * so keep their cuts; one that came out refused, hard to cut or with a needle
 * after such a slip is made again with exact indices (see `generate`). */
let exactArcs = false, arcSlips = 0;
export const arcSlipsSeen = () => arcSlips;
export function withExactArcs<T>(build: () => T): T {
	const before = exactArcs;
	exactArcs = true;
	try {
		return build();
	} finally {
		exactArcs = before;
	}
}
/** Whether hidden islands are entered and left where they come nearest the
 * way in and the way on, rather than at their extremes along the chain (see
 * `contourChain`). Parallel stripes entered at their extremes are joined by
 * cuts along their slanted sides, needles at both ends (a candy cane's six).
 * Hearts built so keep their cuts; a clean one that came out with a sharp
 * tip at a port where an island was entered so is made again (see
 * `generate`), so the ports are kept, from the start of each heart. */
let nearestIslands = false;
const portsAtExtremes: Point[] = [];
export const islandsAtExtremesSeen = () => portsAtExtremes.length;
export const islandPortsSince = (from: number) => portsAtExtremes.slice(from);
export const forgetIslandPorts = () => { portsAtExtremes.length = 0; };
export function withNearestIslands<T>(build: () => T): T {
	const before = nearestIslands;
	nearestIslands = true;
	try {
		return build();
	} finally {
		nearestIslands = before;
	}
}
/** Whether a construction whose islands only route along visible spokes is
 * kept for the final check (see `contourMotif`). Earlier, it can stand where
 * a later construction would be clean, so only a request refused without it
 * tries again with it: every heart built without it keeps its cuts. */
let visibleIslands = false, setAside = 0;
/** How many such constructions were set aside so far: a request that set
 * none aside would fail the same way again. */
export const visibleIslandsSetAside = () => setAside;
export function withVisibleIslands<T>(build: () => T): T {
	const before = visibleIslands;
	visibleIslands = true;
	try {
		return build();
	} finally {
		visibleIslands = before;
	}
}
/** The points' convex hull, its sides moved out by `padding`: the outer
 * connections of a fitted grid clear every island, including the ones in
 * other cells, along their common envelope (see `generateComponentLanes`). */
export function convexEnvelope(points: Ring, padding = 0): Ring {
	const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
	const chain = (points: Ring) => {
		const result: Ring = [];
		for (const p of points) {
			while (result.length > 1 && cross(sub(result.at(-1)!, result.at(-2)!), sub(p, result.at(-1)!)) <= 1e-9)
				result.pop();
			result.push(p);
		}
		return result;
	};
	const hull = [...chain(sorted).slice(0, -1), ...chain([...sorted].reverse()).slice(0, -1)];
	if (hull.length < 3) throw new ConstructionError('empty', 'No component envelope');
	if (!padding) return hull;
	// Intersect outward-offset supporting lines. Radial scaling would leave
	// less room beside a long flat side than beside a corner. This envelope
	// locates invisible joins only; no new outline is drawn around the motif.
	const normals = hull.map((p, i): Point => {
		const v = sub(hull[(i + 1) % hull.length], p), length = Math.hypot(...v);
		return [v[1] / length, -v[0] / length];
	});
	return hull.map((p, i): Point => {
		const a = normals[(i + hull.length - 1) % hull.length], b = normals[i], denominator = 1 + dot(a, b);
		if (denominator < 1e-8) throw new ConstructionError('topology', 'Degenerate component envelope');
		return [p[0] + padding * (a[0] + b[0]) / denominator, p[1] + padding * (a[1] + b[1]) / denominator];
	});
}

/** Boundary cells restrict counters to inward gates, so opening an outer cap
 * cannot discard a counter or its bridges. Their route validator checks the
 * retained paths with the new paper-edge endpoints, instead of the cap that
 * will be removed. Other constructions keep the original four-route check. */
function contourMotif(
	edges: Edge[],
	contours: Ring[],
	gates: Point[],
	angles: number[],
	margin = 1.5,
	bridgePorts: readonly number[] = [0, 1, 2, 3],
	acceptRoutes?: (routes: Ring[]) => boolean,
	options: { root?: Ring; islandRank?: number; islandFlip?: boolean; alternateIslandGates?: boolean; visibleIslands?: boolean; boundaryIslands?: boolean; strict?: boolean; practical?: boolean; originalOnly?: boolean; compound?: boolean; onCompound?: () => void; balanced?: boolean; onCrowded?: () => void; touching?: boolean; bentSpokes?: boolean; strokeTips?: boolean; nested?: boolean; around?: boolean; connectionAllowed?: (point: Point) => boolean; safeAttachments?: boolean; routed?: { fallback?: Edge[] }; obstacles?: Ring[] } = {}
) {
	if (options.alternateIslandGates) {
		// Different letters can need different gates. Finish each cell locally
		// instead of stopping a whole pattern at its first unsupported dot.
		const ranks = forest(contours).length > 1 ? bridgePorts.map((_, i) => i) : [0];
		let last: unknown;
		for (const islandRank of ranks) try {
			contourMotif(edges, contours, gates, angles, margin, bridgePorts, acceptRoutes,
				{ ...options, alternateIslandGates: false, islandRank });
			return;
		} catch (error) {
			if (!(error instanceof ConstructionError)) throw error;
			last = error;
		}
		throw last;
	}
	const count = gates.length;
	// A clipped outline belongs to two neighbouring cells. Attaching an extra
	// shared cut at its seam crossing can branch the joined paper path, even
	// when each cell is valid alone. Enforce the seam's agreed contacts while
	// selecting routes, including counter connections and notch relief.
	const connectionAllowed = options.connectionAllowed;
	const allowedConnections = (edges: Edge[]) => !connectionAllowed ||
		edges.every(e => e.family !== 'AB' || connectionAllowed(e.from) && connectionAllowed(e.to));
	// Candidate routes reuse the same immutable outline points. Keep point
	// identities and graph storage for this cell across its routing attempts.
	const routeLocal = createLocalRouter();
	const reliefCache: ReliefCache = {};
	// Shared cuts cross neither this motif's outlines nor `obstacles`, other
	// parts of the picture they pass on their way.
	const clearSharedCuts = createSharedCutValidator(options.obstacles ? [...contours, ...options.obstacles] : contours);
	const nodes = forest(contours).sort(
		(a, b) => {
			const selected = (r: Ring) => Number(!!options.root && r.includes(options.root[0]));
			return selected(b.ring) - selected(a.ring) || Math.abs(area(b.ring)) - Math.abs(area(a.ring));
		}
	);
	const base = nodes[0];
	// With `around`, a spoke another piece of the motif blocks goes round
	// it: the shortest way past the corners of the pieces' hulls, kept clear
	// of them and inside the circle through the gates (the back card of a
	// pair hides the front one from two gates; a bell's ringing arcs).
	const middle: Point = [gates.reduce((sum, p) => sum + p[0], 0) / count, gates.reduce((sum, p) => sum + p[1], 0) / count],
		inner = Math.min(...gates.map(p => distance(p, middle))) - margin;
	const corners = options.around ? nodes.slice(1).flatMap(node => {
		try {
			return convexEnvelope(node.ring, 2 * margin);
		} catch (error) {
			if (!(error instanceof ConstructionError)) throw error;
			return [];
		}
	}).filter(p => distance(p, middle) < inner) : [];
	const clear = new Map<string, boolean>(), detours = new Map<string, Ring>();
	const open = (a: Point, b: Point) => {
		const key = `${a};${b}`;
		let seen = clear.get(key);
		if (seen === undefined) clear.set(key, seen = clearSharedCuts([{ from: a, to: b, family: 'AB', kind: 'shared' }]));
		return seen;
	};
	const spoke = (gate: Point, port: Point): Ring => {
		if (!corners.length || open(gate, port)) return [gate, port];
		const key = `${gate};${port}`;
		let path = detours.get(key);
		if (path) return path;
		// A* over the corners, each step a shared cut that crosses nothing.
		const points = [gate, ...corners, port], end = points.length - 1;
		const cost = points.map((_, i) => i ? Infinity : 0), from = points.map(() => -1), done = points.map(() => false);
		for (;;) {
			let i = -1;
			for (let k = 0; k <= end; k++) if (!done[k] && cost[k] < Infinity &&
				(i < 0 || cost[k] + distance(points[k], port) < cost[i] + distance(points[i], port))) i = k;
			if (i < 0 || i === end) break;
			done[i] = true;
			for (let k = 1; k <= end; k++) {
				const step = cost[i] + distance(points[i], points[k]);
				if (!done[k] && step < cost[k] && open(points[i], points[k])) {
					cost[k] = step;
					from[k] = i;
				}
			}
		}
		path = [port];
		for (let k = from[end]; k >= 0; k = from[k]) path.unshift(points[k]);
		if (path.length < 2) path = [gate, port];
		detours.set(key, path);
		return path;
	};
	// A clipped quadrilateral may have no usable vertices away from its seams.
	// Offer points along its unchanged edges when the ordinary fan is blocked.
	// Replace those blocked choices only; retain the same attachment budget.
	const safePorts = options.safeAttachments && connectionAllowed ? base.ring.flatMap((point, index) =>
		[.25, .5, .75].map(t => ({ point: mix(point, base.ring[(index + 1) % base.ring.length], t), index: index + t }))
	).filter(port => connectionAllowed(port.point)) : [];
	const candidates = gates.map((p, j) => {
		// A neighbouring cell may place a gate exactly on a clipped boundary.
		// Use that attachment directly rather than shooting through the shape.
		for (let i = 0; i < base.ring.length; i++) {
			const a = base.ring[i],
				b = base.ring[(i + 1) % base.ring.length],
				d = sub(b, a);
			const t = dot(sub(p, a), d) / dot(d, d);
			if (t >= 0 && t <= 1 && distance(p, mix(a, b, t)) < 1e-5) {
				const port = { point: mix(a, b, t), index: i + t };
				return [port, port, port, port, port];
			}
		}

		const result: Array<Port | null> = [];
		for (const offset of [0, -0.28, 0.28])
			result.push(rayHit(base.ring, p, angles[j] + offset));
		// A sharp inward corner otherwise leaves a tiny hooked strip (e.g. the
		// shoulder of a lowercase a). Let a shared spoke end exactly there.
		const notches = base.ring
			.flatMap((point, index) => {
				const a = sub(
					point,
					base.ring[(index + base.ring.length - 1) % base.ring.length]
				);
				const b = sub(base.ring[(index + 1) % base.ring.length], point);
				return Math.atan2(cross(a, b), dot(a, b)) < -0.5
					? [{ point, index }]
					: [];
			})
			.sort((a, b) => distance(a.point, p) - distance(b.point, p));
		result.splice(1, 0, notches[0] ?? null);
		if (options.strokeTips) {
			// A letter such as m has several stroke ends facing the same gate.
			// The global support point sees only one. Local projection maxima
			// offer the other ends without moving or simplifying the outline.
			const direction: Point = [Math.cos(angles[j] + Math.PI), Math.sin(angles[j] + Math.PI)];
			const tips = base.ring.flatMap((point, index) => {
				const previous = base.ring[(index + base.ring.length - 1) % base.ring.length],
					next = base.ring[(index + 1) % base.ring.length];
				return dot(sub(point, previous), direction) >= 0 && dot(sub(next, point), direction) < 0
					? [{ point, index }] : [];
			}).sort((a, b) => distance(a.point, p) - distance(b.point, p));
			result.push(tips[0] ?? support(base.ring, angles[j] + Math.PI));
			if (options.practical) result.push(notches[1] ?? null, tips[1] ?? null, tips[2] ?? null);
		} else {
			result.push(support(base.ring, angles[j] + Math.PI));
			if (options.practical) result.push(notches[1] ?? null, support(base.ring, angles[j] + Math.PI - .7), support(base.ring, angles[j] + Math.PI + .7));
		}
		if (!safePorts.length) return result;
		return result.map(port => {
			if (port && (!connectionAllowed || connectionAllowed(port.point))) return port;
			const origin = port?.point ?? p;
			return safePorts.reduce((a, b) => distance(a.point, origin) <= distance(b.point, origin) ? a : b);
		});
	});
	const spokes = options.bentSpokes ? candidates.map((choices, j) =>
		choices.map(port => port ? bentSpoke(base.ring, port, gates[j], margin) : [])) : undefined;
	let fallback: Edge[] | null = null;
	const alternatives = new Map<string, { edges: Edge[]; ports: Port[] }>();
	const ranked: { edges: Edge[]; routes: Ring[]; score: number }[] = [];
	let attempts = 0;
	// Choose visible attachments in cyclic order. The finite fan of rays is a
	// contour-routing rule, not an inverse image solve: no outline moves, and
	// every candidate has exactly the same visible boundary and topology.
	const fan = options.practical ? 8 : 5;
	const combinations = attachmentOrder(fan, count);
	const seenPorts = new Set<string>();
	routing: for (const indices of combinations) {
		const ports = indices.map((index, j) => candidates[j][index]);
		if (!ports.every((p): p is Port => p != null) || !cyclic(base.ring, ports) ||
			ports.some(p => connectionAllowed && !connectionAllowed(p.point)))
			continue;
		const portKey = ports.map((p) => p.index.toFixed(8)).join(',');
		if (seenPorts.has(portKey)) continue;
		seenPorts.add(portKey);
		// Spokes are independent of the internal bridges. Check them once rather
		// than retrying the same blocked attachment for every counter route.
		const exterior: Edge[] = [];
		const extras = Array.from({ length: count }, () => [] as Contour[]);
		for (const node of nodes.slice(1)) {
			const c = centroid(node.ring);
			// The nearest gate can put a dot's approach across the letter's
			// stem. A final retry may use the next nearest active gate instead.
			const nearest = bridgePorts.reduce(
				(best, i) => distance(c, gates[i]) < distance(c, gates[best]) ? i : best,
				bridgePorts[0]
			);
			// With `around`, an island about as near two gates (one of a
			// symmetric motif's, the polar star's needles) takes the one next on
			// round the cell, so each gate gets one.
			const turn = (i: number) => (Math.atan2(gates[i][1] - middle[1], gates[i][0] - middle[0]) - Math.atan2(c[1] - middle[1], c[0] - middle[0]) + 4 * Math.PI) % (2 * Math.PI);
			const j = options.islandRank
				? [...bridgePorts].sort((a, b) => distance(c, gates[a]) - distance(c, gates[b]))[options.islandRank % bridgePorts.length]
				: options.around ? bridgePorts.filter(i => distance(c, gates[i]) < distance(c, gates[nearest]) * 1.01).reduce((best, i) => turn(i) < turn(best) ? i : best)
				: nearest;
			extras[j].push(node);
		}
		try {
			for (let j = 0; j < count; j++) {
				if (extras[j].length) {
					const c = centroid(extras[j].flatMap(n => n.ring)), b = centroid(base.ring);
					const angle = options.visibleIslands ? Math.atan2(b[1] - c[1], b[0] - c[0]) : angles[j];
					// At an island's seam gate, the outline arcs must follow the
					// panel's alternating A/B phase. A fixed phase can close a
					// cutting loop when the neighbouring half is stitched on.
					// Either sheet can carry each arc of a detached dot or accent.
					// Reversing that choice keeps both terminal paths open but can
					// separate an arc from the nearby stem on the same sheet.
					const first = !!(options.boundaryIslands && j % 2 === 0) !== !!options.islandFlip ? 'B' : 'A';
					contourChain(exterior, extras[j], angle, gates[j], ports[j].point, first,
						options.visibleIslands, options.nested, options.boundaryIslands, options.around);
				}
				else add(exterior, spokes?.[j][indices[j]] ?? spoke(gates[j], ports[j].point), 'AB', 'shared');
			}
		} catch (error) {
			if (!(error instanceof ConstructionError)) throw error;
			continue;
		}
		if (!allowedConnections(exterior) || !clearSharedCuts(exterior)) continue;
		let attachmentAttempts = 0;
		// The crossing checks look at shared cuts only, so they turn an interior
		// away before its outline is drawn or its routes traced: they turn away
		// nearly every interior of a glyph with nested outlines (@).
		const clearInterior = (interior: Edge[]) => {
			const local = [...interior, ...exterior];
			return allowedConnections(local) && clearSharedCuts(local);
		};
		for (const interior of perforatedOutline(base, ports, bridgePorts, options.practical, options.touching, options.nested, clearInterior)) {
			const local = [...interior, ...exterior];
			try {
				const routes = routeLocal(local, gates);
				if (!routes) continue;
				fallback ??= local;
				if (!alternatives.has(portKey) && alternatives.size < (options.practical ? 64 : 8))
					alternatives.set(portKey, { edges: local, ports });
				if (options.practical) {
					ranked.push({ edges: local, routes, score: cuttingCost(routes, margin) });
					if (++attachmentAttempts === 5) options.onCrowded?.();
					if (++attempts >= 256) break routing;
					// A hole offers many internal bridge variants at the same outer
					// attachments. Share the fixed budget across more attachments
					// before spending it all on one unsuccessful approach.
					if (options.balanced && attachmentAttempts >= 4) break;
					continue;
				}
				if (acceptRoutes ? acceptRoutes(routes) : usableRoutes(routes, margin)) {
					edges.push(...local);
					return;
				}
				// Bound routing work on fine artwork. This is not an acceptance:
				// the final fitted cuts must still pass the full-sheet validator.
				if (++attempts >= 128) {
					break routing;
				}
			} catch (e) {
				if (!(e instanceof ConstructionError)) throw e;
			}
		}
	}
	// A sharp concave shoulder cannot be repaired by approaching it from the
	// narrow exterior wedge. A coincident chord through the filled stroke can
	// transfer that corner to the other sheet without changing the artwork.
	// Serif outlines can contain many tiny corners. Bound the extra chord work
	// across all attachment choices for this cell.
	let reliefAttempts = 0;
	relief: for (const local of alternatives.values()) {
		let portAttempts = 0;
		for (const relieved of relieveNotches(local.edges, base.ring, local.ports, bridgePorts, options.practical, reliefCache)) {
			if (options.practical && ++portAttempts > 8) break;
			if (++reliefAttempts > 256) break relief;
			if (!allowedConnections(relieved) || !clearSharedCuts(relieved)) continue;
			const routes = routeLocal(relieved, gates);
			if (!routes) continue;
			if (options.practical) {
				ranked.push({ edges: relieved, routes, score: cuttingCost(routes, margin) });
				continue;
			}
			if (acceptRoutes ? acceptRoutes(routes) : usableRoutes(routes, margin)) {
				edges.push(...relieved);
				return;
			}
		}
	}
	for (const candidate of ranked.sort((a, b) => a.score - b.score))
		if (acceptRoutes ? acceptRoutes(candidate.routes) : usableRoutes(candidate.routes, margin)) {
			edges.push(...candidate.edges);
			return;
		}
	if (options.practical && options.compound) {
		// One chord cannot relieve two independent shoulders. Combine at most
		// two existing relief operations, keeping their original port pairings
		// and coincident A/B cuts. Bound this final local search to 128 pairs.
		for (const local of [...alternatives.values()].slice(0, 8)) {
			let firstCount = 0;
			for (const first of relieveNotches(local.edges, base.ring, local.ports, bridgePorts, true, reliefCache)) {
				if (++firstCount > 4) break;
				let secondCount = 0;
				for (const second of relieveNotches(first, base.ring, local.ports, bridgePorts, true, reliefCache)) {
					if (++secondCount > 4) break;
					const routes = routeLocal(second, gates);
					if (!routes || !allowedConnections(second) || !clearSharedCuts(second)) continue;
					if (acceptRoutes ? acceptRoutes(routes) : usableRoutes(routes, margin)) {
						edges.push(...second);
						options.onCompound?.();
						return;
					}
				}
			}
		}
	}
	if (options.practical) {
		// Corner attachments are optional improvements. Keep the original
		// construction when none fits; final fitted cuts still get validated.
		contourMotif(edges, contours, gates, angles, margin, bridgePorts, acceptRoutes, { ...options, practical: false });
		return;
	}
	if (!options.originalOnly && !options.visibleIslands && nodes.length > 1) {
		const visible: { fallback?: Edge[] } = {};
		try {
			contourMotif(edges, contours, gates, angles, margin, bridgePorts, acceptRoutes, { ...options, visibleIslands: true, strict: true, routed: visible });
			return;
		} catch (error) {
			if (!(error instanceof ConstructionError)) throw error;
		}
		// Islands too close together for any hidden chain (a paw's toes, a
		// sun's rays) can still be entered along visible spokes. Where only
		// those route, their first construction is the one left to the final
		// check, hard to cut rather than refused (see `withVisibleIslands`).
		if (visibleIslands) fallback ??= visible.fallback ?? null;
		else if (!fallback && visible.fallback) setAside++;
	}
	if (options.routed) options.routed.fallback = fallback ?? undefined;
	// Fitted curves get their own full-sheet clearance check before export.
	if (fallback && !acceptRoutes && !options.strict) {
		edges.push(...fallback);
		return;
	}
	throw new ConstructionError('topology', `No open ${count === 4 ? 'four' : 'two'}-port construction`);
}

export const fourPortMotif = contourMotif;

/** Nested counters can turn around either external attachment when the
 * established straight sibling chain cannot form two open cutting paths. */
export function nestedFourPortMotif(...args: Parameters<typeof contourMotif>) {
	args[7] = { ...args[7], nested: true };
	return contourMotif(...args);
}

/** Approach an outline along its outward normal, or the bisector at a corner.
 * A direct gate-to-outline connection can graze a serif and leave a narrow
 * hook. This short bend changes only the shared cut. The caller still checks
 * it against every contour, other shared cuts and the full paper paths. */
function bentSpoke(ring: Ring, port: Port, gate: Point, margin: number): Ring {
	const p = port.point, n = ring.length;
	const unit = (v: Point): Point => {
		const length = Math.hypot(...v);
		return length > EPS ? [v[0] / length, v[1] / length] : [0, 0];
	};
	let tangent: Point;
	const vertex = Math.round(port.index);
	if (Math.abs(port.index - vertex) < EPS) {
		const a = unit(sub(p, ring[(vertex + n - 1) % n])),
			b = unit(sub(ring[(vertex + 1) % n], p));
		tangent = unit([a[0] + b[0], a[1] + b[1]]);
	} else {
		const index = Math.floor(port.index);
		tangent = unit(sub(ring[(index + 1) % n], ring[index]));
	}
	const length = Math.min(margin * 2, distance(gate, p) * .35),
		bend: Point = [p[0] + tangent[1] * length, p[1] - tangent[0] * length];
	return length > margin * .5 && !inside(bend, ring)
		? [gate, bend, p] : [gate, p];
}

/** Keep the original attachment recipe available when a locally valid visible
 * island route fails after neighbouring cells are joined and curves fitted. */
export function originalFourPortMotif(...args: Parameters<typeof contourMotif>) {
	args[7] = { ...args[7], originalOnly: true };
	return contourMotif(...args);
}

/** Keep the same contour construction, but distribute the bounded candidate
 * budget across more outer attachments for difficult counters and shoulders. */
export function balancedFourPortMotif(...args: Parameters<typeof contourMotif>) {
	args[7] = { ...args[7], practical: true, balanced: true };
	return contourMotif(...args);
}

/** A shared connection can turn before meeting the outline instead of grazing
 * a narrow shoulder. Keep the same four open pairs and visible contour. */
export function bentFourPortMotif(...args: Parameters<typeof contourMotif>) {
	args[7] = { ...args[7], bentSpokes: true };
	return contourMotif(...args);
}

/** A counter touching its parent can use that existing junction as one
 * connection, with a coincident A/B bridge on the other side of the gate. */
export function touchingFourPortMotif(...args: Parameters<typeof contourMotif>) {
	args[7] = { ...args[7], touching: true };
	return contourMotif(...args);
}

export function hasCounterContact(rings: Ring[]): boolean {
	const touching = (node: Contour): boolean => node.children.some(child =>
		child.ring.some(point => !!ringPort(node.ring, point)) || touching(child));
	return forest(rings).some(touching);
}

/** A checkerboard junction can feed one letter through two shared bridges.
 * Counters may bracket either bridge; they are never removed from the sheet. */
export function twoPortMotif(edges: Edge[], contours: Ring[], gates: Point[], margin: number,
	options: { balanced?: boolean; compound?: boolean; onCrowded?: () => void; bentSpokes?: boolean; strokeTips?: boolean; obstacles?: Ring[] } = {}) {
	const center = centroid(contours.flat());
	try {
		contourMotif(edges, contours, gates, gates.map(p => Math.atan2(center[1] - p[1], center[0] - p[0])), margin, [0, 1], undefined, { practical: true, ...options });
	} catch (error) {
		if (!(error instanceof ConstructionError)) throw error;
		contourChain(edges, forest(contours), Math.atan2(gates[1][1] - gates[0][1], gates[1][0] - gates[0][0]), gates[0], gates[1], 'A', true);
	}
}

/** Penalize hairpin turns and short sharp steps. A bridge at a letter's
 * natural corner can divide a fragile tongue between the two paper sheets
 * without changing the visible letter. Smooth, finely sampled curves remain
 * cheap: their tiny steps have tiny turning angles. */
function cuttingCost(routes: Ring[], margin: number) {
	let cost = 0;
	for (const route of routes) {
		for (let i = 1; i < route.length; i++) cost += distance(route[i - 1], route[i]) / margin * .002;
		for (let i = 1; i < route.length - 1; i++) {
			const a = sub(route[i], route[i - 1]), b = sub(route[i + 1], route[i]);
			const turn = Math.atan2(Math.abs(cross(a, b)), dot(a, b)) / Math.PI;
			const length = Math.min(Math.hypot(...a), Math.hypot(...b));
			cost += turn ** 4 * (1 + margin / Math.max(length, margin * .1));
		}
	}
	return cost;
}

/** Locate a point on the original outline, including fractional edge positions. */
function ringPort(ring: Ring, point: Point): Port | null {
	for (let i = 0; i < ring.length; i++) {
		const a = ring[i], b = ring[(i + 1) % ring.length];
		// A point on the edge lies in its box widened by the tolerances: most
		// edges are passed over without the projection.
		if (!nearSegmentBox(point, a, b)) continue;
		const d = sub(b, a);
		const t = dot(sub(point, a), d) / dot(d, d);
		if (t >= -EPS && t <= 1 + EPS && distance(point, mix(a, b, t)) < EPS)
			return { point, index: (i + Math.max(0, Math.min(1, t))) % ring.length };
	}
	return null;
}
/** The point of a ring nearest to a point. */
function closestPort(ring: Ring, point: Point): Port {
	let best: Port = { point: ring[0], index: 0 }, nearest = Infinity;
	for (let i = 0; i < ring.length; i++) {
		const a = ring[i], b = ring[(i + 1) % ring.length], d = sub(b, a), length = dot(d, d);
		const t = length ? Math.max(0, Math.min(1, dot(sub(point, a), d) / length)) : 0, p = mix(a, b, t);
		if (distance(p, point) < nearest) {
			nearest = distance(p, point);
			best = { point: p, index: (i + t) % ring.length };
		}
	}
	return best;
}
/** Whether a point can lie within `EPS` of the segment from `a` to `b`,
 * extended by `EPS` of its length at either end: inside their box widened
 * by that much. */
function nearSegmentBox(p: Point, a: Point, b: Point): boolean {
	const dx = Math.abs(b[0] - a[0]), dy = Math.abs(b[1] - a[1]), pad = EPS * (1 + dx + dy) + 1e-12;
	return p[0] >= Math.min(a[0], b[0]) - pad && p[0] <= Math.max(a[0], b[0]) + pad
		&& p[1] >= Math.min(a[1], b[1]) - pad && p[1] <= Math.max(a[1], b[1]) + pad;
}
/** Scoped to one immutable outline, routing mode and allowed external ports.
 * Attachment eligibility is checked against each candidate's current cuts. */
type ReliefCache = {
	sources?: { a: Port; targets: Port[] }[];
	notches?: Port[];
	chords?: WeakMap<Port[], [Port, Port][]>;
	middles?: WeakMap<Edge, Port | null>;
};

/** A chord brackets one active external port. Flipping that interval preserves
 * the four path pairings; both sheets share the new internal cut. Boundary
 * ports are excluded so an opened letter cap cannot swallow this bridge. */
function* relieveNotches(edges: Edge[], ring: Ring, ports: Port[], allowed: readonly number[], practical = false, cache: ReliefCache = {}): Generator<Edge[]> {
	const shared = edges.filter(e => e.family === 'AB').flatMap(e => [e.from, e.to]);
	const blockedPorts = new Map<Point, boolean>();
	const blocked = (point: Point) => {
		let value = blockedPorts.get(point);
		if (value === undefined) { value = shared.some(p => near(p, point)); blockedPorts.set(point, value); }
		return value;
	};
	const notches = cache.notches ??= practical ? ring.flatMap((p, i) => {
		const u = sub(p, ring[(i + ring.length - 1) % ring.length]), v = sub(ring[(i + 1) % ring.length], p);
		return Math.atan2(cross(u, v), dot(u, v)) < -.8 ? [{ point: p, index: i }] : [];
	}) : [];
	if (!cache.sources) {
		cache.sources = [];
		for (let i = 0; i < ring.length; i++) {
			const p = ring[i], u = sub(p, ring[(i + ring.length - 1) % ring.length]), v = sub(ring[(i + 1) % ring.length], p);
			if (Math.atan2(cross(u, v), dot(u, v)) > -.8) continue;
			const source = { a: { point: p, index: i }, targets: [] as Port[] };
			for (let j = 0; j < 32 + notches.length; j++) {
				try {
					const b = j < 32 ? rayHit(ring, p, j * Math.PI / 16) : notches[j - 32];
					if (!b || near(p, b.point) || !inside(mix(p, b.point, .5), ring)) continue;
					source.targets.push(b);
				} catch (error) {
					if (!(error instanceof ConstructionError)) throw error;
				}
			}
			cache.sources.push(source);
		}
	}
	const choices = cache.chords ??= new WeakMap<Port[], [Port, Port][]>();
	let chords = choices.get(ports);
	if (!chords) {
		chords = [];
		for (const { a, targets } of cache.sources) for (const b of targets) {
			for (const [from, to] of [[a, b], [b, a]]) {
				const enclosed = ports.flatMap((port, j) => (port.index - from.index + ring.length) % ring.length < (to.index - from.index + ring.length) % ring.length ? [j] : []);
				if (enclosed.length === 1 && allowed.includes(enclosed[0])) chords.push([from, to]);
			}
		}
		const ranked = chords.map(([a, b]) => ({
			a, b,
			ends: notches.filter(p => near(p.point, a.point) || near(p.point, b.point)).length,
			length: distance(a.point, b.point)
		}));
		ranked.sort((a, b) => b.ends - a.ends || a.length - b.length);
		chords = ranked.map(({ a, b }) => [a, b]);
		choices.set(ports, chords);
	}
	// Compound relief revisits these ports with additional shared endpoints.
	// Filtering the stable order retains exactly the original candidate order,
	// while eligibility still reflects every newly added cut.
	chords = chords.filter(([a, b]) => !blocked(a.point) && !blocked(b.point));
	if (!chords.length) return;
	// Every relief chord uses the same outline edges. Locate them once on the
	// original ring; only an edge split by a new chord needs another lookup.
	const middles = cache.middles ??= new WeakMap<Edge, Port | null>();
	const middlePorts = edges.map(edge => {
		if (edge.family === 'AB' || edge.kind !== 'outline') return null;
		if (!middles.has(edge)) middles.set(edge, ringPort(ring, mix(edge.from, edge.to, .5)));
		return middles.get(edge)!;
	});
	for (const [a, b] of chords) {
		const result: Edge[] = [];
		for (const [edgeIndex, edge] of edges.entries()) {
			if (edge.family === 'AB' || edge.kind !== 'outline') {
				result.push(edge);
				continue;
			}
			const middle = middlePorts[edgeIndex];
			if (!middle) {
				result.push(edge);
				continue;
			}
			const d = sub(edge.to, edge.from);
			const splits = [a.point, b.point].filter(p => nearSegmentBox(p, edge.from, edge.to))
				.map(p => ({ p, t: dot(sub(p, edge.from), d) / dot(d, d) })).filter(({ p, t }) => t > EPS && t < 1 - EPS && distance(p, mix(edge.from, edge.to, t)) < EPS).sort((a, b) => a.t - b.t);
			const points = [edge.from, ...splits.map(s => s.p), edge.to];
			for (let i = 1; i < points.length; i++) {
				const port = splits.length ? ringPort(ring, mix(points[i - 1], points[i], .5))! : middle;
				const flip = (port.index - a.index + ring.length) % ring.length < (b.index - a.index + ring.length) % ring.length;
				add(result, [points[i - 1], points[i]], flip ? (edge.family === 'A' ? 'B' : 'A') : edge.family, 'outline');
			}
		}
		add(result, [a.point, b.point], 'AB', 'shared');
		yield result;
	}
}

/** Add two shared bridges around one external port. Flipping the intervening
 * outline arcs preserves the four external path pairings. A bridge pair on an
 * arc with no external port would instead create a closed cutting cycle.
 * Sibling holes share a chain; nested contours use the two-terminal block.
 * `accept` sees each candidate's shared cuts before its outline is drawn, and
 * turns it away there. */
function* perforatedOutline(node: Contour, ports: Port[], bridgePorts: readonly number[], practical = false, touching = false, nested = false,
	accept: (shared: Edge[]) => boolean = () => true): Generator<Edge[]> {
	if (!node.children.length) {
		const edges: Edge[] = [];
		outline(edges, node.ring, ports, 'B');
		if (accept(edges)) yield edges;
		return;
	}
	const ring = node.ring,
		n = ring.length, count = ports.length;
	const contacts = new Map(node.children.map(child => [child, touching
		? child.ring.map(point => ringPort(ring, point)).filter((port): port is Port => !!port)
		: []]));
	const contactPairs = [...contacts.values()].some(ports => ports.length) ? [[-2, -1], [-1, -2]] : [];
	// The arc's points, each with its index on the ring, none left out.
	const indexed = (a: Port, b: Port) => {
		const end = b.index <= a.index + EPS ? b.index + n : b.index,
			points = [a.point], indices = [a.index];
		for (let i = Math.floor(a.index) + 1; i < end - EPS; i++) {
			points.push(ring[i % n]);
			indices.push(i);
		}
		points.push(b.point);
		indices.push(a.index + ((b.index - a.index + n) % n));
		return { points, indices };
	};
	const exactAt = (a: Port, b: Port, fraction: number): Port => {
		const { points, indices } = indexed(a, b);
		const lengths = points.slice(1).map((p, i) => distance(points[i], p));
		let remaining = lengths.reduce((x, y) => x + y, 0) * fraction;
		for (let i = 0; i < lengths.length; i++) {
			if (lengths[i] && remaining <= lengths[i] || i === lengths.length - 1) {
				const t = lengths[i] ? remaining / lengths[i] : 0;
				return {
					point: mix(points[i], points[i + 1], t),
					index: (indices[i] + (indices[i + 1] - indices[i]) * t) % n
				};
			}
			remaining -= lengths[i];
		}
		throw new ConstructionError('topology', 'Empty contour arc');
	};
	const exactClosest = (a: Port, b: Port, point: Point): Port => {
		const { points, indices } = indexed(a, b);
		let best = a,
			distanceSquared = Infinity;
		for (let i = 0; i < points.length - 1; i++) {
			const delta = sub(points[i + 1], points[i]);
			if (!delta[0] && !delta[1]) continue;
			const t = Math.max(
				0,
				Math.min(1, dot(sub(point, points[i]), delta) / dot(delta, delta))
			);
			const p = mix(points[i], points[i + 1], t),
				d = dot(sub(p, point), sub(p, point));
			if (d < distanceSquared) {
				best = { point: p, index: (indices[i] + (indices[i + 1] - indices[i]) * t) % n };
				distanceSquared = d;
			}
		}
		return best;
	};
	// Where `arc` left a vertex out, count the slip if the index differs.
	const slipped = (a: Port, b: Port, points: Ring, port: Port, exact: () => Port) => {
		const end = b.index <= a.index + EPS ? b.index + n : b.index;
		if (points.length !== 2 + Math.max(0, Math.ceil(end - EPS) - Math.floor(a.index) - 1) &&
			Math.abs(exact().index - port.index) > EPS) arcSlips++;
		return port;
	};
	// The arcs between two ports, and their lengths, asked again for every
	// bridge placed on them.
	const arcs = new Map<Port, Map<Port, { points: Ring; lengths: number[]; total: number }>>();
	const arcBetween = (a: Port, b: Port) => {
		let from = arcs.get(a);
		if (!from) arcs.set(a, from = new Map());
		let found = from.get(b);
		if (!found) {
			const points = arc(ring, a, b), lengths = points.slice(1).map((p, i) => distance(points[i], p));
			from.set(b, found = { points, lengths, total: lengths.reduce((x, y) => x + y, 0) });
		}
		return found;
	};
	const at = (a: Port, b: Port, fraction: number): Port => {
		if (exactArcs) return exactAt(a, b, fraction);
		const { points, lengths, total } = arcBetween(a, b);
		let remaining = total * fraction;
		for (let i = 0; i < lengths.length; i++) {
			if (remaining <= lengths[i] || i === lengths.length - 1) {
				const start = i === 0 ? a.index : Math.floor(a.index) + i;
				const end =
					i === lengths.length - 1
						? a.index + ((b.index - a.index + n) % n)
						: Math.floor(a.index) + i + 1;
				const t = remaining / lengths[i];
				return slipped(a, b, points, {
					point: mix(points[i], points[i + 1], t),
					index: (start + (end - start) * t) % n
				}, () => exactAt(a, b, fraction));
			}
			remaining -= lengths[i];
		}
		throw new ConstructionError('topology', 'Empty contour arc');
	};
	const closest = (a: Port, b: Port, point: Point): Port => {
		if (exactArcs) return exactClosest(a, b, point);
		const { points } = arcBetween(a, b);
		let best = a,
			distanceSquared = Infinity;
		for (let i = 0; i < points.length - 1; i++) {
			const delta = sub(points[i + 1], points[i]);
			const t = Math.max(
				0,
				Math.min(1, dot(sub(point, points[i]), delta) / dot(delta, delta))
			);
			const p = mix(points[i], points[i + 1], t),
				d = dot(sub(p, point), sub(p, point));
			if (d < distanceSquared) {
				const start = i === 0 ? a.index : Math.floor(a.index) + i;
				const end =
					i === points.length - 2
						? a.index + ((b.index - a.index + n) % n)
						: Math.floor(a.index) + i + 1;
				best = { point: p, index: (start + (end - start) * t) % n };
				distanceSquared = d;
			}
		}
		return slipped(a, b, points, best, () => exactClosest(a, b, point));
	};

	// Each counter's box, and a group's box centre from theirs: the numbers
	// `centroid` gives, asked at every candidate bridge.
	const boxes = new Map(node.children.map(child => [child, ringBox(child.ring)]));
	const centreOf = (children: Contour[]): Point => {
		let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
		for (const child of children) {
			const [x0, y0, x1, y1] = boxes.get(child)!;
			if (x0 < minX) minX = x0;
			if (x1 > maxX) maxX = x1;
			if (y0 < minY) minY = y0;
			if (y1 > maxY) maxY = y1;
		}
		return [(minX + maxX) / 2, (minY + maxY) / 2];
	};
	const centres = new Map(node.children.map(child => [child, centreOf([child])]));
	const nearest = node.children.map((h) =>
		bridgePorts.reduce(
			(best, i) =>
				distance(centres.get(h)!, ports[i].point) <
				distance(centres.get(h)!, ports[best].point)
					? i
					: best,
			bridgePorts[0]
		)
	);
	const partitions = [
		nearest,
		...bridgePorts.map((j) => node.children.map(() => j))
	];
	const seenPartitions = new Set<string>();
	for (const assignment of partitions) {
		const key = assignment.join(',');
		if (seenPartitions.has(key)) continue;
		seenPartitions.add(key);
		// A bridge that would start at a port, or a counter met at one point, is
		// no candidate: skipped without an error, as there are many (@).
		for (const corners of practical ? [true, false] : [false]) candidate: for (const [left, right] of [
			...contactPairs,
			[-1, -1],
			[0.5, 0.5],
			[0.3, 0.7],
			[0.7, 0.3],
			[0.25, 0.5],
			[0.5, 0.75],
			[0.75, 0.5],
			[0.5, 0.25]
		]) {
			const edges: Edge[] = [],
				intervals: [Port, Port][] = [];
			try {
				for (let j = 0; j < count; j++) {
					const children = node.children.filter((_, i) => assignment[i] === j);
					if (!children.length) continue;
					const center = centreOf(children);
					const contact = (a: Port, b: Port): Port => {
						if (children.length !== 1) throw new ConstructionError('topology', 'Contact needs one counter');
						const candidates = contacts.get(children[0])!.filter(p =>
							!near(p.point, a.point) && !near(p.point, b.point) &&
							(p.index - a.index + n) % n < (b.index - a.index + n) % n);
						if (!candidates.length) throw new ConstructionError('topology', 'No counter contact on arc');
						return candidates.reduce((a, b) => distance(a.point, center) < distance(b.point, center) ? a : b);
					};
					const before = left === -2 ? contact(ports[(j + count - 1) % count], ports[j]) :
						left < 0
							? closest(ports[(j + count - 1) % count], ports[j], center)
							: at(ports[(j + count - 1) % count], ports[j], left);
					const after = right === -2 ? contact(ports[j], ports[(j + 1) % count]) :
						right < 0
							? closest(ports[j], ports[(j + 1) % count], center)
							: at(ports[j], ports[(j + 1) % count], right);
					if (
						[before, after].some((p) =>
							ports.some((q) => near(p.point, q.point))
						)
					)
						continue candidate;
					intervals.push([before, after]);
					const d = sub(after.point, before.point);
					children.sort(
						(a, b) => dot(centres.get(a)!, d) - dot(centres.get(b)!, d)
					);
					let previous = before.point;
					for (let k = 0; k < children.length; k++) {
						const h = children[k],
							c = centres.get(h)!;
						const next =
							k + 1 < children.length
								? centres.get(children[k + 1])!
								: after.point;
						const entry = (left === -2 ? ringPort(h.ring, previous) : undefined) ?? (corners ? support(h.ring, Math.atan2(previous[1] - c[1], previous[0] - c[0])) : ray(
							h.ring,
							previous,
							Math.atan2(c[1] - previous[1], c[0] - previous[0])
						));
						const exit = (right === -2 ? ringPort(h.ring, next) : undefined) ?? (corners ? support(h.ring, Math.atan2(next[1] - c[1], next[0] - c[0])) : ray(
							h.ring,
							next,
							Math.atan2(c[1] - next[1], c[0] - next[0])
						));
						if (near(entry.point, exit.point)) continue candidate;
						add(edges, [previous, entry.point], 'AB', 'shared');
						(nested ? nestedBlock : block)(edges, h, entry, exit, 'A');
						previous = exit.point;
					}
					add(edges, [previous, after.point], 'AB', 'shared');
				}
				// Every shared cut is in; the outline adds only A and B arcs.
				if (!accept(edges)) continue;
				const all = [...ports, ...intervals.flat()].sort(
					(a, b) => a.index - b.index
				);
				for (let i = 0; i < all.length; i++) {
					const a = all[i],
						b = all[(i + 1) % all.length];
					const mid = (a.index + ((b.index - a.index + n) % n) / 2) % n;
					const contains = (a: Port, b: Port) =>
						(mid - a.index + n) % n < (b.index - a.index + n) % n;
					let family: 'A' | 'B' =
						ports.findIndex((p, j) => contains(p, ports[(j + 1) % count])) % 2
							? 'A'
							: 'B';
					if (intervals.filter(([a, b]) => contains(a, b)).length % 2)
						family = family === 'A' ? 'B' : 'A';
					add(edges, arc(ring, a, b), family, 'outline');
				}
				yield edges;
			} catch (e) {
				if (!(e instanceof ConstructionError)) throw e;
			}
		}
	}
}

export function generateFourPortFigure(
	rings: Ring[],
	shape: Frame = 'circle',
	size = 70,
	scale = 0.7,
	style: 'rays' | 'check' = 'rays',
	route = fourPortMotif,
	extraStrips = 0
) {
	const artwork = rings.map((r) =>
			r.map((p) =>
				uprightToSheet([
					p[0] * size * scale,
					p[1] * size * scale
				])
			)
		),
		edges: Edge[] = [];
	const gates = outerFrame(edges, frameRing(shape, size), [2, 3, 0, 1], style);
	route(
		edges,
		artwork,
		gates.map((g) => g.point),
		gates.map((g) => g.angle + Math.PI),
		gridClearance(3 + extraStrips)
	);
	return { geometry: compile(edges), edges, artwork };
}

/** The search's clearance verdicts on routes seen before, by their points
 * and margin, alone and beside another route in its lobe: the candidate
 * constructions of one cell share most of their routes. */
const routeIds = new Map<string, number>(), aloneVerdicts: boolean[] = [], pairVerdicts = new Map<number, boolean>();
function usableRoutes(routes: Ring[], margin: number): boolean {
	if (routeIds.size >= 1 << 15 || pairVerdicts.size >= 1 << 20) {
		routeIds.clear();
		aloneVerdicts.length = 0;
		pairVerdicts.clear();
	}
	const ids = routes.map((route) => {
		const key = margin + ';' + route.join(';');
		let id = routeIds.get(key);
		if (id === undefined) routeIds.set(key, id = routeIds.size);
		return id;
	});
	const curves: SearchCurve[] = [];
	const curve = (i: number) => curves[i] ??= searchCurve(routeFinger(routes[i]));
	// The search's own clearance rule (see `searchClearance`): no route comes
	// too close to itself or to another in its lobe.
	for (let i = 0; i < routes.length; i++) {
		const alone = aloneVerdicts[ids[i]] ??= searchCurveSelfIssues(curve(i), margin * 4);
		if (alone) return false;
		for (let j = 0; j < routes.length; j++) {
			if (j === i || (i < routes.length / 2) !== (j < routes.length / 2)) continue;
			const key = ids[i] * (1 << 16) + ids[j];
			let pair = pairVerdicts.get(key);
			if (pair === undefined) pairVerdicts.set(key, pair = searchCurvePairIssues(curve(i), curve(j), margin * 4));
			if (pair) return false;
		}
	}
	return true;
}

/** A route as a cut of straight segments, its ends extended: cell ports
 * become interior points once neighbours are connected, and the extension
 * keeps the editor's endpoint exemption from hiding a pinch. */
function routeFinger(route: Ring): Finger {
	const extend = (p: Point, q: Point): Point =>
		mix(q, p, 1 + 3 / Math.max(distance(p, q), 1e-6));
	const extended = [
		extend(route[0], route[1]),
		...route,
		extend(route.at(-1)!, route.at(-2)!)
	];
	return {
		id: '',
		lobe: 'right',
		segments: extended.slice(1).map((p, j) => {
			const a = extended[j],
				b = mix(a, p, 1 / 3),
				c = mix(a, p, 2 / 3);
			return {
				p0: { x: a[0] * 4, y: a[1] * 4 },
				p1: { x: b[0] * 4, y: b[1] * 4 },
				p2: { x: c[0] * 4, y: c[1] * 4 },
				p3: { x: p[0] * 4, y: p[1] * 4 }
			};
		})
	};
}

/** A completed letter can still contain the legacy fallback route. Check its
 * open paths before reusing it in a repair pass, with the same port extensions
 * and physical clearance used when choosing the original construction. */
export function usableMotif(edges: Edge[], gates: Point[], margin: number): boolean {
	const routes = createLocalRouter()(edges, gates);
	return !!routes && usableRoutes(routes, margin);
}

/** Divide a sharp outline corner with one additional coincident cut. Reuse the
 * working letter's external connections: no new attachment search or outline
 * changes. This simple operation applies to one solid contour; counters and
 * detached components retain their established routing. */
export function relieveMotifTips(edges: Edge[], contours: Ring[], gates: Point[], margin: number,
	axes: number[]): Edge[] | undefined {
	const nodes = forest(contours);
	if (nodes.length !== 1 || nodes[0].children.length || gates.length !== 2) return;
	const ring = nodes[0].ring;
	const ports = gates.map(gate => {
		const edge = edges.find(e => e.family === 'AB' && (near(e.from, gate) || near(e.to, gate)));
		return edge && ringPort(ring, near(edge.from, gate) ? edge.to : edge.from);
	});
	if (!ports.every((port): port is Port => !!port)) return;
	const contacts = gates.map((point, i) => ({ point, axis: axes[i] }));
	const original = cellTipCounts(edges, contacts);
	if (!original[1]) return;
	const choices: { edges: Edge[]; tips: [number, number] }[] = [];
	let attempts = 0;
	for (const candidate of relieveNotches(edges, ring, ports, [0, 1], true)) {
		if (++attempts > 128) break;
		const tips = cellTipCounts(candidate, contacts);
		if (fewerCutTips(tips, original)) choices.push({ edges: candidate, tips });
	}
	choices.sort((a, b) => a.tips[0] - b.tips[0] || a.tips[1] - b.tips[1]);
	const clearSharedCuts = createSharedCutValidator(contours);
	for (const choice of choices)
		if (clearSharedCuts(choice.edges) && usableMotif(choice.edges, gates, margin))
			return choice.edges;
}

/** Each letter keeps its own connections to the frame. Joining a whole word
 * into one two-terminal chain gives fewer cuts, but a very difficult strip to
 * weave. These gates spread the letters across a larger, more manageable grid. */
export function generateFramedText(text: string, font: Font, frame: Frame) {
	return generateCheckedText(text, font, false, frame);
}

export function framedGate(
	edges: Edge[],
	ring: Ring,
	angle: number,
	half: number,
	fan = 1,
	spread = false
): Point {
	const low = ray(ring, [50, 50], angle - half),
		mid = ray(ring, [50, 50], angle),
		high = ray(ring, [50, 50], angle + half);
	const quadrant = Math.floor(angle / (Math.PI / 2));
	const first: 'A' | 'B' = quadrant % 2 ? 'A' : 'B';
	const edge = (p: Point, family: 'A' | 'B'): Point =>
		family === 'A'
			? [
					Math.cos(angle) > 0 ? 100 - (100 - p[0]) * fan : p[0] * fan,
					Math.sin(angle) > 0 ? 100 : 0
				]
			: [
					Math.cos(angle) > 0 ? 100 : 0,
					Math.sin(angle) > 0 ? 100 - (100 - p[1]) * fan : p[1] * fan
				];
	const route = (point: Point, family: 'A' | 'B'): Ring => {
		if (!spread || quadrant % 2) return [point, edge(point, family)];
		// Where many gates share a corner the heart's middle runs through, a
		// direct projection would run a leg along the circle. Each leg steps a
		// quarter of the margin off it instead, then runs straight to the edge:
		// square in the checks, fanned to ends spread in the gates' order in
		// the rays, so legs of one sheet never cross. (Routes stepping round
		// the corner nested every leg in the next, boxes in boxes.) Reflect
		// every quadrant into the upper-left corner, reversing the angular
		// order for a single-axis reflection.
		const reflect = (p: Point): Point =>
			[quadrant === 0 || quadrant === 3 ? 100 - p[0] : p[0],
				quadrant === 0 || quadrant === 1 ? 100 - p[1] : p[1]];
		const p = reflect(point),
			rawFraction = (angle - (quadrant * Math.PI) / 2) / (Math.PI / 2),
			fraction = quadrant % 2 ? 1 - rawFraction : rawFraction;
		const aside = Math.min(...ring.map((p) => p[0])) / 4;
		const topRoute = (p: Point, t: number): Ring => {
			if (fan === 1) return p[0] < p[1] - EPS ? [p, [p[0] - aside, p[1]], [p[0] - aside, 0]] : [p, [p[0], 0]];
			const r = distance(p, [50, 50]);
			return [p, [50 + (p[0] - 50) * (r + aside) / r, 50 + (p[1] - 50) * (r + aside) / r], [50 * t, 0]];
		};
		const points =
			family === 'A'
				? topRoute(p, fraction)
				: topRoute([p[1], p[0]], 1 - fraction).map(([x, y]) => [y, x] as Point);
		return points.map(reflect);
	};
	// Both legs of a gate at a board junction on the ring end at the gate itself.
	const along = (a: Port, b: Port) => near(a.point, b.point) ? [a.point] : arc(ring, a, b);
	add(
		edges,
		[...route(low.point, first).reverse(), ...along(low, mid).slice(1)],
		first,
		'frame'
	);
	const other = first === 'A' ? 'B' : 'A';
	add(
		edges,
		[...along(mid, high), ...route(high.point, other).slice(1)],
		other,
		'frame'
	);
	return mid.point;
}

/** Where an open frame's leg from `gate` meets the paper edge through `corner`:
 * straight along `axis`, then moved toward that corner by the frame's taper. */
export function openLeg(gate: Point, corner: Point, axis: 0 | 1, taper: number): Point {
	const end: Point = [gate[0], gate[1]], other = 1 - axis;
	end[axis] = corner[axis];
	if (taper !== 1) end[other] = corner[other] + (gate[other] - corner[other]) * taper;
	return end;
}

/** The radii a circle on a regular board of `strips` strips (odd) can take,
 * in the ranges of its constructions. Its lines lie `d` = 0.5, 1.5, … squares
 * from the centre. From five units outside the centre square's corners up to
 * the radius through the inner corners of the next ring of squares, where it
 * just touches that ring, the motif meets the two middle lines of each sheet
 * as a letter in the circle frame; the lines further out cross the paper
 * whole, or, once the circle reaches them, follow it (see `boardLegs`). From
 * there out to the junctions at that ring's own corners the circle meets two
 * lines of each sheet on each side, and the motif, divided into four panels,
 * meets all their ends. Past those junctions, the circle overlaps the ring's
 * corner squares, of its own colour, and the same panels meet the same ends
 * (see `overlapGates`): on five strips out past the paper's edges, which cut
 * it off (see `boardRing`). On finer boards the next line out then follows
 * the circle, the middle lines of the other sheet crossing it, until the
 * second lines' ends come too close to its arc for a gate between them
 * (`gateRoom`); further out still the motif would need nine panels, which few
 * motifs can be divided into, so the heart leaves the middle lines out (see
 * below). On three, whose one line a side the motif
 * meets whole however large the circle, there is one range, out past the
 * paper's edges and over the corner squares until it meets the edges halfway
 * along them. */
export function boardRanges(strips: number): readonly (readonly [number, number])[] {
	// One set per board, so a range found for a radius is the board's own.
	const known = rangesByStrips.get(strips);
	if (known) return known;
	const all = boardLines(strips), ranges = linesRanges(all);
	// Further out the heart leaves the middle lines out, with the same lines
	// of the other sheet: the outer two lines a side remain, met as on five
	// strips with the motif divided in four, out to a unit past covering the
	// inner of the two (as five strips' 52). Once the circle covers the
	// middle lines whole, from edge to edge of the paper, that changes no
	// square outside it; short of that, from where the circle meets the
	// outer lines' junctions with the inner, only the outer ring's middle
	// squares, which merge into one of the circle's colour beside it. So the
	// circle grows on from just past the largest above, rather than from
	// where it covers the middle lines. (Leaving out fewer, on nine strips,
	// would leave bars three squares long in the outer ring.)
	if (all.length > 2) {
		// From just past the junction of the outer two lines, where the circle
		// first meets both a side, and past the largest circle with every line.
		const lines = all.slice(-2), meet = Math.hypot(lines[1], lines[0]);
		let from = ranges[ranges.length - 1][1] + .8;
		// Where completions with every line have been found for the board, they
		// carry the circle on from just past the junctions where theirs begin,
		// while they cut cleanly, and the middle lines are left out only after
		// (see `boardCompletion`).
		for (const { strips: n, lo, hi, band, pattern } of BOARD_PATTERNS) if (n === strips && lo > from - 1e-6) {
			const range = [lo, hi] as const;
			patternRanges.set(range, pattern);
			if (band) rangeBands.set(range, band);
			ranges.push(range);
			from = hi;
		}
		from = Math.max(from, meet + .4);
		for (const [low, high] of linesRanges(lines, Math.hypot(lines[0], 50) + 1))
			if (high > from && meet < (low + high) / 2) {
				const range = [Math.max(low, from), high] as const;
				coveredLines.set(range, lines);
				ranges.push(range);
			}
	}
	rangesByStrips.set(strips, ranges);
	return ranges;
}
/** The ranges of radii for a board whose lines lie `d` from its centre (see
 * `boardRanges`), the last out to `top`. */
function linesRanges(d: number[], top = 52): (readonly [number, number])[] {
	const junction = (j: number, k: number) => Math.hypot(d[Math.max(j, k)], d[Math.min(j, k)]);
	const ranges: (readonly [number, number])[] = d.length < 2 ? [[junction(0, 0) + 5, Math.hypot(50, 50 - d[0])]]
		: [[junction(0, 0) + 5, junction(1, 0)], [junction(1, 0), junction(1, 1) - .4]];
	if (d.length > 1) {
		// Clear of each junction by as much as of the second ring's corners.
		let low = junction(1, 1) + .4, open = true;
		const after = d.flatMap((_, j) => d.slice(j).map((_, i) => junction(j + i, j))).filter(r => r > low).sort((a, b) => a - b);
		for (const next of after) {
			if (next - .4 > low) {
				if (gateRoom((low + next - .4) / 2, d) <= 0) {
					open = false;
					break;
				}
				// Short of a line it would just touch, too (see `boardRadius`),
				// and while each gate keeps room for a cut either side of it.
				const touched = d.find(dk => Math.abs(next - .4 - dk) < .1);
				let high = touched === undefined ? next - .4 : touched - .15;
				if (gateRoom(high, d) < 1.5) {
					let roomy = (low + high) / 2;
					for (let step = 0; step < 40; step++) {
						const mid = (roomy + high) / 2;
						if (gateRoom(mid, d) < 1.5) high = mid;
						else roomy = mid;
					}
					high = roomy;
				}
				ranges.push([low, high]);
			}
			low = Math.max(low, next + .4);
		}
		// Past the last junction, out past the paper's edges.
		if (open && low < top && gateRoom((low + top) / 2, d) > 0) ranges.push([low, top]);
	}
	return ranges;
}
const rangesByStrips = new Map<number, readonly (readonly [number, number])[]>();
/** The lines that remain in a range where the circle covers the middle ones. */
const coveredLines = new WeakMap<readonly [number, number], number[]>();
/** The completion that routes every line in a range past the motif in four's reach. */
const patternRanges = new WeakMap<readonly [number, number], BoardPattern>();
/** How far inside the circle a completion keeps the motif, in its range,
 * for its cuts across the circle to pass between. */
const rangeBands = new WeakMap<readonly [number, number], number>();
/** The completion for a range of radii, where one carries the circle (see `boardRanges`). */
export const boardRangePattern = (range: readonly [number, number]) => patternRanges.get(range);
/** The distances from the centre of the lines a range of radii on a board
 * of `strips` strips meets the circle with (see `boardRanges`): all of the
 * board's, or where the circle covers the middle ones, the outer two. */
export function boardRangeLines(range: readonly [number, number], strips: number): number[] {
	return coveredLines.get(range) ?? boardLines(strips);
}
/** How far from the centre of a circle of `radius` on a board of `strips`
 * strips the motif reaches, with the space around it: to the circle, or to
 * the paper's edges where the circle is wider. Where the circle first steps
 * on past a junction to a completion or to leaving the middle lines out, the
 * motif does not step with it but grows on evenly, over the radii of the
 * ranges and not the steps between them, from the largest circle before to
 * the first past the outer lines' corner junctions, which leaves the gates
 * room between it and the circle (see `boardRanges`). */
export function boardFill(radius: number, strips: number): number {
	const ranges = boardRanges(strips), first = ranges.findIndex(range => coveredLines.has(range) || patternRanges.has(range));
	if (first < 0) return Math.min(radius, 50);
	const outer = boardLines(strips).at(-1)!, past = ranges.find(range => range[0] > Math.hypot(outer, outer));
	if (radius < ranges[first][0] || !past || radius >= past[0]) return Math.min(radius, 50);
	// Along the radii from the first, less the steps between the ranges below
	// (the last, on to the first circle past the junctions, kept).
	const spans = ranges.slice(first, ranges.indexOf(past)), start = spans[0][0];
	const steps = spans.slice(1).map(([low], i) => [spans[i][1], low] as const);
	const along = (r: number) => steps.reduce((x, [a, b]) => x - Math.max(0, Math.min(r, b) - a), r - start);
	// Evenly, but never past a circle before it steps on, nor nearer a circle
	// than its completion lets it (see `BOARD_PATTERNS`): the lowest convex
	// line under those, from the largest circle before to the first past.
	const from = ranges[first - 1][1], whole = past[0], hull: Point[] = [];
	const under = new Map<number, number>();
	for (const range of spans) for (const r of range) {
		const at = along(r), y = Math.min(r, 50) - (rangeBands.get(range) ?? 0);
		under.set(at, Math.min(under.get(at) ?? Infinity, y));
	}
	under.delete(0);
	under.delete(along(whole));
	for (const p of [[0, from], ...[...under].sort((a, b) => a[0] - b[0]), [along(whole), Math.min(whole, 50)]] as Point[]) {
		const turn = () => { const [o, q] = hull.slice(-2); return (q[0] - o[0]) * (p[1] - o[1]) - (q[1] - o[1]) * (p[0] - o[0]); };
		while (hull.length > 1 && turn() <= 0) hull.pop();
		hull.push(p);
	}
	const x = along(radius), k = Math.max(1, hull.findIndex(([at]) => at >= x)), [x0, y0] = hull[k - 1], [x1, y1] = hull[k];
	return y0 + (x - x0) / (x1 - x0) * (y1 - y0);
}
/** The distances of a regular board's lines from its centre, half a square,
 * a square and a half, …, on each side. */
export const boardLines = (strips: number) => Array.from({ length: (strips - 1) / 2 }, (_, k) => (100 / strips) * (k + .5));
/** How many lines of each sheet a side meet the motif in a range of radii,
 * its panels a side: those whose junctions with the middle lines the circle
 * encloses, the motif divided at most in four. A line it reaches short of
 * that, or the one beyond the motif's, follows the circle (see `boardLegs`). */
export function boardPanels(range: readonly [number, number], strips: number): number {
	const d = boardRangeLines(range, strips), radius = (range[0] + range[1]) / 2;
	return Math.max(1, Math.min(2, d.filter(dk => Math.hypot(dk, d[0]) < radius).length));
}
/** How far from the lines beside it the closest gate on a circle of
 * `radius` about the centre of a board whose lines lie `d` from it is, where
 * each quarter's ends pair up: the j-th end of one sheet with the j-th of
 * the other, each pair's gate midway between its ends and clear of the
 * neighbouring pairs' ends of the same sheet, and of the arcs of a line
 * beyond the motif's that follows the circle (see `boardLegs`). None, or
 * less, where they do not. */
function gateRoom(radius: number, d: number[], whole = false): number {
	const lines = d.filter(dk => Math.hypot(dk, d[0]) < radius), panels = whole ? 1 : Math.min(2, lines.length);
	if (lines.length > panels + 1) return -Infinity;
	// From the quarter's start, along the circle: one sheet's ends from the
	// nearest line out, the other's from the furthest in, a following line's
	// arcs before and after them; each with how far a point at an angle is
	// from its line.
	type Stop = { angle: number; away: (angle: number) => number };
	const across = (dk: number): Stop => ({ angle: Math.atan2(dk, Math.sqrt(radius ** 2 - dk ** 2)), away: angle => Math.abs(radius * Math.sin(angle) - dk) });
	const down = (dk: number): Stop => ({ angle: Math.PI / 2 - across(dk).angle, away: angle => Math.abs(radius * Math.cos(angle) - dk) });
	const x = lines.slice(0, panels).map(across), y = lines.slice(0, panels).map(down).reverse(), follower = lines[panels];
	const before = follower === undefined ? undefined : down(follower), after = follower === undefined ? undefined : across(follower);
	return Math.min(...x.map((xj, j) => {
		const low = [xj, j ? y[j - 1] : before].reduce((a, b) => b && b.angle > a!.angle ? b : a)!,
			high = [y[j], j < panels - 1 ? x[j + 1] : after].reduce((a, b) => b && b.angle < a!.angle ? b : a)!;
		if (low.angle >= high.angle) return -Infinity;
		const mid = (low.angle + high.angle) / 2;
		return Math.min(low.away(mid), high.away(mid));
	}));
}
/** The circle a motif kept whole takes for a radius the setting asks: that
 * radius where a completion about a whole motif covers it (`WHOLE_PATTERNS`),
 * else the largest below it that one covers, or the touching ring's top. */
export function boardWholeRadius(radius: number, strips: number): number {
	let best = Math.min(radius, boardWholeTop(strips));
	for (const { strips: n, lo, hi } of WHOLE_PATTERNS) if (n === strips && lo <= radius) best = Math.max(best, Math.min(radius, hi));
	return best;
}
/** How far from the centre a motif kept whole reaches with the space around
 * it, past the touching ring's top: evenly over the radii its completions
 * cover (not the steps between them), never nearer their circles than they
 * let it (`band`), as `boardFill` for the motif in four. */
export function boardWholeFill(radius: number, strips: number): number {
	const top = boardWholeTop(strips), spans = WHOLE_PATTERNS.filter(p => p.strips === strips).sort((a, b) => a.lo - b.lo);
	if (radius <= top || !spans.length) return boardFill(radius, strips);
	const along = (r: number) => spans.reduce((x, { lo, hi }) => x + Math.max(0, Math.min(r, hi) - lo), 0);
	const under = new Map<number, number>();
	for (const { lo, hi, band = 0 } of spans) for (const r of [lo, hi]) {
		const at = along(r), y = Math.min(r, 50) - band;
		under.set(at, Math.min(under.get(at) ?? Infinity, y));
	}
	const from = boardFill(top, strips), end = along(spans.at(-1)!.hi), hull: Point[] = [];
	under.delete(0);
	for (const p of [[0, from], ...[...under].sort((a, b) => a[0] - b[0])] as Point[]) {
		const turn = () => { const [o, q] = hull.slice(-2); return (q[0] - o[0]) * (p[1] - o[1]) - (q[1] - o[1]) * (p[0] - o[0]); };
		while (hull.length > 1 && turn() <= 0) hull.pop();
		hull.push(p);
	}
	const x = Math.min(along(radius), end), k = Math.max(1, hull.findIndex(([at]) => at >= x)), [x0, y0] = hull[k - 1], [x1, y1] = hull[k] ?? hull[k - 1];
	return x1 === x0 ? y0 : y0 + (x - x0) / (x1 - x0) * (y1 - y0);
}
/** The completion about a whole motif for a circle, past the touching ring. */
export const boardWholePattern = (radius: number, strips: number) => radius > boardWholeTop(strips)
	? WHOLE_PATTERNS.find(({ strips: n, lo, hi }) => n === strips && radius >= lo - 1e-9 && radius <= hi + 1e-9)?.pattern : undefined;
/** The largest circle in the touching ring (`boardRanges`' second range) a
 * motif kept whole can take, the next line out following the circle: where
 * the ring's ends beside its gate (`gateRoom`) are as wide as paper that
 * holds printed (`PAPER_NECK_MM`), more than the room for a cut. Finer
 * boards keep the room for a cut until their completions are checked
 * against the paper. */
export function boardWholeTop(strips: number): number {
	const [, large] = boardRanges(strips), d = boardLines(strips), room = strips === 5 ? PAPER_NECK_MM / PRINT_WIDTH_MM * 100 : 1.5;
	if (!large) return 0;
	let [low, high] = large;
	if (gateRoom(high, d, true) >= room) return high;
	for (let step = 0; step < 40; step++) {
		const mid = (low + high) / 2;
		if (gateRoom(mid, d, true) >= room) low = mid;
		else high = mid;
	}
	return low;
}
/** The shortest stretch a board line keeps between the circle and an edge of
 * the paper the circle reaches, the cutting clearance; one the circle meets
 * closer to that edge ends where the circle meets it (see `boardLegs`). */
export const BOARD_STUB = 1.5;
/** The radii on the board of five strips, the frame's own (see `boardRanges`). */
export const BOARD_RADII: readonly (readonly [number, number])[] = boardRanges(5);

/** A circle on the regular board of `strips` strips, with the board's
 * junctions that lie on it as exact corners: a circle through junctions (one
 * just touching the outer ring of squares at their inner corners) then ends
 * both lines of each there, leaving no sliver beside it. A circle wider than
 * the paper is cut off by its edges. */
export function boardRing(radius: number, strips: number): Ring {
	const angle = ([x, y]: Point) => (Math.atan2(y - 50, x - 50) + 2 * Math.PI) % (2 * Math.PI);
	const points: Point[] = frameRing('circle', 2 * radius);
	for (let i = 1; i < strips; i++) for (let j = 1; j < strips; j++) {
		const junction: Point = [(100 * i) / strips, (100 * j) / strips];
		if (Math.abs(distance(junction, [50, 50]) - radius) < 1e-9) points.push(junction);
	}
	points.sort((a, b) => angle(a) - angle(b));
	if (radius <= 50) return points;
	let ring = points;
	for (const [axis, bound] of [[0, 0], [0, 100], [1, 0], [1, 100]] as const) {
		const input = ring, inside = (p: Point) => bound ? p[axis] <= bound : p[axis] >= bound;
		ring = [];
		input.forEach((p, i) => {
			const q = input[(i + 1) % input.length];
			if (inside(p)) ring.push(p);
			if (inside(p) === inside(q)) return;
			const t = (bound - p[axis]) / (q[axis] - p[axis]), cut: Point = [p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])];
			cut[axis] = bound;
			ring.push(cut);
		});
	}
	return ring.sort((a, b) => angle(a) - angle(b));
}

/** Where a board line ends on the circle, and the angle there about the centre. */
type End = { angle: number; family: 'A' | 'B'; port: Port };

/** Where the lines of a regular board of `strips` strips meet a circle around
 * its centre, for a cell grid with `count` outer gates on each side. Lines
 * that miss the circle cross the paper whole. A line the circle reaches across
 * with no other line ending on its far side follows the circle there instead
 * (the outer lines of a circle just reaching into the outer ring of squares):
 * beside each corner of that ring the circle is then left uncut, joining the
 * paper there to it rather than leaving a sliver. In each quarter of the circle
 * the other lines' ends alternate between the sheets, and consecutive pairs
 * meet at a gate: for an outer gate (side and index, as in `connectCellGrid`),
 * its point, its legs drawn by `framed` from the gate's angle and the
 * half-angle to them, which then lie exactly on the board's lines.
 *
 * Past the junctions at the outer ring's corners, the circle overlaps the
 * corner squares, and in each quarter the ends of one sheet's two lines come
 * before the other's (`overlapGates`). The same lines pair at the same red
 * squares, their legs overlapping along the corner square's arc.
 *
 * Where the paper's edges cut the circle off, a line that would meet the
 * circle past an edge, or within `BOARD_STUB` of it, ends where the circle
 * meets that edge, so the squares there come to points along the circle. */
function boardLegs(edges: Edge[], ring: Ring, strips: number, count: number, around?: number, d = boardLines(strips)):
	(side: number, index: number, framed: (angle: number, half: number) => Point, from: Point) => Point[] {
	const turn = 2 * Math.PI, lines: { axis: number; line: number; ends: End[] }[] = [];
	// A line's place among those in play, out from the centre; none for the
	// middle lines a circle covers whole, which are left out.
	const place = (line: number) => d.findIndex(dk => Math.abs(Math.abs(line - 50) - dk) < 1e-9);
	for (let k = 1; k < strips; k++) for (const axis of [0, 1]) {
		const line = (100 * k) / strips, ends: End[] = [];
		if (place(line) < 0) continue;
		const end = (point: Point, index: number) =>
			ends.push({ angle: (Math.atan2(point[1] - 50, point[0] - 50) + turn) % turn, family: axis ? 'B' : 'A', port: { point, index } });
		ring.forEach((p, i) => {
			const q = ring[(i + 1) % ring.length];
			if ((p[axis] < line) === (q[axis] < line)) return;
			// Where the paper's edge cuts the circle off, the line has nothing of
			// its own outside the circle: it ends where the circle meets that
			// edge, on its far side from the centre.
			const edge = p[1 - axis] === q[1 - axis] && (p[1 - axis] === 0 || p[1 - axis] === 100);
			if (edge) {
				if ((p[axis] - line) * (line - 50) > 0) end(p, i);
				else end(q, (i + 1) % ring.length);
				return;
			}
			const t = (line - p[axis]) / (q[axis] - p[axis]);
			const point: Point = [p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])];
			point[axis] = line;
			// One the circle meets just short of an edge it reaches ends where
			// the circle meets that edge, on its near side: the square beyond the
			// line there comes to a point along the circle, not to a stub of line.
			const bound = point[1 - axis] < 50 ? 0 : 100;
			if (Math.abs(point[1 - axis] - bound) < BOARD_STUB) {
				let meets = -1;
				ring.forEach((v, j) => {
					if (v[1 - axis] === bound && (v[axis] - line) * (50 - line) > 0
						&& (meets < 0 || Math.abs(v[axis] - line) < Math.abs(ring[meets][axis] - line))) meets = j;
				});
				if (meets >= 0) return end(ring[meets], meets);
			}
			end(point, i + t);
		});
		if (!ends.length) add(edges, axis ? [[0, line], [100, line]] : [[line, 0], [line, 100]], axis ? 'B' : 'A', 'frame');
		else lines.push({ axis, line, ends });
	}
	const all = lines.flatMap(line => line.ends), inside = (angle: number, from: number, to: number) =>
		(angle - from + turn) % turn > 1e-9 && (to - angle + turn) % turn > 1e-9 && (angle - from + turn) % turn < (to - from + turn) % turn;
	const open: End[] = [], before: (End | undefined)[] = [], after: (End | undefined)[] = [];
	for (const { axis, line, ends } of lines) {
		// The far side of the line from the centre.
		const away = axis ? (line < 50 ? 1.5 : .5) * Math.PI : line < 50 ? Math.PI : 0;
		let [a, b] = ends;
		if (ends.length === 2 && !inside(away, a.angle, b.angle)) [a, b] = [b, a];
		const between = ends.length === 2 ? all.filter(end => end !== a && end !== b && inside(end.angle, a.angle, b.angle)) : [];
		// A line beyond those the motif meets follows the circle across the
		// other sheet's ends between its own, which reach their gates along
		// it (see `overlapGates`): its arc ends each quarter's run of ends.
		if (between.length && between.every(end => end.family !== (axis ? 'B' : 'A'))
			&& place(line) >= count) {
			after[Math.floor(a.angle / (Math.PI / 2)) % 4] = a;
			before[Math.floor(b.angle / (Math.PI / 2)) % 4] = b;
			continue;
		}
		if (ends.length !== 2 || between.length) {
			open.push(...ends);
			continue;
		}
		const edge = (end: End): Point => axis ? [end.port.point[0] < 50 ? 0 : 100, line] : [line, end.port.point[1] < 50 ? 0 : 100];
		add(edges, [edge(a), ...arc(ring, a.port, b.port), edge(b)], axis ? 'B' : 'A', 'frame');
	}
	const quarters: End[][] = [[], [], [], []];
	for (const end of open) quarters[Math.floor(end.angle / (Math.PI / 2)) % 4].push(end);
	const pairs: [End, End][][] = [];
	for (const [quarter, ends] of quarters.entries()) {
		// Two lines ending at one junction on the circle pair at it, in turn.
		const family = quarter % 2 ? 'A' : 'B', first = (end: { family: 'A' | 'B' }) => Number(end.family !== family);
		ends.sort((a, b) => a.angle - b.angle > 1e-9 ? 1 : b.angle - a.angle > 1e-9 ? -1 : first(a) - first(b));
		// The j-th end of the quarter's first sheet pairs with the j-th of the
		// other, as the motif's panels meet them: each pair's gate lies between
		// its ends, clear of the neighbouring pairs' ends of the same sheet.
		const xs = ends.filter(end => end.family === family), ys = ends.filter(end => end.family !== family);
		const at = (end: End) => ends.indexOf(end), opening = before[quarter], closing = after[quarter];
		const clear = (j: number) => Math.max(xs[j].angle, j ? ys[j - 1].angle : opening?.angle ?? -Infinity)
			< Math.min(ys[j].angle, j < count - 1 ? xs[j + 1].angle : closing?.angle ?? Infinity);
		if (ends.length !== 2 * count || xs.length !== count
			|| xs.some((x, j) => at(x) > at(ys[j]) || j > 0 && j < count - 1 && at(ys[j - 1]) > at(xs[j + 1]))
			|| (opening || closing) && !xs.every((_, j) => clear(j)))
			throw new ConstructionError('topology', 'The circle does not meet the board in turn');
		pairs[quarter] = xs.map((x, j) => [x, ys[j]]);
	}
	const overlapping: ({ point: Point; low: number; high: number } | undefined)[][] = [];
	return (side, index, framed, from) => {
		const quarter = [2, 3, 0, 1][side], ends = quarters[quarter], k = side < 2 ? index : count - 1 - index;
		const [x, y] = pairs[quarter][k], following = before[quarter] || after[quarter];
		// A pair whose ends are neighbours meets at a gate midway between them.
		const neighbours = !following && ends.indexOf(y) === ends.indexOf(x) + 1;
		const gate = neighbours ? { point: framed((x.angle + y.angle) / 2, (y.angle - x.angle) / 2), low: x.angle, high: y.angle }
			: (overlapping[quarter] ??= overlapGates(edges, ring, ends, pairs[quarter], quarter, before[quarter], after[quarter]))[k]!;
		// Beside a following line, or between neighbouring ends, the gate has
		// little room: where the motif's gate faces elsewhere, the cut to it
		// runs out from the motif's gate, round midway between the motif and
		// the circle, and out to the gate, clear of the lines' ends beside it,
		// not along the circle past them.
		const facing = (Math.atan2(from[1] - 50, from[0] - 50) + turn) % turn;
		if (!following && !neighbours || around === undefined || facing > gate.low && facing < gate.high) return [gate.point];
		const reach = Math.max(around, distance(from, [50, 50])), toward = (gate.low + gate.high) / 2;
		const delta = ((toward - facing + 3 * Math.PI) % turn) - Math.PI, steps = Math.max(1, Math.ceil(Math.abs(delta) / (Math.PI / 90)));
		return [...Array.from({ length: steps + 1 }, (_, i): Point => {
			const angle = facing + delta * i / steps;
			return [50 + reach * Math.cos(angle), 50 + reach * Math.sin(angle)];
		}), gate.point];
	};
}

/** A quarter of a circle past junctions of its board, where some lines' ends
 * come between a pair's: on five strips, past the outer ring's corner
 * junction, one sheet's two ends, then the other's, the corner square between
 * them the circle's own colour, the squares beside it the other. The lines
 * pair as before the circle passed the junctions (see `boardLegs`), each such
 * pair at a gate midway along the stretch between its ends that the
 * neighbouring pairs' ends of the same sheet leave clear. Its legs reach its
 * ends along the circle, past other lines' ends; where two pairs' legs
 * overlap, across a square of the circle's own colour, both sheets are cut on
 * the same arc and the cut shows nothing. Returns those pairs' gates. */
function overlapGates(edges: Edge[], ring: Ring, ends: End[], pairs: [End, End][], quarter: number, first?: End, last?: End):
	({ point: Point; low: number; high: number } | undefined)[] {
	// A line's run out to the paper's edge, none where its end lies on it.
	const out = ({ family, port: { point } }: End): Point[] => {
		const edge: Point = family === 'A' ? [point[0], point[1] < 50 ? 0 : 100] : [point[0] < 50 ? 0 : 100, point[1]];
		return near(edge, point) ? [] : [edge];
	};
	const following = first || last;
	const gates = pairs.map(([x, y], j) => {
		if (!following && ends.indexOf(y) === ends.indexOf(x) + 1) return undefined;
		const low = Math.max(x.angle, pairs[j - 1]?.[1].angle ?? first?.angle ?? -Infinity),
			high = Math.min(y.angle, pairs[j + 1]?.[0].angle ?? last?.angle ?? Infinity), angle = (low + high) / 2;
		return { angle, low, high, port: ray(ring, [50, 50], angle) };
	});
	// Where the quarter starts and ends, the lines following the circle there
	// crossing into it.
	const bounds = following ? [quarter, quarter + 1].map(i => ({ angle: i * Math.PI / 2, port: ray(ring, [50, 50], i * Math.PI / 2) })) : [];
	// The ends and gates in turn, and the legs between them: a pair's first
	// from its first end to its gate, its second on to its second end.
	const stops = [...ends, ...first ? [first] : [], ...last ? [last] : [], ...bounds, ...gates.flatMap(gate => gate ? [gate] : [])]
		.sort((a, b) => a.angle - b.angle);
	const legs = [...pairs.flatMap(([x, y], j) => {
		const gate = gates[j];
		return gate ? [{ family: x.family, from: x.angle, to: gate.angle }, { family: y.family, from: gate.angle, to: y.angle }] : [];
	}), ...first ? [{ family: first.family, from: bounds[0].angle, to: first.angle }] : [],
		...last ? [{ family: last.family, from: last.angle, to: bounds[1].angle }] : []];
	const both = (i: number) => new Set(legs.filter(leg => leg.from <= stops[i].angle && stops[i + 1].angle <= leg.to).map(leg => leg.family)).size > 1;
	const shared = new Set<number>();
	const along = (family: 'A' | 'B', from: number, to: number, start: Point[], end: Point[]) => {
		let line = start;
		for (let i = stops.findIndex(stop => stop.angle === from); stops[i].angle < to; i++) {
			const piece = arc(ring, stops[i].port, stops[i + 1].port);
			if (!both(i)) {
				line.push(...piece);
				continue;
			}
			add(edges, line, family, 'frame');
			if (!shared.has(i)) add(edges, piece, 'AB', 'shared');
			shared.add(i);
			line = [];
		}
		add(edges, [...line, ...end], family, 'frame');
	};
	pairs.forEach(([x, y], j) => {
		const gate = gates[j];
		if (!gate) return;
		along(x.family, x.angle, gate.angle, [...out(x), x.port.point], []);
		along(y.family, gate.angle, y.angle, [], [y.port.point, ...out(y)]);
	});
	if (first) along(first.family, bounds[0].angle, first.angle, [], [first.port.point, ...out(first)]);
	if (last) along(last.family, last.angle, bounds[1].angle, [...out(last), last.port.point], []);
	return gates.map(gate => gate && { point: gate.port.point, low: gate.low, high: gate.high });
}

/** Join neighbouring motif cells with coincident cuts, and give every outer
 * cell its own connection to the paper edge or the decorative frame. On a
 * regular board of `strips` strips (`board`), the frame's legs lie on its lines. */
export function connectCellGrid(
	edges: Edge[],
	cells: Point[][][],
	boundary?: Ring,
	style: 'rays' | 'check' | 'board' = 'check',
	spread = false,
	open: OpenFrame = FITTED,
	strips = 2 * cells[0].length + 1,
	around?: number,
	lines?: number[],
	completion?: BoardPattern
) {
	const rows = cells.length,
		cols = cells[0].length;
	const fan = style === 'rays' ? 0.72 : 1,
		band = 0.3;
	if (style === 'board' && cols !== rows) throw new ConstructionError('topology', 'A regular board needs as many rows as columns');
	// Past the radii the motif in four can meet every line at, a completion
	// found for the board routes the lines instead (see `boardCompletion`).
	const completed = style === 'board' && boundary && completion
		? completionLegs(edges, boundary, strips, Math.max(...boundary.map(p => distance(p, [50, 50]))), completion, around ?? 0) : undefined;
	const legs = completed ? (side: number, index: number, _framed: unknown, from: Point) => completed(side, index, from)
		: style === 'board' && boundary ? boardLegs(edges, boundary, strips, cols, around, lines) : undefined;
	const connect = (gate: Point, side: number, index: number, count: number) => {
		if (boundary) {
			const step = Math.PI / (2 * count);
			const framed = (angle: number, half: number) => framedGate(edges, boundary, angle, half, fan, spread);
			add(
				edges,
				[gate, ...legs ? legs(side, index, framed, gate) : [framed(
					side === 0
						? Math.PI + (index + 0.5) * step
						: side === 2
							? Math.PI / 2 - (index + 0.5) * step
							: side === 3
								? Math.PI - (index + 0.5) * step
								: (3 * Math.PI) / 2 + (index + 0.5) * step,
					count === 1 ? Math.PI / 8 : step * band
				)]],
				'AB',
				'shared'
			);
		} else {
			const corner: Point = [side === 0 || side === 3 ? 0 : 100, side === 0 || side === 1 ? 0 : 100];
			add(edges, [gate, openLeg(gate, corner, 1, open.taper)], 'A', 'frame');
			add(edges, [gate, openLeg(gate, corner, 0, open.taper)], 'B', 'frame');
		}
	};
	// The completion routes its spokes knowing every outer gate.
	completed?.prepare(cells.flatMap((line, row) => line.flatMap((gates, col) => [
		...!row ? [{ side: 0, index: col, from: gates[0] }] : [], ...row === rows - 1 ? [{ side: 2, index: col, from: gates[2] }] : [],
		...!col ? [{ side: 3, index: row, from: gates[3] }] : [], ...col === cols - 1 ? [{ side: 1, index: row, from: gates[1] }] : []])));
	for (let row = 0; row < rows; row++)
		for (let col = 0; col < cols; col++) {
			const gates = cells[row][col];
			if (col) add(edges, [cells[row][col - 1][1], gates[3]], 'AB', 'shared');
			if (row) add(edges, [cells[row - 1][col][2], gates[0]], 'AB', 'shared');
			if (!row) connect(gates[0], 0, col, cols);
			if (row === rows - 1) connect(gates[2], 2, col, cols);
			if (!col) connect(gates[3], 3, row, rows);
			if (col === cols - 1) connect(gates[1], 1, row, rows);
		}
}
