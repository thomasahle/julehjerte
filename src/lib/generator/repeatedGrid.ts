/** A finite square of letters fills the woven square. Each diagonal gets its
 * own pair of open cuts, connected between letters by coincident A/B segments.
 * Only the narrow edge strips connect those diagonals to the paper edges;
 * there is no surrounding grid of empty checkerboard cells. */
import { MAX_GRID_SIZE } from '$lib/constants';
import { gridClearance } from '$lib/geometry/clearance';
import { repeatedText } from './repeatedText';
import {
	ConstructionError, type Font, type Ring, type Edge, type Point,
	forest, contourChain, support, centroid, add, compile
} from './geometry';

export function generateRepeatedGrid(text: string, font: Font) {
	const repeated = repeatedText(text);
	if (!repeated) throw new ConstructionError('empty', 'Empty text');
	const matrix = repeated.split('\n').map(row => [...row]);
	const n = matrix.length;
	// There are 2n−1 diagonal cuts in each paper. Refuse excess density before
	// building outlines, rather than letting the editor silently lose cuts.
	if (2*n > MAX_GRID_SIZE)
		throw new ConstructionError('clearance', 'Too many letters for the repeated grid');
	const chars = [...new Set(matrix.flat())];
	for (const char of chars)
		if (!font.glyphs[char]) throw new ConstructionError('character', char);
	const points = chars.flatMap(char => font.glyphs[char].contours.flat());
	if (!points.length) throw new ConstructionError('empty', 'No letter outlines');
	const minY = Math.min(...points.map(p => p[1])), maxY = Math.max(...points.map(p => p[1]));
	const gap = gridClearance(2*n), inset = Math.max(0, n-4)*gap;
	const cy = (minY + maxY) / 2, cell = (100-2*inset) / n;
	const tiles = new Map<string, { contours: Ring[]; edges: Edge[]; start: Point; end: Point }>();
	for (const char of chars) {
		const glyph = font.glyphs[char];
		if (!glyph.contours.length) throw new ConstructionError('empty', 'No letter outlines');
		const xs = glyph.contours.flat().map(p => p[0]);
		const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
		const scale = cell * 0.68 / ((maxY-minY + Math.max(...xs)-Math.min(...xs)) * Math.SQRT1_2);
		// The cells follow the paper grid; the glyphs remain upright in the heart.
		const contours = glyph.contours.map(r => r.map(([x,y]): Point => [
			((x-cx)+(y-cy))*Math.SQRT1_2*scale,
			((y-cy)-(x-cx))*Math.SQRT1_2*scale
		]));
		const nodes = forest(contours).sort((a,b) => {
			const p = centroid(a.ring), q = centroid(b.ring);
			return p[0]+p[1]-q[0]-q[1];
		});
		const start = support(nodes[0].ring, 5*Math.PI/4).point;
		const end = support(nodes.at(-1)!.ring, Math.PI/4).point;
		const local: Edge[] = [];
		contourChain(local, nodes, Math.PI/4, start, end);
		tiles.set(char, { contours, edges: local, start, end });
	}
	const edges: Edge[] = [], artwork: Ring[] = [];
	for (let diagonal = 1 - n; diagonal < n; diagonal++) {
		let start: Point | undefined, end: Point | undefined;
		for (let row = 0; row < n; row++) {
			const col = row + diagonal;
			if (col < 0 || col >= n) continue;
			const tile = tiles.get(matrix[row][col])!;
			const move = ([x,y]: Point): Point => [inset+(col+.5)*cell+x, inset+(row+.5)*cell+y];
			const entry = move(tile.start);
			if (end) add(edges, [end,entry], 'AB','shared');
			else start = entry;
			end = move(tile.end);
			edges.push(...tile.edges.map(e => ({ ...e, from: move(e.from), to: move(e.to) })));
			artwork.push(...tile.contours.map(r => r.map(move)));
		}
		// Fan only in the outer margin. Both papers share the last segment to
		// the letter, so these joins cannot introduce visible squares inside it.
		const entry: Point = diagonal < 0 ? [gap*(n+diagonal), start![1]]
			: diagonal > 0 ? [start![0],gap*(n-diagonal)] : [n*gap,n*gap];
		const exit: Point = diagonal > 0 ? [100-gap*(n-diagonal),end![1]]
			: diagonal < 0 ? [end![0],100-gap*(n+diagonal)] : [100-n*gap,100-n*gap];
		add(edges, [[entry[0],0],entry], 'A','frame');
		add(edges, [[0,entry[1]],entry], 'B','frame');
		add(edges, [entry,start!], 'AB','shared');
		add(edges, [end!,exit], 'AB','shared');
		add(edges, [exit,[exit[0],100]], 'A','frame');
		add(edges, [exit,[100,exit[1]]], 'B','frame');
		// These overlapping rectangles describe the edge-strip parity exactly.
		// Including them makes fidelity cover the whole sheet, including its rim.
		artwork.push([[0,0],[entry[0],0],entry,[0,entry[1]]]);
		artwork.push([exit,[100,exit[1]],[100,100],[exit[0],100]]);
	}
	return { edges, artwork, geometry: compile(edges), domain: [[[0,0],[100,0],[100,100],[0,100]] as Ring] };
}
