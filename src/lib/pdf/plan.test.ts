/**
 * The printer PDF's page planning — docs/redesign/DOWNLOAD.md. The classic
 * heart's folded template at 80 mm is 80 × 120 mm, so with its 9 mm header a
 * box of 80 × 129: two across A4 (5 + 80 + 5 + 80 ≤ 205) and two down
 * (5 + 129 + 5 + 129 ≤ 287, the page less its 5 mm margin and footer).
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
			return { x, y, w: pieces[index]!.widthMm, h: pieces[index]!.heightMm + 9 };
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
	it('draws the page asked for, a template group per placement', () => {
		const { pieces, plan: p } = plan(3, SHEETS.A4);
		const svg = (page: number, previewImage = true) =>
			new DOMParser().parseFromString(
				serializeTemplatePageSvg(p, pieces, { page, lang: 'da', previewImage, title: 'Klassisk' }),
				'image/svg+xml'
			);
		expect(svg(0).documentElement.getAttribute('viewBox')).toBe('0 0 210 297');
		expect(svg(0).querySelectorAll('g.cut')).toHaveLength(4);
		expect(svg(1).querySelectorAll('g.cut')).toHaveLength(2);
		expect(svg(0).querySelectorAll('rect.thumb')).toHaveLength(4);
		expect(svg(0, false).querySelectorAll('rect.thumb')).toHaveLength(0);
		expect(svg(0).querySelector('text.address')!.textContent).toBe('juleflet.dk/hjerte/classic-3x3');
	});
});
