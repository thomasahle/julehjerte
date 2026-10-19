/** The typed letters on the classical checkerboard, one per square.
 * Neighbouring letters share grid junctions, with two coincident bridges per
 * letter. The grid changes sheet at every bridge, so the letter and its
 * background both remain paper. */
import { MAX_GRID_SIZE } from '$lib/constants';
import { gridClearance } from '$lib/geometry/clearance';
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

/** A grid junction (x, y, in squares) and the four squares around it in
 * quadrant order SE, SW, NW, NE. Each square of the group is joined to the
 * junction's grid lines by one bridge: its letter, or a plain shared cut. */
export type CheckeredGroup = { x: number; y: number; cells: [number, number][] };
export type CheckeredLayout = {
	matrix: (string | undefined)[][];
	groups: CheckeredGroup[];
	/** The group each lettered square connects through, keyed "row,col". */
	letterGroup: Map<string, number>;
};

/** A square whose letter connects through another group keeps this short
 * cut across the corner at this group's junction, clear of its letter. The
 * square after it connects inside the cut. */
export const CORNER_INSETS: [number, number] = [.1, .25];

/** The typed lines on a square checkerboard, one character per square. The
 * heart shows the board turned 45°, so each line is one horizontal row of the
 * diamond: its squares touch at their corners and share a colour, and the next
 * line's squares sit between them. A line is centred where its row's parity
 * allows and otherwise half a square to one side. On the smallest board that
 * fits and connects, the lines fill their rows as fully as they can, then the
 * most lines are centred, then the block sits as near the widest row as it can.
 * Nothing is repeated; a visitor who wants a pattern types it. Spaces stay
 * plain squares. A later variant keeps the placement and chooses the next best
 * junctions, for letters whose first connections leave narrow paper. */
export function checkeredLayout(text: string, variant = 0): CheckeredLayout {
	const layouts = checkeredLayouts(text);
	if (variant >= layouts.length) throw new ConstructionError('topology', 'No further checkerboard connections');
	return layouts[variant];
}

const layoutCache = new Map<string, CheckeredLayout[]>();
export function checkeredLayouts(text: string): CheckeredLayout[] {
	let layouts = layoutCache.get(text);
	if (!layouts) {
		layouts = placeLetters(text);
		if (layoutCache.size > 50) layoutCache.clear();
		layoutCache.set(text, layouts);
	}
	return layouts;
}

function placeLetters(text: string): CheckeredLayout[] {
	if (!text.trim()) throw new ConstructionError('empty', 'Empty text');
	const lines = text.normalize('NFC').replace(/\r\n?/g, '\n').split('\n').map(line => [...line]);
	const k = lines.length;
	let smaller: CheckeredLayout[] = [];
	for (let n = 2; n <= MAX_GRID_SIZE; n++) {
		// Rows v = row + col run from the top corner (0) to the bottom (2n - 2).
		const offset = (top: number) => Math.abs(top + (k - 1) / 2 - (n - 1));
		const placements: { top: number; centres: number[]; shifted: number }[] = [];
		for (let top = 0; top + k - 1 <= 2 * n - 2; top++) {
			// Positions h = col - row along row v share v's parity. A line whose
			// centre cannot be 0 sits half a square left, or else right.
			const shifts = lines.map((line, i) => line.length && (top + i + line.length - 1) % 2 ? [-1, 1] : [0]);
			for (const centres of shifts.reduce<number[][]>((all, options) =>
				all.flatMap(prefix => options.map(shift => [...prefix, shift])), [[]]))
				if (lines.every((line, i) => {
					const v = top + i;
					return !line.length || Math.abs(centres[i]) + line.length - 1 <= Math.min(v, 2 * n - 2 - v);
				})) placements.push({ top, centres, shifted: centres.filter(Boolean).length });
		}
		// Pack the lines into the diamond: fewest empty squares beside them in
		// their rows, so a triangle such as JUL / JU / L fills a tip. The heart
		// is mirror symmetric: then keep the most lines centred, then the block
		// nearest the widest row. The first line, usually the main word, then
		// gets the wider row, else the higher one. The sort keeps left first.
		const width = (v: number) => Math.min(v, 2 * n - 2 - v);
		const spare = (top: number) => lines.reduce((sum, line, i) =>
			sum + (line.length && width(top + i) + 1 - line.length), 0);
		placements.sort((a, b) => spare(a.top) - spare(b.top) || a.shifted - b.shifted ||
			offset(a.top) - offset(b.top) || width(b.top) - width(a.top) || a.top - b.top);
		// The best placement's junction choices come first. When all of them
		// leave narrow paper, the next placement's best choice can still be clean.
		const connect = (neighbours: boolean) => {
			const layouts: CheckeredLayout[] = [];
			for (const { top, centres } of placements) {
				const matrix: (string | undefined)[][] = Array.from({ length: n }, () => Array(n).fill(undefined));
				for (const [i, line] of lines.entries()) for (const [j, char] of line.entries()) {
					const v = top + i, h = centres[i] - (line.length - 1) + 2 * j;
					if (char.trim()) matrix[(v - h) / 2][(v + h) / 2] = char;
				}
				const connections = connectLetters(matrix, neighbours);
				if (!connections.length) continue;
				if (layouts.length) return [...layouts, { matrix, ...connections[0] }];
				layouts.push(...connections.map(connection => ({ matrix, ...connection })));
			}
			return layouts;
		};
		const layouts = connect(false);
		if (layouts.length) return [...smaller, ...layouts];
		// Neighbouring junctions crowd their connections into half an edge each,
		// so they are only for a board that otherwise cannot connect. The next
		// board, without them, remains for letters that need the room.
		if (!smaller.length) smaller = connect(true);
	}
	if (smaller.length) return smaller;
	throw new ConstructionError('clearance', 'Too many letters for the checkerboard');
}

export function checkeredMatrix(text: string): (string | undefined)[][] {
	return checkeredLayout(text).matrix;
}

/** Choose one grid junction at a corner of every lettered square. Junctions
 * normally never share a grid edge, so no grid line belongs to two groups; a
 * square can still lie between two junctions at opposite corners. With
 * `neighbours`, junctions may share an edge, each keeping its connections in
 * its own half of it (`edgeReach`). Prefer the fewest lettered squares that
 * also need a corner cut, then the fewest junctions and neighbouring pairs;
 * return the few best choices in that order. */
function connectLetters(matrix: (string | undefined)[][], neighbours = false): Omit<CheckeredLayout, 'matrix'>[] {
	const n = matrix.length;
	const letters = matrix.flatMap((line, row) => line.flatMap((char, col) => char === undefined ? [] : [[row, col] as [number, number]]));
	const key = (y: number, x: number) => y * (n + 1) + x;
	// Side corners first: there the neighbouring letters of a line meet.
	const corners = letters.map(([row, col]) => [[row, col + 1], [row + 1, col], [row, col], [row + 1, col + 1]]
		.filter(([y, x]) => y > 0 && x > 0 && y < n && x < n).map(([y, x]) => key(y, x)));
	const order = letters.map((_, i) => i).sort((a, b) => corners[a].length - corners[b].length);
	const chosen = new Set<number>(), assigned: number[] = [];
	const best: { cost: number; junctions: number[]; assigned: number[] }[] = [];
	let budget = 20000;
	const adjacent = (j: number) => [j - 1, j + 1, j - (n + 1), j + (n + 1)].filter(other => chosen.has(other)).length;
	const blocked = (j: number) => !neighbours && adjacent(j) > 0;
	const extra = () => corners.reduce((sum, own) => sum + Math.max(0, own.filter(j => chosen.has(j)).length - 1), 0);
	const crowded = () => [...chosen].reduce((sum, j) => sum + adjacent(j), 0) / 2;
	const search = (index: number) => {
		if (--budget < 0) return;
		const cost = chosen.size + 2 * extra() + crowded();
		if (best.length === 3 && cost >= best[2].cost) return;
		if (index === order.length) {
			best.push({ cost, junctions: [...chosen], assigned: [...assigned] });
			best.sort((a, b) => a.cost - b.cost).splice(3);
			return;
		}
		const letter = order[index];
		const options = corners[letter].filter(j => chosen.has(j) || !blocked(j))
			.sort((a, b) => Number(chosen.has(b)) - Number(chosen.has(a)));
		for (const j of options) {
			const added = !chosen.has(j);
			if (added) chosen.add(j);
			assigned[letter] = j;
			search(index + 1);
			if (added) chosen.delete(j);
		}
	};
	search(0);
	return best.map(({ junctions, assigned: owners }) => {
		const groups = junctions.map(j => {
			const y = Math.floor(j / (n + 1)), x = j % (n + 1);
			return { x, y, cells: [[y, x], [y, x - 1], [y - 1, x - 1], [y - 1, x]] as [number, number][] };
		});
		const letterGroup = new Map(letters.map(([row, col], i) => [`${row},${col}`, junctions.indexOf(owners[i])]));
		return { groups, letterGroup };
	});
}

/** How far along a grid edge, in squares, a connection at `inset` sits from
 * its junction. When the junction at the edge's other end also connects
 * letters, each keeps its connections in its own half: the pieces of the edge
 * that the two groups give to the other sheet stay apart, so the cuts remain
 * open strips. Corner cuts are already that close and stay where they are. */
export function edgeReach(inset: number, shared: boolean): number {
	return shared ? Math.min(inset, .25 + (inset - .25) / 3) : inset;
}

/** Which of a group's four rays (E, S, W, N) end at another group's junction. */
export function sharedRays(groups: CheckeredGroup[], g: number): boolean[] {
	const { x, y } = groups[g];
	return [[1, 0], [0, 1], [-1, 0], [0, -1]].map(([dx, dy]) => groups.some(other => other.x === x + dx && other.y === y + dy));
}

/** A square without a letter in a group that has letters keeps the group's
 * two-port pairing with one coincident cut between its connections. */
export function emptyCell(gates: Point[]): Edge[] {
	const edges: Edge[] = [];
	add(edges, [gates[0], gates[1]], 'AB', 'shared');
	return edges;
}

/** The letters of one text share one size, upright on their squares turned
 * 45°. The widest letter, at the text's full height, fills `fill` of its
 * square; the others keep that size, centred, so a narrow I stays as tall as
 * its neighbours rather than growing to fill its own square. */
export function checkeredLetters(matrix: (string | undefined)[][], font: Font, fill: number) {
	const glyphs = [...new Set(matrix.flat().filter(char => char !== undefined))].map(char => {
		if (!font.glyphs[char]) throw new ConstructionError('character', char);
		return font.glyphs[char];
	});
	const points = glyphs.flatMap(g => g.contours.flat());
	if (!points.length) throw new ConstructionError('empty', 'No letter outlines');
	const minY = Math.min(...points.map(p => p[1])), maxY = Math.max(...points.map(p => p[1]));
	const span = (contours: Ring[]) => { const xs = contours.flat().map(p => p[0]); return [Math.min(...xs), Math.max(...xs)]; };
	const width = Math.max(...glyphs.filter(g => g.contours.length).map(g => { const [left, right] = span(g.contours); return right - left; }));
	const cy = (minY + maxY) / 2, cell = 100 / matrix.length;
	const scale = cell * fill / ((maxY - minY + width) * Math.SQRT1_2);
	return (char: string, row: number, col: number): Ring[] => {
		const { contours } = font.glyphs[char], [left, right] = span(contours), cx = (left + right) / 2;
		return contours.map(r => r.map(([x, y]): Point => [
			(col + .5) * cell + ((x - cx) + (y - cy)) * Math.SQRT1_2 * scale,
			(row + .5) * cell + ((y - cy) - (x - cx)) * Math.SQRT1_2 * scale
		]));
	};
}

/** Scoped to one text/font/fill request; shared by its construction passes. */
export function checkeredGridCache() {
	return new Map<string, LetterCell>();
}

export function generateCheckeredGrid(text: string, font: Font, fill = .82, contactInset = .35,
	options: { balanced?: boolean; onCrowded?: () => void; repair?: boolean; onRepair?: () => void; optimize?: boolean; relieve?: boolean; cache?: ReturnType<typeof checkeredGridCache>; variant?: number } = {}) {
	const { matrix, groups, letterGroup } = checkeredLayout(text, options.variant), n = matrix.length;
	const letter = checkeredLetters(matrix, font, fill), cell = 100 / n;
	const edges: Edge[] = [], artwork: Ring[] = [];
	const cache = options.cache ?? checkeredGridCache();
	for (let row = 0; row < n; row++) for (let col = 0; col < n; col++)
		if ((row + col) % 2) artwork.push([[col * cell, row * cell], [(col + 1) * cell, row * cell], [(col + 1) * cell, (row + 1) * cell], [col * cell, (row + 1) * cell]]);
	// Lettered squares share the junctions of their groups, so every cut stays
	// an open strip. Squares outside every group are the ordinary checkerboard.
	const flips: { axis: number; line: number; from: number; to: number }[] = [];
	for (const [g, owner] of groups.entries()) {
		const corner = owner.cells.map(([row, col]) => matrix[row][col] !== undefined && letterGroup.get(`${row},${col}`) !== g);
		const shared = sharedRays(groups, g);
		for (const [q, [row, col]] of owner.cells.entries()) {
			const char = corner[q] ? undefined : matrix[row][col];
			// After a corner cut, this square's first connection stays inside it.
			const first = (inset: number) => corner[(q + 3) % 4] ? Math.min(inset, CORNER_INSETS[0]) : inset;
			// Cells keep their cuts relative to their connections, which differ
			// beside a neighbouring junction.
			// The layouts of one text can differ in board size, too.
			const reach = `${n}:${Number(shared[q])}${Number(shared[(q + 1) % 4])}`;
			const contact = (ray: number, inset: number): Point => {
				const d = cell * edgeReach(inset, shared[ray]);
				const origin: Point = [owner.x * cell, owner.y * cell];
				return [origin[0] + [1, 0, -1, 0][ray] * d, origin[1] + [0, 1, 0, -1][ray] * d];
			};
			// Each start remains before the midpoint and each end after it.
			// Neighbouring letters keep their cyclic order and a clear gap on
			// the shared grid edge, even when their preferred positions differ.
			const flip = (insets: [number, number]) => {
				for (const [i, ray] of [q, (q + 1) % 4].entries()) {
					const p = contact(ray, insets[i]), axis = ray % 2 ? 1 : 0;
					const junction: Point = [owner.x * cell, owner.y * cell];
					flips.push({ axis, line: junction[1 - axis], from: Math.min(junction[axis], p[axis]), to: Math.max(junction[axis], p[axis]) });
				}
			};
			if (char === undefined) {
				const insets: [number, number] = corner[q] ? CORNER_INSETS : [first(contactInset), 1 - contactInset];
				edges.push(...emptyCell([contact(q, insets[0]), contact((q + 1) % 4, insets[1])]));
				flip(insets);
				continue;
			}
			const contours = letter(char, row, col);
			const origin: Point = [col * cell, row * cell];
			const key = (a: number, b: number, balanced = false, compound = false) =>
				`${char}:${q}:${reach}:${first(a)},${b}:${Number(balanced)}:${Number(compound)}`;
			const baseKey = key(contactInset, 1 - contactInset, options.balanced);
			const construct = (a: number, b: number, compound = false): LetterCell => {
				a = first(a);
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
				const prefix = `${char}:${q}:${reach}:`;
				for (const [id, candidate] of cache) {
					if (!id.startsWith(prefix) || first(candidate.insets[0]) !== candidate.insets[0]) continue;
					const improved = relieve(candidate);
					if (fewerCutTips(tips(improved), tips(piece)) && usable(improved)) piece = improved;
				}
			}
			if (options.repair && piece !== cache.get(baseKey)) options.onRepair?.();
			const selected = piece;
			const move = (p: Point): Point => [p[0] + origin[0] - selected.origin[0], p[1] + origin[1] - selected.origin[1]];
			edges.push(...(origin[0] === piece.origin[0] && origin[1] === piece.origin[1] ? piece.edges
				: piece.edges.map(e => ({ ...e, from: move(e.from), to: move(e.to) }))));
			flip(piece.insets);
			artwork.push(...contours);
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
