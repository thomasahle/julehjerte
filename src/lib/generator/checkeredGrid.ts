/** Cyclic letters on the classical checkerboard. Neighbouring letters share
 * grid junctions, with two coincident bridges per letter. The grid changes
 * sheet at every bridge, so the letter and its background both remain paper. */
import { MAX_GRID_SIZE } from '$lib/constants';
import { gridClearance } from '$lib/geometry/clearance';
import { repeatedText } from './repeatedText';
import { cellTipCounts, fewerCutTips } from './cutQuality';
import {
	ConstructionError, type Font, type Ring, type Point, type Edge,
	twoPortMotif, usableMotif, relieveMotifTips, add, compile
} from './geometry';

type LetterCell = {
	origin: Point;
	edges: Edge[];
	gates: Point[];
	insets: [number, number];
	usable?: boolean;
	tips?: [number, number];
	relieved?: LetterCell | null;
};

/** Scoped to one text/font/fill request; shared by its construction passes. */
export function checkeredGridCache() {
	return new Map<string, LetterCell>();
}

export function generateCheckeredGrid(text: string, font: Font, fill = .82, contactInset = .35,
	options: { balanced?: boolean; onCrowded?: () => void; repair?: boolean; onRepair?: () => void; optimize?: boolean; relieve?: boolean; cache?: ReturnType<typeof checkeredGridCache> } = {}) {
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
	const cache = options.cache ?? checkeredGridCache();
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
			const contact = (ray: number, inset: number): Point => {
				const d = cell * inset;
				const origin: Point = [owner.x * cell, owner.y * cell];
				return [origin[0] + [1, 0, -1, 0][ray] * d, origin[1] + [0, 1, 0, -1][ray] * d];
			};
			const glyph = font.glyphs[matrix[row][col]], xs = glyph.contours.flat().map(p => p[0]);
			const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
			const scale = cell * fill / ((maxY - minY + Math.max(...xs) - Math.min(...xs)) * Math.SQRT1_2);
			const contours = glyph.contours.map(r => r.map(([x, y]): Point => [
				(col + .5) * cell + ((x - cx) + (y - cy)) * Math.SQRT1_2 * scale,
				(row + .5) * cell + ((y - cy) - (x - cx)) * Math.SQRT1_2 * scale
			]));
			const origin: Point = [col * cell, row * cell];
			const key = (a: number, b: number, balanced = false, compound = false) =>
				`${matrix[row][col]}:${q}:${a},${b}:${Number(balanced)}:${Number(compound)}`;
			const baseKey = key(contactInset, 1 - contactInset, options.balanced);
			const construct = (a: number, b: number, compound = false): LetterCell => {
				const id = key(a, b, options.balanced, compound), prior = cache.get(id);
				if (prior) return prior;
				const local: Edge[] = [], gates = [contact(q, a), contact((q + 1) % 4, b)];
				twoPortMotif(local, contours, gates, gridClearance(n), {
					balanced: options.balanced, onCrowded: options.onCrowded, compound
				});
				const result: LetterCell = { origin, edges: local, gates, insets: [a, b] };
				cache.set(id, result);
				return result;
			};
			const usable = (piece: LetterCell) => piece.usable ??=
				usableMotif(piece.edges, piece.gates, gridClearance(n));
			const repairKey = baseKey + ':repair';
			let piece = cache.get(options.repair ? repairKey : baseKey);
			if (!piece && options.repair) {
				// Reuse clear cells from either established pass. Only a failed
				// letter needs new bridges or different attachment positions.
				for (const balanced of [options.balanced ?? false, true]) {
					const prior = cache.get(key(contactInset, 1 - contactInset, balanced));
					if (prior && usable(prior)) { piece = prior; break; }
				}
				if (!piece) for (const [a, b] of [
					[contactInset, 1 - contactInset], [.2, .65], [.35, .8], [.2, .8],
					[.45, .65], [.35, .55], [.45, .55], [.2, .55], [.45, .8]
				]) {
					try {
						const candidate = construct(a, b, true);
						if (usable(candidate)) { piece = candidate; break; }
					} catch (error) {
						if (!(error instanceof ConstructionError)) throw error;
					}
				}
				if (!piece) throw new ConstructionError('clearance', 'No clear letter connections');
				cache.set(repairKey, piece);
			}
			piece ??= construct(contactInset, 1 - contactInset);
			if (options.optimize) {
				// The uniform-spacing passes already built these alternatives. Mix
				// their best cells without another routing search. Every choice keeps
				// its two connections on the same sides of the grid-edge midpoint.
				const tips = (cell: LetterCell) => cell.tips ??= cellTipCounts(cell.edges,
					cell.gates.map((point, i) => ({ point, axis: (q + i) % 2 })));
				const relieve = (candidate: LetterCell) => {
					if (options.relieve && tips(candidate)[1] && usable(candidate)) {
						if (candidate.relieved === undefined) {
							const dx = candidate.origin[0] - origin[0], dy = candidate.origin[1] - origin[1];
							const localContours = dx || dy ? contours.map(r => r.map(([x, y]): Point => [x + dx, y + dy])) : contours;
							const improved = relieveMotifTips(candidate.edges, localContours, candidate.gates,
								gridClearance(n), [q % 2, (q + 1) % 2]);
							candidate.relieved = improved ? { ...candidate, edges: improved, tips: undefined, usable: true } : null;
						}
					}
					return options.relieve && candidate.relieved || candidate;
				};
				piece = relieve(piece);
				const prefix = `${matrix[row][col]}:${q}:`;
				for (const [id, candidate] of cache) {
					if (!id.startsWith(prefix)) continue;
					const improved = relieve(candidate);
					if (fewerCutTips(tips(improved), tips(piece)) && usable(improved)) piece = improved;
				}
			}
			if (options.repair && piece !== cache.get(baseKey)) options.onRepair?.();
			const selected = piece;
			const move = (p: Point): Point => [p[0] + origin[0] - selected.origin[0], p[1] + origin[1] - selected.origin[1]];
			edges.push(...(origin[0] === piece.origin[0] && origin[1] === piece.origin[1] ? piece.edges
				: piece.edges.map(e => ({ ...e, from: move(e.from), to: move(e.to) }))));
			// Each start remains before the midpoint and each end after it.
			// Neighbouring letters keep their cyclic order and a clear gap on
			// the shared grid edge, even when their preferred positions differ.
			for (const [i, ray] of [q, (q + 1) % 4].entries()) {
				const p = contact(ray, piece.insets[i]), axis = ray % 2 ? 1 : 0;
				const junction: Point = [owner.x * cell, owner.y * cell];
				flips.push({ axis, line: junction[1 - axis], from: Math.min(junction[axis], p[axis]), to: Math.max(junction[axis], p[axis]) });
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
