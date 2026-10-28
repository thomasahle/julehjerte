import { describe, expect, it } from 'vitest';
import { cellsToMm, formatMm, SQUARE_MM } from './units';

describe('units', () => {
	it('reads a 400-cell mask as a 100 mm square: a cell is a quarter of a millimetre', () => {
		expect(SQUARE_MM).toBe(100);
		expect(cellsToMm(400)).toBe(100);
		expect(cellsToMm(1)).toBe(0.25);
		expect(cellsToMm(50, 200)).toBe(25);
	});

	it("writes millimetres in the visitor's notation, to a hundredth below 10 mm and a tenth above", () => {
		expect(formatMm(1, 'da')).toBe('0,25');
		expect(formatMm(6, 'da')).toBe('1,5');
		expect(formatMm(6, 'en')).toBe('1.5');
		expect(formatMm(130, 'da')).toBe('32,5');
		expect(formatMm(200, 'da')).toBe('50');
		expect(formatMm(41.3, 'en')).toBe('10.3');
	});
});
