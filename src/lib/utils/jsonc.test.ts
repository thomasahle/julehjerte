import { describe, expect, it } from 'vitest';
import { parseJsonc } from './jsonc.js';

describe('parseJsonc', () => {
	it('reads plain JSON as JSON.parse does', () => {
		const text = '{ "categories": [ { "id": "a", "hearts": ["x", "y"] } ] }';
		expect(parseJsonc(text)).toEqual(JSON.parse(text));
	});

	it('skips line and block comments and trailing commas', () => {
		const text = `{
			// The first group
			"hearts": [
				"x", /* a note */
				// The second group
				"y",
			],
		}`;
		expect(parseJsonc(text)).toEqual({ hearts: ['x', 'y'] });
	});

	it('leaves comment marks and commas inside strings alone', () => {
		expect(parseJsonc('["https://juleflet.dk", "a /* b */ c", "d,]", "e\\"//f"]')).toEqual([
			'https://juleflet.dk',
			'a /* b */ c',
			'd,]',
			'e"//f'
		]);
	});

	it('refuses broken input', () => {
		expect(() => parseJsonc('{ "a": 1 /* never closed')).toThrow(SyntaxError);
		expect(() => parseJsonc('{ "a": }')).toThrow(SyntaxError);
	});
});
