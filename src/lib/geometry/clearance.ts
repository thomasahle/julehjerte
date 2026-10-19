/** Denser grids may use proportionally finer cuts. This is a construction
 * assumption (about 25 mm per strip), not a requested print size. */
export function gridClearanceScale(columns: number, rows = columns): number {
	return 4 / Math.max(4, columns, rows);
}

export const BASE_CLEARANCE = 1.5;

/** Minimum gap in the generator's normalized 100-unit square. */
export function gridClearance(columns: number, rows = columns): number {
	return BASE_CLEARANCE * gridClearanceScale(columns, rows);
}
