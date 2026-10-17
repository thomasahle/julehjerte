/**
 * The printer PDF's page planning — docs/redesign/DOWNLOAD.md. The classic
 * heart's folded template at 80 mm is 80 × 120 mm, and that is its whole box:
 * the name and address are printed inside its rounded end (round 2), not in a
 * header above it. Two across A4 (5 + 80 + 5 + 80 ≤ 205) and two down
 * (5 + 120 + 5 + 120 ≤ 287, the page less its 5 mm margin and footer).
 */
import { describe, expect, it } from 'vitest';
import { SHEETS, type SheetSize } from '$lib/laser/sheet';
import { loadHeart } from '$lib/laser/testHearts';
import { planTemplatePages, templateLabel, templatePair, templatePieces, type TemplatePagePlan } from './plan';
import { serializeTemplatePageSvg } from './preview';

const classic = loadHeart('classic-3x3');

function plan(hearts: number, sheet: SheetSize, widthMm = 80) {
	const pieces = templatePieces([classic], widthMm, hearts);
	return { pieces, plan: planTemplatePages(pieces, { sheet }) };
}

/** Every box on every page inside the margins, clear of the footer, and apart from the others. */
function expectClean({ plan: p, pieces }: { plan: TemplatePagePlan; pieces: { widthMm: number; heightMm: number }[] }) {
	const seen = new Set<number>();
	for (const page of p.pages) {
		const boxes = page.map(({ index, x, y }) => {
			expect(seen.has(index)).toBe(false);
			seen.add(index);
			return { x, y, w: pieces[index]!.widthMm, h: pieces[index]!.heightMm };
		});
		for (const b of boxes) {
			expect(b.x).toBeGreaterThanOrEqual(5);
			expect(b.y).toBeGreaterThanOrEqual(5);
			expect(b.x + b.w).toBeLessThanOrEqual(p.sheet.widthMm - 5 + 1e-9);
			expect(b.y + b.h).toBeLessThanOrEqual(p.sheet.heightMm - 10 + 1e-9);
		}
		for (const [i, a] of boxes.entries()) {
			for (const b of boxes.slice(i + 1)) {
				const apart = a.x + a.w + 5 <= b.x + 1e-9 || b.x + b.w + 5 <= a.x + 1e-9 ||
					a.y + a.h + 5 <= b.y + 1e-9 || b.y + b.h + 5 <= a.y + 1e-9;
				expect(apart).toBe(true);
			}
		}
	}
	// Every piece once, in order.
	expect([...seen].sort((a, b) => a - b)).toEqual(pieces.map((_, i) => i));
}

describe('templatePair', () => {
	it('gives the classic heart one template twice, 80 × 120 mm', () => {
		const [left, right] = templatePair(classic, 80);
		expect(left).toBe(right);
		expect(left.shared).toBe(true);
		expect(left.widthMm).toBeCloseTo(80);
		expect(left.heightMm).toBeCloseTo(120);
		expect(left.stripWidthMm).toBeCloseTo(80 / 3);
		expect(templateLabel(left, 'da')).toBe(classic.name);
	});

	it('gives an asymmetric heart its left and its right template, at one scale', () => {
		const jul = loadHeart('jul');
		const [left, right] = templatePair(jul, 60);
		expect([left.lobe, right.lobe]).toEqual(['left', 'right']);
		expect(left.scale).toBe(right.scale);
		expect(Math.max(left.widthMm, right.widthMm)).toBeCloseTo(60);
		expect(templateLabel(left, 'da')).toBe(`${jul.name} (Venstre)`);
		expect(templateLabel(right, 'en')).toBe(`${jul.name} (Right)`);
	});
});

describe('planTemplatePages', () => {
	it('puts one heart (two templates) on one A4 page', () => {
		const p = plan(1, SHEETS.A4);
		expect(p.pieces).toHaveLength(2);
		expect(p.plan.fits).toBe(true);
		expect(p.plan.pages.map((page) => page.length)).toEqual([2]);
		expect(p.plan.pages[0]!.map(({ x, y }) => [x, y])).toEqual([
			[5, 5],
			[90, 5]
		]);
		expectClean(p);
	});

	it('takes four templates an A4 page at 80 mm: three hearts need two pages', () => {
		const p = plan(3, SHEETS.A4);
		expect(p.plan.pages.map((page) => page.length)).toEqual([4, 2]);
		expectClean(p);
	});

	it('runs twelve hearts onto six A4 pages', () => {
		const p = plan(12, SHEETS.A4);
		expect(p.plan.pages).toHaveLength(6);
		expect(p.plan.pages.every((page) => page.length === 4)).toBe(true);
		expectClean(p);
	});

	it('fits nine templates on A3, three by three', () => {
		const p = plan(12, SHEETS.A3);
		expect(p.plan.pages.map((page) => page.length)).toEqual([9, 9, 6]);
		expectClean(p);
		expect(plan(1, SHEETS.A3).plan.pages).toHaveLength(1);
	});

	it('fits six 60 mm templates on A4: three hearts on one page', () => {
		const p = plan(3, SHEETS.A4, 60);
		expect(p.plan.pages.map((page) => page.length)).toEqual([6]);
		expectClean(p);
	});

	it('packs nine 60 mm templates on A4 now that there is no header above them', () => {
		// 60 × 90 mm: three down is 5 + 90 + 5 + 90 + 5 + 90 = 285 ≤ 287. With the
		// old 9 mm header (99 mm boxes) only two rows fitted, six to a page.
		const p = plan(5, SHEETS.A4, 60);
		expect(p.plan.pages.map((page) => page.length)).toEqual([9, 1]);
		expect(p.plan.pages[0]!.map(({ y }) => y)).toEqual([5, 5, 5, 100, 100, 100, 195, 195, 195]);
		expectClean(p);
	});

	it('uses one page per template on a small custom sheet', () => {
		const small = { widthMm: 100, heightMm: 150 };
		const p = plan(2, small);
		expect(p.plan.pages.map((page) => page.length)).toEqual([1, 1, 1, 1]);
		expectClean(p);
	});

	it('has no pages when a template is bigger than an empty page', () => {
		const p = plan(1, SHEETS.A4, 200);
		expect(p.plan.fits).toBe(false);
		expect(p.plan.pages).toEqual([]);
	});
});

describe('serializeTemplatePageSvg', () => {
	const { pieces, plan: p } = plan(3, SHEETS.A4);
	const svg = (page: number, options: { previewImage?: boolean; images?: Map<string, string> } = {}) =>
		new DOMParser().parseFromString(
			serializeTemplatePageSvg(p, pieces, {
				page,
				lang: 'da',
				previewImage: options.previewImage ?? true,
				images: options.images,
				title: 'Klassisk'
			}),
			'image/svg+xml'
		);
	const picture = 'data:image/png;base64,iVBORw0KGgo=';

	it('draws the page asked for, a template group per placement', () => {
		expect(svg(0).documentElement.getAttribute('viewBox')).toBe('0 0 210 297');
		expect(svg(0).querySelectorAll('g.cut')).toHaveLength(4);
		expect(svg(1).querySelectorAll('g.cut')).toHaveLength(2);
		expect(svg(0).querySelectorAll('g.fold')).toHaveLength(4);
		expect(svg(0).querySelector('text.address')!.textContent).toBe('juleflet.dk/hjerte/classic-3x3');
	});

	it('shows the rendered picture once per design, placed in every ear, and no box while it renders', () => {
		const doc = svg(0, { images: new Map([[classic.id, picture]]) });
		const images = doc.querySelectorAll('image');
		expect(images).toHaveLength(1);
		expect(images[0]!.getAttribute('href')).toBe(picture);
		const uses = [...doc.querySelectorAll('use.picture')];
		expect(uses).toHaveLength(4);
		// The first template at (5, 5): the picture is centred across it, inside the ear.
		const first = uses[0]!;
		const size = Number(first.getAttribute('width'));
		expect(Number(first.getAttribute('x')) + size / 2).toBeCloseTo(45);
		expect(Number(first.getAttribute('y'))).toBeGreaterThan(5);
		expect(Number(first.getAttribute('y')) + size).toBeLessThan(5 + 40);
		// Not rendered yet, or turned off: nothing where it goes.
		for (const doc of [svg(0), svg(0, { previewImage: false, images: new Map([[classic.id, picture]]) })]) {
			expect(doc.querySelectorAll('image, use, rect.thumb')).toHaveLength(0);
			expect(doc.querySelectorAll('rect')).toHaveLength(1);
		}
	});

	it('prints the name and address inside the ear, under the picture and above the first cut', () => {
		const doc = svg(0, { images: new Map([[classic.id, picture]]) });
		const pictureFoot = Number(doc.querySelector('use')!.getAttribute('y')) + Number(doc.querySelector('use')!.getAttribute('width'));
		const [name, address] = [...doc.querySelectorAll('text')].slice(0, 2);
		expect(name!.textContent).toBe(classic.name);
		expect(address!.getAttribute('class')).toBe('address');
		const nameY = Number(name!.getAttribute('y'));
		const addressY = Number(address!.getAttribute('y'));
		expect(nameY).toBeGreaterThan(pictureFoot);
		expect(addressY).toBeGreaterThan(nameY);
		// The ear base, where the cuts begin, is R = 40 mm under the template's top at y = 5.
		expect(addressY).toBeLessThan(45);
		// At 80 mm there is room for the full 8 pt and 6 pt.
		expect(Number(name!.getAttribute('font-size'))).toBeCloseTo((8 * 25.4) / 72, 2);
		expect(Number(address!.getAttribute('font-size'))).toBeCloseTo((6 * 25.4) / 72, 2);
		// Nothing above the template any more.
		expect(Math.min(...[...doc.querySelectorAll('text')].map((t) => Number(t.getAttribute('y'))))).toBeGreaterThan(5);
	});
});
