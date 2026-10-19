/**
 * A motif on a board, standing in for a letter: the small motifs repeat it on
 * the checkerboard, equal squares set it in the centre square. Shared by the
 * generator and the pictures drawn before the cuts (see `picture`).
 */
import type { GeneratorRequest } from './generate';
import { BOARD_RADII } from './geometry';

/** The motif in place of a letter, so that it repeats on the checkerboard:
 * on every square of one colour of a 4×4 board, else three across the middle
 * of a 3×3 board, else two above each other on a 2×2 board. Each line is one
 * row of the heart's diamond, as in the text frame. */
export const MOTIF = '*', MOTIF_PATTERNS = ['*\n  \n***\n    \n***\n  \n*', '***', '*\n  \n*'];

/** A motif on a board fills its square or circle at the visitor's size,
 * relative to the default 70%, within what its cell can hold. */
export function boardScale(request: GeneratorRequest): number {
	return Math.max(.6, Math.min(1.1, (request.scale ?? .7) / .7));
}

/** The circle on a board at a size setting: smoothly from the smallest
 * radius the board allows to the largest, with the touching circle at the
 * default 70%, where the one change of construction lies. It passes the outer
 * lines' tangent slightly beyond it, and just beyond the touching circle it
 * touches, the corners there being too close to cut. `range` is the
 * construction's: up to the touching circle, or reaching into the outer ring. */
export function boardRadius(scale: number) {
	const [small, large] = BOARD_RADII, setting = Math.max(.45, Math.min(.85, scale));
	let radius = setting <= .7 ? small[0] + (setting - .45) / .25 * (small[1] - small[0])
		: large[0] + (setting - .7) / .15 * (large[1] - large[0]);
	if (Math.abs(radius - 30) < .1) radius = 30.1;
	if (radius > large[0] && radius < large[0] + .6) radius = large[0];
	return { radius, range: radius <= small[1] ? small : large };
}
