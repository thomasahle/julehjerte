import { describe, expect, it } from 'vitest';
import { DEFAULT_DOWNLOAD_SETTINGS } from '$lib/download/settings';
import { SHEETS } from '$lib/laser/sheet';
import { bentHeart } from '$lib/geometry/paperNecks.test-helpers';
import { designPrintRange, designPrintSettings } from './designPrint';

describe("the width Tegn's, Mal's and the design page's PDF prints at", () => {
	const heart = bentHeart();

	it("is the visitor's, on their sheet, and the dialog's defaults where it cannot take the heart", () => {
		expect(designPrintSettings(heart, undefined, { ...DEFAULT_DOWNLOAD_SETTINGS, widthMm: 120, sheet: 'A3' })).toMatchObject({ widthMm: 120, sheet: 'A3' });
		expect(designPrintSettings(heart, 150, DEFAULT_DOWNLOAD_SETTINGS)).toMatchObject({ widthMm: 150, sheet: 'A4' });
		const sheet = { widthMm: 60, heightMm: 60 };
		expect(designPrintSettings(heart, undefined, { ...DEFAULT_DOWNLOAD_SETTINGS, sheet })).toEqual(DEFAULT_DOWNLOAD_SETTINGS);
	});

	it('reaches as wide as the sheet takes the heart', () => {
		// Each template is half again as tall as it is wide, below a 9 mm label, inside 5 mm margins and above a 5 mm footer.
		const sheet = { widthMm: 100, heightMm: 160 };
		expect(designPrintRange(heart, { ...DEFAULT_DOWNLOAD_SETTINGS, sheet })).toEqual({ widthMm: 80, maxMm: 90 });
		const a4 = designPrintRange(heart, DEFAULT_DOWNLOAD_SETTINGS);
		expect(a4.widthMm).toBe(80);
		expect(a4.maxMm).toBeGreaterThan(150);
		expect(designPrintRange(heart, { ...DEFAULT_DOWNLOAD_SETTINGS, sheet: SHEETS.A3 }).maxMm).toBe(200);
	});
});
