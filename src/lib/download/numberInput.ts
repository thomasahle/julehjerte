/**
 * The download dialog's number fields: every one of them is whole millimetres
 * (or a whole count), and a Danish visitor writes a decimal comma.
 */

/**
 * What a typed value means, a decimal comma read as a point. NaN for anything
 * that is not a number (a blank too), which the caller refuses.
 */
export function parseNumberInput(raw: string): number {
	const text = raw.trim().replace(',', '.');
	return text ? Number(text) : NaN;
}

/**
 * The same, rounded to a whole number: what a field settles on when the
 * visitor leaves it. (Not while typing: "80.5" would turn into "81" under
 * the cursor.)
 */
export function parseWholeNumber(raw: string): number {
	return Math.round(parseNumberInput(raw));
}

/**
 * A `type=number` field never shows the script a comma: English-UI Chrome
 * reads "80,5" as 805 (a thousands separator) before `value` is read. So the
 * comma key types a point instead, which every browser takes as the decimal
 * separator. If the browser cannot insert it, the comma goes through as before.
 */
export function typeDecimalPoint(event: KeyboardEvent): void {
	if (event.key !== ',' || event.ctrlKey || event.metaKey || event.altKey) return;
	if (typeof document.execCommand === 'function' && document.execCommand('insertText', false, '.')) {
		event.preventDefault();
	}
}
