import { type Edge, type Font, type Point, type Ring, distance, dot, mix, sub } from './geometry';

/** Constructions place glyph contours by rotation, uniform scaling and
 * translation, keeping each contour's vertex order. Distance ratios between
 * fixed vertices identify the source contour without any construction storing
 * labels. Clipped or opened outlines simply remain unlabelled. */
function signature(ring: Ring): number[] | undefined {
	const n = ring.length;
	if (n < 6) return;
	const [a, b, c, d] = [0, Math.floor(n / 4), Math.floor(n / 2), Math.floor(3 * n / 4)].map(i => ring[i]);
	const unit = distance(a, c);
	if (unit < 1e-9) return;
	return [distance(a, b), distance(b, c), distance(c, d), distance(d, a), distance(b, d)].map(x => x / unit);
}

function labelRings(artwork: Ring[], text: string, font: Font): Map<Ring, string> {
	const glyphs = [...new Set(text.normalize('NFC'))].flatMap(char =>
		(font.glyphs[char]?.contours ?? []).map(contour => ({ char, length: contour.length, signature: signature(contour) })));
	const labels = new Map<Ring, string>();
	for (const ring of artwork) {
		const own = signature(ring);
		if (!own) continue;
		const match = glyphs.find(g => g.length === ring.length && g.signature &&
			g.signature.every((x, i) => Math.abs(x - own[i]) < 1e-6 * Math.max(1, x)));
		if (match) labels.set(ring, match.char);
	}
	return labels;
}

const project = (p: Point, a: Point, b: Point): Point => {
	const d = sub(b, a);
	return mix(a, b, Math.max(0, Math.min(1, dot(sub(p, a), d) / Math.max(1e-20, dot(d, d)))));
};

/** Points where one sheet's straight cuts leave paper narrower than `margin`.
 * As in the editor's check, two points of one path that are close along it are
 * a bend of the same cut, not a neck of paper. Paths meet at shared joins, so
 * the walk follows each sheet's chain of edges through its degree-2 points. */
function narrowPoints(edges: Edge[], margin: number): Point[] {
	const result: Point[] = [];
	for (const family of ['A', 'B'] as const) {
		const sheet = edges.filter(e => e.family === family || e.family === 'AB');
		const key = (p: Point) => p[0].toFixed(5) + ',' + p[1].toFixed(5);
		const at = new Map<string, number[]>();
		sheet.forEach((e, i) => { for (const p of [e.from, e.to]) at.set(key(p), [...(at.get(key(p)) ?? []), i]); });
		// Arc-length position of each edge along its path, for the bend exemption.
		const path = new Array<number>(sheet.length).fill(-1), start = new Array<number>(sheet.length).fill(0),
			entry: Point[] = sheet.map(e => e.from);
		let paths = 0;
		for (let first = 0; first < sheet.length; first++) {
			if (path[first] >= 0) continue;
			// Walk back to an end of this path (or around a loop), then forwards.
			let edge = first, from = key(sheet[first].from);
			for (let guard = 0; guard < sheet.length; guard++) {
				const next = (at.get(from) ?? []).find(i => i !== edge);
				if (next === undefined || next === first) break;
				from = key(sheet[next].from) === from ? key(sheet[next].to) : key(sheet[next].from);
				edge = next;
			}
			let length = 0, point = from;
			for (let guard = 0; guard < sheet.length && edge !== undefined && path[edge] < 0; guard++) {
				path[edge] = paths;
				start[edge] = length;
				entry[edge] = key(sheet[edge].from) === point ? sheet[edge].from : sheet[edge].to;
				length += distance(sheet[edge].from, sheet[edge].to);
				point = key(sheet[edge].from) === point ? key(sheet[edge].to) : key(sheet[edge].from);
				edge = (at.get(point) ?? []).find(i => path[i] < 0)!;
			}
			paths++;
		}
		// Sweep bounding boxes along x, as the crossing audit does; repeated text
		// has thousands of distant edges.
		const order = sheet.map((e, i) => ({ i, minX: Math.min(e.from[0], e.to[0]), maxX: Math.max(e.from[0], e.to[0]),
			minY: Math.min(e.from[1], e.to[1]), maxY: Math.max(e.from[1], e.to[1]) })).sort((a, b) => a.minX - b.minX);
		for (let m = 0; m < order.length; m++) for (let k = m + 1; k < order.length; k++) {
			if (order[k].minX > order[m].maxX + margin) break;
			if (order[k].minY > order[m].maxY + margin || order[m].minY > order[k].maxY + margin) continue;
			const i = order[m].i, j = order[k].i, u = sheet[i], v = sheet[j];
			for (const [p, a, b, fromU] of [[u.from, v.from, v.to, true], [u.to, v.from, v.to, true],
				[v.from, u.from, u.to, false], [v.to, u.from, u.to, false]] as const) {
				const q = project(p, a, b);
				if (distance(p, q) >= margin) continue;
				if (path[i] === path[j]) {
					const along = Math.abs(start[i] + distance(entry[i], fromU ? p : q) - start[j] - distance(entry[j], fromU ? q : p));
					if (along < 2 * margin) continue;
				}
				result.push(mix(p, q, .5));
			}
		}
	}
	return result;
}

/** Name the characters whose outlines are next to paper narrower than the
 * clearance, in their order of first appearance in the text. */
export function trickyLetters(construction: { edges: Edge[]; artwork: Ring[] }, text: string, font: Font, margin: number): string[] {
	const labels = labelRings(construction.artwork, text, font);
	if (!labels.size) return [];
	const rings = [...labels].map(([ring, char]) => ({ ring, char,
		minX: Math.min(...ring.map(p => p[0])) - margin, maxX: Math.max(...ring.map(p => p[0])) + margin,
		minY: Math.min(...ring.map(p => p[1])) - margin, maxY: Math.max(...ring.map(p => p[1])) + margin }));
	const found = new Set<string>();
	for (const p of narrowPoints(construction.edges, margin))
		for (const { ring, char, minX, maxX, minY, maxY } of rings)
			if (!found.has(char) && p[0] >= minX && p[0] <= maxX && p[1] >= minY && p[1] <= maxY &&
				ring.some((a, i) => distance(p, project(p, a, ring[(i + 1) % ring.length])) < margin))
				found.add(char);
	return [...new Set(text.normalize('NFC'))].filter(char => found.has(char));
}
