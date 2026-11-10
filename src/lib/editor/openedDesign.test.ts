import { describe, expect, it } from 'vitest';
import type { HeartDesign } from '$lib/types/heart';
import { blankOpened, draftOpened, galleryOpened, importOpened, linkOpened, sessionOpened } from './openedDesign';

const heart: HeartDesign = {
	id: 'boelger',
	name: 'Bølger',
	names: { da: 'Bølger', en: 'Waves' },
	author: 'Thomas',
	authorUrl: 'https://example.org/thomas',
	publisher: 'Juleflet',
	publisherUrl: 'https://juleflet.dk',
	source: 'https://example.org/source',
	date: '2025-12-01',
	description: 'Bølger, der fletter',
	descriptions: { da: 'Et hjerte.' },
	weaveParity: 1,
	gridSize: { x: 4, y: 4 },
	fingers: [{ id: 'L-1', lobe: 'left', segments: [] }],
	pattern: { rule: 'move-move', cuts: 3, curves: {} }
};

describe('what Tegn opens on', () => {
	it('draws the heart as it came, its weave 0 where it has none, and a plain 3 × 3 heart for no heart', () => {
		const opened = draftOpened(heart);
		expect(opened.heart).toEqual({ fingers: heart.fingers, gridSize: heart.gridSize, weaveParity: 1, pattern: heart.pattern });
		expect(opened.heart.fingers).toBe(heart.fingers);
		expect(draftOpened({ ...heart, weaveParity: undefined }).heart.weaveParity).toBe(0);
		expect(blankOpened('da')).toEqual({
			heart: { fingers: [], gridSize: { x: 3, y: 3 }, weaveParity: 0, pattern: undefined },
			name: 'Mit hjerte',
			author: '',
			description: '',
			initial: null,
			editMode: false
		});
	});

	it('copies a gallery heart as the visitor’s own: named a copy in the page’s language, with no author, texts, source or date', () => {
		const opened = galleryOpened(heart, 'en');
		expect(opened.name).toBe('Waves (Copy)');
		expect(galleryOpened(heart, 'da').name).toBe('Bølger (Kopi)');
		expect([opened.author, opened.description, opened.editMode]).toEqual(['', '', false]);
		expect(opened.initial).toEqual({
			...heart,
			author: '',
			authorUrl: undefined,
			publisher: undefined,
			publisherUrl: undefined,
			source: undefined,
			date: undefined,
			description: undefined,
			descriptions: undefined
		});
		// the names per language ride along
		expect(opened.initial!.names).toBe(heart.names);
	});

	it('opens a shared link as a copy that keeps its author and description, or, from "Mine hjerter", as the heart itself', () => {
		const copy = linkOpened(heart, false, 'da');
		expect([copy.name, copy.author, copy.description, copy.editMode]).toEqual(['Bølger (Kopi)', 'Thomas', 'Bølger, der fletter', false]);
		expect(copy.initial).toBe(heart);
		const own = linkOpened(heart, true, 'en');
		expect([own.name, own.editMode]).toEqual(['Bølger', true]);
	});

	it("takes Mal's heart by its own name, and a draft or an imported file as they are", () => {
		expect(sessionOpened(heart, 'en').name).toBe('Bølger');
		expect(sessionOpened({ ...heart, name: '' }, 'en').name).toBe('My heart');
		expect(sessionOpened(heart, 'da').initial).toBe(heart);
		const draft = draftOpened({ ...heart, description: undefined });
		expect([draft.name, draft.author, draft.description, draft.editMode]).toEqual(['Bølger', 'Thomas', '', false]);
		const imported = importOpened({ ...heart, name: '', author: '', description: undefined }, 'da');
		expect([imported.name, imported.author, imported.description]).toEqual(['Importeret hjerte', '', '']);
		expect(importOpened(heart, 'da').initial).toBe(heart);
	});
});
