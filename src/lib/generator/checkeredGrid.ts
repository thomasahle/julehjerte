/** Cyclic letters on the classical checkerboard. Neighbouring letters share
 * grid junctions, with two coincident bridges per letter. The grid changes
 * sheet at every bridge, so the letter and its background both remain paper. */
import { MAX_GRID_SIZE } from '$lib/constants';
import { gridClearance } from '$lib/geometry/clearance';
import { repeatedText } from './repeatedText';
import {
	ConstructionError, type Font, type Ring, type Point, type Edge,
	twoPortMotif, add, compile
} from './geometry';

export function generateCheckeredGrid(text: string, font: Font, fill = .82) {
	const repeated = repeatedText(text);
	if (!repeated) throw new ConstructionError('empty', 'Empty text');
	const word = repeated.split('\n')[0];
	const letters = [...word], n = letters.length * (letters.length % 2 ? 2 : 1);
	const matrix = Array.from({ length: n }, (_, row) => Array.from({ length: n }, (_, col) => letters[(row + col) % letters.length]));
	if (n > MAX_GRID_SIZE) throw new ConstructionError('clearance', 'Too many letters for the repeated grid');
	const glyphs = [...new Set(matrix.flat())].map(char => {
		if (!font.glyphs[char]) throw new ConstructionError('character', char);
		return font.glyphs[char];
	});
	const points = glyphs.flatMap(g => g.contours.flat());
	if (!points.length) throw new ConstructionError('empty', 'No letter outlines');
	const minY = Math.min(...points.map(p => p[1])), maxY = Math.max(...points.map(p => p[1]));
	const cy = (minY + maxY) / 2, cell = 100 / n;
	const edges: Edge[] = [], artwork: Ring[] = [];
	const cache = new Map<string, { origin: Point; edges: Edge[] }>();
	// The combined letter-and-colour period is even. Four neighbouring letters
	// share each alternate grid junction, so every cut stays an open strip.
	const owners: { x: number; y: number; cells: [number, number][] }[] = [];
	for (let row = 0; row < n; row += 2) for (let col = 0; col < n; col += 2)
		owners.push({ x: col + 1, y: row + 1, cells: [[row, col], [row, col + 1], [row + 1, col], [row + 1, col + 1]] });
	const flips: { axis: number; line: number; from: number; to: number }[] = [];
	for (const owner of owners) {
		const quadrants = owner.cells.map(([r, c]) => r >= owner.y ? c >= owner.x ? 0 : 1 : c < owner.x ? 2 : 3);
		for (const [index, [row, col]] of owner.cells.entries()) {
			const q = quadrants[index];
			const contact = (ray: number, start: boolean): Point => {
				const d = cell * (start ? .35 : .65);
				const origin: Point = [owner.x * cell, owner.y * cell];
				const p: Point = [origin[0] + [1, 0, -1, 0][ray] * d, origin[1] + [0, 1, 0, -1][ray] * d];
				const axis = ray % 2 ? 1 : 0;
				flips.push({ axis, line: origin[1 - axis], from: Math.min(origin[axis], p[axis]), to: Math.max(origin[axis], p[axis]) });
				return p;
			};
			const a = contact(q, true), b = contact((q + 1) % 4, false);
			const glyph = font.glyphs[matrix[row][col]], xs = glyph.contours.flat().map(p => p[0]);
			const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
			const scale = cell * fill / ((maxY - minY + Math.max(...xs) - Math.min(...xs)) * Math.SQRT1_2);
			const contours = glyph.contours.map(r => r.map(([x, y]): Point => [
				(col + .5) * cell + ((x - cx) + (y - cy)) * Math.SQRT1_2 * scale,
				(row + .5) * cell + ((y - cy) - (x - cx)) * Math.SQRT1_2 * scale
			]));
			const key = matrix[row][col] + ':' + q, prior = cache.get(key);
			const origin: Point = [col * cell, row * cell];
			if (prior) {
				const move = (p: Point): Point => [p[0] + origin[0] - prior.origin[0], p[1] + origin[1] - prior.origin[1]];
				edges.push(...prior.edges.map(e => ({ ...e, from: move(e.from), to: move(e.to) })));
			} else {
				const local: Edge[] = [];
				twoPortMotif(local, contours, [a, b], gridClearance(n));
				cache.set(key, { origin, edges: local });
				edges.push(...local);
			}
			artwork.push(...contours);
			if ((row + col) % 2) artwork.push([[col * cell, row * cell], [(col + 1) * cell, row * cell], [(col + 1) * cell, (row + 1) * cell], [col * cell, (row + 1) * cell]]);
		}
	}
	for (const axis of [0, 1]) for (let i = 1; i < n; i++) {
		const line = i * cell, intervals = flips.filter(f => f.axis === axis && Math.abs(f.line - line) < 1e-7);
		const stops = [...new Set([0, 100, ...Array.from({ length: n - 1 }, (_, j) => (j + 1) * cell), ...intervals.flatMap(f => [f.from, f.to])])].sort((a, b) => a - b);
		for (let j = 1; j < stops.length; j++) {
			const mid = (stops[j - 1] + stops[j]) / 2;
			const flip = intervals.filter(f => mid > f.from && mid < f.to).length % 2;
			const p = (t: number): Point => axis ? [line, t] : [t, line];
			add(edges, [p(stops[j - 1]), p(stops[j])], (axis + flip) % 2 ? 'A' : 'B', 'frame');
		}
	}
	return { edges, artwork, geometry: compile(edges), overlapAspectRatio: 1, domain: [[[0, 0], [100, 0], [100, 100], [0, 100]] as Ring] };
}
