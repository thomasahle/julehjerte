/**
 * A pen for the guide's drawings: shapes are given as plain geometry and come
 * out as if drawn by hand. Every point is pushed a little by one smooth field
 * over the whole drawing, so lines waver while edges that meet still meet.
 */

export type Pt = [number, number];
export type Pt3 = [number, number, number];

export type Fill = 'none' | 'red' | 'red-shade' | 'white' | 'white-shade' | 'sheer' | 'steel' | 'handle' | 'dark' | 'shade';
export type Line = 'none' | 'ink' | 'thin' | 'dash' | 'print' | 'print-dash' | 'cut';

export interface Shape {
	d: string;
	fill: Fill;
	line: Line;
}

/** A label is one of the page's own texts, set in type next to the drawing. */
export interface Label {
	x: number;
	y: number;
	/** A translation key, or the text itself for numbers. */
	text: string;
	key: boolean;
	anchor: 'start' | 'middle' | 'end';
	/** `light` is for text on red paper, `strong` for the strip being woven, `button` for a button of the site. */
	tone: 'ink' | 'light' | 'strong' | 'note' | 'button';
}

export interface Drawing {
	width: number;
	height: number;
	shapes: Shape[];
	labels: Label[];
}

export type Matrix = [number, number, number, number, number, number];

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

function times(m: Matrix, n: Matrix): Matrix {
	return [
		m[0] * n[0] + m[2] * n[1],
		m[1] * n[0] + m[3] * n[1],
		m[0] * n[2] + m[2] * n[3],
		m[1] * n[2] + m[3] * n[3],
		m[0] * n[4] + m[2] * n[5] + m[4],
		m[1] * n[4] + m[3] * n[5] + m[5]
	];
}

/** Turn by `degrees` about (cx, cy), then scale about the same point. */
export function turned(degrees: number, cx = 0, cy = 0, scale = 1): Matrix {
	const a = (degrees * Math.PI) / 180;
	const c = Math.cos(a) * scale;
	const s = Math.sin(a) * scale;
	return [c, s, -s, c, cx - c * cx + s * cy, cy - s * cx - c * cy];
}

/** Move by (dx, dy). */
export function moved(dx: number, dy: number): Matrix {
	return [1, 0, 0, 1, dx, dy];
}

const NUMBER = /-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?/gi;

/**
 * The points of an SVG path, close enough together (`step` apart at most) for
 * the hand's waver to show. Understands M L H V C Q A Z in both cases.
 */
export function flatten(d: string, step: number): { points: Pt[]; closed: boolean }[] {
	const out: { points: Pt[]; closed: boolean }[] = [];
	let points: Pt[] = [];
	let x = 0;
	let y = 0;
	const end = (closed: boolean) => {
		if (points.length > 1) out.push({ points, closed });
		points = [];
	};
	const curve = (length: number, at: (t: number) => Pt) => {
		const n = Math.max(1, Math.ceil(length / step));
		for (let i = 1; i <= n; i++) points.push(at(i / n));
		[x, y] = points[points.length - 1];
	};
	const lineTo = (x1: number, y1: number) => {
		const x0 = x;
		const y0 = y;
		curve(Math.hypot(x1 - x0, y1 - y0), (t) => [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t]);
	};
	for (const [, command, rest] of d.matchAll(/([a-z])([^a-z]*)/gi)) {
		const n = (rest.match(NUMBER) ?? []).map(Number);
		const relative = command === command.toLowerCase();
		const ox = relative ? x : 0;
		const oy = relative ? y : 0;
		switch (command.toUpperCase()) {
			case 'M':
				end(false);
				x = ox + n[0];
				y = oy + n[1];
				points.push([x, y]);
				for (let i = 2; i + 1 < n.length; i += 2) lineTo((relative ? x : 0) + n[i], (relative ? y : 0) + n[i + 1]);
				break;
			case 'L':
				for (let i = 0; i + 1 < n.length; i += 2) lineTo((relative ? x : 0) + n[i], (relative ? y : 0) + n[i + 1]);
				break;
			case 'H':
				for (const v of n) lineTo((relative ? x : 0) + v, y);
				break;
			case 'V':
				for (const v of n) lineTo(x, (relative ? y : 0) + v);
				break;
			case 'C':
				for (let i = 0; i + 5 < n.length; i += 6) {
					const bx = relative ? x : 0;
					const by = relative ? y : 0;
					const p: Pt[] = [
						[x, y],
						[bx + n[i], by + n[i + 1]],
						[bx + n[i + 2], by + n[i + 3]],
						[bx + n[i + 4], by + n[i + 5]]
					];
					const length = Math.hypot(p[1][0] - p[0][0], p[1][1] - p[0][1]) + Math.hypot(p[2][0] - p[1][0], p[2][1] - p[1][1]) + Math.hypot(p[3][0] - p[2][0], p[3][1] - p[2][1]);
					curve(length, (t) => {
						const u = 1 - t;
						const a = u * u * u;
						const b = 3 * u * u * t;
						const c = 3 * u * t * t;
						const e = t * t * t;
						return [a * p[0][0] + b * p[1][0] + c * p[2][0] + e * p[3][0], a * p[0][1] + b * p[1][1] + c * p[2][1] + e * p[3][1]];
					});
				}
				break;
			case 'Q':
				for (let i = 0; i + 3 < n.length; i += 4) {
					const bx = relative ? x : 0;
					const by = relative ? y : 0;
					const p: Pt[] = [
						[x, y],
						[bx + n[i], by + n[i + 1]],
						[bx + n[i + 2], by + n[i + 3]]
					];
					const length = Math.hypot(p[1][0] - p[0][0], p[1][1] - p[0][1]) + Math.hypot(p[2][0] - p[1][0], p[2][1] - p[1][1]);
					curve(length, (t) => {
						const u = 1 - t;
						return [u * u * p[0][0] + 2 * u * t * p[1][0] + t * t * p[2][0], u * u * p[0][1] + 2 * u * t * p[1][1] + t * t * p[2][1]];
					});
				}
				break;
			case 'A':
				for (let i = 0; i + 6 < n.length; i += 7) {
					arc(x, y, n[i], n[i + 1], n[i + 2], n[i + 3] !== 0, n[i + 4] !== 0, (relative ? x : 0) + n[i + 5], (relative ? y : 0) + n[i + 6], curve);
				}
				break;
			case 'Z':
				if (points.length) {
					const [sx, sy] = points[0];
					lineTo(sx, sy);
					points.pop();
					x = sx;
					y = sy;
					end(true);
					points.push([x, y]);
				}
				break;
			default:
				throw new Error(`sketch: path command ${command} is not understood`);
		}
	}
	end(false);
	return out;
}

/** An SVG elliptical arc, by its centre (SVG 1.1, appendix F.6.5). */
function arc(x0: number, y0: number, rx: number, ry: number, turn: number, large: boolean, sweep: boolean, x1: number, y1: number, curve: (length: number, at: (t: number) => Pt) => void) {
	const phi = (turn * Math.PI) / 180;
	const cos = Math.cos(phi);
	const sin = Math.sin(phi);
	const dx = (x0 - x1) / 2;
	const dy = (y0 - y1) / 2;
	const px = cos * dx + sin * dy;
	const py = -sin * dx + cos * dy;
	rx = Math.abs(rx);
	ry = Math.abs(ry);
	const grow = Math.sqrt((px * px) / (rx * rx) + (py * py) / (ry * ry));
	if (grow > 1) {
		rx *= grow;
		ry *= grow;
	}
	const under = rx * rx * py * py + ry * ry * px * px;
	const k = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, (rx * rx * ry * ry - under) / under));
	const cxp = (k * rx * py) / ry;
	const cyp = (-k * ry * px) / rx;
	const cx = cos * cxp - sin * cyp + (x0 + x1) / 2;
	const cy = sin * cxp + cos * cyp + (y0 + y1) / 2;
	const from = Math.atan2((py - cyp) / ry, (px - cxp) / rx);
	let sweepBy = Math.atan2((-py - cyp) / ry, (-px - cxp) / rx) - from;
	if (sweep && sweepBy < 0) sweepBy += 2 * Math.PI;
	if (!sweep && sweepBy > 0) sweepBy -= 2 * Math.PI;
	curve(Math.abs(sweepBy) * Math.max(rx, ry), (t) => {
		const a = from + sweepBy * t;
		const ex = rx * Math.cos(a);
		const ey = ry * Math.sin(a);
		return [cx + cos * ex - sin * ey, cy + sin * ex + cos * ey];
	});
}

/** More points on a line of points, so no two are further apart than `step`. */
export function dense(points: Pt[], step: number, closed = false): Pt[] {
	const out: Pt[] = [points[0]];
	const n = closed ? points.length : points.length - 1;
	for (let i = 0; i < n; i++) {
		const [x0, y0] = points[i];
		const [x1, y1] = points[(i + 1) % points.length];
		const pieces = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / step));
		for (let k = 1; k <= pieces; k++) out.push([x0 + ((x1 - x0) * k) / pieces, y0 + ((y1 - y0) * k) / pieces]);
	}
	if (closed) out.pop();
	return out;
}

/**
 * A view from above and to the side, as the eye sees paper lying on a table.
 * `flat(z)` lays a flat drawing on the table (or `z` above it), its y axis
 * pointing towards the viewer; `side` is the side of a box the eye can see.
 */
export function camera(azimuth: number, elevation: number, scale: number, cx: number, cy: number) {
	const a = (azimuth * Math.PI) / 180;
	const e = (elevation * Math.PI) / 180;
	const [sa, ca, se, ce] = [Math.sin(a), Math.cos(a), Math.sin(e), Math.cos(e)];
	const see = ([x, y, z]: Pt3): Pt => [cx + scale * (ca * x - sa * y), cy - scale * (sa * se * x + ca * se * y + ce * z)];
	const flat = (z = 0): Matrix => [scale * ca, -scale * sa * se, scale * sa, scale * ca * se, cx, cy - scale * ce * z];
	return Object.assign(see, { flat, side: (azimuth < 0 ? 1 : -1) as 1 | -1 });
}

/**
 * One drawing. `size` is the drawing's width: the hand wavers by the same
 * share of it in a small drawing and a large one.
 */
export class Sketch {
	private readonly drawn: { lines: { points: Pt[]; closed: boolean }[]; fill: Fill; line: Line }[] = [];
	private readonly labels: (Label & { room: number })[] = [];
	private readonly kept: Pt[] = [];
	readonly width: number;
	readonly height: number;
	private readonly seed: number;
	private matrix: Matrix = IDENTITY;
	private readonly waver: number;
	private readonly wave: number;
	private readonly step: number;

	constructor(width: number, height: number, seed = 1) {
		this.width = width;
		this.height = height;
		this.seed = seed;
		this.waver = width / 400;
		this.wave = width / 3.1;
		this.step = width / 44;
	}

	/** Draw what `draw` draws, moved or turned by `matrix`. */
	with(matrix: Matrix, draw: () => void) {
		const before = this.matrix;
		this.matrix = times(before, matrix);
		draw();
		this.matrix = before;
	}

	private place([x, y]: Pt): Pt {
		const m = this.matrix;
		return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
	}

	/** The hand: a slow waver and a quicker, smaller tremble on top of it. */
	private hand([x, y]: Pt): Pt {
		const k = (2 * Math.PI) / this.wave;
		const s = this.seed;
		return [
			x + this.waver * (Math.sin(k * (0.9 * x + 0.6 * y) + s) + 0.35 * Math.sin(k * 3.1 * (y - 0.4 * x) + 1.7 * s)),
			y + this.waver * (Math.sin(k * (0.8 * y - 0.7 * x) + 2.1 * s) + 0.35 * Math.sin(k * 2.7 * (x + 0.5 * y) + 0.7 * s))
		];
	}

	private trace(points: Pt[], closed: boolean) {
		return { points: points.map((p) => this.hand(this.place(p))), closed };
	}

	/** An SVG path, drawn by hand. */
	path(d: string, fill: Fill, line: Line = 'ink') {
		this.drawn.push({ lines: flatten(d, this.step).map((sub) => this.trace(sub.points, sub.closed)), fill, line });
	}

	/** A line through the given points, drawn by hand. */
	points(points: Pt[], fill: Fill, line: Line = 'ink', closed = fill !== 'none') {
		this.drawn.push({ lines: [this.trace(dense(points, this.step, closed), closed)], fill, line });
	}

	/** A label; `room` is half the width to keep free for its text. */
	label(x: number, y: number, text: string, tone: Label['tone'] = 'ink', room = this.width / 30, anchor: Label['anchor'] = 'middle') {
		const [px, py] = this.place([x, y]);
		this.labels.push({ x: px, y: py, text, key: tone === 'note' || tone === 'button', anchor, tone, room });
	}

	/** Keep room for these points when the drawing is fitted to its frame, without drawing them. */
	keep(points: Pt[]) {
		this.kept.push(...points.map((p) => this.place(p)));
	}

	/** An arrow along the given points: a dashed shaft and a drawn head. */
	arrow(points: Pt[], head = this.width / 32) {
		this.points(points, 'none', 'dash', false);
		const [tx, ty] = this.place(points[points.length - 1]);
		const [fx, fy] = this.place(points[points.length - 2]);
		const length = Math.hypot(tx - fx, ty - fy) || 1;
		const [dx, dy] = [(tx - fx) / length, (ty - fy) / length];
		const barb = (side: number): Pt => [tx - head * dx + side * 0.55 * head * dy, ty - head * dy - side * 0.55 * head * dx];
		const before = this.matrix;
		this.matrix = IDENTITY;
		this.points([barb(1), [tx, ty], barb(-1)], 'none', 'ink', false);
		this.matrix = before;
	}

	/** Two opposite corners of everything drawn, written and kept room for. */
	extent(): [Pt, Pt] {
		const high = this.width / 23;
		const all = [
			...this.kept,
			...this.drawn.flatMap((shape) => shape.lines.flatMap((l) => l.points)),
			...this.labels.flatMap((l): Pt[] => [
				[l.x - l.room, l.y - high],
				[l.x + l.room, l.y + high / 4]
			])
		];
		const [xs, ys] = [all.map((p) => p[0]), all.map((p) => p[1])];
		return [
			[Math.min(...xs), Math.min(...ys)],
			[Math.max(...xs), Math.max(...ys)]
		];
	}

	/**
	 * The finished drawing. With a `margin` the drawing is centred and sized to
	 * fill the frame up to that margin.
	 */
	done(margin?: number): Drawing {
		let fit = (p: Pt): Pt => p;
		if (margin !== undefined) {
			const [[x0, y0], [x1, y1]] = this.extent();
			const k = Math.min((this.width - 2 * margin) / (x1 - x0), (this.height - 2 * margin) / (y1 - y0));
			fit = ([x, y]) => [this.width / 2 + k * (x - (x0 + x1) / 2), this.height / 2 + k * (y - (y0 + y1) / 2)];
		}
		const at = (p: Pt) => fit(p).map((v) => +v.toFixed(1));
		return {
			width: this.width,
			height: this.height,
			shapes: this.drawn.map(({ lines, fill, line }) => ({
				d: lines.map((l) => l.points.map((p, i) => `${i ? 'L' : 'M'}${at(p).join(' ')}`).join('') + (l.closed ? 'Z' : '')).join(''),
				fill,
				line
			})),
			labels: this.labels.map(({ room: _room, ...l }) => ({ ...l, x: at([l.x, l.y])[0], y: at([l.x, l.y])[1] }))
		};
	}
}
