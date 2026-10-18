/**
 * hearts.json is the one file a new gallery heart is added to (see
 * docs/ADDING-A-HEART.md), so it is checked here as it is on disk: the shape,
 * the ids against static/hearts/, the categories and both descriptions.
 */
import { describe, expect, it } from 'vitest';
import hearts from './hearts.json';
import index from '$lib/data/hearts.json?index';
import type { CategoryId } from './categories';

const KNOWN_CATEGORIES: CategoryId[] = ['klassiske', 'stjerner', 'moenstre', 'figurer', 'hjerter'];
/** The ids that have a static/hearts/<id>.svg. */
const SVGS = new Set(
	Object.keys(import.meta.glob('/static/hearts/*.svg')).map((file) =>
		file.slice('/static/hearts/'.length, -'.svg'.length)
	)
);
const ENTRIES = hearts.categories.flatMap((category) => category.hearts);

describe('hearts.json', () => {
	it('lists the known categories, each once, in gallery order', () => {
		expect(hearts.categories.map((category) => category.id)).toEqual(KNOWN_CATEGORIES);
	});

	it('has only {id, hearts} categories and {id, description: {da, en}} hearts', () => {
		for (const category of hearts.categories) {
			expect(Object.keys(category).sort()).toEqual(['hearts', 'id']);
			expect(category.hearts.length, `${category.id} is empty`).toBeGreaterThan(0);
			for (const heart of category.hearts) {
				expect(Object.keys(heart).sort(), heart.id).toEqual(['description', 'id']);
				expect(Object.keys(heart.description).sort(), heart.id).toEqual(['da', 'en']);
			}
		}
	});

	it('does not list a heart twice', () => {
		const ids = ENTRIES.map((heart) => heart.id);
		expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([]);
	});

	it.each(ENTRIES.map((heart) => heart.id))('has static/hearts/%s.svg', (id) => {
		expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
		expect(SVGS.has(id), `static/hearts/${id}.svg`).toBe(true);
	});

	it.each(ENTRIES.map((heart) => [heart.id, heart] as const))(
		'has a Danish and an English description for %s',
		(id, heart) => {
			for (const lang of ['da', 'en'] as const) {
				const text = heart.description[lang];
				expect(typeof text, `${id}.${lang}`).toBe('string');
				expect(text.trim(), `${id}.${lang} is empty`).not.toBe('');
			}
		}
	);

	// What `$lib/data/categories` reads: same ids and order, none of the prose.
	it('serves ?index without the descriptions', () => {
		expect(index).toEqual({
			categories: hearts.categories.map((category) => ({
				id: category.id,
				hearts: category.hearts.map((heart) => ({ id: heart.id }))
			}))
		});
		expect(JSON.stringify(index)).not.toContain('description');
	});
});
