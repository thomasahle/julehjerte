import {
	convertValidatedCutGeometry,
	type CutGeometry
} from '$lib/inverse/toHeartDesign';
import type { HeartColors, HeartDesign } from '$lib/types/heart';
import { rasterizeDesign } from '$lib/paint/rasterize';
import {
	ConstructionError,
	generateFigure,
	generateCutoutFigure,
	generateCheckedText,
	inside,
	distance,
	mix,
	sub,
	dot,
	cross,
	frameRing,
	type Ring,
	type Frame,
	type Font,
	type Point,
	type Edge
} from './geometry';
export type GeneratorRequest = {
	mode: 'figure' | 'text';
	name: string;
	colors: HeartColors;
	contours?: Ring[];
	font?: Font;
	text?: string;
	frame?: Frame;
	frameSize?: number;
	scale?: number;
	style?: 'rays' | 'check' | 'plain';
	textFrame?: 'woven' | 'air';
	paperWidth?: number;
};
export type GeneratorResult = {
	design: HeartDesign;
	cutouts: number;
	recipe: 'silhouette' | 'nested' | 'counters' | 'letters';
};
function pointDistance(p: Point, a: Point, b: Point) {
	const d = sub(b, a),
		t = Math.max(
			0,
			Math.min(1, dot(sub(p, a), d) / Math.max(1e-20, dot(d, d)))
		);
	return distance(p, mix(a, b, t));
}
function linesCross(a: Point, b: Point, c: Point, d: Point) {
	const u = sub(b, a),
		v = sub(d, c),
		det = cross(u, v);
	if (Math.abs(det) < 1e-9)
		return (
			Math.min(
				pointDistance(a, c, d),
				pointDistance(b, c, d),
				pointDistance(c, a, b),
				pointDistance(d, a, b)
			) < 1e-7
		);
	const t = cross(sub(c, a), v) / det,
		s = cross(sub(c, a), u) / det;
	return t >= 0 && t <= 1 && s >= 0 && s <= 1;
}
/** Validate the actual polygon cuts, not just their graph endpoints. */
function audit(edges: Edge[], cutouts: Ring[]) {
	for (let i = 0; i < edges.length; i++)
		for (let j = i + 1; j < edges.length; j++) {
			const a = edges[i],
				b = edges[j];
			if (![...a.family].some((f) => b.family.includes(f))) continue;
			if (
				[a.from, a.to].some((p) =>
					[b.from, b.to].some((q) => distance(p, q) < 1e-7)
				)
			)
				continue;
			if (linesCross(a.from, a.to, b.from, b.to))
				throw new ConstructionError('topology', 'Cut paths intersect');
		}
	for (const ring of cutouts)
		for (let i = 0; i < ring.length; i++) {
			const a = ring[i],
				b = ring[(i + 1) % ring.length];
			for (const e of edges.filter((e) => e.family.includes('A'))) {
				if (
					linesCross(a, b, e.from, e.to) ||
					Math.min(
						pointDistance(a, e.from, e.to),
						pointDistance(b, e.from, e.to),
						pointDistance(e.from, a, b),
						pointDistance(e.to, a, b)
					) < 0.65
				)
					throw new ConstructionError(
						'clearance',
						'Letter counter leaves too little paper'
					);
			}
		}
}
function cutParity(g: CutGeometry, p: Point) {
	let value = (g.A_overlap_paths.length % 2) ^ (g.B_overlap_paths.length % 2);
	for (const [family, paths] of [
		g.A_overlap_paths,
		g.B_overlap_paths
	].entries())
		for (const path of paths) {
			const ring: Ring = [[0, 0]];
			for (const ref of path) {
				const points = g.curves[ref.curve].control_points as Ring;
				const from = ref.reverse ? points[3] : points[0],
					to = ref.reverse ? points[0] : points[3];
				if (ring.length === 1) ring.push(from);
				ring.push(to);
			}
			ring.push(family === 0 ? [0, 100] : [100, 0]);
			if (inside(p, ring)) value ^= 1;
		}
	return value;
}
function orientForeground(g: CutGeometry, artwork: Ring[]) {
	// Pick a point immediately inside an original filled boundary, then choose
	// the colour phase algebraically. No fitting or optimisation is involved.
	for (const r of artwork)
		for (let i = 0; i < r.length; i++) {
			const a = r[i],
				b = r[(i + 1) % r.length],
				m = mix(a, b, 0.5),
				d = sub(b, a),
				len = distance(a, b);
			if (len < 0.02) continue;
			const p: Point = [
				m[0] - (d[1] / len) * 0.005,
				m[1] + (d[0] / len) * 0.005
			];
			if (artwork.reduce((n, ring) => n ^ Number(inside(p, ring)), 0)) {
				g.phase = (1 ^ cutParity(g, p)) as 0 | 1;
				return;
			}
		}
	throw new ConstructionError('empty', 'No filled area');
}
function fidelity(
	design: HeartDesign,
	artwork: Ring[],
	domain: Ring[],
	edges: Edge[]
) {
	const n = 160,
		mask = rasterizeDesign(design, n).data;
	for (let y = 0; y < n; y++)
		for (let x = 0; x < n; x++) {
			const p: Point = [((x + 0.5) * 100) / n, ((y + 0.5) * 100) / n];
			if (!domain.some((r) => inside(p, r))) continue;
			const desired = artwork.reduce((a, r) => a ^ Number(inside(p, r)), 0);
			if (desired === mask[y * n + x]) continue;
			// The converter fits smooth cubics to flattened font outlines. Differences
			// are allowed only within 0.2 mm of that boundary, never within a letter,
			// hole, dot or empty area. Shared cuts have no visible boundary to excuse.
			const close = [...artwork, ...domain].some((r) =>
				r.some((a, i) => pointDistance(p, a, r[(i + 1) % r.length]) < 0.2)
			);
			const onShared = edges.some(
				(e) => e.family === 'AB' && pointDistance(p, e.from, e.to) < 1e-7
			);
			if (!close && !onShared)
				throw new ConstructionError(
					'topology',
					`Converted template does not reproduce the artwork: ${p} wanted ${desired} got ${mask[y * n + x]} phase ${design.weaveParity}`
				);
		}
}
export function generate(request: GeneratorRequest): GeneratorResult {
	const finish = (
		r: ReturnType<typeof generateFigure> & {
			rightCutouts?: Ring[];
			domain?: Ring[];
		},
		recipe: GeneratorResult['recipe']
	) => {
		const rightCutouts = r.rightCutouts ?? [];
		audit(r.edges, rightCutouts);
		orientForeground(r.geometry, r.artwork);
		const { design } = convertValidatedCutGeometry(r.geometry, {
			name: request.name,
			colors: request.colors,
			tolerance: 0.025
		});
		design.rightCutouts = rightCutouts.length ? rightCutouts : undefined;
		design.templateWidthMm = request.paperWidth ?? 100;
		const domain = r.domain ?? [
			frameRing(request.frame ?? 'circle', request.frameSize ?? 70)
		];
		fidelity(design, r.artwork, domain, r.edges);
		return { design, recipe, cutouts: rightCutouts.length };
	};
	if (request.mode === 'text') {
		if (!request.font) throw new ConstructionError('empty', 'No font');
		const r = generateCheckedText(
			request.text ?? '',
			request.font,
			request.textFrame === 'air'
		);
		return finish(r, 'letters');
	}
	const rings = request.contours ?? [],
		shape = request.frame ?? 'circle',
		size = request.frameSize ?? 70,
		scale = request.scale ?? 0.7,
		style = request.style ?? 'rays';
	try {
		return finish(
			generateFigure(rings, shape, size, scale, style),
			rings.length === 1 ? 'silhouette' : 'nested'
		);
	} catch (e) {
		if (!(e instanceof Error)) throw e;
		// Perforated/disconnected figures which do not admit the transverse chain
		// have a separate four-port construction, with explicit cut-out counters.
		// We never erase a hole or a detached component to make the checks pass.
		try {
			return finish(
				generateCutoutFigure(rings, shape, size, scale, style),
				'counters'
			);
		} catch (other) {
			throw new ConstructionError(
				e instanceof ConstructionError ? e.code : 'clearance',
				`Primary: ${e.message}; counters: ${String(other)}`
			);
		}
	}
}
