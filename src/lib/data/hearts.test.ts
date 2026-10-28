/**
 * hearts.jsonc is the one file a new gallery heart is listed in (see
 * docs/ADDING-A-HEART.md), so it is checked here as it is on disk: the shape,
 * the categories and the ids against static/hearts/. The texts live in the SVGs
 * themselves; heartSvgDescriptions.test.ts checks those.
 */
import { describe, expect, it } from 'vitest';
import { HEARTS_INDEX as hearts } from '$lib/data/heartsIndex';
import type { CategoryId } from './categories';

const KNOWN_CATEGORIES: CategoryId[] = ['klassiske', 'stjerner', 'hjerter', 'moenstre', 'fliser', 'figurer', 'tekst'];
/** The ids that have a static/hearts/<id>.svg. */
const SVGS = new Set(
	Object.keys(import.meta.glob('/static/hearts/*.svg')).map((file) =>
		file.slice('/static/hearts/'.length, -'.svg'.length)
	)
);
const IDS: unknown[] = hearts.categories.flatMap((category) => category.hearts);

describe('hearts.jsonc', () => {
	it('has only a categories list', () => {
		expect(Object.keys(hearts)).toEqual(['categories']);
	});

	it('lists the known categories, each once, in gallery order', () => {
		expect(hearts.categories.map((category) => category.id)).toEqual(KNOWN_CATEGORIES);
	});

	it('has only {id, hearts} categories with a list of heart ids', () => {
		for (const category of hearts.categories) {
			expect(Object.keys(category).sort()).toEqual(['hearts', 'id']);
			expect(category.hearts.length, `${category.id} is empty`).toBeGreaterThan(0);
			for (const id of category.hearts as unknown[]) {
				expect(typeof id, `${category.id}: ${JSON.stringify(id)}`).toBe('string');
			}
		}
	});

	it('does not list a heart twice', () => {
		expect(IDS.filter((id, i) => IDS.indexOf(id) !== i)).toEqual([]);
	});

	it.each(IDS as string[])('has static/hearts/%s.svg', (id) => {
		expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
		expect(SVGS.has(id), `static/hearts/${id}.svg`).toBe(true);
	});
});
