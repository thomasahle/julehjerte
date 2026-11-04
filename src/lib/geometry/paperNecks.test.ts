import { describe, expect, it } from 'vitest';
import { holdingWidth, paperFaults, paperHolds, paperReport, papersAt, thinnestNeck, type WeakPiece } from './paperNecks';
import { bentHeart as heart } from './paperNecks.test-helpers';
import { getCenteredRectParams } from '$lib/utils/overlapRect';
import { middleNeedles } from '$lib/generator/cutQuality';
import type { HeartDesign } from '$lib/types/heart';
import star from '$lib/generator/fixtures/star-board-5-100.json';
import slid from '$lib/generator/fixtures/star-board-5-100-slid.json';

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

	it('finds where the weak strip hangs by its neck, and how wide the neck is', () => {
		// The bent cut comes within 1 mm of the next at three fifths of the way across, two thirds down.
		const design = heart(1), rect = getCenteredRectParams(design.gridSize), necks: (WeakPiece & { mm: number })[] = [];
		paperFaults(design, { necks });
		expect(necks).toHaveLength(1);
		const [{ x, y, mm }] = necks as [WeakPiece & { mm: number }];
		expect(Math.abs(x - (rect.left + .6 * rect.width))).toBeLessThan(rect.width / 40);
		expect(Math.abs(y - (rect.top + 2 / 3 * rect.height))).toBeLessThan(rect.height / 40);
		expect(mm).toBeGreaterThan(.7);
		expect(mm).toBeLessThan(1.3);
	});

	it('measures the narrowest neck any paper hangs by, where it holds as where it tears', () => {
		const rect = getCenteredRectParams(heart().gridSize);
		for (const gap of [1, 3]) {
			const at: WeakPiece[] = [], mm = thinnestNeck(heart(gap), { at });
			expect(Math.abs(mm - gap)).toBeLessThan(.3);
			expect(Math.abs(at[0]!.x - (rect.left + .6 * rect.width))).toBeLessThan(rect.width / 40);
			expect(Math.abs(at[0]!.y - (rect.top + 2 / 3 * rect.height))).toBeLessThan(rect.height / 40);
		}
		// The plain heart's strips hang by themselves, a third of the square wide.
		expect(thinnestNeck(heart())).toBeGreaterThan(20);
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

describe('the paper a neck search leaves out', () => {
	// The star on five strips at 100%: its top tip's needles, which no cuts keep from being thin.
	const design = star.design as unknown as HeartDesign, needles = middleNeedles(design);

	it('kept about a needle, makes no neck of the paper between it and a cut nearby, as cut away it would', () => {
		// 8 mm about the tip reach to within 1.4 mm of the circle above it.
		const cut = thinnestNeck(design, { spared: needles.map((p) => ({ ...p, mm: 8 })) });
		const kept = thinnestNeck(design, { spared: needles.map((p) => ({ ...p, mm: 8, kept: true })) });
		expect(cut).toBeLessThan(1.6);
		expect(kept).toBeGreaterThan(2.2);
	});

	it('makes no piece of a single cell a cut stepped across the grid leaves wider by a corner', () => {
		// Its switches slid 3 units down the tip's flanks: the hidden cut meets each flank at 51°, where a
		// cell of the grid lies half a cell farther from the stepped cuts than those about it.
		expect(thinnestNeck(slid as unknown as HeartDesign, { spared: middleNeedles(slid as unknown as HeartDesign).map((p) => ({ ...p, mm: 8, kept: true })) })).toBeGreaterThan(2.5);
	});
});

