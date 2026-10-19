/**
 * A motif on a board, standing in for a letter: the small motifs repeat it on
 * the checkerboard, equal squares set it in the centre square. Shared by the
 * generator and the pictures drawn before the cuts (see `picture`).
 */
import type { GeneratorRequest } from './generate';

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
