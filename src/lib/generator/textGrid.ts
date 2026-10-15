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
	ray,
	distance,
	fourPortMotif,
	add,
	compile,
	connectCellGrid
} from './geometry';
import { gridClearance } from '$lib/geometry/clearance';
import { clipContours, stitch } from './panels';

export function generateTextGrid(
	text: string,
	font: Font,
	air = false,
	frame?: Frame,
	layout: { padding?: number; spread?: boolean; slices?: number; columns?: number } = {}
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
	const height = maxY - minY,
		cy = (minY + maxY) / 2;
	const padding = height * (layout.padding ?? (air ? 0.5 : 0.22)),
		cellHeight = height + padding;
	const widths = Array.from({ length: cols }, (_, col) =>
		Math.max(
			height * 0.45,
			...matrix.map((row) => {
				const xs = row[col].glyph.contours.flat().map((p) => p[0]);
				return xs.length ? Math.max(...xs) - Math.min(...xs) + padding : 0;
			})
		)
	);
	const span = widths.reduce((a, b) => a + b, 0),
		fullHeight = rows * cellHeight;
	let scale = 128 / (span + fullHeight);
	const boundary = frame ? frameRing(frame, 80) : undefined;
	if (boundary)
		for (const x of [-span / 2, 0, span / 2])
			for (const y of [-fullHeight / 2, 0, fullHeight / 2]) {
				if (!x && !y) continue;
				const p = uprightToSheet([x, y]);
				const hit = ray(boundary, [50, 50], Math.atan2(p[1] - 50, p[0] - 50));
				scale = Math.min(
					scale,
					(0.88 * distance(hit.point, [50, 50])) / Math.hypot(x, y)
				);
			}
	let edges: Edge[] = [];
	const slices = layout.slices ?? 1;
	const columns = layout.columns ?? 1;
	const artwork: Ring[] = [],
		cells: Point[][][] = [],
		background: Ring[] = [];
	const cached = new Map<string, { x: number; y: number; edges: Edge[] }>();
	const margin = gridClearance(cols * columns + rows * slices + 1);
	for (let row = 0; row < rows * slices; row++) {
		cells.push([]);
		let cursor = -span / 2;
		for (let col = 0; col < cols * columns; col++) {
			const sourceCol = Math.floor(col / columns);
			const { char, glyph } = matrix[Math.floor(row / slices)][sourceCol];
			const x = (cursor + widths[sourceCol] / columns / 2) * scale,
				glyphX = (cursor + (.5 - (col % columns) / columns) * widths[sourceCol]) * scale,
				y = (-fullHeight / 2 + (row + 0.5) * cellHeight / slices) * scale,
				glyphY = (-fullHeight / 2 + (Math.floor(row / slices) + .5) * cellHeight) * scale;
			const w = widths[sourceCol] * scale / columns,
				h = cellHeight * scale / slices;
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
				cx = (Math.min(...xs) + Math.max(...xs)) / 2;
			let upright = glyph.contours.map(r => r.map(p => [glyphX + (p[0] - cx) * scale, glyphY + (p[1] - cy) * scale] as Point));
			if (row % slices === 0 && col % columns === 0) artwork.push(...upright.map(r => r.map(uprightToSheet)));
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
			const contours = upright.map(r => r.map(uprightToSheet));
			// Identical cells share routing across rows and columns.
			const key = char + ':' + widths[sourceCol] + ':' + row % slices + ':' + col % columns,
				prior = cached.get(key);
			if (prior) {
				const dx = x - prior.x,
					dy = y - prior.y;
				const move = (p: Point): Point => [
					p[0] + (dx + dy) * Math.SQRT1_2,
					p[1] + (dy - dx) * Math.SQRT1_2
				];
				edges.push(
					...prior.edges.map((e) => ({
						...e,
						from: move(e.from),
						to: move(e.to)
					}))
				);
			} else {
				const local: Edge[] = [];
				fourPortMotif(
					local,
					contours,
					gates,
					[Math.PI / 4, (3 * Math.PI) / 4, (-3 * Math.PI) / 4, -Math.PI / 4],
					margin
				);
				cached.set(key, { x, y, edges: local });
				edges.push(...local);
			}
		}
	}
	if (slices > 1) {
		const dividers = Array.from({length: rows}, (_, row) => Array.from({length: slices - 1}, (_, i) =>
			(-fullHeight / 2 + (row + (i + 1) / slices) * cellHeight) * scale)).flat();
		edges = stitch(edges, dividers, 1);
	}
	if (columns > 1) {
		let cursor = -span / 2;
		const dividers = widths.flatMap(width => {
			const values = Array.from({length: columns - 1}, (_, i) => (cursor + (i + 1) * width / columns) * scale);
			cursor += width;
			return values;
		});
		edges = stitch(edges, dividers);
	}
	connectCellGrid(edges, cells, boundary, 'check', layout.spread);
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
