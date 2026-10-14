import { it, expect } from 'vitest';
import { templateTiles } from './tiles';
it('keeps smaller hearts on one A4 sheet per colour', () => {
	expect(templateTiles(100).pages).toBe(2);
	expect(templateTiles(150).pages).toBe(2);
});
it('covers the full physical template with 10 mm joins', () => {
	for (const size of [175, 225, 275, 1000]) {
		const t = templateTiles(size);
		expect(
			t.width + (t.columns - 1) * (t.width - t.overlap)
		).toBeGreaterThanOrEqual(size + 2);
		expect(
			t.height + (t.rows - 1) * (t.height - t.overlap)
		).toBeGreaterThanOrEqual(size * 1.5 + 2);
		expect(t.pages).toBe(2 * t.columns * t.rows);
	}
	expect(templateTiles(225).pages).toBe(8);
});
it('rejects invalid dimensions', () => {
	for (const size of [NaN, Infinity, 0, 79, 1001])
		expect(() => templateTiles(size)).toThrow();
});
