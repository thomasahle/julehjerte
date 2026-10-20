/**
 * The square picture's geometry ($lib/heartImage): placed by heartImageFit, its
 * heart box lands exactly on a page box, and the clipped band covers the ribbon.
 */
import { describe, expect, it } from 'vitest';
import {
	HEART_IMAGE_BOX,
	HEART_IMAGE_RIBBON,
	HEART_IMAGE_SIZE,
	heartImageFit,
	heartImagePath,
	heartImageRibbonBand
} from './heartImage';

describe('heartImage', () => {
	it('keeps the heart box inside the image', () => {
		const { left, top, size } = HEART_IMAGE_BOX;
		expect(left + size).toBeLessThanOrEqual(HEART_IMAGE_SIZE);
		expect(top + size).toBeLessThanOrEqual(HEART_IMAGE_SIZE);
	});

	it('maps the image heart box onto a page box', () => {
		const box = 88; // the thumbnail's content box at desktop width
		const fit = heartImageFit();
		const px = (pct: string) => (parseFloat(pct) / 100) * box;
		const scale = px(fit.width) / HEART_IMAGE_SIZE;
		expect(px(fit.left) + HEART_IMAGE_BOX.left * scale).toBeCloseTo(0, 3);
		expect(px(fit.top) + HEART_IMAGE_BOX.top * scale).toBeCloseTo(0, 3);
		expect(HEART_IMAGE_BOX.size * scale).toBeCloseTo(box, 3);
	});

	it('clips a band that holds the whole ribbon', () => {
		const ribbonEnd = (HEART_IMAGE_BOX.top + HEART_IMAGE_RIBBON.dip * HEART_IMAGE_BOX.size) / HEART_IMAGE_SIZE;
		expect(heartImageRibbonBand()).toBeGreaterThan(ribbonEnd);
		expect(heartImageRibbonBand()).toBeLessThan(0.5);
	});

	it('names one file per heart', () => {
		expect(heartImagePath('jul')).toBe('/og/hearts/jul.png');
	});
});
