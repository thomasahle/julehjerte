import { createExactCurveFitter } from '$lib/inverse/curveFitCache';
import { generateLayeredFigure } from './layers';
import { generateCornerChecks, hasThreeCounterLanes } from './cornerChecks';
import { generateFittedFigure } from './fitted';
import { sunburstBorder } from './sunburst';
import { generateTextGrid } from './textGrid';
import { generateBranchedText, hasOverlappingTextBranches, fittedBranchedTextFill } from './branchedText';
import { generateRepeatedGrid, repeatedGridCache } from './repeatedGrid';
import { generateCheckeredGrid, checkeredGridCache } from './checkeredGrid';
import { generateMixedCheckeredGrid, mixedCheckeredGridCache } from './mixedCheckeredGrid';
import { cutTipCounts, fewerCutTips } from './cutQuality';
import { normalizeContours } from './contours';
import { gridClearance, gridClearanceScale } from '$lib/geometry/clearance';
import { generatePanelFigure } from './panels';
import { generateComponentFigure } from './components';
import { generateComponentLanes, hasStackedComponents } from './componentLanes';
import { rerouteSharedCuts, rerouteFrameCuts } from './sharedCuts';
import { curveSharedCuts, curveSharpSharedTips } from './curvedCuts';
import {
	convertValidatedCutGeometry,
	CutGeometryError,
	type CutGeometry
} from '$lib/inverse/toHeartDesign';
import type { HeartColors, HeartDesign } from '$lib/types/heart';
import { inferOverlapRect } from '$lib/utils/overlapRect';
import { findFingersWithIssues, intersectionMarginPx } from '$lib/editor/curveIssues';
import { rasterizeDesign } from '$lib/paint/rasterize';
import {
	forest,
	ConstructionError,
	CompilationError,
	generateFigure,
	generateFourPortFigure,
	compile,
	fourPortMotif,
	nestedFourPortMotif,
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
function hasSeverePinch(g: CutGeometry, factor = 1, fixedOnly = false): boolean {
	const uses = new Map<string, number>();
	if (fixedOnly) for (const path of [...g.A_overlap_paths, ...g.B_overlap_paths])
		for (const ref of path) uses.set(ref.curve, (uses.get(ref.curve) ?? 0) + 1);
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
				const segment = { a, b, start: length, length: distance(a, b), fixed: (uses.get(ref.curve) ?? 1) === 1 };
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
						if (fixedOnly && (!u.fixed || !v.fixed)) continue;
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
type Construction = ReturnType<typeof generateFigure> & {
	domain?: Ring[];
	background?: Ring[];
	overlapAspectRatio?: number;
};

function finishConstruction(request: GeneratorRequest, r: Construction, recipe: GeneratorResult['recipe'],
	geometry = r.geometry, curveFitter?: ReturnType<typeof createExactCurveFitter>): GeneratorResult {
	const curved = geometry !== r.geometry;
	// The polygon prechecks describe the original straight cuts. A curved retry
	// is checked on its actual cubics by the complete converter below.
	if (!curved) audit(r.edges);
	const clearanceScale = gridClearanceScale(
		r.geometry.A_overlap_paths.length + 1,
		r.geometry.B_overlap_paths.length + 1
	);
	// Avoid expensive curve fitting when cuts already leave a severe sliver.
	if (!curved && request.mode !== 'text' && hasSeverePinch(r.geometry, clearanceScale))
		throw new ConstructionError(
			'clearance',
			'The original cuts have a severe pinch'
		);
	orientForeground(geometry, r.artwork);
	const { design } = convertValidatedCutGeometry(geometry, {
		name: request.name,
		colors: request.colors,
		tolerance: 0.025,
		curveFitter,
		reuseTranslatedFits: curved || request.mode === 'text' &&
			(request.textFrame === 'repeat' || request.textFrame === 'repeat-check'),
		clearanceScale,
		overlapAspectRatio: r.overlapAspectRatio
	});
	const domain = r.domain ?? [
		frameRing(request.frame ?? 'circle', request.frameSize ?? 70)
	];
	fidelity(design, r.artwork, domain, r.edges, r.background);
	return { design, recipe };
}

/** Improve only the selected construction, once. Shared curves meet the artwork
 * across its outline rather than forming a narrow point along it. Keep the
 * original whenever bending fails full-sheet checks or does not improve the
 * actual exported cuts. Visible outlines, strip count and connections stay fixed. */
function improveSharedConnections(result: GeneratorResult): GeneratorResult {
	const design = curveSharpSharedTips(result.design);
	if (!design || !fewerCutTips(cutTipCounts(design), cutTipCounts(result.design))) return result;
	const rect = inferOverlapRect(design.fingers, design.gridSize);
	for (const finger of design.fingers) for (const segment of finger.segments)
		for (const p of [segment.p0, segment.p1, segment.p2, segment.p3])
			if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || p.x < rect.left || p.x > rect.right ||
				p.y < rect.top || p.y > rect.bottom) return result;
	const margin = intersectionMarginPx(rect, gridClearanceScale(design.gridSize.x, design.gridSize.y));
	if (findFingersWithIssues(design.fingers, margin).size) return result;
	// Endpoints, visible curves and strip connections are unchanged. Each moved
	// curve is still exactly coincident on both sheets, preserving the weave.
	return { ...result, design };
}

/** Retry completed constructions after all established recipes fail.
 * Moving coincident cuts preserves the artwork and graph endpoints; the entire
 * result must pass the same topology, spacing and fidelity checks again. */
export function generate(request: GeneratorRequest): GeneratorResult {
	const curveFitter = createExactCurveFitter();
	const counterLanes = request.mode === 'figure' && request.style === 'corners' &&
		hasThreeCounterLanes(normalizeContours(request.contours ?? []));
	if (counterLanes) {
		const result = retryCornerLanes(request, curveFitter);
		if (result) return result;
	}
	const stacked = tryStackedComponentLanes(request, curveFitter);
	if (stacked) return stacked;
	const frame = request.textFrame ?? 'woven';
	const overlappingBranches = request.mode === 'text' && request.font &&
		frame !== 'woven' && frame !== 'air' && frame !== 'repeat' && frame !== 'repeat-check' &&
		hasOverlappingTextBranches(request.text ?? '', request.font);
	if (overlappingBranches) {
		// Rectangular panels repeatedly clip these overlapping ends. Use their
		// actual branch topology first, so iteration need not exhaust that work.
		const result = retryBranchedText(request, curveFitter);
		if (result) return result;
	}
	const repetitionCache = request.mode === 'text' && request.textFrame === 'repeat' ? repeatedGridCache() : undefined;
	const rejected: { construction: Construction; recipe: GeneratorResult['recipe'] }[] = [];
	try {
		const result = generateUsingRecipes(request,
			(construction, recipe) => rejected.push({ construction, recipe }), curveFitter, repetitionCache);
		return request.mode === 'text' && request.textFrame === 'repeat-check'
			? improveSharedConnections(result) : improveTextPanelTips(request, result, curveFitter);
	} catch (error) {
		if (!(error instanceof ConstructionError) && !(error instanceof CutGeometryError)) throw error;
		const curvedCandidates = [...rejected];
		for (const { construction, recipe } of request.mode === 'figure' ? rejected : []) {
			const margin = 1.5 * gridClearanceScale(
				construction.geometry.A_overlap_paths.length + 1,
				construction.geometry.B_overlap_paths.length + 1
			);
			const edges = rerouteSharedCuts(construction.edges, margin);
			if (edges === construction.edges) continue;
			let retry: Construction | undefined;
			try {
				retry = { ...construction, edges, geometry: compile(edges) };
				return finishConstruction(request, retry, recipe, undefined, curveFitter);
			} catch (retryError) {
				if (!(retryError instanceof ConstructionError) && !(retryError instanceof CutGeometryError)) throw retryError;
				if (retry) curvedCandidates.push({ construction: retry, recipe });
			}
		}
		if (request.mode === 'figure' && request.style === 'sunburst') {
			// The outer sunburst adds two strips to each sheet. Use the final
			// five-strip clearance when rerouting the medallion, then check the
			// entire heart as usual. Earlier valid layouts return unchanged.
			let retry: Construction | undefined;
			try {
				const size = request.frameSize ?? 70;
				const construction = generateFourPortFigure(normalizeContours(request.contours ?? []),
					'circle', size * .8, request.scale ?? .7, 'rays', fourPortMotif, 2);
				retry = sunburstBorder(construction, size);
				return finishConstruction(request, retry, 'nested', undefined, curveFitter);
			} catch (retryError) {
				if (!(retryError instanceof ConstructionError) && !(retryError instanceof CutGeometryError)) throw retryError;
				if (retry) curvedCandidates.push({ construction: retry, recipe: 'nested' });
			}
		}
		// Preserve every established successful layout. Only a completed but
		// rejected construction needs a different shape for its shared cuts.
		const seen = new Set<string>();
		for (const { construction, recipe } of curvedCandidates) {
			const key = JSON.stringify(construction.geometry);
			if (seen.has(key)) continue;
			seen.add(key);
			// Shared curves cannot widen a severe gap between two unchanged
			// outline sections. Their fitting allowance is much smaller than the
			// missing clearance, even at the densest supported grid.
			const scale = gridClearanceScale(construction.geometry.A_overlap_paths.length + 1,
				construction.geometry.B_overlap_paths.length + 1);
			if (hasSeverePinch(construction.geometry, scale, true)) continue;
			const geometry = curveSharedCuts(construction.geometry);
			if (!geometry) continue;
			try {
				return finishConstruction(request, construction, recipe, geometry, curveFitter);
			} catch (retryError) {
				if (!(retryError instanceof ConstructionError) && !(retryError instanceof CutGeometryError)) throw retryError;
			}
		}
		const panels = retryPanelLayouts(request, curveFitter);
		if (panels) return improveTextPanelTips(request, panels, curveFitter);
		const fitted = retryFittedSupports(request, curveFitter);
		if (fitted) return fitted;
		if (request.mode === 'figure' && request.style === 'layers') {
			// A level seam can graze a toe or arm and leave a tiny fragment.
			// Tilt the internal partition, keeping both outer bands and the
			// motif unchanged. Validate spacing after restoring its coordinates.
			const rings = normalizeContours(request.contours ?? []);
			for (const shear of [-.2, .2]) try {
				const construction = generateLayeredFigure(rings, request.frameSize, request.scale,
					{ columns: 2, rows: 2, filled: false, adaptive: true, shear });
				return improveSharedConnections(finishConstruction(request, construction, 'nested', undefined, curveFitter));
			} catch (retryError) {
				if (!(retryError instanceof ConstructionError) && !(retryError instanceof CutGeometryError)) throw retryError;
			}
		}
		const lanes = retryComponentLanes(request, curveFitter);
		if (lanes) return lanes;
		const islands = retryFigureIslandPorts(request, curveFitter);
		if (islands) return islands;
		const contacts = retryWideComponentContacts(request, curveFitter);
		if (contacts) return contacts;
		if (request.mode === 'figure' && request.style === 'layers') try {
			// Small counters can have no open approach from uniform panels.
			// Split through their centres and attach the clipped components at
			// the shared seam. This final bounded retry leaves earlier layouts
			// and their generation time unchanged.
			const construction = generateLayeredFigure(normalizeContours(request.contours ?? []),
				request.frameSize, request.scale, { columns: 2, rows: 2, filled: true, counterSeams: true });
			return improveSharedConnections(finishConstruction(request, construction, 'nested', undefined, curveFitter));
		} catch (retryError) {
			if (!(retryError instanceof ConstructionError) && !(retryError instanceof CutGeometryError)) throw retryError;
		}
		const sunburstPanels = retrySunburstPanels(request, curveFitter);
		if (sunburstPanels) return sunburstPanels;
		const sunburstComponents = retrySunburstComponents(request, curveFitter);
		if (sunburstComponents) return sunburstComponents;
		const fittedComponents = retryFittedComponentEnvelope(request, curveFitter);
		if (fittedComponents) return fittedComponents;
		const fittedGates = retryFittedGateClearance(request, curveFitter);
		if (fittedGates) return fittedGates;
		const chainContacts = retryChainContacts(request, curveFitter);
		if (chainContacts) return chainContacts;
		const cornerLanes = counterLanes ? undefined : retryCornerLanes(request, curveFitter);
		if (cornerLanes) return cornerLanes;
		const closePanels: Construction[] = [];
		const textPanels = retryTextPanelIslands(request, curveFitter, closePanels);
		if (textPanels) return textPanels;
		const branches = overlappingBranches ? undefined : retryBranchedText(request, curveFitter);
		if (branches) return branches;
		let bestRepeated: GeneratorResult | undefined;
		const islandRoutes = [[false, false], [true, false], [true, true]].flatMap(([islandFlip, fresh]) =>
			(islandFlip ? [0] : [0, 1, 2, 3]).map(islandRank => ({ islandRank, islandFlip, fresh })));
		if (repetitionCache && request.font) for (const { islandRank, islandFlip, fresh } of islandRoutes) try {
			// Preserve every successful original phase before reversing the
			// sheet assignments of detached dots or accents in failed cells.
			if (islandFlip && !fresh && !islandRank && bestRepeated) return bestRepeated;
			// A locally usable old cell may still leave a narrow tip in a new
			// whole heart. If the mixed phases do not reach zero tips, compare
			// a fresh alternative phase before selecting the final construction.
			if (fresh && !islandRank) {
				repetitionCache.cells.clear();
				repetitionCache.failed.clear();
			}
			// Multiple concave corners can require two invisible connections.
			// Retain successful letter cells and try this only after all earlier
			// whole-heart repairs, so established designs stay unchanged.
			if (islandRank || islandFlip) {
				const missing = [...repetitionCache.failed].filter(key => !repetitionCache.cells.has(key));
				const chars = missing.length ? missing.map(key => [...key][0])
					: [...(request.text ?? '').normalize('NFC').replace(/\s/g, '')];
				// Dots and accents can use another active gate. A single contour
				// has no such choice; do not repeat its unsuccessful routing.
				if (!chars.some(char => forest(request.font!.glyphs[char]?.contours ?? []).length > 1)) break;
				if (!missing.length) repetitionCache.cells.clear();
			} else if (!repetitionCache.failed.size) repetitionCache.cells.clear();
			repetitionCache.crowded.clear();
			const construction = generateRepeatedGrid(request.text ?? '', request.font,
				true, repetitionCache, true, false, false, true, islandRank, islandFlip);
			const result = improveSharedConnections(finishConstruction(request, construction, 'letters', undefined, curveFitter));
			// Keep a reserve around these extra connections after curve fitting.
			// A barely clear neck can still be uncertain on the unfolded paper.
			const rect = inferOverlapRect(result.design.fingers, result.design.gridSize),
				margin = intersectionMarginPx(rect, gridClearanceScale(result.design.gridSize.x, result.design.gridSize.y));
			if (findFingersWithIssues(result.design.fingers, margin * 1.1).size) continue;
			if (!islandRank && !islandFlip) return result;
			const tips = cutTipCounts(result.design);
			if (!bestRepeated || fewerCutTips(tips, cutTipCounts(bestRepeated.design))) bestRepeated = result;
			if (!tips[0] && !tips[1]) return bestRepeated;
		} catch (retryError) {
			if (!(retryError instanceof ConstructionError) && !(retryError instanceof CutGeometryError)) throw retryError;
		}
		if (bestRepeated) return bestRepeated;
		const widerConnections = retryPanelReserve(request, closePanels, curveFitter);
		if (widerConnections) return widerConnections;
		const guardedPanels = retryGuardedPanels(request, curveFitter);
		if (guardedPanels) return guardedPanels;
		throw error;
	}
}

/** A single connected figure need not weave through one long central lane.
 * Divide it among the existing three lanes, preserving both checked corners
 * and cancelling the artificial seams. Usually a final fallback; three
 * separate counters across the lanes try this construction first. */
function retryCornerLanes(request: GeneratorRequest, curveFitter: ReturnType<typeof createExactCurveFitter>): GeneratorResult | undefined {
	if (request.mode !== 'figure' || request.style !== 'corners') return;
	const rings = normalizeContours(request.contours ?? []);
	if (forest(rings).length !== 1) return;
	let best: GeneratorResult | undefined;
	for (const [split, routing] of [[.25, 'separated'], [1 / 3, 'chain']] as const) {
		let construction: Construction;
		try {
			construction = generateCornerChecks(rings, request.frameSize, request.scale, routing, true, false, undefined, split);
		} catch (error) {
			if (!(error instanceof ConstructionError) && !(error instanceof CutGeometryError)) throw error;
			continue;
		}
		for (const fraction of [0, .2, .4]) try {
			const geometry = fraction ? curveSharedCuts(construction.geometry, undefined, fraction) : construction.geometry;
			if (!geometry) continue;
			const result = improveSharedConnections(finishConstruction(request, construction, 'silhouette', geometry, curveFitter));
			const margin = intersectionMarginPx(inferOverlapRect(result.design.fingers, result.design.gridSize),
				gridClearanceScale(result.design.gridSize.x, result.design.gridSize.y));
			if (findFingersWithIssues(result.design.fingers, margin * 1.1).size) continue;
			const tips = cutTipCounts(result.design);
			if (!best || fewerCutTips(tips, cutTipCounts(best.design))) best = result;
			if (!tips[1]) return best;
		} catch (error) {
			if (!(error instanceof ConstructionError) && !(error instanceof CutGeometryError)) throw error;
		}
	}
	return best;
}

/** A near contact can pinch even when both component outlines are individually
 * smooth. Join at the closest points and assign their facing arcs to different
 * sheets. Existing successful corner layouts return before this fallback. */
function retryChainContacts(request: GeneratorRequest, curveFitter: ReturnType<typeof createExactCurveFitter>): GeneratorResult | undefined {
	if (request.mode !== 'figure' || request.style !== 'corners') return;
	const rings = normalizeContours(request.contours ?? []), count = forest(rings).length;
	if (count < 2 || count > 8) return;
	let best: GeneratorResult | undefined;
	for (const tilt of [-.08, .08]) for (const invert of [false, true]) try {
		const construction = generateCornerChecks(rings, request.frameSize, request.scale,
			'chain', true, false, { tilt, invert });
		let candidate: GeneratorResult;
		try {
			candidate = finishConstruction(request, construction, 'silhouette', undefined, curveFitter);
		} catch (error) {
			if (!(error instanceof ConstructionError) && !(error instanceof CutGeometryError)) throw error;
			const geometry = curveSharedCuts(construction.geometry);
			if (!geometry) continue;
			candidate = finishConstruction(request, construction, 'silhouette', geometry, curveFitter);
		}
		const result = improveSharedConnections(candidate), design = result.design,
			margin = intersectionMarginPx(inferOverlapRect(design.fingers, design.gridSize),
				gridClearanceScale(design.gridSize.x, design.gridSize.y));
		if (findFingersWithIssues(design.fingers, margin * 1.1).size) continue;
		const tips = cutTipCounts(design);
		if (!best || fewerCutTips(tips, cutTipCounts(best.design))) best = result;
		if (!tips[1]) return best;
	} catch (error) {
		if (!(error instanceof ConstructionError) && !(error instanceof CutGeometryError)) throw error;
	}
	return best;
}

/** Stacked parts in a flat oval are poorly served by vertical cell clipping.
 * Recognize this topology before exhausting those constructions. Nearby arcs
 * use opposite sheets; counters remain open through coincident connections. */
function tryStackedComponentLanes(request: GeneratorRequest, curveFitter: ReturnType<typeof createExactCurveFitter>): GeneratorResult | undefined {
	if (request.mode !== 'figure' || request.frame !== 'oval' || request.style !== 'plain') return;
	const rings = normalizeContours(request.contours ?? []);
	if (!hasStackedComponents(rings)) return;
	let best: GeneratorResult | undefined;
	for (const aligned of [false, true]) for (const tilt of [-.08, .08]) try {
		const construction = generateComponentLanes(rings, 'oval', request.frameSize, request.scale,
			'plain', aligned, 0, { tilt });
		let candidate: GeneratorResult;
		try {
			candidate = finishConstruction(request, construction, 'nested', undefined, curveFitter);
		} catch (error) {
			if (!(error instanceof ConstructionError) && !(error instanceof CutGeometryError)) throw error;
			const geometry = curveSharedCuts(construction.geometry);
			if (!geometry) continue;
			candidate = finishConstruction(request, construction, 'nested', geometry, curveFitter);
		}
		const result = improveSharedConnections(candidate), design = result.design,
			margin = intersectionMarginPx(inferOverlapRect(design.fingers, design.gridSize),
				gridClearanceScale(design.gridSize.x, design.gridSize.y));
		if (findFingersWithIssues(design.fingers, margin * 1.1).size) continue;
		const tips = cutTipCounts(design);
		if (!best || fewerCutTips(tips, cutTipCounts(best.design))) best = result;
		if (!tips[1]) return best;
	} catch (error) {
		if (!(error instanceof ConstructionError) && !(error instanceof CutGeometryError)) throw error;
	}
	return best;
}

/** A convex-envelope gate can itself sit too close to an adjacent island.
 * Move the invisible joins outward by the actual grid clearance, without
 * adding a frame outline or moving the motif. Curved shared cuts then have
 * room to meet the silhouette normally. Earlier successful layouts stay fixed. */
function retryFittedComponentEnvelope(request: GeneratorRequest, curveFitter: ReturnType<typeof createExactCurveFitter>): GeneratorResult | undefined {
	if (request.mode !== 'figure' || request.style !== 'fitted') return;
	const rings = normalizeContours(request.contours ?? []), count = forest(rings).length;
	if (count < 2 || count > 8) return;
	let best: GeneratorResult | undefined;
	for (const padding of [2, 3]) for (const columns of [4, 3, 2] as const)
	for (const route of [fourPortMotif, balancedFourPortMotif]) {
		let construction: Construction;
		try {
			construction = generateComponentFigure(rings, 'fitted', request.frameSize, request.scale,
				'check', route, columns, 0, true, true, padding);
		} catch (error) {
			if (!(error instanceof ConstructionError) && !(error instanceof CutGeometryError)) throw error;
			continue;
		}
		for (const handleFraction of [.1, .2]) try {
			const geometry = curveSharedCuts(construction.geometry, undefined, handleFraction);
			if (!geometry) continue;
			const result = improveSharedConnections(finishConstruction(request, construction, 'silhouette', geometry, curveFitter));
			const margin = intersectionMarginPx(inferOverlapRect(result.design.fingers, result.design.gridSize),
				gridClearanceScale(result.design.gridSize.x, result.design.gridSize.y));
			if (findFingersWithIssues(result.design.fingers, margin * 1.1).size) continue;
			const tips = cutTipCounts(result.design);
			if (!best || fewerCutTips(tips, cutTipCounts(best.design))) best = result;
			if (!tips[0] && !tips[1]) return best;
		} catch (error) {
			if (!(error instanceof ConstructionError) && !(error instanceof CutGeometryError)) throw error;
		}
	}
	return best;
}

/** A gate directly on the main outline can force a connection to a detached
 * part to double back to the same point. Start just outside the silhouette so
 * its invisible approach can reach a different outline point. Keep five strips
 * on each sheet, and retain all earlier successful layouts. */
function retryFittedGateClearance(request: GeneratorRequest, curveFitter: ReturnType<typeof createExactCurveFitter>): GeneratorResult | undefined {
	if (request.mode !== 'figure' || request.style !== 'fitted') return;
	const rings = normalizeContours(request.contours ?? []), count = forest(rings).length;
	if (count < 2 || count > 8) return;
	let best: GeneratorResult | undefined;
	for (const padding of [2, 3]) try {
		const construction = generateFittedFigure(rings, request.frameSize, request.scale,
			fourPortMotif, undefined, padding);
		const result = improveSharedConnections(finishConstruction(request, construction, 'silhouette', undefined, curveFitter));
		const margin = intersectionMarginPx(inferOverlapRect(result.design.fingers, result.design.gridSize),
			gridClearanceScale(result.design.gridSize.x, result.design.gridSize.y));
		if (findFingersWithIssues(result.design.fingers, margin * 1.1).size) continue;
		const tips = cutTipCounts(result.design);
		if (!best || fewerCutTips(tips, cutTipCounts(best.design))) best = result;
		if (!tips[1]) return best;
	} catch (error) {
		if (!(error instanceof ConstructionError) && !(error instanceof CutGeometryError)) throw error;
	}
	return best;
}

/** Wide component grids can send a frame lead through the outer circle. Route
 * those leads around their own sheet's border while retaining both circular
 * outlines, the motif and every paper-edge endpoint. */
function retrySunburstComponents(request: GeneratorRequest, curveFitter: ReturnType<typeof createExactCurveFitter>): GeneratorResult | undefined {
	if (request.mode !== 'figure' || request.style !== 'sunburst') return;
	const rings = normalizeContours(request.contours ?? []), count = forest(rings).length;
	if (count < 2 || count > 8) return;
	const size = request.frameSize ?? 70;
	let best: GeneratorResult | undefined;
	for (const columns of [4, 3, 2] as const) for (const route of [fourPortMotif, balancedFourPortMotif]) try {
		const inner = generateComponentFigure(rings, 'circle', size * .8, request.scale ?? .7,
			'check', route, columns, 2, true, false), outer = sunburstBorder(inner, size);
		const margin = gridClearance(outer.geometry.A_overlap_paths.length + 1,
			outer.geometry.B_overlap_paths.length + 1);
		const leads = inner.edges.filter(e => e.kind === 'frame' &&
			[e.from, e.to].some(p => p.some(v => v === 0 || v === 100)));
		const edges = rerouteFrameCuts(outer.edges, margin * 1.2, leads);
		const construction = { ...outer, edges, geometry: compile(edges) };
		const result = improveSharedConnections(finishConstruction(request, construction, 'nested', undefined, curveFitter));
		const actualMargin = intersectionMarginPx(inferOverlapRect(result.design.fingers, result.design.gridSize),
			gridClearanceScale(result.design.gridSize.x, result.design.gridSize.y));
		if (findFingersWithIssues(result.design.fingers, actualMargin * 1.1).size) continue;
		const tips = cutTipCounts(result.design);
		if (!best || fewerCutTips(tips, cutTipCounts(best.design))) best = result;
		if (!tips[0] && !tips[1]) return best;
	} catch (error) {
		if (!(error instanceof ConstructionError) && !(error instanceof CutGeometryError)) throw error;
	}
	return best;
}

/** Slanted panel projections can graze the outer sunburst's diagonal corners.
 * Axial projections clear those corners while retaining both circles and the
 * motif. Keep this after existing layouts so working designs stay unchanged. */
function retrySunburstPanels(request: GeneratorRequest, curveFitter: ReturnType<typeof createExactCurveFitter>): GeneratorResult | undefined {
	if (request.mode !== 'figure' || request.style !== 'sunburst') return;
	const rings = normalizeContours(request.contours ?? []), size = request.frameSize ?? 70;
	let best: GeneratorResult | undefined;
	for (const [columns, rows] of [[2, 1], [1, 2]]) try {
		const route: typeof fourPortMotif = (...args) => {
			// The outer band adds two actual strips to each panel grid.
			args[4] = gridClearance(columns + rows + 3);
			return fourPortMotif(...args);
		};
		// 'check' selects axial frame projections; sunburstBorder supplies
		// the same outer circular rays, without changing either circle.
		const inner = generatePanelFigure(rings, 'circle', size * .8, request.scale ?? .7,
			columns, 'check', rows, false, route, 'components');
		const result = improveSharedConnections(finishConstruction(request, sunburstBorder(inner, size),
			'nested', undefined, curveFitter)), design = result.design;
		const margin = intersectionMarginPx(inferOverlapRect(design.fingers, design.gridSize),
			gridClearanceScale(design.gridSize.x, design.gridSize.y));
		if (findFingersWithIssues(design.fingers, margin * 1.1).size) continue;
		const tips = cutTipCounts(design);
		if (!best || fewerCutTips(tips, cutTipCounts(best.design))) best = result;
		if (!tips[1]) return best;
	} catch (error) {
		if (!(error instanceof ConstructionError) && !(error instanceof CutGeometryError)) throw error;
	}
	return best;
}

/** Clipping an accent or serif can leave a separate piece owning a panel gate.
 * Follow that piece from its actual seam, with the panel's alternating phase.
 * A smaller inter-letter gap also leaves more room for the unchanged strokes.
 * Earlier successful layouts return before these bounded alternatives. */
function retryTextPanelIslands(request: GeneratorRequest, curveFitter: ReturnType<typeof createExactCurveFitter>, closePanels: Construction[]): GeneratorResult | undefined {
	const frame = request.textFrame ?? 'woven', text = request.text ?? '', font = request.font;
	if (request.mode !== 'text' || !font || !text.trim() || frame === 'repeat' || frame === 'repeat-check') return;
	const lines = text.normalize('NFC').replace(/\r\n?/g, '\n').split('\n'),
		letters = Math.max(...lines.map(line => [...line].length)),
		shape = frame === 'woven' || frame === 'air' ? undefined : frame;
	for (const frameFill of shape ? [.88, .94] : [.88]) {
		let best: GeneratorResult | undefined;
		for (const padding of [.16, .12]) for (const [columns, slices] of [[1, 2], [2, 1]]) {
			if (columns * letters + slices * lines.length + 1 > 20) continue;
			try {
				const construction = generateTextGrid(text, font, frame === 'air', shape, {
					padding, frameFill, columns, slices, spread: true, filled: true, adaptivePanels: true,
					guardSeams: true, practical: true, compound: true, boundaryIslands: true
				});
				let candidate: GeneratorResult;
				try {
					candidate = finishConstruction(request, construction, 'letters', undefined, curveFitter);
				} catch (error) {
					if (!(error instanceof ConstructionError) && !(error instanceof CutGeometryError)) throw error;
					const geometry = curveSharedCuts(construction.geometry);
					if (!geometry) continue;
					candidate = finishConstruction(request, construction, 'letters', geometry, curveFitter);
				}
				const result = improveSharedConnections(candidate), design = result.design;
				const margin = intersectionMarginPx(inferOverlapRect(design.fingers, design.gridSize),
					gridClearanceScale(design.gridSize.x, design.gridSize.y));
				if (findFingersWithIssues(design.fingers, margin * 1.1).size) {
					closePanels.push(construction);
					continue;
				}
				const tips = cutTipCounts(design);
				if (!best || fewerCutTips(tips, cutTipCounts(best.design))) best = result;
				if (!tips[1]) return best;
			} catch (error) {
				if (!(error instanceof ConstructionError) && !(error instanceof CutGeometryError)) throw error;
			}
		}
		// Keep the established fit when any of its layouts works. Only a
		// refused frame gets slightly larger letters inside the same boundary;
		// validate its outside connections with the same clearance reserve.
		if (best) return best;
	}
}

/** A layout can pass nominal spacing while missing its clearance reserve.
 * Curved approaches are useful here too, even though conversion did not throw.
 * Keep these completed panels until every established layout has failed, then
 * widen only their coincident connections. Earlier successes stay unchanged. */
function retryPanelReserve(request: GeneratorRequest, candidates: Construction[], curveFitter: ReturnType<typeof createExactCurveFitter>): GeneratorResult | undefined {
	const seen = new Set<string>();
	let best: GeneratorResult | undefined;
	for (const construction of candidates) {
		const key = JSON.stringify(construction.geometry);
		if (seen.has(key)) continue;
		seen.add(key);
		for (const fraction of [.2, .4]) try {
			const geometry = curveSharedCuts(construction.geometry, undefined, fraction);
			if (!geometry) continue;
			const result = improveSharedConnections(finishConstruction(request, construction, 'letters', geometry, curveFitter)),
				design = result.design, margin = intersectionMarginPx(inferOverlapRect(design.fingers, design.gridSize),
					gridClearanceScale(design.gridSize.x, design.gridSize.y));
			if (findFingersWithIssues(design.fingers, margin * 1.1).size) continue;
			const tips = cutTipCounts(design);
			if (!best || fewerCutTips(tips, cutTipCounts(best.design))) best = result;
			if (!tips[1]) return best;
		} catch (error) {
			if (!(error instanceof ConstructionError) && !(error instanceof CutGeometryError)) throw error;
		}
	}
	return best;
}

/** After the established layouts fail, move blocked attachments away from
 * clipped seams along the original outline. Keep the seam gates themselves
 * fixed and validate the complete joined sheets, including a spacing reserve. */
function retryGuardedPanels(request: GeneratorRequest, curveFitter: ReturnType<typeof createExactCurveFitter>): GeneratorResult | undefined {
	const frame = request.textFrame ?? 'woven', text = request.text ?? '', font = request.font;
	if (request.mode !== 'text' || !font || !text.trim() || frame === 'repeat' || frame === 'repeat-check') return;
	const lines = text.normalize('NFC').replace(/\r\n?/g, '\n').split('\n'),
		letters = Math.max(...lines.map(line => [...line].length)),
		shape = frame === 'woven' || frame === 'air' ? undefined : frame;
	let best: GeneratorResult | undefined;
	for (const frameFill of shape ? [.88, .94] : [.88])
		for (const padding of [.16, .12]) for (const [columns, slices] of [[1, 2], [2, 1]]) {
			if (columns * letters + slices * lines.length + 1 > 20) continue;
			let construction: Construction;
			try {
				construction = generateTextGrid(text, font, frame === 'air', shape, {
					padding, frameFill, columns, slices, spread: true, filled: true, adaptivePanels: true,
					guardSeams: true, practical: true, compound: true, boundaryIslands: true,
					contourApproaches: true, guardedAttachments: true
				});
			} catch (error) {
				if (!(error instanceof ConstructionError) && !(error instanceof CutGeometryError)) throw error;
				continue;
			}
			for (const fraction of [0, .2, .4]) try {
				const geometry = fraction ? curveSharedCuts(construction.geometry, undefined, fraction) : construction.geometry;
				if (!geometry) continue;
				const result = improveSharedConnections(finishConstruction(request, construction, 'letters', geometry, curveFitter)),
					design = result.design, margin = intersectionMarginPx(inferOverlapRect(design.fingers, design.gridSize),
						gridClearanceScale(design.gridSize.x, design.gridSize.y));
				if (findFingersWithIssues(design.fingers, margin * 1.1).size) continue;
				const tips = cutTipCounts(design);
				if (!best || fewerCutTips(tips, cutTipCounts(best.design))) best = result;
				if (!tips[1]) return best;
			} catch (error) {
				if (!(error instanceof ConstructionError) && !(error instanceof CutGeometryError)) throw error;
			}
		}
	return best;
}

/** Overlapping serif ends need independent branches rather than tighter clips.
 * Other topology uses these bounded alternatives only as a final fallback. */
function retryBranchedText(request: GeneratorRequest, curveFitter: ReturnType<typeof createExactCurveFitter>): GeneratorResult | undefined {
	const frame = request.textFrame ?? 'woven', text = request.text ?? '', font = request.font;
	if (request.mode !== 'text' || !font || !text.trim() || /\s/.test(text) ||
		frame === 'woven' || frame === 'air' || frame === 'repeat' || frame === 'repeat-check') return;
	let best: GeneratorResult | undefined;
	for (const splitFraction of [.55, .48, .62]) for (const practical of [false, true]) try {
		const construction = generateBranchedText(text, font, frame, splitFraction, practical);
		let candidate: GeneratorResult;
		try {
			candidate = finishConstruction(request, construction, 'letters', undefined, curveFitter);
		} catch (error) {
			if (!(error instanceof ConstructionError) && !(error instanceof CutGeometryError)) throw error;
			const geometry = curveSharedCuts(construction.geometry);
			if (!geometry) continue;
			candidate = finishConstruction(request, construction, 'letters', geometry, curveFitter);
		}
		const result = improveSharedConnections(candidate), design = result.design,
			margin = intersectionMarginPx(inferOverlapRect(design.fingers, design.gridSize),
				gridClearanceScale(design.gridSize.x, design.gridSize.y));
		if (findFingersWithIssues(design.fingers, margin * 1.1).size) continue;
		const tips = cutTipCounts(design);
		if (!best || fewerCutTips(tips, cutTipCounts(best.design))) best = result;
		if (!tips[1]) return best;
	} catch (error) {
		if (!(error instanceof ConstructionError) && !(error instanceof CutGeometryError)) throw error;
	}
	if (best || !hasOverlappingTextBranches(text, font)) return best;
	// A neighbouring V-shaped stroke needs aligned columns and higher row
	// junctions. Retain the separate serif branches, give the unchanged letters
	// more of the frame, and require room around the complete joined cuts.
	for (const mode of ['aligned', 'guarded', 'fitted'] as const) {
		const guardedJunctions = mode !== 'aligned',
			fittedFill = mode === 'fitted' ? fittedBranchedTextFill(text, font, frame) : undefined,
			fills = mode === 'fitted' ? fittedFill === undefined ? [] : [fittedFill] : [.9, .84];
		// A narrowing fork needs its last horizontal junction higher up. Its
		// vertical divider follows the common air gap instead of shaving a
		// serif, and extra attachments keep clear of the stitched boundaries.
		const profiles = guardedJunctions ? [[.2, .35], [.15, .3]] as const : [[.2, .4], [.25, .45]] as const;
		for (const frameFill of fills) for (const rows of profiles) {
			let construction: Construction;
			try {
				construction = generateBranchedText(text, font, frame, .55, true, rows, frameFill, guardedJunctions);
			} catch (error) {
				if (!(error instanceof ConstructionError) && !(error instanceof CutGeometryError)) throw error;
				continue;
			}
			for (const fraction of [0, .2, .4]) try {
				const geometry = fraction ? curveSharedCuts(construction.geometry, undefined, fraction) : construction.geometry;
				if (!geometry) continue;
				const result = improveSharedConnections(finishConstruction(request, construction, 'letters', geometry, curveFitter)),
					design = result.design, margin = intersectionMarginPx(inferOverlapRect(design.fingers, design.gridSize),
						gridClearanceScale(design.gridSize.x, design.gridSize.y));
				if (findFingersWithIssues(design.fingers, margin * 1.1).size) continue;
				const tips = cutTipCounts(design);
				if (!best || fewerCutTips(tips, cutTipCounts(best.design))) best = result;
				if (!tips[1]) return best;
			} catch (error) {
				if (!(error instanceof ConstructionError) && !(error instanceof CutGeometryError)) throw error;
			}
		}
		if (best) return best;
	}
	return best;
}

/** Separate islands need room around their shared gate, not just the shortest
 * distance between their outlines. Preserve existing designs and try wider
 * contacts only after their established constructions have failed. */
function retryWideComponentContacts(request: GeneratorRequest, curveFitter: ReturnType<typeof createExactCurveFitter>): GeneratorResult | undefined {
	if (request.mode !== 'figure' || request.style === 'corners' || request.style === 'layers') return;
	const rings = normalizeContours(request.contours ?? []), count = forest(rings).length;
	if (count < 2 || count > 8) return;
	const size = request.frameSize ?? 70, scale = request.scale ?? .7,
		sunburst = request.style === 'sunburst',
		frame = request.style === 'fitted' ? 'fitted' : sunburst ? 'circle' : (request.frame ?? 'circle'),
		style = request.style === 'fitted' ? 'check' : request.style === 'sunburst' ? 'rays' : (request.style ?? 'rays');
	let best: GeneratorResult | undefined;
	for (const columns of [4, 3, 2] as const) for (const route of [fourPortMotif, balancedFourPortMotif]) try {
		const inner = generateComponentFigure(rings, frame, sunburst ? size * .8 : size,
			scale, style, route, columns, sunburst ? 2 : 0, true);
		const construction = sunburst ? sunburstBorder(inner, size) : inner;
		const result = improveSharedConnections(finishConstruction(request, construction,
			frame === 'fitted' ? 'silhouette' : 'nested', undefined, curveFitter));
		const margin = intersectionMarginPx(inferOverlapRect(result.design.fingers, result.design.gridSize),
			gridClearanceScale(result.design.gridSize.x, result.design.gridSize.y));
		if (findFingersWithIssues(result.design.fingers, margin * 1.1).size) continue;
		const tips = cutTipCounts(result.design);
		if (!best || fewerCutTips(tips, cutTipCounts(best.design))) best = result;
		if (!tips[0] && !tips[1]) return best;
	} catch (error) {
		if (!(error instanceof ConstructionError) && !(error instanceof CutGeometryError)) throw error;
	}
	return best;
}

/** A disconnected part need not use its nearest gate. Another attachment can
 * keep its approach clear of the main silhouette, retaining the same frame. */
function retryFigureIslandPorts(request: GeneratorRequest, curveFitter: ReturnType<typeof createExactCurveFitter>): GeneratorResult | undefined {
	if (request.mode !== 'figure' || request.style === 'corners' || request.style === 'layers') return;
	const rings = normalizeContours(request.contours ?? []);
	if (forest(rings).length < 2) return;
	const size = request.frameSize ?? 70, scale = request.scale ?? .7,
		style = request.style ?? 'rays', sunburst = style === 'sunburst';
	let best: GeneratorResult | undefined;
	for (const islandRank of [1, 2, 3]) for (const practical of [false, true]) try {
		const route: typeof fourPortMotif = (...args) => {
			args[7] = { ...args[7], islandRank, practical };
			return fourPortMotif(...args);
		};
		const inner = style === 'fitted' ? generateFittedFigure(rings, size, scale, route)
			: generateFourPortFigure(rings, sunburst ? 'circle' : request.frame,
				sunburst ? size * .8 : size, scale, sunburst ? 'rays' : style, route, sunburst ? 2 : 0);
		const construction = sunburst ? sunburstBorder(inner, size) : inner;
		const result = improveSharedConnections(finishConstruction(request, construction,
			style === 'fitted' ? 'silhouette' : 'nested', undefined, curveFitter));
		const rect = inferOverlapRect(result.design.fingers, result.design.gridSize),
			margin = intersectionMarginPx(rect, gridClearanceScale(result.design.gridSize.x, result.design.gridSize.y));
		if (findFingersWithIssues(result.design.fingers, margin * 1.1).size) continue;
		const tips = cutTipCounts(result.design);
		if (!best || fewerCutTips(tips, cutTipCounts(best.design))) best = result;
		if (!tips[0] && !tips[1]) return best;
	} catch (error) {
		if (!(error instanceof ConstructionError) && !(error instanceof CutGeometryError)) throw error;
	}
	return best;
}

/** A fixed diagonal can land on a narrow shoulder or give two components the
 * same attachment. Try nearby support directions on the unchanged silhouette;
 * keep the valid construction with the fewest sharp paper tips. */
function retryFittedSupports(request: GeneratorRequest, curveFitter: ReturnType<typeof createExactCurveFitter>): GeneratorResult | undefined {
	if (request.mode !== 'figure' || request.style !== 'fitted') return;
	const rings = normalizeContours(request.contours ?? []), seen = new Set<string>();
	let best: GeneratorResult | undefined;
	for (const offset of [.15, -.15, .3, -.3])
	for (const signs of [[1, 1, 1, 1], [1, -1, 1, -1], [1, -1, -1, 1], [1, 1, -1, -1]]) try {
		const angles = signs.map(sign => sign * offset) as [number, number, number, number];
		const construction = generateFittedFigure(rings, request.frameSize, request.scale, fourPortMotif, angles);
		// Several directions may select the same vertices and complete cuts.
		const key = JSON.stringify(construction.geometry);
		if (seen.has(key)) continue;
		seen.add(key);
		const result = improveSharedConnections(finishConstruction(request, construction, 'silhouette', undefined, curveFitter));
		const tips = cutTipCounts(result.design);
		if (!best || fewerCutTips(tips, cutTipCounts(best.design))) best = result;
		if (tips[0] === 0 && tips[1] === 0) return best;
	} catch (error) {
		if (!(error instanceof ConstructionError) && !(error instanceof CutGeometryError)) throw error;
	}
	if (best) return best;
	// Divide a deeply concave silhouette into two rows. Adjust only its outer
	// contacts: both neighbours still agree on the original internal seam.
	for (const offset of [.15, -.15]) try {
		const construction = generatePanelFigure(rings, undefined, request.frameSize ?? 70,
			request.scale ?? .7, 1, 'check', 2, false, fourPortMotif, 'support', false, 0,
			[offset, offset, offset, offset]);
		const result = improveSharedConnections(finishConstruction(request, construction, 'silhouette', undefined, curveFitter));
		if (!best || fewerCutTips(cutTipCounts(result.design), cutTipCounts(best.design))) best = result;
	} catch (error) {
		if (!(error instanceof ConstructionError) && !(error instanceof CutGeometryError)) throw error;
	}
	return best;
}

/** Keep islands in parallel lanes when a rectangular cell grid cannot connect
 * them cleanly. A clearance reserve keeps long shared approaches away from the
 * neighbouring paper after curve fitting and rounding. */
function retryComponentLanes(request: GeneratorRequest, curveFitter: ReturnType<typeof createExactCurveFitter>): GeneratorResult | undefined {
	if (request.mode !== 'figure' || request.style === 'fitted' || request.style === 'corners' || request.style === 'layers') return;
	const rings = normalizeContours(request.contours ?? []), size = request.frameSize ?? 70,
		sunburst = request.style === 'sunburst', frame = sunburst ? 'circle' : (request.frame ?? 'circle'),
		style = request.style === 'sunburst' ? 'rays' : (request.style ?? 'rays');
	let best: GeneratorResult | undefined;
	for (const aligned of [false, true]) try {
		const inner = generateComponentLanes(rings, frame, sunburst ? size * .8 : size,
			request.scale, style, aligned, sunburst ? 2 : 0);
		const construction = sunburst ? sunburstBorder(inner, size) : inner;
		const result = improveSharedConnections(finishConstruction(request, construction, 'nested', undefined, curveFitter));
		const rect = inferOverlapRect(result.design.fingers, result.design.gridSize),
			margin = intersectionMarginPx(rect, gridClearanceScale(result.design.gridSize.x, result.design.gridSize.y));
		if (findFingersWithIssues(result.design.fingers, margin * 1.1).size) continue;
		const tips = cutTipCounts(result.design);
		if (!best || fewerCutTips(tips, cutTipCounts(best.design))) best = result;
		if (tips[0] === 0 && tips[1] === 0) return best;
	} catch (error) {
		if (!(error instanceof ConstructionError) && !(error instanceof CutGeometryError)) throw error;
	}
	return best;
}

/** A divided serif can pass spacing checks but still leave sharp paper tips.
 * Try one alternate attachment fan, preserving the visible text and frame.
 * Keep it only when it removes tips, adds no strips and retains the reserve. */
function improveTextPanelTips(request: GeneratorRequest, original: GeneratorResult,
	curveFitter: ReturnType<typeof createExactCurveFitter>): GeneratorResult {
	const frame = request.textFrame ?? 'woven', text = request.text ?? '', font = request.font;
	if (request.mode !== 'text' || !font || !cutTipCounts(original.design)[1] ||
		frame === 'repeat' || frame === 'repeat-check') return original;
	const lines = text.normalize('NFC').replace(/\r\n?/g, '\n').split('\n');
	const strips = 2 * Math.max(...lines.map(line => [...line].length)) + 3 * lines.length + 1;
	if (strips > Math.min(20, original.design.gridSize.x, original.design.gridSize.y)) return original;
	try {
		const shape = frame === 'woven' || frame === 'air' ? undefined : frame;
		const construction = generateTextGrid(text, font, frame === 'air', shape, {
			columns: 2, slices: 3, spread: true, filled: true, inkPanels: true,
			guardSeams: true, practical: true, compound: true, balanced: true,
			boundaryIslands: true, contourApproaches: true
		});
		const result = improveSharedConnections(finishConstruction(request, construction, 'letters', undefined, curveFitter)),
			design = result.design;
		if (design.gridSize.x > original.design.gridSize.x || design.gridSize.y > original.design.gridSize.y ||
			!fewerCutTips(cutTipCounts(design), cutTipCounts(original.design))) return original;
		const margin = intersectionMarginPx(inferOverlapRect(design.fingers, design.gridSize),
			gridClearanceScale(design.gridSize.x, design.gridSize.y));
		if (findFingersWithIssues(design.fingers, margin * 1.1).size) return original;
		// An earlier recipe may have used different letter spacing or frame
		// projections. Optimising its cuts must also retain its composition.
		const before = rasterizeDesign(original.design, 240).data, after = rasterizeDesign(design, 240).data;
		if (after.reduce((sum, pixel, i) => sum + Number(pixel !== before[i]), 0) / after.length <= .002)
			return result;
	} catch (error) {
		if (!(error instanceof ConstructionError) && !(error instanceof CutGeometryError)) throw error;
	}
	return original;
}

/** Keep successful layouts and their latency unchanged. These bounded panel
 * alternatives run only after the established straight and curved routes fail. */
function retryPanelLayouts(request: GeneratorRequest, curveFitter?: ReturnType<typeof createExactCurveFitter>): GeneratorResult | undefined {
	const recipes: Array<() => Construction> = [];
	let recipe: GeneratorResult['recipe'] = 'letters';
	if (request.mode === 'text') {
		const frame = request.textFrame ?? 'woven', text = request.text ?? '', font = request.font;
		if (!font || !text.trim() || frame === 'repeat' || frame === 'repeat-check') return;
		const lines = text.normalize('NFC').replace(/\r\n?/g, '\n').split('\n');
		if (2 * Math.max(...lines.map(line => [...line].length)) + 3 * lines.length + 1 > 20) return;
		const shape = frame === 'woven' || frame === 'air' ? undefined : frame;
		for (const adaptivePanels of [false, true]) recipes.push(() =>
			generateTextGrid(text, font, frame === 'air', shape, {
				columns: 2, slices: 3, filled: true, spread: true,
				practical: true, compound: true, guardSeams: true, adaptivePanels
			}));
	} else {
		const rings = normalizeContours(request.contours ?? []), size = request.frameSize ?? 70, scale = request.scale ?? .7;
		if (request.style === 'corners') return;
		if (request.style === 'layers') {
			recipe = 'nested';
			recipes.push(() => generateLayeredFigure(rings, size, scale,
				{ columns: 2, rows: 1, filled: true, adaptive: true }));
		} else if (request.style === 'fitted') {
			recipe = 'silhouette';
			recipes.push(() => generatePanelFigure(rings, undefined, size, scale,
				2, 'check', 1, false, fourPortMotif, 'ray', true));
		} else {
			const sunburst = request.style === 'sunburst', shape = sunburst ? 'circle' : (request.frame ?? 'circle'),
				style = request.style === 'sunburst' ? 'rays' : (request.style ?? 'rays');
			recipe = rings.length === 1 ? 'silhouette' : 'nested';
			recipes.push(() => {
				const result = generatePanelFigure(rings, shape, sunburst ? size * .8 : size,
					scale, 1, style, 2, true, fourPortMotif, 'ray');
				return sunburst ? sunburstBorder(result, size) : result;
			});
		}
	}
	for (const construct of recipes) {
		let result: Construction | undefined;
		try {
			result = construct();
			return finishConstruction(request, result, recipe, undefined, curveFitter);
		} catch (error) {
			if (!(error instanceof ConstructionError) && !(error instanceof CutGeometryError)) throw error;
		}
		if (!result) continue;
		const geometry = curveSharedCuts(result.geometry);
		if (!geometry) continue;
		try {
			return finishConstruction(request, result, recipe, geometry, curveFitter);
		} catch (error) {
			if (!(error instanceof ConstructionError) && !(error instanceof CutGeometryError)) throw error;
		}
	}
}

function generateUsingRecipes(request: GeneratorRequest,
	onRejected: (construction: Construction, recipe: GeneratorResult['recipe']) => void,
	curveFitter: ReturnType<typeof createExactCurveFitter>, repetitionCache?: ReturnType<typeof repeatedGridCache>): GeneratorResult {
	if (request.mode === 'figure') {
		const contours = normalizeContours(request.contours ?? []);
		if (!contours.length) throw new ConstructionError('empty', 'No contour');
		request = { ...request, contours };
	}
	const finish = (construction: Construction, recipe: GeneratorResult['recipe']) => {
		try { return finishConstruction(request, construction, recipe, undefined, curveFitter); }
		catch (error) {
			if (!(error instanceof ConstructionError) && !(error instanceof CutGeometryError)) throw error;
			onRejected(construction, recipe);
			throw error;
		}
	};
	if (request.mode === 'text') {
		if (!request.font) throw new ConstructionError('empty', 'No font');
		const frame = request.textFrame ?? 'woven';
		if (frame === 'repeat-check') {
			const text = request.text ?? '';
			const cache = checkeredGridCache();
			let best: GeneratorResult | undefined;
			let bestInset = .35;
			let rawTips: [number, number] | undefined;
			let crowded = false;
			let last: unknown;
			// Keep the established layout (including the detached-accent fallback),
			// then try slightly wider connections only when they improve its cuts.
			const small = [...text.normalize('NFC').replace(/\s/g, '')].length <= 2;
			for (const inset of small ? [.35, .25, .4, .46] : [.35, .4, .46]) {
				if (inset === .25 && best) continue;
				// This is a quality improvement for working cuts. Unsupported
				// topology should still return promptly instead of trying it twice.
				if (inset >= .4 && !best) break;
				try {
					const construction = generateCheckeredGrid(text, request.font, .82, inset, { cache, onCrowded: () => { crowded = true; } });
					const tips = cutTipCounts(construction.geometry);
					// Reject worse candidates before the more expensive curve fitting.
					if (rawTips && !fewerCutTips(tips, rawTips)) continue;
					const candidate = finish(construction, 'letters');
					if (!best || fewerCutTips(cutTipCounts(candidate.design), cutTipCounts(best.design))) {
						best = candidate;
						bestInset = inset;
						rawTips = tips;
					}
					if (best && !cutTipCounts(best.design)[1]) break;
				} catch (error) {
					if (!(error instanceof ConstructionError) && !(error instanceof CutGeometryError)) throw error;
					if (error instanceof ConstructionError && ['empty', 'character'].includes(error.code)) throw error;
					last = error;
				}
			}
			if (best) {
				if (rawTips?.[1] && cutTipCounts(best.design)[1]) try {
					const construction = generateCheckeredGrid(text, request.font, .82, bestInset, { cache, optimize: true });
					// Skip fitting unchanged or worse combinations. A local improvement
					// still has to pass every full-sheet check and improve the export.
					if (fewerCutTips(cutTipCounts(construction.geometry), rawTips)) {
						const candidate = finish(construction, 'letters');
						if (fewerCutTips(cutTipCounts(candidate.design), cutTipCounts(best.design))) best = candidate;
					}
				} catch (error) {
					if (!(error instanceof ConstructionError) && !(error instanceof CutGeometryError)) throw error;
				}
				let bestTips = cutTipCounts(improveSharedConnections(best).design);
				// A further chord can split the narrow notch of a solid letter such
				// as N. Reuse cached cells, then try one wider pair of grid contacts.
				// The original remains available if the joined cuts lose clearance.
				if (bestTips[1]) for (const inset of [bestInset, .2]) {
					try {
						const construction = generateCheckeredGrid(text, request.font, .82, inset,
							{ cache, optimize: true, relieve: true });
						const candidate = finish(construction, 'letters');
						const rounded = improveSharedConnections(candidate).design, tips = cutTipCounts(rounded);
						if (fewerCutTips(tips, bestTips)) {
							const rect = inferOverlapRect(rounded.fingers, rounded.gridSize);
							const margin = intersectionMarginPx(rect, gridClearanceScale(rounded.gridSize.x, rounded.gridSize.y));
							// A smaller tip count alone can hide a new thin neck. Leave a
							// clearance reserve for the additional cuts on both sheets.
							if (!findFingersWithIssues(rounded.fingers, margin * 1.1).size) { best = candidate; bestTips = tips; }
						}
						if (!bestTips[1]) break;
					} catch (error) {
						if (!(error instanceof ConstructionError) && !(error instanceof CutGeometryError)) throw error;
					}
				}
				return best;
			}
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
			// Keep the existing successful cuts: a four-port layout can be more
			// intricate. Add connections only after the two-port repairs fail.
			const mixed = mixedCheckeredGridCache();
			// Individual stroke ends can separate several legs that a single
			// support point leaves on the same paper. Reuse clear earlier cells.
			for (const strokeTips of [false, true]) for (const balanced of [false, true]) {
				try {
					return finish(generateMixedCheckeredGrid(text, request.font, { cache: mixed, previous: cache, balanced, strokeTips }), 'letters');
				} catch (error) {
					if (!(error instanceof ConstructionError) && !(error instanceof CutGeometryError)) throw error;
					last = error;
				}
			}
			throw last;
		}
		if (frame === 'repeat') {
			const cache = repetitionCache ?? repeatedGridCache();
			let last: unknown;
			// Keep both established layouts before changing attachment candidates.
			for (const [bentSpokes, strokeTips] of [[false, false], [true, false], [false, true], [true, true]]) {
				if (bentSpokes || strokeTips) {
					// Keep completed cells when one local route failed. If all cells
					// existed but joining them failed, their connections need rebuilding.
					if (!cache.failed.size) cache.cells.clear();
					cache.failed.clear();
					cache.crowded.clear();
				}
				for (const practical of [false, true]) {
					if (practical && !cache.failed.size) break;
					try {
						return finish(generateRepeatedGrid(request.text ?? '', request.font, practical, cache, practical, bentSpokes, strokeTips), 'letters');
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
		for (const padding of frame === 'air' ? [undefined] : [undefined, .5]) {
			let bentCrowded = false;
			for (const balanced of [false, true]) recipes.push(() => !balanced || bentCrowded
				? generateTextGrid(text, font, frame === 'air', shape, {
					padding, spread: true, practical: true, compound: true, adaptGates: true,
					bentSpokes: true, balanced, onCrowded: () => { bentCrowded = true; }
				}) : undefined);
		}
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
		for (const panels of layouts) {
			try {
				return finish(generateLayeredFigure(request.contours ?? [], request.frameSize, request.scale, panels), 'nested');
			} catch (error) {
				if (!(error instanceof ConstructionError) && !(error instanceof CutGeometryError)) throw error;
			}
		}
		// A motif inside the medallion can have counters whose attachments
		// cannot alternate along a straight chain. Reconnect those counters
		// around either attachment while retaining the seven-strip layout.
		const construction = generateLayeredFigure(request.contours ?? [], request.frameSize,
			request.scale, undefined, nestedFourPortMotif);
		try {
			return finish(construction, 'nested');
		} catch (error) {
			if (!(error instanceof ConstructionError) && !(error instanceof CutGeometryError)) throw error;
			// Preserve these connections with curved approaches before the
			// global retry replaces them with new straight segments.
			const geometry = curveSharedCuts(construction.geometry);
			if (!geometry) throw error;
			return finishConstruction(request, construction, 'nested', geometry, curveFitter);
		}
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
		try {
			return finish(generatePanelFigure(request.contours ?? [], undefined, request.frameSize ?? 70, request.scale ?? .7, 3, 'check', 1, false, fourPortMotif, 'support', true), 'silhouette');
		} catch (error) {
			if (!(error instanceof ConstructionError) && !(error instanceof CutGeometryError)) throw error;
			for (const columns of [2, 3, 4] as const) {
				try {
					return finish(generateComponentFigure(request.contours ?? [], 'fitted', request.frameSize,
						request.scale, 'check', fourPortMotif, columns), 'silhouette');
				} catch (retryError) {
					if (!(retryError instanceof ConstructionError) && !(retryError instanceof CutGeometryError)) throw retryError;
				}
			}
			throw error;
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
	// More columns give a row of separate islands its own clear connections.
	// Split the larger bodies below them to complete the grid, retaining the
	// earlier two-column recipe before these wider alternatives.
	for (const columns of [2, 3, 4] as const) {
		try {
			const construction = generateComponentFigure(rings, shape, size, scale, style,
				fourPortMotif, columns, sunburst && columns > 2 ? 2 : 0);
			return finish(sunburst ? sunburstBorder(construction, outerSize) : construction, 'nested');
		} catch (error) {
			if (!(error instanceof ConstructionError) && !(error instanceof CutGeometryError)) throw error;
			errors.push(error);
		}
	}
	const last = errors.at(-1)!;
	throw new ConstructionError(
		last instanceof ConstructionError ? last.code : 'clearance',
		errors.map((e) => e.message).join('; ')
	);
}
