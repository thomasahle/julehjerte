/** Allow about 25 mm of paper per woven strip, with the classic 100 mm minimum. */
export function gridPaperWidth(columns: number, rows = columns): number {
	return Math.max(100, 25 * Math.max(columns, rows));
}
export function normalizedClearance(widthMm: number): number {
	return (1.5 * 100) / widthMm;
}
