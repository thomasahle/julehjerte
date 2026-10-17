/**
 * The whole unfolded template piece, in millimetres — docs/redesign/LASER.md.
 *
 * The PDF prints the *folded* piece: one half, cut through two layers of paper
 * at once. A laser cuts a single layer, so it needs the piece opened out: the
 * half from `getTemplateData`, mirrored across the fold, with every strip cut
 * running on through the fold into its own mirror image as one path. A cut
 * that stopped at the fold and started again would leave the laser two ends
 * to meet exactly, and a hair of paper where they miss holds the strips
 * together.
 *
 * Everything here is numbers; the SVG and DXF writers format them.
 */
import type { HeartDesign, Vec } from '$lib/types/heart';
import { getTemplateData, type TemplateLobe } from '$lib/utils/templateSvg';

/** Thrown for a design that cannot be cut as one piece. */
export class LaserExportError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'LaserExportError';
	}
}

export type LaserSegment =
	| { kind: 'L'; to: Vec }
	| { kind: 'C'; c1: Vec; c2: Vec; to: Vec }
	/** A half circle of radius `r`; `sweep` as SVG's sweep-flag (1 = clockwise on screen, y down). */
	| { kind: 'A'; r: number; sweep: 0 | 1; to: Vec };

export interface LaserPath {
	start: Vec;
	segments: LaserSegment[];
	closed: boolean;
}

export interface UnfoldedPiece {
	lobe: TemplateLobe;
	/** Ear arc, right side, mirrored ear arc, left side. */
	outline: LaserPath;
	/**
	 * One open path per strip boundary, from y = R through the fold to y = 2H − R.
	 * The fold itself (y = H) is not a line of the piece: it is folded by hand,
	 * not scored (DOWNLOAD.md, round 2).
	 */
	cuts: LaserPath[];
	widthMm: number;
	heightMm: number;
	stripWidthMm: number;
}

/** Endpoints this close to the ear base or the fold are on it (template units). */
const SNAP = 1e-6;

/**
 * How far from the piece's side a cut may stray and still be the side itself.
 * The normalised design carries each lobe's two outer strip edges as fingers
 * (the editor drags them); on the template they lie on the straight sides,
 * which the outline already cuts. Same tolerance as `ensureOuterBoundaries`.
 */
const SIDE_TOLERANCE = 0.75;

type Template = ReturnType<typeof getTemplateData>;

/** The absolute M / L / C commands `getTemplateData` writes, as segments. */
function parseCut(d: string): LaserPath {
	const commands = d.match(/[MLC][^MLC]*/g) ?? [];
	let start: Vec | null = null;
	const segments: LaserSegment[] = [];
	for (const command of commands) {
		const n = command.slice(1).trim().split(/[\s,]+/).filter(Boolean).map(Number);
		const at = (i: number): Vec => ({ x: n[i]!, y: n[i + 1]! });
		if (command[0] === 'M') {
			if (start) throw new LaserExportError('A strip cut has more than one subpath.');
			start = at(0);
		} else if (command[0] === 'L') {
			for (let i = 0; i + 1 < n.length; i += 2) segments.push({ kind: 'L', to: at(i) });
		} else {
			for (let i = 0; i + 5 < n.length; i += 6) {
				segments.push({ kind: 'C', c1: at(i), c2: at(i + 2), to: at(i + 4) });
			}
		}
	}
	if (!start || !segments.length) throw new LaserExportError('A strip cut is empty.');
	return { start, segments, closed: false };
}

function endPoint(path: LaserPath): Vec {
	return path.segments[path.segments.length - 1]!.to;
}

/** Every point of an open L / C path, start and control points included. */
function allPoints(path: LaserPath): Vec[] {
	const points = [path.start];
	for (const seg of path.segments) {
		if (seg.kind === 'C') points.push(seg.c1, seg.c2);
		points.push(seg.to);
	}
	return points;
}

/** The same curve end to end: segment order reversed, each cubic's controls swapped. */
export function reversePath(path: LaserPath): LaserPath {
	const nodes = [path.start, ...path.segments.map((s) => s.to)];
	const segments: LaserSegment[] = [];
	for (let i = path.segments.length - 1; i >= 0; i--) {
		const seg = path.segments[i]!;
		const to = nodes[i]!;
		if (seg.kind === 'C') segments.push({ kind: 'C', c1: seg.c2, c2: seg.c1, to });
		else if (seg.kind === 'L') segments.push({ kind: 'L', to });
		else segments.push({ kind: 'A', r: seg.r, sweep: seg.sweep === 1 ? 0 : 1, to });
	}
	return { start: nodes[nodes.length - 1]!, segments, closed: path.closed };
}

function mapPath(path: LaserPath, f: (p: Vec) => Vec): LaserPath {
	return {
		start: f(path.start),
		closed: path.closed,
		segments: path.segments.map((seg) =>
			seg.kind === 'C'
				? { kind: 'C', c1: f(seg.c1), c2: f(seg.c2), to: f(seg.to) }
				: { ...seg, to: f(seg.to) }
		)
	};
}

/**
 * One cut as it runs on the folded template: from the ear base to the fold.
 *
 * The right lobe's fingers are drawn the other way round (fold to ear), so the
 * direction is normalised first; then the ends are snapped onto the two lines
 * they meet, so the mirror image joins at exactly the same point.
 */
function orientCut(cut: LaserPath, earY: number, foldY: number): LaserPath {
	const near = (y: number, target: number) => Math.abs(y - target) <= SNAP;
	let path = cut;
	if (near(path.start.y, foldY) && near(endPoint(path).y, earY)) path = reversePath(path);
	const last = path.segments[path.segments.length - 1]!;
	if (!near(path.start.y, earY) || !near(last.to.y, foldY)) {
		throw new LaserExportError('A strip cut does not run from the rounded end to the fold.');
	}
	return {
		...path,
		start: { x: path.start.x, y: earY },
		segments: [...path.segments.slice(0, -1), { ...last, to: { x: last.to.x, y: foldY } }]
	};
}

function isSide(cut: LaserPath, width: number): boolean {
	const points = allPoints(cut);
	return (
		points.every((p) => Math.abs(p.x) <= SIDE_TOLERANCE) ||
		points.every((p) => Math.abs(p.x - width) <= SIDE_TOLERANCE)
	);
}

/**
 * Strips across the piece. On the left lobe's template the strips run down
 * the piece side by side across its width, which is the overlap's height, so
 * there are `gridSize.y` of them; on the right lobe's, `gridSize.x`.
 */
function stripsAcross(design: HeartDesign, lobe: TemplateLobe): number {
	return lobe === 'left' ? design.gridSize.y : design.gridSize.x;
}

/**
 * Millimetres per template unit, the same for both pieces of a heart.
 *
 * `widthMm` is the width of the heart's wider piece. On a square grid both
 * pieces are equally wide and this is `widthMm / templateWidth`; on a 8 × 7
 * grid the pieces differ by a strip, and scaling each to `widthMm` on its own
 * would give them strips of different widths, which do not weave.
 */
export function heartScale(design: HeartDesign, widthMm: number): number {
	const widest = Math.max(
		getTemplateData(design, 'left').templateWidth,
		getTemplateData(design, 'right').templateWidth
	);
	if (!(widest > 0)) throw new LaserExportError('The heart has no width.');
	return widthMm / widest;
}

function unfoldTemplate(design: HeartDesign, template: Template, scale: number): UnfoldedPiece {
	const { lobe, templateWidth, earRadius, templateHeight } = template;
	const s = (p: Vec): Vec => ({ x: p.x * scale, y: p.y * scale });
	const W = templateWidth * scale;
	const R = earRadius * scale;
	const H = templateHeight * scale;
	const mirror = (p: Vec): Vec => ({ x: p.x, y: 2 * H - p.y });

	// Clockwise on screen: over the top from the left, under the bottom from the
	// right, so both arcs bulge outwards (their midpoints at y = 0 and y = 2H).
	const outline: LaserPath = {
		start: { x: 0, y: R },
		segments: [
			{ kind: 'A', r: R, sweep: 1, to: { x: W, y: R } },
			{ kind: 'L', to: { x: W, y: 2 * H - R } },
			{ kind: 'A', r: R, sweep: 1, to: { x: 0, y: 2 * H - R } }
		],
		closed: true
	};

	const cuts = template.cutPaths
		.map(parseCut)
		.filter((cut) => !isSide(cut, templateWidth))
		.map((cut) => {
			const half = mapPath(orientCut(cut, earRadius, templateHeight), s);
			// The mirror half, reversed, starts where the first half ends — on the
			// fold — so it is appended without its start point: no duplicate
			// vertex, no zero-length step back.
			const back = reversePath(mapPath(half, mirror));
			return { start: half.start, segments: [...half.segments, ...back.segments], closed: false };
		});

	return {
		lobe,
		outline,
		cuts,
		widthMm: W,
		heightMm: 2 * H,
		stripWidthMm: W / stripsAcross(design, lobe)
	};
}

/** One lobe's piece, opened out, at a heart width of `widthMm` (see `heartScale`). */
export function unfoldPiece(design: HeartDesign, lobe: TemplateLobe, widthMm: number): UnfoldedPiece {
	return unfoldTemplate(design, getTemplateData(design, lobe), heartScale(design, widthMm));
}
