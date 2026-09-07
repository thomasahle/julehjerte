import { describe, it, expect } from 'vitest';
import { slugify } from './slug';

describe('slugify', () => {
	it('lowercases and joins words with a hyphen', () => {
		expect(slugify('Mit Store Hjerte')).toBe('mit-store-hjerte');
	});

	it('folds the Danish letters the way the gallery ids spell them', () => {
		expect(slugify('Juletræ')).toBe('juletrae');
		expect(slugify('Ø-hjerte')).toBe('oe-hjerte');
		expect(slugify('Blåmejse')).toBe('blaamejse');
	});

	it('strips other accents rather than the letters under them', () => {
		expect(slugify('Crème Brûlée')).toBe('creme-brulee');
	});

	it('drops punctuation and collapses the runs it leaves', () => {
		expect(slugify('Hjerte #3 (kopi)!')).toBe('hjerte-3-kopi');
	});

	it('trims leading and trailing hyphens', () => {
		expect(slugify('  -- hjerte --  ')).toBe('hjerte');
	});

	it('keeps digits', () => {
		expect(slugify('classic 3x3')).toBe('classic-3x3');
	});

	it('falls back when nothing survives', () => {
		expect(slugify('')).toBe('julehjerte');
		expect(slugify('❤❤❤')).toBe('julehjerte');
		expect(slugify('心', 'heart')).toBe('heart');
	});
});
