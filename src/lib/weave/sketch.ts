/**
 * A weaving film worked out in the browser, for a heart that has no recording.
 *
 * A recording (static/weave/<id>.jhb) comes from the weave simulator, which takes minutes per
 * heart and knows only the gallery. A visitor's own heart gets this instead: the same paper,
 * steps and player, but the strips are moved by rule, not by physics. The red strips wait
 * folded back over their lobe. For each one in turn, the white strips that go through it are
 * lifted, it is rolled over onto the rest, and at each crossing one strip opens and the other
 * is fed through it as a loop, tip first, the way the hands do it. A loose end bends but never
 * stretches. Paper may still pass through paper where a loop goes in and along curved cuts,
 * which the simulator never allows.
 *
 * The result has the shape of a parsed recording (static/weave/film.js, `parse`) with a `pose`
 * function in place of its frames. Strips, levels and step tags follow scripts/weave/unweave.py:
 * strip 0 is the one at the notch, and red strip n is inside white strip m when n + m + parity
 * is even.
 */

import { parsePathDataToSegments } from '$lib/geometry/bezierSegments';
import type { HeartDesign } from '$lib/types/heart';
import { serializeHeartDesign } from '$lib/utils/heartDesign';
import { median } from '$lib/utils/math';

export type Point = [number, number];

/** What the player needs of a film: a parsed recording's fields, with `pose` for its frames. */
export interface SketchFilm {
	nv: number;
	nf: number;
	faces: Uint32Array;
	/** Per point: 1 for the red half. */
	piece: Uint8Array;
	/** Per point: 1 upper layer, -1 lower layer, 0 on the fold. */
	sign: Int8Array;
	/** Per point: where it is in its own half, along the strip from the fold and across. */
	rest: Float32Array;
	kc: Int8Array;
	kd: Float32Array;
	kf: Float32Array;
	fps: number;
	nframes: number;
	chapters: [number, string, string, string][];
	stats: Record<string, number>;
	film: { SQ: number; RAD: number; KERF: number; ZI: number; ZM: number; ZT: number; cutsA: Point[][]; cutsB: Point[][]; straight: boolean; redoff: number };
	/** Writes every point's place (x, y, z per point) `seconds` into the weaving. */
	pose(into: Float32Array, seconds: number): void;
}

// The simulator's sizes: the woven square, the lobe's radius, the inner and outer layer's height
// over the middle of the weave, the lobes' height, where the paper lies before weaving, the table.
export const SQ = 3;
const RAD = SQ / 2;
const ZI = 0.012;
const ZO = 0.036;
const ZL = (ZI + ZO) / 2;
const ZM = -0.032;
const ZT = -0.052;
const REDOFF = SQ + 0.45;

/** Squares across the woven part of the mesh. */
const GRID = 40;
const CELL = SQ / GRID;
const LOBE = -1;

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const smooth = (x: number) => {
	const u = clamp(x, 0, 1);
	return u * u * (3 - 2 * u);
};

/**
 * The two halves' cuts from a heart's lines in its 0–100 square, each in its own half's
 * measures: along the strip from the fold (0) to the lobe (SQ), and across. A line that runs
 * up-down is a cut of the red half, one that runs across a cut of the white (as
 * scripts/weave/cutmesh.py reads a heart); a heart drawn with one half's cuts has the same
 * cuts in the other. Sorted from the notch's side.
 */
export function halvesCuts(lines: Point[][]): { a: Point[][]; b: Point[][] } {
	const a: Point[][] = [];
	const b: Point[][] = [];
	for (const line of lines) {
		const pts = line.filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]));
		if (pts.length < 2) continue;
		const first = pts[0]!;
		const last = pts[pts.length - 1]!;
		const upDown = Math.abs(last[1] - first[1]) > Math.abs(last[0] - first[0]);
		let cut = pts.map(([x, y]): Point => {
			const wx = clamp(SQ * (1 - y / 100), 0, SQ);
			const wy = clamp(SQ * (1 - x / 100), 0, SQ);
			return upDown ? [wx, wy] : [wy, wx];
		});
		if (cut[0]![0] > cut[cut.length - 1]![0]) cut = cut.reverse();
		// A cut runs from the fold to the lobe; one drawn short is carried on to both.
		if (cut[0]![0] > 1e-6) cut.unshift([0, cut[0]![1]]);
		if (cut[cut.length - 1]![0] < SQ - 1e-6) cut.push([SQ, cut[cut.length - 1]![1]]);
		(upDown ? a : b).push(cut);
	}
	const mean = (cut: Point[]) => cut.reduce((sum, p) => sum + p[1], 0) / cut.length;
	const sorted = (cuts: Point[][]) => cuts.slice().sort((p, q) => mean(q) - mean(p));
	return { a: sorted(a.length ? a : b), b: sorted(b.length ? b : a) };
}

/**
 * A heart's cuts as lines in the 0–100 of its square (the two outer edges of each half left
 * out). The square is where the cuts end, as the page draws the heart (inferOverlapRect): a
 * file's cuts may run on past its own 0–100 ("Mor og barn" is drawn from −12.5 to 112.5).
 */
export function designLines(design: HeartDesign): Point[][] {
	const lines = serializeHeartDesign(design).fingers.map((finger) => {
		const line: Point[] = [];
		for (const { p0, p1, p2, p3 } of parsePathDataToSegments(finger.pathData))
			for (let k = line.length ? 1 : 0; k <= 12; k++) {
				const u = k / 12;
				const w = 1 - u;
				line.push([
					w * w * w * p0.x + 3 * w * w * u * p1.x + 3 * w * u * u * p2.x + u * u * u * p3.x,
					w * w * w * p0.y + 3 * w * w * u * p1.y + 3 * w * u * u * p2.y + u * u * u * p3.y
				]);
			}
		return line;
	});
	// A line that runs across ends on the square's left and right sides, one that runs up-down on its top and bottom.
	const ends: [number[], number[]][] = [
		[[], []],
		[[], []]
	];
	for (const line of lines) {
		const first = line[0];
		const last = line[line.length - 1];
		if (!first || !last) continue;
		const axis = Math.abs(last[1] - first[1]) > Math.abs(last[0] - first[0]) ? 1 : 0;
		ends[axis]![0].push(Math.min(first[axis], last[axis]));
		ends[axis]![1].push(Math.max(first[axis], last[axis]));
	}
	const side = (axis: number): [number, number] => {
		// A heart drawn with one half's cuts is as wide as it is long.
		const [lows, highs] = ends[axis]![0].length ? ends[axis]! : ends[1 - axis]!;
		const lo = lows.length ? median(lows) : 0;
		const hi = highs.length ? median(highs) : 100;
		return hi - lo < 50 || (Math.abs(lo) < 1e-6 && Math.abs(hi - 100) < 1e-6) ? [0, 100] : [lo, hi];
	};
	const [x0, x1] = side(0);
	const [y0, y1] = side(1);
	return lines.map((line) => line.map(([x, y]): Point => [(100 * (x - x0)) / (x1 - x0), (100 * (y - y0)) / (y1 - y0)]));
}

/** Which strip a place lies in: the number of cuts on the notch's side of it. */
function stripAt(cuts: Point[][], s: number, v: number): number {
	let n = 0;
	// A cut ends at the lobe's edge: a place on that edge is beside its last stretch.
	const at = Math.min(s, SQ - 1e-9);
	for (const cut of cuts) {
		let above = false;
		for (let i = 1; i < cut.length; i++) {
			const p = cut[i - 1]!;
			const q = cut[i]!;
			if (p[0] <= at === q[0] <= at) continue;
			if (p[1] + ((at - p[0]) / (q[0] - p[0])) * (q[1] - p[1]) > v) above = !above;
		}
		if (above) n++;
	}
	return n;
}

interface HalfMesh {
	/** Per point: along, across, layer (1, 0, -1), own strip (LOBE beyond the cuts). */
	along: number[];
	across: number[];
	layer: number[];
	strip: number[];
	faces: number[];
}

/**
 * One half as triangles: a square grid whose corners near a cut (or the lobe's rim) are moved
 * onto it, so that no triangle straddles a cut, and every strip given corners of its own along
 * its cuts. The two layers share the corners on the fold, the strips those at the lobe.
 */
function meshHalf(cuts: Point[][], flip: boolean): HalfMesh {
	const rows = GRID + 1;
	const columns = Math.round((SQ + RAD) / CELL) + 1;
	const at = (i: number, j: number) => i * rows + j;
	const ps = new Float64Array(columns * rows);
	const pv = new Float64Array(columns * rows);
	const near = new Float64Array(columns * rows).fill(CELL / 2);
	const onto = new Int16Array(columns * rows).fill(-1);
	for (let i = 0; i < columns; i++)
		for (let j = 0; j < rows; j++) {
			ps[at(i, j)] = i * CELL;
			pv[at(i, j)] = j * CELL;
		}
	cuts.forEach((cut, k) => {
		for (let e = 1; e < cut.length; e++) {
			const p = cut[e - 1]!;
			const q = cut[e]!;
			const steps = Math.max(1, Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]) / (CELL / 4)));
			for (let u = 0; u <= steps; u++) {
				const s = p[0] + ((q[0] - p[0]) * u) / steps;
				const v = p[1] + ((q[1] - p[1]) * u) / steps;
				const i0 = Math.round(s / CELL);
				const j0 = Math.round(v / CELL);
				for (let i = Math.max(0, i0 - 1); i <= Math.min(GRID, i0 + 1); i++)
					for (let j = Math.max(1, j0 - 1); j <= Math.min(GRID - 1, j0 + 1); j++) {
						const d = Math.hypot(i * CELL - s, j * CELL - v);
						if (d >= near[at(i, j)]!) continue;
						near[at(i, j)] = d;
						onto[at(i, j)] = k;
						ps[at(i, j)] = i === 0 || i === GRID ? i * CELL : s;
						pv[at(i, j)] = v;
					}
			}
		}
	});
	const RIM = cuts.length;
	for (let i = GRID + 1; i < columns; i++)
		for (let j = 0; j < rows; j++) {
			const r = Math.hypot(i * CELL - SQ, j * CELL - SQ / 2);
			if (Math.abs(r - RAD) >= CELL / 2) continue;
			onto[at(i, j)] = RIM;
			ps[at(i, j)] = SQ + ((i * CELL - SQ) * RAD) / r;
			pv[at(i, j)] = SQ / 2 + ((j * CELL - SQ / 2) * RAD) / r;
		}

	const mesh: HalfMesh = { along: [], across: [], layer: [], strip: [], faces: [] };
	const made = new Map<number, number>();
	const owners = cuts.length + 2;
	const point = (g: number, strip: number, layer: number) => {
		const column = Math.floor(g / rows);
		const owner = column >= GRID ? LOBE : strip;
		const side = column === 0 ? 0 : layer;
		const key = (g * owners + owner + 1) * 3 + side + 1;
		let index = made.get(key);
		if (index === undefined) {
			index = mesh.along.length;
			made.set(key, index);
			mesh.along.push(ps[g]!);
			mesh.across.push(pv[g]!);
			mesh.layer.push(side);
			mesh.strip.push(owner);
		}
		return index;
	};
	const triangle = (g0: number, g1: number, g2: number) => {
		const area = (ps[g1]! - ps[g0]!) * (pv[g2]! - pv[g0]!) - (ps[g2]! - ps[g0]!) * (pv[g1]! - pv[g0]!);
		if (Math.abs(area) < 1e-9) return;
		const s = (ps[g0]! + ps[g1]! + ps[g2]!) / 3;
		const v = (pv[g0]! + pv[g1]! + pv[g2]!) / 3;
		if (s > SQ && Math.hypot(s - SQ, v - SQ / 2) > RAD) return;
		const strip = s > SQ ? LOBE : stripAt(cuts, s, v);
		for (const layer of [1, -1]) {
			const [p0, p1, p2] = [point(g0, strip, layer), point(g1, strip, layer), point(g2, strip, layer)];
			if (p0 === p1 || p1 === p2 || p0 === p2) continue;
			if (layer < 0 !== flip) mesh.faces.push(p0, p2, p1);
			else mesh.faces.push(p0, p1, p2);
		}
	};
	for (let i = 0; i + 1 < columns; i++)
		for (let j = 0; j + 1 < rows; j++) {
			const [g0, g1, g2, g3] = [at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1)];
			// Split the square along the cut that runs through two of its corners, or the shorter way.
			const along02 = onto[g0]! >= 0 && onto[g0] === onto[g2];
			const along13 = onto[g1]! >= 0 && onto[g1] === onto[g3];
			const shorter02 = Math.hypot(ps[g2]! - ps[g0]!, pv[g2]! - pv[g0]!) <= Math.hypot(ps[g3]! - ps[g1]!, pv[g3]! - pv[g1]!);
			if (along02 !== along13 ? along02 : shorter02) {
				triangle(g0, g1, g2);
				triangle(g0, g2, g3);
			} else {
				triangle(g0, g1, g3);
				triangle(g1, g2, g3);
			}
		}
	return mesh;
}

// A strip's loose end is a ribbon bent along its length only: the direction it runs in at each
// of SAMPLES places from where it leaves the weave (0 flat on towards its fold, π/2 straight
// up, π back over the woven part). Bending a ribbon this way never stretches it.
const SAMPLES = 128;
const STEP = SQ / SAMPLES;
/** How far back a waiting red strip is folded over its lobe, and the length its fold takes. */
const FOLD = (150 * Math.PI) / 180;
const CREASE = 0.2;
/** How far the bend runs ahead along a strip that is brought over: 0 swings it stiffly. */
const ROLL = 1.5;
/** The tightest a strip bends where it leaves the weave, and how far its tip stops from there. */
const BEND = 0.05;
const FEET = 0.03;
/** How far a loop waiting for its turn tips back, on top of what a loop being fed tips. */
const TIP_BACK = (22 * Math.PI) / 180;
/** How high a red strip lies over the white strips it has not been woven with yet. */
const ZF = 0.05;
/** How high a strip's upper layer rises over the strip that is fed into it. */
const LENS = 0.15;

/** A strip folded back, brought over by `u` (0 folded back, 1 flat) with the bend running from its root to its tip. */
function fillFold(out: Float64Array, length: number, u: number): void {
	for (let i = 0; i <= SAMPLES; i++) {
		const d = i * STEP;
		out[i] = FOLD * Math.min(1, d / CREASE) * (1 - smooth(u * (1 + ROLL) - (ROLL * d) / Math.max(length, 1e-6)));
	}
}

/**
 * A strip's first `length` stood up as a loop that comes back down beside where it started,
 * ready to be fed on tip first; the rest of the strip runs on flat from there. The loop tips
 * back so that it comes down straight, and by `back` more. Returns how far from its start it
 * comes down.
 */
function fillLoop(out: Float64Array, length: number, back: number): number {
	out.fill(0);
	if (length < 2 * STEP) return 0;
	const feet = Math.min(FEET, 0.3 * length);
	const round = clamp(0.1 * length, 0.02, 0.27);
	// Up by θ, a straight leg, over the top by −2θ, a leg, and θ back to flat: the legs' length and
	// θ follow from the loop's length and from its two feet standing `feet` apart.
	const most = Math.min(Math.PI - 0.05, length / (2 * round));
	const gap = (theta: number) => round * Math.sin(theta) + (length / 2 - round * theta) * Math.cos(theta) - feet / 2;
	let theta: number;
	let radius = round;
	if (most > Math.PI / 2 && gap(most) <= 0) {
		let lo = Math.PI / 2;
		let hi = most;
		for (let i = 0; i < 30; i++) {
			const mid = (lo + hi) / 2;
			if (gap(mid) > 0) lo = mid;
			else hi = mid;
		}
		theta = (lo + hi) / 2;
	} else {
		// Too short for legs: one round loop, sin θ / θ = feet / length.
		let lo = 0;
		let hi = Math.PI;
		for (let i = 0; i < 30; i++) {
			const mid = (lo + hi) / 2;
			if (Math.sin(mid) / mid > feet / length) lo = mid;
			else hi = mid;
		}
		theta = (lo + hi) / 2;
		radius = length / (2 * theta);
	}
	const bend = Math.min(BEND, radius / 3) * theta;
	const top = 2 * (radius - bend / theta) * theta;
	const leg = Math.max(0, (length - 2 * bend - top) / 2);
	const lean = clamp(theta - (85 * Math.PI) / 180, 0, (40 * Math.PI) / 180) + back;
	const parts: [number, number][] = [
		[bend, theta + lean],
		[leg, 0],
		[top, -2 * theta],
		[leg, 0],
		[bend, theta - lean]
	];
	let part = 0;
	let before = 0;
	let angle = 0;
	for (let i = 0; i <= SAMPLES; i++) {
		const d = i * STEP;
		if (d >= length) break;
		while (part < parts.length - 1 && d > before + parts[part]![0]) {
			angle += parts[part]![1];
			before += parts[part++]![0];
		}
		const [span, turn] = parts[part]!;
		out[i] = angle + (span > 1e-9 ? (turn * (d - before)) / span : turn);
	}
	return feet;
}

const ORDINALS = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth'];
const ordinal = (n: number) => ORDINALS[n] ?? `${n + 1}.`;
const capital = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);

/**
 * The film of a heart from its lines in the 0–100 square (`halvesCuts`) and its weave parity.
 * `pace` is how many times faster than its own seconds the player shows the weaving.
 */
export function sketchFilm(lines: Point[][], parity: number, pace = 1): SketchFilm {
	const cuts = halvesCuts(lines);
	const halves = [meshHalf(cuts.a, false), meshHalf(cuts.b, true)];
	const redCount = halves[0]!.along.length;
	const nv = redCount + halves[1]!.along.length;
	const reds = cuts.a.length + 1;
	const whites = cuts.b.length + 1;

	const piece = new Uint8Array(nv);
	const sign = new Int8Array(nv);
	const rest = new Float32Array(nv * 2);
	const strip = new Int16Array(nv);
	/** Per point: the other half's strip it lies on or under in the woven heart. */
	const other = new Int16Array(nv).fill(LOBE);
	/** Per point: its height over the middle of the woven heart. */
	const level = new Float32Array(nv).fill(ZL);
	const faces: number[] = [];
	halves.forEach((half, h) => {
		const from = h === 0 ? 0 : redCount;
		for (let i = 0; i < half.along.length; i++) {
			const k = from + i;
			piece[k] = h === 0 ? 1 : 0;
			sign[k] = half.layer[i]!;
			rest[2 * k] = half.along[i]!;
			rest[2 * k + 1] = half.across[i]!;
			strip[k] = half.strip[i]!;
			if (strip[k] === LOBE) continue;
			// A place's along and across in one half are its across and along in the other.
			other[k] = stripAt(h === 0 ? cuts.b : cuts.a, half.across[i]!, half.along[i]!);
			const redInside = ((strip[k]! + other[k]! + parity) & 1) === 0;
			level[k] = redInside === (h === 0) ? ZI : ZO;
		}
		for (const f of half.faces) faces.push(from + f);
	});

	// Where a strip has come to when it has passed the other half's strip number j: halfway
	// between the two strips' reaches along it, from the lobe's side (SQ) to the fold (0). The
	// strips are numbered through both halves: red strip n is n, white strip m is reds + m.
	const count = reds + whites;
	const reach: number[][] = [];
	for (let s = 0; s < count; s++) {
		const [from, to, own, others] = s < reds ? [0, redCount, s, whites] : [redCount, nv, s - reds, reds];
		const low = new Array<number>(others).fill(Infinity);
		const high = new Array<number>(others).fill(-Infinity);
		for (let k = from; k < to; k++) {
			if (strip[k] !== own || other[k]! < 0) continue;
			low[other[k]!] = Math.min(low[other[k]!]!, rest[2 * k]!);
			high[other[k]!] = Math.max(high[other[k]!]!, rest[2 * k]!);
		}
		const stops = [SQ];
		for (let j = 0; j + 1 < others; j++) {
			const between = Number.isFinite(low[j]!) && Number.isFinite(high[j + 1]!) ? (low[j]! + high[j + 1]!) / 2 : SQ * (1 - (j + 1) / others);
			stops.push(clamp(between, 0, stops[j]!));
		}
		stops.push(0);
		reach.push(stops);
	}
	/** Whether red strip n goes inside white strip m (the white one inside the red otherwise). */
	const inside = (n: number, m: number) => ((n + m + parity) & 1) === 0;

	// The steps, in the film's own seconds: the halves come together, then strip by strip.
	const crossing = clamp(48 / (reds * whites), 0.45, 1.5) * pace;
	const steps: { from: number; to: number; row: number; white: number }[] = [];
	const chapters: SketchFilm['chapters'] = [];
	let now = 0;
	const add = (seconds: number, row: number, white: number, tag: string, title: string, text: string) => {
		chapters.push([Math.round(now * 100) / 100, title, text, tag]);
		steps.push({ from: now, to: now + seconds, row, white });
		now += seconds;
	};
	add(3.2 * pace, -1, -1, 'start', 'Bring the two halves together', 'The red strips are folded back out of the way and the red half slides in beside the white one.');
	for (let n = 0; n < reds; n++) {
		add(1.5 * pace, n, -1, `row,${n}`, `Bring the ${ordinal(n)} red strip over`, 'The white strips that go through it are lifted first.');
		for (let m = 0; m < whites; m++) {
			if (inside(n, m)) add(crossing, n, m, `${n},${m},R`, `${capital(ordinal(n))} red strip through the ${ordinal(m)} white`, 'The white strip opens and the red strip is fed through it, tip first.');
			else add(crossing, n, m, `${n},${m},W`, `${capital(ordinal(m))} white strip through the ${ordinal(n)} red`, 'The red strip opens and the white strip is fed through it, tip first.');
		}
	}
	const fps = 10;
	const nframes = Math.ceil(now * fps) + 1;
	const span = (nframes - 1) / fps;
	chapters.push([span, 'The woven heart', 'Every strip is in place.', 'woven']);

	// Per strip, as the frame being drawn has it: where it leaves the weave, whether its loose end
	// is bent (and then where each of its samples is: on along the strip, up, and its direction),
	// and how high its loose end lies where it is flat (`floor`, from `edge` on).
	const hinge = new Float64Array(count);
	const bent = new Uint8Array(count);
	const xs = new Float64Array(count * (SAMPLES + 1));
	const zs = new Float64Array(count * (SAMPLES + 1));
	const as = new Float64Array(count * (SAMPLES + 1));
	const edge = new Float64Array(count);
	const floor = new Float64Array(count);
	const angles = new Float64Array(SAMPLES + 1);
	/** The strip that is open for another to be fed through, where along it, and how far open. */
	const lens = { strip: -1, lo: 0, hi: 0, open: 0 };

	/**
	 * Bends strip s as `angles` says. A loop of `length` is made to come down `feet` from where
	 * it started, by `settled` (1 wholly): the samples do not close it to the last hundredth.
	 */
	const bend = (s: number, length = 0, feet = 0, settled = 0) => {
		const base = s * (SAMPLES + 1);
		let x = 0;
		let z = 0;
		xs[base] = 0;
		zs[base] = 0;
		as[base] = angles[0]!;
		for (let i = 1; i <= SAMPLES; i++) {
			const mid = (angles[i - 1]! + angles[i]!) / 2;
			x += STEP * Math.cos(mid);
			z += STEP * Math.sin(mid);
			xs[base + i] = x;
			zs[base + i] = z;
			as[base + i] = angles[i]!;
		}
		bent[s] = 1;
		if (settled <= 0 || length <= 0) return;
		const at = Math.min(SAMPLES - 1e-6, length / STEP);
		const i0 = Math.floor(at);
		const dz = settled * (zs[base + i0]! + (zs[base + i0 + 1]! - zs[base + i0]!) * (at - i0));
		const dx = smooth((settled - 0.8) / 0.2) * (xs[base + i0]! + (xs[base + i0 + 1]! - xs[base + i0]!) * (at - i0) - feet);
		for (let i = 1; i <= SAMPLES; i++) {
			const share = Math.min(1, (i * STEP) / length);
			zs[base + i] = zs[base + i]! - dz * share;
			xs[base + i] = xs[base + i]! - dx * share;
		}
	};
	const scale = (by: number) => {
		for (let i = 0; i <= SAMPLES; i++) angles[i] = angles[i]! * by;
	};
	/** Strip s is fed through the strip beside it, from where it has come to (`near`) to `far`. */
	const thread = (s: number, near: number, far: number, u: number, waiting: boolean) => {
		hinge[s] = near;
		edge[s] = near + (far - near) * smooth((u - 0.18) / 0.14);
		if (u < 0.32) {
			// A red strip lies flat and is stood up as a loop; a white one waits as a loop, tipped back.
			const up = smooth(u / 0.25);
			const feet = fillLoop(angles, near, waiting ? TIP_BACK * (1 - up) : 0);
			if (!waiting) scale(up);
			bend(s, near, feet, up);
			return;
		}
		const left = near * (1 - smooth((u - 0.32) / 0.5));
		if (left < 2 * STEP) return;
		bend(s, left, fillLoop(angles, left, 0), 1);
	};
	/** Strip s opens between `near` and `far` for the strip that is fed through it there. */
	const host = (s: number, near: number, far: number, u: number) => {
		hinge[s] = near + (far - near) * smooth(u / 0.3);
		edge[s] = hinge[s]!;
		lens.strip = s;
		lens.lo = far;
		lens.hi = near;
		lens.open = smooth((u - 0.18) / 0.14) * (1 - smooth((u - 0.84) / 0.16));
	};

	function pose(into: Float32Array, seconds: number): void {
		const t = clamp(seconds, 0, span);
		let at = steps.length - 1;
		for (let i = 0; i < steps.length; i++)
			if (t < steps[i]!.to) {
				at = i;
				break;
			}
		const step = steps[at]!;
		const u = t >= step.to ? 1 : (t - step.from) / (step.to - step.from);
		const coming = step.row < 0;
		const done = t >= span;
		// While the halves come together: the red strips fold back, the red half slides in, both rise off the table.
		const offset = coming ? REDOFF * (1 - smooth((u - 0.45) / 0.55)) : 0;
		const lifted = coming ? smooth(u) : 1;
		const ground = ZM * (1 - lifted);
		lens.strip = -1;
		bent.fill(0);
		for (let s = 0; s < count; s++) {
			hinge[s] = done ? 0 : SQ;
			edge[s] = hinge[s]!;
			floor[s] = 0;
			if (done) continue;
			if (s < reds) {
				if (coming) {
					fillFold(angles, SQ, 1 - smooth((u - (0.1 * s) / reds) / 0.4));
					bend(s);
				} else if (s < step.row) hinge[s] = edge[s] = 0;
				else if (s > step.row) {
					fillFold(angles, SQ, 0);
					bend(s);
				} else {
					floor[s] = ZF;
					if (step.white < 0) {
						fillFold(angles, SQ, smooth((u - 0.4) / 0.6));
						bend(s);
					} else if (inside(s, step.white)) thread(s, reach[s]![step.white]!, reach[s]![step.white + 1]!, u, false);
					else host(s, reach[s]![step.white]!, reach[s]![step.white + 1]!, u);
				}
				continue;
			}
			if (coming) continue;
			const m = s - reds;
			const near = reach[s]![step.row]!;
			const far = reach[s]![step.row + 1]!;
			hinge[s] = edge[s] = m < step.white ? far : near;
			if (m < step.white) continue;
			if (m === step.white) {
				if (inside(step.row, m)) host(s, near, far, u);
				else thread(s, near, far, u, true);
			} else if (!inside(step.row, m)) {
				// A white strip that is to go through this red strip waits as a loop, tipped back.
				const up = step.white < 0 ? smooth(u / 0.5) : 1;
				const feet = fillLoop(angles, near, TIP_BACK);
				scale(up);
				bend(s, near, feet, up);
			}
		}
		for (let k = 0, j = 0; k < nv; k++, j += 3) {
			const along = rest[2 * k]!;
			const across = rest[2 * k + 1]!;
			const g = sign[k]!;
			const red = piece[k] === 1;
			const n = strip[k]!;
			let place = along;
			let z: number;
			if (n < 0) z = g * (ZI + (level[k]! - ZI) * lifted);
			else {
				const s = red ? n : reds + n;
				const h = hinge[s]!;
				if (along >= h) z = g * (ZI + (level[k]! - ZI) * smooth((along - h) / 0.1));
				else if (bent[s] === 0) z = g * ZI + floor[s]! * smooth((edge[s]! - along) / 0.2);
				else {
					// `d` along the loose end from where it leaves the weave.
					const d = (h - along) / STEP;
					const i = Math.min(SAMPLES - 1, Math.floor(d));
					const base = s * (SAMPLES + 1) + i;
					const w = d - i;
					const angle = as[base]! + (as[base + 1]! - as[base]!) * w;
					place = h - (xs[base]! + (xs[base + 1]! - xs[base]!) * w);
					z = zs[base]! + (zs[base + 1]! - zs[base]!) * w + floor[s]! * smooth((edge[s]! - place) / 0.2) + g * ZI * Math.cos(angle);
					place += g * ZI * Math.sin(angle);
				}
				if (s === lens.strip && g > 0 && along > lens.lo && along < lens.hi) {
					const bump = Math.sin((Math.PI * (along - lens.lo)) / (lens.hi - lens.lo));
					z += lens.open * LENS * bump * bump;
				}
			}
			into[j] = red ? offset + place : across;
			into[j + 1] = red ? across : place;
			into[j + 2] = ground + z;
		}
	}

	const collinear = (cut: Point[]) => {
		const [p, q] = [cut[0]!, cut[cut.length - 1]!];
		const length = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
		return cut.every((r) => Math.abs((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])) / length < 0.005 * SQ);
	};
	return {
		nv,
		nf: faces.length / 3,
		faces: Uint32Array.from(faces),
		piece,
		sign,
		rest,
		kc: new Int8Array(nv).fill(-1),
		kd: new Float32Array(nv * 2),
		kf: new Float32Array(nv),
		fps,
		nframes,
		chapters,
		stats: { crossings: reds * whites },
		film: { SQ, RAD, KERF: 0, ZI, ZM, ZT, cutsA: cuts.a.slice().reverse(), cutsB: cuts.b.slice().reverse(), straight: [...cuts.a, ...cuts.b].every(collinear), redoff: REDOFF },
		pose
	};
}
