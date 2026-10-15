import { generateLayeredFigure } from './layers';
import { generateCornerChecks } from './cornerChecks';
import { generateFittedFigure } from './fitted';
import { sunburstBorder } from './sunburst';
import { generateTextGrid } from './textGrid';
import { generateRepeatedGrid, repeatedGridCache } from './repeatedGrid';
import { generateCheckeredGrid, checkeredGridCache } from './checkeredGrid';
import { cutTipCounts, fewerCutTips } from './cutQuality';
import { normalizeContours } from './contours';
import { gridClearanceScale } from '$lib/geometry/clearance';
import { generatePanelFigure } from './panels';
import { generateComponentFigure } from './components';
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
	balancedFourPortMotif,
	bentFourPortMotif,
	touchingFourPortMotif,
	hasCounterContact,
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
			const cache = checkeredGridCache();
			let best: GeneratorResult | undefined;
			let rawTips: [number, number] | undefined;
			let crowded = false;
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
					const construction = generateCheckeredGrid(text, request.font, .82, inset, { cache, onCrowded: () => { crowded = true; } });
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
			if (crowded) for (const inset of small ? [.35, .25] : [.35]) {
				try {
					return finish(generateCheckeredGrid(text, request.font, .82, inset, { cache, balanced: true }), 'letters');
				} catch (error) {
					if (!(error instanceof ConstructionError) && !(error instanceof CutGeometryError)) throw error;
					last = error;
				}
			}
			for (const inset of small ? [.35, .25] : [.35]) {
				let repaired = false;
				try {
					const construction = generateCheckeredGrid(text, request.font, .82, inset, {
						cache, repair: true, onRepair: () => { repaired = true; }
					});
					// All local cells can be clear while their joined paths fail.
					// An unchanged construction does not need another global fit.
					if (repaired) return finish(construction, 'letters');
				} catch (error) {
					if (!(error instanceof ConstructionError) && !(error instanceof CutGeometryError)) throw error;
					last = error;
				}
			}
			throw last;
		}
		if (frame === 'repeat') {
			const cache = repeatedGridCache();
			let last: unknown;
			for (const bentSpokes of [false, true]) {
				if (bentSpokes) {
					// Keep completed cells when one local route failed. If all cells
					// existed but joining them failed, their connections need rebuilding.
					if (!cache.failed.size) cache.cells.clear();
					cache.failed.clear();
					cache.crowded.clear();
				}
				for (const practical of [false, true]) {
					if (practical && !cache.failed.size) break;
					try {
						return finish(generateRepeatedGrid(request.text ?? '', request.font, practical, cache, practical, bentSpokes), 'letters');
					} catch (error) {
						if (!(error instanceof ConstructionError) && !(error instanceof CutGeometryError)) throw error;
						if (error instanceof ConstructionError && ['empty', 'character'].includes(error.code)) throw error;
						last = error;
					}
				}
			}
			throw last;
		}
		const text = request.text ?? '';
		const font = request.font;
		const shape = frame === 'woven' || frame === 'air' ? undefined : frame;
		const recipes: Array<() => ReturnType<typeof generateTextGrid> | ReturnType<typeof generateCheckedText> | undefined> = text.includes('\n') ? [] : [
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
		let usedCompound = false;
		let crowded = false;
		recipes.push(() => generateTextGrid(text, font, frame === 'air', shape, {
			spread: true, practical: true, compound: true, onCompound: () => { usedCompound = true; }, onCrowded: () => { crowded = true; }
		}));
		// A locally improved route can still conflict with a neighbouring cell.
		// Retain the established recipe, but only rerun it if a chord changed.
		recipes.push(() => usedCompound
			? generateTextGrid(text, font, frame === 'air', shape, { spread: true, practical: true, onCrowded: () => { crowded = true; } })
			: undefined);
		recipes.push(() => crowded ? generateTextGrid(text, font, frame === 'air', shape, {
			spread: true, practical: true, compound: true, balanced: true
		}) : undefined);
		let gateCrowded = false;
		const adaptGates = (balanced = false) => {
			let moved = false;
			const result = generateTextGrid(text, font, frame === 'air', shape, {
				spread: true, practical: true, compound: true, balanced, adaptGates: true,
				onGateChange: () => { moved = true; }, onCrowded: () => { gateCrowded = true; }
			});
			// The unchanged recipe has already failed its full-sheet check.
			return moved ? result : undefined;
		};
		recipes.push(() => adaptGates(), () => gateCrowded ? adaptGates(true) : undefined);
		for (const columns of [1, 2]) recipes.push(() => {
			let moved = false;
			const result = generateTextGrid(text, font, frame === 'air', shape, {
				columns, slices: 3, spread: true, filled: true, onSeamChange: () => { moved = true; }
			});
			// The one-column layout was already tried with centred contacts.
			return columns > 1 || moved ? result : undefined;
		});
		// A deeper grid divides the ink itself, retaining the ordinary margin
		// outside it. Count the resulting strips before attempting construction.
		const lines = text.normalize('NFC').replace(/\r\n?/g, '\n').split('\n'),
			letters = Math.max(...lines.map(line => [...line].length));
		if (2 * letters + 5 * lines.length + 1 <= 20)
			recipes.push(() => generateTextGrid(text, font, frame === 'air', shape, {
				columns: 2, slices: 5, spread: true, filled: true, inkPanels: true
			}));
		// A serif can need a more square approach than a straight shared spoke.
		// Try bent connections only after the established constructions fail.
		let bentCrowded = false;
		for (const balanced of [false, true]) recipes.push(() => !balanced || bentCrowded
			? generateTextGrid(text, font, frame === 'air', shape, {
				spread: true, practical: true, compound: true, adaptGates: true,
				bentSpokes: true, balanced, onCrowded: () => { bentCrowded = true; }
			}) : undefined);
		let last: unknown;
		for (const construct of recipes) {
			try {
				const result = construct();
				if (result) return finish(result, 'letters');
			}
			catch (error) {
				if (!(error instanceof ConstructionError) && !(error instanceof CutGeometryError)) throw error;
				if (error instanceof ConstructionError && ['empty', 'character'].includes(error.code)) throw error;
				last = error;
			}
		}
		throw last;
	}
	if (request.style === 'layers') {
		const layouts = [undefined, ...[false, true].flatMap(filled =>
			[[1, 2], [2, 1], [2, 2], [3, 2]].map(([columns, rows]) => ({ columns, rows, filled })))];
		let last: unknown;
		for (const panels of layouts) {
			try {
				return finish(generateLayeredFigure(request.contours ?? [], request.frameSize, request.scale, panels), 'nested');
			} catch (error) {
				if (!(error instanceof ConstructionError) && !(error instanceof CutGeometryError)) throw error;
				last = error;
			}
		}
		throw last;
	}
	if (request.style === 'corners') {
		let last: unknown;
		for (const [routing, fitBorder, bentSpokes] of [
			['chain', false, false], ['practical', false, false], ['separated', false, false],
			['practical', true, false], ['separated', true, false],
			['practical', false, true], ['separated', false, true],
			['practical', true, true], ['separated', true, true]
		] as const) {
			try {
				const result = generateCornerChecks(request.contours ?? [], request.frameSize, request.scale, routing, fitBorder, bentSpokes);
				// Keep the established frame and skip another fit when moving
				// separate components did not change any lane or connection.
				if (routing === 'separated' && !result.separated || fitBorder && !result.borderAdjusted) continue;
				return finish(result, 'silhouette');
			} catch (error) {
				if (!(error instanceof ConstructionError) && !(error instanceof CutGeometryError)) throw error;
				last = error;
			}
		}
		throw last;
	}
	if (request.style === 'fitted') {
		for (const route of [fourPortMotif, originalFourPortMotif]) {
			let constructed = false;
			try {
				const result = generateFittedFigure(request.contours ?? [], request.frameSize, request.scale, route);
				constructed = true;
				return finish(result, 'silhouette');
			}
			catch (error) {
				if (!(error instanceof ConstructionError) && !(error instanceof CutGeometryError)) throw error;
				if (!constructed && !(error instanceof CompilationError)) break;
			}
		}
		for (const [columns, rows] of [[2, 1], [2, 2], [3, 1], [3, 2], [3, 3], [4, 2]]) {
			try {
				return finish(generatePanelFigure(request.contours ?? [], undefined, request.frameSize ?? 70, request.scale ?? .7, columns, 'check', rows), 'silhouette');
			} catch (error) {
				if (!(error instanceof ConstructionError) && !(error instanceof CutGeometryError)) throw error;
			}
		}
		return finish(generatePanelFigure(request.contours ?? [], undefined, request.frameSize ?? 70, request.scale ?? .7, 3, 'check', 1, false, fourPortMotif, 'support', true), 'silhouette');
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
	// Only failed designs reach the wider attachment pass. Bound that extra
	// work to the initial panel/four-port layouts; keep the exact chosen frame.
	const balancedRecipes = recipes.slice(0, 4).filter(recipe => recipe !== baseFigure);
	for (const route of [fourPortMotif, originalFourPortMotif, balancedFourPortMotif])
	for (const construct of route === balancedFourPortMotif ? balancedRecipes : recipes) {
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
	// A uniform seam can graze a motif's tip. Shift one modest three-panel layout
	// within its cells before refusing the figure, keeping its exact outline.
	try {
		const construction = generatePanelFigure(rings, shape, size, scale, 3, style, 1, false, fourPortMotif, 'support', true);
		return finish(sunburst ? sunburstBorder(construction, outerSize) : construction, rings.length === 1 ? 'silhouette' : 'nested');
	} catch (error) {
		if (!(error instanceof ConstructionError) && !(error instanceof CutGeometryError)) throw error;
		errors.push(error);
	}
	if (hasCounterContact(rings)) for (const construct of balancedRecipes) {
		try {
			const construction = construct(touchingFourPortMotif);
			return finish(sunburst ? sunburstBorder(construction, outerSize) : construction, 'nested');
		} catch (error) {
			if (!(error instanceof ConstructionError) && !(error instanceof CutGeometryError)) throw error;
			errors.push(error);
		}
	}
	// A seam midpoint can sit in a counter or next to a narrow arm. Both
	// neighbours instead use the same widest filled interval of that seam.
	for (const [columns, rows, spread] of [[2, 2, false], [5, 2, true]] as const) {
		try {
			const construction = generatePanelFigure(rings, shape, size, scale, columns, style, rows, spread, fourPortMotif, 'filled');
			return finish(sunburst ? sunburstBorder(construction, outerSize) : construction, rings.length === 1 ? 'silhouette' : 'nested');
		} catch (error) {
			if (!(error instanceof ConstructionError) && !(error instanceof CutGeometryError)) throw error;
			errors.push(error);
		}
	}
	// A short outward approach can avoid a narrow shoulder. Keep this last so
	// all previously successful layouts retain their established cuts.
	for (const construct of balancedRecipes) {
		try {
			const construction = construct(bentFourPortMotif);
			return finish(sunburst ? sunburstBorder(construction, outerSize) : construction, rings.length === 1 ? 'silhouette' : 'nested');
		} catch (error) {
			if (!(error instanceof ConstructionError) && !(error instanceof CutGeometryError)) throw error;
			errors.push(error);
		}
	}
	try {
		const construction = generateComponentFigure(rings, shape, size, scale, style);
		return finish(sunburst ? sunburstBorder(construction, outerSize) : construction, 'nested');
	} catch (error) {
		if (!(error instanceof ConstructionError) && !(error instanceof CutGeometryError)) throw error;
		errors.push(error);
	}
	const last = errors.at(-1)!;
	throw new ConstructionError(
		last instanceof ConstructionError ? last.code : 'clearance',
		errors.map((e) => e.message).join('; ')
	);
}
