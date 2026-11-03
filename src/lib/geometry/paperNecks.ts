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
	/** Where to note the narrowest place of the widest way each weak piece is
	 * held by (its neck), and how wide it is in millimetres. */
	necks?: (WeakPiece & { mm: number })[];
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

/**
 * The narrowest neck, in millimetres on templates printed `widthMm` wide, any
 * piece of paper hangs by from the ear (paper a tenth of a millimetre wider
 * than its neck, as `paperFaults` sees a piece; bulges too), on either
 * template: how far paper that holds is from tearing, and how near paper that
 * tears is to holding. Infinity where nothing hangs by a neck. Where `at` is
 * given, the neck's place in the design's coordinates is noted there.
 */
export function thinnestNeck(design: HeartDesign, options: PaperOptions & { at?: WeakPiece[] } = {}): number {
	const rect = inferOverlapRect(design.fingers, design.gridSize);
	const { widthMm = PRINT_WIDTH_MM, neckMm = PAPER_NECK_MM, pxPerMm = 5 } = options;
	let least = Infinity, place: WeakPiece | undefined;
	for (const lobe of ['left', 'right'] as const) {
		const grid = templateGrid(design.fingers.filter((f) => f.lobe === lobe), lobe, rect, widthMm, neckMm, pxPerMm);
		const { mm, from } = neckOn(grid, pxPerMm);
		if (mm >= least) continue;
		least = mm;
		const i = options.at ? neckFrom(grid, from) : -1;
		place = i >= 0 ? cellAt(grid, lobe, rect, i) : undefined;
	}
	if (place) options.at!.push(place);
	return least;
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
	const grid = templateGrid(fingers, lobe, rect, widthMm, neckMm, pxPerMm), { W, H, cut } = grid, n = W * H;
	// Paper: what the knife left. Held: joined to the ear's band, the top row.
	const paper = new Uint8Array(n);
	for (let i = 0; i < n; i++) paper[i] = cut[i] ? 0 : 1;
	const loose = components(paper, W, H).list.filter((c) => !c.top && c.size > pxPerMm * pxPerMm / 4).length;
	const { weakPieces, neck, widestAt } = weakOn(grid, neckMm, bulgeMm, pxPerMm), weak = weakPieces.length;
	const at = (i: number) => cellAt(grid, lobe, rect, i);
	if (options.where) for (const piece of weakPieces) options.where.push(at(widestAt[neck.labels[piece.first]!]!));
	if (options.necks) for (const piece of weakPieces) {
		const i = neckFrom(grid, widestAt[neck.labels[piece.first]!]!);
		// As wide as twice its distance from the cuts, and half a cell's diagonal each side (see `weakOn`).
		if (i >= 0) options.necks.push({ ...at(i), mm: 2 * (Math.sqrt(grid.dist[i]!) + Math.SQRT1_2) / pxPerMm });
	}
	return { weak, loose };
}

/** A lobe's template as the knife leaves it on a grid of `pxPerMm`, printed
 * `widthMm` wide, with an ear's band on top deep enough for necks of
 * `neckMm`: its cut cells, and each cell's squared distance from one. */
function templateGrid(fingers: Finger[], lobe: LobeId,
	rect: { left: number; top: number; width: number; height: number }, widthMm: number, neckMm: number, pxPerMm: number) {
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
	return { W, H, cut, ear, px, dist: distances(cut, W, H) };
}

/** Where a piece of paper, from its cell `from`, hangs by its neck: the
 * widest way from it to the ear's band (the top row) is only as wide as some
 * narrowest stretch, found with the cells in buckets by the narrowest they
 * were reached through (each cell's width its squared distance from the cuts,
 * whole numbers on the grid), the widest first. The paper wider than that
 * about `from` is the piece itself; its neck is where the shortest way on, as
 * wide, leaves it (not wherever the widest way happens to pass as narrow). -1
 * when nothing joins it to the ear. */
function neckFrom(grid: ReturnType<typeof templateGrid>, from: number): number {
	const { W, H, dist } = grid, n = W * H, width = (i: number) => Math.round(dist[i]!);
	const neighbours = (i: number) => {
		const x = i % W;
		return [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, i >= W ? i - W : -1, i + W < n ? i + W : -1];
	};
	// How wide the widest way is.
	const most = width(from), reached = new Int32Array(n).fill(-1), buckets: number[][] = Array.from({ length: most + 1 }, () => []);
	reached[from] = most;
	buckets[most]!.push(from);
	let narrowest = -1;
	search: for (let key = most; key > 0; key--) {
		const bucket = buckets[key]!;
		while (bucket.length) {
			const i = bucket.pop()!;
			if (reached[i] !== key) continue;
			if (i < W) { narrowest = key; break search; }
			for (const j of neighbours(i)) {
				if (j < 0 || !dist[j]) continue;
				const k = Math.min(key, width(j));
				if (k > reached[j]!) { reached[j] = k; buckets[k]!.push(j); }
			}
		}
	}
	if (narrowest < 0) return -1;
	// The piece: the paper wider than that, about `from`.
	const piece = new Uint8Array(n), stack = [from];
	piece[from] = 1;
	while (stack.length) for (const j of neighbours(stack.pop()!)) if (j >= 0 && !piece[j] && width(j) > narrowest) { piece[j] = 1; stack.push(j); }
	// The shortest way from it to the top row through paper as wide, back to where it leaves the piece.
	const back = new Int32Array(n).fill(-2), queue: number[] = [];
	for (let i = 0; i < n; i++) if (piece[i]) { back[i] = -1; queue.push(i); }
	for (let q = 0; q < queue.length; q++) {
		const i = queue[q]!;
		if (i < W) {
			let neck = i;
			for (let j = i; back[j]! >= 0 && !piece[j]; j = back[j]!) neck = j;
			return neck;
		}
		for (const j of neighbours(i)) if (j >= 0 && back[j] === -2 && width(j) >= narrowest) { back[j] = i; queue.push(j); }
	}
	return -1;
}

/** A template grid's cell (see `templateGrid`) in the design's coordinates. */
function cellAt(grid: ReturnType<typeof templateGrid>, lobe: LobeId, rect: { left: number; top: number }, i: number): WeakPiece {
	const { W, ear, px } = grid, u = (i % W - .5) / px, v = (Math.floor(i / W) - ear + .5) / px;
	return lobe === 'left' ? { lobe, x: v + rect.left, y: u + rect.top } : { lobe, x: u + rect.left, y: v + rect.top };
}

/** The narrowest neck a template's paper hangs by (see `thinnestNeck`), in
 * millimetres, and a cell of the piece it holds: every cell's widest way to
 * the ear's band, found as `neckFrom` finds one cell's, from the band down,
 * the widest ways first. */
function neckOn(grid: ReturnType<typeof templateGrid>, pxPerMm: number): { mm: number; from: number } {
	const { W, dist } = grid, n = dist.length, width = (i: number) => Math.round(dist[i]!);
	// As wide as twice its distance from the cuts, and half a cell's diagonal each side (see `weakOn`).
	const mm = (w: number) => 2 * (Math.sqrt(w) + Math.SQRT1_2) / pxPerMm;
	let most = 0;
	for (let i = 0; i < W; i++) most = Math.max(most, width(i));
	const reached = new Int32Array(n).fill(-1), buckets: number[][] = Array.from({ length: most + 1 }, () => []);
	for (let i = 0; i < W; i++) if (dist[i]) { reached[i] = width(i); buckets[width(i)]!.push(i); }
	let least = { mm: Infinity, from: -1 };
	for (let key = most; key > 0; key--) {
		const bucket = buckets[key]!;
		while (bucket.length) {
			const i = bucket.pop()!;
			if (reached[i] !== key) continue;
			// Paper wider than the way it is held by: a piece, hanging by a neck as wide as the way (narrower
			// than any found before, the ways found widest first).
			if (mm(width(i)) >= mm(key) + .2) least = { mm: mm(key), from: i };
			const x = i % W;
			for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, i >= W ? i - W : -1, i + W < n ? i + W : -1]) {
				if (j < 0 || !dist[j]) continue;
				const k = Math.min(key, width(j));
				if (k > reached[j]!) { reached[j] = k; buckets[k]!.push(j); }
			}
		}
	}
	return least;
}

/** The pieces of a template's paper (see `templateGrid`) held by a neck
 * narrower than `neckMm`, or than `bulgeMm` for a bulge. */
function weakOn(grid: ReturnType<typeof templateGrid>, neckMm: number, bulgeMm: number, pxPerMm: number) {
	const { W, H, dist } = grid, n = W * H;
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
	const weakPieces = pieces.filter((piece) => piece.size >= pxPerMm * pxPerMm || !bulge!.list[bulge!.labels[piece.first]!]!.top);
	return { weakPieces, neck, widestAt };
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
