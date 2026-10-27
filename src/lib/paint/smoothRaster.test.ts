import { describe, expect, it } from 'vitest';
import { createMask, type Mask } from './mask';
import { missingPixelChannels, smoothCells, smoothPixels, smoothScale } from './smoothRaster';
import { rect, stamp } from './tools';

const PAPER = [[255, 255, 255], [185, 19, 19]] as const;
const WHOLE = (m: Mask) => ({ x0: 0, y0: 0, x1: m.size, y1: m.size });

function draw(m: Mask, scale: number) {
	const out = new Uint8ClampedArray((m.size * scale) ** 2 * 4);
	smoothPixels(m, PAPER, scale, out, WHOLE(m));
	const at = (px: number, py: number) => [...out.slice(4 * (py * m.size * scale + px), 4 * (py * m.size * scale + px) + 3)];
	return { out, at };
}

describe('the smooth picture', () => {
	it("draws every cell's centre in its own paper", () => {
		const m = createMask(0, 40);
		stamp(m, 20, 20, { radius: 9, value: 1 });
		rect(m, { x: 3, y: 30 }, { x: 4, y: 30 }, 1);
		const { at } = draw(m, 3);
		for (let y = 0; y < m.size; y++)
			for (let x = 0; x < m.size; x++) expect(at(3 * x + 1, 3 * y + 1)).toEqual([...PAPER[m.data[y * m.size + x]!]]);
	});

	it('keeps an edge along the cells crisp, where it falls between two pixels', () => {
		const m = createMask(0, 20);
		rect(m, { x: 10, y: 0 }, { x: 19, y: 19 }, 1);
		const { at } = draw(m, 3);
		const row = Array.from({ length: 60 }, (_, px) => at(px, 30)[1]!);
		expect(row.slice(0, 30).every((g) => g === 255)).toBe(true);
		expect(row.slice(30).every((g) => g === 19)).toBe(true);
	});

	it('draws a diagonal edge as a straight line, not a stair', () => {
		const m = createMask(0, 40);
		for (let y = 0; y < 40; y++) rect(m, { x: y, y }, { x: 39, y }, 1);
		const { at } = draw(m, 3);
		// Along the diagonal edge every pixel row crosses at the same offset from the diagonal.
		const crossing = (py: number) => {
			for (let px = 0; px < 120; px++) if (at(px, py)[1]! < 137) return px - py;
			return NaN;
		};
		const offsets = new Set(Array.from({ length: 100 }, (_, k) => crossing(k + 10)));
		expect(offsets.size).toBeLessThanOrEqual(2);
		// And antialiased: a rim of mixed pixels, at most two a row.
		for (let py = 10; py < 110; py++) {
			const mixed = Array.from({ length: 120 }, (_, px) => at(px, py)[1]!).filter((g) => g !== 255 && g !== 19);
			expect(mixed.length).toBeGreaterThan(0);
			expect(mixed.length).toBeLessThanOrEqual(2);
		}
	});

	it("draws an edge where Udtvær's level puts it, between the cells", () => {
		const m = createMask(0, 20);
		rect(m, { x: 10, y: 0 }, { x: 19, y: 19 }, 1);
		// Half-way between columns 9 and 10, the edge falls between pixels 29 and 30.
		expect(draw(m, 3).at(30, 30)[1]).toBe(19);
		// Column 10 only just paper 1: the edge lies nearly on its centre.
		m.level = Uint8Array.from(m.data, (v) => v * 255);
		for (let y = 0; y < 20; y++) m.level[y * 20 + 10] = 140;
		expect(draw(m, 3).at(30, 30)[1]).toBe(255);
		expect(draw(m, 3).at(32, 30)[1]).toBe(19);
		// A level the cells no longer agree with is not read.
		for (let y = 0; y < 20; y++) m.level[y * 20 + 10] = 100;
		expect(draw(m, 3).at(30, 30)[1]).toBe(19);
	});

	it('keeps the pattern of a cell the mask does not know', () => {
		const m: Mask = { ...createMask(0, 8), validMask: new Uint8Array(64).fill(1) };
		m.validMask![3 * 8 + 3] = 0;
		const { at } = draw(m, 2);
		expect(at(6, 6)).toEqual([...missingPixelChannels(3 * 8 + 3, 8)].slice(0, 3));
		expect(at(7, 7)).toEqual([...missingPixelChannels(3 * 8 + 3, 8)].slice(0, 3));
	});

	it('rewrites only the pixels a changed box reaches', () => {
		const m = createMask(0, 20);
		const out = new Uint8ClampedArray((20 * 2) ** 2 * 4);
		const written = smoothPixels(m, PAPER, 2, out, { x0: 5, y0: 6, x1: 7, y1: 8 });
		expect(written).toEqual({ x0: 8, y0: 10, x1: 16, y1: 18 });
		expect(out[4 * (9 * 40 + 9)]).toBe(0);
		expect(out[4 * (10 * 40 + 8)]).toBe(255);
	});

	it("draws Markér's floating patch as the mask draws the same cells", () => {
		const m = createMask(0, 40);
		stamp(m, 20, 20, { radius: 7, value: 1 });
		const w = 12, h = 9, x0 = 14, y0 = 13, cells = new Uint8Array(w * h);
		for (let y = 0; y < h; y++) cells.set(m.data.subarray((y0 + y) * 40 + x0, (y0 + y) * 40 + x0 + w), y * w);
		const patch = smoothCells(cells, undefined, w, h, PAPER, 3);
		const { at } = draw(m, 3);
		// Away from the patch's own edge, where it reads past itself, the two agree pixel for pixel.
		for (let py = 3; py < 3 * h - 3; py++)
			for (let px = 3; px < 3 * w - 3; px++)
				expect([...patch.slice(4 * (py * 3 * w + px), 4 * (py * 3 * w + px) + 3)]).toEqual(at(3 * x0 + px, 3 * y0 + py));
	});

	it('draws as many pixels a cell as the screen shows, up to three', () => {
		expect(smoothScale(0.4)).toBe(1);
		expect(smoothScale(2.6)).toBe(3);
		expect(smoothScale(9)).toBe(3);
	});
});
