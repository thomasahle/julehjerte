import { describe, expect, it } from 'vitest';
import type { Font, Ring } from './geometry';
import { readFont } from './fontFile';
import { slow } from './slow.test-helpers';
import { shippedFont } from './fonts.test-helpers';
import { SHIPPED_FONTS } from './fontFaces';
import { THIN_SHARE, THIN_WIDTH, glyphGrowth, thickened, thinGrowth, thinShare, thinWidth } from './strokes';

const shippedFonts: Record<string, Font> = Object.fromEntries(
	await Promise.all(Object.keys(SHIPPED_FONTS).map(async name => [name, await shippedFont(name)] as const)));
const files = import.meta.glob<string>('/docs/design-start/assets/fonts/*.ttf', { eager: true, query: '?inline', import: 'default' });
const file = (name: string) => Uint8Array.from(atob(files[`/docs/design-start/assets/fonts/${name}.ttf`].split(',')[1]), c => c.charCodeAt(0));

const box = (x0: number, y0: number, x1: number, y1: number): Ring => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
/** An I: one upright stroke `width` ems wide, as tall as a capital. */
const stroke = (width: number): Font['glyphs'][string] => ({ advance: width + .1, contours: [box(.05, -.7, .05 + width, 0)] });
/** An O of square strokes `width` ems wide round a counter `hole` ems across. */
const ring = (width: number, hole: number): Font['glyphs'][string] => ({
	advance: hole + 2 * width + .1,
	contours: [box(.05, -.7, .05 + hole + 2 * width, 0), box(.05 + width, -.35 - hole / 2, .05 + width + hole, -.35 + hole / 2)]
});

describe('thin strokes', () => {
	it('measures a stroke as thin below its width and not from it, to the pixel', () => {
		const font: Font = { glyphs: { I: stroke(.03), ' ': { advance: .3, contours: [] } } };
		expect(thinShare(font, .02)).toBeLessThan(.01);
		expect(thinShare(font, .04)).toBe(1);
		// Measured on pixels .004 em across, within two of them.
		expect(Math.abs(thinWidth(font) - .03)).toBeLessThan(.008);
	});

	it.each(Object.keys(shippedFonts))('leaves the fonts we ship as they are: %s', name => {
		const font = shippedFonts[name];
		expect(thickened(font)).toBe(font);
	});

	it('grows a thin font until its strokes are as thick as ours, keeping its spacing', () => {
		const font: Font = { glyphs: { I: stroke(.02), H: stroke(.024), ' ': { advance: .3, contours: [] } } };
		const by = thinGrowth(font), thick = thickened(font);
		expect(by).toBeGreaterThan((THIN_WIDTH - .024) / 2 - .004);
		expect(by).toBeLessThanOrEqual(THIN_WIDTH / 2);
		expect(thinShare(thick, THIN_WIDTH)).toBeLessThanOrEqual(THIN_SHARE);
		for (const char of 'IH') {
			const [before, after] = [font.glyphs[char], thick.glyphs[char]];
			// Grown all round, moved right by as much, its advance wider by twice that.
			expect(after.advance).toBeCloseTo(before.advance + 2 * by, 4);
			const xs = after.contours.flat().map(p => p[0]);
			expect(Math.min(...xs)).toBeCloseTo(.05, 3);
			expect(Math.max(...xs)).toBeCloseTo(.05 + (char === 'I' ? .02 : .024) + 2 * by, 3);
			expect(after.contours.flat().every(p => p.every(Number.isFinite))).toBe(true);
		}
		expect(thick.glyphs[' ']).toBe(font.glyphs[' ']);
	});

	it('grows a letter less where a notch in it would narrow past the width, or a narrower one past half that', () => {
		// A C: a notch .2 deep and `width` wide cut into a box from its side.
		const c = (width: number): Ring[] => [[[0, 0], [0, -.5], [.3, -.5], [.3, -.25 - width / 2], [.1, -.25 - width / 2], [.1, -.25 + width / 2], [.3, -.25 + width / 2], [.3, 0]]];
		const near = (grow: number, expected: number) => {
			expect(grow).toBeGreaterThan(expected - .0045);
			expect(grow).toBeLessThanOrEqual(expected + .001);
		};
		near(glyphGrowth(c(.08), .02), .015);
		near(glyphGrowth(c(.04), .015), .0075);
		// Growing by half its width fills it in, and leaves no sliver.
		expect(glyphGrowth(c(.04), .02)).toBe(.02);
	});

	it('grows a letter only as far as the passages round it stay as wide as the strokes are made', () => {
		// An n: two stems .1 apart under an arch, its feet reaching in to leave `gap` between them.
		const n = (gap: number): Ring[] => {
			const foot = (.1 - gap) / 2;
			return [[[0, 0], [0, -.5], [.3, -.5], [.3, 0], [.2 - foot, 0], [.2 - foot, -.03], [.2, -.03], [.2, -.4], [.1, -.4], [.1, -.03], [.1 + foot, -.03], [.1 + foot, 0]]];
		};
		// One wider than THIN_WIDTH narrows to it, by .015 here; one narrower not at all.
		expect(glyphGrowth(n(.08), .02)).toBeGreaterThan(.015 - .0045);
		expect(glyphGrowth(n(.08), .02)).toBeLessThanOrEqual(.015);
		expect(glyphGrowth(n(.02), .02)).toBe(0);
	});
});

describe('thin fonts', () => {
	// Cinzel's file at its lightest weight, which the build grows by .04 em at 900;
	// its capitals, which are what a heart spells.
	slow('grows Cinzel, halving what of it is thinner than the fonts we ship', async () => {
		const whole = await readFont(file('cinzel'));
		const font = { ...whole, glyphs: Object.fromEntries(Object.entries(whole.glyphs).filter(([char]) => /^[A-ZÆØÅ]$/.test(char))) };
		const thick = thickened(font);
		expect(thinGrowth(font)).toBeGreaterThan(.01);
		expect(thinShare(thick, THIN_WIDTH)).toBeLessThan(thinShare(font, THIN_WIDTH) / 2);
		for (const [char, glyph] of Object.entries(font.glyphs))
			expect(thick.glyphs[char].contours.length, char).toBe(glyph.contours.length);
	});
});
