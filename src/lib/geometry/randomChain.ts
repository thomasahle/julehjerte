/**
 * A random chain of cubic pieces, for Tegn's random buttons ($lib/editor/randomHeart and
 * $lib/pattern/randomTile): a curve from one point to another, as freely drawn as the editor lets a
 * visitor draw one, but going forward from start to end, so it does not loop back on itself.
 */
import type { BezierSegment, Vec } from '$lib/types/heart';

type Rng = () => number;

const V = (x: number, y: number): Vec => ({ x, y });
const between = (rng: Rng, lo: number, hi: number) => lo + rng() * (hi - lo);

/**
 * `pieces` cubics from `from` to `to` (x along the chain, increasing; y across it): the inner nodes
 * anywhere between, up to `reach` across; each node smooth (one way through it) or, two times in five, a
 * corner; each handle pointing forward, within 75° of the chain's way, 15–60 % of its piece long.
 * `endAngle` fixes the way the chain arrives (0: level), else that is random too.
 */
export function randomChain(from: Vec, to: Vec, pieces: number, reach: number, rng: Rng, endAngle?: number): BezierSegment[] {
	const xs = Array.from({ length: pieces - 1 }, () => between(rng, from.x, to.x)).sort((a, b) => a - b);
	const nodes = [from, ...xs.map((x) => V(x, between(rng, -reach, reach))), to];
	const angle = () => between(rng, -1.3, 1.3);
	const ways = nodes.map((_, i) => {
		const into = i === nodes.length - 1 && endAngle !== undefined ? endAngle : angle();
		return { into, out: rng() < 0.6 ? into : angle() };
	});
	const chain: BezierSegment[] = [];
	for (let i = 0; i < pieces; i++) {
		const a = nodes[i]!;
		const b = nodes[i + 1]!;
		const span = Math.max(b.x - a.x, 0.02);
		const lo = span * between(rng, 0.15, 0.6);
		const li = span * between(rng, 0.15, 0.6);
		const out = ways[i]!.out;
		const into = ways[i + 1]!.into;
		chain.push({
			p0: a,
			p1: V(a.x + lo * Math.cos(out), a.y + lo * Math.sin(out)),
			p2: V(b.x - li * Math.cos(into), b.y - li * Math.sin(into)),
			p3: b
		});
	}
	return chain;
}
