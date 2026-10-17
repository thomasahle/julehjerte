import { describe, expect, it } from 'vitest';
import { activeSection, isAtPageBottom } from './scrollSpy';

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
