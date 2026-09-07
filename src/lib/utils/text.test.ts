import { describe, it, expect } from 'vitest';
import { firstSentence } from './text';

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
