import { describe, it, expect } from 'vitest';
import { firstSentence, truncateAtSentence, truncateAtWord } from './text';

describe('firstSentence', () => {
	it('stops at the first full stop', () => {
		expect(firstSentence('En rosette med fire blade. Fem striber i hver halvdel.')).toBe(
			'En rosette med fire blade.'
		);
	});

	it('keeps a question or exclamation mark', () => {
		expect(firstSentence('Hvor mange striber? Fem i hver halvdel.')).toBe('Hvor mange striber?');
	});

	it('does not break on an abbreviation followed by a lower-case word', () => {
		expect(firstSentence('Lange buer, én pr. stribe. Halvdelene er spejlvendte.')).toBe(
			'Lange buer, én pr. stribe.'
		);
	});

	it('does not break on a host name inside a sentence', () => {
		expect(firstSentence('Se brodal.dk for flere hjerter. De har tekst.')).toBe(
			'Se brodal.dk for flere hjerter.'
		);
	});

	it('returns the whole text when it has no sentence terminator', () => {
		expect(firstSentence('  Polka prikker  ')).toBe('Polka prikker');
	});

	it('returns a single sentence unchanged', () => {
		expect(firstSentence('4 små julegaver.')).toBe('4 små julegaver.');
	});
});

describe('truncateAtSentence', () => {
	const text = 'En rosette med fire blade. Fem striber i hver halvdel. Let at klippe.';

	it('returns text that fits unchanged', () => {
		expect(truncateAtSentence(`  ${text} `, 200)).toBe(text);
		expect(truncateAtSentence(text, text.length)).toBe(text);
	});

	it('cuts at the last sentence end that fits', () => {
		expect(truncateAtSentence(text, text.length - 1)).toBe(
			'En rosette med fire blade. Fem striber i hver halvdel.'
		);
		expect(truncateAtSentence(text, 'En rosette med fire blade.'.length)).toBe(
			'En rosette med fire blade.'
		);
	});

	it('does not count an abbreviation or a host name as a sentence end', () => {
		expect(truncateAtSentence('Lange buer, én pr. stribe. Halvdelene er spejlvendte.', 30)).toBe(
			'Lange buer, én pr. stribe.'
		);
		expect(truncateAtSentence('Se brodal.dk for flere. Mere tekst her.', 22)).toBe('Se brodal.dk for…');
	});

	it('falls back to a word boundary with an ellipsis when no sentence fits', () => {
		const out = truncateAtSentence('Et puslespil med fire gange fire brikker: hvert stykke klippes for sig.', 45);
		expect(out).toBe('Et puslespil med fire gange fire brikker…');
		expect(out.length).toBeLessThanOrEqual(45);
	});
});

describe('truncateAtWord', () => {
	it('never exceeds the limit, ellipsis included', () => {
		const text = 'alpha beta gamma delta epsilon zeta eta theta';
		for (let max = 1; max <= text.length + 2; max++) {
			const out = truncateAtWord(text, max);
			expect(out.length).toBeLessThanOrEqual(max);
			if (max < text.length) expect(out.endsWith('…')).toBe(true);
		}
	});

	it('drops a dangling comma or dash before the ellipsis', () => {
		expect(truncateAtWord('Fire hjerter, to hvide og to røde', 16)).toBe('Fire hjerter…');
		expect(truncateAtWord('Fire hjerter – to hvide', 16)).toBe('Fire hjerter…');
	});

	it('cuts inside a word that is longer than the limit', () => {
		expect(truncateAtWord('Supercalifragilistic', 6)).toBe('Super…');
	});
});
