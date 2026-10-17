import { describe, expect, it } from 'vitest';
import { formatHeartDate, parseHeartDate } from './date';

describe('formatHeartDate', () => {
	it('formats every way the data writes a day in the page language', () => {
		for (const raw of ['2025-12-25', '25/12/2025', 'Dec 25, 2025']) {
			expect(formatHeartDate(raw, 'da')).toBe('25. dec. 2025');
			expect(formatHeartDate(raw, 'en')).toBe('25 Dec 2025');
		}
		expect(formatHeartDate('2026-10-14', 'da')).toBe('14. okt. 2026');
		expect(formatHeartDate('2026-10-14', 'en')).toBe('14 Oct 2026');
	});

	it('leaves a bare year and anything unreadable as written', () => {
		expect(formatHeartDate('2012', 'da')).toBe('2012');
		expect(formatHeartDate('jul 2012?', 'en')).toBe('jul 2012?');
		expect(formatHeartDate('31/02/2025', 'da')).toBe('31/02/2025');
	});
});

describe('parseHeartDate', () => {
	it('reads day-first slashes, not month-first', () => {
		expect(parseHeartDate('05/12/2025')).toEqual({ year: 2025, month: 12, day: 5 });
	});
});
