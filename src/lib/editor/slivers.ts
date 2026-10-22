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
}

/** The pieces of the woven picture, sampled `resolution` times each way (see `pieceSizes`). */
export function pieces(fingers: Finger[], rect: { left: number; top: number; width: number; height: number }, resolution = 128): Piece[] {
	const R = resolution;
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
	const seen = new Uint8Array(R * R);
	const found: Piece[] = [];
	const stack: number[] = [];
	for (let start = 0; start < R * R; start++) {
		if (seen[start]) continue;
		const col = colour[start];
		let size = 0;
		let perimeter = 0;
		let edge = false;
		stack.push(start);
		seen[start] = 1;
		while (stack.length) {
			const i = stack.pop()!;
			size++;
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
		found.push({ area: size / (R * R), perimeter, edge });
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
