/**
 * The dialog's PDF draws the plan and the ear layout it shares with the
 * preview: each template's name and address inside its rounded end, under the
 * picture, and nothing above the template (DOWNLOAD.md, round 2). Read from
 * the uncompressed page stream jsPDF writes: text as `x y Td (…) Tj`, a
 * picture as `w 0 0 h x y cm /I… Do`, in points from the page's bottom left.
 */
import { describe, expect, it, vi } from 'vitest';
import { jsPDF } from 'jspdf';
import { SHEETS } from '$lib/laser/sheet';
import { loadHeart } from '$lib/laser/testHearts';
import { generateTemplatesPDF } from './template';
import { planTemplatePages, templatePieces } from './plan';

// A real 1 × 1 PNG: jsPDF reads its header.
const PICTURE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
vi.mock('./heartRenderer', () => ({
	prerenderHeartImages: vi.fn(async (designs: { id: string }[]) => new Map(designs.map((d) => [d.id, PICTURE])))
}));

const PT = 72 / 25.4;

/** The page's texts and pictures, in mm from the top left. */
function readPage(pdf: jsPDF, sheetHeightMm: number) {
	const stream = pdf.output();
	const texts = [...stream.matchAll(/([\d.]+) ([\d.]+) Td\s*\((.*?)\) Tj/g)].map((m) => ({
		text: m[3]!,
		x: Number(m[1]) / PT,
		y: sheetHeightMm - Number(m[2]) / PT
	}));
	const images = [...stream.matchAll(/([\d.]+) 0 0 ([\d.]+) ([\d.]+) ([\d.]+) cm\s*\/I\S* Do/g)].map((m) => ({
		size: Number(m[1]) / PT,
		x: Number(m[3]) / PT,
		y: sheetHeightMm - (Number(m[4]) + Number(m[2])) / PT
	}));
	return { texts, images };
}

describe('generateTemplatesPDF', () => {
	const classic = loadHeart('classic-3x3');
	const pieces = templatePieces([classic], 80, 1);
	const [page] = planTemplatePages(pieces, { sheet: SHEETS.A4 }).pages;

	it('prints each name and address inside its template, under the picture', async () => {
		const pdf = await generateTemplatesPDF([classic], { widthMm: 80, hearts: 1, sheet: SHEETS.A4, lang: 'da' });
		expect(pdf.getNumberOfPages()).toBe(1);
		const { texts, images } = readPage(pdf, 297);
		expect(images).toHaveLength(2);
		for (const [i, { x, y }] of page!.entries()) {
			const piece = pieces[i]!;
			const inside = texts.filter((t) => t.y > y && t.y < y + piece.earRadiusMm && t.x >= x && t.x <= x + piece.widthMm);
			expect(inside.map((t) => t.text)).toEqual([classic.name, 'juleflet.dk/hjerte/classic-3x3']);
			const picture = images.find((im) => im.x >= x && im.x <= x + piece.widthMm)!;
			expect(picture.y).toBeGreaterThan(y);
			expect(inside[0]!.y).toBeGreaterThan(picture.y + picture.size);
		}
		// Two templates' two lines, and the footer: nothing above a template.
		expect(texts).toHaveLength(5);
		expect(texts.filter((t) => t.y < 5)).toHaveLength(0);
	});

	it('moves the lines up when the picture is off', async () => {
		const pdf = await generateTemplatesPDF([classic], { widthMm: 80, hearts: 1, sheet: SHEETS.A4, previewImage: false });
		const { texts, images } = readPage(pdf, 297);
		expect(images).toHaveLength(0);
		// The name about where the picture's middle was, 17 mm under the template's top at y = 5.
		const name = texts.find((t) => t.text === classic.name)!;
		expect(name.y).toBeGreaterThan(5 + 10);
		expect(name.y).toBeLessThan(5 + 25);
	});
});
