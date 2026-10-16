/** A square of letter cells, built from the occupied cells of a staggered
 * checker lattice. Boundary letters open directly onto the paper edges;
 * there is no separate checkerboard frame or narrow routing gutter. */
import { MAX_GRID_SIZE, STRIP_WIDTH } from '$lib/constants';
import { fingerHasIntersectionIssues } from '$lib/editor/curveIssues';
import type { Finger } from '$lib/types/heart';
import { gridClearance } from '$lib/geometry/clearance';
import { repeatedText } from './repeatedText';
import {
	ConstructionError, type Font, type Ring, type Edge, type Point, type Port,
	forest, fourPortMotif, arc, mix, dot, area, distance, add, compile, support
} from './geometry';

/** Intersect a supporting line with the outline. Each returned arc is one
 * exposed cap of the letter, not its counter. Opening that cap extends a
 * stroke to the paper edge while retaining the rest of the glyph. */
function caps(ring: Ring, normal: Point, margin: number): [Port, Port][] {
	const values = ring.map(p => dot(p, normal));
	const levels = [...new Set(values)].sort((a, b) => b - a);
	const result: [Port, Port][] = [];
	for (let k = 1; k < levels.length; k++) {
		const level = (levels[k - 1] + levels[k]) / 2;
		const hits: {
			port: Port;
			entering: boolean;
		}[] = [];
		for (let i = 0; i < ring.length; i++) {
			const j = (i + 1) % ring.length;
			if ((values[i] > level) === (values[j] > level))
				continue;
			const t = (level - values[i]) / (values[j] - values[i]);
			hits.push({ port: { point: mix(ring[i], ring[j], t), index: i + t }, entering: values[j] > level });
		}
		for (let i = 0; i < hits.length; i++)
			if (hits[i].entering) {
				const a = hits[i].port, b = hits[(i + 1) % hits.length].port;
				if (distance(a.point, b.point) < margin * 1.8)
					continue;
				result.push([a, b]);
			}
	}
	return result;
}
const pointKey = (p: Point) => p.map(v => v.toFixed(6)).join(',');

/** Validate only the retained paths at the actual editor scale. Extend inward
 * gates past the cell so endpoint exemptions cannot conceal a hooked strip. */
function spacedRoutes(routes: Ring[], gates: Point[], active: number[], boundary: boolean[], margin: number, scale: number) {
	const interior = new Set(active.map(i => pointKey(gates[i])));
	const fingers: Finger[] = [];
	for (const [i, route] of routes.entries()) {
		if (![route[0], route.at(-1)!].some(p => interior.has(pointKey(p))))
			continue;
		const end = (p: Point, q: Point): Point => interior.has(pointKey(p))
			? mix(q, p, 1 + 3 / Math.max(distance(p, q), 1e-6))
			: i < 2 ? [p[0], boundary[0] ? 0 : 100] : [boundary[3] ? 0 : 100, p[1]];
		const ps = [end(route[0], route[1]), ...route, end(route.at(-1)!, route.at(-2)!)].filter((p, j, all) => !j || distance(p, all[j - 1]) > 1e-7);
		fingers.push({
			id: String(i),
			lobe: i < 2 ? 'right' : 'left',
			segments: ps.slice(1).map((p, j) => {
				const a = ps[j], b = mix(a, p, 1 / 3), c = mix(a, p, 2 / 3);
				return {
					p0: { x: a[0] * scale, y: a[1] * scale },
					p1: { x: b[0] * scale, y: b[1] * scale },
					p2: { x: c[0] * scale, y: c[1] * scale },
					p3: { x: p[0] * scale, y: p[1] * scale }
				};
			})
		});
	}
	return !fingers.some(f => fingerHasIntersectionIssues(f, fingers, margin * scale));
}

/** Keep exactly the paths connected to an inward gate. The other local path
 * is the cap that opens onto the edge, never a detached paper cutout. */
function openBoundary(local: Edge[], gates: Point[], active: number[]) {
	const kept = local.map(() => new Set<'A' | 'B'>());
	for (const family of ['A', 'B'] as const) {
		const adjacent = new Map<string, number[]>();
		local.forEach((e, i) => {
			if (e.family.includes(family))
				for (const p of [e.from, e.to]) {
					const k = pointKey(p);
					adjacent.set(k, [...(adjacent.get(k) ?? []), i]);
				}
		});
		const pending = active.map(i => pointKey(gates[i])), seen = new Set<string>();
		while (pending.length) {
			const p = pending.pop()!;
			if (seen.has(p))
				continue;
			seen.add(p);
			for (const i of adjacent.get(p) ?? []) {
				kept[i].add(family);
				pending.push(pointKey(local[i].from), pointKey(local[i].to));
			}
		}
	}
	return local.flatMap((e, i): Edge[] => kept[i].size ? [{ ...e, family: kept[i].size === 2 ? 'AB' : [...kept[i]][0] }] : []);
}

/** Shared only by construction passes for the same text and font. */
export function repeatedGridCache() {
	return {
		cells: new Map<string, { center: Point; edges: Edge[]; artwork: Ring[] }>(),
		failed: new Set<string>(),
		crowded: new Set<string>()
	};
}

export function generateRepeatedGrid(text: string, font: Font, practical = false, cache = repeatedGridCache(), balanced = false, bentSpokes = false, strokeTips = false, compound = false, islandRank = 0, islandFlip = false) {
	let repeated = repeatedText(text);
	if (!repeated)
		throw new ConstructionError('empty', 'Empty text');
	// A repeating initial still needs neighbouring cells and open strips.
	if ([...repeated].length === 1)
		repeated = repeatedText(repeated.repeat(2));
	const matrix = repeated.split('\n').map(row => [...row]), n = matrix.length;
	if (2 * n > MAX_GRID_SIZE)
		throw new ConstructionError('clearance', 'Too many letters for the repeated grid');
	const chars = [...new Set(matrix.flat())];
	for (const char of chars)
		if (!font.glyphs[char])
			throw new ConstructionError('character', char);
	const points = chars.flatMap(char => font.glyphs[char].contours.flat());
	if (!points.length)
		throw new ConstructionError('empty', 'No letter outlines');
	const minY = Math.min(...points.map(p => p[1])), maxY = Math.max(...points.map(p => p[1]));
	const cy = (minY + maxY) / 2, cell = 100 / n, margin = gridClearance(2 * n, n);
	const edges: Edge[] = [], artwork: Ring[] = [];
	for (let row = 0; row < n; row++)
		for (let col = 0; col < n; col++) {
			const char = matrix[row][col], glyph = font.glyphs[char];
			if (!glyph.contours.length)
				throw new ConstructionError('empty', 'No letter outlines');
			const xs = glyph.contours.flat().map(p => p[0]), cx = (Math.min(...xs) + Math.max(...xs)) / 2;
			const scale = cell * 0.78 / ((maxY - minY + Math.max(...xs) - Math.min(...xs)) * Math.SQRT1_2);
			const center: Point = [(col + 0.5) * cell, (row + 0.5) * cell];
			const contours = glyph.contours.map(r => r.map(([x, y]): Point => [
				center[0] + ((x - cx) + (y - cy)) * Math.SQRT1_2 * scale,
				center[1] + ((y - cy) - (x - cx)) * Math.SQRT1_2 * scale
			]));
			const nodes = forest(contours).sort((a, b) => Math.abs(area(b.ring)) - Math.abs(area(a.ring)));
			// Occupied cells of a 2n×n checker lattice have four neighbouring
			// gates. Align the glyph centres into the requested n×n square while
			// retaining that staggered connectivity. No empty foreground cell is
			// left over to become a checkerboard square or a routing rim.
			const x = (col + (row % 2) / 2) * cell, y = row * cell;
			const gates: Point[] = [[x, y], [x + cell / 2, y], [x + cell / 2, y + cell], [x, y + cell]];
			const boundary = [row === 0, row % 2 === 1 && col === n - 1, row === n - 1, row % 2 === 0 && col === 0]; // N,E,S,W
			const key = char + ':' + row % 2 + ':' + boundary.map(Number).join(''), cached = cache.cells.get(key);
			if (cached) {
				const move = (p: Point): Point => [p[0] + center[0] - cached.center[0], p[1] + center[1] - cached.center[1]];
				edges.push(...cached.edges.map(e => ({ ...e, from: move(e.from), to: move(e.to) })));
				artwork.push(...cached.artwork.map(r => r.map(move)));
				continue;
			}
			const edgeStart = edges.length, artStart = artwork.length;
			const remember = () => cache.cells.set(key, { center, edges: edges.slice(edgeStart), artwork: artwork.slice(artStart) });
			const active = [0, 1, 2, 3].filter(i => !boundary[i] && !boundary[(i + 3) % 4]);
			const angles = gates.map(p => Math.atan2(center[1] - p[1], center[0] - p[0]));
			if (active.length === 4) {
				try {
					try {
						if (cache.failed.has(key)) throw new ConstructionError('topology', 'No original cell route');
						fourPortMotif(edges, contours, gates, angles, margin, active, routes => spacedRoutes(routes, gates, active, boundary, margin, 2 * n * STRIP_WIDTH / 100), { bentSpokes, strokeTips, compound, islandRank, islandFlip, alternateIslandGates: islandFlip });
					} catch (error) {
						if (error instanceof ConstructionError) cache.failed.add(key);
						if (!practical || !(error instanceof ConstructionError)) throw error;
						const accept = (routes: Ring[]) => spacedRoutes(routes, gates, active, boundary, margin, 2 * n * STRIP_WIDTH / 100);
						try {
							fourPortMotif(edges, contours, gates, angles, margin, active, accept, { practical: true, bentSpokes, strokeTips, compound, islandRank, islandFlip, alternateIslandGates: islandFlip, onCrowded: () => cache.crowded.add(key) });
						} catch (error) {
							if (!balanced || !cache.crowded.has(key) || !(error instanceof ConstructionError)) throw error;
							fourPortMotif(edges, contours, gates, angles, margin, active, accept, { practical: true, balanced: true, bentSpokes, strokeTips, compound, islandRank, islandFlip, alternateIslandGates: islandFlip });
						}
					}
				} catch (error) {
					if (!(error instanceof ConstructionError)) throw error;
					throw new ConstructionError(error.code, `${char} at ${row},${col}: ${error.message}`);
				}
				artwork.push(...contours);
				remember();
				continue;
			}
			const sides = boundary.flatMap((yes, i) => yes ? [i] : []);
			const normals: Point[] = [[0, -1], [1, 0], [0, 1], [-1, 0]];
			const normal = sides.reduce<Point>((p, i) => [p[0] + normals[i][0], p[1] + normals[i][1]], [0, 0]);
			let built = false;
			const choices = nodes.flatMap(base => {
				const pairs = caps(base.ring, normal, margin);
				if (sides.length === 2) {
					const corner = [0, 1, 2, 3].find(i => boundary[i] && boundary[(i + 3) % 4])!;
					const before = normals[(corner + 3) % 4], after = normals[corner];
					pairs.push([support(base.ring, Math.atan2(before[1], before[0])), support(base.ring, Math.atan2(after[1], after[0]))]);
				}
				return pairs.map(([a, b]) => ({ base, a, b }));
			});
			// Keep working letter cells intact. Only failed cells need the wider
			// corner-routing pass; sample caps across the full exposed stroke so
			// intricate fonts cannot trigger hundreds of expensive route rankings.
			construction: for (const improve of practical ? cache.failed.has(key) ? [true] : [false, true] : [false])
			for (const balancedRouting of improve && balanced ? [false, true] : [false]) {
				if (balancedRouting && !cache.crowded.has(key)) continue;
				for (const { base, a, b } of improve && choices.length > 24
					? Array.from({ length: 24 }, (_, i) => choices[Math.round(i * (choices.length - 1) / 23)]) : choices) {
					const baseIndex = contours.findIndex(r => r.includes(base.ring[0]));
					const ports = gates.slice();
					let corner: number | undefined;
					if (sides.length === 1) {
						const s = sides[0];
						ports[s] = a.point;
						ports[(s + 1) % 4] = b.point;
					} else {
						corner = [0, 1, 2, 3].find(i => boundary[i] && boundary[(i + 3) % 4]);
						if (corner === undefined)
							throw new ConstructionError('topology', 'Unsupported boundary cell');
						ports[(corner + 3) % 4] = a.point;
						ports[(corner + 1) % 4] = b.point;
						const index = (a.index + ((b.index - a.index + base.ring.length) % base.ring.length) / 2) % base.ring.length;
						ports[corner] = mix(base.ring[Math.floor(index)], base.ring[(Math.floor(index) + 1) % base.ring.length], index % 1);
					}
					try {
						const local: Edge[] = [];
						fourPortMotif(local, contours, ports, angles, margin, active, routes => spacedRoutes(routes, ports, active, boundary, margin, 2 * n * STRIP_WIDTH / 100), { root: base.ring, practical: improve, balanced: balancedRouting, bentSpokes, strokeTips, compound, islandRank, islandFlip, alternateIslandGates: islandFlip, onCrowded: () => cache.crowded.add(key) });
						const opened = openBoundary(local, ports, active);
						const ends = new Map<string, Point>();
						for (const i of [0, 1, 2, 3].filter(i => !active.includes(i))) {
							const at = opened.filter(e => distance(e.from, ports[i]) < 1e-7 || distance(e.to, ports[i]) < 1e-7);
							if (!at.length)
								continue;
							const family = at[0].family;
							if (family === 'AB')
								throw new ConstructionError('topology', 'Unopened boundary gate');
							const point: Point = family === 'A' ? [ports[i][0], boundary[0] ? 0 : 100] : [boundary[3] ? 0 : 100, ports[i][1]];
							add(opened, [ports[i], point], family, 'outline');
							ends.set(pointKey(ports[i]), point);
						}
						const pa = ends.get(pointKey(a.point)), pb = ends.get(pointKey(b.point));
						if (!pa || !pb)
							throw new ConstructionError('topology', 'Missing letter edge');
						const edgeClosure: Ring = corner === undefined ? [pa, pb] : [pa, gates[corner], pb];
						const outline = [...arc(base.ring, b, a), ...edgeClosure];
						artwork.push(...contours.filter((_, i) => i !== baseIndex));
						artwork.push(outline);
						edges.push(...opened);
						built = true;
						break construction;
					} catch (error) {
						if (!(error instanceof ConstructionError))
							throw error;
					}
				}
			}
			if (!built) {
				cache.failed.add(key);
				throw new ConstructionError('topology', `No open boundary for ${char} at ${row},${col}`);
			}
			remember();
		}
	return {
		edges, artwork, geometry: compile(edges), overlapAspectRatio: 1,
		domain: [[[0, 0], [100, 0], [100, 100], [0, 100]] as Ring]
	};
}
