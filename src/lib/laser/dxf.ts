/**
 * The laser DXF — docs/redesign/LASER.md "Writers".
 *
 * AutoCAD R12 (AC1009), the one version every laser program and CAD package
 * still reads, and only the entity R12 readers agree on: POLYLINE with
 * VERTEX … SEQEND. The outline's two ears are exact half circles, written as
 * polyline vertices with a bulge of 1 (tan of a quarter of 180°);
 * curved cuts are flattened to within 0.05 mm, because R12 has no Bézier and
 * the SPLINE of later versions is the entity importers get wrong.
 *
 * One layer, CUT (red, 1), and the same colour on every entity as well, for
 * the programs (xTool's among them) that sort by entity colour and never look
 * at the layer table. Every line is a cut; the fold is not drawn (see svg.ts).
 *
 * DXF's y axis points up, the page's down: every point is written as
 * `y = sheetHeight − y`, which keeps the picture the right way up.
 */
import type { Vec } from '$lib/types/heart';
import { dropCollinear, flattenCubic, FLATTEN_TOLERANCE_MM } from './flatten';
import { coord } from './format';
import type { LaserSheet } from './sheet';
import type { LaserPath } from './unfold';

export interface LaserDxfOptions {
	/** Chord error allowed when flattening a curved cut. */
	toleranceMm?: number;
}

const LAYERS = { CUT: 1 } as const;
type Layer = keyof typeof LAYERS;

interface Vertex extends Vec {
	/** Of the segment from this vertex to the next: 0 straight, ±1 a half circle (+ counter-clockwise). */
	bulge: number;
}

/**
 * A path as polyline vertices, still in page coordinates (y down).
 *
 * An SVG arc with sweep 1 turns clockwise on the page; drawn in DXF's y-up
 * frame the picture is the same, so it is a clockwise arc there too, which
 * DXF writes as a negative bulge. `orientCounterClockwise` turns the outline
 * round afterwards, so the file's bulges come out +1.
 */
function pathVertices(path: LaserPath, toleranceMm = FLATTEN_TOLERANCE_MM): Vertex[] {
	const vertices: Vertex[] = [{ ...path.start, bulge: 0 }];
	let current = path.start;
	for (const seg of path.segments) {
		if (seg.kind === 'A') {
			vertices[vertices.length - 1]!.bulge = seg.sweep === 1 ? -1 : 1;
			vertices.push({ ...seg.to, bulge: 0 });
		} else if (seg.kind === 'L') {
			vertices.push({ ...seg.to, bulge: 0 });
		} else {
			for (const p of flattenCubic(current, seg.c1, seg.c2, seg.to, toleranceMm)) {
				vertices.push({ ...p, bulge: 0 });
			}
		}
		current = seg.to;
	}
	// A closed polyline returns to its first vertex by itself.
	const first = vertices[0]!;
	const last = vertices[vertices.length - 1]!;
	if (path.closed && vertices.length > 1 && last.x === first.x && last.y === first.y) vertices.pop();

	if (vertices.every((v) => v.bulge === 0)) {
		return dropCollinear(vertices).map((v) => ({ x: v.x, y: v.y, bulge: 0 }));
	}
	return vertices;
}

/** Shoelace area, positive when the vertices run counter-clockwise in a y-up frame. */
function signedArea(vertices: Vertex[]): number {
	let sum = 0;
	for (let i = 0; i < vertices.length; i++) {
		const a = vertices[i]!;
		const b = vertices[(i + 1) % vertices.length]!;
		sum += a.x * b.y - b.x * a.y;
	}
	return sum / 2;
}

/**
 * A closed polyline run the other way if it is clockwise: DXF's convention for
 * an outer boundary. Each bulge belongs to the segment that starts at its
 * vertex, so reversing moves it to the segment's other end and flips its sign.
 */
function orientCounterClockwise(vertices: Vertex[]): Vertex[] {
	if (signedArea(vertices) >= 0) return vertices;
	const n = vertices.length;
	return vertices.map((_, k) => {
		const v = vertices[n - 1 - k]!;
		const segmentStart = vertices[(n - 2 - k + n) % n]!;
		return { x: v.x, y: v.y, bulge: -segmentStart.bulge };
	});
}

class GroupWriter {
	private lines: string[] = [];

	/** Group codes right-aligned in three columns, as AutoCAD writes them. */
	pair(code: number, value: string | number): this {
		this.lines.push(String(code).padStart(3, ' '), String(value));
		return this;
	}

	point(base: 10 | 11, p: Vec): this {
		return this.pair(base, coord(p.x))
			.pair(base + 10, coord(p.y))
			.pair(base + 20, '0');
	}

	toString(): string {
		return this.lines.join('\n') + '\n';
	}
}

export function serializeLaserDxf(layout: LaserSheet, options: LaserDxfOptions = {}): string {
	const sheetHeight = layout.sheet.heightMm;
	const toDxf = (p: Vec, dx: number, dy: number): Vec => ({ x: p.x + dx, y: sheetHeight - (p.y + dy) });

	const polylines: { layer: Layer; closed: boolean; vertices: Vertex[] }[] = [];

	const addPath = (path: LaserPath, dx: number, dy: number) => {
		let vertices = pathVertices(path, options.toleranceMm).map((v) => ({ ...toDxf(v, dx, dy), bulge: v.bulge }));
		if (path.closed) vertices = orientCounterClockwise(vertices);
		polylines.push({ layer: 'CUT', closed: path.closed, vertices });
	};

	for (const { piece, x, y } of layout.pieces) {
		addPath(piece.outline, x, y);
		for (const cut of piece.cuts) addPath(cut, x, y);
	}

	// The drawing's extents: the pieces' bounding boxes (bulges stay inside the
	// boxes, since each ear's apex is the piece's top or bottom edge).
	const xs: number[] = [];
	const ys: number[] = [];
	for (const { piece, x, y } of layout.pieces) {
		xs.push(x, x + piece.widthMm);
		ys.push(sheetHeight - y, sheetHeight - (y + piece.heightMm));
	}
	const extMin = xs.length ? { x: Math.min(...xs), y: Math.min(...ys) } : { x: 0, y: 0 };
	const extMax = xs.length ? { x: Math.max(...xs), y: Math.max(...ys) } : { x: layout.sheet.widthMm, y: sheetHeight };

	const out = new GroupWriter();
	out.pair(0, 'SECTION').pair(2, 'HEADER');
	out.pair(9, '$ACADVER').pair(1, 'AC1009');
	// Millimetres. R12 readers do not know the variable and skip it; newer
	// ones would otherwise guess, and some guess inches.
	out.pair(9, '$INSUNITS').pair(70, 4);
	out.pair(9, '$EXTMIN').point(10, extMin);
	out.pair(9, '$EXTMAX').point(10, extMax);
	out.pair(0, 'ENDSEC');

	out.pair(0, 'SECTION').pair(2, 'TABLES');
	out.pair(0, 'TABLE').pair(2, 'LTYPE').pair(70, 1);
	out.pair(0, 'LTYPE').pair(2, 'CONTINUOUS').pair(70, 0).pair(3, 'Solid line').pair(72, 65).pair(73, 0).pair(40, '0');
	out.pair(0, 'ENDTAB');
	out.pair(0, 'TABLE').pair(2, 'LAYER').pair(70, Object.keys(LAYERS).length);
	for (const [name, colour] of Object.entries(LAYERS)) {
		out.pair(0, 'LAYER').pair(2, name).pair(70, 0).pair(62, colour).pair(6, 'CONTINUOUS');
	}
	out.pair(0, 'ENDTAB');
	out.pair(0, 'ENDSEC');

	out.pair(0, 'SECTION').pair(2, 'ENTITIES');
	for (const polyline of polylines) {
		out.pair(0, 'POLYLINE').pair(8, polyline.layer).pair(62, LAYERS[polyline.layer]).pair(66, 1);
		out.point(10, { x: 0, y: 0 });
		out.pair(70, polyline.closed ? 1 : 0);
		for (const v of polyline.vertices) {
			out.pair(0, 'VERTEX').pair(8, polyline.layer).point(10, v);
			if (v.bulge !== 0) out.pair(42, coord(v.bulge));
		}
		out.pair(0, 'SEQEND').pair(8, polyline.layer);
	}
	out.pair(0, 'ENDSEC');
	out.pair(0, 'EOF');
	return out.toString();
}
