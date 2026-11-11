import { describe, expect, it } from 'vitest';
import { stepWords } from './words';
import type { WeaveStep } from './film';
import type { PaperWords } from './papers';

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

const da: PaperWords = { red: 'røde', white: 'hvide' };
const en: PaperWords = { red: 'red', white: 'white' };

describe('stepWords', () => {
	it('words a weaving step from its tag, strips counted from 0', () => {
		expect(stepWords(step({ tag: '0,1,R' }), 'da', da).title).toBe(
			'Første røde strimmel gennem den anden hvide'
		);
		expect(stepWords(step({ tag: '0,2,W' }), 'da', da).title).toBe(
			'Tredje hvide strimmel gennem den første røde'
		);
		expect(stepWords(step({ tag: '0,2,W' }), 'en', en).title).toBe(
			'Third white strip through the first red'
		);
		expect(stepWords(step({ tag: 'row,1' }), 'da', da).title).toBe('Hent den anden røde strimmel');
		expect(stepWords(step({ tag: 'start' }), 'en', en).title).toBe('Bring the two halves together');
	});

	it('names the papers by the colours the visitor has them in', () => {
		const papers: PaperWords = { red: 'grønne', white: 'lyse' };
		expect(stepWords(step({ tag: '0,1,R' }), 'da', papers).title).toBe(
			'Første grønne strimmel gennem den anden lyse'
		);
		expect(stepWords(step({ tag: 'start' }), 'da', papers).text).toBe(
			'De grønne strimler bøjes tilbage, så de er af vejen, og den grønne halvdel skubbes ind ved siden af den lyse.'
		);
		expect(stepWords(step({ id: 'lay' }), 'en', { red: 'blue', white: 'yellow' }).text).toBe(
			'Lay the yellow half where the heart will be and bring the blue half in at a right angle, folds toward each other.'
		);
	});

	it('counts the strips of the cutting step, per half when they differ', () => {
		expect(stepWords(step({ id: 'cut', n: [3, 3], straight: true }), 'da', da)).toEqual({
			title: 'Klip tre strimler fra folden',
			text: expect.stringContaining('lineal')
		});
		expect(stepWords(step({ id: 'cut', n: [3, 4] }), 'en', en)).toEqual({
			title: 'Cut three and four strips from the fold',
			text: expect.stringContaining('template')
		});
	});

	it('uses a number where the language file has no word', () => {
		expect(stepWords(step({ tag: 'row,11' }), 'da', da).title).toBe('Hent den 12. røde strimmel');
		expect(stepWords(step({ id: 'cut', n: [14, 14] }), 'da', da).title).toBe(
			'Klip 14 strimler fra folden'
		);
	});

	it("keeps the recording's own words for a step it does not know", () => {
		expect(stepWords(step({}), 'da', da)).toEqual({ title: 'Own title', text: 'Own text' });
		expect(stepWords(step({ tag: 'woven' }), 'da', da).title).toBe('Own title');
	});
});
