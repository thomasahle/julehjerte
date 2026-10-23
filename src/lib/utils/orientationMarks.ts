/**
 * Orientation marks on the templates — after Gerth Stølting Brodal's
 * generator (cs.au.dk/~gerth/julehjerter), where one piece carries a small
 * circled cross ⊗ and the other a plain ×, and the weaver lays the two pieces
 * so the crosses lie on top of each other. docs/redesign/DOWNLOAD.md,
 * "Orientation marks".
 *
 * Why one mark per piece is enough. A folded piece fits its place in the heart
 * in two ways: as cut, or turned over (rotated half a turn about its long axis,
 * which swaps its two layers and its two long edges). The two layers were cut
 * together, so turning it over shows the template mirrored about its long
 * axis, `x → W − x`. Which face of the paper is out, and which layer is in
 * front, change nothing else. So a piece whose template is its own mirror
 * image can go in either way, and any other piece has exactly one right way,
 * fixed by putting one corner of it in one place.
 *
 * The place is the top of the heart, where the two rounded ends meet. In the
 * editor's frame (`$lib/rendering/svgWeave`, drawn turned 45° clockwise) the
 * overlap square's top-left corner (left, top) is that point: the left lobe's
 * ear lies to the left of the square and the right lobe's above it, and both
 * ears' bases end there. `getTemplateData` maps that corner to (0, R) on both
 * lobes' templates — the left side of the piece, at the ear base — because the
 * left lobe's template takes the square's y as its x and the right lobe's
 * takes x as x. So on its own template each lobe's mark sits by the left
 * side, just below the ear base, and in the woven heart both marks meet at
 * the top: lay them on top of each other and each piece is the right way
 * round. (Laid the other way, a piece's mark lands at the outer corner of its
 * lobe instead.)
 *
 * Which piece goes left does not matter to the paper: a heart turned over has
 * its pieces swapped and is the same heart. It only decides which face is the
 * front, the face the site shows; the left lobe's piece carries ⊗ and the
 * right lobe's ×, so seen with ⊗ on the left the heart looks as on the site.
 *
 * A shared template (`lobesShareTemplate`) is printed from one lobe's
 * template and used for both. The other lobe's own template is either the
 * same (the lobes are mirror images across the square's diagonal) or its
 * mirror image (the right lobe is the left one turned 90°, as Per V.
 * Mortensen's Kroge): then the piece used for that lobe goes in turned over,
 * and its mark moves to the right side, (W, R).
 */
import type { HeartDesign, Vec } from '$lib/types/heart';
import { lobesShareTemplate } from '$lib/utils/symmetry';
import { getTemplateData, type TemplateLobe } from '$lib/utils/templateSvg';

export type MarkKind = 'circled' | 'plain';

/** The mark of each lobe: ⊗ for the left lobe's piece, × for the right's. */
export const MARK_KIND: Record<TemplateLobe, MarkKind> = { left: 'circled', right: 'plain' };

/** The mark's circle, in millimetres on paper: about 3 mm across. */
export const MARK_RADIUS_MM = 1.5;
/**
 * The sizes tried, largest first, each with the room it keeps free from the
 * cuts and the piece's side: a narrow strip at the corner (Amy's Weave 1 at
 * 40 mm has one 2.5 mm wide) gets a smaller mark rather than none.
 */
const MARK_TIERS: ReadonlyArray<{ radiusMm: number; clearanceMm: number }> = [
	{ radiusMm: MARK_RADIUS_MM, clearanceMm: 0.7 },
	{ radiusMm: 1.2, clearanceMm: 0.6 },
	{ radiusMm: 0.9, clearanceMm: 0.5 },
	{ radiusMm: 0.75, clearanceMm: 0.4 }
];
/** From the piece's side to the mark's edge, at least, and from the ear base. */
const SIDE_GAP_MM = 1.1;
const BASE_GAP_MM = 1.1;

/**
 * How far two templates' cuts may lie apart and still be the same piece, as a
 * fraction of the template's width: 2 %, about the 5 px `$lib/utils/symmetry`
 * allows on a gallery heart (a few hundred units wide), and the slack of the
 * hand-drawn designs (Stjerneramme's lobes are 675 and 671.4 units long).
 */
const SAME_PIECE_TOLERANCE = 0.02;

/** Points along a cut, every few hundredths of the template's width. */
type Polyline = Vec[];

function cubicPoint(p0: Vec, p1: Vec, p2: Vec, p3: Vec, t: number): Vec {
	const u = 1 - t;
	const a = u * u * u;
	const b = 3 * u * u * t;
	const c = 3 * u * t * t;
	const d = t * t * t;
	return { x: a * p0.x + b * p1.x + c * p2.x + d * p3.x, y: a * p0.y + b * p1.y + c * p2.y + d * p3.y };
}

/** The absolute M / L / C path data `getTemplateData` writes, sampled. */
export function samplePathData(d: string, steps = 24): Polyline[] {
	const lines: Polyline[] = [];
	let current: Polyline | null = null;
	let at: Vec = { x: 0, y: 0 };
	for (const command of d.match(/[MLC][^MLC]*/gi) ?? []) {
		const n = command.slice(1).trim().split(/[\s,]+/).filter(Boolean).map(Number);
		const type = command[0]!.toUpperCase();
		if (type === 'M') {
			at = { x: n[0]!, y: n[1]! };
			current = [at];
			lines.push(current);
		} else if (type === 'L') {
			for (let i = 0; i + 1 < n.length; i += 2) {
				at = { x: n[i]!, y: n[i + 1]! };
				current?.push(at);
			}
		} else {
			for (let i = 0; i + 5 < n.length; i += 6) {
				const c1 = { x: n[i]!, y: n[i + 1]! };
				const c2 = { x: n[i + 2]!, y: n[i + 3]! };
				const to = { x: n[i + 4]!, y: n[i + 5]! };
				for (let k = 1; k <= steps; k++) current?.push(cubicPoint(at, c1, c2, to, k / steps));
				at = to;
			}
		}
	}
	return lines.filter((line) => line.length > 1);
}

function distanceToSegment(p: Vec, a: Vec, b: Vec): number {
	const dx = b.x - a.x;
	const dy = b.y - a.y;
	const len2 = dx * dx + dy * dy;
	const t = len2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0;
	return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** How far `p` is from the nearest of `lines`. */
export function distanceToLines(p: Vec, lines: readonly Polyline[]): number {
	let best = Infinity;
	for (const line of lines) {
		for (let i = 1; i < line.length; i++) best = Math.min(best, distanceToSegment(p, line[i - 1]!, line[i]!));
	}
	return best;
}

/**
 * The farthest any point of one set of cuts lies from the other set, both ways
 * (the Hausdorff distance of the sampled cuts). The other set's pieces are
 * filed by squares, and a point looks at the squares around its own, ring by
 * ring, until no farther piece could be nearer; it stops as soon as it is
 * nearer than the worst so far. A detailed heart (Fisk og kors) has some ten
 * thousand points a side.
 */
export function cutDistance(a: readonly Polyline[], b: readonly Polyline[]): number {
	const all = [...a, ...b].flat();
	if (!all.length) return 0;
	const size = Math.max(
		Math.max(...all.map((p) => p.x)) - Math.min(...all.map((p) => p.x)),
		Math.max(...all.map((p) => p.y)) - Math.min(...all.map((p) => p.y)),
		1e-9
	) / 64;
	const cell = (v: number) => Math.floor(v / size);
	let worst = 0;
	for (const [from, to] of [
		[a, b],
		[b, a]
	] as const) {
		const filed = new Map<string, [Vec, Vec][]>();
		let reach = 0;
		for (const other of to)
			for (let i = 1; i < other.length; i++) {
				const [p, q] = [other[i - 1]!, other[i]!];
				for (let x = cell(Math.min(p.x, q.x)); x <= cell(Math.max(p.x, q.x)); x++)
					for (let y = cell(Math.min(p.y, q.y)); y <= cell(Math.max(p.y, q.y)); y++) {
						const square = filed.get(`${x},${y}`);
						if (square) square.push([p, q]);
						else filed.set(`${x},${y}`, [[p, q]]);
					}
				reach = 64 + 2;
			}
		if (!reach) {
			if (from.some((line) => line.length)) return Infinity;
			continue;
		}
		for (const line of from) {
			for (const p of line) {
				let best = Infinity;
				const [cx, cy] = [cell(p.x), cell(p.y)];
				// Pieces filed only in squares k or more rings out lie at least
				// k - 1 squares away.
				for (let k = 0; k <= reach && best > worst && best > (k - 1) * size; k++)
					for (let x = cx - k; x <= cx + k; x++)
						for (let y = cy - k; y <= cy + k; y += x === cx - k || x === cx + k ? 1 : 2 * k)
							for (const [s, t] of filed.get(`${x},${y}`) ?? []) best = Math.min(best, distanceToSegment(p, s, t));
				worst = Math.max(worst, best);
			}
		}
	}
	return worst;
}

/** A template turned over: mirrored about its long axis. */
function turnOver(lines: readonly Polyline[], width: number): Polyline[] {
	return lines.map((line) => line.map((p) => ({ x: width - p.x, y: p.y })));
}

interface TemplateCuts {
	width: number;
	lines: Polyline[];
}

function templateCuts(design: HeartDesign, lobe: TemplateLobe): TemplateCuts {
	const data = getTemplateData(design, lobe);
	return { width: data.templateWidth, lines: data.cutPaths.flatMap((d) => samplePathData(d, 12)) };
}

/** Whether a template is the same piece turned over: then it cannot go in the wrong way. */
function turnsOverOntoItself(cuts: TemplateCuts): boolean {
	return cutDistance(cuts.lines, turnOver(cuts.lines, cuts.width)) <= SAME_PIECE_TOLERANCE * cuts.width;
}

/**
 * For a heart whose lobes share a template: whether the other lobe's own
 * template is the printed one turned over (true) or the printed one as it is
 * (false). Whichever lies closer, since `lobesShareTemplate` has already said
 * it is one of the two.
 */
function sharedTurnedOver(design: HeartDesign): boolean {
	const left = templateCuts(design, 'left');
	const right = templateCuts(design, 'right');
	return cutDistance(left.lines, turnOver(right.lines, right.width)) < cutDistance(left.lines, right.lines);
}

/**
 * Whether the heart's templates need orientation marks: some piece of it can
 * be put in the wrong way round, because its template is not its own mirror
 * image about its long axis. A heart whose two halves differ but are each
 * symmetric (and any heart like the classic one) needs none — every way a
 * piece can go in is right — and its sheets stay as they were.
 */
export function needsOrientationMarks(design: HeartDesign): boolean {
	return classify(design).marks;
}

/**
 * Whether one printed template makes both pieces of the heart: its halves
 * share a template (`lobesShareTemplate`) that needs no marks, so its two
 * copies would be the same. The PDF prints it once ($lib/pdf/plan).
 */
export function printsOneTemplate(design: HeartDesign): boolean {
	return lobesShareTemplate(design.fingers, design.gridSize) && !needsOrientationMarks(design);
}

interface Classification {
	marks: boolean;
	/** A shared template whose other lobe takes it turned over. */
	turned: boolean;
}

/** Per design object: the dialog and the tracing mode ask on every change of size. */
const classified = new WeakMap<HeartDesign, Classification>();

function classify(design: HeartDesign): Classification {
	const known = classified.get(design);
	if (known) return known;
	let result: Classification;
	if (lobesShareTemplate(design.fingers, design.gridSize)) {
		const marks = !turnsOverOntoItself(templateCuts(design, 'right'));
		result = { marks, turned: marks && sharedTurnedOver(design) };
	} else {
		result = {
			marks: !turnsOverOntoItself(templateCuts(design, 'left')) || !turnsOverOntoItself(templateCuts(design, 'right')),
			turned: false
		};
	}
	classified.set(design, result);
	return result;
}

/** Which side of the printed template a mark is on: x = 0 (`start`) or x = W (`end`). */
export type MarkSide = 'start' | 'end';

export interface MarkUse {
	/** The lobe the piece is used for. */
	lobe: TemplateLobe;
	kind: MarkKind;
	side: MarkSide;
}

/**
 * The marks to put on `printed`'s template when its piece is used for the
 * lobes in `uses` (one lobe for a heart with two templates; both, or either,
 * for a shared one). Empty when the heart needs no marks.
 */
export function markUses(design: HeartDesign, printed: TemplateLobe, uses: readonly TemplateLobe[]): MarkUse[] {
	const { marks, turned } = classify(design);
	if (!marks) return [];
	return uses.map((lobe) => ({
		lobe,
		kind: MARK_KIND[lobe],
		side: lobe === printed || !turned ? 'start' : 'end'
	}));
}

/** A mark placed on a template, in template units. */
export interface PlacedMark {
	kind: MarkKind;
	lobe: TemplateLobe;
	/** The centre. */
	x: number;
	y: number;
	/** The circle's radius; the cross's arms reach to it along the diagonals. */
	r: number;
}

/**
 * Where the mark goes on `printed`'s template at `mmPerUnit`: by the side
 * (`use.side`), just below the ear base, clear of every cut — the corner of
 * the piece that meets the other piece at the top of the heart. The nearest
 * spot to that corner where the mark and its clearance touch no cut, moving
 * down the piece (at most a third of its length) and in from the side (at
 * most 2.4 mm more than it needs); if there is none at 3 mm, a
 * smaller mark (`MARK_TIERS`). The ear is left to the picture and the
 * address, which reach down to its base.
 */
export function placeMark(
	design: HeartDesign,
	printed: TemplateLobe,
	use: MarkUse,
	mmPerUnit: number
): PlacedMark {
	const key = `${printed} ${use.lobe} ${use.side} ${mmPerUnit}`;
	let cache = placements.get(design);
	if (!cache) placements.set(design, (cache = new Map()));
	const known = cache.get(key);
	if (known) return known;
	const placed = searchMark(design, printed, use, mmPerUnit);
	cache.set(key, placed);
	return placed;
}

/** Placed marks per design object: the tracing mode asks again at every millimetre of zoom. */
const placements = new WeakMap<HeartDesign, Map<string, PlacedMark>>();

function searchMark(design: HeartDesign, printed: TemplateLobe, use: MarkUse, mmPerUnit: number): PlacedMark {
	const data = getTemplateData(design, printed);
	const W = data.templateWidth;
	const R = data.earRadius;
	const H = data.templateHeight;
	const unit = (mm: number) => mm / mmPerUnit;
	const along = (inset: number) => (use.side === 'start' ? inset : W - inset);
	const lowest = R + (H - R) / 3;
	// Every place tried lies near one corner, so only the cuts' pieces within
	// the largest clearance of that corner can decide one: a detailed heart
	// (Fisk og kors) has some twenty thousand.
	const reach = Math.max(...MARK_TIERS.map(({ radiusMm, clearanceMm }) => unit(radiusMm + clearanceMm)));
	const inset = unit(Math.max(...MARK_TIERS.map(({ radiusMm }) => radiusMm)) + SIDE_GAP_MM + 2.4) + reach;
	const [left, right] = use.side === 'start' ? [-reach, inset] : [W - inset, W + reach];
	const [top, bottom] = [R - reach, lowest + reach];
	const lines = data.cutPaths.flatMap((d) => samplePathData(d)).flatMap((line) => line.slice(1).flatMap((b, i) => {
		const a = line[i]!;
		return Math.max(a.x, b.x) < left || Math.min(a.x, b.x) > right || Math.max(a.y, b.y) < top || Math.min(a.y, b.y) > bottom
			? [] : [[a, b]];
	}));

	for (const { radiusMm, clearanceMm } of MARK_TIERS) {
		const r = unit(radiusMm);
		const need = unit(radiusMm + clearanceMm);
		const firstInset = unit(radiusMm + Math.min(SIDE_GAP_MM, clearanceMm));
		const insets = [0, 0.2, 0.4, 0.6, 0.8, 1, 1.2, 1.4, 1.6, 1.8, 2, 2.2, 2.4].map((mm) => firstInset + unit(mm));
		for (let y = R + unit(radiusMm + BASE_GAP_MM); y <= lowest; y += unit(0.25)) {
			for (const inset of insets) {
				const x = along(inset);
				if (distanceToLines({ x, y }, lines) >= need) return { kind: use.kind, lobe: use.lobe, x, y, r };
			}
		}
	}
	// Nowhere clear (no gallery heart at 40 mm or more): at the corner, small.
	const { radiusMm } = MARK_TIERS[MARK_TIERS.length - 1]!;
	return {
		kind: use.kind,
		lobe: use.lobe,
		x: along(unit(radiusMm + SIDE_GAP_MM)),
		y: R + unit(radiusMm + BASE_GAP_MM),
		r: unit(radiusMm)
	};
}

/** The marks for `printed`'s template used for `uses`, placed at `mmPerUnit`. */
export function templateMarks(
	design: HeartDesign,
	printed: TemplateLobe,
	uses: readonly TemplateLobe[],
	mmPerUnit: number
): PlacedMark[] {
	return markUses(design, printed, uses).map((use) => placeMark(design, printed, use, mmPerUnit));
}

/**
 * Two marks on one corner (a shared template whose lobes need no turning,
 * used for both): ⊗ already holds ×, so only ⊗ is drawn.
 */
export function dedupeMarks(marks: readonly PlacedMark[]): PlacedMark[] {
	const out: PlacedMark[] = [];
	for (const mark of marks) {
		const same = out.findIndex((m) => Math.hypot(m.x - mark.x, m.y - mark.y) < m.r);
		if (same < 0) out.push(mark);
		else if (mark.kind === 'circled') out[same] = mark;
	}
	return out;
}

/** The cross's two strokes, end to end, along the circle's diagonals. */
export function markStrokes(mark: Pick<PlacedMark, 'x' | 'y' | 'r'>): [Vec, Vec][] {
	const a = mark.r / Math.SQRT2;
	return [
		[
			{ x: mark.x - a, y: mark.y - a },
			{ x: mark.x + a, y: mark.y + a }
		],
		[
			{ x: mark.x - a, y: mark.y + a },
			{ x: mark.x + a, y: mark.y - a }
		]
	];
}

/**
 * The mark as SVG path data, mapped by `f` (default: as is): the cross, and
 * for ⊗ the circle as two half arcs (`f` must be a translation and uniform
 * scale `k`, for the arcs' radius).
 */
export function markPathData(mark: PlacedMark, f: (p: Vec) => Vec = (p) => p, k = 1): string {
	const n = (v: number) => Number(v.toFixed(3));
	const pt = (p: Vec) => {
		const q = f(p);
		return `${n(q.x)} ${n(q.y)}`;
	};
	const parts = markStrokes(mark).map(([a, b]) => `M ${pt(a)} L ${pt(b)}`);
	if (mark.kind === 'circled') {
		const r = n(mark.r * k);
		const west = { x: mark.x - mark.r, y: mark.y };
		const east = { x: mark.x + mark.r, y: mark.y };
		parts.push(`M ${pt(west)} A ${r} ${r} 0 0 1 ${pt(east)} A ${r} ${r} 0 0 1 ${pt(west)}`);
	}
	return parts.join(' ');
}

/**
 * The marks on a template shown on screen (the heart page and the tracing
 * mode): for a heart with two templates, the shown lobe's own mark; for a
 * shared template, which is shown once and cut twice, the marks of both uses
 * — ⊗ where the left lobe's piece meets the top of the heart, × where the
 * right lobe's does (one ⊗ when that is the same corner).
 */
export function shownTemplateMarks(design: HeartDesign, shown: TemplateLobe, mmPerUnit: number): PlacedMark[] {
	const uses: TemplateLobe[] = lobesShareTemplate(design.fingers, design.gridSize) ? ['left', 'right'] : [shown];
	return dedupeMarks(templateMarks(design, shown, uses, mmPerUnit));
}
