/**
 * The dialog's PDF draws the plan and the ear layout it shares with the
 * preview: each template's name in the header above it, on the paper, and its
 * address inside its rounded end, under the picture (DOWNLOAD.md). Read from
 * the uncompressed page stream jsPDF writes: text as `x y Td (…) Tj`, a
 * picture as `w 0 0 h x y cm /I… Do`, in points from the page's bottom left.
 */
import { describe, expect, it, vi } from 'vitest';
import { jsPDF } from 'jspdf';
import { SHEETS } from '$lib/laser/sheet';
import { loadHeart } from '$lib/laser/testHearts';
import { laserFileName } from '$lib/laser/export';
import { getGalleryDesign } from '$lib/data/heartDesigns';
import { generateTemplatesPDF, templatesFilename } from './template';
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
		text: m[3]!.replace(/\\([()\\])/g, '$1'),
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

	it('prints each name above its template and its address inside it, under the picture', async () => {
		const pdf = await generateTemplatesPDF([classic], { widthMm: 80, hearts: 1, sheet: SHEETS.A4, lang: 'da' });
		expect(pdf.getNumberOfPages()).toBe(1);
		const { texts, images } = readPage(pdf, 297);
		expect(images).toHaveLength(2);
		for (const [i, { x, y }] of page!.entries()) {
			const piece = pieces[i]!;
			// The ear's top is 9 mm under the box's.
			const top = y + 9;
			const within = (t: { x: number }) => t.x >= x && t.x <= x + piece.widthMm;
			const above = texts.filter((t) => within(t) && t.y > y && t.y < top);
			expect(above.map((t) => t.text)).toEqual([classic.name]);
			expect(above[0]!.y).toBeCloseTo(y + 4);
			const inside = texts.filter((t) => within(t) && t.y > top && t.y < top + piece.earRadiusMm);
			expect(inside.map((t) => t.text)).toEqual(['juleflet.dk/hjerte/classic-3x3']);
			const picture = images.find((im) => im.x >= x && im.x <= x + piece.widthMm)!;
			expect(picture.y).toBeGreaterThan(top);
			expect(inside[0]!.y).toBeGreaterThan(picture.y + picture.size);
		}
		// Two names, two addresses and the footer.
		expect(texts).toHaveLength(5);
	});

	it('moves the address up when the picture is off', async () => {
		const pdf = await generateTemplatesPDF([classic], { widthMm: 80, hearts: 1, sheet: SHEETS.A4, previewImage: false });
		const { texts, images } = readPage(pdf, 297);
		expect(images).toHaveLength(0);
		// The address about where the picture's middle was, 17 mm under the ear's top at y = 5 + 9.
		const address = texts.find((t) => t.text === 'juleflet.dk/hjerte/classic-3x3')!;
		expect(address.y).toBeGreaterThan(14 + 10);
		expect(address.y).toBeLessThan(14 + 25);
	});

	it('names each half of an asymmetric heart above it, and prints the bare address in both', async () => {
		const jul = loadHeart('jul');
		const pdf = await generateTemplatesPDF([jul], { widthMm: 80, hearts: 1, sheet: SHEETS.A4, lang: 'da' });
		const { texts } = readPage(pdf, 297);
		expect(texts).toHaveLength(5);
		const labels = texts.filter((t) => t.text.startsWith(jul.name));
		expect(labels.map((t) => t.text)).toEqual([`${jul.name} (Venstre)`, expect.stringMatching(/\(H.+jre\)$/)]);
		expect(texts.filter((t) => t.text === 'juleflet.dk/hjerte/jul')).toHaveLength(2);
	});
});

describe('templatesFilename', () => {
	it('names one heart and its width, several by their count', () => {
		const classic = loadHeart('classic-3x3');
		const jul = loadHeart('jul');
		expect(templatesFilename([classic], 80)).toBe('classic-3x3-80mm.pdf');
		expect(templatesFilename([classic, jul], 80)).toBe('julehjerter-2-skabeloner.pdf');
		expect(templatesFilename([classic, jul, jul], 60, 'en')).toBe('christmas-hearts-3-templates.pdf');
	});

	it('names one heart by its id, as the laser files are, not by its display name', () => {
		const circle = getGalleryDesign('circle')!;
		expect(circle.name).not.toBe(circle.id);
		expect(templatesFilename([circle], 60)).toBe('circle-60mm.pdf');
		expect(templatesFilename([circle], 60, 'en')).toBe('circle-60mm.pdf');
		expect(laserFileName(circle.id, 60, 'svg')).toBe('circle-laser-60mm.svg');
		expect(templatesFilename([{ ...circle, id: 'mit hjerte/2' }], 60)).toBe('mit-hjerte-2-60mm.pdf');
	});
});
