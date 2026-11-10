import { describe, expect, it } from 'vitest';
import { MAKE_FIGURE, MAKE_TEXT } from '$lib/utils/fixtures/storedForms';
import { GENERATOR_LINK_VERSION, defaults, generatorLink, readGeneratorAddress, readGeneratorState, type GeneratorState } from './state';

// The generator's address carries what it makes (`#make=`), so a link shared
// once must keep making the same heart.

const figure: GeneratorState = { ...defaults, mode: 'figure', motif: 'ph-cat', style: 'strips', strips: 5, place: 7.625, side: -4.125, scale: 90 };
const text: GeneratorState = { ...defaults, mode: 'text', text: 'GOD\nJUL', font: 'gf:lobster:400', textFrame: 'woven', cells: 'letters', room: 20 };
/** A link as the page wrote it before versioning, or a hand-made one. */
const link = (state: object) => '#make=' + encodeURIComponent(JSON.stringify(state));
/** A link from before versioning, as the page writes it now. */
const versioned = (fragment: string) => fragment.replace('make=%7B', 'make=%7B%22v%22%3A1%2C');

describe('the generator’s links', () => {
	it('are written as the page wrote them on 10 Nov 2026, with the version added in front', () => {
		expect(GENERATOR_LINK_VERSION).toBe(1);
		expect(link(figure)).toBe('#' + MAKE_FIGURE);
		expect(generatorLink(figure)).toBe(versioned(MAKE_FIGURE));
		expect(generatorLink(text)).toBe(versioned(MAKE_TEXT));
		// Fields left undefined are not written.
		expect(generatorLink({ ...figure, board: undefined, place: undefined, side: undefined })).not.toMatch(/board|place|side/);
	});

	it('read what the page writes', () => {
		for (const state of [figure, text, defaults, { ...defaults, mode: 'figure' as const, style: 'board' as const, board: 7 }])
			expect(readGeneratorState('#' + generatorLink(state))).toEqual(state);
	});

	it('from a later generator start a fresh heart, as a broken one does', () => {
		for (const v of [2, 0, 1.5, '1', null]) expect(readGeneratorState(link({ ...figure, v })), String(v)).toEqual(defaults);
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

describe('readGeneratorAddress', () => {
	it('opens what the link makes, else what the page’s address does, an older ?mode= over both', () => {
		expect(readGeneratorAddress('#' + MAKE_TEXT, '', 'figure')).toEqual(text);
		expect(readGeneratorAddress('', '', 'figure')).toEqual({ ...defaults, mode: 'figure' });
		expect(readGeneratorAddress('', '')).toEqual(defaults);
		expect(readGeneratorAddress(link({ ...text, mode: 'start' }), '', 'figure')).toEqual({ ...text, mode: 'figure' });
		expect(readGeneratorAddress('#' + MAKE_TEXT, '?mode=figure', 'text')).toEqual({ ...text, mode: 'figure' });
		expect(readGeneratorAddress('', '?mode=text&x=1')).toEqual({ ...defaults, mode: 'text' });
		expect(readGeneratorAddress('#' + MAKE_TEXT, '?mode=start')).toEqual(text);
		// A link from a later generator opens the page's own start.
		expect(readGeneratorAddress(link({ ...text, v: 2 }), '', 'text')).toEqual({ ...defaults, mode: 'text' });
	});
});
