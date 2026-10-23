/**
 * The printer PDF's page planning — docs/redesign/DOWNLOAD.md. The classic
 * heart's folded template at 80 mm is 80 × 120 mm; its address is printed
 * inside its rounded end, its name in a 9 mm header above it, so its box is
 * 80 × 129: two across A4 (5 + 80 + 5 + 80 ≤ 205) and two down
 * (5 + 129 + 5 + 129 ≤ 287, the page less its 5 mm margin and footer).
 */
import { describe, expect, it } from 'vitest';
import { SHEETS, type SheetSize } from '$lib/laser/sheet';
import { loadHeart } from '$lib/laser/testHearts.test-helpers';
import { planTemplatePages, templateLabel, templatePair, templatePieces, type TemplatePagePlan } from './plan';
import { serializeTemplatePageSvg } from './preview';

const classic = loadHeart('classic-3x3');

/** `hearts` hearts of two templates each, as a heart whose halves differ
 * prints them: the classic's, 80 × 120 mm at 80 mm. */
function plan(hearts: number, sheet: SheetSize, widthMm = 80) {
	const pieces = Array.from({ length: hearts }, () => templatePair(classic, widthMm)).flat();
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

describe('templatePieces', () => {
	it('prints a template both halves share once, where its two copies would be the same', () => {
		// The classic: both pieces cut from one template, which has no marks.
		expect(templatePieces([classic], 80, 1)).toEqual([templatePair(classic, 80)[0]]);
		expect(templatePieces([classic], 80, 3)).toHaveLength(3);
		// The angel's two copies carry ⊗ and × (orientation marks): both are printed.
		const angel = loadHeart('angel'), [left, right] = templatePair(angel, 80);
		expect(left.shared).toBe(true);
		expect(left.marks.map((m) => m.kind)).toEqual(['circled']);
		expect(templatePieces([angel], 80, 1)).toEqual([left, right]);
	});
});

describe('templatePair', () => {
	it('gives the classic heart one template twice, 80 × 120 mm', () => {
		const [left, right] = templatePair(classic, 80);
		expect(left).toEqual(right);
		expect(left.lobe).toBe('right');
		// A symmetric heart: no orientation marks, so its sheet is as it was.
		expect(left.marks).toEqual([]);
		expect(left.shared).toBe(true);
		expect(left.widthMm).toBeCloseTo(80);
		expect(left.heightMm).toBeCloseTo(120);
		expect(left.stripWidthMm).toBeCloseTo(80 / 3);
		// The name in the PDF's language: the SVG's <title xml:lang>, not its plain <title>.
		expect(classic.name).toBe('Classic 3x3');
		expect(templateLabel(left, 'da')).toBe('Klassisk 3×3');
		expect(templateLabel(left, 'en')).toBe('Classic 3×3');
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

	it('marks Jul\'s left template ⊗ and its right ×, by the left side below the ear base', () => {
		const [left, right] = templatePair(loadHeart('jul'), 60);
		expect(left.marks.map((m) => m.kind)).toEqual(['circled']);
		expect(right.marks.map((m) => m.kind)).toEqual(['plain']);
		for (const piece of [left, right]) {
			const [mark] = piece.marks;
			expect(mark!.x * piece.scale).toBeLessThan(piece.widthMm / 4);
			expect(mark!.y * piece.scale).toBeGreaterThan(piece.earRadiusMm);
		}
	});

	it('prints Kroge\'s one template twice, the left copy with ⊗ on the other side (it goes in turned over)', () => {
		const [left, right] = templatePair(loadHeart('permo-kroge'), 80);
		expect(left.lobe).toBe(right.lobe);
		expect(left.marks.map((m) => m.kind)).toEqual(['circled']);
		expect(right.marks.map((m) => m.kind)).toEqual(['plain']);
		expect(left.marks[0]!.x * left.scale).toBeGreaterThan((3 * left.widthMm) / 4);
		expect(right.marks[0]!.x * right.scale).toBeLessThan(right.widthMm / 4);
	});

	it("labels a template with the heart's name in each language, and its own name without one", () => {
		const weave = loadHeart('amy-weave-1');
		const [left, right] = templatePair(weave, 60);
		expect(templateLabel(left, 'da')).toBe('Flet 1 (Venstre)');
		expect(templateLabel(right, 'en')).toBe('Weave 1 (Right)');
		const plain = { ...weave, names: undefined };
		expect(templateLabel({ ...left, design: plain }, 'da')).toBe('Weave 1 (Venstre)');
		expect(templateLabel({ ...left, design: { ...plain, names: { en: 'Woven' } } }, 'da')).toBe('Weave 1 (Venstre)');
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

	it('packs six 60 mm templates on A4, with the header above each', () => {
		// 60 × 90 mm plus the 9 mm header: two rows of 99 mm (5 + 99 + 5 + 99 ≤ 287),
		// a third would need 5 + 3 × 99 + 2 × 5 = 312.
		const p = plan(5, SHEETS.A4, 60);
		expect(p.plan.pages.map((page) => page.length)).toEqual([6, 4]);
		expect(p.plan.pages[0]!.map(({ y }) => y)).toEqual([5, 5, 5, 109, 109, 109]);
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
		// The first box at (5, 5), its template 9 mm lower: the picture is centred
		// across it, inside the ear.
		const first = uses[0]!;
		const size = Number(first.getAttribute('width'));
		expect(Number(first.getAttribute('x')) + size / 2).toBeCloseTo(45);
		expect(Number(first.getAttribute('y'))).toBeGreaterThan(14);
		expect(Number(first.getAttribute('y')) + size).toBeLessThan(14 + 40);
		// Not rendered yet, or turned off: nothing where it goes.
		for (const doc of [svg(0), svg(0, { previewImage: false, images: new Map([[classic.id, picture]]) })]) {
			expect(doc.querySelectorAll('image, use, rect.thumb')).toHaveLength(0);
			expect(doc.querySelectorAll('rect')).toHaveLength(1);
		}
	});

	it('prints the name above each template and only the address inside its ear', () => {
		const doc = svg(0, { images: new Map([[classic.id, picture]]) });
		const pictureFoot = Number(doc.querySelector('use')!.getAttribute('y')) + Number(doc.querySelector('use')!.getAttribute('width'));
		const labels = [...doc.querySelectorAll('text.label')];
		const addresses = [...doc.querySelectorAll('text.address')];
		// The page's four templates: a name and an address each, and the footer.
		expect(labels.map((t) => t.textContent)).toEqual(Array(4).fill('Klassisk 3×3'));
		expect(addresses.map((t) => t.textContent)).toEqual([...Array(4).fill('juleflet.dk/hjerte/classic-3x3'), 'juleflet.dk']);
		// The first box at (5, 5): the name 4 mm down, at 8 pt, centred over the
		// ear and clear of its top at 5 + 9 = 14.
		const name = labels[0]!;
		expect(Number(name.getAttribute('x'))).toBeCloseTo(45);
		expect(Number(name.getAttribute('y'))).toBeCloseTo(9);
		expect(Number(name.getAttribute('font-size'))).toBeCloseTo((8 * 25.4) / 72, 2);
		expect(Number(name.getAttribute('y')) + 0.23 * Number(name.getAttribute('font-size'))).toBeLessThan(14 - 2);
		// The address under the picture, above the ear base 40 mm under the ear's top.
		const addressY = Number(addresses[0]!.getAttribute('y'));
		expect(addressY).toBeGreaterThan(pictureFoot);
		expect(addressY).toBeLessThan(14 + 40);
		expect(Number(addresses[0]!.getAttribute('font-size'))).toBeCloseTo((6 * 25.4) / 72, 2);
	});

	it('draws the orientation marks the PDF prints, and none for the classic heart', () => {
		expect(svg(0).querySelectorAll('g.mark')).toHaveLength(0);
		const jul = loadHeart('jul');
		const pieces = templatePieces([jul], 80, 1);
		const p = planTemplatePages(pieces, { sheet: SHEETS.A4 });
		const doc = new DOMParser().parseFromString(
			serializeTemplatePageSvg(p, pieces, { page: 0, lang: 'da', previewImage: true, title: 'jul' }),
			'image/svg+xml'
		);
		const marks = [...doc.querySelectorAll('g.mark')];
		expect(marks.map((g) => g.getAttribute('data-mark'))).toEqual(['circled', 'plain']);
		// Inside each template's scaled group, so in its own units like its cuts.
		expect(marks.every((g) => g.parentElement!.getAttribute('transform')!.includes('scale('))).toBe(true);
		expect(marks[0]!.querySelector('path')!.getAttribute('d')).toContain(' A ');
		expect(marks[1]!.querySelector('path')!.getAttribute('d')).not.toContain(' A ');
	});

	it('names each half of an asymmetric heart above it, and gives both the bare address', () => {
		const jul = loadHeart('jul');
		const pieces = templatePieces([jul], 80, 1);
		const p = planTemplatePages(pieces, { sheet: SHEETS.A4 });
		const html = serializeTemplatePageSvg(p, pieces, { page: 0, lang: 'da', previewImage: true, title: 'jul' });
		const doc = new DOMParser().parseFromString(html, 'image/svg+xml');
		expect([...doc.querySelectorAll('text.label')].map((t) => t.textContent)).toEqual([
			`${jul.name} (Venstre)`,
			`${jul.name} (Højre)`
		]);
		expect([...doc.querySelectorAll('text.address')].map((t) => t.textContent)).toEqual([
			'juleflet.dk/hjerte/jul',
			'juleflet.dk/hjerte/jul',
			'juleflet.dk'
		]);
	});
});
