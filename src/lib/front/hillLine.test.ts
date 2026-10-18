import { describe, expect, it } from 'vitest';
import landscapeSvg from '$lib/assets/landscape.svg?raw';
import {
	CARD_GAP,
	cardDrop,
	chipLift,
	cubic,
	HILL_PATH,
	HILL_SEGMENTS,
	hillPageY,
	hillTopBetween,
	hillTopPage,
	hillY,
	toPageY,
	toUnitsX,
	type LandRect
} from './hillLine';

// The reference layout at 1440px wide (docs/redesign/GALLERY-CURVE.md): the
// landscape rect starts at page y 243 and is 480px tall; the content column
// runs from x 120 to 1320.
const LAND_1440: LandRect = { left: 0, top: 243, width: 1440 };
const COLUMN_1440 = [120, 1320] as const;

describe('HILL_PATH', () => {
	it('is the top edge of the drawing’s snow-field layer', () => {
		const field = landscapeSvg.match(/<g id="snow-field">\s*<path[^>]*\sd="([^"]+)"/);
		expect(field?.[1]).toBe(`${HILL_PATH} V724H0Z`);
	});

	it('is continuous across segment joins', () => {
		for (let i = 1; i < HILL_SEGMENTS.length; i++) {
			const join = HILL_SEGMENTS[i][0][0];
			expect(hillY(join - 1e-6)).toBeCloseTo(hillY(join + 1e-6), 3);
			expect(HILL_SEGMENTS[i][0]).toEqual(HILL_SEGMENTS[i - 1][3]);
		}
	});

	it('passes through the path’s end points', () => {
		expect(hillY(0)).toBeCloseTo(523, 6);
		expect(hillY(681)).toBeCloseTo(533, 6);
		expect(hillY(1220)).toBeCloseTo(601, 6);
		expect(hillY(1909)).toBeCloseTo(508, 6);
		expect(hillY(2172)).toBeCloseTo(519, 6);
		// Level left of the drawing; mirrored past its right edge (see below).
		expect(hillY(-50)).toBeCloseTo(523, 6);
		expect(hillY(3000)).toBeCloseTo(hillY(2 * 2172 - 3000), 6);
	});
});

describe('cubic', () => {
	it('interpolates between its end points', () => {
		expect(cubic(0, 1, 2, 3, 0)).toBe(0);
		expect(cubic(0, 1, 2, 3, 1)).toBe(3);
		expect(cubic(0, 1, 2, 3, 0.5)).toBeCloseTo(1.5, 12);
	});
});

describe('page coordinates', () => {
	it('maps page x to drawing units and drawing y to page y', () => {
		expect(toUnitsX(720, LAND_1440)).toBeCloseTo(1086, 6);
		expect(toPageY(724, LAND_1440)).toBeCloseTo(243 + 480, 6);
		expect(toUnitsX(110, { left: 10, top: 0, width: 2172 })).toBeCloseTo(100, 6);
	});

	it('pins the reference hill line at 1440 (within 1px)', () => {
		const expected: [number, number][] = [
			[234, 573],
			[477, 601],
			[720, 641],
			[963, 624],
			[1206, 584]
		];
		for (const [x, y] of expected) {
			expect(Math.abs(hillPageY(x, LAND_1440) - y)).toBeLessThanOrEqual(1);
		}
	});

	it('finds hillTop at 1440 (within 1px)', () => {
		expect(Math.abs(hillTopPage(...COLUMN_1440, LAND_1440) - 573)).toBeLessThanOrEqual(1);
	});
});

describe('hillTopBetween', () => {
	it('is never below the curve anywhere in the range', () => {
		for (const [x0, x1] of [
			[0, 2172],
			[181, 1991],
			[600, 1500],
			[1300, 1400]
		]) {
			const top = hillTopBetween(x0, x1);
			let sampled = Infinity;
			for (let x = x0; x <= x1; x += 0.5) sampled = Math.min(sampled, hillY(x));
			expect(top).toBeLessThanOrEqual(sampled + 1e-9);
			expect(sampled - top).toBeLessThan(0.01);
		}
	});

	it('takes the range in either order', () => {
		expect(hillTopBetween(1500, 600)).toBe(hillTopBetween(600, 1500));
	});

	it('follows the mirror image past the right edge', () => {
		for (const [x0, x1] of [
			[1800, 2600],
			[2200, 3000],
			[1000, 4000]
		]) {
			const top = hillTopBetween(x0, x1);
			let sampled = Infinity;
			for (let x = x0; x <= x1; x += 0.5) sampled = Math.min(sampled, hillY(x));
			expect(top).toBeLessThanOrEqual(sampled + 1e-9);
			expect(sampled - top).toBeLessThan(0.01);
		}
	});
});

describe('past the drawing', () => {
	it('mirrors the line at the right edge (Scene shows the mirror image there)', () => {
		for (const d of [0, 1, 58, 400, 2000]) expect(hillY(2172 + d)).toBeCloseTo(hillY(2172 - d), 9);
	});

	it('stays level left of the drawing and past the mirror', () => {
		expect(hillY(-50)).toBe(hillY(0));
		expect(hillY(2 * 2172 + 50)).toBe(hillY(0));
	});
});

describe('chipLift and cardDrop', () => {
	const hillTop = hillTopPage(...COLUMN_1440, LAND_1440);

	it('puts a chip CHIP_GAP under the line at its centre', () => {
		expect(chipLift(1206, LAND_1440, hillTop) + hillTop).toBeCloseTo(
			hillPageY(1206, LAND_1440) + 4,
			9
		);
	});

	it('gives the reference card tops at 1440', () => {
		// The fourth card's centre lies under the chips.
		const chips = [900, 1320] as const;
		const tops = [234, 477, 720, 963].map(
			(x) => hillTop + CARD_GAP + cardDrop(x, LAND_1440, hillTop, chips)
		);
		const expected = [579, 607, 647, 684];
		tops.forEach((top, i) => expect(Math.abs(top - expected[i])).toBeLessThanOrEqual(1));
	});

	it('adds nothing for the chips when there are none', () => {
		expect(cardDrop(963, LAND_1440, hillTop, null)).toBeCloseTo(
			hillPageY(963, LAND_1440) - hillTop,
			9
		);
	});
});
