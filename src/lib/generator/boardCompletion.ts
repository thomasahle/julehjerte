/**
 * The circle on a regular board where every line stays, past the radii at
 * which the motif in four can meet all their ends (see `boardRanges`): a
 * completion of the woven picture (docs/inverse/exact-weave-solvability.tex)
 * found once for each stretch of radii between the board's junctions, and
 * drawn here for a given radius.
 *
 * The white region F is the disk and the white squares the circle cuts. Its
 * boundary, between the board's junctions and the paper's edges, falls into
 * chains: a line's side of a white square, the arc beside a red square, the
 * next line's side. Along each chain switch points alternate the sheets; at
 * each, a hidden cut (cut in both sheets, showing nothing) leaves for another
 * switch point: across F hugging its boundary (through the white squares
 * outside the circle), across the red square beside the chain ("pockets"), or
 * in to one of the motif's outer gates. The motif keeps its four panels.
 *
 * Everything is worked in centred coordinates, y up, and handed back in the
 * sheet's (y down): a mirror image, which weaves as well.
 */
import { add, ConstructionError, type Edge, type Point, type Ring } from './geometry';
import type { BoardPattern } from './boardPatterns';

export type { BoardPattern };

type Cut = { family: 'A' | 'B'; axis: 'x' | 'y'; p: number };
type Piece =
	| { type: 'arc'; from: Cut; to: Cut; angles: [number, number] }
	| { type: 'side'; cut: Cut; from: Point; to: Point; square: [number, number] };
type Name = [side: 'T' | 'B' | 'L' | 'R', value: number];
type Chain = { pieces: Piece[]; start: Name | { chain: number; at: 'start' | 'end' }; end: Name | { chain: number; at: 'start' | 'end' } };
type Boundary = { chains: Chain[]; breaks: ('paper' | 'corner')[]; lines: number[]; m: number };

const EPS = 1e-9;
const angleOf = (x: number, y: number) => (Math.atan2(y, x) + 2 * Math.PI) % (2 * Math.PI);

/** The chains of F's boundary, counterclockwise, starting just after a break. */
function boundaryChains(strips: number, r: number, circle = 0): Boundary {
	const s = 100 / strips, m = (strips - 1) / 2, d = Array.from({ length: m }, (_, k) => s * (k + .5));
	const lines = [...d.map(x => -x).reverse(), ...d];
	const bound = (i: number) => i === 0 ? -50 : i === strips ? 50 : lines[i - 1];
	const colour = (i: number, j: number) => (Math.abs(i - m) + Math.abs(j - m)) % 2;
	const square = (x: number, y: number): [number, number] => [lines.filter(p => p < x).length, lines.filter(p => p < y).length];
	const crossings: { axis: 'x' | 'y'; p: number; at: Point; angle: number }[] = [];
	for (const p of lines) if (Math.abs(p) < r - EPS) for (const sgn of [-1, 1]) {
		const q = sgn * Math.sqrt(r * r - p * p);
		crossings.push({ axis: 'x', p, at: [p, q], angle: angleOf(p, q) }, { axis: 'y', p, at: [q, p], angle: angleOf(q, p) });
	}
	crossings.sort((a, b) => a.angle - b.angle);
	const cutOf = (axis: 'x' | 'y', p: number): Cut => ({ family: axis === 'x' ? 'A' : 'B', axis, p });
	type Element = Piece | { type: 'corner' } | { type: 'paper' };
	const elements: Element[] = [];
	for (let c = 0; c < crossings.length; c++) {
		const a = crossings[c], b = crossings[(c + 1) % crossings.length];
		const span = (b.angle - a.angle + 2 * Math.PI) % (2 * Math.PI), mid = a.angle + span / 2;
		const [i, j] = square(r * Math.cos(mid), r * Math.sin(mid));
		if ((colour(i, j) + circle) % 2 === 1) { elements.push({ type: 'arc', from: cutOf(a.axis, a.p), to: cutOf(b.axis, b.p), angles: [a.angle, b.angle] }); continue; }
		// Counterclockwise round the white square, which lies on the left, from a to b.
		const [x0, x1, y0, y1] = [bound(i), bound(i + 1), bound(j), bound(j + 1)];
		const ring: Point[] = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
		const onSide = ([x, y]: Point) => Math.abs(y - y0) < 1e-7 ? 0 : Math.abs(x - x1) < 1e-7 ? 1 : Math.abs(y - y1) < 1e-7 ? 2 : 3;
		let side = onSide(a.at), point = a.at;
		const endSide = onSide(b.at);
		for (let step = 0; step < 6; step++) {
			const last = side === endSide && step > 0, corner = ring[(side + 1) % 4], to = last ? b.at : corner;
			const vertical = side === 1 || side === 3, pos = vertical ? (side === 1 ? x1 : x0) : (side === 0 ? y0 : y1);
			if (Math.abs(Math.abs(pos) - 50) < EPS) elements.push({ type: 'paper' });
			else elements.push({ type: 'side', cut: cutOf(vertical ? 'x' : 'y', pos), from: point, to, square: [i - m, j - m] });
			if (last) break;
			if (!(Math.abs(Math.abs(corner[0]) - 50) < EPS && Math.abs(Math.abs(corner[1]) - 50) < EPS)) elements.push({ type: 'corner' });
			side = (side + 1) % 4;
			point = corner;
		}
	}
	const start = elements.findIndex(e => e.type === 'corner' || e.type === 'paper');
	const list = [...elements.slice(start + 1), ...elements.slice(0, start + 1)];
	const raw: Piece[][] = [], breaks: ('paper' | 'corner')[] = [];
	let current: Piece[] | null = null;
	for (const e of list) {
		if (e.type === 'corner' || e.type === 'paper') {
			if (current) { raw.push(current); breaks.push(e.type); }
			else if (breaks.length) breaks[breaks.length - 1] = e.type === 'paper' ? 'paper' : breaks[breaks.length - 1];
			current = null;
			continue;
		}
		(current ??= []).push(e);
	}
	if (current) raw.push(current);
	// Where each chain's end cut goes on outside F: to the paper, or on to another chain's end.
	const near = (a: Point, b: Point) => Math.abs(a[0] - b[0]) < 1e-7 && Math.abs(a[1] - b[1]) < 1e-7;
	const endOf = (k: number, at: 'start' | 'end') => {
		const piece = at === 'start' ? raw[k][0] : raw[k].at(-1)!;
		if (piece.type !== 'side') throw new Error('a chain ends on an arc');
		const J = at === 'start' ? piece.from : piece.to, other = at === 'start' ? piece.to : piece.from;
		return { cut: piece.cut, J, dir: [Math.sign(J[0] - other[0]), Math.sign(J[1] - other[1])] };
	};
	const follow = (k: number, at: 'start' | 'end'): Chain['start'] => {
		const { cut, J, dir } = endOf(k, at);
		let here = J;
		for (let guard = 0; guard < 50; guard++) {
			const along = cut.axis === 'x' ? 1 : 0;
			if (Math.abs(Math.abs(here[along]) - 50) < 1e-7)
				return cut.axis === 'x' ? [here[1] > 0 ? 'T' : 'B', cut.p] : [here[0] > 0 ? 'R' : 'L', cut.p];
			for (let c = 0; c < raw.length; c++) for (const w of ['start', 'end'] as const) {
				if (c === k && w === at) continue;
				const piece = w === 'start' ? raw[c][0] : raw[c].at(-1)!;
				if (piece.type !== 'side' || piece.cut.axis !== cut.axis || Math.abs(piece.cut.p - cut.p) > 1e-7) continue;
				if (near(w === 'start' ? piece.from : piece.to, here)) return { chain: c, at: w };
			}
			const step = dir[along], cur = here[along];
			const next = [...lines, -50, 50].filter(v => step > 0 ? v > cur + 1e-7 : v < cur - 1e-7).sort((a, b) => step > 0 ? a - b : b - a)[0];
			here = cut.axis === 'x' ? [cut.p, next] : [next, cut.p];
		}
		throw new Error('lost a line');
	};
	return { chains: raw.map((pieces, k) => ({ pieces, start: follow(k, 'start'), end: follow(k, 'end') })), breaks, lines, m };
}

/** A chain as a polyline, centred and y up, with the place each piece begins. */
function polyline(c: Chain, r: number): { points: Point[]; pieceStart: number[] } {
	const points: Point[] = [], pieceStart: number[] = [];
	for (const p of c.pieces) {
		pieceStart.push(Math.max(0, points.length - 1));
		if (p.type === 'side') { if (!points.length) points.push(p.from); points.push(p.to); continue; }
		const [a0, a1] = p.angles;
		const b = a1 < a0 ? a1 + 2 * Math.PI : a1, n = Math.max(2, Math.ceil((b - a0) / (Math.PI / 80)));
		for (let k = points.length ? 1 : 0; k <= n; k++) points.push([r * Math.cos(a0 + (b - a0) * k / n), r * Math.sin(a0 + (b - a0) * k / n)]);
	}
	return { points, pieceStart };
}


/** How far apart nested hidden cuts run, and the first from the boundary,
 * on seven strips: on finer boards, as much less as the clearance the cuts
 * need there. */
const SPACING = 1.6;
/** Rotate a centred point by quarter turns, counterclockwise. */
const turn = ([x, y]: Point, q: number): Point => { let p: Point = [x, y]; for (let k = 0; k < q % 4; k++) p = [-p[1], p[0]]; return p; };
/** An angle brought into [0, 2π). */
const turnAngle = (x: number) => (x % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
const toSheet = ([x, y]: Point): Point => [50 + x, 50 - y];
const toCentred = ([x, y]: Point): Point => [x - 50, 50 - y];
/** A polyline offset by `delta`, to the left of its direction (to the right
 * when negative): sampled finely, each sample moved along the normal of the
 * stretch around it, and the samples that come back within the offset of the
 * polyline elsewhere (round a sharp corner) left out. Where the closed
 * polyline `bound` comes nearer along a sample's normal (a narrow passage),
 * the sample moves only the `share` of the way there, so that cuts nested
 * deeper keep their order. */
function offset(points: Point[], delta: number, bound?: Point[], share = .5): Point[] {
	const step = .25, samples: Point[] = [], segment: number[] = [];
	for (let i = 0; i + 1 < points.length; i++) {
		const [a, b] = [points[i], points[i + 1]], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
		for (let k = 0; k < n; k++) { samples.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]); segment.push(i); }
	}
	samples.push(points.at(-1)!);
	segment.push(points.length - 1);
	const span = Math.max(2, Math.ceil(Math.abs(delta) / step));
	const room = (p: Point, n: Point) => {
		// How far along `n` from `p` the bound lies, if nearer than twice the offset.
		let near = Math.abs(delta) / share;
		if (!bound) return near;
		for (let k = 0; k < bound.length; k++) {
			const c = bound[k], d = bound[(k + 1) % bound.length];
			if (Math.max(c[0], d[0]) < p[0] - near || Math.min(c[0], d[0]) > p[0] + near || Math.max(c[1], d[1]) < p[1] - near || Math.min(c[1], d[1]) > p[1] + near) continue;
			const e = [d[0] - c[0], d[1] - c[1]], det = n[0] * -e[1] + e[0] * n[1];
			if (Math.abs(det) < 1e-12) continue;
			const w = [c[0] - p[0], c[1] - p[1]], t = (w[0] * -e[1] + e[0] * w[1]) / det, u = (n[0] * w[1] - n[1] * w[0]) / det;
			if (t > 1e-6 && t < near && u >= 0 && u <= 1) near = t;
		}
		return near;
	};
	const reach: number[] = [];
	const moved = samples.map((p, i) => {
		const a = samples[Math.max(0, i - span)], b = samples[Math.min(samples.length - 1, i + span)];
		const [tx, ty] = norm([b[0] - a[0], b[1] - a[1]]), side = Math.sign(delta), out = Math.min(Math.abs(delta), room(p, [-ty * side, tx * side]) * share);
		reach.push(out);
		return [p[0] - ty * side * out, p[1] + tx * side * out] as Point;
	});
	// Distance from a point to the polyline.
	const away = (q: Point) => Math.min(...points.slice(1).map((b, i) => {
		const a = points[i], dx = b[0] - a[0], dy = b[1] - a[1], l = dx * dx + dy * dy;
		const t = l ? Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / l)) : 0;
		return Math.hypot(q[0] - a[0] - t * dx, q[1] - a[1] - t * dy);
	}));
	const keep = moved.map((q, i) => i === 0 || i === moved.length - 1 || away(q) > reach[i] * .97);
	// Round a corner turning away from the offset side the samples near it
	// all come too close to one of its sides: go round it instead, at the
	// offset (or halfway across a narrow passage).
	const kept: Point[] = [];
	let last = -1;
	for (let i = 0; i < moved.length; i++) {
		if (!keep[i]) continue;
		if (last >= 0 && i > last + 1) {
			let corner = -1, sharpest = 0;
			for (let v = segment[last] + 1; v <= segment[i] && v + 1 < points.length; v++) {
				const d1 = [points[v][0] - points[v - 1][0], points[v][1] - points[v - 1][1]], d2 = [points[v + 1][0] - points[v][0], points[v + 1][1] - points[v][1]];
				const turn = Math.atan2(d1[0] * d2[1] - d1[1] * d2[0], d1[0] * d2[0] + d1[1] * d2[1]);
				if (turn * delta < -sharpest * Math.abs(delta)) { corner = v; sharpest = Math.abs(turn); }
			}
			if (corner >= 0) {
				const c = points[corner], from = moved[last], to = moved[i];
				const a0 = Math.atan2(from[1] - c[1], from[0] - c[0]), a1 = Math.atan2(to[1] - c[1], to[0] - c[0]);
				const sweep = turnAngle(a1 - a0 + Math.PI) - Math.PI, n = Math.ceil(Math.abs(sweep) * Math.abs(delta) / step);
				for (let k = 1; k < n; k++) {
					const angle = a0 + sweep * k / n, dir: Point = [Math.cos(angle), Math.sin(angle)];
					const radius = Math.min(Math.abs(delta), room(c, dir) * share);
					kept.push([c[0] + dir[0] * radius, c[1] + dir[1] * radius]);
				}
			}
		}
		kept.push(moved[i]);
		last = i;
	}
	// Thin to every few samples, keeping the ends, and cut out any loop where
	// the path comes back across itself (round a corner).
	return untangle(kept.filter((_, i) => i === 0 || i === kept.length - 1 || i % 3 === 0));
}
/** A polyline with each loop it makes cut out at the crossing. */
function untangle(path: Point[]): Point[] {
	const cross = (a: Point, b: Point, c: Point, d: Point): Point | null => {
		const r = [b[0] - a[0], b[1] - a[1]], q = [d[0] - c[0], d[1] - c[1]], det = r[0] * q[1] - r[1] * q[0];
		if (Math.abs(det) < 1e-12) return null;
		const t = ((c[0] - a[0]) * q[1] - (c[1] - a[1]) * q[0]) / det, u = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / det;
		return t > 0 && t < 1 && u > 0 && u < 1 ? [a[0] + t * r[0], a[1] + t * r[1]] : null;
	};
	const out = [...path];
	for (let i = 0; i + 1 < out.length; i++)
		for (let j = out.length - 2; j > i + 1; j--) {
			const x = cross(out[i], out[i + 1], out[j], out[j + 1]);
			if (x) { out.splice(i + 1, j - i, x); break; }
		}
	return out;
}
function norm([x, y]: number[]): [number, number] {
	const l = Math.hypot(x, y) || 1;
	return [x / l, y / l];
}

/**
 * The legs of a circle of `radius` on `strips` strips drawn by `pattern`:
 * adds the board's visible lines, the chains' visible stretches and the hidden
 * cuts to `edges`, and returns, for each of the motif's outer gates (side and
 * index, as in `connectCellGrid`), the hidden cut from the gate out to its
 * switch point. `around` is the radius midway between motif and circle.
 */
export function completionLegs(edges: Edge[], ring: Ring, strips: number, radius: number, pattern: BoardPattern, around: number):
	((side: number, index: number, from: Point) => Point[]) & { prepare: (all: { side: number; index: number; from: Point }[]) => void } {
	const { chains, lines } = boundaryChains(strips, radius, pattern.circle ?? 0), spacing = SPACING * 7 / Math.max(7, strips);
	const Q = chains.length / 4, quarter = chains.slice(0, Q);
	if (Q !== pattern.counts.length) throw new ConstructionError('topology', 'The pattern does not fit the circle');
	const polys = quarter.map(c => polyline(c, radius));
	// The outer points of the first quarter: chain and order along it.
	const outer: { k: number; t: number }[] = [];
	pattern.counts.forEach((n, k) => { for (let t = 0; t < n; t++) outer.push({ k, t }); });
	const N = outer.length;
	// Which piece of its chain each point lies on: a hidden cut through a white
	// square from the chain's side bordering it, a spoke from the arc.
	const sq = (c: Chain, at: 'first' | 'last') => { const p = at === 'first' ? c.pieces[0] : c.pieces.at(-1)!; return p.type === 'side' ? p.square : null; };
	const rotSq = (v: [number, number] | null, q: number) => v && turn(v, q).join(',');
	const piece = new Map<number, number>();
	for (const [kind, face, i, j, dq] of pattern.chords) {
		if (kind === 'spoke' && face === 0) piece.set(i, quarter[outer[i].k].pieces.findIndex(p => p.type === 'arc'));
		if (!kind.startsWith('arc') || face !== 0 || i >= N || j >= N) continue;
		if (dq === 0 && outer[i].k === outer[j].k) continue;
		const ci = quarter[outer[i].k], cj = quarter[outer[j].k];
		for (const a of ['first', 'last'] as const) for (const b of ['first', 'last'] as const)
			if (sq(ci, a) && rotSq(sq(ci, a), 0) === rotSq(sq(cj, b), dq)) {
				piece.set(i, a === 'first' ? 0 : ci.pieces.length - 1);
				piece.set(j, b === 'first' ? 0 : cj.pieces.length - 1);
			}
		// One between chains further apart runs across the circle, from the arcs.
		for (const [p, c] of [[i, ci], [j, cj]] as const) if (!piece.has(p) && c.pieces.some(x => x.type === 'arc')) piece.set(p, c.pieces.findIndex(x => x.type === 'arc'));
	}
	// The others take the piece of the point before them on the chain (or
	// after), unless the pattern says.
	pattern.pieces?.forEach((pc, p) => piece.set(p, pc));
	const placed: { at: number; point: Point }[] = [];
	pattern.counts.forEach((n, k) => {
		const ids = outer.map((o, p) => [o, p] as const).filter(([o]) => o.k === k).map(([, p]) => p);
		for (const [x, p] of ids.entries()) if (!piece.has(p)) {
			const before = ids.slice(0, x).reverse().find(q => piece.has(q)), after = ids.slice(x + 1).find(q => piece.has(q));
			piece.set(p, before !== undefined ? piece.get(before)! : after !== undefined ? piece.get(after)! : 0);
		}
		// Spread each piece's points evenly along it, clear of its ends.
		const { points, pieceStart } = polys[k];
		const len = (a: number, b: number) => { let l = 0; for (let i = a; i < b; i++) l += Math.hypot(points[i + 1][0] - points[i][0], points[i + 1][1] - points[i][1]); return l; };
		const pieces = quarter[k].pieces.length;
		for (let pc = 0; pc < pieces; pc++) {
			const mine = ids.filter(p => piece.get(p) === pc), a = pieceStart[pc], b = pc + 1 < pieces ? pieceStart[pc + 1] : points.length - 1;
			const total = len(a, b);
			mine.forEach((p, x) => {
				let d = total * (x + 1) / (mine.length + 1), i = a;
				while (i < b - 1 && d > len(i, i + 1)) { d -= len(i, i + 1); i++; }
				const seg = len(i, i + 1) || 1, t = Math.min(1, d / seg);
				placed[p] = { at: i + t, point: [points[i][0] + t * (points[i + 1][0] - points[i][0]), points[i][1] + t * (points[i + 1][1] - points[i][1])] };
			});
		}
	});
	// The boundary of F as one closed polyline, chain by chain with the paper
	// between, and where each chain begins on it.
	const loop: Point[] = [], chainAt: number[] = [];
	for (let q = 0; q < 4; q++) for (const { points } of polys) {
		chainAt.push(loop.length);
		loop.push(...points.map(p => turn(p, q)));
	}
	// A switch point's place on the loop (vertex index and fraction).
	const where = (q: number, p: number) => chainAt[q * Q + outer[p].k] + placed[p].at;
	const pointAt = (q: number, p: number) => turn(placed[p].point, q);
	// The loop from one place to another, counterclockwise.
	const along = (from: number, to: number): Point[] => {
		const n = loop.length, out: Point[] = [], at = (x: number): Point => {
			const i = Math.floor(x) % n, t = x - Math.floor(x), a = loop[i], b = loop[(i + 1) % n];
			return [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
		};
		let end = to;
		while (end < from) end += n;
		out.push(at(from));
		for (let i = Math.floor(from) + 1; i <= Math.floor(end); i++) out.push(loop[i % n]);
		out.push(at(end));
		return out.filter((p, i) => !i || Math.hypot(p[0] - out[i - 1][0], p[1] - out[i - 1][1]) > 1e-9);
	};
	// The hidden cuts, each as the stretch of the loop it cuts off: across F,
	// counterclockwise from its first end or its second as the pattern says;
	// across the red square, the stretch of its chain between its ends.
	const hidden: { kind: 'f' | 'pocket'; from: number; to: number; square?: Point[] }[] = [];
	// The red square beside a chain, which its pockets keep within: the one
	// its arc runs through, else the one across its side.
	const redSquare = (k: number, q: number): Point[] => {
		const c = quarter[k], arc = c.pieces.find(p => p.type === 'arc');
		const at: Point = arc ? (() => { const [a0, a1] = arc.angles, mid = a0 + turnAngle(a1 - a0) / 2; return [radius * 1.001 * Math.cos(mid), radius * 1.001 * Math.sin(mid)]; })()
			: (() => { const p = c.pieces[0] as Extract<Piece, { type: 'side' }>, m: Point = [(p.from[0] + p.to[0]) / 2, (p.from[1] + p.to[1]) / 2], w = p.square.map(v => v * 100 / strips) as Point; return [2 * m[0] - w[0], 2 * m[1] - w[1]]; })();
		const bounds = [-50, ...lines, 50], cell = (v: number) => bounds.findIndex((b, x) => x + 1 < bounds.length && v >= b && v < bounds[x + 1]);
		const [i0, j0] = [cell(at[0]), cell(at[1])], [x0, x1, y0, y1] = [bounds[i0], bounds[i0 + 1], bounds[j0], bounds[j0 + 1]];
		return ([[x0, y0], [x1, y0], [x1, y1], [x0, y1]] as Point[]).map(v => turn(v, q));
	};
	for (const [kind, , i, j, dq] of pattern.chords) {
		if (kind === 'spoke') continue;
		for (let q = 0; q < 4; q++) {
			const qb = (q + dq) % 4;
			if (kind === 'pocket') {
				const [a, b] = [where(q, i), where(qb, j)].sort((x, y) => x - y);
				hidden.push({ kind: 'pocket', from: a, to: b, square: redSquare(outer[i].k, q) });
			} else {
				const [a, b] = kind === 'arc+' ? [where(q, i), where(qb, j)] : [where(qb, j), where(q, i)];
				hidden.push({ kind: 'f', from: a, to: b });
			}
		}
	}
	const n = loop.length, span = (h: typeof hidden[number]) => ((h.to - h.from) % n + n) % n;
	const contains = (h: typeof hidden[number], g: typeof hidden[number]) => {
		const s = ((g.from - h.from) % n + n) % n, e = ((g.to - h.from) % n + n) % n;
		return g !== h && s < span(h) && e <= span(h) && s < e;
	};
	// A hidden cut runs one spacing further from the boundary than the most
	// deeply nested of those it encloses.
	const height = new Map<typeof hidden[number], number>();
	const heightOf = (h: typeof hidden[number]): number => {
		if (!height.has(h)) height.set(h, 1 + Math.max(0, ...hidden.filter(g => g.kind === h.kind && contains(h, g)).map(heightOf)));
		return height.get(h)!;
	};
	// A hidden cut across the white circle crosses the mouth of a white square
	// outside it, along the circle, rather than going in, where the cuts within
	// it all start and end in it.
	const fEnds = hidden.filter(g => g.kind === 'f').map(g => [g.from, g.to, g] as const);
	const rel = (x: number, base: number) => ((x - base) % n + n) % n;
	const guide = (h: typeof hidden[number]): Point[] => {
		const stretch = along(h.from, h.to);
		if (h.kind !== 'f') return stretch;
		const length = span(h), out: Point[] = [stretch[0]];
		const vertices: number[] = [];
		for (let k = Math.floor(h.from) + 1; rel(k, h.from) < length; k++) vertices.push(k % n);
		const outside = (v: number) => Math.hypot(...loop[v]) > radius + 1e-6;
		for (let x = 0; x < vertices.length; x++) {
			if (!outside(vertices[x]) || x === 0 || outside(vertices[x - 1])) { out.push(loop[vertices[x]]); continue; }
			let y = x;
			while (y + 1 < vertices.length && outside(vertices[y + 1])) y++;
			// The bay from the crossing before to the one after.
			const from = vertices[x - 1], to = y + 1 < vertices.length ? vertices[y + 1] : -1;
			const inside = (pos: number) => to >= 0 && rel(pos, from) > 0 && rel(pos, from) < rel(to, from);
			const whole = to >= 0 && !inside(h.from) && !inside(h.to) && fEnds.every(([a, b, g]) => g === h || inside(a) === inside(b));
			if (!whole) { for (let z = x; z <= y; z++) out.push(loop[vertices[z]]); continue; }
			const a0 = Math.atan2(loop[from][1], loop[from][0]), sweep = turnAngle(Math.atan2(loop[to][1], loop[to][0]) - a0);
			const steps = Math.max(1, Math.ceil(sweep / (Math.PI / 80)));
			for (let k = 1; k < steps; k++) out.push([radius * Math.cos(a0 + sweep * k / steps), radius * Math.sin(a0 + sweep * k / steps)]);
			x = y;
		}
		out.push(stretch.at(-1)!);
		return out.filter((p, i) => !i || Math.hypot(p[0] - out[i - 1][0], p[1] - out[i - 1][1]) > 1e-9);
	};
	// The hidden cuts across the white circle, for the spokes to pass under.
	const across: Point[] = [];
	for (const h of hidden) {
		const height = heightOf(h), stretch = guide(h);
		const path = offset(stretch, height * spacing * (h.kind === 'f' ? 1 : -1), h.kind === 'f' ? loop : h.square, height / (height + 1));
		if (h.kind === 'f') across.push(...path);
		add(edges, [stretch[0], ...path, stretch.at(-1)!].map(toSheet), 'AB', 'shared');
	}
	// Visible stretches: each chain between its switch points, the sheets
	// alternating from its first (swapped every quarter turn).
	const swap = (f: 'A' | 'B', q: number): 'A' | 'B' => q % 2 ? (f === 'A' ? 'B' : 'A') : f;
	for (let q = 0; q < 4; q++) quarter.forEach((c, k) => {
		const first = c.pieces[0].type === 'side' ? c.pieces[0].cut.family : c.pieces[0].from.family;
		const ids = outer.map((o, p) => [o, p] as const).filter(([o]) => o.k === k).map(([, p]) => p);
		const marks = [chainAt[q * Q + k], ...ids.map(p => where(q, p)), chainAt[q * Q + k] + polys[k].points.length - 1];
		for (let x = 0; x + 1 < marks.length; x++)
			add(edges, along(marks[x], marks[x + 1]).map(toSheet), swap(x % 2 ? (first === 'A' ? 'B' : 'A') : first, q), 'frame');
	});
	// The board's lines outside F: from each chain's ends out to the paper, or on to another chain.
	const seen = new Set<string>();
	for (let q = 0; q < 4; q++) for (const c of quarter) {
		for (const at of ['start', 'end'] as const) {
			const p = at === 'start' ? c.pieces[0] : c.pieces.at(-1)!;
			if (p.type !== 'side') continue;
			const J = at === 'start' ? p.from : p.to, e = at === 'start' ? c.start : c.end;
			let to: Point;
			if (Array.isArray(e)) to = p.cut.axis === 'x' ? [p.cut.p, e[0] === 'T' ? 50 : -50] : [e[0] === 'R' ? 50 : -50, p.cut.p];
			else {
				const other = e.at === 'start' ? chains[e.chain].pieces[0] : chains[e.chain].pieces.at(-1)!;
				if (other.type !== 'side') continue;
				to = e.at === 'start' ? other.from : other.to;
			}
			const a = turn(J, q), b = turn(to, q);
			const key = [a, b].map(v => v.map(x => x.toFixed(4)).join(',')).sort().join(';');
			if (seen.has(key) || Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-9) continue;
			seen.add(key);
			add(edges, [toSheet(a), toSheet(b)], (p.cut.family === 'A') === (q % 2 === 0) ? 'A' : 'B', 'frame');
		}
	}
	// Lines that border no part of F cross the paper whole.
	const bordering = new Set(chains.flatMap(c => c.pieces.flatMap(p => p.type === 'side' ? [`${p.cut.axis}${p.cut.p.toFixed(6)}`] : [])));
	for (let k = 1; k < strips; k++) {
		const line = 100 * k / strips;
		if (Math.abs(line - 50) < radius || bordering.has(`x${(line - 50).toFixed(6)}`)) continue;
		add(edges, [[line, 0], [line, 100]], 'A', 'frame');
		add(edges, [[0, line], [100, line]], 'B', 'frame');
	}
	// The motif's outer gates take the spokes: in each quarter the right gate
	// of its panel, then the top (turned with the quarter).
	const spokes = pattern.chords.filter(([kind, face]) => kind === 'spoke' && face === 0);
	// A motif kept whole has a gate on each side: the quarters take them in
	// turn from the one that leaves the spokes the least way round.
	const sides = [1, 0, 3, 2], whole = pattern.motif === 1 && (() => {
		const turn = (rho: number) => spokes.reduce((sum, [, , i, , dq]) => {
			const a = Math.atan2(placed[i].point[1], placed[i].point[0]), g = Math.PI / 2 * ((dq + rho) % 4);
			return sum + Math.abs(turnAngle(a - g + Math.PI) - Math.PI);
		}, 0);
		const rho = [0, 1, 2, 3].reduce((best, r) => turn(r) < turn(best) ? r : best, 0);
		return [0, 1, 2, 3].map(q => [[sides[(q + rho) % 4], 0]] as [number, number][]);
	})();
	const gates: [number, number][][] = whole || [[[1, 0], [0, 1]], [[0, 0], [3, 0]], [[3, 1], [2, 0]], [[2, 1], [1, 1]]];
	const spokeOf = (side: number, index: number, from: Point) => {
		for (let q = 0; q < 4; q++) for (const [, , i, j, dq] of spokes) {
			const mq = (q + dq) % 4, slot = j - N;
			if (gates[mq][slot]?.[0] !== side || gates[mq][slot]?.[1] !== index) continue;
			const target = pointAt(q, i), start = toCentred(from);
			const a0 = Math.atan2(start[1], start[0]), a1 = Math.atan2(target[1], target[0]);
			return { target, start, a0, delta: turnAngle(a1 - a0 + Math.PI) - Math.PI };
		}
		throw new ConstructionError('topology', 'A motif gate has no spoke');
	};
	const swept = (a0: number, delta: number, angle: number) => {
		const d = turnAngle(angle - a0);
		return delta < 0 ? d === 0 || 2 * Math.PI - d <= -delta : d <= delta;
	};
	// Where one spoke's gate lies within the turn another makes round the
	// motif, it runs a spacing deeper than that one.
	const levels = new Map<string, number>();
	const legs = (side: number, index: number, from: Point): Point[] => {
		// Round midway between motif and circle to the switch point's angle,
		// under the hidden cuts across the circle on the way, then out to it.
		const { target, start, a0, delta } = spokeOf(side, index, from), steps = Math.max(1, Math.ceil(Math.abs(delta) / (Math.PI / 90)));
		const under = Math.min(Infinity, ...across.filter(p => swept(a0, delta, Math.atan2(p[1], p[0]))).map(p => Math.hypot(...p))) - spacing;
		const reach = Math.max(Math.min(around, under) - (levels.get(`${side}:${index}`) ?? 0) * spacing, Math.hypot(...start));
		const path: Point[] = Array.from({ length: steps + 1 }, (_, t) => { const a = a0 + delta * t / steps; return [reach * Math.cos(a), reach * Math.sin(a)]; });
		return [...path, target].map(toSheet);
	};
	legs.prepare = (all: { side: number; index: number; from: Point }[]) => {
		const turns = all.map(g => ({ key: `${g.side}:${g.index}`, ...spokeOf(g.side, g.index, g.from) }));
		for (let round = 0; round < turns.length; round++)
			for (const s of turns) for (const t of turns)
				if (s !== t && swept(s.a0, s.delta, t.a0) && Math.abs(turnAngle(t.a0 - s.a0)) > 1e-9)
					levels.set(t.key, Math.max(levels.get(t.key) ?? 0, (levels.get(s.key) ?? 0) + 1));
	};
	return legs;
}
