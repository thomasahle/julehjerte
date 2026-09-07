import { describe, it, expect } from 'vitest';
import { ALL_HEART_IDS } from './categories';
import { HEART_DESCRIPTIONS, heartDescription } from './heartDescriptions';
import type { Language } from '$lib/i18n';

const LANGUAGES: Language[] = ['da', 'en'];

describe('heart descriptions', () => {
	it('covers every gallery heart and nothing else', () => {
		expect(Object.keys(HEART_DESCRIPTIONS).sort()).toEqual([...ALL_HEART_IDS].sort());
	});

	it.each(ALL_HEART_IDS)('has a written paragraph for %s in both languages', (id) => {
		for (const lang of LANGUAGES) {
			const text = heartDescription(id, lang);
			expect(text, `${id}.${lang} is missing`).toBeTruthy();
			expect(text?.trim(), `${id}.${lang} is empty`).not.toBe('');
		}
	});

	it.each(ALL_HEART_IDS)('does not reuse the Danish paragraph as the English one for %s', (id) => {
		expect(heartDescription(id, 'da')).not.toBe(heartDescription(id, 'en'));
	});

	// The owner asked for plain, factual prose; an exclamation mark is the first
	// sign that a paragraph has drifted back into marketing copy.
	it.each(ALL_HEART_IDS)('keeps %s free of exclamation marks', (id) => {
		for (const lang of LANGUAGES) {
			expect(heartDescription(id, lang)).not.toContain('!');
		}
	});

	// Two to four sentences is the brief. Counting sentences reliably is more
	// trouble than it is worth, so this only catches a one-liner slipping back in
	// or a paragraph growing into an essay; the written ones run 260-430 characters.
	it.each(ALL_HEART_IDS)('keeps %s to a paragraph', (id) => {
		for (const lang of LANGUAGES) {
			const text = heartDescription(id, lang) ?? '';
			expect(text.length, `${id}.${lang} is ${text.length} characters`).toBeGreaterThan(150);
			expect(text.length, `${id}.${lang} is ${text.length} characters`).toBeLessThan(600);
		}
	});

	it('returns null for a heart that is not in the gallery', () => {
		expect(heartDescription('a-heart-the-visitor-drew', 'da')).toBeNull();
	});
});
