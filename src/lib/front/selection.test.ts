import { describe, it, expect } from 'vitest';
import { keepKnown, parseSelected, selectionSearch, toggleSelected } from './selection';

describe('parseSelected', () => {
	it('is empty when the parameter is absent', () => {
		expect(parseSelected('')).toEqual(new Set());
		expect(parseSelected('?other=1')).toEqual(new Set());
	});

	it('is empty for an empty or comma-only value', () => {
		expect(parseSelected('?selected=')).toEqual(new Set());
		expect(parseSelected('?selected=,,')).toEqual(new Set());
	});

	it('reads a comma-separated list and drops empty segments', () => {
		expect(parseSelected('?selected=jul,,stjerne,')).toEqual(new Set(['jul', 'stjerne']));
	});

	it('reads the list alongside other parameters', () => {
		expect(parseSelected('?a=1&selected=jul&b=2')).toEqual(new Set(['jul']));
	});

	it('de-duplicates repeated ids', () => {
		expect(parseSelected('?selected=jul,jul')).toEqual(new Set(['jul']));
	});
});

describe('toggleSelected', () => {
	it('adds an id that was not there', () => {
		expect(toggleSelected(new Set(['jul']), 'stjerne')).toEqual(new Set(['jul', 'stjerne']));
	});

	it('removes an id that was', () => {
		expect(toggleSelected(new Set(['jul', 'stjerne']), 'jul')).toEqual(new Set(['stjerne']));
	});

	it('returns a new Set, leaving the old one alone', () => {
		const before = new Set(['jul']);
		const after = toggleSelected(before, 'stjerne');
		expect(after).not.toBe(before);
		expect(before).toEqual(new Set(['jul']));
	});

	it('toggling twice is a round trip', () => {
		const start = new Set(['jul']);
		expect(toggleSelected(toggleSelected(start, 'stjerne'), 'stjerne')).toEqual(start);
	});
});

describe('keepKnown', () => {
	it('drops ids no heart on the page has', () => {
		expect(keepKnown(new Set(['jul', 'does-not-exist']), ['jul', 'stjerne'])).toEqual(
			new Set(['jul'])
		);
	});

	it('keeps every id when they all resolve', () => {
		expect(keepKnown(new Set(['jul', 'stjerne']), ['jul', 'stjerne'])).toEqual(
			new Set(['jul', 'stjerne'])
		);
	});

	it('is empty when nothing resolves', () => {
		expect(keepKnown(new Set(['a', 'b']), [])).toEqual(new Set());
	});

	it('returns a new Set, leaving the old one alone', () => {
		const before = new Set(['jul', 'gone']);
		const after = keepKnown(before, ['jul']);
		expect(after).not.toBe(before);
		expect(before).toEqual(new Set(['jul', 'gone']));
	});
});

describe('selectionSearch', () => {
	it('writes the ids in iteration order', () => {
		expect(selectionSearch(new URLSearchParams(), new Set(['jul', 'stjerne']))).toBe(
			'?selected=jul%2Cstjerne'
		);
	});

	it('drops the parameter — not just its value — when nothing is selected', () => {
		expect(selectionSearch(new URLSearchParams('?selected=jul'), new Set())).toBe('');
	});

	it('keeps other parameters when the selection is cleared', () => {
		expect(selectionSearch(new URLSearchParams('?a=1&selected=jul'), new Set())).toBe('?a=1');
	});

	it('replaces an existing selection rather than appending to it', () => {
		expect(selectionSearch(new URLSearchParams('?selected=jul'), new Set(['stjerne']))).toBe(
			'?selected=stjerne'
		);
	});

	it('round-trips through parseSelected', () => {
		const ids = new Set(['jul', 'stjerne', 'classic-3x3']);
		expect(parseSelected(selectionSearch(new URLSearchParams(), ids))).toEqual(ids);
	});

	it('leaves the input parameters untouched', () => {
		const params = new URLSearchParams('?a=1');
		selectionSearch(params, new Set(['jul']));
		expect(params.toString()).toBe('a=1');
	});
});
