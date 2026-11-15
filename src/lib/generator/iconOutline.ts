/**
 * An icon's SVG body as the generator's contours, outlined in the browser as
 * `scripts/generator/build-outlines.py` outlines the site's own figures:
 * curves flattened, each element filled by its fill rule, strokes widened,
 * everything joined. For the icons found in the open sets (`iconSearch`).
 *
 * Only what a paper figure can be made of is read: plain filled or stroked
 * shapes. A body with masks, clips, gradients, see-through layers or
 * anything else unknown is refused rather than guessed at.
 */
import ClipperLib from 'clipper-lib';
import { parsePathDataToSubpaths } from '$lib/geometry/bezierSegments';
import { area, type Point, type Ring } from './geometry';

export class IconOutlineError extends Error {}

/** x' = a x + c y + e, y' = b x + d y + f. */
type Matrix = [number, number, number, number, number, number];
const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];
const times = (m: Matrix, n: Matrix): Matrix => [
	m[0] * n[0] + m[2] * n[1],
	m[1] * n[0] + m[3] * n[1],
	m[0] * n[2] + m[2] * n[3],
	m[1] * n[2] + m[3] * n[3],
	m[0] * n[4] + m[2] * n[5] + m[4],
	m[1] * n[4] + m[3] * n[5] + m[5]
];
const NUMBER = /[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/g;
const numbers = (text: string | null) => (text ?? '').match(NUMBER)?.map(Number) ?? [];

function transformOf(text: string | null): Matrix {
	let m = IDENTITY;
	for (const [, name, inner] of (text ?? '').matchAll(/([a-zA-Z]+)\s*\(([^)]*)\)/g)) {
		const v = numbers(inner);
		let n: Matrix;
		if (name === 'matrix' && v.length === 6) n = v as Matrix;
		else if (name === 'translate' && v.length) n = [1, 0, 0, 1, v[0], v[1] ?? 0];
		else if (name === 'scale' && v.length) n = [v[0], 0, 0, v[1] ?? v[0], 0, 0];
		else if (name === 'rotate' && v.length) {
			const a = (v[0] * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a), [x, y] = [v[1] ?? 0, v[2] ?? 0];
			n = [c, s, -s, c, x - c * x + s * y, y - s * x - c * y];
		} else throw new IconOutlineError(`transform ${name}`);
		m = times(m, n);
	}
	return m;
}

/** What an element inherits from the groups around it. */
type Paint = { fill: string; rule: string; stroke: string; width: number; cap: string; join: string; matrix: Matrix };
const INHERITED = { fill: 'fill', rule: 'fill-rule', stroke: 'stroke', cap: 'stroke-linecap', join: 'stroke-linejoin' } as const;
/** Attributes that say nothing about the shape. */
const PLAIN = new Set(['d', 'class', 'id', 'style', 'xmlns', 'cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'width', 'height', 'points', 'transform', 'fill', 'fill-rule', 'clip-rule', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'color']);

/** The shape of an element as path data. */
function pathData(el: Element): string {
	const n = (name: string) => Number(el.getAttribute(name) ?? 0) || 0;
	switch (el.localName) {
		case 'path':
			return el.getAttribute('d') ?? '';
		case 'circle':
		case 'ellipse': {
			const rx = el.localName === 'circle' ? n('r') : n('rx'), ry = el.localName === 'circle' ? n('r') : n('ry'), cx = n('cx'), cy = n('cy');
			return rx > 0 && ry > 0 ? `M${cx - rx} ${cy}A${rx} ${ry} 0 1 0 ${cx + rx} ${cy}A${rx} ${ry} 0 1 0 ${cx - rx} ${cy}Z` : '';
		}
		case 'rect': {
			const x = n('x'), y = n('y'), w = n('width'), h = n('height');
			const rx = Math.min(w / 2, el.hasAttribute('rx') ? n('rx') : n('ry')), ry = Math.min(h / 2, el.hasAttribute('ry') ? n('ry') : n('rx'));
			if (!(w > 0 && h > 0)) return '';
			if (!(rx > 0 && ry > 0)) return `M${x} ${y}H${x + w}V${y + h}H${x}Z`;
			const arc = `A${rx} ${ry} 0 0 1 `;
			return `M${x + rx} ${y}H${x + w - rx}${arc}${x + w} ${y + ry}V${y + h - ry}${arc}${x + w - rx} ${y + h}H${x + rx}${arc}${x} ${y + h - ry}V${y + ry}${arc}${x + rx} ${y}Z`;
		}
		case 'line':
			return `M${n('x1')} ${n('y1')}L${n('x2')} ${n('y2')}`;
		case 'polygon':
		case 'polyline': {
			const v = numbers(el.getAttribute('points'));
			if (v.length < 4) return '';
			let d = `M${v[0]} ${v[1]}`;
			for (let i = 2; i + 1 < v.length; i += 2) d += `L${v[i]} ${v[i + 1]}`;
			return d + (el.localName === 'polygon' ? 'Z' : '');
		}
	}
	throw new IconOutlineError(`element ${el.localName}`);
}

type Line = { points: Point[]; closed: boolean };

/** Path data as lines of points, its curves flattened to within `tolerance`. */
function flattened(d: string, matrix: Matrix, tolerance: number): Line[] {
	const at = (x: number, y: number): Point => [matrix[0] * x + matrix[2] * y + matrix[4], matrix[1] * x + matrix[3] * y + matrix[5]];
	const lines: Line[] = [];
	for (const segments of parsePathDataToSubpaths(d)) {
		const points: Point[] = [at(segments[0].p0.x, segments[0].p0.y)];
		for (const s of segments) {
			const [a, b, c, e] = [s.p0, s.p1, s.p2, s.p3].map(p => at(p.x, p.y));
			// A cubic lies within 3/4 of its control points' distance from its chord;
			// cut in n, each part lies n² times closer to its own.
			const chord = Math.hypot(e[0] - a[0], e[1] - a[1]);
			const off = (p: Point) => {
				const t = chord ? Math.max(0, Math.min(1, ((p[0] - a[0]) * (e[0] - a[0]) + (p[1] - a[1]) * (e[1] - a[1])) / chord ** 2)) : 0;
				return Math.hypot(p[0] - a[0] - t * (e[0] - a[0]), p[1] - a[1] - t * (e[1] - a[1]));
			};
			const steps = Math.min(100, Math.max(1, Math.ceil(Math.sqrt((0.75 * Math.max(off(b), off(c))) / tolerance))));
			for (let i = 1; i <= steps; i++) {
				const t = i / steps, u = 1 - t;
				points.push([
					u * u * u * a[0] + 3 * u * u * t * b[0] + 3 * u * t * t * c[0] + t * t * t * e[0],
					u * u * u * a[1] + 3 * u * u * t * b[1] + 3 * u * t * t * c[1] + t * t * t * e[1]
				]);
			}
		}
		const first = points[0], last = points[points.length - 1];
		const closed = points.length > 2 && Math.hypot(first[0] - last[0], first[1] - last[1]) < tolerance / 100;
		if (closed) points.pop();
		lines.push({ points, closed });
	}
	return lines;
}

const union = (paths: ClipperLib.Paths, fill: ClipperLib.PolyFillType) => {
	const clipper = new ClipperLib.Clipper(), out: ClipperLib.Paths = [];
	clipper.AddPaths(paths, ClipperLib.PolyType.ptSubject, true);
	clipper.Execute(ClipperLib.ClipType.ctUnion, out, fill, fill);
	return out;
};
const signedArea = (paths: ClipperLib.Paths) => paths.reduce((sum, path) => sum + ClipperLib.Clipper.Area(path), 0);

export type IconOutline = {
	/** The figure as the site's own are stored: centred, its longer side 1, each ring's area positive. */
	contours: Ring[];
	/**
	 * How much of the figure is left when a 33rd of its size is taken off every
	 * edge, as a share of its area: nothing of a drawing in thin lines, most
	 * of a solid shape. Paper that thin tears when it is cut and woven.
	 */
	solid: number;
};

/** The share of a figure's size taken off its edges to see how solid it is. */
export const SOLID_INSET = 0.05;

/** The contours of an icon's SVG body (the inside of its `<svg>`), drawn in a box `width` by `height`. */
export function iconOutline(body: string, width: number, height: number): IconOutline {
	const parsed = new DOMParser().parseFromString(`<svg xmlns="http://www.w3.org/2000/svg">${body}</svg>`, 'image/svg+xml');
	const root = parsed.documentElement;
	if (root.localName !== 'svg' || parsed.getElementsByTagName('parsererror').length) throw new IconOutlineError('not SVG');
	const box = Math.max(width, height);
	if (!(box > 0)) throw new IconOutlineError('no size');
	const K = 1e7 / box, tolerance = box / 5120;
	const toPath = (points: Point[]): ClipperLib.Path => points.map(([x, y]) => ({ X: Math.round(x * K), Y: Math.round(y * K) }));
	let all: ClipperLib.Paths = [];
	const walk = (el: Element, inherited: Paint) => {
		const paint = { ...inherited };
		for (const { name, value } of [...el.attributes]) {
			if (!PLAIN.has(name)) throw new IconOutlineError(`attribute ${name}`);
			if (name === 'style' && value.trim()) throw new IconOutlineError('style');
		}
		for (const [key, name] of Object.entries(INHERITED)) if (el.hasAttribute(name)) paint[key as keyof typeof INHERITED] = el.getAttribute(name)!.trim();
		if (el.hasAttribute('stroke-width')) paint.width = Number(el.getAttribute('stroke-width')) || 0;
		paint.matrix = times(inherited.matrix, transformOf(el.getAttribute('transform')));
		if (el.localName === 'g' || el === root) {
			for (const child of [...el.children]) walk(child, paint);
			return;
		}
		const lines = flattened(pathData(el), paint.matrix, tolerance);
		if (paint.fill !== 'none')
			all = all.concat(union(lines.filter(l => l.points.length > 2).map(l => toPath(l.points)), paint.rule === 'evenodd' ? ClipperLib.PolyFillType.pftEvenOdd : ClipperLib.PolyFillType.pftNonZero));
		if (paint.stroke !== 'none' && paint.width > 0) {
			const [a, b, c, d] = paint.matrix, half = (paint.width / 2) * Math.sqrt(Math.abs(a * d - b * c)) * K;
			const offset = new ClipperLib.ClipperOffset(4, tolerance * K), out: ClipperLib.Paths = [];
			const join = paint.join === 'round' ? ClipperLib.JoinType.jtRound : paint.join === 'bevel' ? ClipperLib.JoinType.jtSquare : ClipperLib.JoinType.jtMiter;
			const end = paint.cap === 'round' ? ClipperLib.EndType.etOpenRound : paint.cap === 'square' ? ClipperLib.EndType.etOpenSquare : ClipperLib.EndType.etOpenButt;
			for (const line of lines) offset.AddPath(toPath(line.points), join, line.closed ? ClipperLib.EndType.etClosedLine : end);
			offset.Execute(out, half);
			all = all.concat(out);
		}
	};
	walk(root, { fill: 'black', rule: 'nonzero', stroke: 'none', width: 1, cap: 'butt', join: 'miter', matrix: IDENTITY });
	const whole = ClipperLib.Clipper.CleanPolygons(union(all, ClipperLib.PolyFillType.pftNonZero), K * tolerance / 4).filter(path => path.length > 2);
	let [x0, x1, y0, y1] = [Infinity, -Infinity, Infinity, -Infinity];
	for (const path of whole) for (const p of path) [x0, x1, y0, y1] = [Math.min(x0, p.X), Math.max(x1, p.X), Math.min(y0, p.Y), Math.max(y1, p.Y)];
	const size = Math.max(x1 - x0, y1 - y0), total = Math.abs(signedArea(whole));
	if (!(size > 0 && total > 0)) throw new IconOutlineError('empty');
	const inset = new ClipperLib.ClipperOffset(2, size / 2000), left: ClipperLib.Paths = [];
	inset.AddPaths(whole, ClipperLib.JoinType.jtRound, ClipperLib.EndType.etClosedPolygon);
	inset.Execute(left, -SOLID_INSET * size);
	const contours = whole
		.map(path => path.map((p): Point => [Math.round(((p.X - (x0 + x1) / 2) / size) * 1e5) / 1e5, Math.round(((p.Y - (y0 + y1) / 2) / size) * 1e5) / 1e5]))
		.map(ring => (area(ring) < 0 ? ring.reverse() : ring))
		.filter(ring => Math.abs(area(ring)) > 1e-7);
	return { contours, solid: Math.abs(signedArea(left)) / total };
}

/** The contours as a preview's path, filling 90 of a box of 100. */
export function contourArt(contours: Ring[]): string {
	const d = contours.map(ring => 'M' + ring.map(([x, y]) => `${(50 + 90 * x).toFixed(2)} ${(50 + 90 * y).toFixed(2)}`).join('L') + 'Z').join('');
	return `<path fill="currentColor" fill-rule="evenodd" d="${d}"/>`;
}
