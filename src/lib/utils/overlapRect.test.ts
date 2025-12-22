import { describe, it, expect } from 'vitest';
import type { Finger } from '$lib/types/heart';
import { fingerFromPathData } from '$lib/geometry/bezierSegments';
import { getCenteredRectParams, inferOverlapRect } from './overlapRect';

function makeFinger(id: string, lobe: Finger['lobe'], pathData: string): Finger {
	return fingerFromPathData({ id, lobe, pathData });
}

describe('getCenteredRectParams', () => {
	it('calculates centered rectangle for 3x3 grid', () => {
		const result = getCenteredRectParams({ x: 3, y: 3 });
		// 3 * 75 = 225, centered at 300 means left = 300 - 112.5 = 187.5
		expect(result.width).toBe(225);
		expect(result.height).toBe(225);
		expect(result.left).toBe(187.5);
		expect(result.top).toBe(187.5);
		expect(result.right).toBe(412.5);
		expect(result.bottom).toBe(412.5);
	});

	it('calculates centered rectangle for 4x4 grid', () => {
		const result = getCenteredRectParams({ x: 4, y: 4 });
		// 4 * 75 = 300, centered at 300 means left = 300 - 150 = 150
		expect(result.width).toBe(300);
		expect(result.height).toBe(300);
		expect(result.left).toBe(150);
		expect(result.top).toBe(150);
	});

	it('handles non-square grids', () => {
		const result = getCenteredRectParams({ x: 3, y: 4 });
		expect(result.width).toBe(225);
		expect(result.height).toBe(300);
	});

	it('uses custom center point', () => {
		const result = getCenteredRectParams({ x: 2, y: 2 }, { x: 100, y: 100 });
		// 2 * 75 = 150, centered at 100 means left = 100 - 75 = 25
		expect(result.left).toBe(25);
		expect(result.top).toBe(25);
	});
});

describe('inferOverlapRect', () => {
	it('returns fallback when no fingers', () => {
		const result = inferOverlapRect([], { x: 3, y: 3 });
		expect(result.left).toBe(187.5);
		expect(result.top).toBe(187.5);
		expect(result.width).toBe(225);
		expect(result.height).toBe(225);
	});

	it('infers from left-lobe fingers', () => {
		const fingers: Finger[] = [
			makeFinger('L-0', 'left', 'M 412.5 262.5 C 356.25 262.5 243.75 262.5 187.5 262.5'),
			makeFinger('L-1', 'left', 'M 412.5 337.5 C 356.25 337.5 243.75 337.5 187.5 337.5')
		];
		const result = inferOverlapRect(fingers, { x: 3, y: 3 });

		// Left fingers: start at x=412.5, end at x=187.5
		// So left = 187.5, right = 412.5
		expect(result.left).toBe(187.5);
		expect(result.right).toBe(412.5);
	});

	it('infers from right-lobe fingers', () => {
		const fingers: Finger[] = [
			makeFinger('R-0', 'right', 'M 262.5 412.5 C 262.5 356.25 262.5 243.75 262.5 187.5'),
			makeFinger('R-1', 'right', 'M 337.5 412.5 C 337.5 356.25 337.5 243.75 337.5 187.5')
		];
		const result = inferOverlapRect(fingers, { x: 3, y: 3 });

		// Right fingers: start at y=412.5, end at y=187.5
		// So top = 187.5, bottom = 412.5
		expect(result.top).toBe(187.5);
		expect(result.bottom).toBe(412.5);
	});

	it('infers from mixed left and right fingers (classic-3x3)', () => {
		const fingers: Finger[] = [
			makeFinger('L-0', 'left', 'M 412.5 262.5 C 356.25 262.5 243.75 262.5 187.5 262.5'),
			makeFinger('L-1', 'left', 'M 412.5 337.5 C 356.25 337.5 243.75 337.5 187.5 337.5'),
			makeFinger('R-0', 'right', 'M 262.5 412.5 C 262.5 356.25 262.5 243.75 262.5 187.5'),
			makeFinger('R-1', 'right', 'M 337.5 412.5 C 337.5 356.25 337.5 243.75 337.5 187.5')
		];
		const result = inferOverlapRect(fingers, { x: 3, y: 3 });

		expect(result.left).toBe(187.5);
		expect(result.right).toBe(412.5);
		expect(result.top).toBe(187.5);
		expect(result.bottom).toBe(412.5);
		expect(result.width).toBe(225);
		expect(result.height).toBe(225);
	});

	it('snaps to expected dimensions when close (within 3px tolerance)', () => {
		// Create fingers that result in slightly off dimensions
		const fingers: Finger[] = [
			makeFinger('L-0', 'left', 'M 413 262 C 356 262 244 262 188 262') // slightly off from 412.5, 187.5
		];
		const result = inferOverlapRect(fingers, { x: 3, y: 3 });

		// Width = 413 - 188 = 225, which is exactly the expected width
		// So no snapping needed for this case
		expect(result.width).toBe(225);
	});

	it('snaps width when within 3px of expected', () => {
		const fingers: Finger[] = [
			makeFinger('L-0', 'left', 'M 414 262 C 356 262 244 262 187 262') // width = 227, expected = 225, diff = 2
		];
		const result = inferOverlapRect(fingers, { x: 3, y: 3 });

		// Should snap to expected width
		expect(result.width).toBe(225);
		expect(result.right).toBe(187 + 225); // left + expectedWidth
	});

	it('does not snap when difference exceeds 3px', () => {
		const fingers: Finger[] = [
			makeFinger('L-0', 'left', 'M 420 262 C 356 262 244 262 187 262') // width = 233, expected = 225, diff = 8
		];
		const result = inferOverlapRect(fingers, { x: 3, y: 3 });

		// Should NOT snap - keep original
		expect(result.width).toBe(233);
	});

	it('handles empty pathData gracefully', () => {
		const fingers: Finger[] = [
			makeFinger('L-0', 'left', '')
		];
		const result = inferOverlapRect(fingers, { x: 3, y: 3 });

		// Should use fallback
		expect(result.left).toBe(187.5);
	});

	it('uses median for multiple values', () => {
		const fingers: Finger[] = [
			makeFinger('L-0', 'left', 'M 400 262 C 356 262 244 262 180 262'), // left=180, right=400
			makeFinger('L-1', 'left', 'M 410 337 C 356 337 244 337 190 337'), // left=190, right=410
			makeFinger('L-2', 'left', 'M 405 200 C 356 200 244 200 185 200') // left=185, right=405
		];
		const result = inferOverlapRect(fingers, { x: 3, y: 3 });

		// Median of left candidates [180, 190, 185] sorted = [180, 185, 190] -> median = 185
		// Median of right candidates [400, 410, 405] sorted = [400, 405, 410] -> median = 405
		expect(result.left).toBe(185);
		expect(result.right).toBe(405);
	});
});
