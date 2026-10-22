/**
 * A motif on a board, standing in for a letter: the small motifs repeat it on
 * the checkerboard, equal squares set it in the centre square. Shared by the
 * generator and the pictures drawn before the cuts (see `picture`).
 */
import type { GeneratorRequest } from './generate';
import { boardLines, boardRangeLines, boardRangePattern, boardRanges, type Point, type Ring } from './geometry';
import { checkeredLayouts } from './checkeredGrid';

/** The motif in place of a letter: repeated on the checkerboard by the small
 * motifs, alone in a row of square cells by the equal squares. */
export const MOTIF = '*';

/** The strips per side the visitor can choose for each frame on a board, and
 * the one it starts at: the figure in the checks, the small motifs, the equal
 * squares, whose motif lies in the centre square of an odd number, and the
 * circle on them, about the centre square too (see `boardRanges`). The small
 * motifs and equal squares choose for themselves until the visitor does (see
 * `motifChoices`, `squareChoices`). */
export const BOARD_STRIPS = {
	strips: { min: 3, max: 6, step: 1, initial: 4 },
	motifs: { min: 2, max: 8, step: 1, initial: 4 },
	squares: { min: 3, max: 9, step: 2, initial: 3 },
	board: { min: 3, max: 9, step: 2, initial: 5 }
} as const;
export type BoardStyle = keyof typeof BOARD_STRIPS;

/** One way a frame on a board lays its motif out, as the text of a text
 * frame: on the checkerboard for the small motifs, in a row of square cells
 * for the equal squares, there up to a tenth `larger` in its square, with the
 * airy frame's room around it, or in cells `fitted` to it. Tried in turn (see
 * `frameAlternatives`): without `retries` quickly, a `lastResort` only where
 * no other can be built at all. */
export type BoardChoice = { text: string; board: number; retries: boolean; lastResort?: boolean; larger?: number; air?: boolean; fitted?: boolean; alone?: boolean };

/** The small motifs on a board of `n` strips, the most copies first: on every
 * square of one colour, the rows of the heart's diamond taking turns (each
 * line is one row, as in the text frame), the colour with the top and bottom
 * squares first where both have as many; on three strips, though, first
 * three across the middle, the frame's own choice there (see
 * `motifChoices`). A colour whose squares the checkerboard can only connect
 * on its board through neighbouring junctions, else on a larger one (with
 * every corner of the diamond, say), is left out. */
export function motifPatterns(n: number): string[] {
	const colour = (first: number) => Array.from({ length: 2 * n - 1 }, (_, row) =>
		(row % 2 === first ? MOTIF : ' ').repeat(Math.min(row + 1, 2 * n - 1 - row))).join('\n');
	const copies = (text: string) => [...text].filter(c => c === MOTIF).length;
	const onBoard = (text: string) => {
		try {
			return checkeredLayouts(text).every(layout => layout.matrix.length === n);
		} catch {
			return false;
		}
	};
	return [...n === 3 ? [MOTIF.repeat(3)] : [], ...[colour(0), colour(1)].filter(onBoard).sort((a, b) => copies(b) - copies(a))];
}

/** The small motifs' choices: on the `n` strips the visitor chose, its
 * patterns, and only where none can be built at all, the fewest and largest
 * copies, on the smallest boards. Until the visitor chooses, the most copies
 * that cut cleanly, a clean smaller board before a hard-to-cut larger one:
 * on four strips, then three across a 3×3 board, then two on 2×2. */
export function motifChoices(n?: number): BoardChoice[] {
	const fewest: [number, string][] = [[3, MOTIF.repeat(3)], ...motifPatterns(2).map(text => [2, text] as [number, string])];
	// Where not even two copies connect, one alone in the centre square, as
	// equal squares build it on three strips, rather than refusing.
	const alone = squareChoices().map((choice): BoardChoice => ({ ...choice, lastResort: true, alone: true }));
	if (n === undefined) return [...[...motifPatterns(4).map(text => [4, text] as [number, string]), ...fewest.slice(0, 2)]
		.map(([board, text]) => ({ text, board, retries: true })), ...alone];
	const own = motifPatterns(n);
	return [...own.map(text => ({ text, board: n, retries: true })),
		...fewest.filter(([, text]) => !own.includes(text)).map(([board, text]) => ({ text, board, retries: true, lastResort: true })), ...alone];
}

/** The motif alone in the centre square of a board of `n` strips, an odd
 * number: the middle one of a row of n − 2 square cells (see
 * `generateTextGrid`). */
export function centredMotif(n: number): string {
	const beside = ' '.repeat((n - 3) / 2);
	return beside + MOTIF + beside;
}

/** The equal squares' choices on `n` strips, three until the visitor
 * chooses: the motif in the centre square, up to a tenth larger in it or with
 * the airy frame's room around it, each first quickly, then with every retry.
 * Only where none can be built at all, three strips' choices, then cells
 * fitted to the motif rather than refusing. A motif whose sides cannot meet
 * the cells beside it (four ports, see `generateCheckedText`) has only three
 * strips; one that three cannot hold never fit five in the corpus either. */
export function squareChoices(n = 3): BoardChoice[] {
	const on = (board: number, lastResort = false): BoardChoice[] =>
		[...[1, 1.05, 1.1].map(larger => ({ larger })), { air: true }, ...lastResort ? [] : [{ retries: true }]]
			.map(choice => ({ text: centredMotif(board), board, retries: false, lastResort, ...choice }));
	return [...on(n), ...n === 3 ? [] : on(3, true), { text: MOTIF, board: 3, retries: true, lastResort: true, fitted: true }];
}

/** A motif on a board fills its square or circle at the visitor's size,
 * relative to the default 70%, within what its cell can hold. */
export function boardScale(request: GeneratorRequest): number {
	return Math.max(.6, Math.min(1.1, (request.scale ?? .7) / .7));
}

/** The circle on a board of `strips` strips (odd, five by default) at a size
 * setting: smoothly from the smallest radius the board allows to the
 * largest, with the touching circle at the default 70%, where the motif is
 * first divided, and from there each range of the board in turn (see
 * `boardRanges`), each over a share of the settings to 100% in proportion to
 * its radii, the step between two of them over a junction no larger than
 * one within them: on five strips the circle reaches the next ring's corner
 * junctions at 85%, past which it overlaps the corner squares; on three
 * strips one construction all the way. It passes a line's tangent slightly
 * beyond it, and steps a little further beyond the touching circle, the
 * corners just past it being too close to cut. `range` is the
 * construction's. */
export function boardRadius(scale: number, strips = 5) {
	const ranges = boardRanges(strips), setting = Math.max(.45, Math.min(1, scale));
	const [small, large] = ranges;
	let radius = !large ? small[0] + (setting - .45) / .55 * (small[1] - small[0])
		: small[0] + (setting - .45) / .25 * (small[1] - small[0]), range = small;
	if (large && setting > .7) {
		const steps = boardSteps(strips), found = steps.findIndex(([, end]) => setting <= end / 100), i = found < 0 ? steps.length - 1 : found;
		const [start, end] = steps[i], [low, high] = range = ranges[i + 1];
		radius = low + Math.max(0, setting - start / 100) / ((end - start) / 100) * (high - low);
	}
	for (const line of boardLines(strips)) if (Math.abs(radius - line) < .1) radius = line + .1;
	if (large && radius > large[0] && radius < large[0] + .6) radius = large[0] + .6;
	return { radius, range };
}

/** Which construction past the motif in four's reach a size setting on
 * `strips` strips takes, if any: every line routed by a completion
 * ('pattern'), or the middle lines left out ('past') (see `boardRanges`),
 * where whether a motif can be divided is decided apart from the sizes below. */
export function boardStage(scale: number, strips = 5): '' | 'pattern' | 'past' {
	const { range } = boardRadius(scale, strips);
	return boardRangePattern(range) ? 'pattern' : boardRangeLines(range, strips).length < boardLines(strips).length ? 'past' : '';
}

/** The settings, in whole percents, over which each of a board's ranges past
 * the touching circle grows (see `boardRadius`): from 70% to 100%, a share for
 * each in proportion to its radii (the largest remainders rounded up), and
 * one step between each two, over a junction. */
export function boardSteps(strips: number): readonly (readonly [number, number])[] {
	const known = stepsByStrips.get(strips);
	if (known) return known;
	// A percent between ranges is the step over a junction; ranges that meet
	// share their percent instead.
	const ranges = boardRanges(strips).slice(1), spans = ranges.map(([low, high]) => high - low);
	const meets = ranges.map((range, i) => i > 0 && Math.abs(ranges[i - 1][1] - range[0]) < 1e-9);
	// Each percent in turn to the range that grows most per percent, so that
	// none grows faster than it must.
	const free = 30 - meets.slice(1).filter(m => !m).length, counts = spans.map(() => 1);
	for (let left = free - counts.length; left > 0; left--) {
		const i = spans.reduce((best, span, k) => span / counts[k] > spans[best] / counts[best] ? k : best, 0);
		counts[i]++;
	}
	let start = 70;
	const steps = counts.map((count, i): readonly [number, number] => {
		if (meets[i]) start--;
		const range = [start, start + count] as const;
		start += count + 1;
		return range;
	});
	stepsByStrips.set(strips, steps);
	return steps;
}
const stepsByStrips = new Map<number, readonly (readonly [number, number])[]>();

/** The size setting a circle's radius on `strips` strips stands for: where a
 * motif keeps another construction's circle. One in a step between two
 * ranges (a motif kept whole stops at any radius) stands for the setting
 * past the step, the first whose circle is at least as large. */
export function boardSetting(radius: number, strips = 5): number {
	const ranges = boardRanges(strips), [small, large] = ranges;
	if (!large) return .45 + (radius - small[0]) / (small[1] - small[0]) * .55;
	if (radius <= small[1]) return .45 + (radius - small[0]) / (small[1] - small[0]) * .25;
	const found = ranges.slice(1).findIndex(([, high]) => radius <= high), i = found < 0 ? ranges.length - 2 : found;
	const [start, end] = boardSteps(strips)[i], [low, high] = ranges[i + 1];
	return start / 100 + Math.max(0, radius - low) / (high - low) * ((end - start) / 100);
}

/** The smallest circle around the points: around their convex hull, built
 * point by point (Welzl's construction) in a fixed scattered order, so the
 * same motif is always placed alike. */
export function enclosingCircle(points: Point[]): { centre: Point; radius: number } {
	const turn = (o: Point, a: Point, b: Point) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
	const chain = (sorted: Point[]) => {
		const result: Point[] = [];
		for (const p of sorted) {
			while (result.length > 1 && turn(result[result.length - 2], result[result.length - 1], p) <= 0) result.pop();
			result.push(p);
		}
		return result.slice(0, -1);
	};
	const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
	const hull = sorted.length < 3 ? sorted : [...chain(sorted), ...chain([...sorted].reverse())];
	const order = hull.map((_, i) => hull[(i * 7919) % hull.length]);
	const two = (a: Point, b: Point) => ({ centre: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] as Point, radius: Math.hypot(a[0] - b[0], a[1] - b[1]) / 2 });
	const three = (a: Point, b: Point, c: Point) => {
		const d = 2 * (a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1]));
		if (Math.abs(d) < 1e-12) return [two(a, b), two(b, c), two(a, c)].reduce((x, y) => y.radius > x.radius ? y : x);
		const [qa, qb, qc] = [a, b, c].map(p => p[0] * p[0] + p[1] * p[1]);
		const centre: Point = [(qa * (b[1] - c[1]) + qb * (c[1] - a[1]) + qc * (a[1] - b[1])) / d,
			(qa * (c[0] - b[0]) + qb * (a[0] - c[0]) + qc * (b[0] - a[0])) / d];
		return { centre, radius: Math.hypot(a[0] - centre[0], a[1] - centre[1]) };
	};
	let circle = { centre: order[0] ?? [0, 0] as Point, radius: 0 };
	const outside = (p: Point) => Math.hypot(p[0] - circle.centre[0], p[1] - circle.centre[1]) > circle.radius + 1e-9;
	for (let i = 1; i < order.length; i++) if (outside(order[i])) {
		circle = { centre: order[i], radius: 0 };
		for (let j = 0; j < i; j++) if (outside(order[j])) {
			circle = two(order[i], order[j]);
			for (let k = 0; k < j; k++) if (outside(order[k])) circle = three(order[i], order[j], order[k]);
		}
	}
	return circle;
}

/** Where a motif sits in the circle on a board, `along` the way from its
 * box's centre to its smallest enclosing circle's, where its farthest points
 * reach equally far and it fills the circle furthest (a deer's antler and
 * hooves), and how far it then reaches, as a fraction of the side of its box,
 * which sizes it. */
export function boardPlacement(contours: Ring[], along = 1): { centre: Point; reach: number; box: number } {
	const points = contours.flat(), xs = points.map(p => p[0]), ys = points.map(p => p[1]);
	const box = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
	const middle: Point = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
	const { centre: enclosing } = enclosingCircle(points);
	const centre: Point = [middle[0] + along * (enclosing[0] - middle[0]), middle[1] + along * (enclosing[1] - middle[1])];
	return { centre, reach: Math.max(...points.map(p => Math.hypot(p[0] - centre[0], p[1] - centre[1]))) / box, box };
}

/** How far over the corner squares a size setting is, from 85% to 100%: how
 * far a motif that sits on its enclosing circle there has moved to it, so it
 * moves and grows smoothly with the setting. */
export const enclosedAlong = (scale: number) => Math.min(1, Math.max(0, (scale - .85) / .15));
