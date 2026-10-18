import {
	forest, area, centroid, sub, dot, inside, distance, mix, frameRing, ray,
	uprightToSheet, fourPortMotif, connectCellGrid, compile, ConstructionError,
	type Ring, type Point, type Edge, type Contour, type Frame, type Font
} from './geometry';
import { normalizeContours, contoursWithinBoundary } from './contours';
import { clipContours, stitch, filledSeamGate, panelSeamGuard, panelDividers } from './panels';
import { rerouteSharedCuts } from './sharedCuts';
import { gridClearance } from '$lib/geometry/clearance';

const contoursOf = (node: Contour): Ring[] => [node.ring, ...node.children.flatMap(contoursOf)];
const extent = (parts: Ring[], axis: 0 | 1) => {
	const values = parts.flat().map(p => p[axis]);
	return [Math.min(...values), Math.max(...values)];
};
const slice = (parts: Ring[], axis: 0 | 1, value: number, left: boolean) => {
	const swap = (ring: Ring): Ring => ring.map(([x, y]): Point => [y, x]);
	return axis ? clipContours(parts.map(swap), value, left).map(swap) : clipContours(parts, value, left);
};

/** A clipped component owning fixed seam gates should carry those contacts.
 * Choosing the largest component can force a different piece's gate through
 * its outline before reaching the intended paper path. */
function seamRoot(contours: Ring[], gates: Point[]): Ring | undefined {
	const touches = (ring: Ring, p: Point) => ring.some((a, i) => {
		const b = ring[(i + 1) % ring.length], d = sub(b, a), t = dot(sub(p, a), d) / dot(d, d);
		return t >= -1e-7 && t <= 1 + 1e-7 && distance(p, mix(a, b, Math.max(0, Math.min(1, t)))) < 1e-5;
	});
	const ranked = forest(contours).map(node => ({
		ring: node.ring, count: gates.filter(p => touches(node.ring, p)).length
	})).sort((a, b) => b.count - a.count || Math.abs(area(b.ring)) - Math.abs(area(a.ring)));
	return ranked[0]?.count ? ranked[0].ring : undefined;
}

/** Keep the upper rows' divider in a common gap between their two branches.
 * A centred line can otherwise shave a small fragment off an overhanging serif. */
function alignedGapDivider(parts: Ring[][], minX: number, maxX: number): number {
	const center = (minX + maxX) / 2;
	let lo = minX, hi = maxX, found = false;
	for (const part of parts.slice(0, 2)) {
		const roots = forest(part).map(root => extent([root.ring], 0)).sort((a, b) => a[0] - b[0]);
		if (roots.length !== 2 || roots[0][1] >= roots[1][0]) continue;
		found = true;
		lo = Math.max(lo, roots[0][1]); hi = Math.min(hi, roots[1][0]);
	}
	if (!found || lo >= hi || center > lo && center < hi) return center;
	return (lo + hi) / 2;
}

const overlapCache = new WeakMap<Font, Map<string, boolean>>();
/** Detect the topology before trying rectangular cuts that split the same
 * serif ends repeatedly. Font outlines are immutable; cache per font and glyph. */
export function hasOverlappingTextBranches(text: string, font: Font): boolean {
	if (!text.trim() || /\s/.test(text)) return false;
	let cache = overlapCache.get(font);
	if (!cache) { cache = new Map(); overlapCache.set(font, cache); }
	return [...text.normalize('NFC')].some(char => {
		const prior = cache.get(char);
		if (prior !== undefined) return prior;
		const contours = font.glyphs[char]?.contours;
		let overlapping = false;
		if (contours?.length) for (const fraction of [.55, .48, .62]) try {
			const [low, high] = extent(contours, 0), vertical = low + (high - low) * fraction,
				stem = forest(clipContours(contours, vertical, true)),
				branches = forest(clipContours(contours, vertical, false));
			if (stem.length !== 1 || branches.length !== 3) continue;
			const spans = branches.map(b => extent([b.ring], 1)).sort((a, b) => a[0] - b[0]);
			if (spans.slice(1).some((b, i) => b[0] < spans[i][1] - 1e-5)) { overlapping = true; break; }
		} catch (error) {
			if (!(error instanceof ConstructionError)) throw error;
		}
		cache.set(char, overlapping);
		return overlapping;
	});
}

function placeBranchedText(text: string, font: Font, frame: Frame, frameFill: number): Ring[][] {
	if (!text.trim() || /\s/.test(text)) throw new ConstructionError('topology', 'Branched text needs one filled line');
	const glyphs = [...text.normalize('NFC')].map(char => {
		const glyph = font.glyphs[char];
		if (!glyph) throw new ConstructionError('character', char);
		if (!glyph.contours.length) throw new ConstructionError('empty', 'Empty glyph');
		return glyph;
	});
	const [low, high] = extent(glyphs.flatMap(g => g.contours), 1), height = high - low;
	let cursor = 0;
	const placed = glyphs.map(glyph => {
		const [left, right] = extent(glyph.contours, 0);
		const rings = glyph.contours.map(r => r.map(([x, y]): Point => [cursor + x - left, y]));
		cursor += right - left + height * .16;
		return rings;
	});
	const [left, right] = extent(placed.flat(), 0), span = Math.max(right - left, height),
		cx = (left + right) / 2, cy = (low + high) / 2;
	if (!(span > 0)) throw new ConstructionError('empty', 'Empty text');
	return placed.map(g => normalizeContours(g.map(r => r.map(([x, y]): Point =>
		[(x - cx) / span, (y - cy) / span]))).map(r => r.map(([x, y]): Point =>
		[x * 80 * frameFill, y * 80 * frameFill])));
}

/** Existing wide layouts can cross the frame even when their bounding boxes
 * fit. Shrink the complete unchanged outlines together about the frame centre,
 * then leave room for the outside connections. The circle is star-shaped about
 * its centre, so containment is monotone in this scale.
 * Return no extra recipe when the established smaller layout already fits. */
export function fittedBranchedTextFill(text: string, font: Font, frame: Frame): number | undefined {
	const artwork = placeBranchedText(text, font, frame, 1).flat().map(r => r.map(uprightToSheet)),
		boundary = frameRing(frame, 80),
		fits = (fill: number) => contoursWithinBoundary(artwork.map(r => r.map(([x, y]): Point =>
			[50 + (x - 50) * fill, 50 + (y - 50) * fill])), boundary);
	if (fits(.84)) return;
	let low = 0, high = .84;
	for (let i = 0; i < 20; i++) {
		const middle = (low + high) / 2;
		if (fits(middle)) low = middle; else high = middle;
	}
	return low * .94;
}

/** An E's middle and lower serifs can overlap vertically. A rectangular panel
 * cuts those ends into fragile fragments. Separate the stem from its three
 * branches first; divide only the stem between their actual attachment heights.
 * Neighbouring glyphs use ordinary panels, with a column per disconnected part.
 * All original outlines are retained. */
export function generateBranchedText(text: string, font: Font, frame: Frame,
	splitFraction = .55, practical = false, junctionRows?: readonly [number, number],
	frameFill = junctionRows ? .84 : .72, guardedJunctions = false) {
	const uprightGlyphs = placeBranchedText(text, font, frame, frameFill);
	const artwork = uprightGlyphs.flat().map(r => r.map(uprightToSheet)), boundary = frameRing(frame, 80);
	if (guardedJunctions && !contoursWithinBoundary(artwork, boundary))
		throw new ConstructionError('clearance', 'The letters extend beyond the frame');
	const matrix: Ring[][][] = [[], [], []],
		splits: { axis: 0 | 1; value: number; source: number }[] = [],
		sources = new Map<Ring[], number>(),
		guards = new Map<Ring[], { bounds: number[]; internal: boolean[] }>();
	let branched = false;
	for (const [source, whole] of uprightGlyphs.entries()) {
		const [minX, maxX] = extent(whole, 0), [minY, maxY] = extent(whole, 1),
			vertical = minX + (maxX - minX) * splitFraction,
			stem = slice(whole, 0, vertical, true),
			branches = forest(slice(whole, 0, vertical, false)).map(contoursOf)
				.sort((a, b) => centroid(a.flat())[1] - centroid(b.flat())[1]),
			useBranches = branches.length === 3 && forest(stem).length === 1;
		branched ||= useBranches;
		const seamCenters = useBranches ? branches.map(part => {
			const points = part.flat().filter(p => Math.abs(p[0] - vertical) < 1e-6);
			if (!points.length) throw new ConstructionError('topology', 'Branch does not meet the stem');
			return centroid(points)[1];
		}) : [];
		const horizontal = useBranches ? seamCenters.slice(1).map((c, i) => (c + seamCenters[i]) / 2)
			: junctionRows ? junctionRows.map(t => minY + (maxY - minY) * t)
				: panelDividers(whole.flat().map(p => p[1]), minY, maxY, 3);
		if (useBranches) splits.push({ axis: 0, value: vertical, source });
		splits.push(...horizontal.map(value => ({ axis: 1 as const, value, source })));
		const horizontalParts = Array.from({ length: 3 }, (_, row) => {
			let part = useBranches ? stem : whole;
			if (row) part = slice(part, 1, horizontal[row - 1], false);
			if (row < 2) part = slice(part, 1, horizontal[row], true);
			return part;
		});
		// Keep neighbouring row boundaries aligned. Two centred columns avoid
		// grazing the bottom of a V-shaped stroke; higher row seams keep their
		// junctions out of that filled tip. Every completed graph is still checked.
		const columns = useBranches ? 1 : Math.min(junctionRows ? 2 : Infinity,
			Math.max(...horizontalParts.map(part => forest(part).length))),
			verticals = columns > 1 ? junctionRows ? [guardedJunctions
				? alignedGapDivider(horizontalParts, minX, maxX) : (minX + maxX) / 2]
				: panelDividers(whole.flat().map(p => p[0]), minX, maxX, columns) : [];
		splits.push(...verticals.map(value => ({ axis: 0 as const, value, source })));
		for (let row = 0; row < 3; row++) {
			for (let column = 0; column < columns; column++) {
				let part = horizontalParts[row];
				if (column) part = slice(part, 0, verticals[column - 1], false);
				if (column < columns - 1) part = slice(part, 0, verticals[column], true);
				if (!part.length) throw new ConstructionError('topology', 'Empty glyph panel');
				matrix[row].push(part); sources.set(part, source);
				guards.set(part, {
					bounds: [horizontal[row - 1] ?? 0, useBranches ? vertical : verticals[column] ?? 0,
						horizontal[row] ?? 0, verticals[column - 1] ?? 0],
					internal: [row > 0, useBranches || column < columns - 1, row < 2, column > 0]
				});
			}
			if (useBranches) {
				const branch = branches[row];
				matrix[row].push(branch); sources.set(branch, source);
				guards.set(branch, { bounds: [0, vertical, 0, vertical], internal: [false, false, false, true] });
			}
		}
		if (matrix[0].length + 4 > 20) throw new ConstructionError('clearance', 'Too many strips');
	}
	if (!branched) throw new ConstructionError('topology', 'No branched glyph');
	const parts = matrix.flat(), rows = matrix.length, columns = matrix[0].length,
		margin = gridClearance(rows + columns + 1),
		cells: Point[][][] = matrix.map(row => row.map(() => []));
	const contact = (a: Ring[], b: Ring[]): Point => {
		if (sources.get(a) === sources.get(b)) {
			// Clipped neighbours agree on the filled part of their common seam.
			for (const { axis, value, source } of splits) {
				if (source !== sources.get(a)) continue;
				const [aLow, aHigh] = extent(a, axis), [bLow, bHigh] = extent(b, axis);
				if (!(Math.abs(aHigh - value) < 1e-6 && Math.abs(bLow - value) < 1e-6 ||
					Math.abs(bHigh - value) < 1e-6 && Math.abs(aLow - value) < 1e-6)) continue;
				const other = (1 - axis) as 0 | 1, [lo, hi] = extent(b, other),
					common = slice(slice(a, other, lo, false), other, hi, true),
					point = filledSeamGate(common, axis, value, (centroid(a.flat())[other] + centroid(b.flat())[other]) / 2);
				if (point) return point;
			}
		} else {
			// The nearest corner may lie at the next row's seam. Keep joins
			// between letters inside their common vertical interval instead.
			const [aLow, aHigh] = extent(a, 1), [bLow, bHigh] = extent(b, 1);
			return uprightToSheet([(extent(a, 0)[1] + extent(b, 0)[0]) / 2,
				(Math.max(aLow, bLow) + Math.min(aHigh, bHigh)) / 2]);
		}
		let best = Infinity, point: Point = [0, 0];
		const rootsA = forest(a).map(n => n.ring), rootsB = forest(b).map(n => n.ring);
		const projection = (p: Point, a: Point, b: Point) => {
			const d = sub(b, a), t = Math.max(0, Math.min(1, dot(sub(p, a), d) / Math.max(1e-20, dot(d, d))));
			return mix(a, b, t);
		};
		for (const [first, second] of [[rootsA, rootsB], [rootsB, rootsA]])
			for (const r of first) for (const u of r) for (const s of second) for (let i = 0; i < s.length; i++) {
				const q = projection(u, s[i], s[(i + 1) % s.length]), gap = distance(u, q);
				if (gap < best) { best = gap; point = mix(u, q, .5); }
			}
		const obstacles = parts.filter(part => part !== a && part !== b).flat(),
			clear = (p: Point) => !obstacles.some(r => inside(p, r) ||
				r.some((a, i) => distance(p, projection(p, a, r[(i + 1) % r.length])) < margin * 1.5));
		if (!clear(point)) {
			const vector = sub(centroid(b.flat()), centroid(a.flat())), length = Math.hypot(...vector);
			if (length > 1e-7) {
				const normal: Point = [-vector[1] / length, vector[0] / length], origin = point;
				let found = false;
				for (let i = 1; i <= 40 && !found; i++) for (const sign of [-1, 1]) {
					const candidate: Point = [origin[0] + normal[0] * i * margin * sign, origin[1] + normal[1] * i * margin * sign];
					if (clear(candidate)) { point = candidate; found = true; break; }
				}
			}
		}
		return uprightToSheet(point);
	};
	const exterior = (side: number, index: number, count: number) => {
		const step = Math.PI / (2 * count), angle = side === 0 ? Math.PI + (index + .5) * step
			: side === 2 ? Math.PI / 2 - (index + .5) * step
				: side === 3 ? Math.PI - (index + .5) * step : 3 * Math.PI / 2 + (index + .5) * step;
		return ray(boundary, [50, 50], angle).point;
	};
	for (let row = 0; row < rows; row++) for (let col = 0; col < columns; col++) {
		const gates = cells[row][col], part = matrix[row][col];
		gates[0] = row ? cells[row - 1][col][2] : exterior(0, col, columns);
		gates[3] = col ? cells[row][col - 1][1] : exterior(3, row, rows);
		gates[1] = col < columns - 1 ? contact(part, matrix[row][col + 1]) : exterior(1, row, rows);
		gates[2] = row < rows - 1 ? contact(part, matrix[row + 1][col]) : exterior(2, col, columns);
	}
	let edges: Edge[] = [];
	for (let row = 0; row < rows; row++) for (let col = 0; col < columns; col++) {
		const part = matrix[row][col], contours = part.map(r => r.map(uprightToSheet)),
			gates = cells[row][col], center = centroid(contours.flat()), clipping = guards.get(part)!;
		fourPortMotif(edges, contours, gates, gates.map(p => Math.atan2(center[1] - p[1], center[0] - p[0])),
			margin, undefined, undefined, { practical, compound: true, balanced: true, alternateIslandGates: true,
				root: junctionRows ? seamRoot(contours, gates) : undefined,
				safeAttachments: guardedJunctions,
				boundaryIslands: true, connectionAllowed: panelSeamGuard(gates, clipping.bounds, clipping.internal,
					junctionRows ? contours : undefined, guardedJunctions ? margin * 1.1 : 0) });
	}
	for (const axis of [0, 1] as const) {
		const values = [...new Set(splits.filter(s => s.axis === axis).map(s => s.value))].sort((a, b) => a - b);
		if (values.length) edges = stitch(edges, values, axis);
	}
	connectCellGrid(edges, cells, boundary, 'check', true);
	edges = rerouteSharedCuts(edges, margin);
	return { edges, artwork, geometry: compile(edges), domain: [boundary] };
}
