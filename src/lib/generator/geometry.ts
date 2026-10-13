/** Direct contour constructions. No image fitting, search solver, or raster mask.
 * A visible outline belongs to one sheet. A connecting cut belongs to both;
 * it cancels in the woven image. Every sheet must remain a set of disjoint open
 * edge-to-edge paths. The compiler checks that combinatorial invariant before
 * the geometric clearance check and conversion into the existing editor model.
 */
import { findFingersWithIssues } from '$lib/editor/curveIssues';
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
export type Frame = 'circle' | 'diamond' | 'hexagon';
export class ConstructionError extends Error {
	constructor(
		public code: 'topology' | 'clearance' | 'empty' | 'character',
		message: string
	) {
		super(message);
	}
}
const EPS = 1e-7;
export const mix = (a: Point, b: Point, t: number): Point => [
	a[0] + (b[0] - a[0]) * t,
	a[1] + (b[1] - a[1]) * t
];
export const sub = (a: Point, b: Point): Point => [a[0] - b[0], a[1] - b[1]];
export const dot = (a: Point, b: Point) => a[0] * b[0] + a[1] * b[1];
export const cross = (a: Point, b: Point) => a[0] * b[1] - a[1] * b[0];
export const distance = (a: Point, b: Point) => Math.hypot(...sub(a, b));
export const near = (a: Point, b: Point) => distance(a, b) < EPS;
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
	const roots: Contour[] = [];
	for (const node of nodes) {
		const parents = nodes.filter(
			(n) =>
				n !== node &&
				Math.abs(area(n.ring)) > Math.abs(area(node.ring)) &&
				inside(node.ring[0], n.ring)
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
export function ray(r: Ring, origin: Point, angle: number): Port {
	const v = direction(angle),
		hits: (Port & { d: number })[] = [];
	r.forEach((p, i) => {
		const e = sub(r[(i + 1) % r.length], p),
			det = cross(v, e);
		if (Math.abs(det) < EPS) return;
		const q = sub(p, origin),
			d = cross(q, e) / det,
			t = cross(q, v) / det;
		if (d > EPS && t >= -EPS && t <= 1 + EPS)
			hits.push({
				point: mix(p, r[(i + 1) % r.length], Math.max(0, Math.min(1, t))),
				index: i + Math.max(0, Math.min(1, t)),
				d
			});
	});
	hits.sort((a, b) => a.d - b.d);
	if (!hits.length)
		throw new ConstructionError('topology', 'No visible contour port');
	return hits[0];
}
/** Extreme support point, using the middle of a flat supporting edge. The ray
 * leading away from it cannot cross the same contour, even on a concave motif. */
export function support(r: Ring, angle: number): Port {
	const d = direction(angle),
		values = r.map((p) => dot(p, d)),
		max = Math.max(...values);
	for (let i = 0; i < r.length; i++)
		if (max - values[i] < EPS && max - values[(i + 1) % r.length] < EPS)
			return { point: mix(r[i], r[(i + 1) % r.length], 0.5), index: i + 0.5 };
	const i = values.indexOf(max);
	return { point: r[i], index: i };
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
export const centroid = (r: Ring): Point => {
	const xs = r.map((p) => p[0]),
		ys = r.map((p) => p[1]);
	return [
		(Math.min(...xs) + Math.max(...xs)) / 2,
		(Math.min(...ys) + Math.max(...ys)) / 2
	];
};
export function contourChain(
	edges: Edge[],
	nodes: Contour[],
	angle: number,
	start: Point,
	end: Point,
	first: 'A' | 'B' = 'A'
) {
	const ordered = nodes
		.slice()
		.sort(
			(a, b) =>
				dot(centroid(a.ring), direction(angle)) -
				dot(centroid(b.ring), direction(angle))
		);
	let previous = start;
	for (const node of ordered) {
		const entry = support(node.ring, angle + Math.PI),
			exit = support(node.ring, angle);
		add(edges, [previous, entry.point], 'AB', 'shared');
		block(edges, node, entry, exit, first);
		previous = exit.point;
	}
	add(edges, [previous, end], 'AB', 'shared');
}
export function frameRing(shape: Frame, size = 70): Ring {
	const n = shape === 'circle' ? 160 : shape === 'diamond' ? 4 : 6,
		r = size / 2;
	// Diamond is square in sheet coordinates; hexagon is flat-topped upright.
	const angle =
		shape === 'diamond' ? Math.PI / 4 : shape === 'hexagon' ? -Math.PI / 4 : 0;
	const radius = shape === 'diamond' ? r * Math.SQRT2 : r;
	return Array.from(
		{ length: n },
		(_, i) =>
			[
				50 + radius * Math.cos(angle + (i * 2 * Math.PI) / n),
				50 + radius * Math.sin(angle + (i * 2 * Math.PI) / n)
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
	style: 'rays' | 'check' | 'plain'
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
				throw new ConstructionError(
					'topology',
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
				throw new ConstructionError(
					'topology',
					`${family} path ends on the wrong edge`
				);
			paths.push(path);
		}
		if (seen.size !== ids.length)
			throw new ConstructionError('topology', `Closed ${family} cutting cycle`);
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
export function generateFigure(
	rings: Ring[],
	shape: Frame = 'circle',
	size = 70,
	scale = 0.7,
	style: 'rays' | 'check' | 'plain' = 'rays'
) {
	const artwork = rings.map((r) =>
		r.map((p) => uprightToSheet([p[0] * size * scale, p[1] * size * scale]))
	);
	const nodes = forest(artwork),
		frame = frameRing(shape, size),
		edges: Edge[] = [];
	if (!nodes.length) throw new ConstructionError('empty', 'No contour');
	// A simple silhouette can meet four frame gates. Perforated or disconnected
	// artwork uses the two-gate chain, allowing alternating nested contours.
	if (nodes.length === 1 && !nodes[0].children.length && style !== 'plain') {
		const gates = outerFrame(edges, frame, [0, 1, 2, 3], style),
			r = nodes[0].ring;
		const ports = gates.map((g) => ray(r, g.point, g.angle + Math.PI));
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
 * are cut out of sheet A, explicitly carried through preview and export.
 * Detached dots/accents are two-port islands on the nearest shared spoke. */
export function generateCheckedText(text: string, font: Font, air = false) {
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
	const height =
		Math.max(...all.map((p) => p[1])) - Math.min(...all.map((p) => p[1]));
	const width = Math.max(
		...nonempty.map((l) => {
			const xs = l.glyph.contours.flat().map((p) => p[0]);
			return Math.max(...xs) - Math.min(...xs);
		})
	);
	const unit = Math.max(height, width) * (air ? 1.5 : 1.16),
		span = unit * letters.length;
	const scale = Math.min(128 / (span + unit), 27 / unit),
		cell = unit * scale;
	const edges: Edge[] = [],
		artwork: Ring[] = [],
		rightCutouts: Ring[] = [],
		domain: Ring[] = [];
	let previous: Point | null = null;
	for (let i = 0; i < letters.length; i++) {
		const { glyph } = letters[i];
		if (!glyph.contours.length) continue;
		const pts = glyph.contours.flat(),
			xs = pts.map((p) => p[0]),
			ys = pts.map((p) => p[1]);
		const cx = (Math.min(...xs) + Math.max(...xs)) / 2,
			cy = (Math.min(...ys) + Math.max(...ys)) / 2;
		const x = (i - (letters.length - 1) / 2) * cell;
		domain.push(
			[
				[-1, -1],
				[1, -1],
				[1, 1],
				[-1, 1]
			].map(([a, b]) => uprightToSheet([x + (a * cell) / 2, (b * cell) / 2]))
		);
		const contours = glyph.contours.map((r) =>
			r.map((p) =>
				uprightToSheet([x + (p[0] - cx) * scale, (p[1] - cy) * scale])
			)
		);
		artwork.push(...contours);
		const gates = [
			uprightToSheet([x, -cell / 2]),
			uprightToSheet([x + cell / 2, 0]),
			uprightToSheet([x, cell / 2]),
			uprightToSheet([x - cell / 2, 0])
		];
		const angles = [Math.PI / 2, Math.PI, -Math.PI / 2, 0].map(
			(a) => a - Math.PI / 4
		);
		rightCutouts.push(...fourPortMotif(edges, contours, gates, angles));
		const [north, east, south, west] = gates;
		add(edges, [[north[0], 0], north], 'A', 'frame');
		add(edges, [[0, north[1]], north], 'B', 'frame');
		add(edges, [south, [south[0], 100]], 'A', 'frame');
		add(edges, [south, [100, south[1]]], 'B', 'frame');
		if (previous) add(edges, [previous, west], 'AB', 'shared');
		else {
			add(edges, [west, [west[0], 100]], 'A', 'frame');
			add(edges, [[0, west[1]], west], 'B', 'frame');
		}
		previous = east;
	}
	if (!previous) throw new ConstructionError('empty', 'Empty text');
	add(edges, [[previous[0], 0], previous], 'A', 'frame');
	add(edges, [previous, [100, previous[1]]], 'B', 'frame');
	return { geometry: compile(edges), edges, artwork, rightCutouts, domain };
}

function fourPortMotif(
	edges: Edge[],
	contours: Ring[],
	gates: Point[],
	angles: number[]
) {
	const nodes = forest(contours).sort(
		(a, b) => Math.abs(area(b.ring)) - Math.abs(area(a.ring))
	);
	const base = nodes[0],
		rings = nodes.map((n) => n.ring);
	if (nodes.some((n) => n.children.some((h) => h.children.length)))
		throw new ConstructionError(
			'topology',
			'Nested islands in a letter counter'
		);
	const rightCutouts = nodes.flatMap((n) => n.children.map((h) => h.ring));
	const candidates = gates.map((p, j) => {
		const result: Array<Port | null> = [];
		for (const offset of [0, -0.28, 0.28]) {
			try {
				result.push(ray(base.ring, p, angles[j] + offset));
			} catch {
				result.push(null);
			}
		}
		result.push(support(base.ring, angles[j] + Math.PI));
		return result;
	});
	let ports: Port[] | null = null,
		cyclicFallback: Port[] | null = null;
	// Choose visible attachments in cyclic order. The finite fan of rays is a
	// contour-routing rule, not an inverse image solve: no outline moves, and
	// every candidate has exactly the same visible boundary and topology.
	const combinations = Array.from({ length: 256 }, (_, n) => [
		n % 4,
		(n >> 2) % 4,
		(n >> 4) % 4,
		(n >> 6) % 4
	]).sort(
		(a, b) =>
			a.filter((x) => x !== 0).length - b.filter((x) => x !== 0).length ||
			a.reduce((x, y) => x + y, 0) - b.reduce((x, y) => x + y, 0)
	);
	for (const indices of combinations) {
		const candidate = indices.map((index, j) => candidates[j][index]);
		if (
			candidate.every((p): p is Port => p !== null) &&
			cyclic(base.ring, candidate)
		) {
			cyclicFallback ??= candidate;
			if (usablePorts(base.ring, candidate, gates)) {
				ports = candidate;
				break;
			}
		}
	}
	// The final converter validates the fitted curves in the full sheet. A
	// conservative local polygon check may reject a rounded corner that this
	// exact, fidelity-bounded conversion can represent safely.
	ports ??= cyclicFallback;
	if (!ports)
		throw new ConstructionError(
			'topology',
			'Letter has no cyclic four-port construction'
		);
	const extras = Array.from({ length: 4 }, () => [] as Ring[]);
	for (const r of rings.slice(1)) {
		const c = centroid(r),
			s = centroid(base.ring),
			upright = [
				(c[0] - s[0] - (c[1] - s[1])) * Math.SQRT1_2,
				(c[0] - s[0] + c[1] - s[1]) * Math.SQRT1_2
			];
		const j =
			Math.abs(upright[0]) > Math.abs(upright[1])
				? upright[0] > 0
					? 1
					: 3
				: upright[1] > 0
					? 2
					: 0;
		extras[j].push(r);
	}
	for (let j = 0; j < 4; j++) {
		add(
			edges,
			arc(base.ring, ports[j], ports[(j + 1) % 4]),
			j % 2 ? 'A' : 'B',
			'outline'
		);
		let from = gates[j];
		const d = direction(angles[j]);
		extras[j].sort((a, b) => dot(centroid(a), d) - dot(centroid(b), d));
		for (const ring of extras[j]) {
			const entry = support(ring, angles[j] + Math.PI),
				exit = support(ring, angles[j]);
			add(edges, [from, entry.point], 'AB', 'shared');
			outline(edges, ring, [entry, exit], 'A');
			from = exit.point;
		}
		add(edges, [from, ports[j].point], 'AB', 'shared');
	}

	return rightCutouts;
}

export function generateCutoutFigure(
	rings: Ring[],
	shape: Frame = 'circle',
	size = 70,
	scale = 0.7,
	style: 'rays' | 'check' | 'plain' = 'rays'
) {
	const artwork = rings.map((r) =>
			r.map((p) => uprightToSheet([p[0] * size * scale, p[1] * size * scale]))
		),
		edges: Edge[] = [];
	const gates = outerFrame(edges, frameRing(shape, size), [2, 3, 0, 1], style);
	const rightCutouts = fourPortMotif(
		edges,
		artwork,
		gates.map((g) => g.point),
		gates.map((g) => g.angle + Math.PI)
	);
	return { geometry: compile(edges), edges, artwork, rightCutouts };
}

function usablePorts(ring: Ring, ports: Port[], gates: Point[]): boolean {
	const routes = [
		[gates[0], ...arc(ring, ports[3], ports[0]).slice().reverse(), gates[3]],
		[gates[1], ...arc(ring, ports[1], ports[2]), gates[2]],
		[gates[0], ...arc(ring, ports[0], ports[1]), gates[1]],
		[gates[2], ...arc(ring, ports[2], ports[3]), gates[3]]
	];
	const fingers: Finger[] = routes.map((route, i) => ({
		id: String(i),
		lobe: i < 2 ? 'right' : 'left',
		segments: route.slice(1).map((p, j) => {
			const a = route[j],
				b = mix(a, p, 1 / 3),
				c = mix(a, p, 2 / 3);
			return {
				p0: { x: a[0] * 4, y: a[1] * 4 },
				p1: { x: b[0] * 4, y: b[1] * 4 },
				p2: { x: c[0] * 4, y: c[1] * 4 },
				p3: { x: p[0] * 4, y: p[1] * 4 }
			};
		})
	}));
	return findFingersWithIssues(fingers, 6).size === 0;
}
