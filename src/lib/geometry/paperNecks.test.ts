import { describe, expect, it } from 'vitest';
import { holdingWidth, paperFaults, paperHolds, paperReport, papersAt } from './paperNecks';
import { bentHeart as heart } from './paperNecks.test-helpers';

describe('paper that holds once cut', () => {
	it('holds on a plain heart', () => {
		expect(paperFaults(heart())).toEqual({ weak: 0, loose: 0 });
	});

	it('finds the strip that hangs by a neck narrower than 2 mm, at the width it is printed', () => {
		expect(paperFaults(heart(1))).toEqual({ weak: 1, loose: 0 });
		expect(paperHolds(heart(3))).toBe(true);
		// The same heart printed two and a half times as wide has a 2.5 mm neck.
		expect(paperHolds(heart(1), { widthMm: 200 })).toBe(true);
	});

	it('finds the paper that comes loose where two cuts meet', () => {
		expect(paperFaults(heart(0)).loose).toBe(1);
	});

	it('finds the narrowest print at which a thin neck holds, and none for loose paper', () => {
		// A 1 mm neck at 80 mm is 2 mm at 160 mm. Seen in 20 mm steps, on a
		// coarser grid than a print's, so the test stays quick.
		const coarse = { stepMm: 20, pxPerMm: 4 }, width = holdingWidth(heart(1), coarse);
		expect(width).toBeGreaterThanOrEqual(160);
		expect(width).toBeLessThanOrEqual(180);
		expect(holdingWidth(heart(1), { ...coarse, maxMm: 150 })).toBeNull();
		expect(holdingWidth(heart(1.6), coarse)).toBeLessThan(width!);
		expect(holdingWidth(heart(0), coarse)).toBeNull();
	});

	it("reports the paper at the width it prints, and where it would hold within the sheet's reach", () => {
		expect(paperReport(heart(), 80, 200)).toEqual({ widthMm: 80, faults: { weak: 0, loose: 0 }, holdsMm: null });
		// The thin neck holds from the width `holdingWidth` finds (see above).
		const thin = paperReport(heart(1), 80, 200);
		expect(thin).toMatchObject({ widthMm: 80, faults: { weak: 1, loose: 0 } });
		expect(thin.holdsMm).toBeGreaterThanOrEqual(160);
		expect(thin.holdsMm).toBeLessThanOrEqual(180);
		expect(paperReport(heart(1), 80, 120).holdsMm).toBeNull();
		expect(paperReport(heart(0), 80, 200)).toMatchObject({ faults: { loose: 1 }, holdsMm: null });
	});

	it("sums up several hearts' paper at one width: the widest any needs, and none where one never holds", () => {
		const plain = paperReport(heart(), 80, 200), thin = paperReport(heart(1), 80, 200), loose = paperReport(heart(0), 80, 200);
		expect(papersAt([plain, plain])).toBeNull();
		expect(papersAt([plain, thin])).toEqual({ widthMm: 80, loose: false, holdsMm: thin.holdsMm });
		expect(papersAt([thin, { ...thin, holdsMm: 190 }])!.holdsMm).toBe(190);
		expect(papersAt([thin, loose])).toEqual({ widthMm: 80, loose: true, holdsMm: null });
	});
});
