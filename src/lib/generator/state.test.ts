import { describe, expect, it } from 'vitest';
import { MAKE_FIGURE, MAKE_TEXT } from '$lib/utils/fixtures/storedForms';
import { defaults, readGeneratorState, type GeneratorState } from './state';

// The generator's address carries what it makes (`#make=`), so a link shared
// once must keep making the same heart.

const figure: GeneratorState = { ...defaults, mode: 'figure', motif: 'ph-cat', style: 'strips', strips: 5, place: 7.625, side: -4.125, scale: 90 };
const text: GeneratorState = { ...defaults, mode: 'text', text: 'GOD\nJUL', font: 'gf:lobster:400', textFrame: 'woven', cells: 'letters', room: 20 };
/** A link as the page writes it. */
const link = (state: object) => '#make=' + encodeURIComponent(JSON.stringify(state));

describe('the generator’s links', () => {
	it('are written as the page wrote them on 10 Nov 2026', () => {
		expect(link(figure)).toBe('#' + MAKE_FIGURE);
		expect(link(text)).toBe('#' + MAKE_TEXT);
	});

	it('read what the page wrote', () => {
		expect(readGeneratorState('#' + MAKE_FIGURE)).toEqual(figure);
		expect(readGeneratorState('#' + MAKE_TEXT)).toEqual(text);
		// The hash as the browser hands it, and a link percent-encoded once less.
		expect(readGeneratorState(MAKE_FIGURE)).toEqual(figure);
		expect(readGeneratorState('#make=' + JSON.stringify(text))).toEqual(text);
	});

	it('read what they do not know as nothing', () => {
		expect(readGeneratorState(link({ ...figure, v: 1, later: { anything: true } }))).toEqual(figure);
	});

	it('read the frames older links name by their former names', () => {
		const words = { ...defaults, mode: 'text' as const };
		expect(readGeneratorState(link({ ...words, textFrame: 'repeat-check' })).textFrame).toBe('checkered');
		for (const shape of ['diamond', 'hexagon', 'oval', 'rounded', 'scalloped'])
			expect(readGeneratorState(link({ ...words, textFrame: shape })).textFrame).toBe('circle');
		// The airy frame is the woven one with more space, unless the link says how much.
		expect(readGeneratorState(link({ mode: 'text', textFrame: 'air' }))).toMatchObject({ textFrame: 'woven', room: 25 });
		expect(readGeneratorState(link({ mode: 'text', textFrame: 'air', room: 30 }))).toMatchObject({ textFrame: 'woven', room: 30 });
		expect(readGeneratorState(link({ ...figure, style: 'plain', scale: 70 })).style).toBe('rays');
		// What no form ever named starts as the default.
		expect(readGeneratorState(link({ ...words, textFrame: 'repeat' })).textFrame).toBe(defaults.textFrame);
	});

	it('read each field on its own, clamped, a side only with its place', () => {
		const read = readGeneratorState(link({ mode: 'figure', style: 'nope', motif: '../x', scale: 200, frameSize: 10, board: 20, spacing: -3, room: 1.4, strips: 4.6, side: 2 }));
		expect(read).toEqual({ ...defaults, mode: 'figure', scale: 100, frameSize: 50, board: 9, spacing: 0, room: 5, strips: 5 });
		expect(readGeneratorState(link({ ...figure, place: 99.99, side: -0.1 }))).toMatchObject({ place: 66, side: -0.125 });
	});

	it('start a fresh heart from a link that is not one', () => {
		for (const hash of ['', '#', '#make=', '#make=broken', '#make=%7B', '#make=null', '#make=5', '#make=%22text%22', '#design=abc'])
			expect(readGeneratorState(hash), hash).toEqual(defaults);
	});
});
