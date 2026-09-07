import { describe, it, expect } from 'vitest';
import { SWAY_DURATION_S, swayAnimationDelay } from './sway';
import { HERO_SLOTS_DESKTOP, HERO_SLOTS_MOBILE } from '$lib/components/front/heroSlots';

/** The seconds in an `animation-delay` string, e.g. "-4.4s" -> -4.4. */
function seconds(value: string): number {
	const match = /^(-?\d+(?:\.\d+)?)s$/.exec(value);
	expect(match, `not a seconds value: ${value}`).not.toBeNull();
	return Number(match![1]);
}

describe('swayAnimationDelay', () => {
	it('spends the offset as a negative delay, so the sway starts mid-cycle', () => {
		expect(swayAnimationDelay(1.4)).toBe('-1.4s');
		expect(swayAnimationDelay(4.4)).toBe('-4.4s');
	});

	it('is never positive — a positive delay is what makes the heart teleport', () => {
		for (let offset = -20; offset <= 20; offset += 0.1) {
			expect(seconds(swayAnimationDelay(offset))).toBeLessThanOrEqual(0);
		}
	});

	it('leaves a zero offset alone rather than emitting "-0s"', () => {
		expect(swayAnimationDelay(0)).toBe('0s');
		expect(swayAnimationDelay(-0)).toBe('0s');
	});

	it('wraps whole alternate periods, keeping phase and direction', () => {
		const period = SWAY_DURATION_S * 2;
		expect(swayAnimationDelay(3 + period)).toBe(swayAnimationDelay(3));
		expect(swayAnimationDelay(3 - period)).toBe(swayAnimationDelay(3));
		expect(seconds(swayAnimationDelay(period - 0.001))).toBeGreaterThan(-period);
	});

	it('rounds to whole milliseconds instead of leaking float noise', () => {
		expect(swayAnimationDelay(0.1 + 0.2)).toBe('-0.3s');
		expect(swayAnimationDelay(3 * 0.7)).toBe('-2.1s');
	});

	it('falls back to 0s for a non-finite offset rather than writing broken CSS', () => {
		expect(swayAnimationDelay(Number.NaN)).toBe('0s');
		expect(swayAnimationDelay(Number.POSITIVE_INFINITY)).toBe('0s');
	});

	it('keeps the hero slots out of step with each other', () => {
		for (const slots of [HERO_SLOTS_DESKTOP, HERO_SLOTS_MOBILE]) {
			const delays = slots.map((slot) => swayAnimationDelay(slot.delay));
			expect(new Set(delays).size).toBe(slots.length);
		}
	});
});
