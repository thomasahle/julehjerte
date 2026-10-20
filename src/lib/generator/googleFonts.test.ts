import { describe, expect, it } from 'vitest';
import { SHIPPED, familyName, fontSample, googleFontChoice, googleFontUrl, isGoogleFont, matchingFamilies, type GoogleFamily } from './googleFonts';
import { readGeneratorState } from './state';
import type { Font } from './geometry';
import families from '../../../static/generator/google-fonts.json';
import righteous from '../../../static/generator/fonts/righteous.json';

const index = families as unknown as GoogleFamily[];
const link = (font: string) => '#make=' + encodeURIComponent(JSON.stringify({ mode: 'text', font }));

describe('Google fonts', () => {
	it('lists the families with the weight fetched, the popular first', () => {
		expect(index.length).toBeGreaterThan(1500);
		for (const family of index) {
			expect(isGoogleFont(googleFontChoice(family)), family[0]).toBe(true);
			expect(family[2] >= 100 && family[2] <= 900, family[0]).toBe(true);
		}
		// The search finds our own copies of the fonts we ship.
		for (const id of Object.keys(SHIPPED)) expect(index.some(f => f[0] === id), id).toBe(true);
		expect(index.findIndex(f => f[0] === 'roboto')).toBeLessThan(10);
	});

	it('finds families by any words of their names, the popular first', () => {
		const names = (query: string) => matchingFamilies(index, query).map(f => f[1]);
		expect(names('lob').slice(0, 2).sort()).toEqual(['Lobster', 'Lobster Two']);
		expect(names('lobster')[0]).toBe('Lobster');
		expect(names('opensans')[0]).toBe('Open Sans');
		expect(names('sans')[0]).toBe('Open Sans');
		expect(names('SANS open')).toContain('Open Sans');
		expect(names('mountains of christmas')).toEqual(['Mountains of Christmas']);
		expect(names('montserrat').indexOf('Montserrat')).toBe(0);
		expect(names('   ')).toEqual([]);
		expect(names('no such font anywhere')).toEqual([]);
	});

	it('names a family in links by its id and weight, fetched from Fontsource on jsDelivr', () => {
		const lobster = index.find(f => f[0] === 'lobster')!;
		expect(googleFontChoice(lobster)).toBe('gf:lobster:400');
		expect(googleFontUrl('gf:lobster:400')).toBe('https://cdn.jsdelivr.net/fontsource/fonts/lobster@latest/latin-400-normal.woff');
		expect(familyName('gf:alfa-slab-one:400')).toBe('Alfa Slab One');
		expect(familyName('gf:ibm-plex-sans:700', index)).toBe('IBM Plex Sans');
		expect(readGeneratorState(link('gf:lobster:400')).font).toBe('gf:lobster:400');
		for (const font of ['gf:Lobster:400', 'gf:../x:400', 'gf:lobster', 'gf:lobster:450', 'https://example.com/x.woff'])
			expect(readGeneratorState(link(font)).font, font).toBe('nunito');
	});

	it('draws the sample its button shows from the outlines', () => {
		const font = righteous as unknown as Font;
		const sample = fontSample(font)!;
		expect(sample.d.match(/M/g)!.length).toBe(font.glyphs.A.contours.length + font.glyphs.a.contours.length);
		expect(sample.viewBox.split(' ').map(Number).every(Number.isFinite)).toBe(true);
		expect(fontSample({ glyphs: {} })).toBeUndefined();
	});
});
