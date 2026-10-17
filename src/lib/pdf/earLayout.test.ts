/**
 * The picture, name and address inside a folded template's rounded end —
 * docs/redesign/DOWNLOAD.md, round 2. The ear of a template W wide is a half
 * circle of radius R = W / 2 whose base, where every strip cut starts, is
 * R below its top; nothing may cross that line or the curve.
 */
import { describe, expect, it } from 'vitest';
import { ADDRESS_PT, MIN_TEXT_PT, NAME_PT, PT_MM, estimateTextWidth, layoutEar, type EarLayout } from './earLayout';

const NAME = 'Klassisk (Venstre)';
const ADDRESS = 'juleflet.dk/hjerte/classic-3x3';

/** The classic heart's folded template: 1.5 times as tall as wide. */
function ear(widthMm: number, picture = true, name = NAME, address = ADDRESS) {
	return layoutEar({ widthMm, heightMm: widthMm * 1.5, earRadiusMm: widthMm / 2, picture, name, address });
}

/** Inside the half circle of radius r centred on (r, r), at or above its base. */
function insideEar(r: number, x: number, y: number): boolean {
	return y <= r + 1e-9 && Math.hypot(x - r, y - r) <= r + 1e-9;
}

/** Everything clear of the curve and the ear base, the text under the picture, the lines in order. */
function expectClean(layout: EarLayout, widthMm: number) {
	const r = widthMm / 2;
	const p = layout.picture;
	if (p) {
		for (const [x, y] of [[p.x, p.y], [p.x + p.size, p.y], [p.x, p.y + p.size], [p.x + p.size, p.y + p.size]]) {
			expect(insideEar(r, x!, y!)).toBe(true);
		}
	}
	let previous = p ? p.y + p.size : 0;
	for (const line of layout.lines) {
		const sizeMm = line.sizePt * PT_MM;
		const top = line.baseline - 0.75 * sizeMm;
		const bottom = line.baseline + 0.23 * sizeMm;
		expect(top).toBeGreaterThan(previous);
		expect(bottom).toBeLessThan(r);
		// The line's two ends lie inside the curve at its top, the tightest place.
		const half = estimateTextWidth(line.text, line.sizePt) / 2;
		expect(insideEar(r, line.x - half, top)).toBe(true);
		expect(insideEar(r, line.x + half, top)).toBe(true);
		expect(line.x).toBeCloseTo(r);
		previous = bottom;
	}
}

describe('layoutEar', () => {
	it('prints 8 pt and 6 pt under the picture at the default 80 mm', () => {
		const layout = ear(80);
		expect(layout.lines.map((l) => [l.kind, l.text, l.sizePt])).toEqual([
			['name', NAME, NAME_PT],
			['address', ADDRESS, ADDRESS_PT]
		]);
		// The picture the PDF has always printed: 35 % of the width, centred.
		expect(layout.picture!.size).toBeCloseTo(28);
		expect(layout.picture!.x + 14).toBeCloseTo(40);
		expectClean(layout, 80);
	});

	it.each([40, 45, 50, 60, 70, 80, 100, 150, 200])('keeps everything inside the ear at %i mm', (width) => {
		expectClean(ear(width), width);
		expectClean(ear(width, false), width);
	});

	it('shrinks both lines together when the band under the picture is narrow', () => {
		const layout = ear(60);
		const [name, address] = layout.lines;
		expect(name!.sizePt).toBeLessThan(NAME_PT);
		expect(address!.sizePt).toBeGreaterThanOrEqual(MIN_TEXT_PT);
		expect(name!.sizePt / address!.sizePt).toBeCloseTo(NAME_PT / ADDRESS_PT);
	});

	it('drops the address before it goes under 5 pt, and gives the name the room', () => {
		const layout = ear(40);
		expect(layout.lines.map((l) => l.kind)).toEqual(['name']);
		expect(layout.lines[0]!.sizePt).toBeGreaterThanOrEqual(MIN_TEXT_PT);
		expect(layout.picture!.size).toBeCloseTo(14);
	});

	it('moves the lines up to where the picture was when it is turned off', () => {
		const on = ear(80);
		const off = ear(80, false);
		expect(off.picture).toBeNull();
		expect(off.lines.map((l) => l.sizePt)).toEqual([NAME_PT, ADDRESS_PT]);
		const middle = on.picture!.y + on.picture!.size / 2;
		expect(off.lines[0]!.baseline).toBeLessThan(on.lines[0]!.baseline);
		expect(off.lines[0]!.baseline).toBeLessThan(middle + 3);
		expect(off.lines[1]!.baseline).toBeGreaterThan(middle - 3);
		// Small templates keep both lines once the picture is gone.
		expect(ear(40, false).lines.map((l) => l.kind)).toEqual(['name', 'address']);
	});

	it('shrinks a long name to the width of the ear, not the address with it', () => {
		const long = 'Et meget, meget langt navn på et julehjerte som jeg selv har tegnet i editoren';
		const layout = ear(80, true, long);
		const [name, address] = layout.lines;
		expect(name!.sizePt).toBeLessThan(NAME_PT);
		expect(address!.sizePt).toBe(ADDRESS_PT);
		expectClean(layout, 80);
	});

	it('uses the measure it is given', () => {
		// A measure twice as wide as the estimate: the name has to shrink.
		const wide = layoutEar({
			widthMm: 80,
			heightMm: 120,
			earRadiusMm: 40,
			picture: true,
			name: NAME,
			address: ADDRESS,
			measure: (text, pt) => 4 * estimateTextWidth(text, pt)
		});
		expect(wide.lines[0]!.sizePt).toBeLessThan(NAME_PT);
	});
});
