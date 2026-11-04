import type { CutGeometry } from '$lib/inverse/toHeartDesign';
import type { Finger, HeartDesign, LobeId, Vec } from '$lib/types/heart';
import { PRINT_WIDTH_MM, paperFaults } from '$lib/geometry/paperNecks';
import { lobesShareTemplate } from '$lib/utils/symmetry';
import { inferOverlapRect } from '$lib/utils/overlapRect';
import type { Edge, Point, Ring } from './geometry';

type Cuts = CutGeometry | Pick<HeartDesign, 'fingers'>;

type Segment = Finger['segments'][number];

/** Each join of the cuts' paths that turns more than 135°, with the path and
 * the index of the segment it starts (the `k`-th path). */
function visitCutTips(cuts: Cuts, visit: (point: Vec, turn: number, path: Segment[], i: number, k: number) => void) {
	const paths = 'fingers' in cuts ? cuts.fingers.map(f => f.segments)
		: [...cuts.A_overlap_paths, ...cuts.B_overlap_paths].map(path => path.map(ref => {
			const points = cuts.curves[ref.curve].control_points.map(([x, y]) => ({ x, y }));
			if (ref.reverse) points.reverse();
			return { p0: points[0], p1: points[1], p2: points[2], p3: points[3] };
		}));
	const tangent = (a: Vec, candidates: Vec[]) => {
		for (const b of candidates) {
			const d = { x: b.x - a.x, y: b.y - a.y };
			if (Math.hypot(d.x, d.y) > 1e-10) return d;
		}
		return { x: 0, y: 0 };
	};
	for (const [k, path] of paths.entries()) for (let i = 1; i < path.length; i++) {
		const a = path[i - 1], b = path[i];
		const incoming = tangent(a.p3, [a.p2, a.p1, a.p0]);
		const outgoing = tangent(b.p0, [b.p1, b.p2, b.p3]);
		if (!(incoming.x || incoming.y) || !(outgoing.x || outgoing.y)) continue;
		const turn = Math.atan2(Math.abs(incoming.x * outgoing.y - incoming.y * outgoing.x),
			-incoming.x * outgoing.x - incoming.y * outgoing.y);
		if (turn > 3 * Math.PI / 4) visit(b.p0, turn, path, i, k);
	}
}

/** Count narrow paper tips at joins of the actual cutting paths. A turn of
 * more than 150° leaves a tip below 30°; more than 135° leaves one below 45°.
 * Prefer removing the narrowest tips first. Spacing is checked separately.
 * A needle `forced` says is one the heart's symmetry cuts (see `cutMeasures`)
 * counts as a sharp tip only. */
export function cutTipCounts(cuts: Cuts, forced?: (point: Vec) => boolean): [number, number] {
	let needles = 0, sharp = 0;
	visitCutTips(cuts, (point, turn) => {
		if (turn > 5 * Math.PI / 6 && !forced?.(point)) needles++;
		sharp++;
	});
	return [needles, sharp];
}

/** Joints below 45°, in the input's coordinate system. The same joint can be
 * present on both sheets; moving a coincident cut must affect both together. */
export function cutTipPoints(cuts: Cuts): Vec[] {
	const points: Vec[] = [];
	visitCutTips(cuts, point => points.push(point));
	return points;
}

export function fewerCutTips(a: [number, number], b: [number, number]): boolean {
	return a[0] < b[0] || a[0] === b[0] && a[1] < b[1];
}

/** A heart's cuts as hearts drawn by different means are compared: the places
 * its paper may tear (pieces hanging by less than 2 mm printed 80 mm wide, see
 * `paperFaults`, and needles), whether its two lobes need templates of their
 * own (1) rather than sharing one (0, see `lobesShareTemplate`), its sharp
 * tips, its turns of more than 25° along hidden cuts (where its picture, the
 * even–odd `rings` in the sheet's 100 units, has one colour on both sides),
 * and the length of all its cuts in those units. */
export function cutMeasures(design: HeartDesign, rings: Ring[]): [number, number, number, number, number] {
	const rect = inferOverlapRect(design.fingers, design.gridSize);
	const unit = (x: number, y: number): Point => [(x - rect.left) / rect.width * 100, (y - rect.top) / rect.height * 100];
	const inside = (x: number, y: number, ring: Ring) => {
		let c = false;
		for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
			const [xi, yi] = ring[i], [xj, yj] = ring[j];
			if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
		}
		return c;
	};
	const colour = (x: number, y: number) => rings.reduce((v, ring) => v ^ Number(inside(x, y, ring)), 0);
	let length = 0, turns = 0;
	for (const finger of design.fingers) {
		if (!finger.id.includes('-cut-')) continue;
		const pts: Point[] = [];
		for (const sg of finger.segments) for (let k = pts.length ? 1 : 0; k <= 8; k++) {
			const t = k / 8, u = 1 - t, at = (c: 'x' | 'y') => u * u * u * sg.p0[c] + 3 * u * u * t * sg.p1[c] + 3 * u * t * t * sg.p2[c] + t * t * t * sg.p3[c];
			pts.push(unit(at('x'), at('y')));
		}
		// Turns are looked for between points half a unit apart or more.
		let last: number | null = null, from = pts[0];
		for (let i = 1; i < pts.length; i++) {
			const p = pts[i], q = pts[i - 1], l = Math.hypot(p[0] - q[0], p[1] - q[1]);
			if (!l) continue;
			length += l;
			const m = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2], n = [-(p[1] - q[1]) / l, (p[0] - q[0]) / l];
			const hidden = colour(m[0] + .15 * n[0], m[1] + .15 * n[1]) === colour(m[0] - .15 * n[0], m[1] - .15 * n[1]);
			if (Math.hypot(p[0] - from[0], p[1] - from[1]) < .5) continue;
			const direction = Math.atan2(p[1] - from[1], p[0] - from[0]);
			if (last !== null && hidden) {
				let a = Math.abs(direction - last);
				if (a > Math.PI) a = 2 * Math.PI - a;
				if (a > 25 * Math.PI / 180) turns++;
			}
			last = direction;
			from = p;
		}
	}
	// Where the lobes share a template, a tip of the picture on the heart's middle
	// (the sheet's diagonal) is cut down its middle by both papers: the star's
	// top tip, its 36° an 18° point of each paper. No such heart is without
	// those needles, so they count as its sharp tips only.
	const shared = lobesShareTemplate(design.fingers, design.gridSize);
	const onMiddle = (p: Vec) => { const [x, y] = unit(p.x, p.y); return Math.abs(x - y) < MIDDLE_NEEDLE; };
	const [needles, sharp] = cutTipCounts(design, shared ? onMiddle : undefined);
	return [paperFaults(design).weak + needles, shared ? 0 : 1, sharp, turns, Math.round(length)];
}

/** How near the heart's middle, in the sheet's 100 units, a needle lies that
 * its symmetry cuts (see `cutMeasures`). */
const MIDDLE_NEEDLE = 1;

/** The needles a heart's symmetry cuts (see `cutMeasures`), in its design's
 * coordinates: none where its lobes do not share a template. */
export function middleNeedles(design: HeartDesign): Vec[] {
	if (!lobesShareTemplate(design.fingers, design.gridSize)) return [];
	const rect = inferOverlapRect(design.fingers, design.gridSize), points: Vec[] = [];
	visitCutTips(design, (p, turn) => {
		const x = (p.x - rect.left) / rect.width * 100, y = (p.y - rect.top) / rect.height * 100;
		if (turn > 5 * Math.PI / 6 && Math.abs(x - y) < MIDDLE_NEEDLE) points.push(p);
	});
	return points;
}

/** How far, from the way a needle's leg leaves its tip, the leg turns where it
 * turns away (see `middleNeedleBases`). */
const LEG_TURN = Math.PI / 6;

/**
 * How wide the paper of each needle its symmetry cuts (see `middleNeedles`) is
 * held: as far apart as the cut's two legs from the tip are where the first of
 * them turns away (the star's top tip: where a paper's cut leaves the star's
 * flank for a hidden cut), in millimetres printed `widthMm` wide, at that turn
 * and on the lobe whose cut it is. No cuts keep the point from being thin, but
 * how wide it is held is up to where they leave it.
 */
export function middleNeedleBases(design: HeartDesign, widthMm = PRINT_WIDTH_MM): { lobe: LobeId; x: number; y: number; mm: number }[] {
	if (!lobesShareTemplate(design.fingers, design.gridSize)) return [];
	const rect = inferOverlapRect(design.fingers, design.gridSize), mm = widthMm / Math.max(rect.width, rect.height);
	const bases: { lobe: LobeId; x: number; y: number; mm: number }[] = [];
	const at = (s: Segment, t: number): Vec => {
		const u = 1 - t, a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
		return { x: a * s.p0.x + b * s.p1.x + c * s.p2.x + d * s.p3.x, y: a * s.p0.y + b * s.p1.y + c * s.p2.y + d * s.p3.y };
	};
	const apart = (p: Vec, line: Vec[]) => Math.min(...line.slice(1).map((q, j) => {
		const o = line[j]!, dx = q.x - o.x, dy = q.y - o.y, l = dx * dx + dy * dy;
		const t = l ? Math.max(0, Math.min(1, ((p.x - o.x) * dx + (p.y - o.y) * dy) / l)) : 0;
		return Math.hypot(p.x - o.x - t * dx, p.y - o.y - t * dy);
	}));
	visitCutTips(design, (tip, turn, path, i, k) => {
		const x = (tip.x - rect.left) / rect.width * 100, y = (tip.y - rect.top) / rect.height * 100;
		if (!(turn > 5 * Math.PI / 6 && Math.abs(x - y) < MIDDLE_NEEDLE)) return;
		// Each leg from the tip, finely: back through the segments before it, on through those after.
		const steps = 16, sampled = (order: number[], back: boolean) => [tip, ...order.flatMap(j =>
			Array.from({ length: steps }, (_, n) => at(path[j]!, back ? 1 - (n + 1) / steps : (n + 1) / steps)))];
		const legs = [sampled(Array.from({ length: i }, (_, j) => i - 1 - j), true), sampled(Array.from({ length: path.length - i }, (_, j) => i + j), false)];
		// Each as far as it runs before it turns away from the way it leaves the tip.
		const straight = legs.map(points => {
			let from: Vec | undefined;
			for (let n = 1; n < points.length; n++) {
				const a = points[n - 1]!, b = points[n]!, dx = b.x - a.x, dy = b.y - a.y;
				if (Math.hypot(dx, dy) < 1e-9) continue;
				if (!from) { from = { x: dx, y: dy }; continue; }
				if (Math.atan2(Math.abs(from.x * dy - from.y * dx), from.x * dx + from.y * dy) > LEG_TURN) return points.slice(0, n);
			}
			return points;
		});
		const [one, other] = straight as [Vec[], Vec[]];
		const ends = [{ p: one.at(-1)!, w: apart(one.at(-1)!, other) }, { p: other.at(-1)!, w: apart(other.at(-1)!, one) }];
		const held = ends[0]!.w <= ends[1]!.w ? ends[0]! : ends[1]!;
		bases.push({ lobe: design.fingers[k]!.lobe, x: held.p.x, y: held.p.y, mm: held.w * mm });
	});
	return bases;
}

/** Whether cuts measured `a` (see `cutMeasures`) are better than `b`'s:
 * fewer places that may tear win outright, then one template for both lobes
 * over two; otherwise the first measure that differs decides, but a sharp tip
 * less buys no cuts much busier (a quarter more hidden turns, a twentieth
 * more length). */
export function betterCuts(a: readonly number[], b: readonly number[]): boolean {
	if (a[0] !== b[0]) return a[0] < b[0];
	if (a[1] !== b[1]) return a[1] < b[1];
	const i = a.findIndex((x, k) => x !== b[k]);
	return i >= 0 && a[i] < b[i] && a[3] <= 1.25 * b[3] + 2 && a[4] <= 1.05 * b[4];
}

/** Count a cell's tips before joining it to the checkerboard. Each gate has
 * one shared cut and two opposite grid continuations, one on each sheet.
 * Include those joins: a locally smooth letter can still meet the grid sharply.
 * This ranks existing connections only; the complete cuts must be validated. */
export function cellTipCounts(edges: Edge[], gates: { point: Point; axis: number }[]): [number, number] {
	const joins = [new Map<string, Point[]>(), new Map<string, Point[]>()];
	const add = (family: number, point: Point, vector: Point) => {
		const key = point.map(v => v.toFixed(7)).join(',');
		const vectors = joins[family].get(key) ?? [];
		vectors.push(vector);
		joins[family].set(key, vectors);
	};
	for (const edge of edges) for (const family of [0, 1]) {
		if (edge.family !== 'AB' && edge.family !== (family ? 'B' : 'A')) continue;
		add(family, edge.from, [edge.to[0] - edge.from[0], edge.to[1] - edge.from[1]]);
		add(family, edge.to, [edge.from[0] - edge.to[0], edge.from[1] - edge.to[1]]);
	}
	for (const { point, axis } of gates) for (const family of [0, 1]) {
		const vector: Point = [0, 0];
		vector[axis] = family ? 1 : -1;
		add(family, point, vector);
	}
	let needles = 0, sharp = 0;
	for (const sheet of joins) for (const vectors of sheet.values()) {
		if (vectors.length !== 2) return [Infinity, Infinity];
		const [a, b] = vectors;
		const turn = Math.atan2(Math.abs(a[0] * b[1] - a[1] * b[0]), -a[0] * b[0] - a[1] * b[1]);
		if (turn > 5 * Math.PI / 6) needles++;
		if (turn > 3 * Math.PI / 4) sharp++;
	}
	return [needles, sharp];
}
