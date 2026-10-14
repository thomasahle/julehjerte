import { gridClearance } from '$lib/geometry/clearance';
/** Direct contour constructions. No image fitting, search solver, or raster mask.
 * A visible outline belongs to one sheet. A connecting cut belongs to both;
 * it cancels in the woven image. Every sheet must remain a set of disjoint open
 * edge-to-edge paths. The compiler checks that combinatorial invariant before
 * the geometric clearance check and conversion into the existing editor model.
 */
import { fingerHasIntersectionIssues } from '$lib/editor/curveIssues';
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
export const FRAMES = [
	'circle',
	'diamond',
	'hexagon',
	'oval',
	'rounded',
	'scalloped'
] as const;
export type Frame = (typeof FRAMES)[number];
export type TextFrame = 'woven' | 'air' | 'repeat' | Frame;
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
	if (shape === 'oval')
		return Array.from({ length: 160 }, (_, i) => {
			const a = (i * Math.PI * 2) / 160;
			return uprightToSheet([
				size * 0.56 * Math.cos(a),
				size * 0.35 * Math.sin(a)
			]);
		});
	if (shape === 'rounded')
		return Array.from({ length: 160 }, (_, i) => {
			const a = (i * Math.PI * 2) / 160,
				r = size / 2;
			return [
				50 + r * Math.sign(Math.cos(a)) * Math.abs(Math.cos(a)) ** 0.5,
				50 + r * Math.sign(Math.sin(a)) * Math.abs(Math.sin(a)) ** 0.5
			] as Point;
		});
	if (shape === 'scalloped')
		return Array.from({ length: 192 }, (_, i) => {
			const a = (i * Math.PI * 2) / 192,
				r = (size / 2) * (0.94 + 0.06 * Math.cos(8 * a));
			return [50 + r * Math.cos(a), 50 + r * Math.sin(a)] as Point;
		});
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
		r.map((p) =>
			uprightToSheet([
				p[0] * size * scale * (shape === 'oval' ? 0.75 : 1),
				p[1] * size * scale * (shape === 'oval' ? 0.75 : 1)
			])
		)
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
 * are connected to the outer contour by coincident cuts in both sheets.
 * Detached dots/accents are two-port islands on the nearest shared spoke. */
export function generateCheckedText(
	text: string,
	font: Font,
	air = false,
	frame?: Frame
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
	// Keep the font's baseline, including accents and descenders. Narrow letters
	// get narrower cells instead of wasting the space needed by fine strokes.
	const cy =
		(Math.min(...all.map((p) => p[1])) + Math.max(...all.map((p) => p[1]))) / 2;
	const cellHeight = height * (air ? 1.5 : 1.16);
	const widths = letters.map(({ glyph }) => {
		if (!glyph.contours.length) return Math.max(glyph.advance, height * 0.35);
		const xs = glyph.contours.flat().map((p) => p[0]);
		return Math.max(...xs) - Math.min(...xs) + height * (air ? 0.5 : 0.16);
	});
	const span = widths.reduce((a, b) => a + b, 0);
	const offset = Math.max(
		...nonempty.map(({ glyph }) => {
			const ys = glyph.contours.flat().map((p) => p[1]);
			return Math.abs((Math.min(...ys) + Math.max(...ys)) / 2 - cy);
		})
	);
	const fullHeight = cellHeight + 2 * offset;
	let scale = Math.min(128 / (span + fullHeight), 38 / cellHeight);
	const boundary = frame ? frameRing(frame, 80) : null;
	// Keep letter scale stable when adding or removing a frame.
	const envelope = boundary ?? frameRing('circle', 80);
	if (envelope) {
		// Fit the complete cell envelope, including shifted accent/descender cells.
		for (const x of [-span / 2, 0, span / 2])
			for (const y of [-fullHeight / 2, fullHeight / 2]) {
				const p = uprightToSheet([x, y]),
					d = sub(p, [50, 50]);
				const hit = ray(envelope, [50, 50], Math.atan2(d[1], d[0]));
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
		if (!glyph.contours.length) continue;
		const pts = glyph.contours.flat(),
			xs = pts.map((p) => p[0]),
			ys = pts.map((p) => p[1]);
		const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
		const y = ((Math.min(...ys) + Math.max(...ys)) / 2 - cy) * scale;
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
		const contours = glyph.contours.map((r) =>
			r.map((p) =>
				uprightToSheet([x + (p[0] - cx) * scale, (p[1] - cy) * scale])
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
				gridClearance(nonempty.length + 2)
			);
			letterCuts.set(chars[i], { x, edges: local });
			edges.push(...local);
		}
		cells.push(gates);
		const [north, east, south, west] = gates;
		if (!boundary) {
			add(edges, [[north[0], 0], north], 'A', 'frame');
			add(edges, [[0, north[1]], north], 'B', 'frame');
			add(edges, [south, [south[0], 100]], 'A', 'frame');
			add(edges, [south, [100, south[1]]], 'B', 'frame');
		}
		if (previous) add(edges, [previous, west], 'AB', 'shared');
		else if (!boundary) {
			add(edges, [west, [west[0], 100]], 'A', 'frame');
			add(edges, [[0, west[1]], west], 'B', 'frame');
		}
		previous = east;
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

export function fourPortMotif(
	edges: Edge[],
	contours: Ring[],
	gates: Point[],
	angles: number[],
	margin = 1.5
) {
	const nodes = forest(contours).sort(
		(a, b) => Math.abs(area(b.ring)) - Math.abs(area(a.ring))
	);
	const base = nodes[0];
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
		for (const offset of [0, -0.28, 0.28]) {
			try {
				result.push(ray(base.ring, p, angles[j] + offset));
			} catch {
				result.push(null);
			}
		}
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
		result.push(support(base.ring, angles[j] + Math.PI));
		return result;
	});
	let fallback: Edge[] | null = null;
	let attempts = 0;
	// Choose visible attachments in cyclic order. The finite fan of rays is a
	// contour-routing rule, not an inverse image solve: no outline moves, and
	// every candidate has exactly the same visible boundary and topology.
	const combinations = Array.from({ length: 625 }, (_, n) => [
		n % 5,
		Math.floor(n / 5) % 5,
		Math.floor(n / 25) % 5,
		Math.floor(n / 125) % 5
	]).sort(
		(a, b) =>
			a.filter((x) => x !== 0).length - b.filter((x) => x !== 0).length ||
			a.reduce((x, y) => x + y, 0) - b.reduce((x, y) => x + y, 0)
	);
	const seenPorts = new Set<string>();
	for (const indices of combinations) {
		const ports = indices.map((index, j) => candidates[j][index]);
		if (!ports.every((p): p is Port => p !== null) || !cyclic(base.ring, ports))
			continue;
		const portKey = ports.map((p) => p.index.toFixed(8)).join(',');
		if (seenPorts.has(portKey)) continue;
		seenPorts.add(portKey);
		for (const interior of perforatedOutline(base, ports)) {
			const local = interior.slice();
			const extras = Array.from({ length: 4 }, () => [] as Contour[]);
			for (const node of nodes.slice(1)) {
				const c = centroid(node.ring);
				const j = gates.reduce(
					(best, p, i) =>
						distance(c, p) < distance(c, gates[best]) ? i : best,
					0
				);
				extras[j].push(node);
			}
			try {
				for (let j = 0; j < 4; j++) {
					if (extras[j].length)
						contourChain(local, extras[j], angles[j], gates[j], ports[j].point);
					else add(local, [gates[j], ports[j].point], 'AB', 'shared');
				}
				const routes = localRoutes(local, gates);
				if (!routes || !clearSharedCuts(local, contours)) continue;
				fallback ??= local;
				if (usableRoutes(routes, margin)) {
					edges.push(...local);
					return;
				}
				// Bound routing work on fine artwork. This is not an acceptance:
				// the final fitted cuts must still pass the full-sheet validator.
				if (++attempts >= 128) {
					edges.push(...fallback);
					return;
				}
			} catch (e) {
				if (!(e instanceof ConstructionError)) throw e;
			}
		}
	}
	// Fitted curves get their own full-sheet clearance check before export.
	if (fallback) {
		edges.push(...fallback);
		return;
	}
	throw new ConstructionError('topology', 'No open four-port construction');
}

/** Add two shared bridges around one external port. Flipping the intervening
 * outline arcs preserves the four external path pairings. A bridge pair on an
 * arc with no external port would instead create a closed cutting cycle.
 * Sibling holes share a chain; nested contours use the two-terminal block. */
function* perforatedOutline(node: Contour, ports: Port[]): Generator<Edge[]> {
	if (!node.children.length) {
		const edges: Edge[] = [];
		outline(edges, node.ring, ports, 'B');
		yield edges;
		return;
	}
	const ring = node.ring,
		n = ring.length;
	const at = (a: Port, b: Port, fraction: number): Port => {
		const points = arc(ring, a, b);
		const lengths = points.slice(1).map((p, i) => distance(points[i], p));
		let remaining = lengths.reduce((x, y) => x + y, 0) * fraction;
		for (let i = 0; i < lengths.length; i++) {
			if (remaining <= lengths[i] || i === lengths.length - 1) {
				const start = i === 0 ? a.index : Math.floor(a.index) + i;
				const end =
					i === lengths.length - 1
						? a.index + ((b.index - a.index + n) % n)
						: Math.floor(a.index) + i + 1;
				const t = remaining / lengths[i];
				return {
					point: mix(points[i], points[i + 1], t),
					index: (start + (end - start) * t) % n
				};
			}
			remaining -= lengths[i];
		}
		throw new ConstructionError('topology', 'Empty contour arc');
	};
	const closest = (a: Port, b: Port, point: Point): Port => {
		const points = arc(ring, a, b);
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
		return best;
	};

	const nearest = node.children.map((h) =>
		ports.reduce(
			(best, p, i) =>
				distance(centroid(h.ring), p.point) <
				distance(centroid(h.ring), ports[best].point)
					? i
					: best,
			0
		)
	);
	const partitions = [
		nearest,
		...[0, 1, 2, 3].map((j) => node.children.map(() => j))
	];
	const seenPartitions = new Set<string>();
	for (const assignment of partitions) {
		const key = assignment.join(',');
		if (seenPartitions.has(key)) continue;
		seenPartitions.add(key);
		for (const [left, right] of [
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
				for (let j = 0; j < 4; j++) {
					const children = node.children.filter((_, i) => assignment[i] === j);
					if (!children.length) continue;
					const center = centroid(children.flatMap((h) => h.ring));
					const before =
						left < 0
							? closest(ports[(j + 3) % 4], ports[j], center)
							: at(ports[(j + 3) % 4], ports[j], left);
					const after =
						right < 0
							? closest(ports[j], ports[(j + 1) % 4], center)
							: at(ports[j], ports[(j + 1) % 4], right);
					if (
						[before, after].some((p) =>
							ports.some((q) => near(p.point, q.point))
						)
					)
						throw new ConstructionError('topology', 'Coincident bridge port');
					intervals.push([before, after]);
					const d = sub(after.point, before.point);
					children.sort(
						(a, b) => dot(centroid(a.ring), d) - dot(centroid(b.ring), d)
					);
					let previous = before.point;
					for (let k = 0; k < children.length; k++) {
						const h = children[k],
							c = centroid(h.ring);
						const next =
							k + 1 < children.length
								? centroid(children[k + 1].ring)
								: after.point;
						const entry = ray(
							h.ring,
							previous,
							Math.atan2(c[1] - previous[1], c[0] - previous[0])
						);
						const exit = ray(
							h.ring,
							next,
							Math.atan2(c[1] - next[1], c[0] - next[0])
						);
						if (near(entry.point, exit.point))
							throw new ConstructionError('topology', 'Coincident hole ports');
						add(edges, [previous, entry.point], 'AB', 'shared');
						block(edges, h, entry, exit, 'A');
						previous = exit.point;
					}
					add(edges, [previous, after.point], 'AB', 'shared');
				}
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
						ports.findIndex((p, j) => contains(p, ports[(j + 1) % 4])) % 2
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

/** Trace the two noncrossing paths of each sheet, rejecting branches and loops. */
function localRoutes(edges: Edge[], gates: Point[]): Ring[] | null {
	const key = (p: Point) => p.map((x) => x.toFixed(6)).join(',');
	const routes: Ring[] = [];
	for (const [family, pairs] of [
		[
			'A',
			[
				[0, 3],
				[1, 2]
			]
		],
		[
			'B',
			[
				[0, 1],
				[2, 3]
			]
		]
	] as const) {
		const adj = new Map<string, number[]>();
		const selected = edges.flatMap((e, i) =>
			e.family.includes(family) ? [i] : []
		);
		for (const i of selected)
			for (const p of [edges[i].from, edges[i].to]) {
				const k = key(p);
				adj.set(k, [...(adj.get(k) ?? []), i]);
			}
		const gateKeys = gates.map(key),
			used = new Set<number>();
		for (const [k, ids] of adj)
			if (ids.length !== (gateKeys.includes(k) ? 1 : 2)) return null;
		for (const [start, end] of pairs) {
			let p = gates[start];
			const route = [p];
			for (;;) {
				const i = adj.get(key(p))?.find((i) => !used.has(i));
				if (i === undefined) break;
				used.add(i);
				const e = edges[i];
				p = near(p, e.from) ? e.to : e.from;
				route.push(p);
			}
			if (!near(p, gates[end])) return null;
			routes.push(route);
		}
		if (used.size !== selected.length) return null;
	}
	return routes;
}
function clearSharedCuts(edges: Edge[], contours: Ring[]): boolean {
	const shared = edges.filter((e) => e.family === 'AB');
	const crosses = (a: Point, b: Point, c: Point, d: Point) => {
		const u = sub(b, a),
			v = sub(d, c),
			det = cross(u, v);
		if (Math.abs(det) < EPS) return false;
		const t = cross(sub(c, a), v) / det,
			s = cross(sub(c, a), u) / det;
		return t > EPS && t < 1 - EPS && s >= -EPS && s <= 1 + EPS;
	};
	return shared.every(
		(e, i) =>
			contours.every((r) =>
				r.every((p, j) => !crosses(e.from, e.to, p, r[(j + 1) % r.length]))
			) &&
			shared.slice(i + 1).every((f) => !crosses(e.from, e.to, f.from, f.to))
	);
}

export function generateFourPortFigure(
	rings: Ring[],
	shape: Frame = 'circle',
	size = 70,
	scale = 0.7,
	style: 'rays' | 'check' | 'plain' = 'rays'
) {
	const artwork = rings.map((r) =>
			r.map((p) =>
				uprightToSheet([
					p[0] * size * scale * (shape === 'oval' ? 0.75 : 1),
					p[1] * size * scale * (shape === 'oval' ? 0.75 : 1)
				])
			)
		),
		edges: Edge[] = [];
	const gates = outerFrame(edges, frameRing(shape, size), [2, 3, 0, 1], style);
	fourPortMotif(
		edges,
		artwork,
		gates.map((g) => g.point),
		gates.map((g) => g.angle + Math.PI)
	);
	return { geometry: compile(edges), edges, artwork };
}

function usableRoutes(routes: Ring[], margin: number): boolean {
	// Cell ports become interior points once neighbours are connected. Extend
	// the local paths so the editor's endpoint exemption cannot hide a pinch.
	const extended = routes.map((route) => {
		const extend = (p: Point, q: Point): Point =>
			mix(q, p, 1 + 3 / Math.max(distance(p, q), 1e-6));
		return [
			extend(route[0], route[1]),
			...route,
			extend(route.at(-1)!, route.at(-2)!)
		];
	});
	const fingers: Finger[] = extended.map((route, i) => ({
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
	return !fingers.some((finger) =>
		fingerHasIntersectionIssues(finger, fingers, margin * 4)
	);
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
	fan = 1
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
		if (ring.length !== 4 || quadrant % 2) return [point, edge(point, family)];
		// A diamond has flat sheet-aligned sides. A direct projection would stack
		// several cuts at the same endpoint. Stagger their routes around its corner.
		const reflect = (p: Point): Point =>
			quadrant === 0 ? [100 - p[0], 100 - p[1]] : p;
		const p = reflect(point),
			fraction = (angle - (quadrant * Math.PI) / 2) / (Math.PI / 2);
		const topRoute = (p: Point, t: number): Ring => {
			const margin = Math.min(...ring.map((p) => p[0]));
			const lane = margin * (0.1 + 0.8 * (1 - t));
			const endX = 50 * t,
				out = margin - lane;
			return p[0] < margin + EPS && p[1] > margin + EPS
				? [p, [out, p[1]], [out, out], [endX, out], [endX, 0]]
				: [p, [p[0], out], [endX, out], [endX, 0]];
		};
		const points =
			family === 'A'
				? topRoute(p, fraction)
				: topRoute([p[1], p[0]], 1 - fraction).map(([x, y]) => [y, x] as Point);
		return points.map(reflect);
	};
	add(
		edges,
		[...route(low.point, first).reverse(), ...arc(ring, low, mid).slice(1)],
		first,
		'frame'
	);
	const other = first === 'A' ? 'B' : 'A';
	add(
		edges,
		[...arc(ring, mid, high), ...route(high.point, other).slice(1)],
		other,
		'frame'
	);
	return mid.point;
}

/** Join neighbouring motif cells with coincident cuts, and give every outer
 * cell its own connection to the paper edge or the decorative frame. */
export function connectCellGrid(
	edges: Edge[],
	cells: Point[][][],
	boundary?: Ring,
	style: 'rays' | 'check' | 'plain' = 'check'
) {
	const rows = cells.length,
		cols = cells[0].length;
	const fan = style === 'rays' ? 0.72 : 1,
		band = style === 'plain' ? 0.16 : 0.3;
	const connect = (gate: Point, side: number, index: number, count: number) => {
		if (boundary) {
			const step = Math.PI / (2 * count);
			const angle =
				side === 0
					? Math.PI + (index + 0.5) * step
					: side === 2
						? Math.PI / 2 - (index + 0.5) * step
						: side === 3
							? Math.PI - (index + 0.5) * step
							: (3 * Math.PI) / 2 + (index + 0.5) * step;
			const half =
				count === 1
					? style === 'plain'
						? Math.PI / 14
						: Math.PI / 8
					: step * band;
			add(
				edges,
				[gate, framedGate(edges, boundary, angle, half, fan)],
				'AB',
				'shared'
			);
		} else {
			add(
				edges,
				[gate, [gate[0], side === 0 || side === 1 ? 0 : 100]],
				'A',
				'frame'
			);
			add(
				edges,
				[gate, [side === 0 || side === 3 ? 0 : 100, gate[1]]],
				'B',
				'frame'
			);
		}
	};
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
