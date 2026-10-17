/**
 * A heart's "Dato" in the page's language. The data holds whatever its source
 * wrote: ISO dates, "25/12/2025" (day first, Danish style), "Dec 25, 2025" and
 * bare years. A day is shown as a medium date ("25. dec. 2025" /
 * "25 Dec 2025"); a year, or anything that cannot be read, as written.
 */
import type { Language } from '$lib/i18n';

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

const LOCALES: Record<Language, string> = { da: 'da-DK', en: 'en-GB' };

/** The calendar day a date string names, or null. */
export function parseHeartDate(raw: string): { year: number; month: number; day: number } | null {
	const text = raw.trim();
	let year: number, month: number, day: number;
	let m: RegExpMatchArray | null;
	if ((m = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) {
		[year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
	} else if ((m = text.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/))) {
		[day, month, year] = [Number(m[1]), Number(m[2]), Number(m[3])];
	} else if ((m = text.match(/^([a-z]{3,9})\.? (\d{1,2}),? (\d{4})$/i))) {
		// "Dec 25, 2025": an English month name or its first three letters.
		month = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase()) + 1;
		if (month === 0) return null;
		[day, year] = [Number(m[2]), Number(m[3])];
	} else {
		return null;
	}
	const check = new Date(Date.UTC(year, month - 1, day));
	if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) {
		return null;
	}
	return { year, month, day };
}

export function formatHeartDate(raw: string, lang: Language): string {
	const date = parseHeartDate(raw);
	if (!date) return raw.trim();
	return new Intl.DateTimeFormat(LOCALES[lang], { dateStyle: 'medium', timeZone: 'UTC' }).format(
		new Date(Date.UTC(date.year, date.month - 1, date.day))
	);
}
