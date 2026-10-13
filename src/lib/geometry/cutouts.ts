import type { HeartDesign } from '$lib/types/heart';
/** Letter counters removed from the right sheet. Coordinates stay in the
 * normalised 0–100 overlap frame, independent of the editor's pixel grid. */
export type RightCutouts = Array<Array<[number, number]>>;
export function parseRightCutouts(value: unknown): RightCutouts | undefined {
	if (!Array.isArray(value) || value.length === 0 || value.length > 100)
		return undefined;
	if (
		!value.every(
			(r) =>
				Array.isArray(r) &&
				r.length >= 3 &&
				r.length <= 2000 &&
				r.every(
					(p) =>
						Array.isArray(p) &&
						p.length === 2 &&
						p.every(
							(v) =>
								typeof v === 'number' &&
								Number.isFinite(v) &&
								v >= 0 &&
								v <= 100
						)
				)
		)
	)
		return undefined;
	return value as RightCutouts;
}
export function rightCutoutPath(
	cutouts: HeartDesign['rightCutouts'],
	rect: { left: number; top: number; width: number; height: number }
): string {
	return (cutouts ?? [])
		.map(
			(r) =>
				'M' +
				r
					.map(
						([x, y]) =>
							`${rect.left + (x * rect.width) / 100},${rect.top + (y * rect.height) / 100}`
					)
					.join('L') +
				'Z'
		)
		.join('');
}
