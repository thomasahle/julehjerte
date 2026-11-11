/**
 * A weaving film worked out in the browser, for a heart that has no recording.
 *
 * A recording (static/weave/<id>.jhb) comes from the weave simulator, which takes minutes per
 * heart and knows only the gallery. A visitor's own heart gets this instead: the same paper,
 * steps and player, but the strips are moved by rule, not by physics. Each red strip waits
 * folded back over its lobe and is laid across the white strips one at a time; where it goes
 * inside a white strip, that strip's upper layer rises over it. Paper passes through paper at
 * the place a strip is being laid, which the simulator never allows.
 *
 * The result has the shape of a parsed recording (static/weave/film.js, `parse`) with a `pose`
 * function in place of its frames. Strips, levels and step tags follow scripts/weave/unweave.py:
 * strip 0 is the one at the notch, and red strip n is inside white strip m when n + m + parity
 * is even.
 */

import { parsePathDataToSegments } from '$lib/geometry/bezierSegments';
import type { HeartDesign } from '$lib/types/heart';
import { serializeHeartDesign } from '$lib/utils/heartDesign';

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

/** A heart's cuts as lines in its 0–100 square, as its file has them (the two outer edges of each half left out). */
export function designLines(design: HeartDesign): Point[][] {
	return serializeHeartDesign(design).fingers.map((finger) => {
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

// How a strip stands while it waits: up from where it leaves the weave, over, and down again
// behind, so that a whole strip is no taller than the simulator's. Each part is a length and
// the angle it turns through when the strip stands fully (`amount` 1); at 0 the strip lies flat.
const STAND: [number, number][] = [
	[0.12 * (Math.PI / 2), Math.PI / 2],
	[1.1, 0],
	[0.15 * Math.PI, Math.PI],
	[Infinity, 0]
];
/** How far a waiting strip leans in when its turn comes. */
const LEAN = 0.8;
/** How high a white strip's upper layer rises over the red strip that goes inside it. */
const TENT = 0.07;

/** Where the standing part's pieces begin for an `amount`: x, z and direction, per piece. */
function standing(amount: number): number[] {
	const starts: number[] = [];
	let x = 0;
	let z = 0;
	let angle = 0;
	for (const [length, turn] of STAND) {
		starts.push(x, z, angle);
		if (!Number.isFinite(length)) break;
		const by = turn * amount;
		if (by < 1e-6) {
			x -= Math.cos(angle) * length;
			z += Math.sin(angle) * length;
		} else {
			const radius = length / by;
			x -= radius * (Math.sin(angle + by) - Math.sin(angle));
			z += radius * (Math.cos(angle) - Math.cos(angle + by));
			angle += by;
		}
	}
	return starts;
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

	// Where red strip n has come to when it has passed white strip m: halfway between the two
	// white strips' reaches under it, from the lobe's side (SQ) to the fold (0).
	const reach: number[][] = [];
	for (let n = 0; n < reds; n++) {
		const low = new Array<number>(whites).fill(Infinity);
		const high = new Array<number>(whites).fill(-Infinity);
		for (let k = 0; k < redCount; k++) {
			if (strip[k] !== n || other[k]! < 0) continue;
			low[other[k]!] = Math.min(low[other[k]!]!, rest[2 * k]!);
			high[other[k]!] = Math.max(high[other[k]!]!, rest[2 * k]!);
		}
		const stops = [SQ];
		for (let m = 0; m + 1 < whites; m++) {
			const between = Number.isFinite(low[m]!) && Number.isFinite(high[m + 1]!) ? (low[m]! + high[m + 1]!) / 2 : SQ * (1 - (m + 1) / whites);
			stops.push(clamp(between, 0, stops[m]!));
		}
		stops.push(0);
		reach.push(stops);
	}

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
		add(pace, n, -1, `row,${n}`, `Bring the ${ordinal(n)} red strip over`, 'It leans in over the white strips.');
		for (let m = 0; m < whites; m++) {
			if (((n + m + parity) & 1) === 0)
				add(crossing, n, m, `${n},${m},R`, `${capital(ordinal(n))} red strip through the ${ordinal(m)} white`, 'The white strip opens and the red strip is laid inside it.');
			else add(crossing, n, m, `${n},${m},W`, `${capital(ordinal(m))} white strip through the ${ordinal(n)} red`, 'The red strip opens and is laid around the white strip.');
		}
	}
	const fps = 10;
	const nframes = Math.ceil(now * fps) + 1;
	const span = (nframes - 1) / fps;
	chapters.push([span, 'The woven heart', 'Every strip is in place.', 'woven']);

	const hinge = new Float64Array(reds);
	const amount = new Float64Array(reds);
	/** Per red strip: 0 waiting, 1 being laid, 2 laid. */
	const state = new Uint8Array(reds);
	const stands: number[][] = [];
	const lengths = STAND.map((part) => part[0]);
	const turns = STAND.map((part) => part[1]);

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
		// While the halves come together: the strips stand up, the red half slides in, both rise off the table.
		const offset = coming ? REDOFF * (1 - smooth((u - 0.45) / 0.55)) : 0;
		const lifted = coming ? smooth(u) : 1;
		const ground = ZM * (1 - lifted);
		for (let n = 0; n < reds; n++) {
			const done = t >= span || (!coming && n < step.row);
			const current = !coming && !done && n === step.row;
			state[n] = done ? 2 : current ? 1 : 0;
			hinge[n] = done ? 0 : current && step.white >= 0 ? reach[n]![step.white]! + (reach[n]![step.white + 1]! - reach[n]![step.white]!) * smooth(u) : SQ;
			amount[n] = coming ? smooth(u / 0.55) : current ? (step.white < 0 ? 1 - (1 - LEAN) * smooth(u) : LEAN) : 1;
			stands[n] = standing(amount[n]!);
		}
		for (let k = 0, j = 0; k < nv; k++, j += 3) {
			const along = rest[2 * k]!;
			const across = rest[2 * k + 1]!;
			const g = sign[k]!;
			const n = strip[k]!;
			if (piece[k] === 1) {
				const h = n < 0 ? 0 : hinge[n]!;
				if (n < 0 || along >= h) {
					into[j] = offset + along;
					into[j + 1] = across;
					into[j + 2] = ground + g * (ZI + (level[k]! - ZI) * lifted);
					continue;
				}
				// The part not yet laid: `d` along the standing strip from where it leaves the weave.
				const d = h - along;
				const starts = stands[n]!;
				let part = 0;
				let before = 0;
				while (part < 3 && d > before + lengths[part]!) before += lengths[part++]!;
				const x0 = starts[3 * part]!;
				const z0 = starts[3 * part + 1]!;
				const a0 = starts[3 * part + 2]!;
				const by = turns[part]! * amount[n]!;
				let x: number, z: number, angle: number;
				if (by < 1e-6) {
					angle = a0;
					x = x0 - Math.cos(a0) * (d - before);
					z = z0 + Math.sin(a0) * (d - before);
				} else {
					const radius = lengths[part]! / by;
					angle = a0 + (d - before) / radius;
					x = x0 - radius * (Math.sin(angle) - Math.sin(a0));
					z = z0 + radius * (Math.cos(a0) - Math.cos(angle));
				}
				into[j] = offset + h + x + g * ZI * Math.sin(angle);
				into[j + 1] = across;
				into[j + 2] = ground + z + g * ZI * Math.cos(angle);
				continue;
			}
			// White paper stays where it is; its layers move apart where a red strip has come inside.
			const red = other[k]!;
			let height = n < 0 ? ZI + (level[k]! - ZI) * lifted : ZI;
			let tent = 0;
			if (n >= 0 && red >= 0 && state[red] !== 0) {
				const past = state[red] === 2 ? 1 : smooth((across - hinge[red]!) / 0.15 + 1);
				height = ZI + (level[k]! - ZI) * past;
				if (state[red] === 1 && g > 0 && level[k]! > ZL) {
					const from = (across - hinge[red]!) / 0.22;
					tent = TENT * Math.exp(-from * from) * smooth(Math.min(hinge[red]!, SQ - hinge[red]!) / 0.25);
				}
			}
			into[j] = across;
			into[j + 1] = along;
			into[j + 2] = ground + g * height + tent;
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
