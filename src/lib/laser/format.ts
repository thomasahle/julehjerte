/**
 * Numbers as the laser files and the dialog write them.
 */
import type { Language } from '$lib/i18n';

/**
 * A coordinate in a file: millimetres to three decimals (a micrometre, far
 * below any beam), without trailing zeros and never as "-0".
 */
export function coord(n: number): string {
	const fixed = n.toFixed(3).replace(/\.?0+$/, '');
	return fixed === '-0' ? '0' : fixed;
}

/** A length for people: one decimal at most, with a decimal comma in Danish. */
export function formatMm(n: number, lang: Language): string {
	const text = (Math.round(n * 10) / 10).toFixed(1).replace(/\.0$/, '');
	return lang === 'da' ? text.replace('.', ',') : text;
}
