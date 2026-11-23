import { describe, expect, it } from 'vitest';
import { bendShared, followArc, redrawShared, sharedCuts, sharedPieces, slideSwitch, slideToCorner, straightenShared, switchesOf } from './cutMoves';
import type { Edge, Point } from './geometry';

// A square ring cut by one shared cut from its top side to its bottom side: on
// each side A's outline gives way to B's at the cut, a switch at each end.
const outline = (from: Point, to: Point, family: 'A' | 'B'): Edge => ({ from, to, family, kind: 'outline' });
const edges: Edge[] = [
	outline([0, 0], [5, 0], 'A'), outline([5, 0], [10, 0], 'B'),
	outline([10, 0], [10, 10], 'B'),
	outline([10, 10], [5, 10], 'B'), outline([5, 10], [0, 10], 'A'),
	outline([0, 10], [0, 0], 'A'),
	{ from: [5, 0], to: [5, 10], family: 'AB', kind: 'shared' }
];
const at = (es: Edge[], family: string) => es.filter(e => e.family === family).reduce((s, e) => s + Math.hypot(e.to[0] - e.from[0], e.to[1] - e.from[1]), 0);

describe('moves of a construction\'s cuts', () => {
	it('finds the switches, where an outline of each paper meets a shared cut', () => {
		expect(switchesOf(edges).map(p => p.join(',')).sort()).toEqual(['5,0', '5,10']);
		expect(sharedPieces(edges)).toEqual([[[5, 0], [5, 10]]]);
	});

	it('slides a switch along its outline, the outline it passes changing paper', () => {
		const slid = slideSwitch(edges, [5, 0], 2)!;
		// Towards its A edge: two units of A outline become B, and the shared cut leaves from (3, 0).
		expect(at(slid, 'A')).toBeCloseTo(at(edges, 'A') - 2);
		expect(at(slid, 'B')).toBeCloseTo(at(edges, 'B') + 2);
		expect(switchesOf(slid).map(p => p.join(',')).sort()).toEqual(['3,0', '5,10']);
		// On past the ring's corner, where A's outline runs on alone: (0, 0) to (0, 1).
		expect(switchesOf(slideSwitch(edges, [5, 0], 6)!).map(p => p.join(',')).sort()).toEqual(['0,1', '5,10']);
		// Not past the other switch, nor off a point that is none.
		expect(slideSwitch(edges, [5, 0], 30)).toBeUndefined();
		expect(slideSwitch(edges, [0, 0], 1)).toBeUndefined();
	});

	it('bends a shared cut across its course at its middle, then moves the bend', () => {
		const bent = bendShared(edges, [5, 0], [5, 10], 1)!;
		expect(sharedPieces(bent).flat().map(p => p.join(','))).toContain('4,5');
		// The bend moved a unit to the left of the piece it starts (towards (5, 10)): two pieces still.
		const moved = bendShared(bent, [4, 5], [5, 10], 1)!, pieces = sharedPieces(moved);
		expect(pieces).toHaveLength(2);
		const bend = pieces.flat().find(p => p[1] > 0 && p[1] < 10)!;
		expect(Math.hypot(bend[0] - 4, bend[1] - 5)).toBeCloseTo(1);
		expect(bend[0]).toBeLessThan(4);
		expect(switchesOf(moved)).toHaveLength(2);
	});

	it('straightens a bend of a shared cut, and nothing else', () => {
		const bent = bendShared(edges, [5, 0], [5, 10], 1)!;
		expect(sharedPieces(straightenShared(bent, [4, 5])!)).toEqual([[[5, 0], [5, 10]]]);
		expect(straightenShared(edges, [5, 0])).toBeUndefined();
	});

	it('lays a shared piece between two points of a circle along the circle, the shorter way round', () => {
		// A chord of the circle about (50, 50) of radius 40, a quarter of it apart.
		const chord: Edge[] = [{ from: [90, 50], to: [50, 90], family: 'AB', kind: 'shared' }];
		const arc = followArc(chord, [90, 50], [50, 90], [50, 50], 40)!;
		expect(arc.length).toBeGreaterThan(10);
		expect(arc[0]!.from).toEqual([90, 50]);
		expect(arc.at(-1)!.to).toEqual([50, 90]);
		for (const e of arc) expect(Math.hypot(e.to[0] - 50, e.to[1] - 50)).toBeCloseTo(40, 9);
		expect(arc.every(e => e.family === 'AB' && e.to[0] >= 50 && e.to[1] >= 50)).toBe(true);
		// Not where an end is off the circle.
		expect(followArc(chord, [90, 50], [50, 90], [50, 50], 30)).toBeUndefined();
	});

	it('slides a switch to the next corner of a paper\'s outline, that paper\'s line then running on into the cut', () => {
		// Towards B along the top side: its corner at (10, 0). B's line, which came down the right side, along the
		// top and back into the cut, now turns into the cut at the corner; A cuts the whole top side.
		const { edges: slid, to } = slideToCorner(edges, [5, 0], 'B')!;
		expect(to).toEqual([10, 0]);
		expect(at(slid, 'A')).toBeCloseTo(at(edges, 'A') + 5);
		expect(at(slid, 'B')).toBeCloseTo(at(edges, 'B') - 5);
		expect(sharedPieces(slid)).toEqual([[[10, 0], [5, 10]]]);
		// Towards A: the corner at (0, 0). Not farther than its reach, nor from a point that is no switch.
		expect(slideToCorner(edges, [5, 0], 'A')!.to).toEqual([0, 0]);
		expect(slideToCorner(edges, [5, 0], 'A', 4)).toBeUndefined();
		expect(slideToCorner(edges, [0, 0], 'A')).toBeUndefined();
		// On a frame's own lines too (a board's circle and grid), and through vertices that are no corners.
		const frame = edges.map((e): Edge => e.family === 'AB' ? e : { ...e, kind: 'frame' });
		const split = [...frame.filter(e => !(e.from[0] === 5 && e.to[0] === 10 && e.from[1] === 0)), { from: [5, 0], to: [8, 0], family: 'B', kind: 'frame' }, { from: [8, 0], to: [10, 0], family: 'B', kind: 'frame' }] as Edge[];
		expect(slideToCorner(split, [5, 0], 'B')!.to).toEqual([10, 0]);
		// None where the outline meets another cut before a corner: a second cut leaving the top side at (8, 0).
		const met: Edge[] = [...edges.filter(e => !(e.family === 'B' && e.from[0] === 5 && e.from[1] === 0)),
			outline([5, 0], [8, 0], 'B'), outline([8, 0], [10, 0], 'B'), { from: [8, 0], to: [8, -3], family: 'AB', kind: 'shared' }];
		expect(slideToCorner(met, [5, 0], 'B')).toBeUndefined();
	});

	it('follows a shared cut through its bends, and draws it anew straight between two points', () => {
		const bent = bendShared(edges, [5, 0], [5, 10], 1)!, [cut] = sharedCuts(bent);
		expect(sharedCuts(bent)).toHaveLength(1);
		expect([cut[0], cut[cut.length - 1]].map(p => p.join(',')).sort()).toEqual(['5,0', '5,10']);
		expect(cut).toHaveLength(3);
		const straight = redrawShared(bent, cut, cut[0], cut[cut.length - 1])!;
		expect(sharedPieces(straight)).toHaveLength(1);
		expect(straight).toHaveLength(edges.length);
		expect(redrawShared(bent, cut, cut[0], cut[0])).toBeUndefined();
	});
});
