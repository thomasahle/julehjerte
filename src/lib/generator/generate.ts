import { createExactCurveFitter } from '$lib/inverse/curveFitCache';
import { generateLayeredFigure } from './layers';
import { generateCornerChecks, hasThreeCounterLanes } from './cornerChecks';
import { generateFittedFigure } from './fitted';
import { sunburstBorder } from './sunburst';
import { generateTextGrid, roomOf, squareCellScale } from './textGrid';
import { NO_WHOLE_STRIPS, STRIPS, slidePlace, stripFigures } from './stripFigure';
import { MOTIF, boardRadius, boardScale, motifChoices, squareChoices } from './boardMotif';
import { CIRCLE_STYLES, fillSquare, fitCircle } from './frameFit';
export { fillSquare, fitCircle } from './frameFit';
import { generateBranchedText, hasOverlappingTextBranches, fittedBranchedTextFill } from './branchedText';
import { generateCheckeredGrid, checkeredGridCache, checkeredLayouts } from './checkeredGrid';
import { generateMixedCheckeredGrid, mixedCheckeredGridCache } from './mixedCheckeredGrid';
import { cutTipCounts, fewerCutTips } from './cutQuality';
import { trickyLetters } from './trickyLetters';
import { normalizeContours } from './contours';
import { gridClearance, gridClearanceScale } from '$lib/geometry/clearance';
import { generatePanelFigure, backgroundJunctions } from './panels';
import { generateComponentFigure } from './components';
import { generateComponentLanes } from './componentLanes';
import { rerouteSharedCuts, rerouteFrameCuts } from './sharedCuts';
import { curveSharedCuts, curveSharpSharedTips } from './curvedCuts';
import {
	convertValidatedCutGeometry,
	CutGeometryError,
	type CutGeometry
} from '$lib/inverse/toHeartDesign';
import type { HeartColors, HeartDesign } from '$lib/types/heart';
import { inferOverlapRect } from '$lib/utils/overlapRect';
import { intersectionMarginPx } from '$lib/editor/curveIssues';
import { findSearchIssues, searchFingerIssues } from './searchClearance';
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
	BOARD_RADII,
	type Ring,
	type Frame,
	type FigureStyle,
	type OpenFrame,
	FITTED,
	WEDGES,
	SILHOUETTE,
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
	style?: FigureStyle;
	textFrame?: TextFrame;
	/** How far the legs of a frame without a centre panel stop short of the
	 * motif (the wedges' tips, the silhouette's corner checks), when not the
	 * frame's own gap. */
	gap?: number;
	/** Letter cells fitted to their letters instead of square ones. */
	fittedCells?: boolean;
	/** The letters, or a motif standing in for one on a board, at this
	 * multiple of the frame's own size: the visitor's size setting. */
	letterScale?: number;
	/** For the small motifs and equal squares: the choice their default size
	 * made, which every other size keeps (see `withLayout`). */
	layout?: BoardLayout;
	/** The strips per side of the board a construction must lie on. */
	board?: number;
	/** For the figure in the checks: how far down the heart's middle the
	 * visitor put the motif, and how far across it; otherwise its default
	 * size chooses, on the middle. */
	place?: number;
	side?: number;
	/** For woven text: the room around each letter in its cell, as a fraction
	 * of the letters' height (see `roomOf`); otherwise the frame's own. */
	room?: number;
};
/** The room a text asks around each letter in its cell (see `roomOf`): the
 * visitor's, else the airy or woven frame's own. */
const textRoom = (request: GeneratorRequest) => request.room ?? request.textFrame === 'air';
/** The choice a motif on a board (small motifs, equal squares) made at its
 * default size: which of its `frameAlternatives`, on a board of how many
 * strips per side. */
export type BoardLayout = { alternative: number; board: number };
export type GeneratorResult = {
	design: HeartDesign;
	recipe: 'silhouette' | 'nested' | 'letters';
	/** The weave and picture are valid, but some paper is narrower than the
	 * usual cutting clearance. Shown with a warning naming the letters that
	 * cause it (none for figures), instead of being refused. `spacing` is the
	 * fraction of the clearance that every cut still keeps. */
	hardToCut?: { letters: string[]; spacing: number };
	/** For the small motifs and equal squares: the choice this heart's size
	 * kept, its default size's (see `withLayout`). */
	layout?: BoardLayout;
	/** For the figure in the checks: how far down the heart's middle the
	 * motif lies. */
	place?: number;
	/** The size the motif was built at, where the frame could not build the
	 * one asked for: a little smaller in the figure in the checks, where its
	 * strips could not all be whole; 70% on a board circle that cannot take a
	 * larger circle around this motif. */
	scale?: number;
};
/** The frame without a centre panel that a figure request selects, if any. */
function openFrame(request: GeneratorRequest): OpenFrame | undefined {
	if (request.mode !== 'figure') return;
	return request.style === 'fitted' ? { ...FITTED, gap: request.gap ?? FITTED.gap } : request.style === 'wedges' ? { ...WEDGES, gap: request.gap ?? WEDGES.gap }
		: request.style === 'silhouette' ? { ...SILHOUETTE, gap: request.gap ?? SILHOUETTE.gap } : undefined;
}
/** Paper a hard-to-cut result keeps, as fractions of the grid clearance, from
 * widest to narrowest. Cuts on one sheet never cross or touch at any of them. */
export const HARD_TO_CUT_SPACINGS = [.1, .03, .01] as const;
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
	geometry = r.geometry, curveFitter?: ReturnType<typeof createExactCurveFitter>, spacing = 1,
	precheck = request.mode !== 'text'): GeneratorResult {
	const curved = geometry !== r.geometry;
	if (request.board && r.geometry.A_overlap_paths.length + 1 !== request.board)
		throw new ConstructionError('topology', 'Not the board the default size chose');
	// The polygon prechecks describe the original straight cuts. A curved retry
	// is checked on its actual cubics by the complete converter below.
	if (!curved) audit(r.edges);
	const resolutionScale = gridClearanceScale(
		r.geometry.A_overlap_paths.length + 1,
		r.geometry.B_overlap_paths.length + 1
	), clearanceScale = resolutionScale * spacing;
	// Avoid expensive curve fitting when cuts already leave a severe sliver.
	if (!curved && spacing === 1 && precheck && hasSeverePinch(r.geometry, clearanceScale))
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
			request.textFrame === 'checkered',
		clearanceScale,
		resolutionScale,
		overlapAspectRatio: r.overlapAspectRatio,
		// The picture is checked against the artwork below.
		verifyFidelity: false,
		// Paper as the generator judges it (see `searchClearance`), and the
		// fits it was tuned with: one finer fit, then the exact cuts.
		issues: searchFingerIssues,
		refinements: [1, .4, 0]
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
	if (findSearchIssues(design.fingers, margin).size) return result;
	// Endpoints, visible curves and strip connections are unchanged. Each moved
	// curve is still exactly coincident on both sheets, preserving the weave.
	return { ...result, design };
}

const BOARD_FRAMES: string[] = ['squares', 'motifs'];
/** The choice each motif's default size made, per frame (see `withLayout`). */
const layouts = new Map<string, BoardLayout | undefined>();
/** A motif on a board (small motifs, equal squares) keeps, at every size, the
 * choice its default size made: there it fills a square or several, so another
 * board, or a motif larger in its square, would make it jump in size as the
 * slider moves. The page passes the choice when it has the default size's
 * heart; otherwise it is made here. */
function withLayout(request: GeneratorRequest): GeneratorRequest {
	if (request.mode !== 'figure' || !BOARD_FRAMES.includes(request.style ?? '') || request.layout || boardScale(request) === 1)
		return request;
	const key = `${request.style} ${request.board ?? ''} ${JSON.stringify(request.contours ?? [])}`;
	if (!layouts.has(key)) {
		let layout: BoardLayout | undefined;
		try {
			layout = generate({ ...request, scale: .7 }).layout;
		} catch (error) {
			if (!(error instanceof ConstructionError) && !(error instanceof CutGeometryError)) throw error;
		}
		if (layouts.size > 64) layouts.clear();
		layouts.set(key, layout);
	}
	return { ...request, layout: layouts.get(key) };
}

export function generate(request: GeneratorRequest): GeneratorResult {
	const scale = request.scale ?? .7;
	try {
		return generateAtSize(request);
	} catch (error) {
		if (!(error instanceof ConstructionError) && !(error instanceof CutGeometryError) || scale <= .85) throw error;
		// Above 85% a frame takes a motif larger than its constructions were
		// first made for. Where nothing at all can be built at that size, the
		// motif keeps the largest a few percent below that can be, rather than
		// refusing.
		for (let size = scale - .03; size > .85 - 1e-9; size -= .03) try {
			return generateAtSize({ ...request, scale: Math.round(size * 100) / 100 });
		} catch (smallerError) {
			if (!(smallerError instanceof ConstructionError) && !(smallerError instanceof CutGeometryError)) throw smallerError;
		}
		throw error;
	}
}

/** A heart for the request at its own size (see `generate`). */
function generateAtSize(request: GeneratorRequest): GeneratorResult {
	if (request.mode === 'figure' && request.style === 'strips') return generateStrips(request);
	request = withLayout(request);
	const alternatives = frameAlternatives(request);
	if (alternatives.length === 1) return generateOnce(alternatives[0].request);
	// A figure names no letters, only that its paper is narrow. A motif on a
	// board records the choice its default size made.
	const named = (result: GeneratorResult, alternative: number): GeneratorResult => ({
		...result,
		...request.mode === 'figure' && BOARD_FRAMES.includes(request.style ?? '')
			? { layout: request.layout ?? { alternative, board: result.design.gridSize.x } } : {},
		...result.hardToCut && request.mode === 'figure' ? { hardToCut: { ...result.hardToCut, letters: [] } } : {}
	});
	// Prefer a clean alternative to a hard-to-cut earlier one. Only when none
	// is clean is the first hard-to-cut alternative finished, and only when
	// none is even that are the last resorts tried.
	const hard: [number, () => GeneratorResult | undefined][] = [];
	let last: unknown;
	for (const [index, { request: alternative, retries, lastResort }] of alternatives.entries()) {
		if (lastResort) continue;
		try {
			// Identical small motifs gain little from other junctions; a
			// smaller board is the better next choice.
			return named(generateOnce(alternative, finish => hard.push([index, finish]), 1, retries), index);
		} catch (error) {
			if (!(error instanceof ConstructionError) && !(error instanceof CutGeometryError)) throw error;
			last = error;
		}
	}
	for (const [index, finish] of hard) {
		const result = finish();
		if (result) return named(result, index);
	}
	for (const [index, { request: alternative, lastResort }] of alternatives.entries()) {
		if (!lastResort) continue;
		try {
			return named(generateOnce(alternative), index);
		} catch (error) {
			if (!(error instanceof ConstructionError) && !(error instanceof CutGeometryError)) throw error;
			last = error;
		}
	}
	throw last;
}

/** Where each motif's default size placed it in the checks (see `generateStrips`). */
const stripShifts = new Map<string, number>();
/** The figure in the checks (see `stripFigures`): the board's squares swap
 * colour inside the motif, at the size the visitor sets. The motif keeps, at
 * every size, the place on the board its default size chose, so that it
 * only grows with the slider: cut cleanly if it can be there, else as hard to
 * cut. Only where it cannot be built there at all does it move. */
function generateStrips(request: GeneratorRequest): GeneratorResult {
	const contours = normalizeContours(request.contours ?? []);
	if (!contours.length) throw new ConstructionError('empty', 'No contour');
	request = { ...request, contours };
	const scale = request.scale ?? .7, strips = request.board ?? STRIPS, key = strips + JSON.stringify(contours);
	if (!stripShifts.has(key) && scale !== .7) {
		const chosen = stripFigures(contours, strips, .7).next().value;
		if (stripShifts.size > 64) stripShifts.clear();
		if (chosen) stripShifts.set(key, chosen.shift);
	}
	// At some sizes of an intricate motif no sheets keep every strip whole at
	// its place, a snowflake's arms crossing the lines just so, or a crown's
	// fine points on a small board. There the motif keeps its place at the
	// nearest size it can have there, a little smaller, else in steps towards
	// the default size, which has it: the slider then waits rather than the
	// motif jumping. Only where its place is no use does the motif move.
	const at = (size: number) => Math.round(size * 1e6) / 1e6;
	// The place the visitor chose, kept as it is; else the default size's,
	// slid towards where the motif fits largest above that size.
	const chosen = request.place ?? stripShifts.get(key), kept = chosen !== undefined;
	const placeAt = (size: number) => request.place ?? (chosen === undefined ? undefined : slidePlace(contours, size, chosen));
	const towards: number[] = [], step = scale > .7 ? -.05 : .05;
	for (let size = scale + step; step < 0 ? size > .7 + 1e-9 : size < .7 - 1e-9; size += step) towards.push(size);
	towards.push(scale === .7 ? .6 : .7);
	const plans = [
		{ where: 'alone', sizes: kept ? [scale, scale - .01, scale - .02, scale - .03, ...towards] : [] },
		{ where: kept ? 'elsewhere' : 'first', sizes: [scale, scale - .02, scale - .05] },
		{ where: 'first', sizes: towards }
	] as const;
	let last: unknown;
	const curveFitter = createExactCurveFitter();
	for (const { where, sizes } of plans)
		for (const size of sizes) try {
			return stripsAt(request, key, at(size), where, curveFitter, placeAt(at(size)));
		} catch (error) {
			if (!(error instanceof ConstructionError) && !(error instanceof CutGeometryError)) throw error;
			last ??= error;
			// Past the place's own sizes only while nothing at all could be
			// built there, which is quickly known, unlike cuts that failed to
			// finish: those are the place's answer.
			if (where === 'alone' && error.message !== NO_WHOLE_STRIPS) break;
		}
	throw last;
}

/** The figure in the checks at `scale` (see `generateStrips`), at the places
 * `stripFigures` tries around the one its default size chose. */
function stripsAt(request: GeneratorRequest, key: string, scale: number,
	where: Parameters<typeof stripFigures>[5], curveFitter: ReturnType<typeof createExactCurveFitter>,
	keep: number | undefined): GeneratorResult {
	const contours = request.contours!;
	let shift: number | undefined;
	const named = (result: GeneratorResult): GeneratorResult => ({
		...result, place: shift, scale, ...result.hardToCut ? { hardToCut: { ...result.hardToCut, letters: [] } } : {}
	});
	let rejected: Parameters<typeof hardToCutResult>[1] = [], places = 0;
	let last: unknown = new ConstructionError('topology', NO_WHOLE_STRIPS);
	for (const construction of stripFigures(contours, request.board ?? STRIPS, scale, 4000, keep, where, request.side ?? 0)) {
		if (construction.shift !== shift) {
			// Nothing at the last place finished cleanly: as hard to cut, if it
			// can be, before the next place.
			const hard = hardToCutResult(request, rejected, curveFitter);
			if (hard) return named(hard);
			if (++places > 4) break;
			if (shift === undefined && scale === .7 && request.place === undefined && !request.side) stripShifts.set(key, construction.shift);
			[shift, rejected] = [construction.shift, []];
		}
		try {
			return named(finishConstruction(request, construction, 'nested', undefined, curveFitter));
		} catch (error) {
			if (!(error instanceof ConstructionError) && !(error instanceof CutGeometryError)) throw error;
			last = error;
			rejected.push({ construction, recipe: 'nested' });
		}
	}
	const hard = hardToCutResult(request, rejected, curveFitter);
	if (!hard) throw last;
	return named(hard);
}


/** Square text cells are worth letters this much of their fitted size. */
const SQUARE_CELL_SCALE = .85;

/** The requests a frame tries in turn. Small motifs move to smaller boards;
 * wedges move nearer the motif, until they touch it; text fits its cells.
 * An alternative without `retries` is tried with the standard recipes only;
 * a last resort only when no other alternative gives even a hard-to-cut heart. */
function frameAlternatives(request: GeneratorRequest): { request: GeneratorRequest; retries: boolean; lastResort?: boolean }[] {
	if (request.mode !== 'figure') {
		const frame = request.textFrame ?? 'woven';
		if (frame === 'checkered' || !request.font) return [{ request, retries: true }];
		// The visitor's choice of cells comes first. The other kind remains
		// rather than refusing.
		if (request.fittedCells !== undefined) return [{ request, retries: true },
			{ request: { ...request, fittedCells: !request.fittedCells }, retries: true, lastResort: true }];
		// Otherwise square cells keep the checks square, unless they would make
		// the letters much smaller than cells fitted to them; narrow letters
		// then start with fitted cells. Square cells with every recipe remain,
		// rather than refusing.
		const square = { request, retries: false }, fitted = { request: { ...request, fittedCells: true }, retries: true };
		return [...squareCellScale(request.text ?? '', request.font, textRoom(request)) >= SQUARE_CELL_SCALE
			? [square, fitted] : [fitted, square], { request, retries: true, lastResort: true }];
	}
	if (request.style === 'motifs' || request.style === 'squares') {
		const contours = normalizeContours(request.contours ?? []);
		if (!contours.length) throw new ConstructionError('empty', 'No contour');
		const font: Font = { glyphs: { [MOTIF]: { advance: 1, contours }, ' ': { advance: 1, contours: [] } } }, letterScale = boardScale(request);
		// The motif is the letter of a text frame on a board (see
		// `motifChoices`, `squareChoices`). Small motifs: the most copies on
		// the checkerboard that cut. Equal squares: the one letter of the
		// woven text frame with square cells, in the centre square. Strips the
		// visitor chose are kept, hard to cut if need be; others only where
		// they can build nothing at all.
		const board = request.style === 'squares' ? squareChoices(request.board) : motifChoices(request.board);
		type Choice = { request: GeneratorRequest; retries: boolean; lastResort?: boolean };
		const choicesAt = (letterScale: number): Choice[] => board.map(({ text, board, retries, lastResort, larger = 1, air, fitted }) => ({
			retries, lastResort, request: { mode: 'text', name: request.name, colors: request.colors, text, font, letterScale: Math.min(request.style === 'squares' ? 1.1 : Infinity, letterScale * larger),
				...request.style === 'squares' ? { textFrame: air ? 'air' : 'woven', fittedCells: !!fitted, board: fitted ? undefined : board } : { textFrame: 'checkered', board } }
		}));
		const choices = choicesAt(letterScale), layout = request.layout, chosen = layout && choices[layout.alternative];
		if (!layout || !chosen) return choices;
		// Other sizes keep the default size's choice, on its board. Larger than
		// that can be cut there, the motif keeps the default size's own size;
		// the rest remain rather than refusing.
		const kept = (choice: Choice): Choice => ({ ...choice, request: { ...choice.request, board: layout.board } });
		const own = choicesAt(1)[layout.alternative];
		return [{ ...kept(chosen), retries: true, lastResort: false },
			...(chosen.request.letterScale ?? 1) > (own.request.letterScale ?? 1) ? [{ ...kept(own), retries: true, lastResort: true }] : [],
			...choices.filter(choice => choice !== chosen).map(choice => ({ ...choice, lastResort: true }))];
	}
	// The frame keeps the space asked for, cut cleanly or else as hard to cut,
	// so it only moves one way with the slider. Only where nothing at all can
	// be finished there do the legs of a frame without a centre panel move
	// nearer the motif, until they touch it, and a circle move out, and then
	// keep the frame's own size.
	const style = request.style ?? 'rays';
	if (style === 'wedges' || request.gap && ['silhouette', 'corners', 'fitted'].includes(style)) {
		const gap = request.gap ?? WEDGES.gap;
		return [...new Set([gap, gap / 2, 0])].map((gap, i) => ({ request: fillSquare({ ...request, gap }), retries: true, lastResort: i > 0 }));
	}
	if (request.gap !== undefined && CIRCLE_STYLES.includes(style))
		return [...[request.gap, request.gap + 4].map((gap, i) => ({ request: fitCircle({ ...request, gap }), retries: true, lastResort: i > 0 })),
			{ request: { ...request, gap: undefined }, retries: true, lastResort: true }];
	return [{ request: fillSquare(request), retries: true }];
}

/** Retry completed constructions after all established recipes fail.
 * Moving coincident cuts preserves the artwork and graph endpoints; the entire
 * result must pass the same topology, spacing and fidelity checks again.
 * `deferHard` takes the hard-to-cut fallback instead of running it, and a
 * checkerboard tries at most `variants` choices of junctions. Without
 * `retries`, only recipes that keep text cells square run, and no
 * hard-to-cut result is made. */
function generateOnce(request: GeneratorRequest,
	deferHard?: (finish: () => GeneratorResult | undefined) => void, variants = Infinity, retries = true): GeneratorResult {
	const curveFitter = createExactCurveFitter();
	const counterLanes = request.mode === 'figure' && request.style === 'corners' &&
		hasThreeCounterLanes(normalizeContours(request.contours ?? []));
	if (counterLanes) {
		const result = retryCornerLanes(request, curveFitter);
		if (result) return result;
	}
	const frame = request.textFrame ?? 'woven';
	const overlappingBranches = request.mode === 'text' && request.font &&
		frame !== 'woven' && frame !== 'air' && frame !== 'checkered' &&
		hasOverlappingTextBranches(request.text ?? '', request.font);
	if (overlappingBranches) {
		// Rectangular panels repeatedly clip these overlapping ends. Use their
		// actual branch topology first, so iteration need not exhaust that work.
		const result = retryBranchedText(request, curveFitter);
		if (result) return result;
	}
	const rejected: { construction: Construction; recipe: GeneratorResult['recipe'] }[] = [];
	try {
		const result = generateUsingRecipes(request,
			(construction, recipe) => rejected.push({ construction, recipe }), curveFitter, variants, retries);
		// The checkerboard improves its shared connections as it compares sizes.
		return request.mode === 'text' && request.textFrame === 'checkered'
			? result : improveTextPanelTips(request, result, curveFitter);
	} catch (error) {
		if (!(error instanceof ConstructionError) && !(error instanceof CutGeometryError)) throw error;
		if (!retries) throw error;
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
		// Frames without a centre panel try their own retries before lanes.
		const lanes = openFrame(request) ? undefined : retryComponentLanes(request, curveFitter, curvedCandidates);
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
		const openLanes = openFrame(request) ? retryComponentLanes(request, curveFitter, curvedCandidates) : undefined;
		if (openLanes) return openLanes;
		const chainContacts = retryChainContacts(request, curveFitter);
		if (chainContacts) return chainContacts;
		const cornerLanes = counterLanes ? undefined : retryCornerLanes(request, curveFitter);
		if (cornerLanes) return cornerLanes;
		const closePanels: Construction[] = [];
		const textPanels = retryTextPanelIslands(request, curveFitter, closePanels);
		if (textPanels) return textPanels;
		const branches = overlappingBranches ? undefined : retryBranchedText(request, curveFitter);
		if (branches) return branches;
		const widerConnections = retryPanelReserve(request, closePanels, curveFitter);
		if (widerConnections) return widerConnections;
		const guardedPanels = retryGuardedPanels(request, curveFitter);
		if (guardedPanels) return guardedPanels;
		const finishHard = () => hardToCutResult(request, [...curvedCandidates,
			...closePanels.map(construction => ({ construction, recipe: 'letters' as const }))], curveFitter);
		if (deferHard) {
			deferHard(finishHard);
			throw error;
		}
		const hardToCut = finishHard();
		if (hardToCut) return hardToCut;
		throw error;
	}
}

/** Fine serifs and narrow gaps can need more paper than the clearance allows,
 * even with exact outlines and every established construction. Rather than
 * refusing, keep a completed construction whose weave and picture are valid and
 * whose cuts stay apart, and flag it as hard to cut, naming the letters beside
 * its narrow paper. Prefer the widest spacing kept, then the fewest strips with
 * narrow paper, then the fewest sharp tips. Clean results never get here. */
function hardToCutResult(request: GeneratorRequest,
	candidates: { construction: Construction; recipe: GeneratorResult['recipe'] }[],
	curveFitter: ReturnType<typeof createExactCurveFitter>): GeneratorResult | undefined {
	type Choice = { result: GeneratorResult; construction: Construction; spacing: number; narrow: number; tips: [number, number] };
	let best: Choice | undefined;
	const seen = new Set<string>(), lowest = HARD_TO_CUT_SPACINGS.at(-1)!;
	for (const { construction, recipe } of candidates) {
		const key = JSON.stringify(construction.edges);
		if (seen.has(key)) continue;
		seen.add(key);
		try {
			// Finish once at the narrowest spacing, then record the widest one kept.
			const result = finishConstruction(request, construction, recipe, undefined, curveFitter, lowest),
				{ design } = result, rect = inferOverlapRect(design.fingers, design.gridSize),
				full = intersectionMarginPx(rect, gridClearanceScale(design.gridSize.x, design.gridSize.y)),
				narrow = findSearchIssues(design.fingers, full).size,
				spacing = narrow ? HARD_TO_CUT_SPACINGS.find(fraction => fraction === lowest ||
					!findSearchIssues(design.fingers, full * fraction, full).size)! : 1,
				tips = cutTipCounts(design);
			if (!best || spacing > best.spacing || spacing === best.spacing && (narrow < best.narrow ||
				narrow === best.narrow && fewerCutTips(tips, best.tips)))
				best = { result, construction, spacing, narrow, tips };
		} catch (error) {
			if (!(error instanceof ConstructionError) && !(error instanceof CutGeometryError)) throw error;
		}
	}
	if (!best?.narrow) return best?.result;
	const { construction, spacing } = best, letters = request.mode === 'text' && request.font
		? trickyLetters(construction, request.text ?? '', request.font, 1.5 * gridClearanceScale(
			construction.geometry.A_overlap_paths.length + 1, construction.geometry.B_overlap_paths.length + 1))
		: [];
	return { ...best.result, hardToCut: { letters, spacing } };
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
			construction = generateCornerChecks(rings, request.frameSize, request.scale, routing, true, false, undefined, split, request.gap);
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
			if (findSearchIssues(result.design.fingers, margin * 1.1).size) continue;
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
			'chain', true, false, { tilt, invert }, undefined, request.gap);
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
		if (findSearchIssues(design.fingers, margin * 1.1).size) continue;
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
	const open = openFrame(request);
	if (!open) return;
	const rings = normalizeContours(request.contours ?? []), count = forest(rings).length;
	if (count < 2 || count > 8) return;
	let best: GeneratorResult | undefined;
	for (const padding of [2, 3]) for (const columns of [4, 3, 2] as const)
	for (const route of [fourPortMotif, balancedFourPortMotif]) {
		let construction: Construction;
		try {
			construction = generateComponentFigure(rings, open, request.frameSize, request.scale,
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
			if (findSearchIssues(result.design.fingers, margin * 1.1).size) continue;
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
	const open = openFrame(request);
	if (!open) return;
	const rings = normalizeContours(request.contours ?? []), count = forest(rings).length;
	if (count < 2 || count > 8) return;
	let best: GeneratorResult | undefined;
	for (const padding of [2, 3]) try {
		const construction = generateFittedFigure(rings, request.frameSize, request.scale,
			fourPortMotif, undefined, padding, open, false);
		const result = improveSharedConnections(finishConstruction(request, construction, 'silhouette', undefined, curveFitter));
		const margin = intersectionMarginPx(inferOverlapRect(result.design.fingers, result.design.gridSize),
			gridClearanceScale(result.design.gridSize.x, result.design.gridSize.y));
		if (findSearchIssues(result.design.fingers, margin * 1.1).size) continue;
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
		if (findSearchIssues(result.design.fingers, actualMargin * 1.1).size) continue;
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
		if (findSearchIssues(design.fingers, margin * 1.1).size) continue;
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
	if (request.mode !== 'text' || !font || !text.trim() || frame === 'checkered') return;
	const lines = text.normalize('NFC').replace(/\r\n?/g, '\n').split('\n'),
		letters = Math.max(...lines.map(line => [...line].length)),
		shape = frame === 'woven' || frame === 'air' ? undefined : frame;
	for (const frameFill of shape ? [.88, .94] : [.88]) {
		let best: GeneratorResult | undefined;
		for (const padding of [.16, .12]) for (const [columns, slices] of [[1, 2], [2, 1]]) {
			if (columns * letters + slices * lines.length + 1 > 20) continue;
			try {
				const construction = generateTextGrid(text, font, textRoom(request), shape, { fittedCells: request.fittedCells, letterScale: request.letterScale,
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
				if (findSearchIssues(design.fingers, margin * 1.1).size) {
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
			if (findSearchIssues(design.fingers, margin * 1.1).size) continue;
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
	if (request.mode !== 'text' || !font || !text.trim() || frame === 'checkered') return;
	const lines = text.normalize('NFC').replace(/\r\n?/g, '\n').split('\n'),
		letters = Math.max(...lines.map(line => [...line].length)),
		shape = frame === 'woven' || frame === 'air' ? undefined : frame;
	let best: GeneratorResult | undefined;
	for (const frameFill of shape ? [.88, .94] : [.88])
		for (const padding of [.16, .12]) for (const [columns, slices] of [[1, 2], [2, 1]]) {
			if (columns * letters + slices * lines.length + 1 > 20) continue;
			let construction: Construction;
			try {
				construction = generateTextGrid(text, font, textRoom(request), shape, { fittedCells: request.fittedCells, letterScale: request.letterScale,
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
				if (findSearchIssues(design.fingers, margin * 1.1).size) continue;
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
		frame === 'woven' || frame === 'air' || frame === 'checkered') return;
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
		if (findSearchIssues(design.fingers, margin * 1.1).size) continue;
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
				if (findSearchIssues(design.fingers, margin * 1.1).size) continue;
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
	if (request.mode !== 'figure' || request.style === 'corners' || request.style === 'layers' || request.style === 'motifs' ||
		request.style === 'squares' || request.style === 'board' || request.style === 'strips') return;
	const rings = normalizeContours(request.contours ?? []), count = forest(rings).length;
	if (count < 2 || count > 8) return;
	const size = request.frameSize ?? 70, scale = request.scale ?? .7,
		sunburst = request.style === 'sunburst', open = openFrame(request),
		frame = open ?? (sunburst ? 'circle' : (request.frame ?? 'circle')),
		style = request.style === 'fitted' || request.style === 'wedges' || request.style === 'silhouette' ? 'check'
			: request.style === 'sunburst' ? 'rays' : (request.style ?? 'rays');
	let best: GeneratorResult | undefined;
	for (const columns of [4, 3, 2] as const) for (const route of [fourPortMotif, balancedFourPortMotif]) try {
		const inner = generateComponentFigure(rings, frame, sunburst ? size * .8 : size,
			scale, style, route, columns, sunburst ? 2 : 0, true);
		const construction = sunburst ? sunburstBorder(inner, size) : inner;
		const result = improveSharedConnections(finishConstruction(request, construction,
			open ? 'silhouette' : 'nested', undefined, curveFitter));
		const margin = intersectionMarginPx(inferOverlapRect(result.design.fingers, result.design.gridSize),
			gridClearanceScale(result.design.gridSize.x, result.design.gridSize.y));
		if (findSearchIssues(result.design.fingers, margin * 1.1).size) continue;
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
	if (request.mode !== 'figure' || request.style === 'corners' || request.style === 'layers' || request.style === 'motifs' ||
		request.style === 'squares' || request.style === 'board' || request.style === 'strips') return;
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
		const inner = style === 'fitted' || style === 'wedges' || style === 'silhouette'
			? generateFittedFigure(rings, size, scale, route, undefined, 0, openFrame(request), false)
			: generateFourPortFigure(rings, sunburst ? 'circle' : request.frame,
				sunburst ? size * .8 : size, scale, sunburst ? 'rays' : style, route, sunburst ? 2 : 0);
		const construction = sunburst ? sunburstBorder(inner, size) : inner;
		const result = improveSharedConnections(finishConstruction(request, construction,
			style === 'fitted' || style === 'wedges' || style === 'silhouette' ? 'silhouette' : 'nested', undefined, curveFitter));
		const rect = inferOverlapRect(result.design.fingers, result.design.gridSize),
			margin = intersectionMarginPx(rect, gridClearanceScale(result.design.gridSize.x, result.design.gridSize.y));
		if (findSearchIssues(result.design.fingers, margin * 1.1).size) continue;
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
	const open = openFrame(request);
	if (!open) return;
	const rings = normalizeContours(request.contours ?? []), seen = new Set<string>();
	let best: GeneratorResult | undefined;
	for (const offset of [.15, -.15, .3, -.3])
	for (const signs of [[1, 1, 1, 1], [1, -1, 1, -1], [1, -1, -1, 1], [1, 1, -1, -1]]) try {
		const angles = signs.map(sign => sign * offset) as [number, number, number, number];
		const construction = generateFittedFigure(rings, request.frameSize, request.scale, fourPortMotif, angles, 0, open, false);
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
		const construction = generatePanelFigure(rings, open, request.frameSize ?? 70,
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
function retryComponentLanes(request: GeneratorRequest, curveFitter: ReturnType<typeof createExactCurveFitter>,
	rejected: { construction: Construction; recipe: GeneratorResult['recipe'] }[] = []): GeneratorResult | undefined {
	if (request.mode !== 'figure' || request.style === 'corners' || request.style === 'layers' ||
		request.style === 'motifs' || request.style === 'squares' || request.style === 'board' || request.style === 'strips') return;
	const rings = normalizeContours(request.contours ?? []), size = request.frameSize ?? 70,
		sunburst = request.style === 'sunburst', open = openFrame(request),
		frame = open ?? (sunburst ? 'circle' : (request.frame ?? 'circle')),
		style = request.style === 'rays' || request.style === 'check' ? request.style
			: sunburst ? 'rays' : 'check';
	let best: GeneratorResult | undefined;
	// Lanes without a centre panel always end above and below the motif.
	// A completed construction that fails its checks stays a hard-to-cut candidate.
	const recipe = open ? 'silhouette' : 'nested';
	for (const aligned of open ? [true] : [false, true]) try {
		const inner = generateComponentLanes(rings, frame, sunburst ? size * .8 : size,
			request.scale, style, aligned, sunburst ? 2 : 0);
		const construction = sunburst ? sunburstBorder(inner, size) : inner;
		rejected.push({ construction, recipe });
		const result = improveSharedConnections(finishConstruction(request, construction, recipe, undefined, curveFitter));
		const rect = inferOverlapRect(result.design.fingers, result.design.gridSize),
			margin = intersectionMarginPx(rect, gridClearanceScale(result.design.gridSize.x, result.design.gridSize.y));
		if (findSearchIssues(result.design.fingers, margin * 1.1).size) continue;
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
		frame === 'checkered') return original;
	const lines = text.normalize('NFC').replace(/\r\n?/g, '\n').split('\n');
	const strips = 2 * Math.max(...lines.map(line => [...line].length)) + 3 * lines.length + 1;
	if (strips > Math.min(20, original.design.gridSize.x, original.design.gridSize.y)) return original;
	try {
		const shape = frame === 'woven' || frame === 'air' ? undefined : frame;
		const construction = generateTextGrid(text, font, textRoom(request), shape, { fittedCells: request.fittedCells, letterScale: request.letterScale,
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
		if (findSearchIssues(design.fingers, margin * 1.1).size) return original;
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
		if (!font || !text.trim() || frame === 'checkered') return;
		const lines = text.normalize('NFC').replace(/\r\n?/g, '\n').split('\n');
		if (2 * Math.max(...lines.map(line => [...line].length)) + 3 * lines.length + 1 > 20) return;
		const shape = frame === 'woven' || frame === 'air' ? undefined : frame;
		for (const adaptivePanels of [false, true]) recipes.push(() =>
			generateTextGrid(text, font, textRoom(request), shape, { fittedCells: request.fittedCells, letterScale: request.letterScale,
				columns: 2, slices: 3, filled: true, spread: true,
				practical: true, compound: true, guardSeams: true, adaptivePanels
			}));
	} else {
		const rings = normalizeContours(request.contours ?? []), size = request.frameSize ?? 70, scale = request.scale ?? .7;
		if (request.style === 'corners' || request.style === 'motifs' || request.style === 'squares' || request.style === 'board' || request.style === 'strips') return;
		if (request.style === 'layers') {
			recipe = 'nested';
			recipes.push(() => generateLayeredFigure(rings, size, scale,
				{ columns: 2, rows: 1, filled: true, adaptive: true }));
		} else if (request.style === 'fitted' || request.style === 'wedges' || request.style === 'silhouette') {
			recipe = 'silhouette';
			recipes.push(() => generatePanelFigure(rings, openFrame(request), size, scale,
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
	curveFitter: ReturnType<typeof createExactCurveFitter>, variants = Infinity, allRecipes = true): GeneratorResult {
	if (request.mode === 'figure') {
		const contours = normalizeContours(request.contours ?? []);
		if (!contours.length) throw new ConstructionError('empty', 'No contour');
		request = { ...request, contours };
	}
	// A quick attempt has a fallback, so it also skips text with severe pinches.
	const finish = (construction: Construction, recipe: GeneratorResult['recipe'], keep = true) => {
		try { return finishConstruction(request, construction, recipe, undefined, curveFitter, 1, !allRecipes || undefined); }
		catch (error) {
			if (!(error instanceof ConstructionError) && !(error instanceof CutGeometryError)) throw error;
			if (keep) onRejected(construction, recipe);
			throw error;
		}
	};
	if (request.mode === 'text') {
		if (!request.font) throw new ConstructionError('empty', 'No font');
		const frame = request.textFrame ?? 'woven';
		if (frame === 'checkered') {
			const text = request.text ?? '', font = request.font;
			// The first junctions usually work. When their letters leave narrow
			// paper, the next choices attach the letters at other square corners.
			// Layouts on a smaller board, through neighbouring junctions, come
			// before the next board's layouts, which follow as the fallback.
			const layouts = checkeredLayouts(text);
			const checkered = (variant: number, fill: number, cache: ReturnType<typeof checkeredGridCache>,
				mixed: ReturnType<typeof mixedCheckeredGridCache>, finish: (construction: Construction, recipe: GeneratorResult['recipe']) => GeneratorResult): GeneratorResult => {
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
						const construction = generateCheckeredGrid(text, font, fill, inset, { cache, variant, onCrowded: () => { crowded = true; } });
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
						const construction = generateCheckeredGrid(text, font, fill, bestInset, { cache, variant, optimize: true });
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
							const construction = generateCheckeredGrid(text, font, fill, inset,
								{ cache, variant, optimize: true, relieve: true });
							const candidate = finish(construction, 'letters');
							const rounded = improveSharedConnections(candidate).design, tips = cutTipCounts(rounded);
							if (fewerCutTips(tips, bestTips)) {
								const rect = inferOverlapRect(rounded.fingers, rounded.gridSize);
								const margin = intersectionMarginPx(rect, gridClearanceScale(rounded.gridSize.x, rounded.gridSize.y));
								// A smaller tip count alone can hide a new thin neck. Leave a
								// clearance reserve for the additional cuts on both sheets.
								if (!findSearchIssues(rounded.fingers, margin * 1.1).size) { best = candidate; bestTips = tips; }
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
						return finish(generateCheckeredGrid(text, font, fill, inset, { cache, variant, balanced: true }), 'letters');
					} catch (error) {
						if (!(error instanceof ConstructionError) && !(error instanceof CutGeometryError)) throw error;
						last = error;
					}
				}
				for (const inset of small ? [.35, .25] : [.35]) {
					let repaired = false;
					try {
						const construction = generateCheckeredGrid(text, font, fill, inset, {
							cache, variant, repair: true, onRepair: () => { repaired = true; }
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
				// Individual stroke ends can separate several legs that a single
				// support point leaves on the same paper. Reuse clear earlier cells.
				for (const strokeTips of [false, true]) for (const balanced of [false, true]) {
					try {
						return finish(generateMixedCheckeredGrid(text, font, { cache: mixed, previous: cache, variant, balanced, strokeTips, fill }), 'letters');
					} catch (error) {
						if (!(error instanceof ConstructionError) && !(error instanceof CutGeometryError)) throw error;
						last = error;
					}
				}
				throw last;
			};
			let last: unknown;
			// Every letter has the size of the text's widest. When no layout weaves
			// cleanly, the first may have all of them a little larger, as on the
			// regular board, before a hard-to-cut heart: narrow letters then keep
			// wider details. Only the standard size leaves its rejected cuts to
			// that fallback. A result with narrow paper tips is compared with the
			// first layout 5% larger, which can route a letter that shrank to
			// match a wider one without them (Nunito ANNA's N).
			const caches = new Map<number, [ReturnType<typeof checkeredGridCache>, ReturnType<typeof mixedCheckeredGridCache>]>();
			// Small motifs on the board have the visitor's size, which these larger
			// retries and comparisons would override, at the cost of every pattern
			// they try; typed letters have none.
			const standard = .82 * (request.letterScale ?? 1), sized = request.letterScale !== undefined;
			const attempt = (variant: number, fill: number) => {
				if (!caches.has(fill)) caches.set(fill, [checkeredGridCache(), mixedCheckeredGridCache()]);
				const [cache, mixed] = caches.get(fill)!;
				return checkered(variant, fill, cache, mixed, fill === standard ? finish
					: (construction, recipe) => finish(construction, recipe, false));
			};
			for (const fill of sized ? [standard] : [standard, standard * 1.05, standard * 1.1])
				for (let variant = 0; variant < Math.min(fill === standard ? variants : 1, layouts.length); variant++) {
					try {
						// Compared as exported, after their shared connections are improved.
						const result = improveSharedConnections(attempt(variant, fill));
						if (!sized && cutTipCounts(result.design)[1]) try {
							const larger = improveSharedConnections(attempt(0, standard * 1.05));
							if (fewerCutTips(cutTipCounts(larger.design), cutTipCounts(result.design))) return larger;
						} catch (error) {
							if (!(error instanceof ConstructionError) && !(error instanceof CutGeometryError)) throw error;
						}
						return result;
					} catch (error) {
						if (!(error instanceof ConstructionError) && !(error instanceof CutGeometryError)) throw error;
						if (error instanceof ConstructionError && ['empty', 'character'].includes(error.code)) throw error;
						last = error;
					}
				}
			throw last;
		}
		const text = request.text ?? '';
		const font = request.font;
		const shape = frame === 'woven' || frame === 'air' ? undefined : frame;
		const size = request.letterScale ?? 1;
		const recipes: Array<() => ReturnType<typeof generateTextGrid> | ReturnType<typeof generateCheckedText> | undefined> = text.includes('\n') ? [] : [
			() => generateCheckedText(text, font, textRoom(request), shape, request.fittedCells, size)
		];
		recipes.push(() => generateTextGrid(text, font, textRoom(request), shape, { fittedCells: request.fittedCells, letterScale: size }));
		// On the regular board the cells cannot grow, but a letter can be a
		// little larger inside its cell; its connections then meet it elsewhere.
		// A figure keeps the size the visitor asked for (see `frameAlternatives`).
		const regularGrid = !request.fittedCells && (frame === 'woven' || frame === 'air');
		if (regularGrid && request.letterScale === undefined) for (const letterScale of [1.05 * size, 1.1 * size]) recipes.push(text.includes('\n')
			? () => generateTextGrid(text, font, textRoom(request), shape, { letterScale })
			: () => generateCheckedText(text, font, textRoom(request), shape, false, letterScale));
		// Give difficult counters/shoulders more room, and spread the projections
		// around the frame. The requested font, frame and text are retained.
		// Text with that much room already has it, and no decorative frame. On
		// the regular board more room makes a letter smaller in its cell, so a
		// figure there keeps the size asked for instead.
		if (roomOf(textRoom(request)) < .5 && !(regularGrid && request.letterScale !== undefined))
			recipes.push(() => generateTextGrid(text, font, false, shape, { fittedCells: request.fittedCells, letterScale: request.letterScale,
				padding: .5,
				spread: true
			}));
		// A quick attempt keeps every cell square and skips the slow attachment
		// searches: panels that split letters unevenly, moved gates and bent
		// spokes follow, for fitted cells, when it fails. Square cells on the
		// regular checkerboard never take them: they would make uneven squares.
		const fittedOnly = new Set<(typeof recipes)[number]>();
		for (const [columns, slices] of [[2, 1], [1, 2], [2, 2], [1, 3]]) {
			const recipe = () => generateTextGrid(text, font, textRoom(request), shape, { fittedCells: request.fittedCells, letterScale: request.letterScale, columns, slices, spread: true });
			recipes.push(recipe);
			if (columns !== slices) fittedOnly.add(recipe);
		}
		let usedCompound = false;
		let crowded = false;
		recipes.push(() => generateTextGrid(text, font, textRoom(request), shape, { fittedCells: request.fittedCells, letterScale: request.letterScale,
			spread: true, practical: true, compound: true, onCompound: () => { usedCompound = true; }, onCrowded: () => { crowded = true; }
		}));
		// A locally improved route can still conflict with a neighbouring cell.
		// Retain the established recipe, but only rerun it if a chord changed.
		recipes.push(() => usedCompound
			? generateTextGrid(text, font, textRoom(request), shape, { fittedCells: request.fittedCells, letterScale: request.letterScale, spread: true, practical: true, onCrowded: () => { crowded = true; } })
			: undefined);
		recipes.push(() => crowded ? generateTextGrid(text, font, textRoom(request), shape, { fittedCells: request.fittedCells, letterScale: request.letterScale,
			spread: true, practical: true, compound: true, balanced: true
		}) : undefined);
		let gateCrowded = false;
		const adaptGates = (balanced = false) => {
			let moved = false;
			const result = generateTextGrid(text, font, textRoom(request), shape, { fittedCells: request.fittedCells, letterScale: request.letterScale,
				spread: true, practical: true, compound: true, balanced, adaptGates: true,
				onGateChange: () => { moved = true; }, onCrowded: () => { gateCrowded = true; }
			});
			// The unchanged recipe has already failed its full-sheet check.
			return moved ? result : undefined;
		};
		const searches = [() => adaptGates(), () => gateCrowded ? adaptGates(true) : undefined];
		recipes.push(...searches);
		for (const search of searches) fittedOnly.add(search);
		for (const columns of [1, 2]) recipes.push(() => {
			if (!allRecipes || regularGrid) return undefined;
			let moved = false;
			const result = generateTextGrid(text, font, textRoom(request), shape, { fittedCells: request.fittedCells, letterScale: request.letterScale,
				columns, slices: 3, spread: true, filled: true, onSeamChange: () => { moved = true; }
			});
			// The one-column layout was already tried with centred contacts.
			return columns > 1 || moved ? result : undefined;
		});
		// A deeper grid divides the ink itself, retaining the ordinary margin
		// outside it. Count the resulting strips before attempting construction.
		const lines = text.normalize('NFC').replace(/\r\n?/g, '\n').split('\n'),
			letters = Math.max(...lines.map(line => [...line].length));
		if (2 * letters + 5 * lines.length + 1 <= 20 && allRecipes && !regularGrid)
			recipes.push(() => generateTextGrid(text, font, textRoom(request), shape, { fittedCells: request.fittedCells, letterScale: request.letterScale,
				columns: 2, slices: 5, spread: true, filled: true, inkPanels: true
			}));
		// A serif can need a more square approach than a straight shared spoke.
		// Try bent connections only after the established constructions fail.
		for (const padding of roomOf(textRoom(request)) >= .5 ? [undefined] : [undefined, .5]) {
			let bentCrowded = false;
			for (const balanced of [false, true]) {
				const bent = () => !balanced || bentCrowded
					? generateTextGrid(text, font, textRoom(request), shape, { fittedCells: request.fittedCells, letterScale: request.letterScale,
						padding, spread: true, practical: true, compound: true, adaptGates: true,
						bentSpokes: true, balanced, onCrowded: () => { bentCrowded = true; }
					}) : undefined;
				recipes.push(bent);
				fittedOnly.add(bent);
			}
		}
		let last: unknown;
		for (const construct of allRecipes && !regularGrid ? recipes : recipes.filter(recipe => !fittedOnly.has(recipe))) {
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
	if (request.style === 'board') {
		// The circle on a regular board of five strips, every square outside it
		// equally large, at the radii the board allows (`BOARD_RADII`). Up to the
		// circle touching the outer ring of squares, the outer lines cross the
		// paper whole or follow the circle, and the undivided motif meets the
		// middle lines like a letter in the circle frame. Reaching into the outer
		// ring, like the gallery's santa, the circle meets every line, and the
		// motif, divided like a letter into four panels, meets the lines' ends in
		// pairs. The panels meet at its centre, or else at a point of background
		// near it, so their seams cross its paper but not each other.
		const contours = request.contours ?? [];
		const font: Font = { glyphs: { [MOTIF]: { advance: 1, contours } } };
		const xs = contours.flat().map(p => p[0]), ys = contours.flat().map(p => p[1]);
		const centre: Point = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
		const box = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
		const reach = Math.max(...contours.flat().map(p => distance(p, centre))) / box;
		const gap = request.gap ?? 3, compound = { practical: true, compound: true };
		// The size setting sizes the circle (see `boardRadius`); the motif fills
		// the circle up to the space asked for.
		const [small, large] = BOARD_RADII, { radius, range } = boardRadius(request.scale ?? .7);
		// The slower compound routing only where the panels meet at the centre.
		const four = [{ columns: 2, slices: 2 }, { ...compound, columns: 2, slices: 2 },
			...backgroundJunctions(contours).map((p): Point => [p[0] - centre[0], p[1] - centre[1]])
				.map(junction => ({ columns: 2, slices: 2, junction }))];
		const layouts = (range: readonly [number, number]) => range === small ? [{}, compound] : four;
		const fills = (radius: number, factor = 1) => (radius - Math.max(gap, 1.5)) * factor / reach / box;
		// Only the invisible partition varies: where four panels meet, the
		// routing, and the padding of the motif's cell, which gives its
		// connections room: the usual, else little. (Gates the circle passes
		// inside of move in, see `generateTextGrid`.)
		const sizes = (range: readonly [number, number], radius: number, scale = fills(radius)) =>
			[.22, .05].flatMap(padding =>
				layouts(range).map(layout => ({ radius, scale, layout: { padding, ...layout } })));
		const build = ({ radius, scale, layout }: ReturnType<typeof sizes>[number]) => {
			const construction = generateTextGrid(MOTIF, font, false, 'circle', { ...layout, board: 5, circle: 2 * radius, scale });
			audit(construction.edges);
			return construction;
		};
		// Whether the motif can be built this way at all is decided once, at
		// sizes of the range's own: one that cannot be kept whole, or divided in
		// four at both, takes the other construction at its size nearest the
		// touching circle, whatever the slider.
		const buildable = (range: readonly [number, number]) => (range === small ? [25] : [34, 39])
			.every(reference => sizes(range, reference).some(attempt => {
				try {
					build(attempt);
					return true;
				} catch (error) {
					if (!(error instanceof ConstructionError)) throw error;
					return false;
				}
			}));
		const [mode, size] = buildable(range) ? [range, radius] : range === small ? [large, large[0] + .6] : [small, small[1]];
		// The size setting the other construction's circle stands for.
		const kept = (result: GeneratorResult): GeneratorResult => mode === range ? result : { ...result,
			scale: mode === small ? .45 + (size - small[0]) / (small[1] - small[0]) * .25 : .7 + (size - large[0]) / (large[1] - large[0]) * .15 };
		// The circle and the motif keep the sizes the setting gives them, so
		// both only grow with it: cut cleanly if they can be, else as hard to
		// cut. Only where nothing at all can be finished at those sizes does the
		// motif shrink a little, and then the circle grow a little.
		const nearby = [size + 1.5, size + 3].map(other => Math.min(mode[1], other))
			.filter(other => other - size > .5 && Math.abs(other - 30) > .1);
		let last: unknown;
		for (const attempts of [sizes(mode, size), [.85, .7].flatMap(factor => sizes(mode, size, fills(size, factor))),
			nearby.flatMap(other => sizes(mode, other))]) {
			const rejected: Parameters<typeof hardToCutResult>[1] = [];
			for (const attempt of attempts) try {
				const construction = build(attempt);
				rejected.push({ construction, recipe: 'nested' });
				return kept(finish(construction, 'nested'));
			} catch (error) {
				if (!(error instanceof ConstructionError) && !(error instanceof CutGeometryError)) throw error;
				last = error;
			}
			const hard = hardToCutResult(request, rejected, curveFitter);
			if (hard) return kept(hard);
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
				const result = generateCornerChecks(request.contours ?? [], request.frameSize, request.scale, routing, fitBorder, bentSpokes,
					undefined, undefined, request.gap);
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
	const open = openFrame(request);
	if (open) {
		const single = (symmetric: boolean) => {
			for (const route of [fourPortMotif, originalFourPortMotif]) {
				let constructed = false;
				try {
					const result = generateFittedFigure(request.contours ?? [], request.frameSize, request.scale, route,
						undefined, 0, open, symmetric);
					constructed = true;
					return finish(result, 'silhouette');
				}
				catch (error) {
					if (!(error instanceof ConstructionError) && !(error instanceof CutGeometryError)) throw error;
					if (!constructed && !(error instanceof CompilationError)) break;
				}
			}
		};
		// Symmetric gates come first, kept only without needle-sharp paper.
		// Otherwise every construction uses the motif's own extreme points.
		const balanced = single(true);
		if (balanced && !cutTipCounts(balanced.design)[0]) return balanced;
		const extreme = single(false);
		if (extreme) return extreme;
		for (const [columns, rows] of [[2, 1], [2, 2], [3, 1], [3, 2], [3, 3], [4, 2]]) {
			try {
				return finish(generatePanelFigure(request.contours ?? [], open, request.frameSize ?? 70, request.scale ?? .7, columns, 'check', rows), 'silhouette');
			} catch (error) {
				if (!(error instanceof ConstructionError) && !(error instanceof CutGeometryError)) throw error;
			}
		}
		try {
			return finish(generatePanelFigure(request.contours ?? [], open, request.frameSize ?? 70, request.scale ?? .7, 3, 'check', 1, false, fourPortMotif, 'support', true), 'silhouette');
		} catch (error) {
			if (!(error instanceof ConstructionError) && !(error instanceof CutGeometryError)) throw error;
			for (const columns of [2, 3, 4] as const) {
				try {
					return finish(generateComponentFigure(request.contours ?? [], open, request.frameSize,
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
			: ((request.style as 'rays' | 'check') ?? 'rays');
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
