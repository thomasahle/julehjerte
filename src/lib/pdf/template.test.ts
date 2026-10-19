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
import { loadHeart } from '$lib/laser/testHearts.test-helpers';
import { laserFileName } from '$lib/laser/export';
import { getGalleryDesign } from '$lib/data/heartDesigns';
import { generateTemplatesPDF, templatesFilename } from './template';
import { planTemplatePages, templatePieces } from './plan';
import { markStrokes } from '$lib/utils/orientationMarks';

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
			// The heart's name in the PDF's language (`heartName`), not the SVG's own.
			expect(above.map((t) => t.text)).toEqual(['Klassisk 3×3']);
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

	it('prints the English page in an English PDF, as the English laser file links to', async () => {
		const pdf = await generateTemplatesPDF([classic], { widthMm: 80, hearts: 1, sheet: SHEETS.A4, lang: 'en' });
		const { texts } = readPage(pdf, 297);
		expect(texts.filter((t) => t.text === 'juleflet.dk/en/hjerte/classic-3x3')).toHaveLength(2);
		expect(texts.some((t) => t.text === 'juleflet.dk/hjerte/classic-3x3')).toBe(false);
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

describe('orientation marks in the PDF', () => {
	/** Every straight stroke `x y m x y l` of the page, in mm from the top left; and every subpath start. */
	function strokes(pdf: jsPDF, sheetHeightMm: number) {
		const stream = pdf.output();
		const pt = (x: string, y: string) => ({ x: Number(x) / PT, y: sheetHeightMm - Number(y) / PT });
		const lines = [...stream.matchAll(/([\d.]+) ([\d.]+) m\s+([\d.]+) ([\d.]+) l/g)].map((m) => [
			pt(m[1]!, m[2]!),
			pt(m[3]!, m[4]!)
		]);
		const starts = [...stream.matchAll(/([\d.]+) ([\d.]+) m/g)].map((m) => pt(m[1]!, m[2]!));
		// The marks' 0.2 mm pen: nothing else on the page uses it.
		const markPens = (stream.match(/0\.566929\d* w/g) ?? []).length;
		return { lines, starts, markPens };
	}
	const near = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y) < 0.01;

	it('prints ⊗ on the left half and × on the right half of Jul, where the plan puts them', async () => {
		const jul = loadHeart('jul');
		const pdf = await generateTemplatesPDF([jul], { widthMm: 80, hearts: 1, sheet: SHEETS.A4, previewImage: false });
		const pieces = templatePieces([jul], 80, 1);
		const [placements] = planTemplatePages(pieces, { sheet: SHEETS.A4 }).pages;
		const { lines, starts, markPens } = strokes(pdf, 297);
		expect(markPens).toBe(2);
		for (const { index, x, y } of placements!) {
			const piece = pieces[index]!;
			expect(piece.marks).toHaveLength(1);
			const mark = piece.marks[0]!;
			expect(mark.kind).toBe(piece.lobe === 'left' ? 'circled' : 'plain');
			const at = (p: { x: number; y: number }) => ({ x: x + p.x * piece.scale, y: y + 9 + p.y * piece.scale });
			for (const [a, b] of markStrokes(mark)) {
				expect(lines.some(([p, q]) => near(p!, at(a)) && near(q!, at(b)))).toBe(true);
			}
			// jsPDF starts a circle at its rightmost point.
			const circleStart = at({ x: mark.x + mark.r, y: mark.y });
			expect(starts.some((p) => near(p, circleStart))).toBe(mark.kind === 'circled');
			// On the piece: inside the outline, below the ear base, by the left side.
			const c = at(mark);
			expect(c.x - x).toBeGreaterThan(1.5);
			expect(c.x - x).toBeLessThan(piece.widthMm / 4);
			expect(c.y - (y + 9)).toBeGreaterThan(piece.earRadiusMm);
		}
	});

	it('prints no mark for the classic heart', async () => {
		const pdf = await generateTemplatesPDF([loadHeart('classic-3x3')], { widthMm: 80, hearts: 1, sheet: SHEETS.A4 });
		expect(strokes(pdf, 297).markPens).toBe(0);
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

	it('names one heart by the stem it is given, when it is given one', () => {
		const classic = loadHeart('classic-3x3');
		const jul = loadHeart('jul');
		expect(templatesFilename([classic], 80, 'da', 'mit-hjerte')).toBe('mit-hjerte-80mm.pdf');
		// Several hearts are still named by their count.
		expect(templatesFilename([classic, jul], 80, 'da', 'mit-hjerte')).toBe('julehjerter-2-skabeloner.pdf');
	});
});
