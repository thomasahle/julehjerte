/** Multiline text is a rectangular array of four-port cells. Adjacent letters
 * share a cut in both sheets; no counter or empty cell becomes a cut-out. */
import {
	ConstructionError,
	type Font,
	type Frame,
	type Point,
	type Ring,
	type Edge,
	uprightToSheet,
	frameRing,
	boardRing,
	ray,
	distance,
	fourPortMotif,
	usableMotif,
	add,
	compile,
	connectCellGrid
} from './geometry';
import { gridClearance } from '$lib/geometry/clearance';
import { contoursWithinBoundary } from './contours';
import { clipContours, stitch, filledSeamGate, panelDividers, panelSeamGuard } from './panels';

/** The room around each letter in its cell, as a fraction of the letters'
 * height: a number the visitor set, else the airy frame's or the woven
 * frame's own. */
export const roomOf = (air: boolean | number) => typeof air === 'number' ? air : air ? .5 : .22;

/** How large the letters are with square cells, relative to cells fitted to
 * the letters: the text block's width plus height, which the frame's size
 * divides, for each kind of cell. Narrow letters such as i, l and j make
 * square cells much wider than they need. */
export function squareCellScale(text: string, font: Font, air: boolean | number = false): number {
	const lines = text.normalize('NFC').replace(/\r\n?/g, '\n').split('\n').map(line => [...line]);
	const cols = Math.max(...lines.map(line => line.length)), rows = lines.length;
	const glyphs = lines.flat().flatMap(char => font.glyphs[char] ? [font.glyphs[char]] : []);
	const ys = glyphs.flatMap(glyph => glyph.contours.flat().map(p => p[1]));
	if (!ys.length) return 1;
	const height = Math.max(...ys) - Math.min(...ys), padding = height * roomOf(air);
	const ink = (char: string) => {
		const xs = (font.glyphs[char]?.contours ?? []).flat().map(p => p[0]);
		return xs.length ? Math.max(...xs) - Math.min(...xs) : 0;
	};
	const grid = lines.map(line => {
		const offset = Math.floor((cols - line.length) / 2);
		return Array.from({ length: cols }, (_, i) => line[i - offset] ?? ' ');
	});
	const fitted = Array.from({ length: cols }, (_, col) =>
		Math.max(height * .45, ...grid.map(row => ink(row[col]) ? ink(row[col]) + padding : 0)))
		.reduce((a, b) => a + b, 0) + rows * (height + padding);
	const cell = Math.max(height, ...grid.flat().map(ink)) + padding;
	return fitted / ((cols + rows) * cell);
}

/** The text grid's cells and the letters' scale, before anything is routed:
 * shared by `generateTextGrid` and the picture drawn before its cuts. */
export function measureTextGrid(
	text: string,
	font: Font,
	air: boolean | number = false,
	frame?: Frame,
	layout: { padding?: number; frameFill?: number; spread?: boolean; slices?: number; columns?: number; practical?: boolean; compound?: boolean; onCompound?: () => void; balanced?: boolean; onCrowded?: () => void; adaptGates?: boolean; onGateChange?: () => void; filled?: boolean; onSeamChange?: () => void; inkPanels?: boolean; bentSpokes?: boolean; adaptivePanels?: boolean; guardSeams?: boolean; boundaryIslands?: boolean; contourApproaches?: boolean; guardedAttachments?: boolean; fittedCells?: boolean; letterScale?: number; board?: number; junction?: Point; circle?: number; scale?: number; centre?: Point } = {}
) {
	const lines = text.normalize('NFC').replace(/\r\n?/g, '\n').split('\n');
	const cols = Math.max(...lines.map((l) => [...l].length)),
		rows = lines.length;
	if (!text.trim()) throw new ConstructionError('empty', 'Empty text');
	const matrix = lines.map((line) => {
		const chars = [...line],
			padding = Math.floor((cols - chars.length) / 2);
		return Array.from({ length: cols }, (_, i) => {
			const char = chars[i - padding] ?? ' ';
			const glyph = font.glyphs[char];
			if (!glyph) throw new ConstructionError('character', char);
			return { char, glyph };
		});
	});
	const points = matrix.flat().flatMap((l) => l.glyph.contours.flat());
	const minY = Math.min(...points.map((p) => p[1])),
		maxY = Math.max(...points.map((p) => p[1]));
	// A motif may sit on another centre than its box's (see `boardPlacement`);
	// its cell then reaches as far on each side of that centre.
	const centre = layout.centre,
		cy = centre?.[1] ?? (minY + maxY) / 2,
		height = centre ? 2 * Math.max(maxY - cy, cy - minY) : maxY - minY;
	const padding = height * (layout.padding ?? roomOf(air));
	// Square cells, as wide as the widest letter needs, keep every check of
	// the weave around and between the letters square.
	const ink = (glyph: Font['glyphs'][string]) => {
		const xs = glyph.contours.flat().map((p) => p[0]);
		return !xs.length ? 0 : centre ? 2 * Math.max(Math.max(...xs) - centre[0], centre[0] - Math.min(...xs))
			: Math.max(...xs) - Math.min(...xs);
	};
	// Fitted cells, as wide as their column's letters, are the fallback when
	// square ones leave too little paper.
	const cellHeight = layout.fittedCells ? height + padding
		: Math.max(height, ...matrix.flat().map(({ glyph }) => ink(glyph))) + padding;
	const widths = Array.from({ length: cols }, (_, col) => layout.fittedCells
		? Math.max(height * .45, ...matrix.map((row) => row[col].glyph.contours.length ? ink(row[col].glyph) + padding : 0))
		: cellHeight);
	// Panels that divide a letter share out its own column's ink, not the cell.
	const inkWidths = widths.map((width, col) => layout.fittedCells ? Math.max(height * .1, width - padding)
		: Math.max(height * .1, height * .45 - padding, ...matrix.map((row) => ink(row[col].glyph))));
	const span = widths.reduce((a, b) => a + b, 0),
		fullHeight = rows * cellHeight;
	// Square cells without a frame lie on the regular checkerboard: each cell,
	// or each of its square panels, is one square's diagonal wide. The lines
	// leaving the block's sides, and the outer strips beyond them, are then all
	// one square apart, on a board of columns + rows + 1 strips.
	const regular = !layout.fittedCells && !frame;
	// A given scale and circle (a motif on the regular board) are kept.
	let scale = layout.scale ?? (regular
		? 100 * Math.SQRT2 * (layout.slices ?? 1) / ((cols * (layout.columns ?? 1) + rows * (layout.slices ?? 1) + 1) * cellHeight)
		: 128 / (span + fullHeight));
	const boundary = frame ? layout.board && layout.circle ? boardRing(layout.circle / 2, layout.board) : frameRing(frame, layout.circle ?? 80) : undefined;
	if (boundary && layout.scale === undefined)
		for (const x of [-span / 2, 0, span / 2])
			for (const y of [-fullHeight / 2, 0, fullHeight / 2]) {
				if (!x && !y) continue;
				const p = uprightToSheet([x, y]);
				const hit = ray(boundary, [50, 50], Math.atan2(p[1] - 50, p[0] - 50));
				scale = Math.min(
					scale,
					((layout.frameFill ?? 0.88) * distance(hit.point, [50, 50])) / Math.hypot(x, y)
				);
			}
	return { matrix, rows, cols, height, cy, padding, cellHeight, widths, inkWidths, span, fullHeight, regular, scale, boundary, points };
}

export function generateTextGrid(
	text: string,
	font: Font,
	air: boolean | number = false,
	frame?: Frame,
	layout: { padding?: number; frameFill?: number; spread?: boolean; slices?: number; columns?: number; practical?: boolean; compound?: boolean; onCompound?: () => void; balanced?: boolean; onCrowded?: () => void; adaptGates?: boolean; onGateChange?: () => void; filled?: boolean; onSeamChange?: () => void; inkPanels?: boolean; bentSpokes?: boolean; adaptivePanels?: boolean; guardSeams?: boolean; boundaryIslands?: boolean; contourApproaches?: boolean; guardedAttachments?: boolean; fittedCells?: boolean; letterScale?: number; board?: number; junction?: Point; circle?: number; scale?: number; centre?: Point } = {}
) {
	const { matrix, rows, cols, height, cy, padding, cellHeight, widths, inkWidths, span, fullHeight, scale, boundary, points } =
		measureTextGrid(text, font, air, frame, layout);
	let edges: Edge[] = [];
	const slices = layout.slices ?? 1;
	const columns = layout.columns ?? 1;
	// All rows share their horizontal dividers. Each source column likewise
	// chooses one set of vertical dividers for all its glyphs, so adjoining
	// panels use exactly the same clip and stitch coordinates.
	// A chosen junction (relative to the glyph's centre) places the seams
	// of a glyph divided in four through it, such as a point of background.
	const junction = layout.junction;
	const splitsY = junction ? [junction[1]] : layout.adaptivePanels
		? panelDividers(points.map(p => p[1] - cy), -height / 2, height / 2, slices) : undefined;
	const splitsX = junction ? widths.map(() => [junction[0]]) : layout.adaptivePanels ? widths.map((_, col) => {
		const values = matrix.flatMap(row => {
			const xs = row[col].glyph.contours.flat().map(p => p[0]);
			const cx = layout.centre?.[0] ?? (xs.length ? (Math.min(...xs) + Math.max(...xs)) / 2 : 0);
			return xs.map(x => x - cx);
		}), inkWidth = inkWidths[col];
		return panelDividers(values, -inkWidth / 2, inkWidth / 2, columns);
	}) : undefined;
	const artwork: Ring[] = [],
		cells: Point[][][] = [],
		background: Ring[] = [];
	const cached = new Map<string, { x: number; y: number; edges: Edge[]; gates?: Point[]; shifted?: boolean }>();
	const margin = gridClearance(cols * columns + rows * slices + 1);
	// A divided glyph must keep both neighbours' seam contacts aligned.
	// Independent shifts are only safe for whole-letter cells.
	const adaptive = layout.adaptGates && columns === 1 && slices === 1;
	for (let row = 0; row < rows * slices; row++) {
		cells.push([]);
		let cursor = -span / 2;
		for (let col = 0; col < cols * columns; col++) {
			const sourceCol = Math.floor(col / columns);
			const { char, glyph } = matrix[Math.floor(row / slices)][sourceCol];
			const glyphX = (cursor + (.5 - (col % columns) / columns) * widths[sourceCol]) * scale,
				glyphY = (-fullHeight / 2 + (Math.floor(row / slices) + .5) * cellHeight) * scale;
			let x = (cursor + widths[sourceCol] / columns / 2) * scale,
				y = (-fullHeight / 2 + (row + 0.5) * cellHeight / slices) * scale;
			let w = widths[sourceCol] * scale / columns,
				h = cellHeight * scale / slices;
			if (layout.inkPanels || layout.adaptivePanels || junction) {
				// More panels should divide the letter, not its surrounding margin.
				// Retain the outside gates and distribute only the internal seams
				// over the ink dimensions. Blank cells still need positive widths.
				const inkWidth = inkWidths[sourceCol];
				const xLine = (i: number) => glyphX + (i === 0 ? -widths[sourceCol] / 2 : i === columns ? widths[sourceCol] / 2 : splitsX?.[sourceCol][i - 1] ?? (i / columns - .5) * inkWidth) * scale;
				const yLine = (i: number) => glyphY + (i === 0 ? -cellHeight / 2 : i === slices ? cellHeight / 2 : splitsY?.[i - 1] ?? (i / slices - .5) * height) * scale;
				const lo = xLine(col % columns), hi = xLine(col % columns + 1),
					up = yLine(row % slices), down = yLine(row % slices + 1);
				x = (lo + hi) / 2; y = (up + down) / 2;
				w = hi - lo; h = down - up;
			}
			cursor += widths[sourceCol] / columns;
			const gates: Point[] = [
				[x, y - h / 2],
				[x + w / 2, y],
				[x, y + h / 2],
				[x - w / 2, y]
			].map((p) => uprightToSheet(p as Point));
			cells[row].push(gates);
			if (!glyph.contours.length) {
				// Empty positions continue the surrounding weave. Making both sheets
				// follow one shared corner would turn neighbouring strips back to their
				// starting edge. Keep the regular four-port pairing instead.
				add(edges, [gates[0], gates[3]], 'A', 'frame');
				add(edges, [gates[1], gates[2]], 'A', 'frame');
				add(edges, [gates[0], gates[1]], 'B', 'frame');
				add(edges, [gates[2], gates[3]], 'B', 'frame');
				background.push(
					[
						[-1, -1],
						[1, -1],
						[1, 1],
						[-1, 1]
					].map(([a, b]) => uprightToSheet([x + (a * w) / 2, y + (b * h) / 2]))
				);
				continue;
			}
			const xs = glyph.contours.flat().map((p) => p[0]),
				cx = layout.centre?.[0] ?? (Math.min(...xs) + Math.max(...xs)) / 2;
			const letterScale = scale * (layout.letterScale ?? 1);
			let upright = glyph.contours.map(r => r.map(p => [glyphX + (p[0] - cx) * letterScale, glyphY + (p[1] - cy) * letterScale] as Point));
			if (row % slices === 0 && col % columns === 0) artwork.push(...upright.map(r => r.map(uprightToSheet)));
			if (layout.board && layout.circle) {
				// The circle's legs run straight in to the motif's outer gates. A
				// gate the circle passes inside of, the cell being square and the
				// motif large, moves in towards the centre, to midway between the
				// circle and the motif's farthest point, while it stays in its panel.
				const reach = Math.max(...upright.flat().map(p => Math.hypot(p[0], p[1]))),
					limit = (reach + layout.circle / 2) / 2;
				const outer = [row === 0, col === cols * columns - 1, row === rows * slices - 1, col === 0];
				[[x, y - h / 2], [x + w / 2, y], [x, y + h / 2], [x - w / 2, y]].forEach(([u, v], i) => {
					const k = limit / Math.hypot(u, v);
					if (outer[i] && k < 1 && Math.abs(u * k - x) <= w / 2 + 1e-9 && Math.abs(v * k - y) <= h / 2 + 1e-9)
						gates[i] = uprightToSheet([u * k, v * k]);
				});
			}
			if (columns > 1) {
				if (col % columns) upright = clipContours(upright, x - w / 2, false);
				if (col % columns < columns - 1) upright = clipContours(upright, x + w / 2, true);
				if (!upright.length) throw new ConstructionError('topology', 'Empty text panel');
			}
			if (slices > 1) {
				const swap = (r: Ring): Ring => r.map(([x, y]) => [y, x]);
				if (row % slices) upright = clipContours(upright.map(swap), y - h / 2, false).map(swap);
				if (row % slices < slices - 1) upright = clipContours(upright.map(swap), y + h / 2, true).map(swap);
				if (!upright.length) throw new ConstructionError('topology', 'Empty text panel');
			}
			if (layout.filled) {
				// Both sides choose the same solid interval of their shared seam.
				// A centre attachment can otherwise land inside a letter counter.
				const seam = (index: number, axis: 0 | 1, value: number, target: number) => {
					const point = filledSeamGate(upright, axis, value, target);
					if (!point) return;
					if (distance(gates[index], point) > 1e-6) layout.onSeamChange?.();
					gates[index] = point;
				};
				if (row % slices) seam(0, 1, y - h / 2, x);
				if (row % slices < slices - 1) seam(2, 1, y + h / 2, x);
				if (col % columns) seam(3, 0, x - w / 2, y);
				if (col % columns < columns - 1) seam(1, 0, x + w / 2, y);
			}
			const contours = upright.map(r => r.map(uprightToSheet));
			// Identical cells share routing across rows and columns.
			const key = char + ':' + widths[sourceCol] + ':' + row % slices + ':' + col % columns +
				(layout.adaptivePanels ? ':' + sourceCol : ''),
				prior = cached.get(key);
			if (prior) {
				const dx = x - prior.x,
					dy = y - prior.y;
				const move = (p: Point): Point => [
					p[0] + (dx + dy) * Math.SQRT1_2,
					p[1] + (dy - dx) * Math.SQRT1_2
				];
				if (prior.gates) gates.splice(0, gates.length, ...prior.gates.map(move));
				if (prior.shifted) layout.onGateChange?.();
				edges.push(
					...prior.edges.map((e) => ({
						...e,
						from: move(e.from),
						to: move(e.to)
					}))
				);
			} else {
				// Dividing a letter can leave its outline off centre in the cell.
				// Aiming the attachment fan towards those points offers different
				// approaches to a serif, without moving any outline or shared gate.
				const points = layout.contourApproaches ? contours.flat() : undefined;
				const centre: Point | undefined = points && [
					points.reduce((sum, p) => sum + p[0], 0) / points.length,
					points.reduce((sum, p) => sum + p[1], 0) / points.length
				];
				const connectionAllowed = layout.guardSeams ? panelSeamGuard(gates,
					[y - h / 2, x + w / 2, y + h / 2, x - w / 2],
					[row % slices > 0, col % columns < columns - 1, row % slices < slices - 1, col % columns > 0],
					layout.guardedAttachments ? contours : undefined, layout.guardedAttachments ? margin * 1.1 : 0
				) : undefined;
				const construct = () => {
					const local: Edge[] = [];
					fourPortMotif(
						local, contours, gates,
						centre ? gates.map(p => Math.atan2(centre[1] - p[1], centre[0] - p[0]))
							: [Math.PI / 4, (3 * Math.PI) / 4, (-3 * Math.PI) / 4, -Math.PI / 4],
						margin, [0, 1, 2, 3], undefined,
						{ practical: layout.practical, compound: layout.compound, onCompound: layout.onCompound, balanced: layout.balanced, onCrowded: layout.onCrowded, bentSpokes: layout.bentSpokes, boundaryIslands: layout.boundaryIslands, connectionAllowed, safeAttachments: layout.guardedAttachments }
					);
					return local;
				};
				let local: Edge[] | undefined, shifted = false;
				if (adaptive) {
					// Move opposite contacts together along the cell edges. This
					// keeps their cyclic order and all visible letter contours.
					for (const [dx, dy] of [[0, 0], [-.2, 0], [.2, 0], [0, -.2], [0, .2], [-.2, -.2], [.2, .2], [-.2, .2], [.2, -.2]]) {
						gates.splice(0, gates.length, ...[
							[x + dx * w, y - h / 2], [x + w / 2, y + dy * h],
							[x + dx * w, y + h / 2], [x - w / 2, y + dy * h]
						].map(p => uprightToSheet(p as Point)));
						try {
							const candidate = construct();
							if (usableMotif(candidate, gates, margin)) {
								local = candidate;
								shifted = dx !== 0 || dy !== 0;
								break;
							}
						} catch (error) {
							if (!(error instanceof ConstructionError)) throw error;
						}
					}
					if (!local) throw new ConstructionError('clearance', 'No clear letter connections');
				} else local = construct();
				if (shifted) layout.onGateChange?.();
				cached.set(key, { x, y, edges: local, gates: adaptive ? gates : undefined, shifted });
				edges.push(...local);
			}
		}
	}
	if (layout.guardedAttachments && boundary && !contoursWithinBoundary(artwork, boundary))
		throw new ConstructionError('clearance', 'The letters extend beyond the frame');
	if (slices > 1) {
		const dividers = Array.from({length: rows}, (_, row) => Array.from({length: slices - 1}, (_, i) =>
			(layout.inkPanels || layout.adaptivePanels || junction
				? -fullHeight / 2 + (row + .5) * cellHeight + (splitsY?.[i] ?? ((i + 1) / slices - .5) * height)
				: -fullHeight / 2 + (row + (i + 1) / slices) * cellHeight) * scale)).flat();
		edges = stitch(edges, dividers, 1);
	}
	if (columns > 1) {
		let cursor = -span / 2;
		const dividers = widths.flatMap((width, col) => {
			const values = Array.from({length: columns - 1}, (_, i) => (layout.inkPanels || layout.adaptivePanels || junction
				? cursor + width / 2 + (splitsX?.[col][i] ?? ((i + 1) / columns - .5) * Math.max(height * .1, width - padding))
				: cursor + (i + 1) * width / columns) * scale);
			cursor += width;
			return values;
		});
		edges = stitch(edges, dividers);
	}
	// On a board circle, cuts that must run round to its gates do so midway
	// between the motif and the circle (see `boardLegs`).
	const around = layout.board && layout.circle
		? (Math.max(...artwork.flat().map(p => distance(p, [50, 50]))) + layout.circle / 2) / 2 : undefined;
	connectCellGrid(edges, cells, boundary, layout.board ? 'board' : 'check', layout.spread, undefined, layout.board, around);
	const domain =
		boundary ??
		[
			[-span / 2, -fullHeight / 2],
			[span / 2, -fullHeight / 2],
			[span / 2, fullHeight / 2],
			[-span / 2, fullHeight / 2]
		].map((p) => uprightToSheet([p[0] * scale, p[1] * scale]));
	return {
		edges,
		artwork,
		geometry: compile(edges),
		domain: [domain],
		background
	};
}
