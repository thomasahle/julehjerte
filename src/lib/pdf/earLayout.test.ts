/**
 * The picture and address inside a folded template's rounded end —
 * docs/redesign/DOWNLOAD.md, round 2. The ear of a template W wide is a half
 * circle of radius R = W / 2 whose base, where every strip cut starts, is
 * R below its top; nothing may cross that line or the curve.
 */
import { describe, expect, it } from 'vitest';
import { jsPDF } from 'jspdf';
import { ALL_HEART_IDS } from '$lib/data/categories';
import { MIN_WIDTH_MM } from '$lib/laser/export';
import { loadHeart } from '$lib/laser/testHearts.test-helpers';
import { ADDRESS_PT, MIN_TEXT_PT, PT_MM, estimateTextWidth, layoutEar, type EarLayout, type MeasureText } from './earLayout';
import { templateEar, templatePair } from './plan';

const ADDRESS = 'juleflet.dk/hjerte/classic-3x3';

/** The classic heart's folded template: 1.5 times as tall as wide. */
function ear(widthMm: number, picture = true, address = ADDRESS) {
	return layoutEar({ widthMm, heightMm: widthMm * 1.5, earRadiusMm: widthMm / 2, picture, address });
}

/** Inside the half circle of radius r centred on (r, r), at or above its base. */
function insideEar(r: number, x: number, y: number): boolean {
	return y <= r + 1e-9 && Math.hypot(x - r, y - r) <= r + 1e-9;
}

/** Everything clear of the curve and the ear base, the address under the picture, at 5 pt or more. */
function expectClean(layout: EarLayout, r: number, measure: MeasureText = estimateTextWidth) {
	const p = layout.picture;
	if (p) {
		for (const [x, y] of [[p.x, p.y], [p.x + p.size, p.y], [p.x, p.y + p.size], [p.x + p.size, p.y + p.size]]) {
			expect(insideEar(r, x!, y!)).toBe(true);
		}
	}
	const line = layout.address!;
	const sizeMm = line.sizePt * PT_MM;
	const top = line.baseline - 0.75 * sizeMm;
	expect(top).toBeGreaterThan(p ? p.y + p.size : 0);
	expect(line.baseline + 0.23 * sizeMm).toBeLessThan(r);
	expect(line.sizePt).toBeGreaterThanOrEqual(MIN_TEXT_PT);
	expect(line.sizePt).toBeLessThanOrEqual(ADDRESS_PT);
	// The line's two ends lie inside the curve at its top, the tightest place.
	const half = measure(line.text, line.sizePt) / 2;
	expect(insideEar(r, line.x - half, top)).toBe(true);
	expect(insideEar(r, line.x + half, top)).toBe(true);
	expect(line.x).toBeCloseTo(r);
}

describe('layoutEar', () => {
	it('prints the address at 6 pt under the picture at the default 80 mm, and nothing else', () => {
		const layout = ear(80);
		expect(Object.keys(layout).sort()).toEqual(['address', 'picture']);
		expect([layout.address!.text, layout.address!.sizePt]).toEqual([ADDRESS, ADDRESS_PT]);
		// The picture the PDF has always printed: 35 % of the width, centred.
		expect(layout.picture!.size).toBeCloseTo(28);
		expect(layout.picture!.x + 14).toBeCloseTo(40);
		expectClean(layout, 40);
	});

	it.each([40, 45, 50, 60, 70, 80, 100, 150, 200])('keeps everything inside the ear at %i mm', (width) => {
		expectClean(ear(width), width / 2);
		expectClean(ear(width, false), width / 2);
	});

	it('shrinks the address to the band under the picture, never under 5 pt', () => {
		// At 34 mm (the narrower half of an asymmetric heart can be this small)
		// the band under the full-size picture holds more than 5 pt, less than 6.
		const layout = ear(34);
		expect(layout.address!.sizePt).toBeLessThan(ADDRESS_PT);
		expect(layout.address!.sizePt).toBeGreaterThan(MIN_TEXT_PT);
		expect(layout.picture!.size).toBeCloseTo(34 * 0.35);
		expectClean(layout, 17);
	});

	it('shrinks the picture when even 5 pt would not fit under it', () => {
		const layout = ear(30);
		expect(layout.address!.sizePt).toBeCloseTo(MIN_TEXT_PT);
		expect(layout.picture!.size).toBeLessThan(30 * 0.35);
		expect(layout.picture!.size).toBeGreaterThan(8);
		expectClean(layout, 15);
	});

	it('keeps the full 6 pt at 40, 60 and 80 mm', () => {
		for (const width of [40, 60, 80]) expect(ear(width).address!.sizePt).toBe(ADDRESS_PT);
	});

	it('puts the address where the picture was when it is turned off', () => {
		const on = ear(80);
		const off = ear(80, false);
		expect(off.picture).toBeNull();
		expect(off.address!.sizePt).toBe(ADDRESS_PT);
		expect(off.address!.text).toBe(ADDRESS);
		const middle = on.picture!.y + on.picture!.size / 2;
		expect(off.address!.baseline).toBeLessThan(on.address!.baseline);
		expect(Math.abs(off.address!.baseline - middle)).toBeLessThan(1.5);
		// Higher in the ear the curve is tighter: at 40 mm the address is a little
		// smaller there than under the picture.
		expect(ear(40, false).address!.sizePt).toBeLessThan(ADDRESS_PT);
		expect(ear(40, false).address!.sizePt).toBeGreaterThan(MIN_TEXT_PT);
	});

	it('has no line when there is no address', () => {
		expect(ear(80, true, '').address).toBeNull();
	});

	it('shrinks the address to the width of the ear, as the measure it is given has it', () => {
		const measured = (factor: number) =>
			layoutEar({
				widthMm: 80,
				heightMm: 120,
				earRadiusMm: 40,
				picture: true,
				address: ADDRESS,
				measure: (text, pt) => factor * estimateTextWidth(text, pt)
			}).address!.sizePt;
		expect(measured(1)).toBe(ADDRESS_PT);
		expect(measured(2.7)).toBeLessThan(ADDRESS_PT);
		expect(measured(2.7)).toBeGreaterThan(MIN_TEXT_PT);
		// Never under 5 pt, however wide.
		expect(measured(10)).toBe(MIN_TEXT_PT);
	});

	it("fits every gallery heart's address at the smallest width, by jsPDF's widths", () => {
		const pdf = new jsPDF({ unit: 'mm' });
		const measure = (text: string, pt: number) => (pdf.getStringUnitWidth(text) * pt) / pdf.internal.scaleFactor;
		for (const id of ALL_HEART_IDS) {
			for (const piece of templatePair(loadHeart(id), MIN_WIDTH_MM)) {
				for (const picture of [true, false]) {
					// The English address is three characters longer: juleflet.dk/en/hjerte/<id>.
					for (const lang of ['da', 'en'] as const) {
						const layout = templateEar(piece, { picture, measure, lang });
						expect(layout.address!.text).toBe(`juleflet.dk${lang === 'en' ? '/en' : ''}/hjerte/${id}`);
						expectClean(layout, piece.earRadiusMm, measure);
					}
				}
			}
		}
	});
});
