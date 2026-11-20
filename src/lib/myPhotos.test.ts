import { describe, expect, it } from 'vitest';
import { PHOTO_MAIL, fitWithin, photoMailHref, shouldSuggestMail } from './myPhotos';

describe('fitWithin', () => {
	it('leaves a small picture alone', () => {
		expect(fitWithin(800, 600, 1600)).toEqual({ width: 800, height: 600 });
	});

	it('shrinks the longer side to the limit and keeps the shape', () => {
		expect(fitWithin(4000, 3000, 1600)).toEqual({ width: 1600, height: 1200 });
		expect(fitWithin(3000, 4000, 1600)).toEqual({ width: 1200, height: 1600 });
	});

	it('never rounds a thin picture down to nothing', () => {
		expect(fitWithin(10000, 2, 1600)).toEqual({ width: 1600, height: 1 });
	});
});

describe('the mail offer', () => {
	it('comes with the first three photos only', () => {
		expect([1, 2, 3, 4, 10].map((count) => shouldSuggestMail(count))).toEqual([true, true, true, false, false]);
	});

	it('opens a mail to the site with the heart named in the subject', () => {
		expect(photoMailHref('Mit hjerte: Stjerne & måne')).toBe(
			`mailto:${PHOTO_MAIL}?subject=Mit%20hjerte%3A%20Stjerne%20%26%20m%C3%A5ne`
		);
	});
});
