import { normalizeText } from './state';

/** One square of cyclic shifts: ANNA → ANNA / NNAA / NAAN / AANN.
 * Whitespace does not create blank cells in the letter pattern. */
export function repeatedText(text: string): string {
	const letters = [...normalizeText(text).replace(/\s+/g, '')];
	return letters.map((_, row) =>
		letters.map((_, column) => letters[(column + row) % letters.length]).join('')
	).join('\n');
}
