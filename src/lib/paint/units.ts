/**
 * Sizes as Mal states them: in millimetres of a woven square taken to be
 * 100 mm, not in the mask's cells, which are nothing a visitor cuts. A
 * 400-cell mask's cell is a quarter of a millimetre, so the pen's radius runs
 * from 0,25 to 50 mm. Only the words change; the tools still count cells.
 */

import type { Language } from '$lib/i18n';
import { MASK_SIZE } from './mask';

/** How wide the woven square is taken to be, in millimetres. */
export const SQUARE_MM = 100;

/** `cells` of a mask `size` cells wide, in millimetres of the square. */
export const cellsToMm = (cells: number, size = MASK_SIZE): number => (cells * SQUARE_MM) / size;

/**
 * `cells` in millimetres, in the visitor's notation (Danish 12,5, English
 * 12.5): to a hundredth below 10 mm, where a quarter millimetre is a cell,
 * and to a tenth above.
 */
export function formatMm(cells: number, lang: Language, size = MASK_SIZE): string {
	const mm = cellsToMm(cells, size);
	return mm.toLocaleString(lang === 'en' ? 'en' : 'da', { maximumFractionDigits: mm < 10 ? 2 : 1 });
}
