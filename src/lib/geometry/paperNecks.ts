/**
 * Whether a heart's templates hold together as paper once cut: each lobe's
 * template drawn at a print width, cut along every cut with a thin knife, and
 * its paper looked at as a picture. Paper hangs from the ear, the lobe's round
 * top past the fold; every piece of it has to be joined to the ear through a
 * neck at least `neckMm` wide, or it tears off in cutting and weaving (a small
 * bulge `bulgeMm`), and none may come loose. Long narrow strips and points of
 * paper that hold nothing up are no trouble here.
 *
 * Plain arithmetic on a grid of `pxPerMm`, so it runs in a test and in the
 * design page's worker ($lib/generator/paperWorker).
 */
import type { BezierSegment, Finger, HeartDesign, LobeId } from '$lib/types/heart';
import { inferOverlapRect } from '$lib/utils/overlapRect';

/** The square's width on the printed templates unless the visitor asks for
 * another: the download's DEFAULT_WIDTH_MM ($lib/laser/export). */
export const PRINT_WIDTH_MM = 80;

/** The narrowest neck of paper, in millimetres, that holds what hangs on it
 * through cutting and weaving: on a narrower one a piece tears off. */
export const PAPER_NECK_MM = 2;

export type PaperOptions = {
	/** The square's width on the printed template. */
	widthMm?: number;
	/** The narrowest neck a piece of paper may hang by. */
	neckMm?: number;
	/** The narrowest a bulge (a piece whose part that wide is under a square millimetre) may hang by. */
	bulgeMm?: number;
	pxPerMm?: number;
	/** Where to note each weak piece (see `WeakPiece`). */
	where?: WeakPiece[];
};

/** A piece of paper held by too narrow a neck: its lobe's template, and its
 * widest point in the design's coordinates. */
export type WeakPiece = { lobe: LobeId; x: number; y: number };

/** What tears off a lobe's template: pieces held by a narrower neck, and paper not held at all. */
export type PaperFaults = { weak: number; loose: number };

/** The faults of both templates of a heart (see the module's comment). */
export function paperFaults(design: HeartDesign, options: PaperOptions = {}): PaperFaults {
	const rect = inferOverlapRect(design.fingers, design.gridSize);
	const faults = { weak: 0, loose: 0 };
	for (const lobe of ['left', 'right'] as const) {
		const lobeFaults = templateFaults(design.fingers.filter((f) => f.lobe === lobe), lobe, rect, options);
		faults.weak += lobeFaults.weak;
		faults.loose += lobeFaults.loose;
	}
	return faults;
}

/** Whether nothing tears off either template (see `paperFaults`). */
export const paperHolds = (design: HeartDesign, options: PaperOptions = {}): boolean => {
	const { weak, loose } = paperFaults(design, options);
	return !weak && !loose;
};

/**
 * The narrowest print width, in whole `stepMm` past `widthMm` (where the paper
 * tears), at which it holds, or null when it does not by `maxMm` (paper that
 * comes loose never does). Necks grow with the print, so the widths are halved
 * between one that tears and one past `maxMm`: four looks, at most.
 */
export function holdingWidth(design: HeartDesign,
	{ maxMm = 200, stepMm = 10, ...options }: PaperOptions & { maxMm?: number; stepMm?: number } = {}): number | null {
	let tears = Math.floor((options.widthMm ?? PRINT_WIDTH_MM) / stepMm), holds = Math.floor(maxMm / stepMm) + 1;
	while (holds - tears > 1) {
		const mid = (tears + holds) >> 1;
		const { weak, loose } = paperFaults(design, { ...options, widthMm: mid * stepMm });
		if (loose) return null;
		if (weak) tears = mid;
		else holds = mid;
	}
	return holds * stepMm <= maxMm ? holds * stepMm : null;
}

/** What the heart's paper is like printed `widthMm` wide, and the narrowest width up to `maxMm` where it would hold. */
export type PaperReport = { widthMm: number; faults: PaperFaults; holdsMm: number | null };

/** See `PaperReport`: the design page's worker's answer ($lib/generator/paperWorker). */
export function paperReport(design: HeartDesign, widthMm: number, maxMm: number): PaperReport {
	const faults = paperFaults(design, { widthMm });
	return { widthMm, faults, holdsMm: faults.weak && !faults.loose ? holdingWidth(design, { widthMm, maxMm }) : null };
}

/** What several hearts' paper is like at one width, from their reports: none
 * when all hold; else whether any comes loose, and the narrowest width where
 * all would hold (none where one never does). */
export function papersAt(reports: readonly PaperReport[]): { widthMm: number; loose: boolean; holdsMm: number | null } | null {
	const torn = reports.filter((r) => r.faults.weak || r.faults.loose);
	if (!torn.length) return null;
	return {
		widthMm: torn[0].widthMm,
		loose: torn.some((r) => r.faults.loose),
		holdsMm: torn.some((r) => r.holdsMm === null) ? null : Math.max(...torn.map((r) => r.holdsMm!))
	};
}

/** A lobe's template as a grid: across, and along from the fold, with a band of the ear above it. */
function templateFaults(fingers: Finger[], lobe: LobeId,
	rect: { left: number; top: number; width: number; height: number }, options: PaperOptions): PaperFaults {
	const { widthMm = PRINT_WIDTH_MM, neckMm = PAPER_NECK_MM, bulgeMm = 0.85 * PAPER_NECK_MM, pxPerMm = 5 } = options;
	// Both templates share one scale, the wider side printed `widthMm` wide (as `heartScale`).
	const px = (widthMm * pxPerMm) / Math.max(rect.width, rect.height);
	const across = lobe === 'left' ? rect.height : rect.width, along = lobe === 'left' ? rect.width : rect.height;
	// The ear's band: deep enough that a neck's paper reaches it whole.
	const ear = Math.ceil(neckMm * pxPerMm) + 2;
	const W = Math.ceil(across * px) + 2, H = Math.ceil(along * px) + ear + 1;
	// Grid cell of a template point: one column of cut on each side, the ear's band on top, the open end below.
	const cell = (u: number, v: number) => [Math.floor(u * px) + 1, Math.floor(v * px) + ear] as const;
	const cut = new Uint8Array(W * H);
	for (let y = 0; y < H; y++) cut[y * W] = cut[y * W + W - 1] = 1;
	for (let x = 0; x < W; x++) cut[(H - 1) * W + x] = 1;
	const mark = (u: number, v: number) => {
		const [x, y] = cell(u, v);
		if (x >= 0 && x < W && y >= ear && y < H) cut[y * W + x] = 1;
	};
	for (const finger of fingers) for (const seg of finger.segments) {
		// The cut, in template units (as `transformPathData`), stepped through finer than a cell.
		const point = (t: number) => {
			const p = cubic(seg, t);
			return lobe === 'left' ? [p.y - rect.top, p.x - rect.left] as const : [p.x - rect.left, p.y - rect.top] as const;
		};
		const steps = Math.max(1, Math.ceil(chord(seg) * px * 3));
		for (let i = 0; i <= steps; i++) mark(...point(i / steps));
	}
	const dist = distances(cut, W, H), n = W * H;
	// Paper: what the knife left. Held: joined to the ear's band, the top row.
	const paper = new Uint8Array(n);
	for (let i = 0; i < n; i++) paper[i] = cut[i] ? 0 : 1;
	const loose = components(paper, W, H).list.filter((c) => !c.top && c.size > pxPerMm * pxPerMm / 4).length;
	// The paper at least a neck wide, and at least a bulge's: pieces of the first not joined to the ear.
	// A cut's cells lie up to half a cell's diagonal beside it, so the paper is that much wider than they say.
	const within = (r: number) => (r * pxPerMm - Math.SQRT1_2) ** 2;
	const wide = (r: number) => {
		const least = within(r), keep = new Uint8Array(n);
		for (let i = 0; i < n; i++) keep[i] = dist[i]! >= least ? 1 : 0;
		return components(keep, W, H);
	};
	const neck = wide(neckMm / 2);
	// What a piece is: paper wider than the neck it hangs by, at least a tenth of a millimetre (a strip
	// about as wide as the neck all along holds nothing up). Under a square millimetre at the neck's
	// width it is a bulge, held well enough by the bulge's, which is looked at only where there is one.
	const widest = new Float64Array(neck.list.length), widestAt = new Int32Array(neck.list.length);
	for (let i = 0; i < n; i++) {
		const label = neck.labels[i]!;
		if (label >= 0 && dist[i]! > widest[label]!) { widest[label] = dist[i]!; widestAt[label] = i; }
	}
	const pieces = neck.list.filter((piece, label) => !piece.top && widest[label]! >= within(neckMm / 2 + .1));
	const bulge = pieces.some((piece) => piece.size < pxPerMm * pxPerMm) ? wide(bulgeMm / 2) : null;
	const weakPieces = pieces.filter((piece) => piece.size >= pxPerMm * pxPerMm || !bulge!.list[bulge!.labels[piece.first]!]!.top), weak = weakPieces.length;
	if (options.where) for (const piece of weakPieces) {
		const i = widestAt[neck.labels[piece.first]!]!, u = (i % W - .5) / px, v = (Math.floor(i / W) - ear + .5) / px;
		options.where.push(lobe === 'left' ? { lobe, x: v + rect.left, y: u + rect.top } : { lobe, x: u + rect.left, y: v + rect.top });
	}
	return { weak, loose };
}

type Component = { size: number; top: boolean; first: number };

/** The 4-connected components of the cells `keep` marks, each with whether it reaches the top row, and each cell's. */
function components(keep: Uint8Array, W: number, H: number): { list: Component[]; labels: Int32Array } {
	const n = W * H, labels = new Int32Array(n).fill(-1), list: Component[] = [], stack = new Int32Array(n);
	for (let i = 0; i < n; i++) {
		if (labels[i] !== -1 || !keep[i]) continue;
		const label = list.length, c: Component = { size: 0, top: false, first: i };
		let depth = 0;
		labels[i] = label;
		stack[depth++] = i;
		// Each cell goes on the stack once, marked as it does.
		const visit = (k: number) => {
			if (labels[k] === -1 && keep[k]) {
				labels[k] = label;
				stack[depth++] = k;
			}
		};
		while (depth) {
			const j = stack[--depth]!, x = j % W;
			c.size++;
			if (j < W) c.top = true;
			if (x > 0) visit(j - 1);
			if (x < W - 1) visit(j + 1);
			if (j >= W) visit(j - W);
			if (j + W < n) visit(j + W);
		}
		list.push(c);
	}
	return { list, labels };
}

/** Squared distance from each cell to the nearest cut cell (Felzenszwalb and Huttenlocher's transform). */
function distances(cut: Uint8Array, W: number, H: number): Float64Array {
	const INF = 1e20, d = new Float64Array(W * H);
	for (let i = 0; i < W * H; i++) d[i] = cut[i] ? 0 : INF;
	const n = Math.max(W, H), f = new Float64Array(n), out = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1);
	const line = (length: number) => {
		let k = 0;
		v[0] = 0; z[0] = -INF; z[1] = INF;
		for (let q = 1; q < length; q++) {
			let s = ((f[q]! + q * q) - (f[v[k]!]! + v[k]! * v[k]!)) / (2 * q - 2 * v[k]!);
			while (s <= z[k]!) { k--; s = ((f[q]! + q * q) - (f[v[k]!]! + v[k]! * v[k]!)) / (2 * q - 2 * v[k]!); }
			k++; v[k] = q; z[k] = s; z[k + 1] = INF;
		}
		k = 0;
		for (let q = 0; q < length; q++) {
			while (z[k + 1]! < q) k++;
			out[q] = (q - v[k]!) ** 2 + f[v[k]!]!;
		}
	};
	for (let x = 0; x < W; x++) {
		for (let y = 0; y < H; y++) f[y] = d[y * W + x]!;
		line(H);
		for (let y = 0; y < H; y++) d[y * W + x] = out[y]!;
	}
	for (let y = 0; y < H; y++) {
		for (let x = 0; x < W; x++) f[x] = d[y * W + x]!;
		line(W);
		for (let x = 0; x < W; x++) d[y * W + x] = out[x]!;
	}
	return d;
}

function cubic(s: BezierSegment, t: number) {
	const u = 1 - t;
	return {
		x: u * u * u * s.p0.x + 3 * u * u * t * s.p1.x + 3 * u * t * t * s.p2.x + t * t * t * s.p3.x,
		y: u * u * u * s.p0.y + 3 * u * u * t * s.p1.y + 3 * u * t * t * s.p2.y + t * t * t * s.p3.y
	};
}

/** A segment's control polygon's length, which its length is no longer than. */
const chord = (s: BezierSegment) =>
	Math.hypot(s.p1.x - s.p0.x, s.p1.y - s.p0.y) + Math.hypot(s.p2.x - s.p1.x, s.p2.y - s.p1.y) + Math.hypot(s.p3.x - s.p2.x, s.p3.y - s.p2.y);
