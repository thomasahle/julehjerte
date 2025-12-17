/**
 * Math utility functions used throughout the application.
 * Consolidated from multiple files to avoid duplication.
 */

/**
 * Clamps a value to be within [min, max].
 */
export function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}

/**
 * Rounds a value to the nearest integer, then clamps it to be within [min, max].
 */
export function clampInt(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, Math.round(value)));
}

/**
 * Returns the median value of an array of numbers.
 * Returns 0 for empty arrays.
 * Does not mutate the original array.
 */
export function median(values: number[]): number {
	if (!values.length) return 0;
	const sorted = values.slice().sort((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/**
 * Clamps a value to be within [0, 1].
 */
export function clamp01(value: number): number {
	return Math.max(0, Math.min(1, value));
}
