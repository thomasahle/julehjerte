import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	LEVEL_STORAGE_KEY,
	filterHidesAnchor,
	initialLevels,
	levelSearch,
	levelValue,
	matchesLevels,
	parseLevelValue,
	parseLevels,
	readStoredLevels,
	storeLevels,
	toggleLevel
} from './levelFilter';
import { selectionSearch } from './selection';

describe('parseLevels', () => {
	it('reads the Danish words in ?level=', () => {
		expect(parseLevels('?level=let,mellem')).toEqual(new Set(['easy', 'medium']));
		expect(parseLevels('?level=svaer,ekspert')).toEqual(new Set(['hard', 'expert']));
	});

	it('is null when the URL does not say, so the stored filter applies', () => {
		expect(parseLevels('')).toBeNull();
		expect(parseLevels('?selected=jul')).toBeNull();
		expect(parseLevels('?level=')).toBeNull();
	});

	it('drops unknown words, empty entries and repeats, and ignores case', () => {
		expect(parseLevels('?level=Let,,hard,let,')).toEqual(new Set(['easy']));
		expect(parseLevels('?level=nonsense')).toEqual(new Set());
	});

	it('reads an encoded comma as well', () => {
		expect(parseLevels('?level=let%2Cekspert')).toEqual(new Set(['easy', 'expert']));
	});
});

describe('levelValue and levelSearch', () => {
	it('writes the levels easiest first', () => {
		expect(levelValue(new Set(['expert', 'easy']))).toBe('let,ekspert');
		expect(levelValue(new Set())).toBe('');
	});

	it('sets the parameter and keeps the others, commas unescaped', () => {
		const search = new URLSearchParams('?selected=jul,sol');
		expect(levelSearch(search, new Set(['medium', 'easy']))).toBe('?selected=jul,sol&level=let,mellem');
	});

	it('removes the parameter when no level is chosen, and leaves nothing behind', () => {
		expect(levelSearch(new URLSearchParams('?level=let'), new Set())).toBe('');
		expect(levelSearch(new URLSearchParams('?level=let&selected=jul'), new Set())).toBe('?selected=jul');
	});

	it('round-trips through parseLevels, and with the selection', () => {
		const levels = new Set(['hard', 'easy'] as const);
		const withSelection = levelSearch(
			new URLSearchParams(selectionSearch(new URLSearchParams(''), new Set(['jul']))),
			levels
		);
		expect(parseLevels(withSelection)).toEqual(new Set(levels));
		expect(new URLSearchParams(withSelection).get('selected')).toBe('jul');
	});
});

describe('toggleLevel and matchesLevels', () => {
	it('adds a missing level and removes a present one, in a new set', () => {
		const none = new Set<never>();
		const easy = toggleLevel(none, 'easy');
		expect(easy).toEqual(new Set(['easy']));
		expect(none.size).toBe(0);
		expect(toggleLevel(easy, 'easy')).toEqual(new Set());
		expect(toggleLevel(easy, 'expert')).toEqual(new Set(['easy', 'expert']));
	});

	it('shows everything when nothing is chosen, otherwise the chosen levels only', () => {
		expect(matchesLevels(new Set(), 'hard')).toBe(true);
		expect(matchesLevels(new Set(['easy']), 'easy')).toBe(true);
		expect(matchesLevels(new Set(['easy']), 'hard')).toBe(false);
		expect(matchesLevels(new Set(['easy', 'hard']), 'hard')).toBe(true);
		expect(matchesLevels(new Set(['easy']), undefined)).toBe(false);
	});
});

describe('initialLevels', () => {
	it('takes the URL over the stored choice', () => {
		expect(initialLevels('?level=svaer', 'let')).toEqual(new Set(['hard']));
	});

	it('falls back to the stored choice when the URL has none', () => {
		expect(initialLevels('', 'let,ekspert')).toEqual(new Set(['easy', 'expert']));
		expect(initialLevels('?selected=jul', null)).toEqual(new Set());
	});

	it('parses a stored value like the URL', () => {
		expect(parseLevelValue('mellem, svaer')).toEqual(new Set(['medium', 'hard']));
		expect(parseLevelValue(null)).toEqual(new Set());
	});
});

describe('the stored choice', () => {
	afterEach(() => vi.unstubAllGlobals());

	function stubStorage() {
		const store = new Map<string, string>();
		vi.stubGlobal('sessionStorage', {
			getItem: (key: string) => store.get(key) ?? null,
			setItem: (key: string, value: string) => void store.set(key, value),
			removeItem: (key: string) => void store.delete(key)
		});
		return store;
	}

	it('keeps the filter for the tab and forgets it once cleared', () => {
		const store = stubStorage();
		storeLevels(new Set(['medium', 'easy']));
		expect(store.get(LEVEL_STORAGE_KEY)).toBe('let,mellem');
		expect(readStoredLevels()).toBe('let,mellem');
		storeLevels(new Set());
		expect(store.has(LEVEL_STORAGE_KEY)).toBe(false);
		expect(readStoredLevels()).toBeNull();
	});

	it('never throws when storage is blocked', () => {
		vi.stubGlobal('sessionStorage', {
			getItem: () => {
				throw new Error('blocked');
			},
			setItem: () => {
				throw new Error('blocked');
			},
			removeItem: () => {
				throw new Error('blocked');
			}
		});
		expect(readStoredLevels()).toBeNull();
		expect(() => storeLevels(new Set(['easy']))).not.toThrow();
		expect(() => storeLevels(new Set())).not.toThrow();
	});
});

describe('filterHidesAnchor', () => {
	const categories = [
		{ id: 'klassiske', hearts: [{ id: 'classic-3x3', difficulty: 'easy' as const }] },
		{
			id: 'moenstre',
			hearts: [
				{ id: 'jul', difficulty: 'hard' as const },
				{ id: 'a b', difficulty: 'expert' as const }
			]
		}
	];

	it('is true for a category the filter empties and a card it hides', () => {
		const easy = new Set(['easy'] as const);
		expect(filterHidesAnchor('moenstre', categories, easy)).toBe(true);
		expect(filterHidesAnchor('heart-jul', categories, easy)).toBe(true);
		// Card anchors replace what an id may not carry.
		expect(filterHidesAnchor('heart-a-b', categories, easy)).toBe(true);
	});

	it('is false for what the filter shows, for anything else and without a filter', () => {
		const easy = new Set(['easy'] as const);
		expect(filterHidesAnchor('klassiske', categories, easy)).toBe(false);
		expect(filterHidesAnchor('heart-classic-3x3', categories, easy)).toBe(false);
		expect(filterHidesAnchor('moenstre', categories, new Set(['hard']))).toBe(false);
		expect(filterHidesAnchor('mine', categories, easy)).toBe(false);
		expect(filterHidesAnchor('heart-my-own', categories, easy)).toBe(false);
		expect(filterHidesAnchor('skabeloner', categories, easy)).toBe(false);
		expect(filterHidesAnchor('', categories, easy)).toBe(false);
		expect(filterHidesAnchor('moenstre', categories, new Set())).toBe(false);
	});
});
