/** Some glyphs need four connections instead of two. Each 2×2 group chooses a
 * compatible combination, with interleaved connections along its grid edges.
 * The group's boundary still has one open cut per sheet, so groups compose
 * without changing the visible checkerboard or the number of paper strips. */
import { MAX_GRID_SIZE } from '$lib/constants';
import { gridClearance } from '$lib/geometry/clearance';
import { repeatedText } from './repeatedText';
import type { checkeredGridCache } from './checkeredGrid';
import {
	ConstructionError, fourPortMotif, balancedFourPortMotif, twoPortMotif, usableMotif,
	add, compile, centroid, type Font, type Ring, type Point, type Edge
} from './geometry';

// Bits select the SE, SW, NW and NE cells, in cyclic order. The second mask
// exchanges the two paper families in the selected four-port cells. These are
// the pairings that keep both cuts open across the group's opposite edges.
const layouts = [[0, 0], [1, 0], [2, 2], [4, 0], [8, 8], [5, 0], [5, 5],
	[10, 0], [10, 10], [15, 5], [15, 10]];
type Cell = { origin: Point; edges: Edge[]; gates: Point[]; usable?: boolean };
export const mixedCheckeredGridCache = () => new Map<string, Cell | false>();

function contacts(quadrant: number, side: number, four: number): number[] {
	const neighbour = (quadrant + (side ? 1 : 3)) % 4;
	const ownFour = !!(four & (1 << quadrant)), otherFour = !!(four & (1 << neighbour));
	// Two adjacent four-port cells alternate their connections along the edge.
	// With only one four-port cell, its two connections straddle its neighbour's.
	return ownFour ? otherFour ? side ? [.4, .8] : [.2, .6] : [.2, .8]
		: otherFour ? [.5] : [side ? .65 : .35];
}

export function generateMixedCheckeredGrid(text: string, font: Font, options: {
	balanced?: boolean;
	cache?: ReturnType<typeof mixedCheckeredGridCache>;
	previous?: ReturnType<typeof checkeredGridCache>;
} = {}) {
	const repeated = repeatedText(text);
	if (!repeated) throw new ConstructionError('empty', 'Empty text');
	const letters = [...repeated.split('\n')[0]], n = letters.length * (letters.length % 2 ? 2 : 1), cell = 100 / n;
	if (n > MAX_GRID_SIZE) throw new ConstructionError('clearance', 'Too many letters for the repeated grid');
	const matrix = Array.from({ length: n }, (_, row) => Array.from({ length: n }, (_, col) => letters[(row + col) % letters.length]));
	const glyphs = [...new Set(matrix.flat())].map(char => {
		if (!font.glyphs[char]) throw new ConstructionError('character', char);
		return font.glyphs[char];
	});
	const points = glyphs.flatMap(g => g.contours.flat());
	if (!points.length) throw new ConstructionError('empty', 'No letter outlines');
	const minY = Math.min(...points.map(p => p[1])), maxY = Math.max(...points.map(p => p[1])), cy = (minY + maxY) / 2;
	const margin = gridClearance(n), cache = options.cache ?? mixedCheckeredGridCache();
	const edges: Edge[] = [], artwork: Ring[] = [];
	const flips: { axis: number; line: number; from: number; to: number }[] = [];
	const placements = matrix.map((line, row) => line.map((char, col) => {
		const glyph = font.glyphs[char], xs = glyph.contours.flat().map(p => p[0]);
		const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
		const scale = cell * .82 / ((maxY - minY + Math.max(...xs) - Math.min(...xs)) * Math.SQRT1_2);
		const contours = glyph.contours.map(r => r.map(([x, y]): Point => [
			(col + .5) * cell + ((x - cx) + (y - cy)) * Math.SQRT1_2 * scale,
			(row + .5) * cell + ((y - cy) - (x - cx)) * Math.SQRT1_2 * scale
		]));
		artwork.push(...contours);
		if ((row + col) % 2) artwork.push([[col * cell, row * cell], [(col + 1) * cell, row * cell],
			[(col + 1) * cell, (row + 1) * cell], [col * cell, (row + 1) * cell]]);
		return contours;
	}));
	const pieceAt = (row: number, col: number, four: number): Cell | false => {
		const q = row % 2 ? col % 2 ? 0 : 1 : col % 2 ? 3 : 2;
		const origin: Point = [col * cell, row * cell];
		const owner: Point = [(Math.floor(col / 2) * 2 + 1) * cell, (Math.floor(row / 2) * 2 + 1) * cell];
		const contact = (ray: number, d: number): Point => [
			owner[0] + [1, 0, -1, 0][ray] * cell * d, owner[1] + [0, 1, 0, -1][ray] * cell * d
		];
		const first = contacts(q, 0, four), second = contacts(q, 1, four), char = matrix[row][col];
		const hasFour = first.length === 2;
		const key = `${char}:${q}:${first}:${second}:${Number(hasFour && !!options.balanced)}`;
		if (cache.has(key)) return cache.get(key)!;
		const gates = [...first.map(d => contact(q, d)), ...second.slice().reverse().map(d => contact((q + 1) % 4, d))];
		// Reuse the original two-port pass where its connection positions match.
		// The alternate pass changes only four-port routing; two-port cells and
		// failed local routes stay cached across all group-layout choices.
		const previous = !hasFour ? options.previous?.get(`${char}:${q}:${first[0]},${second[0]}:0:0`) : undefined;
		if (previous) { cache.set(key, previous); return previous; }
		const contours = placements[row][col], local: Edge[] = [], center = centroid(contours.flat());
		try {
			if (hasFour) (options.balanced ? balancedFourPortMotif : fourPortMotif)(local, contours, gates,
				gates.map(p => Math.atan2(center[1] - p[1], center[0] - p[0])), margin);
			else twoPortMotif(local, contours, gates, margin);
			const result = { origin, edges: local, gates };
			cache.set(key, result);
			return result;
		} catch (error) {
			if (!(error instanceof ConstructionError)) throw error;
			cache.set(key, false);
			return false;
		}
	};
	for (let row = 0; row < n; row += 2) for (let col = 0; col < n; col += 2) {
		const cells = [[row + 1, col + 1], [row + 1, col], [row, col], [row, col + 1]];
		const owner: Point = [(col + 1) * cell, (row + 1) * cell];
		let selected: { four: number; phase: number; pieces: Cell[] } | undefined;
		for (const [four, phase] of layouts) {
			const pieces: Cell[] = [];
			for (const [r, c] of cells) {
				const piece = pieceAt(r, c, four);
				if (!piece || !(piece.usable ??= usableMotif(piece.edges, piece.gates, margin))) break;
				pieces.push(piece);
			}
			if (pieces.length === 4) { selected = { four, phase, pieces }; break; }
		}
		if (!selected) throw new ConstructionError('clearance', 'No clear mixed letter connections');
		const { four, phase, pieces } = selected;
		for (const [q, [r, c]] of cells.entries()) {
			const piece = pieces[q], origin: Point = [c * cell, r * cell];
			const move = (p: Point): Point => [p[0] + origin[0] - piece.origin[0], p[1] + origin[1] - piece.origin[1]];
			edges.push(...piece.edges.map(e => ({ ...e, from: move(e.from), to: move(e.to),
				family: phase & (1 << q) && e.family !== 'AB' ? e.family === 'A' ? 'B' : 'A' : e.family })));
			for (const side of [0, 1]) for (const d of contacts(q, side, four)) {
				const ray = (q + side) % 4, axis = ray % 2;
				const coordinate = owner[axis] + [1, 1, -1, -1][ray] * cell * d;
				flips.push({ axis, line: owner[1 - axis], from: Math.min(owner[axis], coordinate), to: Math.max(owner[axis], coordinate) });
			}
		}
	}
	for (const axis of [0, 1]) for (let i = 1; i < n; i++) {
		const line = i * cell, intervals = flips.filter(f => f.axis === axis && Math.abs(f.line - line) < 1e-7);
		const stops = [...new Set([0, 100, ...Array.from({ length: n - 1 }, (_, j) => (j + 1) * cell),
			...intervals.flatMap(f => [f.from, f.to])])].sort((a, b) => a - b);
		for (let j = 1; j < stops.length; j++) {
			const mid = (stops[j - 1] + stops[j]) / 2;
			const flip = intervals.filter(f => mid > f.from && mid < f.to).length % 2;
			const p = (t: number): Point => axis ? [line, t] : [t, line];
			add(edges, [p(stops[j - 1]), p(stops[j])], (axis + flip) % 2 ? 'A' : 'B', 'frame');
		}
	}
	return { edges, artwork, geometry: compile(edges), overlapAspectRatio: 1,
		domain: [[[0, 0], [100, 0], [100, 100], [0, 100]] as Ring] };
}
