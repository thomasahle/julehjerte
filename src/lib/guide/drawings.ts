/**
 * The guide's drawings ("Sådan gør du"), as the shapes a pen would draw. The
 * paper is drawn as paper: folded sheets show both layers, a strip is a loop
 * with an opening, and everything lies on a table seen a little from the side.
 */
import { Sketch, camera, turned, moved, type Drawing, type Fill, type Line, type Pt, type Pt3 } from './sketch.ts';

const range = (n: number) => Array.from({ length: n + 1 }, (_, i) => i / n);
const rect = (x0: number, y0: number, x1: number, y1: number) => `M${x0} ${y0}H${x1}V${y1}H${x0}Z`;

/** A half as the template prints it, `w` wide: square below, rounded on top, the fold at y = 0. */
const half = (w: number) => `M${-w / 2} 0V${-w}A${w / 2} ${w / 2} 0 0 1 ${w / 2} ${-w}V0`;
/** The two inner lines of that half, from the fold to where the round top begins. */
const inner = (w: number) => `M${-w / 6} 0V${-w}M${w / 6} 0V${-w}`;

/** The template of a half on its sheet, the fold line dashed: printed, or `drawn` by hand. */
function template(s: Sketch, w: number, drawn = false) {
	s.path(half(w) + inner(w), 'none', drawn ? 'thin' : 'print');
	s.path(`M${-w / 2 - 4} 0H${w / 2 + 4}`, 'none', drawn ? 'dash' : 'print-dash');
}

/** Small strokes along a fold, as a draughtsman marks one. */
function foldMarks(s: Sketch, x0: number, x1: number, y: number, towards = -1) {
	const n = Math.round(Math.abs(x1 - x0) / 5.5);
	s.path(
		range(n)
			.slice(1, -1)
			.map((t) => `M${x0 + (x1 - x0) * t} ${y}l1.6 ${3.4 * towards}`)
			.join(''),
		'none',
		'thin'
	);
}

const ellipse = (cx: number, cy: number, rx: number, ry: number) =>
	`M${cx - rx} ${cy}A${rx} ${ry} 0 1 0 ${cx + rx} ${cy}A${rx} ${ry} 0 1 0 ${cx - rx} ${cy}Z`;

/**
 * A pair of scissors cutting, the pivot at the origin and the tips towards -y, opened by `open` degrees.
 * One blade goes `under` the paper: draw that before the paper, and the rest `over` it afterwards.
 */
function scissors(s: Sketch, open: number, part: 'under' | 'over') {
	for (const side of [1, -1]) {
		s.with(turned((side * open) / 2), () => {
			// One blade, and across the pivot its shank and finger ring.
			const blade = `M${0.3 * side} -46L${3.6 * side} -3L${2.4 * side} 4L${-3.2 * side} 2L${-2.8 * side} -4Z`;
			const shank = `M${2.4 * side} 4L${-4 * side} 17L${-8.5 * side} 15L${-3.2 * side} 2Z`;
			const whole = `M${0.3 * side} -46L${3.6 * side} -3L${2.4 * side} 4L${-4 * side} 17L${-8.5 * side} 15L${-3.2 * side} 2L${-2.8 * side} -4Z`;
			if (part === 'under') {
				if (side === 1) s.path(blade, 'steel');
				return;
			}
			s.path(side === 1 ? shank : whole, 'steel');
			s.with(turned(-14 * side, -7.5 * side, 25), () => s.path(ellipse(-7.5 * side, 25, 6.8, 10.5) + ellipse(-7.5 * side, 25.5, 3.7, 7), 'handle'));
		});
	}
	if (part === 'over') s.path(ellipse(0, 0, 1.3, 1.3), 'dark', 'none');
}

/** A paper clip over an edge at the origin, its long side towards +y. */
function paperclip(s: Sketch) {
	s.path('M-2 -3V9A2.6 2.6 0 0 0 3.2 9V-4.5A3.9 3.9 0 0 0 -4.6 -4.5V11', 'none', 'thin');
}

/** A pencil standing on its point at the origin, leaning towards -y. */
function pencil(s: Sketch) {
	s.path(rect(-2.8, -60, 2.8, -9), 'handle');
	s.path('M0 -60V-9', 'none', 'thin');
	s.path('M-2.8 -9L-1 -3.2H1L2.8 -9Z', 'white-shade');
	s.path('M-1 -3.2L0 0L1 -3.2Z', 'dark');
	s.path(rect(-2.8, -65, 2.8, -60), 'red');
}

/** A tablet lying on the table, its screen lit and empty. */
function tablet(s: Sketch, see: ReturnType<typeof camera>) {
	const body = (x: number, y: number, r: number) =>
		`M${-x + r} ${-y}H${x - r}A${r} ${r} 0 0 1 ${x} ${-y + r}V${y - r}A${r} ${r} 0 0 1 ${x - r} ${y}H${-x + r}A${r} ${r} 0 0 1 ${-x} ${y - r}V${-y + r}A${r} ${r} 0 0 1 ${-x + r} ${-y}Z`;
	s.with(see.flat(0), () => s.path(body(46, 62, 6), 'steel'));
	s.with(see.flat(2.5), () => {
		s.path(body(46, 62, 6), 'dark');
		s.path(rect(-41, -57, 41, 57), 'white', 'none');
	});
}

/** The paper folded with the fold nearest, and the template laid on it: its dashed line on the fold. */
function placing(s: Sketch, drawn = false) {
	const see = camera(-10, 58, 1, 122, 92);
	// On the left the sheet is being folded: the near half is lifted over onto the far one,
	// so the fold ends up nearest, as it lies on the right.
	const fold = camera(-30, 60, 1, 34, 96);
	const [wide, deep, lift] = [30, 46, (142 * Math.PI) / 180];
	const flap = (x: number, r: number, angle: number): Pt3 => [x, r * Math.cos(angle), r * Math.sin(angle)];
	s.points([flap(-wide, 0, 0), flap(wide, 0, 0), flap(wide, deep, 0), flap(-wide, deep, 0)].map(fold), 'red-shade');
	s.points([flap(-wide, 0, Math.PI), flap(wide, 0, Math.PI), flap(wide + 3, deep - 2, Math.PI), flap(-wide + 3, deep - 2, Math.PI)].map(fold), 'shade', 'none');
	s.points([flap(-wide, 0, lift), flap(wide, 0, lift), flap(wide, deep, lift), flap(-wide, deep, lift)].map(fold), 'red');
	// The arrow is drawn on the page, not in the room: from the lifted edge over to the far one.
	const [from, to] = [fold(flap(-6, deep - 3, lift)), fold(flap(-6, deep - 5, 0))];
	const over: Pt = [(from[0] + to[0]) / 2 - 0.5 * (to[1] - from[1]) * -1 - 34, (from[1] + to[1]) / 2 - 8];
	s.arrow(range(10).map((t) => [0, 1].map((k) => (1 - t) ** 2 * from[k] + 2 * t * (1 - t) * over[k] + t ** 2 * to[k]) as Pt));
	// On the right it lies folded, the template on top.
	s.with(see.flat(0), () => s.path(rect(8, -52, 88, 46), 'red-shade'));
	s.with(see.flat(1.5), () => {
		s.path(rect(9.5, -49, 89, 46), 'red');
		foldMarks(s, 10, 88, 46);
	});
	s.with(see.flat(3), () => {
		s.with(turned(-1.2, 48, 46), () => {
			s.path(rect(18, -58, 78, 45.5), drawn ? 'sheer' : 'white');
			s.with(moved(48, 45), () => template(s, 46, drawn));
		});
		s.with(moved(66, -52), () => paperclip(s));
		s.label(48, 66, 'guideLabelFoldLine', 'note', 62);
	});
}

/**
 * The cut-out half, still folded and with the template still on it, as the inner lines are cut
 * up from the fold: the first is cut, the second on its way.
 */
function cutLines(s: Sketch, drawn = false) {
	// Turned as you hold it to cut: the fold towards the scissors.
	const see = camera(35, 58, 1.25, 91, 71);
	const w = 66;
	const reach = 52 - w * 0.42;
	const cutting = (part: 'under' | 'over') =>
		s.with(see.flat(5), () => s.with(moved(w / 6 + 0.6, reach + 43), () => s.with(turned(3), () => scissors(s, 18, part))));
	// Each strip is a loop with its fold nearest, at `foot`.
	const strips = (gap: number, foot = 52) => {
		let d = `M${-w / 2} ${foot}`;
		for (const [i, x] of [-w / 6, w / 6].entries()) d += `H${x - gap}L${x} ${i === 0 ? 52 - w : reach}L${x + gap} ${foot}`;
		return `${d}H${w / 2}V${52 - w}A${w / 2} ${w / 2} 0 0 0 ${-w / 2} ${52 - w}Z`;
	};
	cutting('under');
	s.with(see.flat(0), () => s.with(moved(-1.8, -1.2), () => s.path(strips(0.4), 'red-shade')));
	s.with(see.flat(1.5), () => {
		s.path(strips(1.3), 'red');
		for (const x of [-w / 2, -w / 6, w / 6]) foldMarks(s, x + 3, x + w / 3 - 3, 52);
	});
	s.with(see.flat(3), () => {
		// The template was cut out with the paper, and lies on it as it did: its lines show where to cut.
		s.with(turned(-1.2, 0, 52), () => {
			s.path(strips(1.3, 49), drawn ? 'sheer' : 'white');
			// The second line is still to be cut to its end.
			s.path(`M${w / 6} ${reach}V${52 - w}`, 'none', drawn ? 'thin' : 'print');
		});
		s.with(moved(-9, 52 - w - w / 2 - 1), () => s.with(turned(8), () => paperclip(s)));
		s.arrow([
			[w / 2 + 12, 50],
			[w / 2 + 12, 4]
		]);
	});
	cutting('over');
	s.label(196, 106, 'guideLabelFromFold', 'note', 34);
}

/** The finished heart's front, lying flat with its point towards +y: `cell` is one check. */
function woven(s: Sketch, cell: number, line: Line = 'ink') {
	const edge = 1.5 * cell;
	const at = (i: number) => -edge + cell * i;
	s.with(turned(45, 0, 0), () => {
		s.path(`M${-edge} ${-edge}A${edge} ${edge} 0 0 0 ${-edge} ${edge}Z`, 'white', line);
		s.path(`M${-edge} ${-edge}A${edge} ${edge} 0 0 1 ${edge} ${-edge}Z`, 'red', line);
		for (const r of [0, 1, 2]) {
			for (const col of [0, 1, 2]) s.path(rect(at(col), at(r), at(col + 1), at(r + 1)), (r + col) % 2 === 1 ? 'white' : 'red', line);
		}
	});
}

/**
 * The same preparation without a printer: open the heart's tracing page on a
 * tablet, trace it onto thin paper, and use the tracing as the template.
 */
export function trace(step: number): Drawing {
	const s = new Sketch(240, 180, 7 + step);
	const see = camera(-12, 58, 1.2, 120, 92);
	if (step === 1) {
		// The heart's own page, with the button that opens the tracing.
		tablet(s, see);
		s.with(see.flat(2.5), () => {
			s.with(moved(0, -22), () => woven(s, 9.5, 'thin'));
			const button = (x0: number, x1: number) => `M${x0 + 4} 14H${x1 - 4}A4 4 0 0 1 ${x1} 18V28A4 4 0 0 1 ${x1 - 4} 32H${x0 + 4}A4 4 0 0 1 ${x0} 28V18A4 4 0 0 1 ${x0 + 4} 14Z`;
			s.path(button(-37, -9), 'red', 'thin');
			s.path(button(-5, 33), 'white');
			s.label(14, 26.5, 'traceFromScreen', 'button', 18);
			s.path('M-37 42H22M-37 48H31', 'none', 'print');
			s.arrow([
				[78, 4],
				[68, 19],
				[36, 23]
			]);
		});
	} else if (step === 2) {
		// The template on the screen, thin paper taped over it, and the lines drawn so far.
		const w = 50;
		tablet(s, see);
		s.with(see.flat(2.5), () => s.with(moved(0, 34), () => s.path(half(w) + inner(w) + `M${-w / 2 - 4} 0H${w / 2 + 4}`, 'none', 'ink')));
		const soFar = `M${w / 2} 0V${-w}A${w / 2} ${w / 2} 0 0 0 ${-w * 0.35} ${-w - w * 0.357}`;
		s.with(see.flat(3.5), () => {
			s.with(turned(2), () => {
				s.path(rect(-62, -52, 60, 50), 'sheer');
				// A piece of tape over each end of the paper's edges on the tablet.
				for (const [tx, ty, turn] of [[-30, -52, -8], [28, -52, 6], [-27, 50, 5], [30, 50, -7]]) {
					s.with(moved(tx, ty), () => s.with(turned(turn), () => s.path(rect(-4, -8, 4, 8), 'handle', 'thin')));
				}
			});
			s.with(moved(0, 34), () => s.path(soFar, 'none', 'cut'));
		});
		const [x, y] = see([-w * 0.35, -(34 - w - w * 0.357), 3.5]);
		s.with(moved(x, y), () => s.with(turned(38), () => pencil(s)));
	} else if (step === 3) {
		placing(s, true);
	} else {
		cutLines(s, true);
	}
	return s.done(10);
}

/**
 * The four preparation steps: print the template, fold the paper and lay the
 * template on the fold, cut the outline, cut the strips up from the fold.
 */
export function prepare(step: number): Drawing {
	const s = new Sketch(240, 180, step * 1.3);
	if (step === 1) {
		const see = camera(-16, 56, 1, 112, 84);
		// The printer: a box at the back of the table, blank paper standing in its tray.
		const [x0, x1, y0, y1, top] = [-56, 56, 12, 60, 30];
		const tray: Pt3[] = [
			[-34, 52, top],
			[34, 52, top],
			[34, 70, top + 40],
			[-34, 70, top + 40]
		];
		s.points(tray.map(see), 'white');
		const sx = see.side > 0 ? x1 : x0;
		s.points(
			(
				[
					[sx, y0, 0],
					[sx, y1, 0],
					[sx, y1, top],
					[sx, y0, top]
				] as Pt3[]
			).map(see),
			'steel'
		);
		s.points(
			(
				[
					[x0, y0, 0],
					[x1, y0, 0],
					[x1, y0, top],
					[x0, y0, top]
				] as Pt3[]
			).map(see),
			'white-shade'
		);
		s.points(
			(
				[
					[x0, y0, top],
					[x1, y0, top],
					[x1, y1, top],
					[x0, y1, top]
				] as Pt3[]
			).map(see),
			'white'
		);
		s.points(
			(
				[
					[-36, 46, top],
					[36, 46, top],
					[36, 54, top],
					[-36, 54, top]
				] as Pt3[]
			).map(see),
			'dark'
		);
		s.points(
			(
				[
					[-40, y0, 4],
					[40, y0, 4],
					[40, y0, 11],
					[-40, y0, 11]
				] as Pt3[]
			).map(see),
			'dark'
		);
		s.points([see([40, y0, 22]), see([48, y0, 22])], 'none', 'ink');
		// The printed sheet, coming out onto the table.
		s.with(see.flat(1), () => {
			s.path(rect(-33, -12, 33, 80), 'white');
			s.with(moved(0, 62), () => template(s, 40));
		});
		s.label(196, 150, '100 %', 'strong', 16);
	} else if (step === 2) {
		placing(s);
	} else if (step === 3) {
		const see = camera(-10, 58, 1.22, 112, 92);
		const w = 52;
		const cutting = (part: 'under' | 'over') =>
			s.with(see.flat(5), () => s.with(turned(-118, -18.2, -19.6), () => s.with(moved(-18.2, -19.6 + 40), () => scissors(s, 20, part))));
		cutting('under');
		s.with(see.flat(0), () => s.path(rect(-40, -52, 40, 52), 'red-shade'));
		s.with(see.flat(1.5), () => {
			s.path(rect(-38.5, -49, 41, 52), 'red');
			foldMarks(s, -38, 40, 52);
		});
		s.with(see.flat(3), () => {
			s.with(turned(-1.2, 0, 52), () => {
				s.path(rect(-30, -58, 30, 51.5), 'white');
				s.with(moved(0, 51), () => {
					template(s, w);
					// Cut so far: up the right side and over the top.
					s.path(`M${w / 2} 0V${-w}A${w / 2} ${w / 2} 0 0 0 ${-w * 0.35} ${-w - w * 0.357}`, 'none', 'cut');
				});
			});
			s.with(moved(-23, -59), () => paperclip(s));
		});
		cutting('over');
	} else {
		cutLines(s);
	}
	return s.done(10);
}

/**
 * One crossing, seen close up: the loop of one colour held open, and the other
 * colour's folded strip passed through the opening.
 *
 * The white strip comes from the left and the red one from behind, as the
 * halves lie when weaving. `open` is the colour whose loop is held open.
 */
export function crossing(open: 'red' | 'white'): Drawing {
	const s = new Sketch(420, 270, open === 'red' ? 2 : 5);
	const see = camera(33, 38, 1.55, 214, 148);
	const half = 21;
	// Along the open strip: `fold` is its free end, `far` runs on to the half.
	const [fold, far] = [72, -190];
	const lift = (u: number) => {
		// The upper layer rises from the fold, highest over the crossing.
		const t = (fold - u) / (fold + 96);
		return t >= 1 ? 2 : 2 + 30 * Math.sin(Math.PI * Math.min(1, t)) ** 1.5;
	};
	// Along the strip that passes through: its fold leads, the layers close up there.
	const [tip, tail] = [78, -230];
	const gap = (u: number) => 1 + 4.5 * Math.min(1, (tip - u) / 40) ** 0.6;

	// White runs along x, red along y towards the viewer (its fold is nearest).
	const along = (colour: 'red' | 'white', u: number, w: number, z: number): Pt3 => (colour === 'white' ? [u, w, z] : [w, -u, z]);
	const through = open === 'red' ? 'white' : 'red';
	const band = (colour: 'red' | 'white', from: number, to: number, height: (u: number) => number, n = 40): Pt[] => {
		const us = range(n).map((t) => from + (to - from) * t);
		return [...us.map((u) => see(along(colour, u, -half, height(u)))), ...us.reverse().map((u) => see(along(colour, u, half, height(u))))];
	};

	// The open loop's lower layer lies flat; little of it shows, all of it in shade.
	s.points(band(open, far, fold, () => 0, 8), `${open}-shade`);
	// The strip passing through: lower layer, then upper, joined at the leading fold.
	s.points(band(through, tail, tip, () => 1, 8), `${through}-shade`);
	s.points(band(through, tail, tip, gap, 24), through);
	// In the shade of the open loop.
	s.points(band(through, -half, half, gap, 4), 'shade', 'none');
	// The open loop's upper layer arches over it.
	s.points(band(open, far, fold, lift), open);

	// Which way the strip is pushed.
	const side = open === 'red' ? -half - 20 : half + 22;
	s.arrow([-128, -66].map((u) => see(along(through, u, side, 0))));
	return s.done();
}

/**
 * The weave from the front after the first `row` white strips: the red half
 * comes from above and the white one from the left. Strips still to be woven
 * lie loose, swung towards you.
 */
export function rows(row: number): Drawing {
	const s = new Sketch(420, 270, 4);
	// The three drawings share one frame: the heart stays where it is from step to step.
	const frame = new Sketch(420, 270, 4);
	for (const each of [1, 2, 3]) weave(frame, each);
	s.keep(frame.extent());
	weave(s, row);
	return s.done(10);
}

/** Draws the weave with its first `row` white strips woven. */
function weave(s: Sketch, row: number) {
	const see = camera(-7, 62, 1.52, 236, 142);
	const cell = 30;
	const edge = 1.5 * cell;
	const at = (i: number) => -edge + cell * i;
	const eye = (x0: number, y0: number, x1: number, y1: number, bulge: number) => {
		// The opening of a loop, seen at its fold.
		const [nx, ny] = [(y1 - y0) / Math.hypot(x1 - x0, y1 - y0), -(x1 - x0) / Math.hypot(x1 - x0, y1 - y0)];
		return `M${x0} ${y0}Q${(x0 + x1) / 2 + nx * bulge} ${(y0 + y1) / 2 + ny * bulge} ${x1} ${y1}`;
	};
	s.with(see.flat(0), () => {
		// Both halves are two layers: the lower one shows along the round edges.
		s.with(moved(2.2, -2.4), () => {
			s.path(`M${-edge} ${-edge}A${edge} ${edge} 0 0 1 ${edge} ${-edge}Z`, 'red-shade');
			s.path(`M${-edge} ${-edge}A${edge} ${edge} 0 0 0 ${-edge} ${edge}Z`, 'white-shade');
		});
	});
	s.with(see.flat(1.5), () => {
		s.path(`M${-edge} ${-edge}A${edge} ${edge} 0 0 0 ${-edge} ${edge}Z`, 'white');
		s.path(`M${-edge} ${-edge}A${edge} ${edge} 0 0 1 ${edge} ${-edge}Z`, 'red');
		for (const col of [0, 1, 2]) {
			s.path(rect(at(col), -edge, at(col + 1), edge + 3), 'red');
			// A strip is one piece with its round end: no line where they meet.
			s.path(rect(at(col) + 1.1, -edge - 1.5, at(col + 1) - 1.1, -edge + 1.5), 'red', 'none');
			s.path(eye(at(col) + 1, edge + 3, at(col + 1) - 1, edge + 3, 4), 'none', 'thin');
		}
		for (let r = 0; r < row; r++) {
			for (const col of [0, 1, 2]) {
				if ((r + col) % 2 === 1) s.path(rect(at(col), at(r), at(col + 1), at(r + 1)), 'white');
			}
			if (r % 2 === 1) {
				s.path(rect(-edge - 1.5, at(r) + 1.1, -edge + 1.5, at(r + 1) - 1.1), 'white', 'none');
				// A white strip ending on top shows its fold at the right.
				s.path(eye(edge, at(r) + 1, edge, at(r + 1) - 1, -4), 'none', 'thin');
			}
		}
	});
	// A loose white strip bends away from the weave, more the later its turn.
	const loose = (r: number, wait: number) => {
		const swing = ((14 + 15 * wait) * Math.PI) / 180;
		const [x0, y0] = [-edge - 1.5, at(r) + cell / 2];
		const [x2, y2] = [x0 + 96 * Math.cos(swing), y0 + 96 * Math.sin(swing)];
		const centre = range(16).map((t): Pt => {
			const u = 1 - t;
			return [u * u * x0 + 2 * u * t * (x0 + 46) + t * t * x2, u * u * y0 + 2 * u * t * y0 + t * t * y2];
		});
		const normal = (i: number): Pt => {
			const [ax, ay] = centre[Math.max(0, i - 1)];
			const [bx, by] = centre[Math.min(centre.length - 1, i + 1)];
			const l = Math.hypot(bx - ax, by - ay);
			return [-(by - ay) / l, (bx - ax) / l];
		};
		const sideLine = (k: number) => centre.map(([x, y], i): Pt => [x + k * normal(i)[0] * (cell / 2), y + k * normal(i)[1] * (cell / 2)]);
		return [sideLine(-1), sideLine(1)];
	};
	s.with(see.flat(3), () => {
		for (let r = 2; r >= row; r--) {
			const [upper, lower] = loose(r, r - row);
			const outline = [...upper, ...lower.slice().reverse()];
			s.points(outline, 'white', 'none');
			// Open where the strip leaves its round end.
			s.points(outline, 'none', 'ink', false);
			const [a, b] = [upper[upper.length - 1], lower[lower.length - 1]];
			s.path(eye(a[0], a[1], b[0], b[1], -5), 'none', 'thin');
		}
	});
	s.with(see.flat(3), () => {
		// The strip this step weaves, ringed as with a pencil.
		const y = at(row - 1);
		s.path(`M${-edge + 2} ${y - 4}H${edge + 6}Q${edge + 11} ${y + cell / 2} ${edge + 6} ${y + cell + 4}H${-edge + 2}Q${-edge - 4} ${y + cell / 2} ${-edge + 2} ${y - 4}Z`, 'none', 'dash');
		for (const i of [0, 1, 2]) {
			s.label(-edge - (i === 1 ? 24 : 16), at(i) + cell / 2 + 5, String(i + 1), i === row - 1 ? 'strong' : 'ink', 6);
		}
	});
}

/** The finished heart, opened a little as the basket it is, with its handle. */
export function finished(): Drawing {
	const s = new Sketch(240, 200, 9);
	const cell = 26;
	const edge = 1.5 * cell;
	const cap = (colour: Fill, flip: boolean) =>
		s.path(flip ? `M${-edge} ${-edge}A${edge} ${edge} 0 0 0 ${-edge} ${edge}Z` : `M${-edge} ${-edge}A${edge} ${edge} 0 0 1 ${edge} ${-edge}Z`, colour);
	const heart = turned(45, 0, 0);
	// The back of the basket shows above the front along the round tops.
	const back: Pt = [5, -8];
	s.with(moved(120 + back[0], 112 + back[1]), () => {
		s.with(heart, () => {
			cap('red-shade', false);
			cap('white-shade', true);
		});
	});
	// The handle: a strip from inside the front, over the opening, to inside the back.
	const [wide, tall, over] = [4.5, 40, 8];
	const notch = 112 - edge * Math.SQRT2;
	const strip = (from: number, to: number): Pt[] => {
		// Along the strip: up the front, over in a half circle, down the back.
		const line = range(24).map((t): Pt => {
			const along = from + (to - from) * t;
			const turn = Math.min(Math.max(along - 1, 0), 1) * Math.PI;
			const [depth, height] = along < 1 ? [0, -14 + (tall + 14) * along] : along > 2 ? [2 * over, tall - (tall + 8) * (along - 2)] : [over * (1 - Math.cos(turn)), tall + over * Math.sin(turn)];
			return [120 + (depth * back[0] * 1.3) / over, notch - height + (depth * back[1]) / (2 * over)];
		});
		return [...line.map(([x, y]): Pt => [x - wide, y]), ...line.reverse().map(([x, y]): Pt => [x + wide, y])];
	};
	s.points(strip(1.65, 3), 'red-shade');
	s.points(strip(0, 1.65), 'red');
	s.with(moved(120, 112), () => woven(s, cell));
	return s.done(8);
}
