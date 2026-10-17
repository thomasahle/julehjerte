import { describe, expect, it } from 'vitest';
import {
	DEFAULT_LASER_SETTINGS,
	laserFileContent,
	laserFileName,
	parseLaserSettings,
	planLaserSheet
} from './export';
import { coord, formatMm } from './format';
import { SHEETS } from './sheet';
import { loadHeart } from './testHearts';
import { getGalleryDesign } from '$lib/data/heartDesigns';
import { templatePair } from '$lib/pdf/plan';
import { SHARED_TEMPLATE_LOBE } from '$lib/utils/symmetry';

describe('planLaserSheet', () => {
	it('cuts a shared-template heart from the piece the PDF prints, whichever lobe is asked for', () => {
		const heart = loadHeart('classic-3x3');
		for (const lobe of ['left', 'right'] as const) {
			const plan = planLaserSheet(heart, { widthMm: 80, count: 2, sheet: SHEETS.A4, lobe });
			expect(plan.shared).toBe(true);
			expect(plan.lobe).toBe(SHARED_TEMPLATE_LOBE);
			expect(plan.pieces.map((p) => p.piece.lobe)).toEqual([SHARED_TEMPLATE_LOBE, SHARED_TEMPLATE_LOBE]);
			expect(plan.piecesFit).toBe(2);
		}
	});

	it('gives a shared heart whose halves differ slightly the width and strips of the PDF template', () => {
		// Stjerne-ramme's two halves share a template but its fingers span 675
		// against 671.4 units, so which half is taken shows at 60 mm.
		const design = getGalleryDesign('stjerne-ramme')!;
		const [printed] = templatePair(design, 60);
		for (const lobe of ['left', 'right'] as const) {
			const plan = planLaserSheet(design, { widthMm: 60, count: 1, sheet: SHEETS.A4, lobe });
			const cut = plan.pieces[0]!.piece;
			expect(cut.lobe).toBe(printed.lobe);
			expect(cut.widthMm).toBeCloseTo(printed.widthMm, 9);
			expect(cut.widthMm).toBeCloseTo(60, 9);
			expect(cut.stripWidthMm).toBeCloseTo(printed.stripWidthMm, 9);
		}
	});

	it('puts one lobe of an asymmetric heart on a sheet: one paper colour', () => {
		const jul = loadHeart('jul');
		const left = planLaserSheet(jul, { widthMm: 60, count: 2, sheet: SHEETS.A4, lobe: 'left' });
		expect(left.shared).toBe(false);
		expect(left.pieces.map((p) => p.piece.lobe)).toEqual(['left', 'left']);
		const right = planLaserSheet(jul, { widthMm: 60, count: 2, sheet: SHEETS.A4, lobe: 'right' });
		expect(right.pieces.map((p) => p.piece.lobe)).toEqual(['right', 'right']);
		// Both halves keep one scale, so their strips still weave.
		expect(right.pair[1].stripWidthMm).toBeCloseTo(left.pair[0].stripWidthMm, 6);
	});

	it('counts the pieces that fit when the sheet runs out', () => {
		// A3 at 80 mm holds three pieces.
		const plan = planLaserSheet(loadHeart('jul'), { widthMm: 80, count: 4, sheet: SHEETS.A3, lobe: 'left' });
		expect(plan.piecesRequested).toBe(4);
		expect(plan.piecesFit).toBe(3);
		expect(plan.pieces).toHaveLength(3);
	});

	it('lays several hearts out heart by heart, the lobe applying to the asymmetric ones (SELECTION.md)', () => {
		const classic = loadHeart('classic-3x3');
		const jul = loadHeart('jul');
		const plan = planLaserSheet([classic, jul], { widthMm: 60, count: 2, sheet: SHEETS.A3, lobe: 'right' });
		expect(plan.hearts.map((h) => [h.design.id, h.shared, h.lobe])).toEqual([
			['classic-3x3', true, SHARED_TEMPLATE_LOBE],
			['jul', false, 'right']
		]);
		expect(plan.shared).toBe(false);
		expect(plan.lobe).toBe('right');
		expect(plan.piecesRequested).toBe(4);
		expect(plan.pieces.map((p) => p.piece)).toEqual([
			plan.hearts[0]!.pair[0],
			plan.hearts[0]!.pair[0],
			plan.hearts[1]!.pair[1],
			plan.hearts[1]!.pair[1]
		]);
	});

	it('needs no lobe when every heart shares its template', () => {
		const plan = planLaserSheet([loadHeart('classic-3x3'), loadHeart('classic-3x3')], {
			widthMm: 60,
			count: 1,
			sheet: SHEETS.A4,
			lobe: 'right'
		});
		expect(plan.shared).toBe(true);
		expect(plan.lobe).toBe(SHARED_TEMPLATE_LOBE);
		expect(plan.pieces).toHaveLength(2);
	});

	it('fits nothing when one piece is taller than the sheet', () => {
		const plan = planLaserSheet(loadHeart('classic-3x3'), { widthMm: 200, count: 1, sheet: SHEETS.A4, lobe: 'left' });
		expect(plan.piecesFit).toBe(0);
		expect(plan.pieces).toHaveLength(0);
	});
});

describe('laserFileContent', () => {
	const plan = planLaserSheet(loadHeart('classic-3x3'), { widthMm: 80, count: 2, sheet: SHEETS.A4, lobe: 'left' });
	const info = { heartId: 'classic-3x3', heartName: 'Klassisk', url: 'https://juleflet.dk/hjerte/classic-3x3/', widthMm: 80 };

	it('writes the format asked for', () => {
		expect(laserFileContent(plan, 'svg', info)).toContain('width="210mm"');
		expect(laserFileContent(plan, 'svg', info)).toContain('<desc>https://juleflet.dk/hjerte/classic-3x3/ · 80 mm</desc>');
		expect(laserFileContent(plan, 'dxf', info)).toContain('AC1009');
	});
});

describe('Bølgebrud, as shipped', () => {
	const design = getGalleryDesign('boelgebrud')!;
	const info = { heartId: 'boelgebrud', heartName: 'Bølgebrud', url: 'https://juleflet.dk/hjerte/boelgebrud/', widthMm: 0 };

	it.each([40, 60, 80, 120])('exports both lobes as SVG and DXF at %i mm', (widthMm) => {
		for (const lobe of ['left', 'right'] as const) {
			// A 120 mm piece unfolds taller than A4; A3 holds every width here.
			const plan = planLaserSheet(design, { widthMm, count: 1, sheet: widthMm > 100 ? SHEETS.A3 : SHEETS.A4, lobe });
			expect(plan.piecesFit).toBe(1);
			expect(plan.pieces[0]!.piece.lobe).toBe(lobe);
			expect(laserFileContent(plan, 'svg', { ...info, widthMm })).toContain('<g id="cut"');
			expect(laserFileContent(plan, 'dxf', { ...info, widthMm })).toContain('AC1009');
		}
	});
});

describe('laserFileName', () => {
	it('names the heart, the width and the format', () => {
		expect(laserFileName('classic-3x3', 80, 'svg')).toBe('classic-3x3-laser-80mm.svg');
		expect(laserFileName('mit hjerte/2', 125, 'dxf')).toBe('mit-hjerte-2-laser-125mm.dxf');
	});

	it('names the lobe when the halves differ', () => {
		expect(laserFileName('jul', 80, 'svg', 'Venstre')).toBe('jul-laser-80mm-venstre.svg');
		expect(laserFileName('jul', 80, 'dxf', 'Højre')).toBe('jul-laser-80mm-hoejre.dxf');
		expect(laserFileName('jul', 80, 'svg', 'Right')).toBe('jul-laser-80mm-right.svg');
		// Several hearts, named by the count (SELECTION.md).
		expect(laserFileName('julehjerter-3', 80, 'svg', 'Venstre')).toBe('julehjerter-3-laser-80mm-venstre.svg');
		expect(laserFileName('julehjerter-2', 70, 'dxf')).toBe('julehjerter-2-laser-70mm.dxf');
	});
});

describe('parseLaserSettings', () => {
	it('reads what was saved and falls back on anything else', () => {
		expect(parseLaserSettings('{"format":"dxf","widthMm":120}')).toEqual({ format: 'dxf', widthMm: 120 });
		expect(parseLaserSettings('{"format":"pdf","widthMm":900}')).toEqual({ format: 'svg', widthMm: 200 });
		expect(parseLaserSettings('not json')).toEqual(DEFAULT_LASER_SETTINGS);
		expect(parseLaserSettings(null)).toEqual(DEFAULT_LASER_SETTINGS);
	});
});

describe('numbers', () => {
	it('writes coordinates to three decimals without trailing zeros', () => {
		expect(coord(12)).toBe('12');
		expect(coord(26.66666)).toBe('26.667');
		expect(coord(-0.0001)).toBe('0');
		expect(coord(0.1)).toBe('0.1');
	});

	it('writes lengths for people with a decimal comma in Danish', () => {
		expect(formatMm(80 / 3, 'da')).toBe('26,7');
		expect(formatMm(80 / 3, 'en')).toBe('26.7');
		expect(formatMm(240, 'da')).toBe('240');
	});
});
