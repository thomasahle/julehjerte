import { describe, it, expect } from 'vitest';
import type { Finger, LobeId, Vec } from '$lib/types/heart';
import { vecLerp } from '$lib/geometry/vec';
import { getCenteredRectParams } from '$lib/utils/overlapRect';
import {
	INTERSECTION_MARGIN_UNITS,
	fingerHasIntersectionIssues,
	findFingersWithIssues,
	intersectionMarginPx,
	segmentsIntersect
} from './curveIssues';

// A 3x3 heart: the overlap square is 225 px, so one heart unit is 2.25 px and the
// margin is 3.375 px.
const rect = getCenteredRectParams({ x: 3, y: 3 });
const margin = intersectionMarginPx(rect);

function straightLeft(id: string, y: number, yEnd = y): Finger {
	const p0: Vec = { x: rect.right, y };
	const p3: Vec = { x: rect.left, y: yEnd };
	return {
		id,
		lobe: 'left',
		segments: [{ p0, p1: { x: p0.x - rect.width / 3, y }, p2: { x: p3.x + rect.width / 3, y: yEnd }, p3 }]
	};
}

function straightRight(id: string, x: number): Finger {
	const p0: Vec = { x, y: rect.bottom };
	const p3: Vec = { x, y: rect.top };
	return {
		id,
		lobe: 'right',
		segments: [{ p0, p1: { x, y: p0.y - rect.height / 3 }, p2: { x, y: p3.y + rect.height / 3 }, p3 }]
	};
}

// A left-lobe curve at `y` whose middle bows by `bow` px (positive = downwards).
function bowedLeft(id: string, y: number, bow: number, lobe: LobeId = 'left'): Finger {
	const p0: Vec = { x: rect.right, y };
	const p3: Vec = { x: rect.left, y };
	const cy = y + bow * (4 / 3);
	return { id, lobe, segments: [{ p0, p1: { x: p0.x - rect.width / 3, y: cy }, p2: { x: p3.x + rect.width / 3, y: cy }, p3 }] };
}

describe('intersectionMarginPx', () => {
	it('is 1.5 heart units for any grid', () => {
		expect(INTERSECTION_MARGIN_UNITS).toBe(1.5);
		expect(margin).toBeCloseTo(3.375, 6);
		expect(intersectionMarginPx(getCenteredRectParams({ x: 8, y: 8 }))).toBeCloseTo(9, 6);
		// Non-square grids use the mean of the two axes.
		expect(intersectionMarginPx({ width: 225, height: 375 })).toBeCloseTo(4.5, 6);
	});
});

describe('fingerHasIntersectionIssues', () => {
	const mid = rect.top + rect.height / 2;

	it('accepts well separated parallel curves', () => {
		const fingers = [straightLeft('L-1', mid - 37.5), straightLeft('L-2', mid + 37.5)];
		expect(findFingersWithIssues(fingers, margin).size).toBe(0);
	});

	it('flags curves closer than the margin but not curves a few units apart', () => {
		const near = [straightLeft('L-1', mid), straightLeft('L-2', mid + 2)];
		expect(findFingersWithIssues(near, margin)).toEqual(new Set(['L-1', 'L-2']));

		// 5 px = 2.2 heart units: allowed now, but the old fixed 6 px threshold flagged it.
		const apart = [straightLeft('L-1', mid), straightLeft('L-2', mid + 5)];
		expect(findFingersWithIssues(apart, margin).size).toBe(0);
		expect(findFingersWithIssues(apart, 6).size).toBe(2);
	});

	it('flags curves that cross', () => {
		const fingers = [straightLeft('L-1', mid), bowedLeft('L-2', mid - 30, 60)];
		expect(fingerHasIntersectionIssues(fingers[0]!, fingers, margin)).toBe(true);
		expect(fingerHasIntersectionIssues(fingers[1]!, fingers, margin)).toBe(true);
		expect(segmentsIntersect(fingers[0]!.segments, fingers[1]!.segments)).toBe(true);
	});

	it('flags curves that share or nearly share a start point on the fold line', () => {
		// Same start on the right edge, diverging towards the left edge.
		const shared = [straightLeft('L-1', mid, mid - 40), straightLeft('L-2', mid, mid + 40)];
		expect(findFingersWithIssues(shared, margin)).toEqual(new Set(['L-1', 'L-2']));

		// Starts 2 px apart on the edge, diverging: the strip between them has no paper at the fold.
		const nearlyShared = [straightLeft('L-1', mid - 1, mid - 40), straightLeft('L-2', mid + 1, mid + 40)];
		expect(findFingersWithIssues(nearlyShared, margin)).toEqual(new Set(['L-1', 'L-2']));

		// Starts 10 px apart and diverging is fine.
		const separate = [straightLeft('L-1', mid - 5, mid - 40), straightLeft('L-2', mid + 5, mid + 40)];
		expect(findFingersWithIssues(separate, margin).size).toBe(0);
	});

	it('ignores curves in the other lobe (they are meant to weave through each other)', () => {
		const fingers = [straightLeft('L-1', mid), straightRight('R-1', rect.left + rect.width / 2)];
		expect(findFingersWithIssues(fingers, margin).size).toBe(0);
	});

	it('ignores two parts of one curve that a short segment holds apart', () => {
		// What a converted engine cut looks like at a corner: two long segments with
		// a two-pixel one between them. The ends either side of the runt are closer
		// than the margin, and nothing has doubled back — the paper there is one
		// piece, not a sliver. Skipping only the neighbouring segment misses this.
		const y = mid;
		const b: Vec = { x: rect.left + rect.width / 2 + 1, y };
		const c: Vec = { x: rect.left + rect.width / 2 - 1, y };
		const straightish = (p0: Vec, p3: Vec) => ({
			p0,
			p1: vecLerp(p0, p3, 1 / 3),
			p2: vecLerp(p0, p3, 2 / 3),
			p3
		});
		const runt: Finger = {
			id: 'L-1',
			lobe: 'left',
			segments: [
				straightish({ x: rect.right, y }, b),
				straightish(b, c),
				straightish(c, { x: rect.left, y })
			]
		};
		expect(fingerHasIntersectionIssues(runt, [runt], margin)).toBe(false);
	});

	it('still flags a curve that comes back on itself after a longer detour', () => {
		// The same closeness, reached the other way: the cut swings out and returns
		// two pixels from where it left, which leaves a neck of paper that tears.
		const out: Vec = { x: rect.left + 40, y: mid };
		const back: Vec = { x: rect.left + 40, y: mid + 2 };
		const hairpin: Finger = {
			id: 'L-1',
			lobe: 'left',
			segments: [
				{ p0: { x: rect.right, y: mid - 30 }, p1: { x: rect.right - 30, y: mid - 20 }, p2: { x: out.x + 30, y: mid }, p3: out },
				{ p0: out, p1: { x: rect.left + 5, y: mid - 2 }, p2: { x: rect.left + 5, y: mid + 4 }, p3: back },
				{ p0: back, p1: { x: out.x + 30, y: mid + 2 }, p2: { x: rect.right - 30, y: mid + 22 }, p3: { x: rect.right, y: mid + 32 } }
			]
		};
		expect(fingerHasIntersectionIssues(hairpin, [hairpin], margin)).toBe(true);
	});

	it('does not turn a right angle into a conflict when its legs are subdivided', () => {
		const corner = { x: rect.left + 50, y: mid };
		const from = { x: corner.x + 30, y: corner.y };
		const to = { x: corner.x, y: corner.y + 30 };
		const a = { x: corner.x + margin * 0.6, y: corner.y };
		const b = { x: corner.x, y: corner.y + margin * 0.6 };
		const line = (p0: Vec, p3: Vec) => ({ p0, p1: vecLerp(p0, p3, 1 / 3), p2: vecLerp(p0, p3, 2 / 3), p3 });
		const whole: Finger = { id: 'corner', lobe: 'left', segments: [line(from, corner), line(corner, to)] };
		const split: Finger = { ...whole, segments: [line(from, a), line(a, corner), line(corner, b), line(b, to)] };
		expect(fingerHasIntersectionIssues(whole, [whole], margin)).toBe(false);
		expect(fingerHasIntersectionIssues(split, [split], margin)).toBe(false);
	});

	it('flags a curve that loops back on itself', () => {
		const p0: Vec = { x: rect.right, y: mid };
		const p3: Vec = { x: rect.left, y: mid };
		const loop: Finger = {
			id: 'L-1',
			lobe: 'left',
			segments: [{ p0, p1: { x: rect.left - 40, y: mid + 60 }, p2: { x: rect.right + 40, y: mid + 60 }, p3 }]
		};
		expect(fingerHasIntersectionIssues(loop, [loop], margin)).toBe(true);
		// A straight curve well away from the loop is fine even though the loop is in its lobe.
		const other = straightLeft('L-2', mid - 60);
		expect(fingerHasIntersectionIssues(other, [loop, other], margin)).toBe(false);
		expect(findFingersWithIssues([loop, other], margin)).toEqual(new Set(['L-1']));
	});
});
