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
/** The pattern: switch points per chain, the motif's points a quarter, the
 * hidden cuts, and, where the search chose them, the piece of its chain each
 * switch point lies on (side, arc, side); `gates`: how far outside the motif
 * its outer gates sit, where its cuts across the circle run deep; `circle`:
 * 1 for the circle in the edge squares' colour, about a motif kept whole
 * (`motif` 1: a gate on each side). */
export type BoardPattern = { counts: number[]; motif: number; chords: PatternChord[]; pieces?: number[]; gates?: number; circle?: 0 | 1 };

/** Past the junction of the third line out from the middle with the second,
 * a quarter turn of the boundary has three chains crossing the circle: one
 * along the second line, round the circle and out along the third; its mirror
 * image; and one across the middle. */
const PAST_SECOND: PatternChord[] = [['pocket', 'p', 0, 4, 0], ['arc-', 0, 1, 15, 3], ['arc-', 0, 2, 13, 3], ['arc+', 0, 3, 6, 0],
	['pocket', 'p', 5, 9, 0], ['spoke', 0, 7, 16, 0], ['arc+', 0, 8, 10, 0], ['pocket', 'p', 11, 14, 0], ['spoke', 0, 12, 17, 0]];
const line = (strips: number, k: number) => 100 / strips * (k + .5);

/** The patterns: the board, the radii between which its boundary has the
 * pattern's chains, and those where it cuts cleanly; and how far inside the
 * circle the motif keeps there (`band`), where its cuts across the circle run
 * deep. */
export const BOARD_PATTERNS: { strips: number; lo: number; hi: number; band?: number; pattern: BoardPattern }[] = [
	// Seven strips, past the outer lines' junction (41.65).
	{ strips: 7, lo: Math.hypot(line(7, 2), line(7, 1)) + .4, hi: 46.5, pattern: { counts: [5, 5, 6], motif: 3, chords: PAST_SECOND } },
	// Nine strips short of its outer lines are seven, smaller, with those
	// lines crossing the paper whole: the white squares the circle cuts end
	// on them, their sides there two chains with no switch points.
	{ strips: 9, lo: Math.hypot(line(9, 2), line(9, 1)) + .4, hi: 35.6, pattern: { counts: [0, 5, 5, 0, 6], motif: 3, chords: PAST_SECOND } },
	// Further on, the fewest switch points the crossings allow (12 a quarter;
	// found by the CP-SAT search, which also chose the piece each lies on)
	// leave the middle chain one on each short side and no pocket. Its cut
	// past the outer line's chain runs two deep across the circle, so the
	// motif keeps 2.7 in and its gates sit just outside it.
	{ strips: 9, lo: 35.6, hi: 37.3, band: 2.7, pattern: {
		counts: [0, 1, 5, 0, 6], motif: 3, gates: 1.5,
		chords: [['arc-', 0, 0, 10, 3], ['pocket', 'p', 1, 5, 0], ['arc-', 0, 2, 9, 3], ['spoke', 0, 3, 12, 0], ['arc+', 0, 4, 6, 0],
			['pocket', 'p', 7, 11, 0], ['spoke', 0, 8, 13, 0]],
		pieces: [0, 1, 1, 1, 2, 2, 0, 1, 1, 1, 2, 2]
	} },
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
	} },
	// Past the outer lines' junctions with the second (42.3), short of those
	// with the third (47.8): the fewest switch points the crossings allow (22
	// a quarter, CP-SAT), its cuts nested up to four deep, so the gates sit
	// just outside the motif. Clean to 43.6.
	{ strips: 9, lo: 42.7, hi: 43.6, pattern: {
		counts: [0, 3, 0, 0, 7, 0, 10, 2], motif: 3, gates: 1.5,
		chords: [['arc-', 0, 0, 21, 3], ['arc-', 0, 1, 16, 3], ['arc+', 0, 2, 3, 0], ['pocket', 'p', 4, 8, 0], ['arc-', 0, 5, 15, 3],
			['spoke', 0, 6, 22, 0], ['arc+', 0, 7, 12, 0], ['arc+', 0, 9, 10, 0], ['pocket', 'p', 11, 19, 0], ['pocket', 'p', 13, 17, 0],
			['spoke', 0, 14, 23, 0], ['arc+', 0, 18, 20, 0]],
		pieces: [0, 1, 2, 0, 1, 1, 1, 2, 2, 2, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 0, 2]
	} }
];

/** Completions about a motif kept whole, the circle in the edge squares'
 * colour, for the circles past the touching ring's top (`boardWholeTop`):
 * the motif has a gate on each side, so the lines it cannot meet go round. */
export const WHOLE_PATTERNS: { strips: number; lo: number; hi: number; band?: number; pattern: BoardPattern }[] = [
	// Five strips past the outer lines' corner junctions (42.4): seven switch
	// points a quarter, a spoke from the outer chain's arc to the gate.
	{ strips: 5, lo: Math.hypot(30, 30) + .4, hi: 48.5, pattern: {
		counts: [5, 2], motif: 1, circle: 1,
		chords: [['pocket', 'p', 0, 4, 0], ['arc-', 0, 1, 6, 3], ['spoke', 0, 2, 7, 0], ['arc+', 0, 3, 5, 0]],
		pieces: [0, 0, 1, 2, 2, 0, 2]
	} },
	// Seven strips short of their outer lines are five, smaller: the same.
	{ strips: 7, lo: Math.hypot(line(7, 1), line(7, 1)) + .4, hi: 34.6, pattern: {
		counts: [0, 5, 0, 2], motif: 1, circle: 1,
		chords: [['pocket', 'p', 0, 4, 0], ['arc-', 0, 1, 6, 3], ['spoke', 0, 2, 7, 0], ['arc+', 0, 3, 5, 0]],
		pieces: [0, 0, 1, 2, 2, 0, 2]
	} },
	// Past the outer lines' junctions with the middle ones (36.4): eleven
	// switch points; a spoke passes under a cut across the circle, so the
	// motif keeps 3.5 in. Two lie on the second line's side short of its
	// junction with the outer line (41.65), which crowds them past 39.3; the
	// completions that keep that side free nest their cuts three deep.
	{ strips: 7, lo: Math.hypot(line(7, 2), line(7, 0)) + .4, hi: 39.3, band: 3.5, pattern: {
		counts: [5, 5, 1], motif: 1, circle: 1,
		chords: [['pocket', 'p', 0, 4, 0], ['arc-', 0, 1, 7, 3], ['spoke', 0, 2, 11, 0], ['arc+', 0, 3, 6, 0], ['pocket', 'p', 5, 9, 0], ['arc+', 0, 8, 10, 0]],
		pieces: [0, 1, 1, 2, 2, 0, 0, 1, 2, 2, 0]
	} },
	// Nine strips short of their third lines are five, smaller: the same.
	{ strips: 9, lo: Math.hypot(line(9, 1), line(9, 1)) + .4, hi: 26.9, pattern: {
		counts: [0, 5, 0, 2], motif: 1, circle: 1,
		chords: [['pocket', 'p', 0, 4, 0], ['arc-', 0, 1, 6, 3], ['spoke', 0, 2, 7, 0], ['arc+', 0, 3, 5, 0]],
		pieces: [0, 0, 1, 2, 2, 0, 2]
	} }
];
