import { generateLayeredFigure } from './layers';
import { generateCornerChecks } from './cornerChecks';
import { generateFittedFigure } from './fitted';
import { sunburstBorder } from './sunburst';
import { generateTextGrid } from './textGrid';
import { generateRepeatedGrid, repeatedGridCache } from './repeatedGrid';
import { generateCheckeredGrid } from './checkeredGrid';
import { cutTipCounts, fewerCutTips } from './cutQuality';
import { normalizeContours } from './contours';
import { gridClearanceScale } from '$lib/geometry/clearance';
import { generatePanelFigure } from './panels';
import {
	convertValidatedCutGeometry,
	CutGeometryError,
	type CutGeometry
} from '$lib/inverse/toHeartDesign';
import type { HeartColors, HeartDesign } from '$lib/types/heart';
import { rasterizeDesign } from '$lib/paint/rasterize';
import {
	ConstructionError,
	CompilationError,
	generateFigure,
	generateFourPortFigure,
	fourPortMotif,
	originalFourPortMotif,
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
	style?: 'rays' | 'check' | 'plain' | 'sunburst' | 'fitted' | 'corners' | 'layers';
	textFrame?: TextFrame;
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
	// Repeated letters produce many distant segments. Sweep their bounding
	// boxes before the exact intersection test; validation stays identical.
	const sorted = edges.map(edge => ({
		edge, minX: Math.min(edge.from[0], edge.to[0]), maxX: Math.max(edge.from[0], edge.to[0]),
		minY: Math.min(edge.from[1], edge.to[1]), maxY: Math.max(edge.from[1], edge.to[1])
	})).sort((a, b) => a.minX - b.minX);
	for (let i = 0; i < sorted.length; i++)
		for (let j = i + 1; j < sorted.length; j++) {
			const u = sorted[i], v = sorted[j];
			if (v.minX > u.maxX + 1e-7) break;
			if (v.minY > u.maxY + 1e-7 || u.minY > v.maxY + 1e-7) continue;
			const a = u.edge, b = v.edge;
			if (a.family !== b.family && a.family !== 'AB' && b.family !== 'AB') continue;
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
	// Repeated text has many contours; only nearby letters can contain a sample.
	const bounds = artwork.map((ring) => ({
		ring,
		minX: Math.min(...ring.map((p) => p[0])),
		maxX: Math.max(...ring.map((p) => p[0])),
		minY: Math.min(...ring.map((p) => p[1])),
		maxY: Math.max(...ring.map((p) => p[1]))
	}));
	for (let y = 0; y < n; y++)
		for (let x = 0; x < n; x++) {
			const p: Point = [((x + 0.5) * 100) / n, ((y + 0.5) * 100) / n];
			if (
				!domain.some((r) => inside(p, r)) ||
				background.some((r) => inside(p, r))
			)
				continue;
			const desired = bounds.reduce(
				(a, b) => a ^ Number(
					p[0] >= b.minX && p[0] <= b.maxX &&
					p[1] >= b.minY && p[1] <= b.maxY && inside(p, b.ring)
				), 0
			);
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
	if (request.mode === 'figure') {
		const contours = normalizeContours(request.contours ?? []);
		if (!contours.length) throw new ConstructionError('empty', 'No contour');
		request = { ...request, contours };
	}
	const finish = (
		r: ReturnType<typeof generateFigure> & {
			domain?: Ring[];
			background?: Ring[];
			overlapAspectRatio?: number;
		},
		recipe: GeneratorResult['recipe']
	) => {
		audit(r.edges);
		const clearanceScale = gridClearanceScale(
			r.geometry.A_overlap_paths.length + 1,
			r.geometry.B_overlap_paths.length + 1
		);
		// Avoid expensive curve fitting when cuts already leave a severe sliver.
		if (request.mode !== 'text' && hasSeverePinch(r.geometry, clearanceScale))
			throw new ConstructionError(
				'clearance',
				'The original cuts have a severe pinch'
			);
		orientForeground(r.geometry, r.artwork);
		const { design } = convertValidatedCutGeometry(r.geometry, {
			name: request.name,
			colors: request.colors,
			tolerance: 0.025,
			clearanceScale,
			overlapAspectRatio: r.overlapAspectRatio
		});
		const domain = r.domain ?? [
			frameRing(request.frame ?? 'circle', request.frameSize ?? 70)
		];
		fidelity(design, r.artwork, domain, r.edges, r.background);
		return { design, recipe };
	};
	if (request.mode === 'text') {
		if (!request.font) throw new ConstructionError('empty', 'No font');
		const frame = request.textFrame ?? 'woven';
		if (frame === 'repeat-check') {
			const text = request.text ?? '';
			let best: GeneratorResult | undefined;
			let rawTips: [number, number] | undefined;
			let last: unknown;
			// Keep the established layout (including the detached-accent fallback),
			// then try slightly wider connections only when they improve its cuts.
			const small = [...text.normalize('NFC').replace(/\s/g, '')].length <= 2;
			for (const inset of small ? [.35, .25, .4] : [.35, .4]) {
				if (inset === .25 && best) continue;
				// This is a quality improvement for working cuts. Unsupported
				// topology should still return promptly instead of trying it twice.
				if (inset === .4 && !best) break;
				try {
					const construction = generateCheckeredGrid(text, request.font, .82, inset);
					const tips = cutTipCounts(construction.geometry);
					// Reject worse candidates before the more expensive curve fitting.
					if (rawTips && !fewerCutTips(tips, rawTips)) continue;
					const candidate = finish(construction, 'letters');
					if (!best || fewerCutTips(cutTipCounts(candidate.design), cutTipCounts(best.design))) {
						best = candidate;
						rawTips = tips;
					}
					if (best && !cutTipCounts(best.design)[1]) break;
				} catch (error) {
					if (!(error instanceof ConstructionError) && !(error instanceof CutGeometryError)) throw error;
					if (error instanceof ConstructionError && ['empty', 'character'].includes(error.code)) throw error;
					last = error;
				}
			}
			if (best) return best;
			throw last;
		}
		if (frame === 'repeat') {
			const cache = repeatedGridCache();
			try { return finish(generateRepeatedGrid(request.text ?? '', request.font, false, cache), 'letters'); }
			catch (error) {
				if (!(error instanceof ConstructionError) && !(error instanceof CutGeometryError)) throw error;
				if (error instanceof ConstructionError && ['empty', 'character'].includes(error.code)) throw error;
				// Reuse completed cells, and don't repeat a global failure when all
				// local routes already existed. Only failed cells need new cuts.
				if (!cache.failed.size) throw error;
				return finish(generateRepeatedGrid(request.text ?? '', request.font, true, cache), 'letters');
			}
		}
		const text = request.text ?? '';
		const font = request.font;
		const shape = frame === 'woven' || frame === 'air' ? undefined : frame;
		const recipes = text.includes('\n') ? [] : [
			() => generateCheckedText(text, font, frame === 'air', shape)
		];
		recipes.push(() => generateTextGrid(text, font, frame === 'air', shape));
		// Give difficult counters/shoulders more room, and separate projections
		// along flat frame sides. The requested font, frame and text are retained.
		// The air layout already has this spacing and no decorative frame.
		if (frame !== 'air')
			recipes.push(() => generateTextGrid(text, font, false, shape, {
				padding: .5,
				spread: true
			}));
		for (const [columns, slices] of [[2, 1], [1, 2], [2, 2], [1, 3]])
			recipes.push(() => generateTextGrid(text, font, frame === 'air', shape, { columns, slices, spread: true }));
		recipes.push(() => generateTextGrid(text, font, frame === 'air', shape, { spread: true, practical: true }));
		let last: unknown;
		for (const construct of recipes) {
			try { return finish(construct(), 'letters'); }
			catch (error) {
				if (!(error instanceof ConstructionError) && !(error instanceof CutGeometryError)) throw error;
				if (error instanceof ConstructionError && ['empty', 'character'].includes(error.code)) throw error;
				last = error;
			}
		}
		throw last;
	}
	if (request.style === 'layers')
		return finish(
			generateLayeredFigure(request.contours ?? [], request.frameSize, request.scale),
			'nested'
		);
	if (request.style === 'corners')
		return finish(
			generateCornerChecks(request.contours ?? [], request.frameSize, request.scale),
			'silhouette'
		);
	if (request.style === 'fitted') {
		let last: unknown;
		for (const route of [fourPortMotif, originalFourPortMotif]) {
			let constructed = false;
			try {
				const result = generateFittedFigure(request.contours ?? [], request.frameSize, request.scale, route);
				constructed = true;
				return finish(result, 'silhouette');
			}
			catch (error) {
				if (!(error instanceof ConstructionError) && !(error instanceof CutGeometryError)) throw error;
				last = error;
				if (!constructed && !(error instanceof CompilationError)) break;
			}
		}
		for (const [columns, rows] of [[2, 1], [2, 2], [3, 1], [3, 2], [3, 3], [4, 2]]) {
			try {
				return finish(generatePanelFigure(request.contours ?? [], undefined, request.frameSize ?? 70, request.scale ?? .7, columns, 'check', rows), 'silhouette');
			} catch (error) {
				if (!(error instanceof ConstructionError) && !(error instanceof CutGeometryError)) throw error;
				last = error;
			}
		}
		throw last;
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
	// Each routing variant is attempted once; invalid recipes never become exports.
	const baseFigure = () => generateFigure(rings, shape, size, scale, style);
	const recipes: ((route: typeof fourPortMotif) => ReturnType<typeof generateFigure>)[] =
		rings.length > 1
			? [
					(route) => generatePanelFigure(rings, shape, size, scale, 2, style, 1, false, route),
					(route) => generatePanelFigure(rings, shape, size, scale, 2, style, 2, false, route),
					(route) => generateFourPortFigure(rings, shape, size, scale, style, route),
					baseFigure
				]
			: [
					baseFigure,
					(route) => generateFourPortFigure(rings, shape, size, scale, style, route)
				];
	// Concave silhouettes also benefit from several cells: a snowflake or an
	// animal can have no holes and still need more than four attachment points.
	// Keep the chosen frame and the exact artwork when distributing its cuts.
	recipes.push(
		(route) => generatePanelFigure(rings, shape, size, scale, 3, style, 1, false, route),
		(route) => generatePanelFigure(rings, shape, size, scale, 3, style, 2, false, route),
		(route) => generatePanelFigure(rings, shape, size, scale, 3, style, 3, false, route),
		(route) => generatePanelFigure(rings, shape, size, scale, 2, style, 2, true, route)
	);
	for (const [columns, rows] of [[4, 1], [5, 1], [4, 2], [2, 4], [5, 2], [4, 3], [3, 4], [4, 4]])
		recipes.push((route) => generatePanelFigure(rings, shape, size, scale, columns, style, rows, true, route));
	const errors: Error[] = [];
	// A local construction failure cannot improve by disabling its extra route.
	// Retry only pieces that existed but failed joining or full-sheet validation.
	const retryOriginal = new Set<(typeof recipes)[number]>();
	for (const route of [fourPortMotif, originalFourPortMotif]) for (const construct of recipes) {
		if (route === originalFourPortMotif && (!retryOriginal.has(construct) || construct === baseFigure)) continue;
		let constructed = false;
		try {
			const construction = construct(route);
			constructed = true;
			return finish(
				sunburst ? sunburstBorder(construction, outerSize) : construction,
				rings.length === 1 ? 'silhouette' : 'nested'
			);
		} catch (e) {
			if (!(e instanceof ConstructionError) && !(e instanceof CutGeometryError)) throw e;
			if (constructed || e instanceof CompilationError) retryOriginal.add(construct);
			errors.push(e);
		}
	}
	const last = errors.at(-1)!;
	throw new ConstructionError(
		last instanceof ConstructionError ? last.code : 'clearance',
		errors.map((e) => e.message).join('; ')
	);
}
