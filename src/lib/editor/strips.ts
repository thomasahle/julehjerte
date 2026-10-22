/**
 * Tegn's sizes in the Normal tab (n × n strips): the heart's cuts drawn again for another number of
 * strips, keeping the drawing. The cuts of each half stay spread over the square as they were, and a
 * new cut is drawn where it falls between two old ones, as much like each as it lies near it, so a
 * wave stays a wave and a plain heart stays plain; the square's sides stay its edges.
 */
import type { BezierSegment, Finger, LobeId, Vec } from '$lib/types/heart';
import type { OverlapRect } from '$lib/utils/overlapRect';
import { splitBezierAt } from '$lib/geometry/bezierSegments';

/** Nodes nearer than this along their cuts (`progress`) are one node when two cuts are lined up. */
const SAME_NODE = 1e-3;
/** Points per segment in measuring how far along its cut each is. */
const SAMPLES = 24;

/**
 * `fingers` (each half's cuts `L-0`… and `R-0`…, the edges first and last), spanning the square `from`,
 * drawn for `n` strips in each half spanning `to`. A half that has `n` strips already keeps its cuts,
 * moved onto `to`.
 */
export function restripped(fingers: Finger[], from: OverlapRect, to: OverlapRect, n: number): Finger[] {
	const place = (p: Vec): Vec => ({
		x: to.left + ((p.x - from.left) / from.width) * to.width,
		y: to.top + ((p.y - from.top) / from.height) * to.height
	});
	const placed = (segs: BezierSegment[]) => segs.map((s) => ({ p0: place(s.p0), p1: place(s.p1), p2: place(s.p2), p3: place(s.p3) }));
	const out: Finger[] = [];
	for (const lobe of ['left', 'right'] as const) {
		const prefix = lobe === 'left' ? 'L' : 'R';
		const cuts = fingers
			.filter((f) => f.lobe === lobe)
			.sort((a, b) => index(a) - index(b));
		const k = cuts.length - 1;
		if (k < 1) continue;
		for (let j = 0; j <= n; j++) {
			const at = (j / n) * k;
			const i = Math.min(k - 1, Math.floor(at));
			const w = at - i;
			const id = `${prefix}-${j}`;
			// On an old cut: that cut, its node types and all.
			const on = w < 1e-9 ? cuts[i]! : w > 1 - 1e-9 ? cuts[i + 1]! : null;
			if (on) {
				out.push({ ...on, id, lobe: lobe as LobeId, segments: placed(on.segments) });
				continue;
			}
			out.push({ id, lobe, segments: placed(blend(cuts[i]!.segments, cuts[i + 1]!.segments, w)) });
		}
	}
	return out;
}

const index = (f: Finger) => Number(f.id.split('-')[1]);

/** Between cuts `a` and `b`, `w` of the way to `b`: the two lined up node for node, and each control point blended. */
function blend(a: BezierSegment[], b: BezierSegment[], w: number): BezierSegment[] {
	const [sa, sb] = lineUp(a, b);
	const mix = (p: Vec, q: Vec): Vec => ({ x: p.x + (q.x - p.x) * w, y: p.y + (q.y - p.y) * w });
	return sa.map((s, k) => {
		const t = sb[k]!;
		return { p0: mix(s.p0, t.p0), p1: mix(s.p1, t.p1), p2: mix(s.p2, t.p2), p3: mix(s.p3, t.p3) };
	});
}

/**
 * The two cuts with the same nodes, at the same places along them (`progress`): each is split where
 * the other has a node it has not, which leaves its shape as it was. Should rounding leave one with
 * fewer segments, its longest are halved until they match.
 */
function lineUp(a: BezierSegment[], b: BezierSegment[]): [BezierSegment[], BezierSegment[]] {
	const pa = progress(a);
	const pb = progress(b);
	let sa = splitAt(a, pa, nodesOf(pb.table));
	let sb = splitAt(b, pb, nodesOf(pa.table));
	while (sa.length < sb.length) sa = halveLongest(sa);
	while (sb.length < sa.length) sb = halveLongest(sb);
	return [sa, sb];
}

/**
 * How far along a cut its points are, 0 at its start and 1 at its end, at SAMPLES even parameter
 * steps of each segment (`table`): how far across from its start to its end, where the cut never
 * turns back (so a wave and the straight edge beside it are lined up across the square), else by its
 * length. `across`, for the first, gives it exactly at any point.
 */
type Progress = { table: number[][]; across: ((p: Vec) => number) | null };

function progress(segs: BezierSegment[]): Progress {
	const points = segs.map((seg) => Array.from({ length: SAMPLES + 1 }, (_, i) => at(seg, i / SAMPLES)));
	const start = segs[0]!.p0;
	const end = segs[segs.length - 1]!.p3;
	const chord = { x: end.x - start.x, y: end.y - start.y };
	const square = chord.x * chord.x + chord.y * chord.y;
	const across = (p: Vec) => (square ? ((p.x - start.x) * chord.x + (p.y - start.y) * chord.y) / square : 0);
	const table = points.map((row) => row.map(across));
	const flat = table.flat();
	if (square && flat.every((v, i) => i === 0 || v >= flat[i - 1]! - 1e-9)) return { table, across };
	let run = 0;
	const lengths = points.map((row) => row.map((p, i) => (i ? (run += Math.hypot(p.x - row[i - 1]!.x, p.y - row[i - 1]!.y)) : run)));
	return { table: run ? lengths.map((row) => row.map((v) => v / run)) : table, across: null };
}

/** Where a cut's inner nodes are along it (`progress`). */
const nodesOf = (table: number[][]): number[] => table.slice(0, -1).map((row) => row[SAMPLES]!);

/** The cut split at each of the places `parts` along it (`progress`) where it has no node already. */
function splitAt(segs: BezierSegment[], { table, across }: Progress, parts: number[]): BezierSegment[] {
	const own = nodesOf(table);
	const out: BezierSegment[] = [];
	segs.forEach((seg, k) => {
		const row = table[k]!;
		const ts = parts
			.filter((f) => f > row[0]! + SAME_NODE && f < row[SAMPLES]! - SAME_NODE && !own.some((o) => Math.abs(o - f) < SAME_NODE))
			.map((f) => paramAt(row, f, across && ((t: number) => across(at(seg, t)))))
			.sort((x, y) => x - y);
		let rest = seg;
		let done = 0;
		for (const t of ts) {
			const [head, tail] = splitBezierAt(rest, (t - done) / (1 - done));
			out.push(head);
			rest = tail;
			done = t;
		}
		out.push(rest);
	});
	return out;
}

/**
 * The parameter at which a segment's progress (its row of `progress`) reaches `f`: between the two
 * samples either side of it, halved down to exact where `exact` gives the progress at any parameter.
 */
function paramAt(row: number[], f: number, exact: ((t: number) => number) | null): number {
	for (let i = 1; i < row.length; i++) {
		if (row[i]! < f) continue;
		if (exact) {
			let lo = (i - 1) / SAMPLES;
			let hi = i / SAMPLES;
			for (let k = 0; k < 40; k++) {
				const mid = (lo + hi) / 2;
				if (exact(mid) < f) lo = mid;
				else hi = mid;
			}
			return (lo + hi) / 2;
		}
		const span = row[i]! - row[i - 1]!;
		return (i - 1 + (span ? (f - row[i - 1]!) / span : 0)) / SAMPLES;
	}
	return 1;
}

/** A segment's length, by SAMPLES straight steps. */
function lengthOf(seg: BezierSegment): number {
	let length = 0;
	let prev = seg.p0;
	for (let i = 1; i <= SAMPLES; i++) {
		const p = at(seg, i / SAMPLES);
		length += Math.hypot(p.x - prev.x, p.y - prev.y);
		prev = p;
	}
	return length;
}

function halveLongest(segs: BezierSegment[]): BezierSegment[] {
	const lengths = segs.map(lengthOf);
	const k = lengths.indexOf(Math.max(...lengths));
	return [...segs.slice(0, k), ...splitBezierAt(segs[k]!, 0.5), ...segs.slice(k + 1)];
}

function at(s: BezierSegment, t: number): Vec {
	const u = 1 - t;
	return {
		x: u * u * u * s.p0.x + 3 * u * u * t * s.p1.x + 3 * u * t * t * s.p2.x + t * t * t * s.p3.x,
		y: u * u * u * s.p0.y + 3 * u * u * t * s.p1.y + 3 * u * t * t * s.p2.y + t * t * t * s.p3.y
	};
}
