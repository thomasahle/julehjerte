import { describe, expect, it } from 'vitest';
import { bendShared, sharedPieces, slideSwitch, straightenShared, switchesOf } from './cutMoves';
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
});
