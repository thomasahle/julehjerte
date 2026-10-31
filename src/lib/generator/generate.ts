import { createExactCurveFitter } from '$lib/inverse/curveFitCache';
import { simplifyCubicChain } from '$lib/inverse/simplifyCurves';
import { generateLayeredFigure } from './layers';
import { CORNER_GAP, generateCornerChecks, hasThreeCounterLanes } from './cornerChecks';
import { generateFittedFigure, mirrorSymmetric, type GateTies } from './fitted';
import { sunburstBorder } from './sunburst';
import { generateTextGrid, roomOf, squareCellScale } from './textGrid';
import { NO_WHOLE_STRIPS, STRIPS, crowdedHiddenCutsSetAside, slidePlace, stripFigures, withCrowdedHiddenCuts } from './stripFigure';
import { BOARD_STRIPS, MOTIF, boardPlacement, boardRadius, boardScale, boardSetting, boardSteps, enclosedAlong, motifChoices, squareChoices, type BoardStyle } from './boardMotif';
import { TEXT_LAST_STRIPS, TEXT_STRIPS, isTextFigure, textFigureRequest } from './textFigure';
import { CIRCLE_STYLES, fillSquare, fitCircle, withNarrowCrown, crowdsCrown } from './frameFit';
import { isTopology, outlineFor, recipeConstruction, recipesAt, type Recipe, type TopologyRecipe } from './recipes';
import { FALLBACK_WORK, MIRROR_NEAR, hiddenCuts, motifFit, movedEnd, nestingOf, topologyConstruction } from './topologyRecipes';
import { blobsOf, carryTopology } from './topologyTransfer';
import { alongEdge, boardOutline } from './boardOutline';
import { picture, type Known } from './picture';
export { fillSquare, fitCircle } from './frameFit';
import { generateBranchedText, hasOverlappingTextBranches, fittedBranchedTextFill } from './branchedText';
import { CORNER_INSETS, generateCheckeredGrid, checkeredGridCache, checkeredLayouts, printCornerInsets } from './checkeredGrid';
import { generateMixedCheckeredGrid, mixedCheckeredGridCache } from './mixedCheckeredGrid';
import { betterCuts, cutMeasures, cutTipCounts, cutTipPoints, fewerCutTips } from './cutQuality';
import { trickyLetters } from './trickyLetters';
import { normalizeContours, withoutSpurs } from './contours';
import { gridClearance, gridClearanceScale } from '$lib/geometry/clearance';
import { generatePanelFigure, backgroundJunctions, squareJunctions } from './panels';
import { generateComponentFigure } from './components';
import { generateComponentLanes } from './componentLanes';
import { rerouteSharedCuts, rerouteFrameCuts } from './sharedCuts';
import { curveSharedCuts, curveSharpSharedTips } from './curvedCuts';
import {
	convertValidatedCutGeometry,
	CutGeometryError,
	type CutGeometry
} from '$lib/inverse/toHeartDesign';
import type { HeartColors, HeartDesign, Vec } from '$lib/types/heart';
import { inferOverlapRect } from '$lib/utils/overlapRect';
import { lobesShareTemplate, mapPointBetweenLobes } from '$lib/utils/symmetry';
import { paperFaults, PAPER_NECK_MM, PRINT_WIDTH_MM, type WeakPiece } from '$lib/geometry/paperNecks';
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
	spreadPorts,
	near,
	fourPortMotif,
	nestedFourPortMotif,
	originalFourPortMotif,
	balancedFourPortMotif,
	bentFourPortMotif,
	touchingFourPortMotif,
	withVisibleIslands,
	visibleIslandsSetAside,
	withExactArcs,
	arcSlipsSeen,
	withNearestIslands,
	islandsAtExtremesSeen,
	islandPortsSince,
	forgetIslandPorts,
	hasCounterContact,
	generateCheckedText,
	inside,
	distance,
	mix,
	sub,
	dot,
	cross,
	frameRing,
	boardFill,
	boardLines,
	boardPanels,
	boardRangeLines,
	boardRangePattern,
	boardRanges,
	boardWholeFill,
	boardWholePattern,
	boardWholeRadius,
	type Ring,
	type Frame,
	type FigureStyle,
	type OpenFrame,
	FITTED,
	WEDGES,
	SILHOUETTE,
	textPanel,
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
	/** The sunburst's circle as a share of its frame, four fifths unless its
	 * crown narrows (see `fitCircle`). */
	crown?: number;
	/** Hidden cuts found once for the motif's pictures (see `recipes`). */
	recipes?: readonly Recipe[];
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
	/** On a board circle over the corner squares: whether the motif sits on
	 * its smallest enclosing circle's centre rather than its box's. */
	enclosed?: boolean;
	/** On a board circle past the touching circle: the motif is kept whole,
	 * as it cannot be divided in four, the circle keeping the colour it has
	 * below (see `generate`). */
	whole?: boolean;
	/** On a board circle that covers the board's middle lines whole: the
	 * strips its squares show, the heart leaving those lines out (see
	 * `boardRanges`). */
	board?: number;
};
/** Symmetric gates for a motif that is its own mirror image, after its own
 * (see `fittedGates`): those on the heart's middle further out or meeting the
 * motif on the middle itself, those beside it on the upper of two tied tips
 * rather than between them, then turned alike, towards or away from the
 * middle. */
type SymmetricGates = { ties?: GateTies; angles?: [number, number, number, number]; axisGap?: number; onMiddle?: boolean };
const SYMMETRIC_GATES: SymmetricGates[] = [
	{ axisGap: 2 }, { axisGap: 4 }, { onMiddle: true }, { ties: 'mirror' }, { ties: 'mirror', axisGap: 3 },
	...[.15, -.15, .3, -.3].flatMap(turn => (['mirror', true] as const).map(ties => ({ ties, angles: [0, turn, 0, -turn] as [number, number, number, number] })))
];
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
const CUTS_CROSS = 'Cut paths intersect';
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
				throw new ConstructionError('topology', CUTS_CROSS);
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
	/** The strips it has where a circle on the chosen board covers its
	 * middle lines whole and leaves them out (see `boardRanges`). */
	strips?: number;
};

/** The whole sheet, the domain of a picture that fills it (a board's). */
const SHEET: Ring = [[0, 0], [100, 0], [100, 100], [0, 100]];

/** A figure's request with its motif's hairline spurs gone, as the generator
 * draws it (see `withoutSpurs`). */
export const spurless = (request: GeneratorRequest): GeneratorRequest =>
	request.mode === 'figure' && !request.font && request.contours ? { ...request, contours: withoutSpurs(request.contours) } : request;

/** The hearts stored recipes draw on the request's picture, where they fit
 * its outline and cut cleanly (see `recipes`), up to `count`: a motif's own
 * on the picture it was solved on, the generator's own as it told it; with
 * `topology`, a topology's on the picture `known` tells (the generator's own
 * heart's, see `fromTopology`), its motif's hairline spurs gone as the
 * generator draws it: each placed straight first, then on a board those that
 * drew no heart so going round the motif (see `topologyConstruction`), so
 * that one drawn only so takes no place another drew straight (in the rays,
 * over ten motifs at every sixth size, going round drew no better heart and
 * made the wreath's 4 s slower). A board's heart says what its picture shows as the
 * board circle's own does: the motif on its enclosing circle over the corner
 * squares, and the strips where it leaves the middle lines out. */
export const storedHearts = (request: GeneratorRequest, recipes = request.recipes, topology = false, count = 1, known: Known = {}): GeneratorResult[] =>
	storedDrawings(request, recipes, topology, count, known).map(drawn => drawn.heart);

/** A stored recipe's heart (see `storedHearts`): the topology recipe it drew
 * (`of`), whether its places were found straight, and where they fell (see
 * `topologyConstruction`). */
type Drawing = { heart: GeneratorResult; of?: TopologyRecipe; straight: boolean; places?: Point[][] };

/** A construction a stored recipe drew, finished as the page shows its heart. */
function finishedStored(request: GeneratorRequest, construction: ReturnType<typeof recipeConstruction>, strips: number | undefined): GeneratorResult {
	const heart = finishConstruction(request, { ...construction, ...request.style === 'board' ? { domain: [SHEET] } : {} }, 'nested');
	return request.style === 'board' ? { ...heart, enclosed: true, ...heart.design.gridSize.x !== strips && { board: strips } } : heart;
}

/** See `storedHearts`. */
function storedDrawings(request: GeneratorRequest, recipes = request.recipes, topology = false, count = 1, known: Known = {}): Drawing[] {
	if (request.mode !== 'figure' || !recipes?.length) return [];
	// The board the generator builds: the board circle's five strips where the visitor chose none.
	const strips = request.style === 'board' ? request.board ?? BOARD_STRIPS.board.initial : request.board;
	const hearts: Drawing[] = [], listed = recipesAt(recipes, request.style ?? 'rays', strips, request.scale ?? .7, request.gap ?? 3);
	// Each construction, and the recipe it draws where a later one may draw it again.
	const constructions: { construct: () => (ReturnType<typeof recipeConstruction> & { places?: Point[][] }) | undefined; of?: TopologyRecipe; straight?: boolean }[] = [], drew = new Set<TopologyRecipe>();
	if (topology) {
		const shown = picture(spurless(request), known);
		if (!shown?.rings.length || shown.motif === undefined) return [];
		// Those listed at this size, and a pair's (see `frame`) carried to this
		// board's outline wherever the picture is of its pair.
		const board = shown.rings.slice(0, shown.motif), nesting = nestingOf(shown.rings.slice(shown.motif));
		const framed = recipes.filter((r): r is TopologyRecipe => isTopology(r) && !!r.frame && r.style === request.style && r.motif === nesting);
		const blobs = framed.length ? blobsOf(board).sig : undefined;
		const carried = framed.filter(r => r.frame!.blobs === blobs).map(r => carryTopology(r, r.frame!, board)).filter((r): r is TopologyRecipe => !!r);
		const mine = [...listed.filter(isTopology), ...carried];
		if (!mine.length) return [];
		const o = boardOutline(board);
		// A topology's recipe solved on this very motif (its places lie on its
		// outline) first, the one solved for this size first of those: it draws
		// the solve itself.
		const step = Math.round((request.scale ?? .7) * 100);
		const own = mine.filter(recipe => motifFit(recipe, shown) < SOLVED_ON)
			.sort((a, b) => Number(!a.solved?.includes(step)) - Number(!b.solved?.includes(step)));
		const ordered = [...own, ...mine.filter(recipe => !own.includes(recipe))];
		for (const recipe of ordered) constructions.push({ construct: () => topologyConstruction(recipe, shown, o, false), of: recipe, straight: true });
		// Those going round the motif share one allowance of work (FALLBACK_WORK).
		const work = { left: FALLBACK_WORK };
		if (request.style === 'board') for (const recipe of ordered) constructions.push({ construct: () => drew.has(recipe) ? undefined : topologyConstruction(recipe, shown, o, 'only', work), of: recipe });
	} else for (const recipe of listed) if (!isTopology(recipe)) constructions.push({ construct: () => {
		const shown = picture(request, recipe.known), o = shown?.rings.length ? outlineFor(recipe, shown) : undefined;
		return o && recipeConstruction(recipe, o);
	} });
	for (const { construct, of, straight } of constructions) {
		try {
			const construction = construct();
			if (!construction) continue;
			hearts.push({ heart: finishedStored(request, construction, strips), of, straight: !!straight, places: construction.places });
			if (of) drew.add(of);
			if (hearts.length >= count) break;
		} catch (error) {
			if (!(error instanceof ConstructionError) && !(error instanceof CutGeometryError)) throw error;
		}
	}
	return hearts;
}

/** The heart a motif's own stored recipe draws on the request's picture, where
 * one fits its outline and cuts cleanly (see `recipes`). */
export const fromStoredRecipe = (request: GeneratorRequest, recipes = request.recipes): GeneratorResult | undefined => storedHearts(request, recipes)[0];

/** How many of its topology's stored recipes a heart is drawn with, the best
 * kept (see `fromTopology`). */
const TOPOLOGY_TRIES = 3;
/** How near its outline, as a share of its size, a recipe's places lie on the
 * motif it was solved on (see `motifFit`). */
const SOLVED_ON = .005;

/** The best heart its topology's stored recipes draw where one held on this
 * very motif is drawn at a size it was solved for (`solved`): topology.mjs
 * lists it there only where it beats the generator's own heart, and so does
 * any that beats it, so the page draws them without making that one (the
 * wreath's in the rays takes twenty seconds), with the next `TOPOLOGY_TRIES`
 * less one compared (see `fromTopology`); off a board, whose circle that
 * heart tells the picture. */
function fromSolve(request: GeneratorRequest): GeneratorResult | undefined {
	const step = Math.round((request.scale ?? .7) * 100), shown = request.style === 'board' ? undefined : picture(spurless(request), {});
	if (shown?.motif === undefined) return;
	const recipes = request.recipes?.filter(isTopology) ?? [], solved = recipes.filter(recipe => recipe.solved?.includes(step) && motifFit(recipe, shown) < SOLVED_ON);
	const [held] = solved.length ? storedHearts(request, solved, true) : [];
	if (!held || held.hardToCut) return;
	const others = storedHearts(request, recipes.filter(recipe => !solved.includes(recipe)), true, TOPOLOGY_TRIES - 1).filter(heart => !heart.hardToCut);
	const measured = [held, ...others].map(heart => ({ heart, m: cutMeasures(heart.design, shown.rings) }));
	return improveSharedConnections(measured.reduce((a, b) => betterCuts(b.m, a.m) ? b : a).heart, true);
}

/** What the generator's own heart tells its picture (see `Known`), as the page
 * takes it at the size `asked`. */
export const knownOf = (own: GeneratorResult, asked: number): Known => ({
	place: own.place, board: own.board ?? own.design.gridSize.x,
	circle: own.scale !== undefined ? own.scale < asked ? own.scale : 'large' : undefined,
	enclosed: asked > .85 ? !!own.enclosed : undefined, whole: asked > .7 ? !!own.whole : undefined
});

/** The best heart its topology's stored recipes draw (see `recipes`) on the
 * picture of the generator's own heart `own` (the motif kept whole, or on a
 * larger circle, where it keeps one), the first `TOPOLOGY_TRIES` that cut
 * cleanly compared, where it is better than `own` (see `betterCuts`), or
 * that is hard to cut, or there is none. It tells the page the picture as
 * `own` does. */
export function fromTopology(request: GeneratorRequest, own?: GeneratorResult): GeneratorResult | undefined {
	const known = own ? knownOf(own, request.scale ?? .7) : {};
	const drawn = storedDrawings(request, request.recipes, true, TOPOLOGY_TRIES, known).filter(({ heart }) => !heart.hardToCut);
	if (!drawn.length) return;
	const shown = picture(spurless(request), known)!, rings = shown.rings, measure = (heart: GeneratorResult) => cutMeasures(heart.design, rings);
	const first = drawn.map(d => ({ ...d, m: measure(d.heart) })).reduce((a, b) => betterCuts(b.m, a.m) ? b : a);
	// Refining compares hearts before their connections are bent, which may
	// rank them otherwise: the refined heart is kept only if still better bent.
	const best = refined(request, first, shown).heart, unbent = best === first.heart ? [best] : [first.heart, best];
	const heart = unbent.map(heart => improveSharedConnections(heart, true)).reduce((a, b) => betterCuts(measure(b), measure(a)) ? b : a);
	if (!own) return heart;
	const told = { ...heart, scale: own.scale, enclosed: own.enclosed, whole: own.whole, board: own.board ?? heart.board };
	return own.hardToCut || betterCuts(measure(heart), measure(own)) ? told : undefined;
}

/** How many hearts refining a recipe's heart draws at most (see `refined`). */
const REFINE_DRAWS = 12;
/** The moves, in the sheet's units along its edge, a hidden cut's board end
 * makes in refining, and how near a place the paper may tear the cut ends or
 * runs to be moved. */
const REFINE_STEPS = [1.5, -1.5, 3, -3], REFINE_NEAR = 10;

/** Where a heart's paper may tear (see `paperFaults`), in its picture's units. */
function weakPoints(design: HeartDesign): Point[] {
	const where: WeakPiece[] = [], rect = inferOverlapRect(design.fingers, design.gridSize);
	paperFaults(design, { where });
	return where.map(({ x, y }): Point => [(x - rect.left) / rect.width * 100, (y - rect.top) / rect.height * 100]);
}

/** A board heart a topology recipe drew straight, refined: while its paper
 * may tear, an end of the hidden cut nearest where is moved a step along its
 * edge of the board (see `movedEnd`) or its ring of the motif, its mirror
 * image's too where the lobes share a template, then those of the next
 * nearest, and the first move whose heart has better cuts is kept (see
 * `betterCuts`), up to REFINE_DRAWS hearts drawn. One recipe for a topology
 * so fits each motif and size of it, its cuts' ends taken from another
 * motif's solve leaving a sliver of paper by a line, the paper's edge or the
 * motif. */
function refined<T extends Drawing & { m: number[] }>(request: GeneratorRequest, drawn: T, shown: { rings: Ring[]; motif?: number }): T {
	if (request.style !== 'board' || !drawn.of || !drawn.straight || !drawn.places || !drawn.m[0] || shown.motif === undefined) return drawn;
	const o = boardOutline(shown.rings.slice(0, shown.motif)), strips = request.board ?? BOARD_STRIPS.board.initial;
	const draw = (recipe: TopologyRecipe, moves: Map<string, number>) => {
		try {
			const construction = topologyConstruction(recipe, shown, o, false, undefined, moves);
			if (!construction) return;
			const heart = finishedStored(request, construction, strips);
			return heart.hardToCut ? undefined : { heart, places: construction.places, m: cutMeasures(heart.design, shown.rings) };
		} catch (error) {
			if (!(error instanceof ConstructionError) && !(error instanceof CutGeometryError)) throw error;
		}
	};
	type End = { e: number; t: number } | { m: number; i: number };
	let best = { ...drawn, places: drawn.places, moves: new Map<string, number>() }, draws = 0;
	// A point `by` units along an edge from `t` of the way along it; where an end lies.
	const edgeAt = (e: number, t: number, by = 0) => alongEdge(o.edges[e], t + by / o.edges[e].cum[o.edges[e].cum.length - 1]);
	const at = (end: End): Point => 'e' in end ? edgeAt(end.e, end.t) : best.places[end.m][end.i];
	const near = (p: Point, q: Point) => Math.hypot(p[0] - q[0], p[1] - q[1]) < MIRROR_NEAR;
	// The recipe and the places' moves with an end moved `by` along its edge or ring.
	const move = (step: { recipe: TopologyRecipe; moves: Map<string, number> } | undefined, end: End, by: number) => {
		if (!step) return;
		if ('m' in end) {
			const key = `${end.m},${end.i}`;
			return { recipe: step.recipe, moves: new Map(step.moves).set(key, (step.moves.get(key) ?? 0) + by) };
		}
		const recipe = movedEnd(step.recipe, o, end.e, end.t, by);
		return recipe && { recipe, moves: step.moves };
	};
	while (best.m[0] && draws < REFINE_DRAWS) {
		const weak = weakPoints(best.heart.design), cuts = hiddenCuts(best.of!, o, best.places);
		const ends = cuts.flatMap(cut => cut.ends);
		const mirror = (end: End) => {
			const p = at(end), q: Point = [p[1], p[0]];
			return near(p, q) ? null : ends.find(other => near(at(other), q));
		};
		const shared = !best.m[1];
		const nearest = cuts.map(cut => ({ ...cut, d: Math.min(...weak.map(w => pointDistance(w, cut.a, cut.b))) }))
			.filter(cut => cut.d < REFINE_NEAR).sort((a, b) => a.d - b.d);
		let better: typeof best | undefined;
		search: for (const cut of nearest) for (const end of cut.ends) {
			const partner = shared ? mirror(end) : undefined;
			// One a lobe's template shares with the other's moves with its image or not at all.
			if (shared && !partner) continue;
			for (const by of REFINE_STEPS) {
				let step = move({ recipe: best.of!, moves: best.moves }, end, by);
				// Its image the mirrored way: along its edge as it goes, round a ring against its order.
				if (partner && step) {
					let sign = -1;
					if ('e' in end && 'e' in partner) {
						const p = edgeAt(end.e, end.t, by), off = (k: number) => { const q = edgeAt(partner.e, partner.t, k * by); return Math.hypot(q[0] - p[1], q[1] - p[0]); };
						sign = off(1) < off(-1) ? 1 : -1;
					}
					step = move(step, partner, sign * by);
				}
				if (!step) continue;
				if (draws++ >= REFINE_DRAWS) break search;
				const next = draw(step.recipe, step.moves);
				if (next && betterCuts(next.m, best.m)) { better = { ...best, ...next, of: step.recipe, moves: step.moves }; break search; }
			}
		}
		if (!better) break;
		best = better;
	}
	return best;
}

function finishConstruction(request: GeneratorRequest, r: Construction, recipe: GeneratorResult['recipe'],
	geometry = r.geometry, curveFitter?: ReturnType<typeof createExactCurveFitter>, spacing = 1): GeneratorResult {
	const curved = geometry !== r.geometry;
	if (request.board && r.geometry.A_overlap_paths.length + 1 !== (r.strips ?? request.board))
		throw new ConstructionError('topology', 'Not the board the default size chose');
	// The polygon prechecks describe the original straight cuts. A curved retry
	// is checked on its actual cubics by the complete converter below.
	if (!curved) audit(r.edges);
	const resolutionScale = gridClearanceScale(
		r.geometry.A_overlap_paths.length + 1,
		r.geometry.B_overlap_paths.length + 1
	), clearanceScale = resolutionScale * spacing;
	// Avoid expensive curve fitting when cuts already leave a severe sliver,
	// which no fit can widen (a text's cut doubling back past a letter's
	// stroke: Anna in Nunito's first layout, three fits and 650 ms to refuse).
	if (!curved && spacing === 1 && hasSeverePinch(r.geometry, clearanceScale))
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
	if (!curved && spacing === 1) madeFrom.set(design, { request, construction: r, curveFitter });
	if (!curved) builtFrom.set(design, r);
	return { design, recipe };
}

/** What each clean design was finished from, to make it again with its
 * hidden cuts moved (see `withSpreadPorts`). */
const madeFrom = new WeakMap<HeartDesign, { request: GeneratorRequest; construction: Construction; curveFitter?: ReturnType<typeof createExactCurveFitter> }>();

/** The straight cuts each heart was finished from, hard to cut or not, before
 * their curves were fitted: its edges and its own copy of the motif (see
 * `constructionOf`). */
const builtFrom = new WeakMap<HeartDesign, Construction>();

/** The cuts a heart was built from, as edges on its motif's rings and the
 * board's lines: to store a heart of the generator's as a recipe
 * (scripts/generator/recipes.mjs). None for a heart whose shared cuts were
 * curved to build it. */
export const constructionOf = (design: HeartDesign): Construction | undefined => builtFrom.get(design);

/** Improve only the selected construction, once. Shared curves meet the artwork
 * across its outline rather than forming a narrow point along it. Keep the
 * original whenever bending fails full-sheet checks or does not improve the
 * actual exported cuts: all at once, else tip by tip (a polar star in the
 * rays from twelve sharp tips to six). Visible outlines, strip count and
 * connections stay fixed. With `keepTemplate`, lobes sharing one template
 * (see `lobesShareTemplate`) go on sharing it: each tip is bent with its
 * mirror image in the other lobe. */
function improveSharedConnections(result: GeneratorResult, keepTemplate = false): GeneratorResult {
	const shared = keepTemplate && lobesShareTemplate(result.design.fingers, result.design.gridSize);
	const rect = inferOverlapRect(result.design.fingers, result.design.gridSize);
	const design = bentWhere(result.design, design => !findSearchIssues(design.fingers, intersectionMarginPx(
		inferOverlapRect(design.fingers, design.gridSize), gridClearanceScale(design.gridSize.x, design.gridSize.y))).size &&
		(!shared || lobesShareTemplate(design.fingers, design.gridSize)),
	shared ? p => mapPointBetweenLobes({ minX: rect.left, minY: rect.top, size: rect.width }, p) : undefined);
	// Endpoints, visible curves and strip connections are unchanged. Each moved
	// curve is still exactly coincident on both sheets, preserving the weave.
	const made = design && madeFrom.get(result.design);
	if (made) madeFrom.set(design, made);
	const built = design && builtFrom.get(result.design);
	if (built) builtFrom.set(design, built);
	return design ? { ...result, design } : result;
}

/** A figure hard to cut, bent at its sharp tips of paper as a clean one is
 * (see `improveSharedConnections`) where that leaves its narrowest paper no
 * narrower and brings no other cut too near: all at once, else tip by tip.
 * Still hard to cut, with fewer sharp tips (a hedgehog in the checks at 70%
 * from four needles to none; a nisse on seven strips at 80% from five to
 * one). */
function improveHardConnections(result: GeneratorResult): GeneratorResult {
	const original = result.design, full = intersectionMarginPx(inferOverlapRect(original.fingers, original.gridSize),
		gridClearanceScale(original.gridSize.x, original.gridSize.y));
	// The narrowest paper, as a fraction of the clearance, to a 64th: below
	// that a bend is not measured, so not made.
	let low = 0, high = 1;
	for (let step = 0; step < 6; step++) {
		const middle = (low + high) / 2;
		if (findSearchIssues(original.fingers, full * middle, full).size) high = middle;
		else low = middle;
	}
	if (!low) return result;
	const flagged = findSearchIssues(original.fingers, full);
	const design = bentWhere(original, design => !findSearchIssues(design.fingers, full * low, full).size &&
		![...findSearchIssues(design.fingers, full)].some(id => !flagged.has(id)));
	const built = design && builtFrom.get(original);
	if (built) builtFrom.set(design, built);
	return design ? { ...result, design } : result;
}

/** How near (in the design's pixels) a sharp tip lies to another's mirror
 * image in the other lobe to be bent with it (see `bentWhere`), as near as
 * lobes sharing a template may differ (see `lobesShareTemplate`). */
const MIRROR_TIP = 5;

/** The design bent at its sharp tips of paper where `kept` keeps it: all at
 * once, else tip by tip, each kept bend building on the last; a tip with its
 * mirror image in the other lobe where `mirror` maps one lobe to the other. */
function bentWhere(original: HeartDesign, kept: (design: HeartDesign) => boolean, mirror?: (p: Vec) => Vec): HeartDesign | undefined {
	const all = bentAtTips(original);
	if (all && kept(all)) return all;
	let design = original;
	for (const tip of cutTipPoints(original)) {
		const twin = mirror?.(tip);
		const bent = bentAtTips(design, point => Math.hypot(point.x - tip.x, point.y - tip.y) < 1e-7 ||
			!!twin && Math.hypot(point.x - twin.x, point.y - twin.y) < MIRROR_TIP);
		if (bent && kept(bent)) design = bent;
	}
	return design === original ? undefined : design;
}

/** The design bent at its sharp tips of paper (those `only` keeps), where that
 * leaves fewer and every point on the sheet. */
function bentAtTips(original: HeartDesign, only?: (point: { x: number; y: number }) => boolean): HeartDesign | undefined {
	const design = curveSharpSharedTips(original, only);
	if (!design || !fewerCutTips(cutTipCounts(design), cutTipCounts(original))) return;
	const rect = inferOverlapRect(design.fingers, design.gridSize);
	for (const finger of design.fingers) for (const segment of finger.segments)
		for (const p of [segment.p0, segment.p1, segment.p2, segment.p3])
			if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || p.x < rect.left || p.x > rect.right ||
				p.y < rect.top || p.y > rect.bottom) return;
	return design;
}

const tearing = new WeakMap<HeartDesign, number>();

/** How many pieces tear off the heart's templates printed at the download's
 * default width, or come loose ($lib/geometry/paperNecks). */
function paperTears(design: HeartDesign): number {
	let tears = tearing.get(design);
	if (tears === undefined) {
		const { weak, loose } = paperFaults(design);
		tearing.set(design, tears = weak + loose);
	}
	return tears;
}

const exportedResults = new WeakMap<GeneratorResult, GeneratorResult>();

/** The result as exported (`improveSharedConnections`), worked out once. */
function exported(result: GeneratorResult): GeneratorResult {
	let out = exportedResults.get(result);
	if (!out) {
		exportedResults.set(result, out = improveSharedConnections(result));
		exportedResults.set(out, out);
	}
	return out;
}

/** Whether `a` cuts better than `b`, both as exported: fewer needle-thin
 * paper tips, then fewer sharp tips, then fewer pieces that tear at print
 * size (`paperTears`). Tips first, as the search always ranked them: a heart
 * mended in its paper may not gain a tip (Nunito ANNA's keep none). With
 * `paperFirst`, the pieces that tear come first. */
function cutsBetter(a: GeneratorResult, b: GeneratorResult, paperFirst = false): boolean {
	const x = exported(a).design, y = exported(b).design, [ta, tb] = [cutTipCounts(x), cutTipCounts(y)];
	const [pa, pb] = [paperTears(x), paperTears(y)];
	if (paperFirst && pa !== pb) return pa < pb;
	if (ta[0] !== tb[0]) return ta[0] < tb[0];
	if (ta[1] !== tb[1]) return ta[1] < tb[1];
	return pa < pb;
}

// A motif's connections kept at least a paper's width from the cuts beside
// them, as on the board (see `PAPER_NECK_MM`).
const paperRoute: typeof fourPortMotif = (edges, contours, gates, angles, margin, ...rest) =>
	fourPortMotif(edges, contours, gates, angles, Math.max(margin ?? 0, PAPER_NECK_MM / PRINT_WIDTH_MM * 100), ...rest);

/** Of the first few results that finish on as many strips as the first, the
 * one whose paper holds best, then with the fewest tips (`cutsBetter`),
 * stopping at one that holds with no sharp tip: for constructions that differ
 * only in their hidden cuts. */
function bestOfFirst(results: Iterable<GeneratorResult>, count = 4, asReturned = false): GeneratorResult | undefined {
	let best: GeneratorResult | undefined, first: GeneratorResult | undefined, working = 0;
	// Text hearts mend their tips their own way (`improveTextPanelTips`): theirs
	// are compared as they are.
	const shown = (result: GeneratorResult) => asReturned ? result : exported(result);
	const better = (a: GeneratorResult, b: GeneratorResult) => {
		const [x, y] = [shown(a).design, shown(b).design], [pa, pb] = [paperTears(x), paperTears(y)];
		if (pa !== pb) return pa < pb;
		return fewerCutTips(cutTipCounts(x), cutTipCounts(y));
	};
	for (const result of results) {
		first ??= result;
		if (result.design.gridSize.x !== first.design.gridSize.x || result.design.gridSize.y !== first.design.gridSize.y) continue;
		if (!best || better(result, best)) best = result;
		if (!paperTears(shown(best).design) && !cutTipCounts(shown(best).design)[1] || ++working === count) break;
	}
	return best;
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

/** Set while a board's choice is made from a motif's catalogue outline,
 * spurs and all (see `generate`). */
let keepSpurs = false;
function catalogueLayout(request: GeneratorRequest): BoardLayout | undefined {
	const key = `${request.style} ${request.board ?? ''} ${JSON.stringify(request.contours ?? [])}`;
	if (!layouts.has(key)) {
		let layout: BoardLayout | undefined;
		keepSpurs = true;
		try {
			layout = generate({ ...request, scale: .7 }).layout;
		} catch (error) {
			if (!(error instanceof ConstructionError) && !(error instanceof CutGeometryError)) throw error;
		} finally {
			keepSpurs = false;
		}
		if (layouts.size > 64) layouts.clear();
		layouts.set(key, layout);
	}
	return layouts.get(key);
}

/** How many hearts are being made, one inside another (a board's choice at
 * its default size, a text's outline as a figure). */
let making = 0;
export function generate(request: GeneratorRequest): GeneratorResult {
	// A picture solved once by the exact-outline search keeps the cuts found
	// for it, where they cut cleanly at this size (see `recipes`); every other
	// heart is built as below, and a topology's stored cuts drawn on it where
	// they are better.
	if (!making) {
		const stored = fromStoredRecipe(request) ?? fromSolve(request);
		if (stored) return stored;
		forgetIslandPorts();
		triedExactly = false;
		fits = createExactCurveFitter(FITS_KEPT);
	}
	making++;
	try {
		if (making > 1 || !request.recipes?.some(isTopology)) return generateTried(request);
		let own: GeneratorResult | undefined, failure: unknown;
		try {
			own = generateTried(request);
		} catch (error) {
			if (!(error instanceof ConstructionError) && !(error instanceof CutGeometryError)) throw error;
			failure = error;
		}
		const better = fromTopology(request, own);
		if (better) return better;
		if (own) return own;
		throw failure;
	} finally {
		if (!--making) fits = undefined;
	}
}
/** The curve fits of the heart being made, shared by every way and size it is
 * made (see `generateOnceMade`): its alternatives and last resorts fit the same
 * outline runs again, the elephant in the sunburst three of four times. Each
 * holds a few thousand characters; the most recently used are kept, until the
 * heart is made (its design keeps only `sharedFits`, see `madeFrom`). */
let fits: ReturnType<typeof createExactCurveFitter> | undefined;
const FITS_KEPT = 1024;
const sharedFits: ReturnType<typeof createExactCurveFitter> = (segments, tolerance) =>
	(fits ?? simplifyCubicChain)(segments, tolerance);
function generateTried(request: GeneratorRequest): GeneratorResult {
	// A motif's hairline spurs go (see `withoutSpurs`); a text's letters keep
	// their glyphs. On a board the motif keeps the choice its catalogue
	// outline makes at the default size: without them an earlier choice can
	// build there that is hard to cut larger (three horses for two).
	if (request.mode === 'figure' && !request.font && request.contours && !keepSpurs) {
		const contours = withoutSpurs(request.contours);
		if (contours !== request.contours) {
			if (BOARD_FRAMES.includes(request.style ?? '') && !request.layout) {
				const layout = catalogueLayout(request);
				if (layout) request = { ...request, layout };
			}
			request = { ...request, contours };
		}
	}
	// A heart refused, hard to cut or with a needle is made again its first
	// way where a second try applies to how it was made (see `SECOND_TRIES`),
	// and that one kept where it cuts cleanly at no smaller size with fewer
	// sharp tips; one made with its retries too where it is hard to cut at no
	// smaller size, no harder, with fewer sharp tips.
	const before = SECOND_TRIES.map(([, seen]) => seen());
	let result: GeneratorResult | undefined, failure: unknown;
	try {
		result = generateAsAsked(request);
	} catch (error) {
		if (!(error instanceof ConstructionError) && !(error instanceof CutGeometryError)) throw error;
		failure = error;
	}
	const made = SECOND_TRIES.map(([, seen]) => seen());
	const size = (r: GeneratorResult) => r.scale ?? request.scale ?? .7;
	for (const [k, [again, , applies, hard]] of SECOND_TRIES.entries()) {
		if (made[k] === before[k] || result && !result.hardToCut && !cutTipCounts(result.design)[0] ||
			!applies(result, before[k])) continue;
		quickAgain = true;
		madeAgain = false;
		retriesAgain = hard(result);
		try {
			const other = again(() => generateAsAsked(request));
			// Fewer tips only where its paper holds as well printed.
			const fewer = () => fewerCutTips(cutTipCounts(other.design), cutTipCounts(result!.design)) &&
				paperTears(exported(other).design) <= paperTears(exported(result!).design);
			if (!result || size(other) >= size(result) && (!other.hardToCut ? result.hardToCut || fewer()
				: result.hardToCut && other.hardToCut.spacing >= result.hardToCut.spacing && fewer())) result = other;
		} catch (error) {
			if (!(error instanceof ConstructionError) && !(error instanceof CutGeometryError)) throw error;
		} finally {
			quickAgain = false;
			retriesAgain = false;
		}
	}
	// A sunburst refused, hard to cut or kept smaller where its motif crowds
	// the circle is made again with its crown narrowed, the circle up to nine
	// tenths of the frame: kept where that is larger, or as large and clean
	// (a flower at 88% whose petals met the circle), its paper holding as well
	// printed (a church at 84% hard to cut, not clean with two weak places).
	const asked = request.scale ?? .7;
	if ((!result || result.hardToCut || size(result) < asked - 1e-9) && request.mode === 'figure' && crowdsCrown(request)) try {
		atSizeOnly = true;
		const other = withNarrowCrown(() => generateAsAsked(request));
		if (!result || size(other) > size(result) + 1e-9 || result.hardToCut && !other.hardToCut && size(other) >= size(result) - 1e-9 &&
			paperTears(exported(other).design) <= paperTears(exported(result).design)) result = other;
	} catch (error) {
		if (!(error instanceof ConstructionError) && !(error instanceof CutGeometryError)) throw error;
	} finally {
		atSizeOnly = false;
	}
	if (result) return result;
	throw failure;
}
/** The ways a heart is made again, each with how often the way it was first
 * made needed it, whether it applies to the heart that came out, and whether
 * it is made with its retries, hard to cut if need be: exact outline indices
 * where a bridge's index slipped (see `withExactArcs`; a bauble hard →
 * clean), with its retries for a heart hard to cut with a needle (the wreath
 * at 70% in the rays, two needles → none), unless the heart was made so
 * already (see `generateOnceMade`), and hidden islands entered where they come
 * nearest, for a clean heart with a sharp tip where one was entered at its
 * extremes (see `withNearestIslands`; tried for any heart with a needle it
 * cost half again in the small motifs, mostly for nothing). */
const SECOND_TRIES: [<T>(build: () => T) => T, () => number, (result: GeneratorResult | undefined, from: number) => boolean,
	(result: GeneratorResult | undefined) => boolean][] = [
	[withExactArcs, arcSlipsSeen, result => !result || !madeExactly.has(result.design),
		result => !!result?.hardToCut && cutTipCounts(result.design)[0] > 0],
	[withNearestIslands, islandsAtExtremesSeen, (result, from) => !!result && !result.hardToCut && tipAtIslandPort(result, from), () => false]
];
/** The hearts made again with exact outline indices where nothing else could
 * be finished (see `generateOnceMade`), and whether the heart being made has
 * been so already. */
const madeExactly = new WeakSet<HeartDesign>();
let triedExactly = false;
/** Whether a sharp tip of the heart lies at a port where an island was
 * entered at its extremes since `from`. */
function tipAtIslandPort(result: GeneratorResult, from: number): boolean {
	const ports = islandPortsSince(from);
	if (!ports.length) return false;
	const rect = inferOverlapRect(result.design.fingers, result.design.gridSize);
	return cutTipPoints(result.design).some(({ x, y }) => {
		const p: Point = [(x - rect.left) / rect.width * 100, (y - rect.top) / rect.height * 100];
		return ports.some(q => distance(p, q) < .5);
	});
}
/** Set while a sunburst is made again with its crown narrowed (see
 * `generate`): at its own size only, the sizes below having been tried so
 * already (see `generateAtSizeOrSmaller`). */
let atSizeOnly = false;
/** Set while a heart is made again (see `SECOND_TRIES`): its first way
 * only, at its own size, without retries (unless `retriesAgain`), last
 * resorts or a smaller size, so that a heart it cannot improve costs one
 * construction more (a wreath hard in the wedges had cost four). */
let quickAgain = false, madeAgain = false, retriesAgain = false;

function generateAsAsked(request: GeneratorRequest): GeneratorResult {
	if (request.mode === 'text' && isTextFigure(request.textFrame)) return generateTextFigure(request);
	try {
		return generateAtSizeOrSmaller(request);
	} catch (error) {
		// A frame on a board that cannot weave the motif on the strips asked
		// for, at any size, shows it on the nearest that can (the finer of two),
		// as the page then says.
		const range = request.mode === 'figure' ? BOARD_STRIPS[request.style as BoardStyle] : undefined;
		if (!range || !(error instanceof ConstructionError) && !(error instanceof CutGeometryError)) throw error;
		const asked = request.board ?? range.initial, boards: number[] = [];
		for (let n = range.min; n <= range.max; n += range.step) if (n !== asked) boards.push(n);
		boards.sort((a, b) => Math.abs(a - asked) - Math.abs(b - asked) || b - a);
		for (const board of boards) try {
			return generateAtSizeOrSmaller({ ...request, board });
		} catch (otherError) {
			if (!(otherError instanceof ConstructionError) && !(otherError instanceof CutGeometryError)) throw otherError;
		}
		throw error;
	}
}

/** A heart at the size asked for, else above the default size the largest
 * that can be below, of a few sizes and the whole percents just above the
 * largest of them that can (see `generate`). */
function generateAtSizeOrSmaller(request: GeneratorRequest): GeneratorResult {
	const scale = request.scale ?? .7, sunburst = request.mode === 'figure' && request.style === 'sunburst';
	// A sunburst made without the space asked for draws its motif at four
	// fifths of the size asked (see `frameAlternatives`): a larger one below,
	// with the space, comes first (the gift asked 90% was drawn at 72%).
	let drawnSmaller: GeneratorResult | undefined, failure: unknown;
	try {
		const result = generateAtSizeOrLastResort(request);
		if (!sunburst || (result.scale ?? scale) >= scale - 1e-9) return result;
		drawnSmaller = result;
	} catch (error) {
		if (!(error instanceof ConstructionError) && !(error instanceof CutGeometryError)) throw error;
		failure = error;
	}
	if (scale <= .7 || request.mode === 'figure' && request.style === 'board' || quickAgain || atSizeOnly) {
		if (drawnSmaller) return drawnSmaller;
		throw failure;
	}
	// Above the default size a frame takes a motif larger than its
	// constructions were first made for. Where nothing at all can be built at
	// that size, the motif keeps the largest size below that can be, of a fixed
	// few (so neighbouring sizes keep alike), down to the default size, rather
	// than refusing, and says so. The circle on a board keeps its own (see
	// `generateUsingRecipes`). A sunburst whose motif crowds the circle at one
	// of those sizes is made there with its crown narrowed too, as at the size
	// asked (see `generate`), else a larger size asked keeps a smaller one (the
	// gift asked 94% had 94% so, asked 96% only 92%).
	const at = (size: number) => {
		const sized = { ...request, scale: size };
		const ways = [() => generateAtSizeOrLastResort(sized)];
		if (request.mode === 'figure' && crowdsCrown(sized)) ways.push(() => withNarrowCrown(() => generateAtSizeOrLastResort(sized)));
		for (const way of ways) try {
			const result = way();
			return { ...result, scale: result.scale ?? size };
		} catch (smallerError) {
			if (!(smallerError instanceof ConstructionError) && !(smallerError instanceof CutGeometryError)) throw smallerError;
		}
	};
	const largestAbove = (floor: number) => {
		let above = scale;
		for (const size of [.97, .94, .91, .88, .85, .8, .75, .7].filter(size => size < scale - 1e-9 && size > floor + 1e-9)) {
			const result = at(size);
			if (!result) {
				above = size;
				continue;
			}
			// Then the slider's whole percents above it, short of the one above
			// that cannot be, while they can be: else a larger size asked would
			// keep a smaller one (a mouse in the corners asked 97% had kept 94%,
			// where 96% can be). One that can is quickly built; one that cannot
			// runs the last resorts, so the first ends the search.
			let largest = result;
			for (let percent = Math.round(size * 100) + 1; percent < Math.ceil(above * 100 - 1e-9); percent++) {
				const larger = at(percent / 100);
				if (!larger) break;
				largest = larger;
			}
			return largest;
		}
	};
	// A sunburst looks with the space kept first, larger than the one drawn
	// smaller, and only where nothing keeps it at any of those sizes without.
	const kept = sunburst ? keepingSpace(() => largestAbove(drawnSmaller?.scale ?? 0)) : largestAbove(0);
	if (kept) return kept;
	if (drawnSmaller) return drawnSmaller;
	const any = sunburst ? largestAbove(0) : undefined;
	if (any) return any;
	throw failure;
}
/** Set while a sunburst's size ladder keeps the space around the motif (see
 * `generateAtSizeOrSmaller`): its circle does not then keep the frame's own
 * size at a smaller size (see `frameAlternatives`). */
let spaceKept = false;
function keepingSpace<T>(build: () => T): T {
	const before = spaceKept;
	spaceKept = true;
	try {
		return build();
	} finally {
		spaceKept = before;
	}
}

/** A text in a frame that is a figure frame (see `textFigure`). The letters
 * in the checks keep the strips the visitor chose, hard to cut if need be;
 * otherwise, or where those can build nothing at all, they take the first
 * board that cuts cleanly, else the one that keeps the most of the cutting
 * clearance, else a finer board than the visitor can choose. */
function generateTextFigure(request: GeneratorRequest): GeneratorResult {
	const figure = textFigureRequest(request);
	if (figure.style !== 'strips') return generateAsAsked(figure);
	const asked = figure.board, boards = asked ? [asked, ...TEXT_STRIPS.filter(n => n !== asked)] : TEXT_STRIPS;
	let hard: GeneratorResult | undefined, last: unknown;
	for (const board of boards) try {
		const result = generateAtSizeOrSmaller({ ...figure, board });
		if (!result.hardToCut || board === asked) return result;
		if (!hard || result.hardToCut.spacing > hard.hardToCut!.spacing) hard = result;
	} catch (error) {
		if (!(error instanceof ConstructionError) && !(error instanceof CutGeometryError)) throw error;
		last ??= error;
	}
	if (hard) return hard;
	// A long word no board up to six strips can weave whole may still weave on
	// a finer one: there, rather than refused (KÆRLIGHED in Kalam on eight).
	for (const board of TEXT_LAST_STRIPS) try {
		return generateAtSizeOrSmaller({ ...figure, board });
	} catch (error) {
		if (!(error instanceof ConstructionError) && !(error instanceof CutGeometryError)) throw error;
	}
	throw last;
}

/** Whether the board circle, and a text cell, reach the pieces of a motif or
 * letter every way they can (see `generateUsingRecipes`), and how many of
 * several pieces they could not build at their size without: only a request
 * refused without them tries again with them, so every heart built without
 * them keeps its cuts. */
let everyWay = false, everyWayPassed = 0;
const everyWaySetAside = () => everyWayPassed;
function withEveryWay<T>(build: () => T): T {
	const before = everyWay;
	everyWay = true;
	try {
		return build();
	} finally {
		everyWay = before;
	}
}
/** Whether lanes holding no part of the motif move past the parts reaching
 * across them, and a sunburst's lanes keep inside its border (see
 * `generateComponentLanes`), and how many lane constructions failed for
 * crossing those: only a request refused without them tries again with them,
 * so every heart built without them keeps its cuts. */
let passingLanes = false, passingLanesFailed = 0;
const passingLanesSetAside = () => passingLanesFailed;
function withPassingLanes<T>(build: () => T): T {
	const before = passingLanes;
	passingLanes = true;
	try {
		return build();
	} finally {
		passingLanes = before;
	}
}
/** Constructions set aside where a clean one might follow, each with how
 * many it set aside so far: islands entered along visible spokes where
 * nothing else routes (see `withVisibleIslands`), in the checks hidden cuts
 * that come too close (see `withCrowdedHiddenCuts`), on the board circle
 * every way of reaching a motif's pieces (see `withEveryWay`), and lanes run
 * through parts of the motif they do not hold (see `withPassingLanes`). */
const LAST_RESORTS = [[withVisibleIslands, visibleIslandsSetAside], [withCrowdedHiddenCuts, crowdedHiddenCutsSetAside], [withEveryWay, everyWaySetAside], [withPassingLanes, passingLanesSetAside]] as const;
/** The last resorts allowed while a heart is made (see `allowingLastResort`). */
const allowed = LAST_RESORTS.map(() => false);
function allowingLastResort<T>(k: number, build: () => T): T {
	const before = allowed[k];
	allowed[k] = true;
	try {
		return LAST_RESORTS[k][0](build);
	} finally {
		allowed[k] = before;
	}
}
/** The alternatives that failed at the size being made (see
 * `generateAtSizeOrLastResort`), each with the last resorts allowed then and
 * those it set a construction aside for. Allowed besides only last resorts
 * it set nothing aside for, an alternative made the same way (`kind`: with
 * its retries or without, an equal square's first try being the same
 * request without) fails the same way again: it is not made again (a swan
 * refused in the wedges was made seven times a size, three of them so). */
type Failed = { allowed: boolean[]; setAside: boolean[]; error: unknown };
let failedAtSize: Map<string, Failed[]> | undefined;
function alternativeOnce(request: GeneratorRequest, kind: string, build: () => GeneratorResult): { result: GeneratorResult } | Failed {
	const key = kind + JSON.stringify(request, (name, value) => name === 'contours' || name === 'font' ? undefined : value);
	const known = failedAtSize?.get(key)?.find(failed => failed.allowed.every((then, k) => then ? allowed[k] : !allowed[k] || !failed.setAside[k]));
	if (known) return known;
	const before = LAST_RESORTS.map(([, setAside]) => setAside());
	try {
		return { result: build() };
	} catch (error) {
		if (!(error instanceof ConstructionError) && !(error instanceof CutGeometryError)) throw error;
		const failed = { allowed: [...allowed], setAside: LAST_RESORTS.map(([, setAside], k) => setAside() !== before[k]), error };
		if (failedAtSize) failedAtSize.set(key, [...failedAtSize.get(key) ?? [], failed]);
		return failed;
	}
}
/** A heart for the request at its own size, else one with a construction
 * set aside while making it (see `LAST_RESORTS`), hard to cut rather than
 * refused. */
function generateAtSizeOrLastResort(request: GeneratorRequest): GeneratorResult {
	const before = LAST_RESORTS.map(([, setAside]) => setAside()), outer = failedAtSize;
	failedAtSize = new Map();
	try {
		return generateAtSize(request);
	} catch (error) {
		if (!(error instanceof ConstructionError) && !(error instanceof CutGeometryError) || quickAgain) throw error;
		for (const [k, [, setAside]] of LAST_RESORTS.entries()) {
			if (setAside() === before[k]) continue;
			try {
				return allowingLastResort(k, () => generateAtSize(request));
			} catch (lastError) {
				if (!(lastError instanceof ConstructionError) && !(lastError instanceof CutGeometryError)) throw lastError;
			}
		}
		throw error;
	} finally {
		failedAtSize = outer;
	}
}

/** A heart for the request at its own size (see `generate`). */
function generateAtSize(request: GeneratorRequest): GeneratorResult {
	if (request.mode === 'figure' && request.style === 'strips') return generateStrips(request);
	request = withLayout(request);
	const alternatives = frameAlternatives(request);
	if (alternatives.length === 1) return generateOnce(alternatives[0].request);
	// A figure names no letters, only that its paper is narrow, unless it is
	// a text's outline. A motif on a board records the choice its default size
	// made.
	const named = (result: GeneratorResult, alternative: number): GeneratorResult => ({
		...result,
		// A motif drawn smaller than asked says so (see `frameAlternatives`).
		...alternatives[alternative].smaller ? { scale: (request.scale ?? .7) * alternatives[alternative].smaller! } : {},
		...request.mode === 'figure' && BOARD_FRAMES.includes(request.style ?? '')
			? { layout: request.layout ?? { alternative, board: result.design.gridSize.x } } : {},
		...result.hardToCut && request.mode === 'figure' && !request.font ? { hardToCut: { ...result.hardToCut, letters: [] } } : {}
	});
	// Prefer a clean alternative to a hard-to-cut earlier one. Only when none
	// is clean is the first hard-to-cut alternative finished; only when none
	// is even that are they tried again with the constructions set aside on
	// the way (see `LAST_RESORTS`), keeping the strips, space and cells asked
	// for, hard to cut if need be; and only then are the last resorts tried,
	// which change those.
	let last: unknown;
	// Which last resorts each alternative set a construction aside for: one
	// that set none aside fails the same way again.
	const setAsideBy = new Map<number, boolean[]>();
	const preferred = (again?: number): GeneratorResult => {
		const hard: [number, () => GeneratorResult | undefined][] = [];
		for (const [index, { request: alternative, retries, lastResort }] of alternatives.entries()) {
			if (lastResort || again !== undefined && !setAsideBy.get(index)?.[again]) continue;
			// Identical small motifs gain little from other junctions; a
			// smaller board is the better next choice.
			const tried = alternativeOnce(alternative, `preferred ${retries}`, () => generateOnce(alternative, finish => hard.push([index, finish]), 1, retries));
			if ('result' in tried) return named(tried.result, index);
			last = tried.error;
			if (again === undefined) setAsideBy.set(index, tried.setAside);
		}
		for (const [index, finish] of hard) {
			const result = finish();
			if (result) return named(result, index);
		}
		throw last ?? new ConstructionError('topology', 'No alternative');
	};
	try {
		return preferred();
	} catch (error) {
		if (!(error instanceof ConstructionError) && !(error instanceof CutGeometryError)) throw error;
	}
	for (const k of LAST_RESORTS.keys()) {
		if (![...setAsideBy.values()].some(aside => aside[k])) continue;
		try {
			return allowingLastResort(k, () => preferred(k));
		} catch (error) {
			if (!(error instanceof ConstructionError) && !(error instanceof CutGeometryError)) throw error;
		}
	}
	for (const [index, { request: alternative, lastResort }] of alternatives.entries()) {
		if (!lastResort) continue;
		const tried = alternativeOnce(alternative, 'last', () => generateOnce(alternative));
		if ('result' in tried) return named(tried.result, index);
		last = tried.error;
	}
	throw last;
}

/** Where each motif's default size placed it in the checks (see `generateStrips`). */
const stripShifts = new Map<string, number>();
/** The figure in the checks (see `stripFigures`): the board's squares swap
 * colour inside the motif, at the size the visitor sets. The motif keeps, at
 * every size, the place on the board its default size chose, so that it
 * only grows with the slider: cut cleanly if it can be there, else as hard to
 * cut. Where it cannot be built there at all it moves, as little as it can. */
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
	// fine points on a small board. There the motif moves to the nearest place
	// where it keeps that size, else keeps its place at the nearest size it can
	// have there, of the slider's whole percents towards the default size,
	// which has it: the slider waits only where neither is had, and never turns
	// back (a larger size asked never keeps a smaller one).
	const at = (size: number) => Math.round(size * 1e6) / 1e6;
	// The place the visitor chose, kept as it is; else the default size's,
	// slid towards where the motif fits largest above that size.
	const chosen = request.place ?? stripShifts.get(key), kept = chosen !== undefined;
	const placeAt = (size: number) => request.place ?? (chosen === undefined ? undefined : slidePlace(contours, size, chosen));
	const towards: number[] = [];
	if (scale > .7) for (let percent = Math.ceil(scale * 100 - 1e-9) - 1; percent >= 70; percent--) towards.push(percent / 100);
	else if (scale < .7) for (let percent = Math.floor(scale * 100 + 1e-9) + 1; percent <= 70; percent++) towards.push(percent / 100);
	else towards.push(.6);
	let last: unknown;
	const curveFitter = createExactCurveFitter(), moved = new Set<number>();
	const tried = (size: number, where: Parameters<typeof stripFigures>[5]) => {
		try {
			return stripsAt(request, key, at(size), where, curveFitter, placeAt(at(size)));
		} catch (error) {
			if (!(error instanceof ConstructionError) && !(error instanceof CutGeometryError)) throw error;
			last ??= error;
			// Where nothing at all could be built there, which is quickly known,
			// the nearest place where the motif keeps its size; where cuts there
			// failed to finish, those are the place's answer: the clearest such.
			if (where === 'alone' && error.message === NO_WHOLE_STRIPS) return tried(size, 'nearby');
			if (where === 'alone' && !moved.has(size)) {
				moved.add(size);
				return tried(size, 'full');
			}
		}
	};
	// The nearest size the place can have, or a place near it can where the
	// motif keeps that size; only where none is found at any size, the nearest
	// size the motif can have anywhere, there smaller if it must.
	if (kept) for (const size of [scale, ...towards]) {
		const result = tried(size, 'alone');
		if (result) return result;
	}
	for (const size of [scale, ...towards]) {
		const result = tried(size, kept ? 'elsewhere' : 'first');
		if (result) return result;
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
		...result, place: shift, scale, ...result.hardToCut && !request.font ? { hardToCut: { ...result.hardToCut, letters: [] } } : {}
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
function frameAlternatives(request: GeneratorRequest): { request: GeneratorRequest; retries: boolean; lastResort?: boolean; smaller?: number }[] {
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
		const choicesAt = (letterScale: number): Choice[] => board.map(({ text, board, retries, lastResort, larger = 1, air, fitted, alone }) => ({
			retries, lastResort, request: { mode: 'text', name: request.name, colors: request.colors, text, font, letterScale: Math.min(request.style === 'squares' || alone ? 1.1 : Infinity, letterScale * larger),
				...request.style === 'squares' || alone ? { textFrame: air ? 'air' : 'woven', fittedCells: !!fitted, board: fitted ? undefined : board } : { textFrame: 'checkered', board } }
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
	// nearer the motif, until they touch it, a circle move out, and then keep
	// the frame's own size, and the checked tips, which come nearest at no
	// space, move away from the motif.
	const style = request.style ?? 'rays';
	if (style === 'corners') {
		const gap = request.gap ?? CORNER_GAP;
		return [...new Set([gap, Math.max(gap, 3), Math.max(gap, 6)])].map((gap, i) => ({ request: { ...request, gap }, retries: true, lastResort: i > 0 }));
	}
	if (style === 'wedges' || request.gap && ['silhouette', 'fitted'].includes(style)) {
		const gap = request.gap ?? WEDGES.gap;
		return [...new Set([gap, gap / 2, 0])].map((gap, i) => ({ request: fillSquare({ ...request, gap }), retries: true, lastResort: i > 0 }));
	}
	// Without the space, the circle keeps the frame's own size and the motif
	// fills it as it did before there was a space to set: the sunburst's, its
	// circle four fifths of its frame, at four fifths of the size asked, which
	// the heart says (`smaller`), and not while its size ladder keeps the space
	// (see `generateAtSizeOrSmaller`).
	if (request.gap !== undefined && CIRCLE_STYLES.includes(style)) {
		const spaced = [request.gap, request.gap + 4].map((gap, i) => ({ request: fitCircle({ ...request, gap }), retries: true, lastResort: i > 0 }));
		if (style === 'sunburst' && spaceKept) return spaced;
		return [...spaced, { request: { ...request, gap: undefined }, retries: true, lastResort: true, ...style === 'sunburst' ? { smaller: .8 } : {} }];
	}
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
	if (quickAgain) {
		if (madeAgain) throw new ConstructionError('topology', 'Made again its first way only');
		madeAgain = true;
	}
	const result = generateOnceMade(request, quickAgain ? undefined : deferHard, variants, retries && (!quickAgain || retriesAgain));
	// A clean figure's shared cuts that meet the motif in a sharp tip of paper
	// bend to cross it instead, however it was made (a retry's too: a candy
	// cane's nested construction in the rays); the board circle's do as it
	// keeps them.
	return request.mode === 'figure' && request.style !== 'board' && !result.hardToCut ? withSpreadPorts(result) : result;
}
function generateOnceMade(request: GeneratorRequest,
	deferHard?: (finish: () => GeneratorResult | undefined) => void, variants = Infinity, retries = true): GeneratorResult {
	const curveFitter = fits ? sharedFits : createExactCurveFitter();
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
	const slips = arcSlipsSeen();
	try {
		const result = generateUsingRecipes(request,
			(construction, recipe) => rejected.push({ construction, recipe }), curveFitter, variants, retries);
		// A figure bends its shared cuts at sharp tips once made (see
		// `generateOnce`). The checkerboard improves its shared connections
		// as it compares sizes.
		if (request.mode === 'figure') return result;
		return request.textFrame === 'checkered' ? result : improveTextPanelTips(request, result, curveFitter);
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
					'circle', size * (request.crown ?? .8), request.scale ?? .7, 'rays', fourPortMotif, 2);
				retry = sunburstBorder(construction, size, request.crown);
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
		const bentLegs = retryBentCornerLegs(request, curveFitter);
		if (bentLegs) return bentLegs;
		// Where a bridge's index slipped (see `withExactArcs`), the outline
		// folded back over it can leave no candidate that finishes at all: the
		// heart is then made again with exact indices, hard to cut if need be,
		// before anything farther from what was asked (the wreath at 85% in the
		// rays, whose every candidate crossed such a fold, had its lanes run
		// through it instead). Once a heart, where nothing first finished (as a
		// rule at the size and gap asked for): a swan refused had tried it at
		// every smaller size and gap, for a quarter again of its time.
		const slipped = arcSlipsSeen() !== slips;
		const exactly = () => {
			if (triedExactly) return;
			triedExactly = true;
			try {
				const made = withExactArcs(() => generateOnce(request, undefined, variants, retries));
				madeExactly.add(made.design);
				return made;
			} catch (exactError) {
				if (!(exactError instanceof ConstructionError) && !(exactError instanceof CutGeometryError)) throw exactError;
			}
		};
		const finishHard = () => hardToCutResult(request, [...curvedCandidates,
			...closePanels.map(construction => ({ construction, recipe: 'letters' as const }))], curveFitter) ??
			(slipped ? exactly() : undefined);
		if (deferHard) {
			deferHard(finishHard);
			throw error;
		}
		const hardToCut = finishHard();
		if (hardToCut) return hardToCut;
		throw error;
	}
}

/** A clean figure as exported (`improveSharedConnections`); where its paper
 * tears printed, made again with the hidden cuts that meet an outline nearer
 * each other than a paper's width moved apart along it (see `spreadPorts`):
 * all at once, else one by one (a few), each kept where the heart is still
 * clean and its paper holds better, building on the last. The owl at 50% in
 * the rays: the cuts into an eye's outer ring and on to its inner ring met it
 * two units apart, and the other sheet's band between the rings hung there. */
function withSpreadPorts(result: GeneratorResult): GeneratorResult {
	const shown = exported(result), made = madeFrom.get(result.design);
	if (!made || !paperTears(shown.design)) return shown;
	const all = spreadPorts(made.construction.edges, PORT_GAP);
	if (!all) return shown;
	const finished = (edges: Edge[]) => {
		try {
			return finishConstruction(made.request, { ...made.construction, edges, geometry: compile(edges) }, result.recipe,
				undefined, made.curveFitter);
		} catch (error) {
			if (!(error instanceof ConstructionError) && !(error instanceof CutGeometryError)) throw error;
		}
	};
	let best = result, edges = made.construction.edges;
	const whole = finished(all.edges);
	if (whole && cutsBetter(whole, best, true)) best = whole;
	else for (const port of all.ports.slice(0, SPREAD_ONE_BY_ONE)) {
		const one = spreadPorts(edges, PORT_GAP, p => near(p, port)), next = one && finished(one.edges);
		if (next && cutsBetter(next, best, true)) {
			best = next;
			edges = one.edges;
		}
	}
	return best === result ? shown : { ...shown, design: exported(best).design };
}
/** How far apart hidden cuts that meet an outline are moved (see
 * `spreadPorts`): a paper's width and a fifth, as the paper check measures
 * the neck between them on a grid (moved a paper's width apart, half as many
 * hearts held better; half a width more, no more did). */
const PORT_GAP = PAPER_NECK_MM / PRINT_WIDTH_MM * 100 * 1.2;
/** The most ports moved one by one (see `withSpreadPorts`): those that helped
 * were among the first three. */
const SPREAD_ONE_BY_ONE = 8;

/** Fine serifs and narrow gaps can need more paper than the clearance allows,
 * even with exact outlines and every established construction. Rather than
 * refusing, keep a completed construction whose weave and picture are valid and
 * whose cuts stay apart, and flag it as hard to cut, naming the letters beside
 * its narrow paper. Prefer the widest spacing kept, then the fewest strips with
 * narrow paper, then the paper that holds best printed, then the fewest sharp
 * tips. Clean results never get here. */
function hardToCutResult(request: GeneratorRequest,
	candidates: { construction: Construction; recipe: GeneratorResult['recipe'] }[],
	curveFitter: ReturnType<typeof createExactCurveFitter>): GeneratorResult | undefined {
	type Choice = { result: GeneratorResult; construction: Construction; recipe: GeneratorResult['recipe']; spacing: number; narrow: number; tears: number; tips: [number, number] };
	let best: Choice | undefined;
	const seen = new Set<string>(), lowest = HARD_TO_CUT_SPACINGS.at(-1)!;
	const choice = (construction: Construction, recipe: GeneratorResult['recipe']): Choice | undefined => {
		try {
			// Finish once at the narrowest spacing, then record the widest one kept.
			const result = finishConstruction(request, construction, recipe, undefined, curveFitter, lowest),
				{ design } = result, rect = inferOverlapRect(design.fingers, design.gridSize),
				full = intersectionMarginPx(rect, gridClearanceScale(design.gridSize.x, design.gridSize.y)),
				narrow = findSearchIssues(design.fingers, full).size,
				spacing = narrow ? HARD_TO_CUT_SPACINGS.find(fraction => fraction === lowest ||
					!findSearchIssues(design.fingers, full * fraction, full).size)! : 1,
				tips = cutTipCounts(design), tears = paperTears(exported(result).design);
			return { result, construction, recipe, spacing, narrow, tears, tips };
		} catch (error) {
			if (!(error instanceof ConstructionError) && !(error instanceof CutGeometryError)) throw error;
		}
	};
	for (const { construction, recipe } of candidates) {
		const key = JSON.stringify(construction.edges);
		if (seen.has(key)) continue;
		seen.add(key);
		const made = choice(construction, recipe);
		if (made && (!best || made.spacing > best.spacing || made.spacing === best.spacing && (made.narrow < best.narrow ||
			made.narrow === best.narrow && (made.tears < best.tears || made.tears === best.tears && fewerCutTips(made.tips, best.tips)))))
			best = made;
	}
	// A figure whose paper tears printed, with the hidden cuts that meet an
	// outline nearer each other than a paper's width moved apart (see
	// `spreadPorts`), as a clean one's are (see `withSpreadPorts`): kept where
	// it is no harder to cut and its paper holds better.
	if (best?.tears && request.mode === 'figure') {
		let kept: Choice = best;
		const all = spreadPorts(kept.construction.edges, PORT_GAP);
		const better = (next: Choice | undefined): next is Choice => !!next && next.spacing >= kept.spacing &&
			next.narrow <= kept.narrow && next.tears < kept.tears;
		const spread = (edges: Edge[]) => choice({ ...kept.construction, edges, geometry: compile(edges) }, kept.recipe);
		const whole = all && spread(all.edges);
		if (better(whole)) kept = whole;
		else if (all) for (const port of all.ports.slice(0, SPREAD_ONE_BY_ONE)) {
			const one = spreadPorts(kept.construction.edges, PORT_GAP, p => near(p, port)), next = one && spread(one.edges);
			if (better(next)) kept = next;
		}
		best = kept;
	}
	if (!best?.narrow) return best?.result;
	const { construction, spacing } = best, letters = request.font
		? trickyLetters(construction, request.text ?? '', request.font, 1.5 * gridClearanceScale(
			construction.geometry.A_overlap_paths.length + 1, construction.geometry.B_overlap_paths.length + 1))
		: [];
	const result = { ...best.result, hardToCut: { letters, spacing } };
	return request.mode === 'figure' && !request.font ? improveHardConnections(result) : result;
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

/** The checked tips' layouts: routing in the lanes, outside routes fitted
 * into the border, bent approaches to the motif. */
const CORNER_LAYOUTS = [
	['chain', false, false], ['practical', false, false], ['separated', false, false],
	['practical', true, false], ['separated', true, false],
	['practical', false, true], ['separated', false, true],
	['practical', true, true], ['separated', true, true]
] as const;

/** A side lane's straight leg to a checked tip can pass too near the motif (a
 * full-size star's lower tips reach across it): the layouts again with such
 * legs bent out past it, before the heart is called hard to cut. */
function retryBentCornerLegs(request: GeneratorRequest, curveFitter: ReturnType<typeof createExactCurveFitter>): GeneratorResult | undefined {
	if (request.mode !== 'figure' || request.style !== 'corners') return;
	for (const [routing, fitBorder, bentSpokes] of CORNER_LAYOUTS) try {
		const construction = generateCornerChecks(request.contours ?? [], request.frameSize, request.scale, routing, fitBorder, bentSpokes,
			undefined, undefined, request.gap, true);
		if (!construction.bentLegs || routing === 'separated' && !construction.separated || fitBorder && !construction.borderAdjusted) continue;
		return improveSharedConnections(finishConstruction(request, construction, 'silhouette', undefined, curveFitter));
	} catch (error) {
		if (!(error instanceof ConstructionError) && !(error instanceof CutGeometryError)) throw error;
	}
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
	const symmetric = mirrorSymmetric(rings);
	for (const balanced of symmetric ? [true, false] : [false]) for (const padding of [2, 3]) try {
		if (!balanced && symmetric && best) return best;
		const construction = generateFittedFigure(rings, request.frameSize, request.scale,
			fourPortMotif, undefined, padding, open, balanced);
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
		const inner = generateComponentFigure(rings, 'circle', size * (request.crown ?? .8), request.scale ?? .7,
			'check', route, columns, 2, true, false), outer = sunburstBorder(inner, size, request.crown);
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
		const inner = generatePanelFigure(rings, 'circle', size * (request.crown ?? .8), request.scale ?? .7,
			columns, 'check', rows, false, route, 'components');
		const result = improveSharedConnections(finishConstruction(request, sunburstBorder(inner, size, request.crown),
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
		shape = textPanel(frame);
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
		shape = textPanel(frame);
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
	const frame = textPanel(request.textFrame ?? 'woven'), text = request.text ?? '', font = request.font;
	if (request.mode !== 'text' || !font || !text.trim() || /\s/.test(text) || !frame) return;
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
		const inner = generateComponentFigure(rings, frame, sunburst ? size * (request.crown ?? .8) : size,
			scale, style, route, columns, sunburst ? 2 : 0, true);
		const construction = sunburst ? sunburstBorder(inner, size, request.crown) : inner;
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
	// A motif that is its own mirror image tries its symmetric gates first.
	const symmetric = mirrorSymmetric(rings);
	for (const balanced of symmetric ? [true, false] : [false])
	for (const islandRank of [1, 2, 3]) for (const practical of [false, true]) try {
		if (!balanced && symmetric && best) return best;
		const route: typeof fourPortMotif = (...args) => {
			args[7] = { ...args[7], islandRank, practical };
			return fourPortMotif(...args);
		};
		const inner = style === 'fitted' || style === 'wedges' || style === 'silhouette'
			? generateFittedFigure(rings, size, scale, route, undefined, 0, openFrame(request), balanced)
			: generateFourPortFigure(rings, sunburst ? 'circle' : request.frame,
				sunburst ? size * (request.crown ?? .8) : size, scale, sunburst ? 'rays' : style, route, sunburst ? 2 : 0);
		const construction = sunburst ? sunburstBorder(inner, size, request.crown) : inner;
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
	// A motif that is its own mirror image turns the gates beside its middle
	// alike first, with tied tips sharing their gates (see `SYMMETRIC_GATES`).
	if (mirrorSymmetric(rings)) for (const { ties = true, angles, axisGap, onMiddle } of SYMMETRIC_GATES) try {
		const construction = generateFittedFigure(rings, request.frameSize, request.scale, fourPortMotif, angles, 0, open, ties, axisGap, onMiddle);
		const key = JSON.stringify(construction.geometry);
		if (seen.has(key)) continue;
		seen.add(key);
		const result = improveSharedConnections(finishConstruction(request, construction, 'silhouette', undefined, curveFitter));
		if (!best || fewerCutTips(cutTipCounts(result.design), cutTipCounts(best.design))) best = result;
		if (!cutTipCounts(best.design)[0]) return best;
	} catch (error) {
		if (!(error instanceof ConstructionError) && !(error instanceof CutGeometryError)) throw error;
	}
	if (best) return best;
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
	// contacts: both neighbours still agree on the original internal seam. A
	// motif that is its own mirror image turns them alike first.
	const symmetric = mirrorSymmetric(rings);
	for (const offsets of [...symmetric ? [.15, -.15].map(turn => [0, turn, 0, -turn]) : [],
		...[.15, -.15].map(turn => [turn, turn, turn, turn])] as [number, number, number, number][]) try {
		if (symmetric && best && offsets[0] === offsets[1]) break;
		const construction = generatePanelFigure(rings, open, request.frameSize ?? 70,
			request.scale ?? .7, 1, 'check', 2, false, fourPortMotif, 'support', false, 0, offsets);
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
	// Passing lanes an open frame cannot cut are left out (see `generateComponentLanes`).
	for (const [aligned, drop] of open ? passingLanes ? [[true, false], [true, true]] : [[true, false]] : [[false, false], [true, false]]) {
		let passes = false;
		try {
			const inner = generateComponentLanes(rings, frame, sunburst ? size * (request.crown ?? .8) : size,
				request.scale, style, aligned, sunburst ? 2 : 0, passingLanes, drop);
			passes = inner.passes;
			// Passing lanes that pass nothing were made already, but in a sunburst.
			if (passingLanes && !passes && !sunburst) continue;
			const construction = sunburst ? sunburstBorder(inner, size, request.crown) : inner;
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
			// A lane run through the motif crosses its outline, or one round a
			// sunburst's corner its border (see `withPassingLanes`).
			if ((passes || sunburst) && !passingLanes && error.message === CUTS_CROSS) passingLanesFailed++;
		}
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
		const shape = textPanel(frame);
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
		const shape = textPanel(frame);
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
				const result = generatePanelFigure(rings, shape, sunburst ? size * (request.crown ?? .8) : size,
					scale, 1, style, 2, true, fourPortMotif, 'ray');
				return sunburst ? sunburstBorder(result, size, request.crown) : result;
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
	const finish = (construction: Construction, recipe: GeneratorResult['recipe'], keep = true) => {
		try { return finishConstruction(request, construction, recipe, undefined, curveFitter); }
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
				mixed: ReturnType<typeof mixedCheckeredGridCache>, finish: (construction: Construction, recipe: GeneratorResult['recipe']) => GeneratorResult,
				corners: [number, number]): GeneratorResult => {
				// Of the working cuts, the one that cuts best (`cutsBetter`).
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
						const construction = generateCheckeredGrid(text, font, fill, inset, { cache, variant, corners, onCrowded: () => { crowded = true; } });
						const tips = cutTipCounts(construction.geometry);
						// Reject worse candidates before the more expensive curve fitting,
						// unless the best so far tears: wider connections can leave the
						// letters' bridges too narrow, and narrower ones fix that.
						if (rawTips && best && !paperTears(exported(best).design) && !fewerCutTips(tips, rawTips)) continue;
						const candidate = finish(construction, 'letters');
						if (!best || cutsBetter(candidate, best)) {
							best = candidate;
							bestInset = inset;
							rawTips = tips;
						}
						if (best && !paperTears(exported(best).design) && !cutTipCounts(best.design)[1]) break;
					} catch (error) {
						if (!(error instanceof ConstructionError) && !(error instanceof CutGeometryError)) throw error;
						if (error instanceof ConstructionError && ['empty', 'character'].includes(error.code)) throw error;
						last = error;
					}
				}
				if (best) {
					if (rawTips?.[1] && cutTipCounts(best.design)[1]) try {
						const construction = generateCheckeredGrid(text, font, fill, bestInset, { cache, variant, corners, optimize: true });
						// Skip fitting unchanged or worse combinations. A local improvement
						// still has to pass every full-sheet check and cut better.
						if (fewerCutTips(cutTipCounts(construction.geometry), rawTips)) {
							const candidate = finish(construction, 'letters');
							if (cutsBetter(candidate, best)) best = candidate;
						}
					} catch (error) {
						if (!(error instanceof ConstructionError) && !(error instanceof CutGeometryError)) throw error;
					}
					let bestTips = cutTipCounts(exported(best).design);
					// A further chord can split the narrow notch of a solid letter such
					// as N. Reuse cached cells, then try one wider pair of grid contacts.
					// The original remains available if the joined cuts lose clearance.
					if (bestTips[1]) for (const inset of [bestInset, .2]) {
						try {
							const construction = generateCheckeredGrid(text, font, fill, inset,
								{ cache, variant, corners, optimize: true, relieve: true });
							const candidate = finish(construction, 'letters');
							const rounded = exported(candidate).design, tips = cutTipCounts(rounded);
							if (cutsBetter(candidate, best)) {
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
						return finish(generateCheckeredGrid(text, font, fill, inset, { cache, variant, corners, balanced: true }), 'letters');
					} catch (error) {
						if (!(error instanceof ConstructionError) && !(error instanceof CutGeometryError)) throw error;
						last = error;
					}
				}
				for (const inset of small ? [.35, .25] : [.35]) {
					let repaired = false;
					try {
						const construction = generateCheckeredGrid(text, font, fill, inset, {
							cache, variant, corners, repair: true, onRepair: () => { repaired = true; }
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
						return finish(generateMixedCheckeredGrid(text, font, { cache: mixed, previous: cache, variant, balanced, strokeTips, fill, corners }), 'letters');
					} catch (error) {
						if (!(error instanceof ConstructionError) && !(error instanceof CutGeometryError)) throw error;
						last = error;
					}
				}
				throw last;
			};
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
			const attempt = (variant: number, fill: number, corners: [number, number]) => {
				if (!caches.has(fill)) caches.set(fill, [checkeredGridCache(), mixedCheckeredGridCache()]);
				const [cache, mixed] = caches.get(fill)!;
				return checkered(variant, fill, cache, mixed, fill === standard ? finish
					: (construction, recipe) => finish(construction, recipe, false), corners);
			};
			// The first layout and size that weaves, with CORNER_INSETS or, with
			// `board`, corner cuts as large as paper printed at the download's width
			// asks for (`printCornerInsets`) on layouts of that board only.
			const search = (board?: number): GeneratorResult => {
				const corners = board ? printCornerInsets(board) : CORNER_INSETS;
				let last: unknown = new ConstructionError('clearance', 'No layout on this board');
				for (const fill of sized ? [standard] : [standard, standard * 1.05, standard * 1.1])
					for (let variant = 0; variant < Math.min(fill === standard ? variants : 1, layouts.length); variant++) {
						if (board && layouts[variant].matrix.length !== board) continue;
						try {
							// Compared as exported, after their shared connections are improved.
							const result = exported(attempt(variant, fill, corners));
							if (!sized && cutTipCounts(result.design)[1]) try {
								const larger = exported(attempt(0, standard * 1.05, corners));
								if (cutsBetter(larger, result)) return larger;
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
			};
			// Where that heart's paper tears at print size, larger corner cuts on
			// its board, in any of its layouts and sizes, and the better of the two
			// (`cutsBetter`): never another board, and never worse.
			const plain = search();
			const board = plain.design.gridSize.x;
			if (!paperTears(plain.design) || printCornerInsets(board)[0] === CORNER_INSETS[0]) return plain;
			try {
				const print = search(board);
				return cutsBetter(print, plain) ? print : plain;
			} catch (error) {
				if (!(error instanceof ConstructionError) && !(error instanceof CutGeometryError)) throw error;
				return plain;
			}
		}
		const text = request.text ?? '';
		const font = request.font;
		const shape = textPanel(frame);
		const size = request.letterScale ?? 1;
		const recipes: Array<() => ReturnType<typeof generateTextGrid> | ReturnType<typeof generateCheckedText> | undefined> = text.includes('\n') ? [] : [
			() => generateCheckedText(text, font, textRoom(request), shape, request.fittedCells, size)
		];
		recipes.push(() => generateTextGrid(text, font, textRoom(request), shape, { fittedCells: request.fittedCells, letterScale: size }));
		// On the regular board the cells cannot grow, but a letter can be a
		// little larger inside its cell; its connections then meet it elsewhere.
		// A figure keeps the size the visitor asked for (see `frameAlternatives`).
		const regularGrid = !request.fittedCells && (frame === 'woven' || frame === 'air');
		// How a recipe shows the letters, where it differs from as asked.
		const looks = new Map<(typeof recipes)[number], string>();
		if (regularGrid && request.letterScale === undefined) for (const letterScale of [1.05 * size, 1.1 * size]) {
			recipes.push(text.includes('\n')
				? () => generateTextGrid(text, font, textRoom(request), shape, { letterScale })
				: () => generateCheckedText(text, font, textRoom(request), shape, false, letterScale));
			looks.set(recipes.at(-1)!, `larger ${letterScale}`);
		}
		// Give difficult counters/shoulders more room, and spread the projections
		// around the frame. The requested font, frame and text are retained.
		// Text with that much room already has it, and no decorative frame. On
		// the regular board more room makes a letter smaller in its cell, so a
		// figure there keeps the size asked for instead.
		if (roomOf(textRoom(request)) < .5 && !(regularGrid && request.letterScale !== undefined)) {
			recipes.push(() => generateTextGrid(text, font, false, shape, { fittedCells: request.fittedCells, letterScale: request.letterScale,
				padding: .5,
				spread: true
			}));
			looks.set(recipes.at(-1)!, 'padded');
		}
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
				if (padding) looks.set(bent, 'padded');
			}
		}
		// A letter or motif of several pieces is reached every way the board
		// circle's are (see `withEveryWay`): a refused one tries again so.
		const pieced = [...new Set(text.replace(/\s/g, ''))].some(char => forest(font.glyphs[char]?.contours ?? []).length > 1);
		if (everyWay && pieced) for (const around of [false, true])
			recipes.push(() => generateTextGrid(text, font, textRoom(request), shape, { fittedCells: request.fittedCells, letterScale: request.letterScale,
				spread: true, practical: true, compound: true, nested: true, bases: true, around }));
		let last: unknown;
		// The recipes differ in how the letters' cuts spread over panels and
		// route to their gates, unseen: of a text's first few, the best paper.
		// A motif in the board frames' cells (sized by `letterScale`) compares
		// its first three: its several choices each make more.
		const tried = allRecipes && !regularGrid ? recipes : recipes.filter(recipe => !fittedOnly.has(recipe));
		// Only those that show the letters as the first to finish does.
		let look: string | undefined;
		const best = bestOfFirst((function* () {
			for (const construct of tried) {
				if (look !== undefined && (looks.get(construct) ?? '') !== look) continue;
				try {
					const result = construct();
					if (result) {
						const done = finish(result, 'letters');
						look ??= looks.get(construct) ?? '';
						yield done;
					}
				}
				catch (error) {
					if (!(error instanceof ConstructionError) && !(error instanceof CutGeometryError)) throw error;
					if (error instanceof ConstructionError && ['empty', 'character'].includes(error.code)) throw error;
					last = error;
				}
			}
		})(), request.letterScale === undefined ? 4 : 3, true);
		if (best) return best;
		if (!everyWay && pieced) everyWayPassed++;
		throw last;
	}
	if (request.style === 'layers') {
		const layouts = [undefined, ...[false, true].flatMap(filled =>
			[[1, 2], [2, 1], [2, 2], [3, 2]].map(([columns, rows]) => ({ columns, rows, filled })))];
		// The panels divide the motif unseen: of the first few, the best paper.
		const best = bestOfFirst((function* () {
			for (const panels of layouts) {
				try {
					yield finish(generateLayeredFigure(request.contours ?? [], request.frameSize, request.scale, panels), 'nested');
				} catch (error) {
					if (!(error instanceof ConstructionError) && !(error instanceof CutGeometryError)) throw error;
				}
			}
		})());
		// Where its paper tears printed, the panels again with the motif's
		// connections a paper's width off; kept only where they hold better.
		if (best && paperTears(exported(best).design)) {
			const again = bestOfFirst((function* () {
				for (const panels of layouts) try {
					yield finish(generateLayeredFigure(request.contours ?? [], request.frameSize, request.scale, panels, paperRoute), 'nested', false);
				} catch (error) {
					if (!(error instanceof ConstructionError) && !(error instanceof CutGeometryError)) throw error;
				}
			})());
			if (again && cutsBetter(again, best, true)) return again;
		}
		if (best) return best;
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
		// equally large, at the radii the board allows (`boardRanges`). Up to the
		// circle touching the outer ring of squares, the outer lines cross the
		// paper whole or follow the circle, and the undivided motif meets the
		// middle lines like a letter in the circle frame. Reaching into the outer
		// ring, like the gallery's santa, the circle meets every line, and the
		// motif, divided like a letter into four panels, meets the lines' ends in
		// pairs. The panels meet at its centre, or else at a point of background
		// near it, so their seams cross its paper but not each other. On finer
		// boards a larger circle reaches a third line a side, which follows it
		// (see `boardLegs`).
		const contours = normalizeContours(request.contours ?? []);
		const font: Font = { glyphs: { [MOTIF]: { advance: 1, contours } } };
		const xs = contours.flat().map(p => p[0]), ys = contours.flat().map(p => p[1]);
		const middle: Point = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
		const box = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
		const gap = request.gap ?? 3, compound = { practical: true, compound: true };
		// The size setting sizes the circle (see `boardRadius`); the motif fills
		// the circle up to the space asked for.
		// The board's strips, five unless the visitor chose (see `boardRanges`).
		const strips = request.board ?? 5, ranges = boardRanges(strips), panels = (range: readonly [number, number]) => boardPanels(range, strips);
		const [small, large, past] = ranges, { radius, range } = boardRadius(request.scale ?? .7, strips);
		// The motif sits on its box's centre, or over the corner squares, where
		// it cuts cleanly so in the largest circle, on its smallest enclosing
		// circle's, which lets it fill the circle further (see below).
		type Placement = { centre: Point; reach: number; enclosed?: boolean };
		const boxed: Placement = { centre: middle, reach: Math.max(...contours.flat().map(p => distance(p, middle))) / box };
		// The slower compound routing only where the panels meet at the centre.
		const background = backgroundJunctions(contours);
		let squared: Point[] | undefined;
		// Panels holding separate pieces of the motif (an animal's legs) join
		// them like a letter's dots and islands. These come after every other
		// division, so a motif that divides without them keeps its cuts.
		const islands = { ...compound, boundaryIslands: true, contourApproaches: true, guardedAttachments: true, filled: true, guardSeams: true };
		// A seam through a corner of the outline, or nearly (a star's tip
		// straight above its centre), cannot be built, or halves the tip into
		// slivers: at the size itself, after every other division, it is tried
		// a fiftieth of the motif beside the corner, either way. A last resort,
		// it decides nothing below (whether the motif is divided, where it
		// sits).
		const near = .02 * box, corners = contours.flat();
		const beside = (centre: Point, junction: Point): Point[] => ([0, 1] as const).flatMap(axis => {
			const at = centre[axis] + junction[axis], corner = corners.reduce((best, p) => Math.abs(p[axis] - at) < Math.abs(best - at) ? p[axis] : best, Infinity);
			if (Math.abs(corner - at) >= near) return [];
			return [-1, 1].map(side => corner + side * near - centre[axis])
				.filter(moved => corners.every(p => Math.abs(p[axis] - centre[axis] - moved) >= near / 2))
				.map((moved): Point => axis ? [junction[0], moved] : [moved, junction[1]]);
		});
		// Every way of reaching the motif's pieces, after every other way, as a
		// last resort (see `withEveryWay`): the gates' spokes meet each other
		// piece in turn (of three in a row, the middle one), islands in a
		// ring's hole are reached round either attachment, and a motif kept
		// whole has spokes go round the pieces in their way (a back card hiding
		// the front one from two gates).
		const pieces = forest(contours), rest = (layouts: object[]) => everyWay ? [layouts.map(layout => ({ ...compound, nested: true, bases: true, ...layout }))] : [];
		const layouts = (range: readonly [number, number], { centre }: Placement, whole = false, atSize = false) => {
			if (whole || panels(range) === 1) return [[{}, compound], ...rest([{}, ...pieces.length > 1 ? [{ around: true }] : []])];
			const junctions = background.map((p): Point => [p[0] - centre[0], p[1] - centre[1]]);
			const moved = atSize ? [[0, 0] as Point, ...junctions].flatMap(junction => beside(centre, junction)) : [];
			return [[{ columns: 2, slices: 2 }, { ...compound, columns: 2, slices: 2 }, ...junctions.map(junction => ({ columns: 2, slices: 2, junction }))],
				[undefined, ...junctions].map(junction => ({ ...islands, columns: 2, slices: 2, ...junction && { junction } })),
				...moved.length ? [moved.map(junction => ({ columns: 2, slices: 2, junction }))] : [],
				// A seam through the motif's farthest point in a panel's direction
				// (a star's point on its axis) can meet that panel's gate there;
				// with the seams guarded, the gate keeps off it. Only at the size
				// itself, after the others, so no heart cut without them changes.
				...atSize ? [[undefined, ...junctions, ...moved].map(junction => ({ columns: 2, slices: 2, guardSeams: true, ...junction && { junction } }))] : [],
				// Then through the points of its background where the seams cross
				// its outline most nearly square (a dove's wing otherwise meets one
				// almost along it), with the seams guarded or not.
				...atSize ? [(squared ??= squareJunctions(contours)).map((p): Point => [p[0] - centre[0], p[1] - centre[1]])
					.flatMap(junction => [{ columns: 2, slices: 2, junction }, { columns: 2, slices: 2, guardSeams: true, junction }])] : [],
				...rest([undefined, ...junctions].map(junction => ({ columns: 2, slices: 2, ...junction && { junction } })))];
		};
		// A circle wider than the paper leaves the motif no more room than the paper.
		const fills = (radius: number, { reach }: Placement, factor = 1, space = gap, whole = false) =>
			((whole ? boardWholeFill : boardFill)(radius, strips) - Math.max(space, 1.5)) * factor / reach / box;
		// Only the invisible partition varies: where four panels meet, the
		// routing, and the padding of the motif's cell, which gives its
		// connections room: the usual, else little. (Gates the circle passes
		// inside of move in, see `generateTextGrid`.)
		// Where the circle covers the middle lines whole, only the outer ones
		// remain (see `boardRanges`).
		const sizes = (range: readonly [number, number], radius: number, placement = boxed, given?: number, whole = false, atSize = false) => {
			const scale = given ?? fills(radius, placement, 1, gap, whole);
			// A motif kept whole keeps every line (see `WHOLE_PATTERNS`).
			const lines = whole ? boardLines(strips) : boardRangeLines(range, strips), covered = lines.length < boardLines(strips).length;
			const completion = whole ? boardWholePattern(radius, strips) : boardRangePattern(range);
			return layouts(range, placement, whole, atSize).flatMap(list => [.22, .05].flatMap(padding =>
				list.map(layout => ({ radius, scale, layout: { padding, ...layout, ...placement.enclosed && { centre: placement.centre }, ...covered && { lines }, ...completion && { completion } } }))));
		};
		const build = ({ radius, scale, layout }: ReturnType<typeof sizes>[number]): Construction => {
			const construction = generateTextGrid(MOTIF, font, false, 'circle', { ...layout, board: strips, circle: 2 * radius, scale });
			audit(construction.edges);
			return layout.lines ? { ...construction, strips: 2 * layout.lines.length + 1 } : construction;
		};
		// Whether the motif can be built this way at all is decided once, at
		// sizes of the range's own: one that cannot be kept whole, or divided in
		// four at both, takes the other construction at its size nearest the
		// touching circle, whatever the slider. Its shape decides, not the
		// space asked for: more than the usual would leave it too small there.
		// Where the circle covers the middle lines, the motif is divided at its
		// size there, more than twice that in the touching ring on finer boards.
		const home = (range: readonly [number, number]) => panels(range) === 1 ? small
			: boardRangeLines(range, strips).length < boardLines(strips).length || boardRangePattern(range) ? range : large ?? small;
		const references = (range: readonly [number, number]) => {
			const [low, high] = home(range);
			return home(range) === small ? [Math.round((low + high) / 2)] : [.25, .75].map(t => Math.round(low + t * (high - low)));
		};
		const buildable = (range: readonly [number, number]) => references(range)
			.every(reference => sizes(home(range), reference, boxed, fills(reference, boxed, 1, Math.min(gap, 3))).some(attempt => {
				try {
					build(attempt);
					return true;
				} catch (error) {
					if (!(error instanceof ConstructionError)) throw error;
					return false;
				}
			}));
		// One that cannot be divided in four is kept whole in the touching ring
		// too, the outer lines following the circle while the other sheet's
		// middle lines cross them to the motif, out to the corner junctions,
		// and there past them; else it keeps the touching circle.
		const wholeBuildable = () => !!large && references(large).every(reference =>
			sizes(large, reference, boxed, fills(reference, boxed, 1, Math.min(gap, 3)), true).some(attempt => {
				try {
					build(attempt);
					return true;
				} catch (error) {
					if (!(error instanceof ConstructionError)) throw error;
					return false;
				}
			}));
		// Where the middle lines are left out, it is divided only if it is in
		// every range further out too, so it does not shrink back.
		const covered = boardRangeLines(range, strips).length < boardLines(strips).length || !!boardRangePattern(range);
		const divided = !large || (covered ? ranges.slice(ranges.indexOf(range)).reverse().every(buildable) : buildable(range));
		const whole = !divided && range !== small && wholeBuildable();
		const [mode, size] = divided ? [range, radius] : range === small ? [large, large[0] + .6]
			: whole ? [large, boardWholeRadius(radius, strips)] : [small, small[1]];
		// Over the corner squares, whether the motif sits on its enclosing
		// circle is decided once, in the largest circle, so it only grows with
		// the setting: there a deer's antler and hooves reach equally far, but a
		// star's five tips all come close to the circle's connections.
		// It moves there over the sizes from 85%, so it does not jump; on finer
		// boards the circle short of the next lines out decides.
		const enclosed: Placement = { ...boardPlacement(contours), enclosed: true };
		// Out past the paper's edges, where the middle lines are left out, the
		// largest circle there decides.
		const deciding = home(mode) === mode ? mode : past;
		const placement = ranges.indexOf(mode) > 1 && enclosedAlong(request.scale ?? .7) > 0 && sizes(deciding, deciding[1], enclosed).some(attempt => {
			try {
				finish(build(attempt), 'nested', false);
				return true;
			} catch (error) {
				if (!(error instanceof ConstructionError) && !(error instanceof CutGeometryError)) throw error;
				return false;
			}
		}) ? { ...boardPlacement(contours, enclosedAlong(request.scale ?? .7)), enclosed: true } : boxed;
		// The size setting the other construction's circle stands for, and
		// whether the motif sits on its enclosing circle, for the picture.
		// A clean heart's shared cuts that meet the motif in a sharp tip of
		// paper bend to cross it instead, where that leaves fewer such tips and
		// every strip as wide (see `improveSharedConnections`).
		const kept = (cut: GeneratorResult): GeneratorResult => {
			const result = cut.hardToCut ? cut : improveSharedConnections(cut);
			return {
				...size === radius && (mode === range || whole) ? result : { ...result, scale: boardSetting(size, strips) },
				...placement.enclosed && { enclosed: true },
				...whole && { whole: true },
				...result.design.gridSize.x !== strips && { board: strips }
			};
		};
		// The circle and the motif keep the sizes the setting gives them, so
		// both only grow with it: cut cleanly if they can be, else as hard to
		// cut. Only where nothing at all can be finished at those sizes does the
		// motif shrink a little, and then the circle grow a little.
		const nearby = [size + 1.5, size + 3].map(other => Math.min(mode[1], other))
			.filter(other => other - size > .5 && boardLines(strips).every(line => Math.abs(other - line) > .1));
		// Of the first few working cuts, the one whose paper holds best, then
		// with the fewest tips (`cutsBetter`): the attempts differ only in the
		// invisible partition, so the picture stays. Tips first would leave the
		// star at 73% on five strips needing a print 170 mm wide rather than 140.
		let last: unknown;
		for (const attempts of [sizes(mode, size, placement, undefined, whole, true), [.85, .7].flatMap(factor => sizes(mode, size, placement, fills(size, placement, factor, gap, whole), whole, true)),
			nearby.flatMap(other => sizes(mode, other, placement, undefined, whole, true))]) {
			const rejected: Parameters<typeof hardToCutResult>[1] = [];
			let best: GeneratorResult | undefined, rawTips: [number, number] | undefined;
			// Where the best of them tears, those that worked again with the
			// motif's connections kept as far from it as paper holds printed;
			// where it still does, with the circle's legs meeting the motif a
			// third or two thirds of the way out from it rather than halfway.
			const worked: typeof attempts = [];
			const again = (pass: number) => pass === 1
				? worked.map(({ layout, ...attempt }) => ({ ...attempt, layout: { ...layout, margin: PAPER_NECK_MM / PRINT_WIDTH_MM * 100 } }))
				: worked.flatMap(({ layout, ...attempt }) => [.3, .7].map(gate => ({ ...attempt, layout: { ...layout, gate } })));
			// The gates move on five strips only: on finer boards, where most
			// tear printed whatever they do, that bought little for its time.
			for (const pass of strips === 5 ? [0, 1, 2] : [0, 1]) {
				if (pass && (!best || !paperTears(exported(best).design))) break;
				let working = 0;
				for (const attempt of pass ? again(pass) : attempts) try {
					const construction = build(attempt);
					// Worse tips before the curve fitting are skipped, unless the
					// best so far tears.
					const tips = cutTipCounts(construction.geometry);
					if (rawTips && best && !paperTears(exported(best).design) && !fewerCutTips(tips, rawTips)) continue;
					rejected.push({ construction, recipe: 'nested' });
					const candidate = finish(construction, 'nested');
					if (!pass) worked.push(attempt);
					if (!best || cutsBetter(candidate, best, true)) [best, rawTips] = [candidate, tips];
					if (!paperTears(exported(best).design) && !cutTipCounts(exported(best).design)[1] || ++working === 4) break;
				} catch (error) {
					if (!(error instanceof ConstructionError) && !(error instanceof CutGeometryError)) throw error;
					last = error;
				}
			}
			// Where it still has a needle, those that worked again with the cuts
			// that would meet the circle's gates at a slant stepping in to them
			// straight (see `boardLegs`); kept only where they cut better.
			const stepped = worked.map(({ layout, ...attempt }) => ({ ...attempt, layout: { ...layout, stepIn: true } }));
			if (best && cutTipCounts(exported(best).design)[0]) for (const attempt of stepped) try {
				const candidate = finish(build(attempt), 'nested');
				if (cutsBetter(candidate, best, true)) best = candidate;
			} catch (error) {
				if (!(error instanceof ConstructionError) && !(error instanceof CutGeometryError)) throw error;
			}
			if (best) return kept(best);
			const hard = hardToCutResult(request, rejected, curveFitter);
			// Shared cuts meeting the motif's outline in a narrow point can bend
			// to cross it instead (see `curveSharedCuts`), where only that keeps
			// the heart from being hard to cut: in the first few constructions
			// tried, where it nearly always does if it can.
			if (hard?.hardToCut) for (const { construction, recipe } of rejected.slice(0, 4)) {
				const geometry = curveSharedCuts(construction.geometry);
				if (!geometry) continue;
				try {
					return kept(finishConstruction(request, construction, recipe, geometry, curveFitter));
				} catch (error) {
					if (!(error instanceof ConstructionError) && !(error instanceof CutGeometryError)) throw error;
				}
			}
			if (hard) return kept(hard);
		}
		// A motif of several pieces, or with islands in its holes, may still
		// be reached another way (see `withEveryWay`).
		if (!everyWay && (pieces.length > 1 || pieces.some(piece => piece.children.some(hole => hole.children.length)))) everyWayPassed++;
		// Over the corner squares, a motif that cannot be built at all at its
		// size keeps the largest circle short of them, at 85% on five strips, and
		// so on past each junction further out; with more space than usual, one
		// divided in four that fits nowhere in its circle keeps the touching
		// circle, as one that cannot be divided does.
		const smaller = (scale: number) => {
			const result = generateUsingRecipes({ ...request, scale }, onRejected, curveFitter, variants, allRecipes);
			return { ...result, scale: result.scale ?? scale };
		};
		try {
			const at = ranges.indexOf(mode);
			if (at > 1) return smaller(boardSteps(strips)[at - 2][1] / 100);
			if (mode === large && (gap > 3 || whole)) return smaller(.7);
		} catch (error) {
			if (!(error instanceof ConstructionError) && !(error instanceof CutGeometryError) || strips === 5) throw error;
			last = error;
		}
		// A motif that cannot be built at all on the strips the visitor chose
		// (on three, one that must be divided) is shown on the frame's own five,
		// as the page then says.
		if (strips !== 5) return generateUsingRecipes({ ...request, board: undefined }, onRejected, curveFitter, variants, allRecipes);
		throw last;
	}
	if (request.style === 'corners') {
		let last: unknown;
		// The layouts route the lanes unseen: of the first few, the best paper.
		// One fitting the border narrows the outer strips, a picture of its
		// own: only where none of the others finish.
		const fitted = new Set<GeneratorResult>();
		const layouts = (routeMargin = 0, avoid = false, border?: boolean, wholeLanes = false, stepped = false) => bestOfFirst((function* () {
			let finished = false;
			for (const [routing, fitBorder, bentSpokes] of CORNER_LAYOUTS) for (const holdLegs of [true, false]) {
				if (fitBorder && finished) return;
				if (border !== undefined && fitBorder !== border) continue;
				try {
					const result = generateCornerChecks(request.contours ?? [], request.frameSize, request.scale, routing, fitBorder, bentSpokes,
						undefined, undefined, request.gap, routeMargin > 0, holdLegs, routeMargin, avoid, wholeLanes, stepped);
					// Keep the established frame and skip another fit when moving
					// separate components did not change any lane or connection.
					if (routing === 'separated' && !result.separated || fitBorder && !result.borderAdjusted) continue;
					const done = finish(result, 'silhouette', !routeMargin);
					finished = true;
					if (fitBorder) fitted.add(done);
					yield done;
				} catch (error) {
					if (!(error instanceof ConstructionError) && !(error instanceof CutGeometryError)) throw error;
					if (!routeMargin) last = error;
				}
			}
		})());
		// The lanes' routes passing the other lanes' parts of the motif only
		// where none of the plain ones finish (the elephant).
		let best = layouts(), avoided = false, stepped = false;
		if (!best) [best, avoided] = [layouts(0, true), true];
		// Where none of those finish either, the side lanes reach the parts of
		// the motif in them one at a time (the polar star's wedges, a straight
		// link between two of which crosses its point).
		if (!best) [best, avoided, stepped] = [layouts(0, false, undefined, false, true), false, true];
		// Where its paper tears printed, the layouts with the same border again
		// with the motif's connections, and the side lanes' legs, a paper's
		// width off, kept where they hold better; where that still tears, with
		// an empty side lane's whole line bent too (a mitten's thumb against
		// it), which elsewhere can bend into another part (a bird's wing).
		if (best && paperTears(exported(best).design)) {
			const paper = PAPER_NECK_MM / PRINT_WIDTH_MM * 100, border = fitted.has(best);
			for (const wholeLanes of [false, true]) {
				if (wholeLanes && !paperTears(exported(best).design)) break;
				const again = layouts(paper, avoided, border, wholeLanes, stepped);
				if (again && cutsBetter(again, best, true)) best = again;
			}
		}
		if (best) return best;
		throw last;
	}
	const open = openFrame(request);
	if (open) {
		// How each finished heart was made, to make it again a paper's width off.
		const made = new Map<GeneratorResult, (route: typeof fourPortMotif) => Construction>();
		const single = (symmetric: GateTies, angles?: [number, number, number, number], axisGap = 0, onMiddle = false) => {
			const construct = (route: typeof fourPortMotif) => generateFittedFigure(request.contours ?? [], request.frameSize, request.scale, route,
				angles, 0, open, symmetric, axisGap, onMiddle);
			for (const route of [fourPortMotif, originalFourPortMotif]) {
				let constructed = false;
				try {
					const construction = construct(route);
					constructed = true;
					const result = finish(construction, 'silhouette');
					made.set(result, construct);
					return result;
				}
				catch (error) {
					if (!(error instanceof ConstructionError) && !(error instanceof CutGeometryError)) throw error;
					if (!constructed && !(error instanceof CompilationError)) break;
				}
			}
		};
		// Where its paper tears printed, the same gates with the motif's
		// connections a paper's width off; kept only where they hold better.
		const held = (result: GeneratorResult) => {
			const construct = made.get(result);
			if (!construct || !paperTears(exported(result).design)) return result;
			try {
				const again = finish(construct(paperRoute), 'silhouette', false);
				return cutsBetter(again, result, true) ? again : result;
			} catch (error) {
				if (!(error instanceof ConstructionError) && !(error instanceof CutGeometryError)) throw error;
				return result;
			}
		};
		// Symmetric gates come first, kept only without needle-sharp paper.
		// A motif that is its own mirror image keeps symmetric gates wherever
		// any finish: those on the heart's middle further out, or those beside
		// it turned alike, with the fewest needle-sharp tips. Otherwise every
		// construction uses the motif's own extreme points.
		const balanced = single(true);
		if (balanced && !cutTipCounts(balanced.design)[0]) return held(balanced);
		if (mirrorSymmetric(normalizeContours(request.contours ?? []))) {
			let best = balanced;
			for (const { ties = true, angles, axisGap, onMiddle } of SYMMETRIC_GATES) {
				const result = single(ties, angles, axisGap, onMiddle);
				if (result && (!best || fewerCutTips(cutTipCounts(result.design), cutTipCounts(best.design)))) best = result;
				if (best && !cutTipCounts(best.design)[0]) break;
			}
			if (best) return held(best);
		}
		const extreme = single(false);
		if (extreme) return held(extreme);
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
		size = sunburst ? outerSize * (request.crown ?? .8) : outerSize,
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
	// Of the first few that finish, the best paper (`bestOfFirst`): they differ
	// only in how the motif's cuts spread over its panels, so the picture stays.
	let best = bestOfFirst((function* () {
		for (const route of [fourPortMotif, originalFourPortMotif, balancedFourPortMotif])
		for (const construct of route === balancedFourPortMotif ? balancedRecipes : recipes) {
			if (route === originalFourPortMotif && (!retryOriginal.has(construct) || construct === baseFigure)) continue;
			let constructed = false;
			try {
				const construction = construct(route);
				constructed = true;
				yield finish(
					sunburst ? sunburstBorder(construction, outerSize, request.crown) : construction,
					rings.length === 1 ? 'silhouette' : 'nested'
				);
			} catch (e) {
				if (!(e instanceof ConstructionError) && !(e instanceof CutGeometryError)) throw e;
				if (constructed || e instanceof CompilationError) retryOriginal.add(construct);
				errors.push(e);
			}
		}
	})());
	// Where its paper tears printed, the recipes again with the motif's
	// connections kept a paper's width from the cuts beside them, as on the
	// board (see `PAPER_NECK_MM`); kept only where they hold better.
	if (best && paperTears(exported(best).design)) {
		const again = bestOfFirst((function* () {
			for (const construct of recipes) try {
				const construction = construct(paperRoute);
				yield finish(sunburst ? sunburstBorder(construction, outerSize, request.crown) : construction, rings.length === 1 ? 'silhouette' : 'nested', false);
			} catch (e) {
				if (!(e instanceof ConstructionError) && !(e instanceof CutGeometryError)) throw e;
			}
		})());
		if (again && again.design.gridSize.x === best.design.gridSize.x && cutsBetter(again, best, true)) best = again;
	}
	if (best) return best;
	// A uniform seam can graze a motif's tip. Shift one modest three-panel layout
	// within its cells before refusing the figure, keeping its exact outline.
	try {
		const construction = generatePanelFigure(rings, shape, size, scale, 3, style, 1, false, fourPortMotif, 'support', true);
		return finish(sunburst ? sunburstBorder(construction, outerSize, request.crown) : construction, rings.length === 1 ? 'silhouette' : 'nested');
	} catch (error) {
		if (!(error instanceof ConstructionError) && !(error instanceof CutGeometryError)) throw error;
		errors.push(error);
	}
	if (hasCounterContact(rings)) for (const construct of balancedRecipes) {
		try {
			const construction = construct(touchingFourPortMotif);
			return finish(sunburst ? sunburstBorder(construction, outerSize, request.crown) : construction, 'nested');
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
			return finish(sunburst ? sunburstBorder(construction, outerSize, request.crown) : construction, rings.length === 1 ? 'silhouette' : 'nested');
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
			return finish(sunburst ? sunburstBorder(construction, outerSize, request.crown) : construction, rings.length === 1 ? 'silhouette' : 'nested');
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
			return finish(sunburst ? sunburstBorder(construction, outerSize, request.crown) : construction, 'nested');
		} catch (error) {
			if (!(error instanceof ConstructionError) && !(error instanceof CutGeometryError)) throw error;
			errors.push(error);
		}
	}
	// A motif of several pieces, or with islands in its holes, may still be
	// reached the ways the board circle's are (see `withEveryWay`): a refused
	// one tries again so, on the first layouts.
	const pieces = forest(rings), pieced = pieces.length > 1 || pieces.some(piece => piece.children.some(hole => hole.children.length));
	if (pieced && everyWay) for (const around of [false, true]) for (const construct of balancedRecipes) {
		try {
			const construction = construct((...args) => {
				args[7] = { ...args[7], practical: true, compound: true, nested: true, around };
				return fourPortMotif(...args);
			});
			return finish(sunburst ? sunburstBorder(construction, outerSize, request.crown) : construction, rings.length === 1 ? 'silhouette' : 'nested');
		} catch (error) {
			if (!(error instanceof ConstructionError) && !(error instanceof CutGeometryError)) throw error;
			errors.push(error);
		}
	}
	if (pieced && !everyWay) everyWayPassed++;
	const last = errors.at(-1)!;
	throw new ConstructionError(
		last instanceof ConstructionError ? last.code : 'clearance',
		errors.map((e) => e.message).join('; ')
	);
}
