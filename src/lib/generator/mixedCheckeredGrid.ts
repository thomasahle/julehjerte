/** Some glyphs need four connections instead of two. Each 2×2 group chooses a
 * compatible combination, with interleaved connections along its grid edges.
 * The group's boundary still has one open cut per sheet, so groups compose
 * without changing the visible checkerboard or the number of paper strips. */
import { gridClearance } from '$lib/geometry/clearance';
import { checkeredLayout, checkeredLetters, emptyCell, edgeReach, sharedRays, CORNER_INSETS, type checkeredGridCache } from './checkeredGrid';
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

function contacts(quadrant: number, side: number, four: number, corner: boolean[], corners: [number, number]): number[] {
	const neighbour = (quadrant + (side ? 1 : 3)) % 4;
	// A corner cut and the square after it (never four-port) stay near the junction.
	if (corner[quadrant]) return [corners[side]];
	if (!side && corner[neighbour]) return [corners[0]];
	const ownFour = !!(four & (1 << quadrant)), otherFour = !!(four & (1 << neighbour));
	// Two adjacent four-port cells alternate their connections along the edge.
	// With only one four-port cell, its two connections straddle its neighbour's.
	return ownFour ? otherFour ? side ? [.4, .8] : [.2, .6] : [.2, .8]
		: otherFour ? [.5] : [side ? .65 : .35];
}

export function generateMixedCheckeredGrid(text: string, font: Font, options: {
	balanced?: boolean;
	strokeTips?: boolean;
	cache?: ReturnType<typeof mixedCheckeredGridCache>;
	previous?: ReturnType<typeof checkeredGridCache>;
	variant?: number;
	fill?: number;
	/** The corner cuts' reach (`CORNER_INSETS`, or `printCornerInsets`). */
	corners?: [number, number];
} = {}) {
	const corners = options.corners ?? CORNER_INSETS;
	const { matrix, groups, letterGroup } = checkeredLayout(text, options.variant), n = matrix.length, cell = 100 / n;
	const letter = checkeredLetters(matrix, font, options.fill ?? .82);
	const margin = gridClearance(n), cache = options.cache ?? mixedCheckeredGridCache();
	const edges: Edge[] = [], artwork: Ring[] = [];
	const flips: { axis: number; line: number; from: number; to: number }[] = [];
	const placements = matrix.map((line, row) => line.map((char, col) => {
		if ((row + col) % 2) artwork.push([[col * cell, row * cell], [(col + 1) * cell, row * cell],
			[(col + 1) * cell, (row + 1) * cell], [col * cell, (row + 1) * cell]]);
		if (char === undefined) return [];
		const contours = letter(char, row, col);
		artwork.push(...contours);
		return contours;
	}));
	const pieceAt = (g: number, q: number, four: number, corner: boolean[]): Cell | false => {
		const [row, col] = groups[g].cells[q];
		const origin: Point = [col * cell, row * cell];
		const owner: Point = [groups[g].x * cell, groups[g].y * cell];
		const shared = sharedRays(groups, g), reach = `${n}:${Number(shared[q])}${Number(shared[(q + 1) % 4])}`;
		const contact = (ray: number, d: number): Point => [
			owner[0] + [1, 0, -1, 0][ray] * cell * edgeReach(d, shared[ray]),
			owner[1] + [0, 1, 0, -1][ray] * cell * edgeReach(d, shared[ray])
		];
		const first = contacts(q, 0, four, corner, corners), second = contacts(q, 1, four, corner, corners);
		const char = corner[q] ? undefined : matrix[row][col];
		const hasFour = first.length === 2;
		const baseKey = `${char}:${q}:${reach}:${first}:${second}:${Number(hasFour && !!options.balanced)}`;
		const key = baseKey + (options.strokeTips ? ':tips' : '');
		if (cache.has(key)) return cache.get(key)!;
		if (options.strokeTips) {
			const prior = cache.get(baseKey);
			if (prior && (prior.usable ??= usableMotif(prior.edges, prior.gates, margin))) return prior;
		}
		const gates = [...first.map(d => contact(q, d)), ...second.slice().reverse().map(d => contact((q + 1) % 4, d))];
		// A square without a letter keeps only the two-port pairing.
		if (char === undefined) {
			const result = hasFour ? false : { origin, edges: emptyCell(gates), gates };
			cache.set(key, result);
			return result;
		}
		// Reuse the original two-port pass where its connection positions match.
		// The alternate pass changes only four-port routing; two-port cells and
		// failed local routes stay cached across all group-layout choices.
		const previous = !hasFour && !options.strokeTips ? options.previous?.get(`${char}:${q}:${reach}:${first[0]},${second[0]}:0:0`) : undefined;
		if (previous) { cache.set(key, previous); return previous; }
		const contours = placements[row][col], local: Edge[] = [], center = centroid(contours.flat());
		try {
			if (hasFour) (options.balanced ? balancedFourPortMotif : fourPortMotif)(local, contours, gates,
				gates.map(p => Math.atan2(center[1] - p[1], center[0] - p[0])), margin, undefined, undefined,
				{ strokeTips: options.strokeTips });
			else twoPortMotif(local, contours, gates, margin, { strokeTips: options.strokeTips });
			const result = { origin, edges: local, gates };
			cache.set(key, result);
			return result;
		} catch (error) {
			if (!(error instanceof ConstructionError)) throw error;
			cache.set(key, false);
			return false;
		}
	};
	for (const [g, { x, y, cells }] of groups.entries()) {
		const owner: Point = [x * cell, y * cell], shared = sharedRays(groups, g);
		const corner = cells.map(([r, c]) => matrix[r][c] !== undefined && letterGroup.get(`${r},${c}`) !== g);
		// Four-port squares stay clear of corner cuts and the squares after them.
		const near = corner.reduce((mask, cut, q) => cut ? mask | 1 << q | 1 << (q + 1) % 4 | 1 << (q + 3) % 4 : mask, 0);
		let selected: { four: number; phase: number; pieces: Cell[] } | undefined;
		for (const [four, phase] of layouts) {
			if (four & near) continue;
			const pieces: Cell[] = [];
			for (const q of cells.keys()) {
				const piece = pieceAt(g, q, four, corner);
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
			for (const side of [0, 1]) for (const d of contacts(q, side, four, corner, corners)) {
				const ray = (q + side) % 4, axis = ray % 2;
				const coordinate = owner[axis] + [1, 1, -1, -1][ray] * cell * edgeReach(d, shared[ray]);
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
