import { describe, expect, it } from 'vitest';
import type { BezierSegment, Finger, Vec } from '$lib/types/heart';
import { getCenteredRectParams } from '$lib/utils/overlapRect';
import { restripped } from './strips';

const line = (a: Vec, b: Vec): BezierSegment => ({ p0: a, p1: a, p2: b, p3: b });
const at = (s: BezierSegment, t: number): Vec => {
	const u = 1 - t;
	return {
		x: u * u * u * s.p0.x + 3 * u * u * t * s.p1.x + 3 * u * t * t * s.p2.x + t * t * t * s.p3.x,
		y: u * u * u * s.p0.y + 3 * u * u * t * s.p1.y + 3 * u * t * t * s.p2.y + t * t * t * s.p3.y
	};
};

/** A heart of n × n strips on its square, each half's inner cuts drawn by `inner(k, y or x)`, the edges straight. */
function heart(n: number, inner: (lobe: 'left' | 'right', k: number, square: ReturnType<typeof getCenteredRectParams>) => BezierSegment[]): Finger[] {
	const sq = getCenteredRectParams({ x: n, y: n });
	const out: Finger[] = [];
	for (let k = 0; k <= n; k++) {
		const y = sq.top + (k / n) * sq.height;
		const x = sq.left + (k / n) * sq.width;
		const edge = k === 0 || k === n;
		out.push({ id: `L-${k}`, lobe: 'left', segments: edge ? [line({ x: sq.right, y }, { x: sq.left, y })] : inner('left', k, sq) });
		out.push({ id: `R-${k}`, lobe: 'right', segments: edge ? [line({ x, y: sq.bottom }, { x, y: sq.top })] : inner('right', k, sq) });
	}
	return out;
}

const plain = (lobe: 'left' | 'right', k: number, sq: ReturnType<typeof getCenteredRectParams>, n: number) => {
	const y = sq.top + (k / n) * sq.height;
	const x = sq.left + (k / n) * sq.width;
	return lobe === 'left' ? [line({ x: sq.right, y }, { x: sq.left, y })] : [line({ x, y: sq.bottom }, { x, y: sq.top })];
};

const byId = (fingers: Finger[]) => new Map(fingers.map((f) => [f.id, f]));
const close = (p: Vec, q: Vec, tol = 1e-6) => Math.abs(p.x - q.x) < tol && Math.abs(p.y - q.y) < tol;

describe('the Normal tab’s sizes', () => {
	it('keep the cuts of a half that has the strips already, moved onto the new square', () => {
		const three = heart(3, (lobe, k, sq) => {
			const p = plain(lobe, k, sq, 3)[0]!;
			// a bent cut, so the move shows
			return [{ ...p, p1: { x: p.p1.x - 20, y: p.p1.y + 9 } }];
		});
		const from = getCenteredRectParams({ x: 3, y: 3 });
		const same = restripped(three, from, from, 3);
		expect(JSON.stringify(same)).toBe(JSON.stringify([...three.filter((f) => f.lobe === 'left'), ...three.filter((f) => f.lobe === 'right')]));
	});

	it('draw a plain heart plain at any size: its cuts straight and evenly spread over the bigger square', () => {
		const three = heart(3, (lobe, k, sq) => plain(lobe, k, sq, 3));
		const to = getCenteredRectParams({ x: 5, y: 5 });
		const five = byId(restripped(three, getCenteredRectParams({ x: 3, y: 3 }), to, 5));
		for (let k = 0; k <= 5; k++) {
			const want = plain('left', k, to, 5)[0]!;
			const got = five.get(`L-${k}`)!.segments;
			expect(close(got[0]!.p0, want.p0) && close(got.at(-1)!.p3, want.p3), `L-${k}`).toBe(true);
			for (const t of [0.25, 0.5, 0.75]) expect(at(got[0]!, t).y).toBeCloseTo(want.p0.y, 6);
		}
		expect(five.size).toBe(12);
	});

	it('draw a cut between two old ones as much like each as it lies near it, node for node though they have different nodes', () => {
		// 2 × 2 strips: the one inner cut of each half is a wave, of three pieces on the left, one bent piece on the right
		const two = heart(2, (lobe, k, sq) => {
			const [p] = plain(lobe, k, sq, 2);
			const a = p!.p0;
			const b = p!.p3;
			const mid = (t: number, off: number): Vec => (lobe === 'left' ? { x: a.x + (b.x - a.x) * t, y: a.y + off } : { x: a.x + off, y: a.y + (b.y - a.y) * t });
			return lobe === 'left' ? [line(a, mid(1 / 3, 12)), line(mid(1 / 3, 12), mid(2 / 3, -12)), line(mid(2 / 3, -12), b)] : [{ p0: a, p1: mid(0.33, 30), p2: mid(0.66, -30), p3: b }];
		});
		const square = getCenteredRectParams({ x: 2, y: 2 });
		const four = byId(restripped(two, square, square, 4));
		// L-1 lies halfway between the top edge and the wave: the wave at half its height, its three pieces kept
		const half = four.get('L-1')!.segments;
		const wave = byId(two).get('L-1')!.segments;
		const edgeY = byId(two).get('L-0')!.segments[0]!.p0.y;
		expect(half).toHaveLength(3);
		half.forEach((seg, k) => {
			expect(seg.p3.x).toBeCloseTo(wave[k]!.p3.x, 6);
			expect(seg.p3.y).toBeCloseTo((wave[k]!.p3.y + edgeY) / 2, 6);
		});
		// L-2 is the wave itself, and the right half's R-2 its bent cut
		expect(JSON.stringify(four.get('L-2')!.segments)).toBe(JSON.stringify(wave));
		expect(four.get('R-2')!.segments).toHaveLength(1);
		// the halves of a cut stay joined
		for (const f of four.values()) f.segments.forEach((s, k) => k && expect(close(s.p0, f.segments[k - 1]!.p3)).toBe(true));
	});
});
