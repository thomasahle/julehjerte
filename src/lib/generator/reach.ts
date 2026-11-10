/** The ways a motif's hidden cuts take round what is in their way: a search
 * for the shortest over a set of points to pass, kept for the next that asks
 * the same. Nothing here knows of hearts: what may be stepped between is the
 * caller's `open`. */
import { closestPort, distance, type Point, type Port, type Ring } from './geometry';

/** The shortest way from a point to a ring, each step a shared cut `open`
 * lets through, past `passes`: the way and the point of the ring it ends at;
 * none where there is none. */
export const reachVia = (passes: Point[], open: (a: Point, b: Point) => boolean) => {
	const among = pairwise(passes, open), n = passes.length;
	// About how many bytes it holds (see `sharedReach`).
	let bytes = n * n;
	// The point of a ring each pass sees, worked out once a ring: sixteen
	// dashes round a speech bubble spent an hour asking `open` of every side
	// of a dash a pass saw none of, way in after way in.
	const sights = new WeakMap<Ring, (Port | null)[]>();
	// The other passes by their distance from a pass, nearest first, worked
	// out once it is first settled: a step goes no further than the way
	// already found to the ring (a thousand passes measured each step of
	// every way in).
	const rows: { order: Int32Array; apart: Float64Array }[] = [];
	const row = (i: number) => {
		if (rows[i]) return rows[i];
		const all = Float64Array.from(passes, p => distance(passes[i], p)), order = Int32Array.from(passes, (_, k) => k).sort((a, b) => all[a] - all[b] || a - b);
		bytes += 12 * n;
		return rows[i] = { order, apart: Float64Array.from(order, k => all[k]) };
	};
	// How far each pass is from a point ways begin at, nearest first, and
	// whether it sees it (1, 2 where not), worked out once a point: a gate's
	// or an island's ways to sixteen dashes each asked `open` of every pass,
	// a string key each.
	const starts = new Map<string, { order: Int32Array; apart: Float64Array; sees: Uint8Array }>();
	const search = (from: Point, ring: Ring, key: string): { path: Ring; port: Port; length: number } | undefined => {
		let start = starts.get(key);
		if (!start) {
			const all = Float64Array.from(passes, p => distance(from, p)), order = Int32Array.from(passes, (_, k) => k).sort((a, b) => all[a] - all[b] || a - b);
			starts.set(key, start = { order, apart: Float64Array.from(order, k => all[k]), sees: new Uint8Array(n) });
			bytes += 13 * n;
		}
		const sees = (k: number) => {
			if (!start.sees[k]) start.sees[k] = open(from, passes[k]) ? 1 : 2;
			return start.sees[k] === 1;
		};
		let sight = sights.get(ring);
		if (!sight) sights.set(ring, sight = []);
		const point = (i: number) => i ? passes[i - 1] : from;
		const seen = (i: number) => {
			const known = i ? sight[i - 1] : undefined;
			if (known !== undefined) return known ?? undefined;
			const port = closestPort(ring, point(i), open), found = open(point(i), port.point) ? port : null;
			if (i) sight[i - 1] = found;
			return found ?? undefined;
		};
		// Each pass settled offers its steps on one length at a time, nearest
		// first (all those as long together), the next once those are taken:
		// one step past the way found is as far as any goes. Offering them all
		// at once, each pass settled before a way was found stepped to all
		// thousand others. They are taken by length, then pass, then how soon
		// the pass they are from was settled: the passes are settled, and
		// reached from, as when every step was offered at once.
		const cost = new Float64Array(n + 1), back = new Int32Array(n + 1).fill(-1), done = new Uint8Array(n + 1),
			rank = new Int32Array(n + 1), next = new Int32Array(n + 1), offered = new Int32Array(n + 1);
		const lengths: number[] = [], tos: number[] = [], froms: number[] = [];
		const first = (a: number, k: number, i: number, b: number, l: number, h: number) => a < b || a === b && (k < l || k === l && rank[i] < rank[h]);
		const push = (length: number, k: number, i: number) => {
			let j = lengths.length;
			for (; j && !first(lengths[(j - 1) >> 1], tos[(j - 1) >> 1], froms[(j - 1) >> 1], length, k, i); j = (j - 1) >> 1) {
				lengths[j] = lengths[(j - 1) >> 1];
				tos[j] = tos[(j - 1) >> 1];
				froms[j] = froms[(j - 1) >> 1];
			}
			lengths[j] = length;
			tos[j] = k;
			froms[j] = i;
		};
		const pop = () => {
			const length = lengths.pop()!, k = tos.pop()!, i = froms.pop()!;
			if (!lengths.length) return;
			let j = 0;
			for (let c = 1; c < lengths.length; j = c, c = 2 * c + 1) {
				if (c + 1 < lengths.length && first(lengths[c + 1], tos[c + 1], froms[c + 1], lengths[c], tos[c], froms[c])) c++;
				if (first(length, k, i, lengths[c], tos[c], froms[c])) break;
				lengths[j] = lengths[c];
				tos[j] = tos[c];
				froms[j] = froms[c];
			}
			lengths[j] = length;
			tos[j] = k;
			froms[j] = i;
		};
		let best: { at: number; port: Port; length: number } | undefined, settled = 0;
		const offer = (i: number) => {
			const { order, apart } = i ? row(i - 1) : start;
			let j = next[i];
			while (j < n && done[order[j] + 1]) j++;
			// A pass no nearer than the way found is never settled.
			const step = cost[i] + apart[j];
			if (j < n && (!best || step < best.length))
				for (; j < n && cost[i] + apart[j] === step; j++)
					if (!done[order[j] + 1]) {
						push(step, order[j] + 1, i);
						offered[i]++;
					}
			next[i] = j;
		};
		const settle = (i: number, length: number, from: number) => {
			done[i] = 1;
			cost[i] = length;
			back[i] = from;
			rank[i] = settled++;
			const port = seen(i);
			if (port && (!best || cost[i] + distance(point(i), port.point) < best.length))
				best = { at: i, port, length: cost[i] + distance(point(i), port.point) };
			offer(i);
		};
		settle(0, 0, -1);
		while (lengths.length && !(best && lengths[0] >= best.length)) {
			const step = lengths[0], k = tos[0], i = froms[0];
			pop();
			offered[i]--;
			if (!done[k] && (i ? among(i - 1, k - 1) : sees(k - 1))) settle(k, step, i);
			if (!offered[i]) offer(i);
		}
		if (!best) return;
		const path: Ring = [best.port.point];
		for (let k = best.at; k >= 0; k = back[k]) path.unshift(point(k));
		return { path, port: best.port, length: best.length };
	};
	// A way asked again, from the same point to the same ring, is the same
	// way, begun at the point asked from: four in five of the dashes' were.
	const ways = new WeakMap<Ring, Map<string, { path: Ring; port: Port; length: number } | null>>();
	// A point asked for as a ring of its own (a chain's end, see
	// `contourChain`), a new one each time, is one ring for every time.
	const points = new Map<string, Ring>();
	return Object.assign((from: Point, ring: Ring): { path: Ring; port: Port; length: number } | undefined => {
		if (ring.length === 1) {
			const at = `${ring[0]}`, same = points.get(at);
			if (same) ring = same;
			else points.set(at, ring);
		}
		let known = ways.get(ring);
		if (!known) ways.set(ring, known = new Map());
		const key = `${from}`, way = known.get(key);
		if (way !== undefined) return way ? { ...way, path: [from, ...way.path.slice(1)] } : undefined;
		const found = search(from, ring, key);
		known.set(key, found ?? null);
		return found;
	}, { bytes: () => bytes });
};
/** The ways over `passes` past `contours` and `obstacles` (see `reachVia`),
 * one for every call with the same: what it has worked out, which passes see
 * one another, each pass's sight of a ring, the ways found, holds for each,
 * `open` asking the same of the same outlines. A motif's cells and tiers ask
 * again and again with the same gates. The sixteen asked last are kept, or
 * as many as hold a quarter of a gigabyte between them, and the one asked:
 * with thousands of passes, up the channels between a motif's pieces, one
 * holds tens of megabytes. */
const reaches = new Map<string, ReturnType<typeof reachVia>>(), ids = new WeakMap<object, number>();
let lastId = 0;
export function sharedReach(contours: Ring[], obstacles: Ring[] | undefined, passes: Point[], open: (a: Point, b: Point) => boolean) {
	const id = (o: object) => {
		let i = ids.get(o);
		if (i === undefined) ids.set(o, i = ++lastId);
		return i;
	};
	const key = `${id(contours)} ${obstacles ? id(obstacles) : 0} ${passes.join(';')}`;
	let reach = reaches.get(key);
	if (reach) reaches.delete(key);
	else reach = reachVia(passes, open);
	let bytes = reach.bytes();
	for (const other of reaches.values()) bytes += other.bytes();
	for (const [old, other] of reaches) {
		if (bytes <= 2 ** 28 && reaches.size < 16) break;
		bytes -= other.bytes();
		reaches.delete(old);
	}
	reaches.set(key, reach);
	return reach;
}
/** `open` between two of `points`, by their indices, each pair worked out
 * once: the searches over them asked it millions of times, a string key
 * each (ten dots round a rectangle spent ten minutes making the keys). */
export function pairwise(points: Point[], open: (a: Point, b: Point) => boolean) {
	const n = points.length, known = new Uint8Array(n * n);
	return (i: number, k: number) => {
		const at = i * n + k;
		if (!known[at]) known[at] = open(points[i], points[k]) ? 1 : 2;
		return known[at] === 1;
	};
}
