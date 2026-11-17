import { describe, expect, it } from 'vitest';
import pins from '$lib/data/pinterest-pins.json';
import { PINTEREST_ORDER } from '$lib/pinterest';
import { pinterestPinUrl } from '$lib/pinterestPins';

describe('pinterestPinUrl', () => {
	it('gives a heart with a Pin its address', () => {
		expect(pinterestPinUrl('amy-rosette')).toBe('https://www.pinterest.com/pin/1136596024743786075/');
	});

	it('gives nothing for a heart without a Pin, or one not in the gallery', () => {
		expect(pinterestPinUrl('no-such-heart')).toBeNull();
		expect(pinterestPinUrl('kogle')).toBeNull();
	});

	it('lists only plain Pin numbers of hearts in the schedule', () => {
		for (const [id, pin] of Object.entries(pins)) {
			expect(PINTEREST_ORDER, id).toContain(id);
			expect(pin, id).toMatch(/^\d+$/);
		}
	});
});
