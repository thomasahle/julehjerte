import { describe, expect, it } from 'vitest';
import { parseDescription, plainDescription } from './descriptionLinks';

describe('description links', () => {
	it('splits a paragraph into runs and links', () => {
		expect(parseDescription('Se [brodal.dk](https://brodal.dk/julehjerter/) for mere.')).toEqual([
			{ text: 'Se ' },
			{ text: 'brodal.dk', href: 'https://brodal.dk/julehjerter/' },
			{ text: ' for mere.' }
		]);
	});

	it('keeps a paragraph without links as one run', () => {
		expect(parseDescription('Bare tekst.')).toEqual([{ text: 'Bare tekst.' }]);
	});

	it('honours only absolute http(s) links', () => {
		for (const raw of ['[x](javascript:alert(1))', '[x](/hjerte/jul/)', '[x](mailto:a@b.c)', '[x]()']) {
			expect(parseDescription(raw)).toEqual([{ text: raw }]);
			expect(plainDescription(raw)).toBe(raw);
		}
	});

	it('reduces links to their words for plain text', () => {
		expect(
			plainDescription('Af [Prince](https://www.instagram.com/p/x/) og [Johan](https://johansjulehjerter.dk/).')
		).toBe('Af Prince og Johan.');
	});
});
