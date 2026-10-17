import { describe, expect, it } from 'vitest';
import { layoutSheet, SHEETS } from './sheet';

/** The classic heart's piece at 80 mm: 80 wide, three times that tall. */
const piece = { widthMm: 80, heightMm: 240 };

function boxes(layout: ReturnType<typeof layoutSheet>, pieces: { widthMm: number; heightMm: number }[]) {
	return layout.placements.map(({ index, x, y }) => ({ x, y, w: pieces[index]!.widthMm, h: pieces[index]!.heightMm }));
}

describe('layoutSheet', () => {
	it('fits two 80 mm pieces on A4 and three on A3', () => {
		const pieces = Array.from({ length: 10 }, () => piece);
		expect(layoutSheet(pieces, { sheet: SHEETS.A4 }).fitted).toBe(2);
		expect(layoutSheet(pieces, { sheet: SHEETS.A3 }).fitted).toBe(3);
	});

	it('places them in rows from the top left', () => {
		const small = { widthMm: 40, heightMm: 120 };
		const layout = layoutSheet(Array.from({ length: 8 }, () => small), { sheet: SHEETS.A4 });
		// (210 − 2·5 + 5) / 45 = 4 a row; (297 − 10 + 5) / 125 = 2 rows.
		expect(layout.fitted).toBe(8);
		expect(layout.placements.slice(0, 5).map(({ x, y }) => [x, y])).toEqual([
			[5, 5],
			[50, 5],
			[95, 5],
			[140, 5],
			[5, 130]
		]);
	});

	it('reports the leftovers: only a prefix of the pieces is placed', () => {
		const pieces = Array.from({ length: 6 }, () => piece);
		const layout = layoutSheet(pieces, { sheet: SHEETS.A4 });
		expect(layout.fitted).toBe(2);
		expect(layout.placements.map((p) => p.index)).toEqual([0, 1]);
		expect(layoutSheet([{ widthMm: 200, heightMm: 600 }], { sheet: SHEETS.A4 }).fitted).toBe(0);
	});

	it('keeps the margins and gaps, and nothing overlaps', () => {
		const mixed = [
			{ widthMm: 70, heightMm: 210 },
			{ widthMm: 80, heightMm: 230 },
			{ widthMm: 50, heightMm: 150 },
			{ widthMm: 60, heightMm: 100 },
			{ widthMm: 90, heightMm: 120 },
			{ widthMm: 70, heightMm: 80 }
		];
		const sheet = { widthMm: 300, heightMm: 500 };
		const gap = 7;
		const margin = 12;
		const layout = layoutSheet(mixed, { sheet, gapMm: gap, marginMm: margin });
		const placed = boxes(layout, mixed);
		expect(placed.length).toBeGreaterThan(3);
		for (const b of placed) {
			expect(b.x).toBeGreaterThanOrEqual(margin);
			expect(b.y).toBeGreaterThanOrEqual(margin);
			expect(b.x + b.w).toBeLessThanOrEqual(sheet.widthMm - margin);
			expect(b.y + b.h).toBeLessThanOrEqual(sheet.heightMm - margin);
		}
		for (let i = 0; i < placed.length; i++) {
			for (let j = i + 1; j < placed.length; j++) {
				const a = placed[i]!;
				const b = placed[j]!;
				const apart =
					a.x + a.w + gap <= b.x + 1e-9 ||
					b.x + b.w + gap <= a.x + 1e-9 ||
					a.y + a.h + gap <= b.y + 1e-9 ||
					b.y + b.h + gap <= a.y + 1e-9;
				expect(apart, `pieces ${i} and ${j} overlap or touch`).toBe(true);
			}
		}
	});
});
