import { describe, it, expect } from 'vitest';
import hearts from './hearts.json';
import {
	ALL_HEART_IDS,
	CATEGORIES,
	CATEGORY_IDS,
	categoryOfHeart,
	categoryTitle,
	categoryTitleLower,
	getCategory,
	siblingHeartIds
} from './categories';
import { translations } from '$lib/i18n/translations';

describe('categories', () => {
	it('keeps the ids and the order of hearts.json', () => {
		expect(CATEGORY_IDS).toEqual(hearts.categories.map((c) => c.id));
		expect(ALL_HEART_IDS).toEqual(hearts.categories.flatMap((c) => c.hearts));
	});

	it('gives every category a title key that exists in both languages', () => {
		for (const category of CATEGORIES) {
			expect(translations.da[category.titleKey]).toBeTruthy();
			expect(translations.en[category.titleKey]).toBeTruthy();
			expect(translations.da[category.lowerTitleKey]).toBeTruthy();
			expect(translations.en[category.lowerTitleKey]).toBeTruthy();
		}
	});

	it('does not list a heart in two categories', () => {
		expect(new Set(ALL_HEART_IDS).size).toBe(ALL_HEART_IDS.length);
	});

	it('finds the category a heart belongs to', () => {
		expect(categoryOfHeart('stjerne')?.id).toBe('stjerner');
		expect(categoryOfHeart('jul')?.id).toBe('klassiske');
		expect(categoryOfHeart('a-heart-that-does-not-exist')).toBeNull();
	});

	it('lists the other hearts in the same category', () => {
		const siblings = siblingHeartIds('jul');
		expect(siblings).not.toContain('jul');
		expect(siblings).toEqual(getCategory('klassiske')?.hearts.filter((id) => id !== 'jul'));
		expect(siblingHeartIds('not-a-heart')).toEqual([]);
	});

	it('translates category names', () => {
		expect(categoryTitle('stjerner', 'da')).toBe('Stjerner');
		expect(categoryTitle('stjerner', 'en')).toBe('Stars');
		expect(categoryTitleLower('stjerner', 'da')).toBe('stjerner');
		expect(categoryTitle('mine', 'da')).toBe(translations.da.categoryMine);
		expect(categoryTitle('mine', 'en')).toBe(translations.en.categoryMine);
	});
});
