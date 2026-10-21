import type { Vec } from '$lib/types/heart';
import { dot, vecAdd, vecDist, vecLength, vecScale, vecSub } from '$lib/geometry/vec';

/**
 * Where a dragged point goes when the pointer is somewhere the point may not be — where its cut
 * would cross another or come too close to one: the place nearest the pointer that it may be, so
 * that the point slides along the edge of where it may be as the pointer goes on past it, as a
 * point pushed against a wall slides along the wall. Only `allowed` says where the point may be, so
 * the search is the same for a node, a handle or a cut with copies that move with it, and for the
 * Escher tab, where every cut moves.
 *
 * The point goes from where it is straight towards the pointer until it meets the edge. There the
 * edge's way is measured, the pointer's foot on the edge's line found, and the point drawn in
 * towards the pointer from behind the edge at that foot: it meets the edge again, nearer the
 * pointer. A few such rounds find the nearest place on a bent edge, as Newton's method finds a root.
 *
 * `slide` is the edge's way where the last search ended: a drag going on along the same edge goes on
 * with it, and measures it again only once the point has gone on from where it was measured.
 */
export type Reached = { point: Vec; slide: Slide | null };

/** The edge's way, as measured at `at`. */
export type Slide = { way: Vec; at: Vec };

/** Rounds of drawing the point in towards the pointer, at most. */
const ROUNDS = 5;
/** Halvings of the angle in looking round for the edge's way, which is then known to 3°. */
const ANGLE_STEPS = 6;
/** Halvings of a line in finding how far along it the point may go, at most. */
const LINE_STEPS = 16;

/**
 * `from` is where the point is (and may be), `to` the pointer. `size` sets the search's scale: the
 * point ends within a 10000th of it of where it may go, and the edge is measured over a 75th of it.
 */
export function nearestAllowed(from: Vec, to: Vec, allowed: (p: Vec) => boolean, size: number, slide: Slide | null = null): Reached {
	if (allowed(to)) return { point: to, slide: null };
	if (!allowed(from)) return { point: from, slide: null };
	const grain = size / 10000;
	const reach = size / 150;
	let at = from;
	let way: Vec;
	// Where the way was measured; null for a way only looked round for.
	let measuredAt: Vec | null;
	if (slide) {
		({ way, at: measuredAt } = slide);
	} else {
		at = farthest(from, to, allowed, grain);
		const round = edgeWay(at, to, allowed, reach);
		if (!round) return { point: at, slide: null };
		way = round;
		measuredAt = null;
	}
	for (let k = 0; k < ROUNDS; k++) {
		if (!measuredAt || vecDist(measuredAt, at) > reach / 2) {
			way = measuredWay(at, way, allowed, grain, reach) ?? way;
			measuredAt = at;
		}
		const next = drawnNearer(at, to, way, allowed, grain, reach);
		if (!next) break;
		const step = vecDist(next, at);
		at = next;
		if (step <= 5 * grain) break;
	}
	return { point: at, slide: measuredAt ? { way, at: measuredAt } : null };
}

/**
 * The place the point meets the edge at, drawn in towards the pointer from behind the edge at the
 * pointer's foot on the edge's line, or, where the edge bends away from that line so much that this
 * brings it no nearer, at a foot half as far along, or a quarter; null when none brings it nearer.
 */
function drawnNearer(at: Vec, to: Vec, way: Vec, allowed: (p: Vec) => boolean, grain: number, reach: number): Vec | null {
	const along = dot(vecSub(to, at), way);
	const near = vecDist(at, to);
	for (let part = 1; part >= 1 / 8; part /= 2) {
		const foot = vecAdd(at, vecScale(way, along * part));
		if (vecDist(foot, at) <= grain) return null;
		const next = drawnIn(foot, to, allowed, grain, reach) ?? slidTo(at, foot, to, allowed, grain);
		if (next && vecDist(next, to) < near - grain / 10) return next;
	}
	return null;
}

/**
 * The edge's way at `at`, which lies on the edge, measured: the edge is met on two lines across
 * `way` (the way as far as it is known) a little either side of `at`, and the way runs between the
 * two places. Null when either line does not meet the edge near `at`.
 */
function measuredWay(at: Vec, way: Vec, allowed: (p: Vec) => boolean, grain: number, reach: number): Vec | null {
	// Across the way, from the side the point may be on to the side it may not.
	const across = { x: -way.y, y: way.x };
	const inward = allowed(vecAdd(at, vecScale(across, reach))) ? vecScale(across, -1) : across;
	const met: Vec[] = [];
	for (const side of [-1, 1]) {
		const base = vecAdd(at, vecScale(way, side * reach));
		const behind = vecSub(base, vecScale(inward, 1.5 * reach));
		const beyond = vecAdd(base, vecScale(inward, 1.5 * reach));
		if (!allowed(behind) || allowed(beyond)) return null;
		met.push(farthest(behind, beyond, allowed, grain));
	}
	const between = vecSub(met[1]!, met[0]!);
	const length = vecLength(between);
	if (!length) return null;
	const measured = vecScale(between, 1 / length);
	return dot(measured, way) < 0 ? vecScale(measured, -1) : measured;
}

/**
 * From behind the edge at `foot`, on the line from it to the pointer, towards the pointer as far as
 * the point may go; null when no place behind the edge on that line is allowed (a corner).
 */
function drawnIn(foot: Vec, to: Vec, allowed: (p: Vec) => boolean, grain: number, reach: number): Vec | null {
	const across = vecSub(to, foot);
	const depth = vecLength(across);
	if (depth <= grain) return null;
	const inward = vecScale(across, 1 / depth);
	for (let back = reach; back <= 8 * reach; back *= 2) {
		const behind = vecSub(foot, vecScale(inward, back));
		if (allowed(behind)) return farthest(behind, to, allowed, grain);
	}
	return null;
}

/** From `at` towards `foot` as far as the point may go, and from there towards the pointer; null when that gets it nowhere. */
function slidTo(at: Vec, foot: Vec, to: Vec, allowed: (p: Vec) => boolean, grain: number): Vec | null {
	const slid = farthest(at, foot, allowed, grain);
	if (vecDist(slid, at) <= grain) return null;
	return farthest(slid, to, allowed, grain);
}

/**
 * How far from `a` towards `b` the point may go: the place along the line nearest `b` found by
 * halving, from `a`, which it may be.
 */
function farthest(a: Vec, b: Vec, allowed: (p: Vec) => boolean, grain: number): Vec {
	const span = vecDist(a, b);
	if (span <= grain) return a;
	if (allowed(b)) return b;
	const steps = Math.min(LINE_STEPS, Math.max(1, Math.ceil(Math.log2(span / grain))));
	let lo = 0;
	let hi = 1;
	for (let i = 0; i < steps; i++) {
		const mid = (lo + hi) / 2;
		if (allowed(lerp(a, b, mid))) lo = mid;
		else hi = mid;
	}
	return lo === 0 ? a : lerp(a, b, lo);
}

/**
 * The edge's way at `at`, roughly, on the side nearer `to`: the direction, turned from the
 * pointer's as little as it must be, in which the point may move a step of `reach`. Null when the
 * point may not step back from the pointer either, or the edge faces the pointer square on (or
 * bends round it), so that the point cannot get nearer along it.
 */
function edgeWay(at: Vec, to: Vec, allowed: (p: Vec) => boolean, reach: number): Vec | null {
	const rest = vecSub(to, at);
	const length = vecLength(rest);
	if (!length) return null;
	const ahead = vecScale(rest, 1 / length);
	const step = (angle: number) => vecAdd(at, vecScale(turned(ahead, angle), reach));
	if (allowed(step(0))) return ahead;
	if (!allowed(step(Math.PI))) return null;
	let best: { angle: number; side: number } | null = null;
	for (const side of [1, -1]) {
		let lo = 0;
		let hi = Math.PI;
		for (let i = 0; i < ANGLE_STEPS; i++) {
			const mid = (lo + hi) / 2;
			if (allowed(step(side * mid))) hi = mid;
			else lo = mid;
		}
		if (!best || hi < best.angle) best = { angle: hi, side };
	}
	if (!best || best.angle >= Math.PI / 2) return null;
	return turned(ahead, best.side * best.angle);
}

function turned(v: Vec, angle: number): Vec {
	const c = Math.cos(angle);
	const s = Math.sin(angle);
	return { x: v.x * c - v.y * s, y: v.x * s + v.y * c };
}

function lerp(a: Vec, b: Vec, t: number): Vec {
	return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}
