import { describe, it, expect } from 'vitest';
import type { Finger, Vec } from '$lib/types/heart';
import { getCenteredRectParams } from '$lib/utils/overlapRect';
import { SNAP_OPPOSITE_UNITS, findNearestOppositeAnchor, lobeAnchors, snapOppositeRadiusPx } from './snapOpposite';

// 3x3 heart: overlap square 225 px at (187.5, 187.5); one heart unit is 2.25 px.
const rect = getCenteredRectParams({ x: 3, y: 3 });
const radius = snapOppositeRadiusPx(rect);

function twoSegmentLeft(id: string, y: number, junction: Vec): Finger {
	const p0: Vec = { x: rect.right, y };
	const p3: Vec = { x: rect.left, y };
	return {
		id,
		lobe: 'left',
		segments: [
			{ p0, p1: { ...p0 }, p2: { ...junction }, p3: junction },
			{ p0: junction, p1: { ...junction }, p2: { ...p3 }, p3 }
		]
	};
}

function twoSegmentRight(id: string, x: number, junction: Vec): Finger {
	const p0: Vec = { x, y: rect.bottom };
	const p3: Vec = { x, y: rect.top };
	return {
		id,
		lobe: 'right',
		segments: [
			{ p0, p1: { ...p0 }, p2: { ...junction }, p3: junction },
			{ p0: junction, p1: { ...junction }, p2: { ...p3 }, p3 }
		]
	};
}

const leftJunction: Vec = { x: 300, y: 260 };
const rightJunction: Vec = { x: 305, y: 262 };
const fingers: Finger[] = [
	twoSegmentLeft('L-1', 262.5, leftJunction),
	twoSegmentRight('R-1', 262.5, rightJunction),
	twoSegmentRight('R-2', 337.5, { x: 337.5, y: 330 })
];

describe('snapOppositeRadiusPx', () => {
	it('is 12 heart units', () => {
		expect(SNAP_OPPOSITE_UNITS).toBe(12);
		expect(radius).toBeCloseTo(27, 6);
		expect(snapOppositeRadiusPx(getCenteredRectParams({ x: 8, y: 8 }))).toBeCloseTo(72, 6);
	});
});

describe('lobeAnchors', () => {
	it('lists every segment start and end point of one lobe', () => {
		const anchors = lobeAnchors(fingers, 'right');
		// Two right curves with two segments each: p0, junction, p3 for both.
		expect(anchors).toHaveLength(6);
		expect(anchors).toContainEqual({ x: 262.5, y: rect.bottom });
		expect(anchors).toContainEqual(rightJunction);
		expect(anchors).toContainEqual({ x: 262.5, y: rect.top });
		expect(anchors).not.toContainEqual(leftJunction);
	});
});

describe('findNearestOppositeAnchor', () => {
	it('returns the nearest anchor of the other lobe within the radius', () => {
		// 4 px from the right-lobe junction; the left-lobe junction is closer but in the same lobe.
		const pos: Vec = { x: 302, y: 261 };
		expect(findNearestOppositeAnchor(fingers, 'left', pos, radius)).toEqual(rightJunction);
	});

	it('ignores anchors of the dragged curve\'s own lobe', () => {
		const pos: Vec = { x: 300.5, y: 260.5 };
		const hit = findNearestOppositeAnchor(fingers, 'left', pos, radius);
		expect(hit).toEqual(rightJunction);
		expect(hit).not.toEqual(leftJunction);
		// From the right lobe's point of view the left junction is the target.
		expect(findNearestOppositeAnchor(fingers, 'right', pos, radius)).toEqual(leftJunction);
	});

	it('returns null when nothing is within the radius', () => {
		expect(findNearestOppositeAnchor(fingers, 'left', { x: 250, y: 300 }, radius)).toBeNull();
		expect(findNearestOppositeAnchor(fingers, 'left', { x: 302, y: 261 }, 1)).toBeNull();
		expect(findNearestOppositeAnchor([], 'left', { x: 302, y: 261 }, radius)).toBeNull();
	});

	it('snaps to curve end points on the edges too', () => {
		const pos: Vec = { x: 264, y: rect.bottom - 3 };
		expect(findNearestOppositeAnchor(fingers, 'left', pos, radius)).toEqual({ x: 262.5, y: rect.bottom });
	});

	it('returns a copy, not the finger\'s own point object', () => {
		const hit = findNearestOppositeAnchor(fingers, 'left', rightJunction, radius);
		expect(hit).toEqual(rightJunction);
		expect(hit).not.toBe(rightJunction);
	});
});
