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

describe('planLaserSheet', () => {
	it('cuts a shared-template heart as two copies of the left piece', () => {
		const plan = planLaserSheet(loadHeart('classic-3x3'), { widthMm: 80, hearts: 1, sheet: SHEETS.A4 });
		expect(plan.pieces).toHaveLength(2);
		expect(plan.pieces.map((p) => p.piece.lobe)).toEqual(['left', 'left']);
		expect(plan.heartsFit).toBe(1);
	});

	it('cuts an asymmetric heart as its left and its right piece', () => {
		const plan = planLaserSheet(loadHeart('jul'), { widthMm: 60, hearts: 1, sheet: SHEETS.A4 });
		expect(plan.pieces.map((p) => p.piece.lobe)).toEqual(['left', 'right']);
	});

	it('keeps only whole hearts when the sheet runs out', () => {
		// A3 at 80 mm holds three pieces: one heart and a lone left piece.
		const plan = planLaserSheet(loadHeart('jul'), { widthMm: 80, hearts: 4, sheet: SHEETS.A3 });
		expect(plan.heartsRequested).toBe(4);
		expect(plan.heartsFit).toBe(1);
		expect(plan.pieces).toHaveLength(2);
	});

	it('fits nothing when one piece is taller than the sheet', () => {
		const plan = planLaserSheet(loadHeart('classic-3x3'), { widthMm: 200, hearts: 1, sheet: SHEETS.A4 });
		expect(plan.heartsFit).toBe(0);
		expect(plan.pieces).toHaveLength(0);
	});
});

describe('laserFileContent', () => {
	const plan = planLaserSheet(loadHeart('classic-3x3'), { widthMm: 80, hearts: 1, sheet: SHEETS.A4 });
	const info = { heartId: 'classic-3x3', heartName: 'Klassisk', url: 'https://juleflet.dk/hjerte/classic-3x3/', widthMm: 80, scoreFold: false };

	it('writes the format asked for', () => {
		expect(laserFileContent(plan, 'svg', info)).toContain('width="210mm"');
		expect(laserFileContent(plan, 'svg', info)).toContain('<desc>https://juleflet.dk/hjerte/classic-3x3/ · 80 mm</desc>');
		expect(laserFileContent(plan, 'dxf', info)).toContain('AC1009');
	});
});

describe('laserFileName', () => {
	it('names the heart, the width and the format', () => {
		expect(laserFileName('classic-3x3', 80, 'svg')).toBe('classic-3x3-laser-80mm.svg');
		expect(laserFileName('mit hjerte/2', 125, 'dxf')).toBe('mit-hjerte-2-laser-125mm.dxf');
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
