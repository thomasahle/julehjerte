/**
 * The completions of the circle on a board with every line (see
 * `boardCompletion`), one for each stretch of radii between the board's
 * junctions where the motif in four cannot meet every line's end, found by
 * the exact completion search (docs/inverse/exact-weave-solvability.tex,
 * scratchpad weave/search3.mjs) with the motif's four panels as they are,
 * every hidden cut across the white circle running through one white square
 * outside it, and room for each switch point. No imports: the board's ranges
 * read these as the geometry module loads.
 */

/** One hidden cut, as the search prints it: its kind (a pocket across the red
 * square beside its chain; a cut across the white region cutting off the arc
 * of the boundary from its first point counterclockwise, or the other way; a
 * spoke in to the motif), its face, the two points of the first quarter turn
 * it joins (the second `dq` quarter turns on): the circle's switch points
 * chain by chain, then the motif's outline (two spokes, then the seam). */
export type PatternChord = [kind: 'pocket' | 'arc+' | 'arc-' | 'spoke', face: number | 'p', i: number, j: number, dq: number];
export type BoardPattern = { counts: number[]; motif: number; chords: PatternChord[] };

/** Past the junction of the third line out from the middle with the second,
 * a quarter turn of the boundary has three chains crossing the circle: one
 * along the second line, round the circle and out along the third; its mirror
 * image; and one across the middle. */
const PAST_SECOND: PatternChord[] = [['pocket', 'p', 0, 4, 0], ['arc-', 0, 1, 15, 3], ['arc-', 0, 2, 13, 3], ['arc+', 0, 3, 6, 0],
	['pocket', 'p', 5, 9, 0], ['spoke', 0, 7, 16, 0], ['arc+', 0, 8, 10, 0], ['pocket', 'p', 11, 14, 0], ['spoke', 0, 12, 17, 0]];
const line = (strips: number, k: number) => 100 / strips * (k + .5);

/** The patterns: the board, the radii between which its boundary has the
 * pattern's chains, and those where it cuts cleanly. */
export const BOARD_PATTERNS: { strips: number; lo: number; hi: number; pattern: BoardPattern }[] = [
	// Seven strips, past the outer lines' junction (41.65).
	{ strips: 7, lo: Math.hypot(line(7, 2), line(7, 1)) + .4, hi: 46.5, pattern: { counts: [5, 5, 6], motif: 3, chords: PAST_SECOND } },
	// Nine strips short of its outer lines are seven, smaller, with those
	// lines crossing the paper whole: the white squares the circle cuts end
	// on them, their sides there two chains with no switch points.
	{ strips: 9, lo: Math.hypot(line(9, 2), line(9, 1)) + .4, hi: 35.6, pattern: { counts: [0, 5, 5, 0, 6], motif: 3, chords: PAST_SECOND } },
	// Nine strips past their outer lines' junctions with the middle ones and
	// the third lines' with each other (39.3), short of the outer lines'
	// with the second (42.3): a quarter turn has two chains round red squares
	// beside the diagonal, each from and back to one edge of the paper, the
	// two sides of the white corner square between them, and two chains
	// either side of the middle, each along the outer line and round to the
	// middle line's. Cuts from one chain to another past a third cross the
	// white squares' mouths along the circle. The switch points crowd the
	// middle chains' short arcs below 40.2, and the second lines' sides
	// beside the junction above 41.
	{ strips: 9, lo: 40.2, hi: 41, pattern: {
		counts: [2, 0, 0, 6, 1, 9], motif: 3,
		chords: [['arc-', 0, 0, 15, 3], ['arc+', 0, 1, 2, 0], ['pocket', 'p', 3, 7, 0], ['arc-', 0, 4, 14, 3], ['spoke', 0, 5, 18, 0],
			['arc+', 0, 6, 11, 0], ['arc+', 0, 8, 10, 0], ['pocket', 'p', 9, 17, 0], ['pocket', 'p', 12, 16, 0], ['spoke', 0, 13, 19, 0]]
	} }
];
