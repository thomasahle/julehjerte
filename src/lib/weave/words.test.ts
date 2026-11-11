import { describe, expect, it } from 'vitest';
import { stepWords } from './words';
import type { WeaveStep } from './film';

const step = (part: Partial<WeaveStep>): WeaveStep => ({
	id: '',
	tag: '',
	n: null,
	straight: false,
	title: 'Own title',
	text: 'Own text',
	start: 0,
	...part
});

describe('stepWords', () => {
	it('words a weaving step from its tag, strips counted from 0', () => {
		expect(stepWords(step({ tag: '0,1,R' }), 'da').title).toBe(
			'Første røde strimmel gennem den anden hvide'
		);
		expect(stepWords(step({ tag: '0,2,W' }), 'da').title).toBe(
			'Tredje hvide strimmel gennem den første røde'
		);
		expect(stepWords(step({ tag: '0,2,W' }), 'en').title).toBe(
			'Third white strip through the first red'
		);
		expect(stepWords(step({ tag: 'row,1' }), 'da').title).toBe('Hent den anden røde strimmel');
		expect(stepWords(step({ tag: 'start' }), 'en').title).toBe('Bring the two halves together');
	});

	it('counts the strips of the cutting step, per half when they differ', () => {
		expect(stepWords(step({ id: 'cut', n: [3, 3], straight: true }), 'da')).toEqual({
			title: 'Klip tre strimler fra folden',
			text: expect.stringContaining('lineal')
		});
		expect(stepWords(step({ id: 'cut', n: [3, 4] }), 'en')).toEqual({
			title: 'Cut three and four strips from the fold',
			text: expect.stringContaining('template')
		});
	});

	it('uses a number where the language file has no word', () => {
		expect(stepWords(step({ tag: 'row,11' }), 'da').title).toBe('Hent den 12. røde strimmel');
		expect(stepWords(step({ id: 'cut', n: [14, 14] }), 'da').title).toBe(
			'Klip 14 strimler fra folden'
		);
	});

	it("keeps the recording's own words for a step it does not know", () => {
		expect(stepWords(step({}), 'da')).toEqual({ title: 'Own title', text: 'Own text' });
		expect(stepWords(step({ tag: 'woven' }), 'da').title).toBe('Own title');
	});
});
