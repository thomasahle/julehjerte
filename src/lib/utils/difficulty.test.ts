import { describe, expect, it } from 'vitest';
import { t } from '$lib/i18n';
import { LEVELS, LEVEL_LABEL_KEYS, levelRank, type DifficultyLevel } from './difficulty';
import * as levelFilter from '$lib/front/levelFilter';

describe('difficulty levels', () => {
	it('are easiest first, and ranked 1 to 4 in that order', () => {
		expect(LEVELS).toEqual(['easy', 'medium', 'hard', 'expert']);
		expect(LEVELS.map(levelRank)).toEqual([1, 2, 3, 4]);
		expect(levelRank('nonsense' as DifficultyLevel)).toBe(0);
	});

	it('are named in both languages', () => {
		expect(LEVELS.map((l) => t(LEVEL_LABEL_KEYS[l], 'da'))).toEqual(['Let', 'Mellem', 'Svær', 'Ekspert']);
		expect(LEVELS.map((l) => t(LEVEL_LABEL_KEYS[l], 'en'))).toEqual(['Easy', 'Medium', 'Hard', 'Expert']);
	});

	it('are the very lists the front page filter uses', () => {
		expect(levelFilter.LEVELS).toBe(LEVELS);
		expect(levelFilter.LEVEL_LABEL_KEYS).toBe(LEVEL_LABEL_KEYS);
	});
});
