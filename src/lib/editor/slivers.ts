/**
 * Slivers between the two lobes' cuts, for Tegn's random buttons ($lib/editor/randomHeart and the Escher
 * tab's random tile): a left and a right cut may cross, but where they nearly follow each other, or lie on
 * each other for a stretch, the paper between them is a sliver too thin to cut or weave, and on the screen
 * a hairline. The red cuts (`findFingersWithIssues`) only compare cuts of one lobe.
 */
import type { Finger, Vec } from '$lib/types/heart';

/** Points along a cut, about every `step` units, for the closeness check below. */
function samplePoints(finger: Finger, step: number): Vec[] {
	const points: Vec[] = [];
	for (const seg of finger.segments) {
		const length = Math.hypot(seg.p3.x - seg.p0.x, seg.p3.y - seg.p0.y) + Math.hypot(seg.p1.x - seg.p0.x, seg.p1.y - seg.p0.y);
		const count = Math.max(4, Math.ceil(length / step));
		for (let i = 0; i < count; i++) {
			const t = i / count;
			const u = 1 - t;
			points.push({
				x: u * u * u * seg.p0.x + 3 * u * u * t * seg.p1.x + 3 * u * t * t * seg.p2.x + t * t * t * seg.p3.x,
				y: u * u * u * seg.p0.y + 3 * u * u * t * seg.p1.y + 3 * u * t * t * seg.p2.y + t * t * t * seg.p3.y
			});
		}
	}
	return points;
}

/**
 * Whether a left cut runs alongside a right cut, closer than `close` for longer than `run`: the two
 * halves' cuts may cross, but where they nearly follow each other the paper between them is a sliver
 * too thin to cut or weave, and on the screen a hairline.
 */
export function halvesRunTogether(fingers: Finger[], close: number, run: number): boolean {
	const step = close / 2;
	const inner = (f: Finger) => f.segments.some((s) => s.p1.x !== s.p0.x || s.p1.y !== s.p0.y);
	const right = fingers.filter((f) => f.lobe === 'right' && inner(f)).flatMap((f) => samplePoints(f, step));
	for (const finger of fingers.filter((f) => f.lobe === 'left' && inner(f))) {
		let together = 0;
		for (const p of samplePoints(finger, step)) {
			const near = right.some(
				(q) => Math.abs(q.x - p.x) < close && Math.abs(q.y - p.y) < close && Math.hypot(q.x - p.x, q.y - p.y) < close
			);
			together = near ? together + step : 0;
			if (together > run) return true;
		}
	}
	return false;
}

/**
 * Whether no left cut runs alongside a right cut: within 1.5 red-cut margins for 10 margins, which two
 * cuts crossing at less than about 18° do. The wedges of an ordinary curved crossing pass.
 */
export function halvesCrossCleanly(fingers: Finger[], margin: number): boolean {
	return !halvesRunTogether(fingers, 1.5 * margin, 10 * margin);
}

/**
 * The sizes of the woven picture's pieces, smallest first, each as a share of the square: the picture
 * sampled `resolution` times each way inside `rect` (each point's colour is the number of left cuts above
 * it and right cuts to its left, odd or even), and its pieces of one colour found.
 */
export function pieceSizes(
	fingers: Finger[],
	rect: { left: number; top: number; width: number; height: number },
	resolution = 128
): number[] {
	return pieces(fingers, rect, resolution)
		.map((p) => p.area)
		.sort((a, b) => a - b);
}

/** A piece of the woven picture: its area as a share of the square, its outline in samples, and whether it reaches the square's edge. */
export interface Piece {
	area: number;
	perimeter: number;
	edge: boolean;
	/** The widest circle that fits in the piece, its diameter as a share of the square's side: how thick the piece is at its thickest. Beyond the square counts as the piece's own. */
	width: number;
}

/** The pieces of the woven picture, sampled `resolution` times each way (see `pieceSizes`). */
/** Where each column of samples meets the left cuts (their heights) and each row the right cuts (their places), sorted. */
function crossings(
	fingers: Finger[],
	rect: { left: number; top: number; width: number; height: number },
	R: number
): { columns: number[][]; rows: number[][]; xAt: (k: number) => number; yAt: (k: number) => number } {
	const lines = (lobe: 'left' | 'right') =>
		fingers
			.filter((f) => f.lobe === lobe)
			.map((f) => {
				const pts: Vec[] = [];
				for (const s of f.segments) {
					for (let i = 0; i <= 16; i++) {
						const t = i / 16;
						const u = 1 - t;
						pts.push({
							x: u * u * u * s.p0.x + 3 * u * u * t * s.p1.x + 3 * u * t * t * s.p2.x + t * t * t * s.p3.x,
							y: u * u * u * s.p0.y + 3 * u * u * t * s.p1.y + 3 * u * t * t * s.p2.y + t * t * t * s.p3.y
						});
					}
				}
				return pts;
			});
	// Where each column meets the left cuts (their heights), and each row the right cuts (their places).
	const across = (polys: Vec[][], along: 'x' | 'y', at: (k: number) => number): number[][] => {
		const other = along === 'x' ? 'y' : 'x';
		const out: number[][] = Array.from({ length: R }, () => []);
		for (const poly of polys) {
			for (let i = 1; i < poly.length; i++) {
				const a = poly[i - 1]!;
				const b = poly[i]!;
				const lo = Math.min(a[along], b[along]);
				const hi = Math.max(a[along], b[along]);
				for (let k = 0; k < R; k++) {
					const p = at(k);
					if (p < lo || p >= hi || hi === lo) continue;
					const t = (p - a[along]) / (b[along] - a[along]);
					out[k]!.push(a[other] + t * (b[other] - a[other]));
				}
			}
		}
		for (const list of out) list.sort((p, q) => p - q);
		return out;
	};
	const xAt = (k: number) => rect.left + ((k + 0.5) / R) * rect.width;
	const yAt = (k: number) => rect.top + ((k + 0.5) / R) * rect.height;
	const columns = across(lines('left'), 'x', xAt);
	const rows = across(lines('right'), 'y', yAt);
	return { columns, rows, xAt, yAt };
}

/** Each sample's colour, 0 or 1: the left cuts above it and the right cuts to its left, odd or even. */
function sampleColours(fingers: Finger[], rect: { left: number; top: number; width: number; height: number }, R: number): Uint8Array {
	const { columns, rows, xAt, yAt } = crossings(fingers, rect, R);
	const before = (list: number[], v: number) => {
		let n = 0;
		while (n < list.length && list[n]! < v) n++;
		return n;
	};
	const colour = new Uint8Array(R * R);
	for (let r = 0; r < R; r++) {
		const y = yAt(r);
		for (let c = 0; c < R; c++) colour[r * R + c] = (before(columns[c]!, y) + before(rows[r]!, xAt(c))) & 1;
	}
	return colour;
}

/** Each sample's 3-4 chamfer distance to the nearest sample where `seed` holds (3 a step; 1.5 on a seed, so a boundary sample counts half a step in), on an R × R raster. */
export function chamfer(R: number, seed: (i: number) => boolean): Float64Array {
	const far = 1e9;
	const dist = new Float64Array(R * R);
	for (let i = 0; i < R * R; i++) dist[i] = seed(i) ? 1.5 : far;
	for (let r = 0; r < R; r++)
		for (let c = 0; c < R; c++) {
			const i = r * R + c;
			let d = dist[i]!;
			if (r > 0) {
				d = Math.min(d, dist[i - R]! + 3);
				if (c > 0) d = Math.min(d, dist[i - R - 1]! + 4);
				if (c < R - 1) d = Math.min(d, dist[i - R + 1]! + 4);
			}
			if (c > 0) d = Math.min(d, dist[i - 1]! + 3);
			dist[i] = d;
		}
	for (let r = R - 1; r >= 0; r--)
		for (let c = R - 1; c >= 0; c--) {
			const i = r * R + c;
			let d = dist[i]!;
			if (r < R - 1) {
				d = Math.min(d, dist[i + R]! + 3);
				if (c < R - 1) d = Math.min(d, dist[i + R + 1]! + 4);
				if (c > 0) d = Math.min(d, dist[i + R - 1]! + 4);
			}
			if (c < R - 1) d = Math.min(d, dist[i + 1]! + 3);
			dist[i] = d;
		}
	return dist;
}

export function pieces(fingers: Finger[], rect: { left: number; top: number; width: number; height: number }, resolution = 128): Piece[] {
	const R = resolution;
	const colour = sampleColours(fingers, rect, R);
	// Each sample's distance to the nearest sample of the other colour: a piece's widest point is its
	// largest. Beyond the square's edge counts as the sample's own colour.
	const far = 1e9;
	const dist = chamfer(R, (i) => {
		const r = (i / R) | 0;
		const c = i % R;
		const other = (j: number) => colour[j] !== colour[i];
		return (r > 0 && other(i - R)) || (r < R - 1 && other(i + R)) || (c > 0 && other(i - 1)) || (c < R - 1 && other(i + 1));
	});
	const seen = new Uint8Array(R * R);
	const found: Piece[] = [];
	const stack: number[] = [];
	for (let start = 0; start < R * R; start++) {
		if (seen[start]) continue;
		const col = colour[start];
		let size = 0;
		let perimeter = 0;
		let edge = false;
		let widest = 0;
		stack.push(start);
		seen[start] = 1;
		while (stack.length) {
			const i = stack.pop()!;
			size++;
			widest = Math.max(widest, dist[i]!);
			const r = (i / R) | 0;
			const c = i % R;
			if (r === 0 || c === 0 || r === R - 1 || c === R - 1) edge = true;
			for (const j of [r > 0 ? i - R : -1, r < R - 1 ? i + R : -1, c > 0 ? i - 1 : -1, c < R - 1 ? i + 1 : -1]) {
				if (j >= 0 && colour[j] === col) {
					if (!seen[j]) {
						seen[j] = 1;
						stack.push(j);
					}
				} else perimeter++;
			}
		}
		// A one-colour heart has no other colour to measure from: as wide as the square.
		found.push({ area: size / (R * R), perimeter, edge, width: widest >= far ? 1 : (2 * widest) / 3 / R });
	}
	return found;
}

/** Samples each way `smallestPiece` reads the picture at, and the pieces it takes for sampling noise along a line. */
const PIECE_RESOLUTION = 160;
const NOISE = 3;

/**
 * The smallest piece of the woven picture, in cells (strips²): a crossing of the two lobes' cuts at a slant,
 * a knob pinched against a cut, or a figure clipped at the square's edge can leave a crumb too small to cut,
 * on the screen a speck. Specks of NOISE samples or fewer are where two lines pass between samples, not
 * paper. The gallery's hearts keep 0.07 of a cell and more, but for two (h4h2 and santa, 0.01).
 */
export function smallestPiece(
	fingers: Finger[],
	rect: { left: number; top: number; width: number; height: number },
	cells: number
): number {
	const R = PIECE_RESOLUTION;
	const real = pieceSizes(fingers, rect, R).find((share) => share * R * R > NOISE);
	return real === undefined ? cells : real * cells;
}

/** The least a random heart's or tile's smallest piece may be, in cells (`smallestPiece`): what nearly all the gallery's hearts keep. */
export const MIN_PIECE = 0.08;

/**
 * How much of the woven picture is thinner than `width` cells, in cells: the parts a disc of that width
 * cannot reach while staying inside its own colour (a morphological opening of the picture, sampled
 * RESOLUTION times each way), so the long thin strips and narrow necks of a piece, which paper does not
 * survive, whatever the piece's size. `n` is the heart's strips.
 */
export function thinArea(
	fingers: Finger[],
	rect: { left: number; top: number; width: number; height: number },
	n: number,
	width: number
): number {
	const R = PIECE_RESOLUTION;
	const colour = sampleColours(fingers, rect, R);
	const radius = (width / 2) * (R / n);
	// Distance to the other colour, then to the cores (samples at least `radius` inside): a sample is in a
	// thin part when no core is within `radius` of it.
	const toOther = chamfer(R, (i) => {
		const r = (i / R) | 0;
		const c = i % R;
		const other = (j: number) => colour[j] !== colour[i];
		return (r > 0 && other(i - R)) || (r < R - 1 && other(i + R)) || (c > 0 && other(i - 1)) || (c < R - 1 && other(i + 1));
	});
	const toCore = chamfer(R, (i) => toOther[i]! / 3 >= radius);
	let thin = 0;
	for (let i = 0; i < R * R; i++) if (toCore[i]! / 3 > radius + 1) thin++;
	return (thin / (R * R)) * n * n;
}

/**
 * The widest band along the square's edge that no cut of the lobe across it enters, in cells: for each
 * point of an edge, how far in the first cut is, the most of these. A moved, stretched or turned tiling can
 * leave such a band empty, which looks unfinished. `n` is the heart's strips.
 */
export function edgeGap(fingers: Finger[], rect: { left: number; top: number; width: number; height: number }, n: number): number {
	const R = PIECE_RESOLUTION;
	const { columns, rows } = crossings(fingers, rect, R);
	const inner = (list: number[], lo: number, hi: number) => list.filter((v) => v > lo + 1e-6 && v < hi - 1e-6);
	let worst = 0;
	for (const list of columns) {
		const inside = inner(list, rect.top, rect.top + rect.height);
		if (!inside.length) return n;
		worst = Math.max(worst, inside[0]! - rect.top, rect.top + rect.height - inside[inside.length - 1]!);
	}
	const across = worst / rect.height;
	worst = 0;
	for (const list of rows) {
		const inside = inner(list, rect.left, rect.left + rect.width);
		if (!inside.length) return n;
		worst = Math.max(worst, inside[0]! - rect.left, rect.left + rect.width - inside[inside.length - 1]!);
	}
	return Math.max(across, worst / rect.width) * n;
}

/**
 * The longest stretch, in strips, along which a cut stays within `close` strips of another: of the other
 * lobe (`halves`: a thin line of the picture between them) or its neighbour in its own lobe (`neighbours`,
 * the outer edges included: a thin strip of paper). Two cuts crossing or pinching at a fair angle are close
 * only for a short way; a long close stretch is paper too thin to weave. `n` is the heart's strips; the
 * square is `side` units across.
 */
export function longestCloseRun(fingers: Finger[], pairs: 'halves' | 'neighbours', n: number, side: number, close: number): number {
	const strip = side / n;
	const step = (close * strip) / 3;
	const near = close * strip;
	// The other cut's points in buckets `near` wide, so each point looks only at its own and the next ones.
	const bucket = (pts: Vec[]) => {
		const map = new Map<string, Vec[]>();
		for (const q of pts) {
			const key = `${Math.floor(q.x / near)},${Math.floor(q.y / near)}`;
			const list = map.get(key);
			if (list) list.push(q);
			else map.set(key, [q]);
		}
		return map;
	};
	const runOf = (cut: Vec[], other: Map<string, Vec[]>) => {
		let run = 0;
		let longest = 0;
		for (const p of cut) {
			const bx = Math.floor(p.x / near);
			const by = Math.floor(p.y / near);
			let hit = false;
			for (let dx = -1; dx <= 1 && !hit; dx++)
				for (let dy = -1; dy <= 1 && !hit; dy++)
					hit = (other.get(`${bx + dx},${by + dy}`) ?? []).some((q) => Math.hypot(q.x - p.x, q.y - p.y) < near);
			run = hit ? run + step : 0;
			longest = Math.max(longest, run);
		}
		return longest;
	};
	let longest = 0;
	if (pairs === 'halves') {
		const inner = (f: Finger) => f.segments.some((s) => s.p1.x !== s.p0.x || s.p1.y !== s.p0.y || s.p0.x !== s.p3.x);
		const right = bucket(fingers.filter((f) => f.lobe === 'right').flatMap((f) => samplePoints(f, step)));
		for (const f of fingers.filter((f) => f.lobe === 'left' && inner(f))) longest = Math.max(longest, runOf(samplePoints(f, step), right));
	} else {
		for (const lobe of ['left', 'right'] as const) {
			const cuts = fingers
				.filter((f) => f.lobe === lobe)
				.map((f) => ({ f, at: lobe === 'left' ? f.segments[0]!.p0.y : f.segments[0]!.p0.x }))
				.sort((a, b) => a.at - b.at)
				.map(({ f }) => samplePoints(f, step));
			for (let k = 1; k < cuts.length; k++)
				longest = Math.max(longest, runOf(cuts[k]!, bucket(cuts[k - 1]!)), runOf(cuts[k - 1]!, bucket(cuts[k]!)));
		}
	}
	return longest / strip;
}

/**
 * Whether a random heart's or tile's cuts make paper that weaves, beyond the red cuts: no two cuts of the
 * two lobes running within 0.2 of a strip of each other for more than 2.5 strips (a thin line of the
 * picture), no two neighbouring cuts of a lobe that close for more than a strip (a thin strip of paper),
 * and, if `gap` is given, no band along the square's edge wider than it that no cut enters. The gallery's
 * hearts that lay cuts on each other on purpose (invisible lines) would fail the first; random ones do not.
 */
export function weavesWell(
	fingers: Finger[],
	rect: { left: number; top: number; width: number; height: number },
	n: number,
	gap?: number
): boolean {
	if (longestCloseRun(fingers, 'neighbours', n, rect.width, 0.2) > 1) return false;
	if (longestCloseRun(fingers, 'halves', n, rect.width, 0.2) > 2.5) return false;
	return gap === undefined || edgeGap(fingers, rect, n) <= gap;
}
