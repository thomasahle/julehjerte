import { normalizeText } from './state';

/** A six-row text field, with each successive copy shifted one letter.
 * Multiline messages cycle their lines; each line is shown in full at least once. */
export function repeatedText(text: string): string {
	const lines = normalizeText(text).split('\n').map((line) => [...line.trim()]).filter((line) => line.length);
	if (!lines.length) return '';
	const columns = Math.max(8, ...lines.map((line) => line.length));
	return Array.from({ length: 6 }, (_, row) => {
		const letters = lines[row % lines.length];
		const shift = Math.floor(row / lines.length);
		return Array.from({ length: columns }, (_, column) => letters[(column + shift) % letters.length]).join('');
	}).join('\n');
}
