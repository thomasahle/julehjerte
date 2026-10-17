import { describe, expect, it } from 'vitest';
import { activeSection, chipRowScroll, currentSection, isAtPageBottom } from './scrollSpy';

describe('activeSection', () => {
	it('is -1 with no sections', () => {
		expect(activeSection([], 60)).toBe(-1);
		expect(activeSection([], 60, true)).toBe(-1);
	});

	it('is -1 while the first section is still below the line', () => {
		expect(activeSection([400, 900, 1400], 60)).toBe(-1);
		expect(activeSection([62, 900], 60)).toBe(-1);
	});

	it('picks the last section whose top has reached the line', () => {
		expect(activeSection([-800, -200, 300], 60)).toBe(1);
		expect(activeSection([-800, -200, -10], 60)).toBe(2);
	});

	it('counts a section exactly on the line, or a pixel under it', () => {
		expect(activeSection([-300, 60, 500], 60)).toBe(1);
		expect(activeSection([-300, 61, 500], 60)).toBe(1);
		expect(activeSection([-300, 61.5, 500], 60)).toBe(0);
	});

	it('makes the last section current at the bottom of the page', () => {
		// Hjerter's top is still well below the bar, but the page can go no further.
		expect(activeSection([-1600, -1000, -400, 300], 60, true)).toBe(3);
	});
});

describe('currentSection', () => {
	it('is -1 until the bar has stuck, whatever the sections say', () => {
		expect(currentSection([-300, 400], 58, false)).toBe(-1);
		expect(currentSection([40, 900], 58, false)).toBe(-1);
	});

	it('is the first section once stuck, even while its row still hangs below the line', () => {
		// A chip jump to Klassiske lands 1px past the stick point, with the
		// lowest strand of its first row not yet level.
		expect(currentSection([70, 900], 58, true)).toBe(0);
	});

	it('follows the ordinary rule once stuck', () => {
		expect(currentSection([-800, -200, 300], 58, true)).toBe(1);
		expect(currentSection([-1600, -1000, 300], 58, true, true)).toBe(2);
	});

	it('is -1 with no sections', () => {
		expect(currentSection([], 58, true)).toBe(-1);
	});
});

describe('isAtPageBottom', () => {
	it('is true when the viewport reaches the end of the document', () => {
		expect(isAtPageBottom(1200, 800, 2000)).toBe(true);
		expect(isAtPageBottom(1199.5, 800, 2000)).toBe(true);
	});

	it('is false short of the end', () => {
		expect(isAtPageBottom(1000, 800, 2000)).toBe(false);
	});

	it('is false for a page that does not scroll', () => {
		expect(isAtPageBottom(0, 800, 800)).toBe(false);
	});
});

describe('chipRowScroll', () => {
	it('is 0 for a chip already fully in view', () => {
		expect(chipRowScroll(220, 300, 200, 380)).toBe(0);
		expect(chipRowScroll(200, 380, 200, 380)).toBe(0);
	});

	it('brings a chip cut off on the right to the left edge, where the row snaps', () => {
		expect(chipRowScroll(350, 430, 200, 380)).toBe(150);
		expect(chipRowScroll(600, 680, 200, 380)).toBe(400);
	});

	it('brings a chip cut off on the left to the left edge', () => {
		expect(chipRowScroll(150, 230, 200, 380)).toBe(-50);
	});

	it('aligns a chip wider than the view to the left edge', () => {
		expect(chipRowScroll(250, 500, 200, 380)).toBe(50);
	});
});
