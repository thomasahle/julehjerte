/** Matching cuts fan out from two checked tips. Three lanes distribute separate
 * components, with empty outer lanes travelling beside the central artwork. */
import {
	add, compile, contourChain, twoPortMotif, forest, uprightToSheet,
	ConstructionError, type Contour, type Ring, type Edge, type Point
} from './geometry';
import { gridClearance } from '$lib/geometry/clearance';
import { contactChains, type ContourChain } from './chainContacts';
import { clipContours, stitch } from './panels';

const contoursOf = (node: Contour): Ring[] => [node.ring, ...node.children.flatMap(contoursOf)];

/** Three separate counters across one silhouette naturally belong to the
 * three lanes. Detect their positions so editing need not exhaust one-lane
 * constructions first. This chooses a recipe; all output checks still apply. */
export function hasThreeCounterLanes(rings: Ring[]): boolean {
	const roots = forest(rings);
	if (roots.length !== 1 || roots[0].children.length !== 3 ||
		roots[0].children.some(child => child.children.length)) return false;
	const xs = roots[0].ring.map(p => p[0]), min = Math.min(...xs), max = Math.max(...xs),
		left = min + (max - min) / 4, right = max - (max - min) / 4;
	const holes = roots[0].children.map(child => {
		const xs = child.ring.map(p => p[0]);
		return [Math.min(...xs), Math.max(...xs)];
	}).sort((a, b) => a[0] - b[0]);
	return holes[0][1] < left && holes[1][0] > left && holes[1][1] < right && holes[2][0] > right;
}

/** The outer bands' distance from the paper's edges. */
export const CORNER_INSET = 6;
/** The space between the motif and the checked tips unless one is asked for:
 * the page's own default. */
export const CORNER_GAP = 3;
/** Checks narrower than this are not drawn: a motif too large for them keeps
 * less space around it. */
const NARROWEST_CHECK = 2.5;

/** Where the checked tips end around the motif on the paper (see
 * `generateCornerChecks`): each tip is a regular checkerboard of three lanes
 * from the outer band to within `gap` of the motif, as near as cutting allows
 * at 0. Lane c's corner is (s − d + c·d, s + d − c·d) at the top and
 * (e − f + c·f, e + f − c·f) at the bottom; beside the outer lanes, where
 * they pass the motif, it stays below and above their rows too. */
export function checkedTips(artwork: Ring[], gap = 0, inset = CORNER_INSET) {
	// Along the outline, not only at its corners: a flat trunk's bottom edge
	// can cross a check's corner between two of them.
	const points = artwork.flatMap(ring => ring.flatMap((p, k) => {
		const q = ring[(k + 1) % ring.length], steps = Math.max(1, Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]) / .5));
		return Array.from({ length: steps }, (_, i): Point => [p[0] + (q[0] - p[0]) * i / steps, p[1] + (q[1] - p[1]) * i / steps]);
	}));
	const clear = Math.max(gap, gridClearance(6));
	// Upright on the heart: across, and down (the paper's corners (0, 0) and
	// (100, 100) are its top and bottom).
	const across = ([x, y]: Point) => (x - y) * Math.SQRT1_2, down = ([x, y]: Point) => (x + y) * Math.SQRT1_2;
	const fits = (s: number, top: boolean) => {
		const d = (s - inset) / 3, side = Math.SQRT2 * d;
		return points.every(p => {
			const [x, y] = top ? p : [100 - p[0], 100 - p[1]];
			return [0, 1, 2].every(c => x >= s - d + c * d + clear || y >= s + d - c * d + clear) &&
				(Math.abs(across([x, y])) < side || down([x, y]) >= Math.SQRT2 * s + clear);
		});
	};
	const reach = (top: boolean) => {
		let [low, high] = [inset + 3 * NARROWEST_CHECK, 50];
		if (!fits(low, top)) return low;
		for (let k = 0; k < 40; k++) {
			const mid = (low + high) / 2;
			if (fits(mid, top)) low = mid;
			else high = mid;
		}
		return low;
	};
	// A hair inside the limit, so no check line runs through a vertex of the
	// motif whose sides follow the board (a tree's 45° slopes).
	const s = reach(true) - .1, e = 100 - reach(false) + .1;
	return { s, d: (s - inset) / 3, e, f: (100 - inset - e) / 3 };
}

const toSegment = (p: Point, a: Point, b: Point) => {
	const dx = b[0] - a[0], dy = b[1] - a[1], l = dx * dx + dy * dy;
	const t = l ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l)) : 0;
	return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
};
const crosses = (a: Point, b: Point, c: Point, d: Point) => {
	const side = (p: Point, q: Point, r: Point) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
	return side(a, b, c) * side(a, b, d) < 0 && side(c, d, a) * side(c, d, b) < 0;
};

/** A side lane's leg past the motif, bent out where it passes nearer than
 * `limit` to the points of other cuts (a large star's lower tips reach across
 * the leg from the side to the bottom tip): a corner `room` out from the
 * nearest, on the leg's side away from the middle, and again on each half
 * while either still passes near. The leg as it was where that leaves the
 * bands' border. */
function pastMotif(path: Point[], cuts: Point[], room: number, limit: number, safe: number): Point[] {
	let kept = true;
	const bend = (a: Point, b: Point, depth: number): Point[] => {
		let d = Infinity, m = a;
		for (const p of cuts) {
			const e = toSegment(p, a, b);
			if (e < d) [d, m] = [e, p];
		}
		if (d >= limit) return [a, b];
		const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
		let n: Point = [(a[1] - b[1]) / length, (b[0] - a[0]) / length];
		if (n[0] * (50 - m[0]) + n[1] * (50 - m[1]) > 0) n = [-n[0], -n[1]];
		const v: Point = [m[0] + n[0] * room, m[1] + n[1] * room];
		if (depth === 6 || v.some(c => c < safe || c > 100 - safe)) {
			kept = false;
			return [a, b];
		}
		return [...bend(a, v, depth + 1), ...bend(v, b, depth + 1).slice(1)];
	};
	const out = [path[0]];
	for (let i = 1; i < path.length; i++) out.push(...bend(path[i - 1], path[i], 0).slice(1));
	return kept ? out : path;
}

export function generateCornerChecks(rings: Ring[], size = 70, scale = .7,
	routing: 'chain' | 'practical' | 'separated' = 'chain', fitBorder = false, bentSpokes = false,
	contacts?: { tilt: number; invert: boolean }, laneSplit?: number, gap = 0, bendLegs = false) {
	const points = rings.flat();
	if (!points.length) throw new ConstructionError('empty', 'No contour');
	const artwork = rings.map(r => r.map(([x, y]) => uprightToSheet([x * size * scale, y * size * scale])));
	const half = Math.max(...points.map(p => Math.abs(p[0]))) * size * scale + 4;
	const top = Math.min(...points.map(p => p[1])) * size * scale - 3;
	const bottom = Math.max(...points.map(p => p[1])) * size * scale + 3;
	const margin = gridClearance(6);
	const space = Math.min(...artwork.flat().flatMap(([x, y]) => [x, y, 100 - x, 100 - y]));
	const inset = fitBorder ? Math.min(CORNER_INSET, space / 2) : CORNER_INSET;
	const { s, d, e, f } = checkedTips(artwork, gap, inset);
	// The rows where the tips end, upright: the outer lanes pass the motif there.
	const rowTop = (2 * s - 100) * Math.SQRT1_2, rowBottom = (2 * e - 100) * Math.SQRT1_2;
	if (inset < margin) throw new ConstructionError('clearance', 'No room for the outer strips');
	const safe = inset + margin * 1.25;
	let borderAdjusted = fitBorder && inset < 6 - 1e-6;
	const borderPoint = (point: Point): Point => {
		if (!fitBorder) return point;
		const clamped: Point = [
			Math.max(safe, Math.min(100 - safe, point[0])),
			Math.max(safe, Math.min(100 - safe, point[1]))
		];
		if (clamped.some((value, axis) => Math.abs(value - point[axis]) > 1e-6)) borderAdjusted = true;
		return clamped;
	};
	let edges: Edge[] = [];
	// The side lanes' legs, to bend past the motif once every cut is in.
	const legs: { at: number; count: number; path: Point[] }[] = [];
	const leg = (path: Point[]) => {
		const at = edges.length;
		add(edges, path, 'AB', 'shared');
		legs.push({ at, count: edges.length - at, path });
	};
	const chains: ContourChain[] = [];
	const lanes = Array.from({ length: 3 }, () => [] as ReturnType<typeof forest>);
	const separate = routing === 'separated';
	let changed = false;
	const dividers: number[] = [];
	if (laneSplit !== undefined) {
		const minX = Math.min(...points.map(p => p[0])), maxX = Math.max(...points.map(p => p[0]));
		dividers.push(minX + (maxX - minX) * laneSplit, maxX - (maxX - minX) * laneSplit);
	}
	if (dividers.length) {
		// A connected silhouette can use all three lanes too. Keep each
		// clipped counter, then cancel the artificial seams after routing.
		for (let col = 0; col < 3; col++) {
			let part = rings;
			if (col) part = clipContours(part, dividers[col - 1], false);
			if (col < 2) part = clipContours(part, dividers[col], true);
			lanes[col].push(...forest(part.map(r => r.map(([x, y]) =>
				uprightToSheet([x * size * scale, y * size * scale])))));
		}
		changed = true;
	} else for (const node of forest(artwork)) {
		const xs = node.ring.map(p => (p[0] - p[1]) * Math.SQRT1_2);
		const center = (Math.min(...xs) + Math.max(...xs)) / 2;
		const laneAt = (threshold: number) => center < -half * threshold ? 0 : center > half * threshold ? 2 : 1;
		const lane = laneAt(separate ? .2 : .45);
		if (lane !== laneAt(.45)) changed = true;
		lanes[lane].push(node);
	}
	for (let col = 0; col < 3; col++) {
		// Space around the motif moves both checked tips toward their corners.
		const start: Point = [s - d + col * d, s + d - col * d], end: Point = [e - f + col * f, e + f - col * f];
		add(edges, [[start[0], 0], start], 'A', 'frame');
		add(edges, [[0, start[1]], start], 'B', 'frame');
		const route = (entry: Point, exit: Point) => {
			if (contacts) chains.push({ nodes: lanes[col], start: entry, end: exit });
			else if (routing === 'chain') contourChain(edges, lanes[col], Math.PI / 4, entry, exit, 'B');
			else if (lanes[col].length) {
				// Each lane keeps one open path in each sheet. Counters and sharp
				// shoulders can use the same coincident bridges as repeated letters.
				// Three lanes plus two outer cuts give a six-strip grid.
				twoPortMotif(edges, lanes[col].flatMap(contoursOf), [entry, exit], margin, {
					compound: true, balanced: true, bentSpokes
				});
			} else add(edges, [entry, exit], 'AB', 'shared');
		};
		if (col === 1) route(start, end);
		else {
			const x = col === 0 ? -half : half;
			const ys = separate ? lanes[col].flatMap(node => node.ring).map(p => (p[0] + p[1] - 100) * Math.SQRT1_2) : [];
			// The allowed sheet rectangle is a diamond in upright coordinates.
			// Keep the side bypass inside it when a large motif approaches a band.
			const lower = fitBorder ? (safe - 50) * Math.SQRT2 + Math.abs(x) : -Infinity,
				upper = fitBorder ? (50 - safe) * Math.SQRT2 - Math.abs(x) : Infinity;
			// Beside the motif the lane runs below the row its tip ends on, or
			// level with it where that row is nearer the motif.
			const above = Math.max(top, rowTop), below = Math.min(bottom, rowBottom);
			const low = Math.max(lower, ys.length ? Math.min(...ys) - 3 : above),
				high = Math.min(upper, ys.length ? Math.max(...ys) + 3 : below);
			if (Math.abs(low - Math.max(lower, above)) > 1e-6 || Math.abs(high - Math.min(upper, below)) > 1e-6) changed = true;
			const entry = uprightToSheet([x, low]), exit = uprightToSheet([x, high]);
			// Approach a separate island near its own height, then continue
			// outside the whole motif. A long diagonal from a steam curl to the
			// bottom corner would otherwise cut through the coffee cup below it.
			leg([start, borderPoint(uprightToSheet([x, above])), entry]);
			route(entry, exit);
			leg([exit, borderPoint(uprightToSheet([x, below])), end]);
		}
		add(edges, [end, [end[0], 100]], 'A', 'frame');
		add(edges, [end, [100, end[1]]], 'B', 'frame');
	}
	if (contacts) edges.push(...contactChains(chains, Math.PI / 4 + contacts.tilt, margin, contacts.invert));
	for (const t of [inset, 100 - inset]) {
		add(edges, [[t, 0], [t, 100]], 'A', 'frame');
		add(edges, [[0, t], [100, t]], 'B', 'frame');
	}
	// A leg nearer another cut than cutting allows (the motif's, not those
	// it joins at its ends) bends out past it, at the space asked for, where
	// that crosses no other cut.
	const touches = (e: Edge, p: Point) => [e.from, e.to].some(q => Math.hypot(q[0] - p[0], q[1] - p[1]) < 1e-6);
	let bentLegs = false;
	if (bendLegs) for (const { at, count, path } of legs.reverse()) {
		const others = edges.filter((_, i) => i < at || i >= at + count);
		const points = others.filter(e => !touches(e, path[0]) && !touches(e, path.at(-1)!)).flatMap(({ from: p, to: q }) => {
			const steps = Math.max(1, Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]) / .5));
			return Array.from({ length: steps + 1 }, (_, i): Point => [p[0] + (q[0] - p[0]) * i / steps, p[1] + (q[1] - p[1]) * i / steps]);
		});
		const bent = pastMotif(path, points, Math.max(gap, 1.5 * margin), margin, safe);
		if (bent === path) continue;
		if (bent.some((p, i) => i && others.some(e => crosses(bent[i - 1], p, e.from, e.to)))) continue;
		const replaced: Edge[] = [];
		add(replaced, bent, 'AB', 'shared');
		edges.splice(at, count, ...replaced);
		bentLegs = true;
	}
	if (dividers.length) edges = stitch(edges, dividers.map(x => x * size * scale));
	// Exclude only the two checked corners and the narrow outer bands from the
	// solid-field check. No decorative colours may appear elsewhere in the field.
	const near = s + d, far = e - f;
	const domain: Ring = [[near, inset], [100 - inset, inset], [100 - inset, far], [far, far], [far, 100 - inset], [inset, 100 - inset], [inset, near], [near, near]];
	return { edges, geometry: compile(edges), artwork, domain: [domain, ...artwork], separated: changed, borderAdjusted, bentLegs };
}
