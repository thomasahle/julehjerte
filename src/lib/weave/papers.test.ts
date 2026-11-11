import { describe, expect, it } from 'vitest';
import { DEFAULT_COLORS } from '$lib/stores/colors';
import { PALETTE } from '$lib/utils/palette';
import { paperNames, paperNumber, paperWords, parsePaper, type Rgb } from './papers';

const paper = (css: string): Rgb => {
	const rgb = parsePaper(css);
	if (!rgb) throw new Error(`not a colour: ${css}`);
	return rgb;
};
/** A pair's names as "right and left": the simulator's red half is the right-hand paper. */
const named = (right: string, left: string) => {
	const names = paperNames(paper(right), paper(left));
	return `${names.red} and ${names.white}`;
};

describe('parsePaper', () => {
	it("reads the page's paper colours as they are written", () => {
		expect(parsePaper('#ffffff')).toEqual([255, 255, 255]);
		expect(parsePaper(' #B91313 ')).toEqual([185, 19, 19]);
		expect(parsePaper('#f00')).toEqual([255, 0, 0]);
		expect(parsePaper('rgb(185, 19, 19)')).toEqual([185, 19, 19]);
		expect(parsePaper('rgb(185 19 19)')).toEqual([185, 19, 19]);
		expect(parsePaper('')).toBeNull();
		expect(parsePaper('red')).toBeNull();
	});

	it('gives the player its number', () => {
		expect(paperNumber([185, 19, 19])).toBe(0xb91313);
	});
});

describe('paperNames', () => {
	it("calls the site's own pair red and white, either way round", () => {
		expect(named(DEFAULT_COLORS.right, DEFAULT_COLORS.left)).toBe('red and white');
		expect(named(DEFAULT_COLORS.left, DEFAULT_COLORS.right)).toBe('white and red');
	});

	it('names a clear colour and calls a pale or greyed one light or dark', () => {
		const pair = (name: string) => {
			const found = PALETTE.find((p) => p.name === name);
			if (!found) throw new Error(`no pair ${name}`);
			return named(found.right, found.left);
		};
		expect(pair('gran')).toBe('green and light');
		expect(pair('nat')).toBe('blue and yellow');
		expect(pair('petrol')).toBe('dark and light');
		expect(pair('okker')).toBe('dark and white');
		expect(pair('sort')).toBe('black and red');
		expect(pair('kanel')).toBe('brown and light');
	});

	it('tells the two papers of every colourful pair apart', () => {
		for (const pair of PALETTE) {
			const names = paperNames(paper(pair.right), paper(pair.left));
			expect(names.red, pair.name).not.toBe(names.white);
		}
	});

	it('calls two papers of one colour the light and the dark one', () => {
		expect(named('#006400', '#00c000')).toBe('dark and light');
		expect(named('#ff0000', '#800000')).toBe('light and dark');
	});
});

describe('paperWords', () => {
	it('words the names as a step uses them', () => {
		const red = paper(DEFAULT_COLORS.right);
		const white = paper(DEFAULT_COLORS.left);
		expect(paperWords(red, white, 'da')).toEqual({ red: 'røde', white: 'hvide' });
		expect(paperWords(white, red, 'en')).toEqual({ red: 'white', white: 'red' });
		expect(paperWords(paper('#22385c'), paper('#e7e3dd'), 'da')).toEqual({
			red: 'blå',
			white: 'lyse'
		});
	});
});
