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
import { gridPaperWidth, normalizedClearance } from './printSize';

export function generateTextGrid(
	text: string,
	font: Font,
	air = false,
	frame?: Frame
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
	const padding = height * (air ? 0.5 : 0.22),
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
	const edges: Edge[] = [],
		artwork: Ring[] = [],
		cells: Point[][][] = [],
		background: Ring[] = [];
	const cached = new Map<string, { x: number; y: number; edges: Edge[] }>();
	const margin = normalizedClearance(gridPaperWidth(cols + rows + 1));
	for (let row = 0; row < rows; row++) {
		cells.push([]);
		let cursor = -span / 2;
		for (let col = 0; col < cols; col++) {
			const { char, glyph } = matrix[row][col];
			const x = (cursor + widths[col] / 2) * scale,
				y = (-fullHeight / 2 + (row + 0.5) * cellHeight) * scale;
			const w = widths[col] * scale,
				h = cellHeight * scale;
			cursor += widths[col];
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
			const contours = glyph.contours.map((r) =>
				r.map((p) =>
					uprightToSheet([x + (p[0] - cx) * scale, y + (p[1] - cy) * scale])
				)
			);
			artwork.push(...contours);
			const key = char + ':' + col,
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
	connectCellGrid(edges, cells, boundary);
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
