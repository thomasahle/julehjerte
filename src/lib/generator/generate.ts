import { sunburstBorder } from './sunburst';
import { generateTextGrid } from './textGrid';
import { gridPaperWidth } from './printSize';
import { generatePanelFigure } from './panels';
import {
	convertValidatedCutGeometry,
	type CutGeometry
} from '$lib/inverse/toHeartDesign';
import type { HeartColors, HeartDesign } from '$lib/types/heart';
import { rasterizeDesign } from '$lib/paint/rasterize';
import {
	ConstructionError,
	generateFigure,
	generateFourPortFigure,
	generateCheckedText,
	generateFramedText,
	inside,
	distance,
	mix,
	sub,
	dot,
	cross,
	frameRing,
	type Ring,
	type Frame,
	type TextFrame,
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
	style?: 'rays' | 'check' | 'plain' | 'sunburst';
	textFrame?: TextFrame;
	paperWidth?: number;
};
export type GeneratorResult = {
	design: HeartDesign;
	recipe: 'silhouette' | 'nested' | 'letters';
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
function audit(edges: Edge[]) {
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
}
/** A conservative precheck for the straight contour construction. Final fitting
 * moves outlines by at most 0.025 units, so a sub-0.5 gap cannot become a 1.5
 * unit strip. Ignore nearby bends of the same path: only a remote return can
 * pinch paper. Checking these lines directly avoids repeated cubic fits. */
function hasSeverePinch(g: CutGeometry, factor = 1): boolean {
	const project = (p: Point, a: Point, b: Point) => {
		const d = sub(b, a);
		return Math.max(
			0,
			Math.min(1, dot(sub(p, a), d) / Math.max(1e-20, dot(d, d)))
		);
	};
	for (const family of [g.A_overlap_paths, g.B_overlap_paths]) {
		const paths = family.map((path) => {
			let length = 0;
			return path.map((ref) => {
				const p = g.curves[ref.curve].control_points as Ring;
				const a = p[ref.reverse ? 3 : 0],
					b = p[ref.reverse ? 0 : 3];
				const segment = { a, b, start: length, length: distance(a, b) };
				length += segment.length;
				return segment;
			});
		});
		for (let i = 0; i < paths.length; i++)
			for (let j = i; j < paths.length; j++) {
				const a = paths[i],
					b = paths[j];
				for (let m = 0; m < a.length; m++)
					for (let n = i === j ? m + 2 : 0; n < b.length; n++) {
						const u = a[m],
							v = b[n];
						if (
							[0, 1].some(
								(axis) =>
									Math.max(u.a[axis], u.b[axis]) + 0.5 * factor <=
										Math.min(v.a[axis], v.b[axis]) ||
									Math.max(v.a[axis], v.b[axis]) + 0.5 * factor <=
										Math.min(u.a[axis], u.b[axis])
							)
						)
							continue;
						const pairs = [
							[0, project(u.a, v.a, v.b)],
							[1, project(u.b, v.a, v.b)],
							[project(v.a, u.a, u.b), 0],
							[project(v.b, u.a, u.b), 1]
						];
						for (const [t, s] of pairs) {
							const p = mix(u.a, u.b, t),
								q = mix(v.a, v.b, s);
							if (distance(p, q) >= 0.5 * factor) continue;
							if (i === j) {
								const along = v.start + s * v.length - u.start - t * u.length;
								if (
									along < 3 * factor ||
									[a[0].a, a.at(-1)!.b].some(
										(end) =>
											distance(p, end) < factor || distance(q, end) < factor
									)
								)
									continue;
							}
							return true;
						}
					}
			}
	}
	return false;
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
	edges: Edge[],
	background: Ring[] = []
) {
	const n = 160,
		mask = rasterizeDesign(design, n).data;
	for (let y = 0; y < n; y++)
		for (let x = 0; x < n; x++) {
			const p: Point = [((x + 0.5) * 100) / n, ((y + 0.5) * 100) / n];
			if (
				!domain.some((r) => inside(p, r)) ||
				background.some((r) => inside(p, r))
			)
				continue;
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
			domain?: Ring[];
			background?: Ring[];
		},
		recipe: GeneratorResult['recipe']
	) => {
		audit(r.edges);
		const widthMm =
			request.paperWidth ??
			gridPaperWidth(
				r.geometry.A_overlap_paths.length + 1,
				r.geometry.B_overlap_paths.length + 1
			);
		// Avoid expensive curve fitting when cuts already leave a severe sliver.
		if (request.mode !== 'text' && hasSeverePinch(r.geometry, 100 / widthMm))
			throw new ConstructionError(
				'clearance',
				'The original cuts have a severe pinch'
			);
		orientForeground(r.geometry, r.artwork);
		const { design } = convertValidatedCutGeometry(r.geometry, {
			name: request.name,
			colors: request.colors,
			tolerance: 0.025,
			paperWidthMm: widthMm
		});
		design.templateWidthMm = widthMm;
		const domain = r.domain ?? [
			frameRing(request.frame ?? 'circle', request.frameSize ?? 70)
		];
		fidelity(design, r.artwork, domain, r.edges, r.background);
		return { design, recipe };
	};
	if (request.mode === 'text') {
		if (!request.font) throw new ConstructionError('empty', 'No font');
		const frame = request.textFrame ?? 'woven';
		if ((request.text ?? '').includes('\n'))
			return finish(
				generateTextGrid(
					request.text!,
					request.font,
					frame === 'air',
					frame === 'woven' || frame === 'air' ? undefined : frame
				),
				'letters'
			);
		try {
			return finish(
				frame !== 'woven' && frame !== 'air'
					? generateFramedText(request.text ?? '', request.font, frame)
					: generateCheckedText(
							request.text ?? '',
							request.font,
							frame === 'air'
						),
				'letters'
			);
		} catch (error) {
			if (
				error instanceof ConstructionError &&
				['empty', 'character'].includes(error.code)
			)
				throw error;
			return finish(
				generateTextGrid(
					request.text ?? '',
					request.font,
					frame === 'air',
					frame === 'woven' || frame === 'air' ? undefined : frame
				),
				'letters'
			);
		}
	}
	const sunburst = request.style === 'sunburst';
	const outerSize = request.frameSize ?? 70;
	const rings = request.contours ?? [],
		shape = sunburst ? 'circle' : (request.frame ?? 'circle'),
		size = sunburst ? outerSize * 0.8 : outerSize,
		scale = request.scale ?? 0.7,
		style = sunburst
			? 'rays'
			: ((request.style as 'rays' | 'check' | 'plain') ?? 'rays');
	// Spread complex artwork over a larger grid before considering a single cell.
	// Each construction is attempted once; invalid recipes never become exports.
	const recipes =
		rings.length > 1
			? [
					() => generatePanelFigure(rings, shape, size, scale, 2, style),
					() => generatePanelFigure(rings, shape, size, scale, 2, style, 2),
					() => generateFourPortFigure(rings, shape, size, scale, style),
					() => generateFigure(rings, shape, size, scale, style)
				]
			: [
					() => generateFigure(rings, shape, size, scale, style),
					() => generateFourPortFigure(rings, shape, size, scale, style)
				];
	const errors: Error[] = [];
	for (const construct of recipes) {
		try {
			const construction = construct();
			return finish(
				sunburst ? sunburstBorder(construction, outerSize) : construction,
				rings.length === 1 ? 'silhouette' : 'nested'
			);
		} catch (e) {
			if (!(e instanceof Error)) throw e;
			errors.push(e);
		}
	}
	const last = errors.at(-1)!;
	throw new ConstructionError(
		last instanceof ConstructionError ? last.code : 'clearance',
		errors.map((e) => e.message).join('; ')
	);
}
