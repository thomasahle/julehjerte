/**
 * What a heart will look like before its cuts are found, to draw at once
 * while the visitor tries motifs, frames, sizes and places. A woven heart's
 * picture flips colour across every visible cut, so a frame's picture is its
 * board, its frame and its motif laid over each other: rings whose even-odd
 * fill, in the paper's square (0–100, as the constructions draw it), is where
 * the right sheet shows. The cuts found afterwards (see `generate`) make this
 * picture, or, where the generator had to fall back, the one it shows then.
 * Frames without a picture here return none.
 */
import type { GeneratorRequest } from './generate';
import { arc, boardPanels, boardRanges, frameRing, layerInset, outerFrame, ray, uprightToSheet, BOARD_STUB, FITTED, SILHOUETTE, WEDGES, type Font, type Frame, type Point, type Ring } from './geometry';
import { fillSquare, fitCircle } from './frameFit';
import { fittedPicture } from './fitted';
import { normalizeContours } from './contours';
import { STRIPS, boardChecks, placeBounds, placeMotif, shifts, slidePlace, type PlaceBounds } from './stripFigure';
import { checkeredLayout, checkeredLetters } from './checkeredGrid';
import { measureTextGrid } from './textGrid';
import { CORNER_GAP, CORNER_INSET, checkedTips } from './cornerChecks';
import { MOTIF, boardPlacement, boardRadius, boardScale, enclosedAlong, motifChoices, squareChoices } from './boardMotif';
import { isTextFigure, textFigureRequest } from './textFigure';

/** The clearest place for each motif and board, where the search starts when
 * its default size's place is not known yet. */
const clearest = new WeakMap<Ring[], Map<number, number>>();

/** A heart's picture; for the figure in the checks, where it puts the motif
 * down the heart's middle, and how far the motif can move and keep its size. */
export type Picture = { rings: Ring[]; place?: number; bounds?: PlaceBounds };

/** What a heart already made of the motif in this frame, at its default size,
 * tells the next picture: where the figure in the checks lay, the board's
 * strips per side, which circle a board circle keeps, and whether over the
 * corner squares the motif sits on its enclosing circle (as it does unless a
 * heart said otherwise). */
export type Known = { place?: number; board?: number; circle?: 'large' | number; enclosed?: boolean; whole?: boolean };

/** The picture for a request, or none where this frame has none yet, or the
 * generator is known to build this motif differently. */
export function picture(request: GeneratorRequest, known: Known = {}): Picture | undefined {
	try {
		// A text in a figure frame is that frame's picture of its outline, on
		// the board its heart, once made, chose.
		if (request.mode === 'text' && isTextFigure(request.textFrame) && request.font) {
			const figure = textFigureRequest(request);
			return picture(figure.style === 'strips' ? { ...figure, board: figure.board ?? known.board } : figure, known);
		}
		if (request.mode === 'text' && request.textFrame === 'checkered' && request.font)
			return checkered(request.text ?? '', request.font, request.letterScale);
		if (request.mode === 'text' && (request.textFrame === 'woven' || request.textFrame === 'air') && request.font && request.fittedCells === false)
			return woven(request.text ?? '', request.font, request.room ?? request.textFrame === 'air');
		if (request.mode === 'figure' && (request.style === 'motifs' || request.style === 'squares') && request.contours?.length) {
			// The motif as the letter of a text frame on its board: in a pattern
			// on the checkerboard, or alone in the centre square of the woven
			// frame, up to a tenth larger there or in the airy frame. The choice
			// its default size made, once that heart is made, else the first
			// (see `motifChoices`, `squareChoices`); cells fitted to it have none.
			const contours = normalizeContours(request.contours);
			if (!contours.length) return;
			const font: Font = { glyphs: { [MOTIF]: { advance: 1, contours }, ' ': { advance: 1, contours: [] } } };
			const choice = (request.style === 'squares' ? squareChoices(request.board) : motifChoices(request.board))[request.layout?.alternative ?? 0];
			if (!choice || choice.fitted) return;
			// Small motifs alone in the centre square are the equal squares' picture.
			return request.style === 'squares' || choice.alone ? woven(choice.text, font, !!choice.air, Math.min(1.1, boardScale(request) * (choice.larger ?? 1)))
				: checkered(choice.text, font, boardScale(request));
		}
		if (request.mode === 'figure' && request.style === 'strips') return stripsPicture(request, known.place);
		// A motif that needs panels gets a finer board, which crosses the
		// corners its frame turns over with more stripes.
		if (request.mode === 'figure' && (request.style === 'rays' || request.style === 'check') && (known.board ?? 3) === 3)
			return circlePicture(request);
		if (request.mode === 'figure' && request.style === 'sunburst' && (known.board ?? 5) === 5) return sunburstPicture(request);
		if (request.mode === 'figure' && request.style === 'layers' && (known.board ?? 7) === 7) return layersPicture(request);
		if (request.mode === 'figure' && request.style === 'corners' && (known.board ?? 6) === 6) return cornersPicture(request);
		if (request.mode === 'figure' && request.style === 'board') return boardPicture(request, known.circle, known.enclosed, known.board, known.whole);
		if (request.mode === 'figure' && (request.style === 'wedges' || request.style === 'fitted' || request.style === 'silhouette') && request.contours?.length
			&& (known.board ?? (request.style === 'fitted' ? 5 : 3)) === (request.style === 'fitted' ? 5 : 3)) {
			// The open frames' legs, as their first construction draws them, on
			// its board: three strips, five with the fitted frame's outer strips.
			const sized = fillSquare(request), frame = { wedges: WEDGES, fitted: FITTED, silhouette: SILHOUETTE }[request.style];
			const rings = fittedPicture(normalizeContours(request.contours), sized.frameSize ?? 70, sized.scale ?? .7, { ...frame, gap: request.gap ?? frame.gap });
			return rings.length ? { rings } : undefined;
		}
	} catch {
		// A character the font lacks, say: the generator reports it.
	}
}

/** Letters on the alternate squares of a checkerboard, every letter at the
 * size of the widest, which fills its square (see `generateCheckeredGrid`). */
function checkered(text: string, font: Font, letterScale = 1): Picture {
	const { matrix } = checkeredLayout(text, 0), n = matrix.length, cell = 100 / n;
	const letter = checkeredLetters(matrix, font, .82 * letterScale), rings: Ring[] = [];
	for (let row = 0; row < n; row++)
		for (let col = 0; col < n; col++) {
			if ((row + col) % 2) rings.push([[col * cell, row * cell], [(col + 1) * cell, row * cell], [(col + 1) * cell, (row + 1) * cell], [col * cell, (row + 1) * cell]]);
			const char = matrix[row][col];
			if (char !== undefined) rings.push(...letter(char, row, col));
		}
	return { rings };
}

/** A circle frame with rays or checks on its usual board of three strips: the
 * motif in its circle, and the four corners its frame's cuts turn over (see
 * `outerFrame`). A motif that needs panels or a finer board can differ. */
function circlePicture(request: GeneratorRequest): Picture | undefined {
	const fitted = fitCircle(request);
	return raysPicture(request, request.frame ?? 'circle', fitted.frameSize ?? 70, fitted.scale ?? .7, request.style === 'check' ? 'check' : 'rays');
}

/** The motif at `size` × `scale` in its circle of `size`, with the corners the
 * frame's cuts turn over. */
function raysPicture(request: GeneratorRequest, shape: Frame, size: number, scale: number, style: 'rays' | 'check'): Picture | undefined {
	const contours = normalizeContours(request.contours ?? []);
	if (!contours.length) return;
	const frame = frameRing(shape, size);
	const motif = contours.map(r => r.map(([x, y]) => uprightToSheet([x * size * scale, y * size * scale])));
	const corner = (angle: number): Point => [50 + 50 * Math.sign(Math.cos(angle)), 50 + 50 * Math.sign(Math.sin(angle))];
	const corners = outerFrame([], frame, [0, 1, 2, 3], style).map(gate =>
		[gate.lp, ...arc(frame, gate.low, gate.high), gate.hp, corner(gate.angle)]);
	return { rings: [...motif, ...corners] };
}

/** Letters in square cells on the regular checkerboard of the woven and airy
 * frames (see `generateTextGrid`): a board of columns + rows + 1 strips,
 * every cell a diamond around one of its squares that reaches the centres of
 * the four beside it, the checks cleared inside it and its letter drawn. */
function woven(text: string, font: Font, air: boolean | number, letterScale = 1): Picture {
	const { matrix, rows, cols, cy, cellHeight, widths, span, fullHeight, scale } = measureTextGrid(text, font, air, undefined, { fittedCells: false });
	const n = cols + rows + 1, side = 100 / n, rings: Ring[] = [];
	const square = (i: number, j: number): Ring => [[i * side, j * side], [(i + 1) * side, j * side], [(i + 1) * side, (j + 1) * side], [i * side, (j + 1) * side]];
	// Every cell lies on a square of one parity, which is dark.
	const dark = (i: number, j: number) => (i + j + cols + 1) % 2 === 0;
	for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (dark(i, j)) rings.push(square(i, j));
	for (let row = 0; row < rows; row++) {
		let cursor = -span / 2;
		for (let col = 0; col < cols; col++) {
			const { glyph } = matrix[row][col];
			const x = (cursor + widths[col] / 2) * scale, y = (-fullHeight / 2 + (row + .5) * cellHeight) * scale;
			cursor += widths[col];
			if (!glyph.contours.length) continue;
			const [cx0, cy0] = uprightToSheet([x, y]), i = Math.floor(cx0 / side), j = Math.floor(cy0 / side);
			// The dark parts of the cell turn back: its own square, or the four
			// quarters of the squares beside it.
			if (dark(i, j)) rings.push(square(i, j));
			else for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
				const mid: Point = [cx0 + dx * side / 2, cy0 + dy * side / 2];
				rings.push([[mid[0] - dy * side / 2, mid[1] - dx * side / 2], [mid[0] + dy * side / 2, mid[1] + dx * side / 2], [cx0 + dx * side, cy0 + dy * side]]);
			}
			const xs = glyph.contours.flat().map(p => p[0]), cx = (Math.min(...xs) + Math.max(...xs)) / 2;
			rings.push(...glyph.contours.map(ring => ring.map(([px, py]) => uprightToSheet([x + (px - cx) * scale * letterScale, y + (py - cy) * scale * letterScale]))));
		}
	}
	return { rings };
}

/** The sunburst: the rays around the motif at four fifths of the frame, and
 * the four cuts of its border, each from one edge of the paper around a
 * quarter of the outer circle to the other, turning the strip beyond it
 * over (see `sunburstBorder`). */
function sunburstPicture(request: GeneratorRequest): Picture | undefined {
	const fitted = fitCircle(request), size = fitted.frameSize ?? 70;
	const rays = raysPicture(request, 'circle', size * .8, fitted.scale ?? .7, 'rays');
	if (!rays) return;
	const circle = frameRing('circle', size), inset = Math.max(4, (100 - size) * .25);
	const [se, sw, nw, ne] = [1, 3, 5, 7].map(i => ray(circle, [50, 50], i * Math.PI / 4));
	return { rings: [...rays.rings,
		[[0, 0], [inset, 0], ...arc(circle, sw, nw).reverse(), [inset, 100], [0, 100]],
		[[100, 0], [100 - inset, 0], ...arc(circle, ne, se), [100 - inset, 100], [100, 100]],
		[[0, 0], [0, inset], ...arc(circle, nw, ne), [100, inset], [100, 0]],
		[[0, 100], [0, 100 - inset], ...arc(circle, se, sw).reverse(), [100, 100 - inset], [100, 100]]] };
}

/** The double border: the fitted frame around a medallion, a disc with the
 * motif in it the other colour, and two more strips each way further out
 * (see `generateLayeredFigure`). */
function layersPicture(request: GeneratorRequest): Picture | undefined {
	const contours = normalizeContours(request.contours ?? []);
	if (!contours.length) return;
	const fitted = fitCircle(request), size = fitted.frameSize ?? 70, scale = fitted.scale ?? .7;
	const disc: Ring = Array.from({ length: 96 }, (_, i) => [.5 * Math.cos(i * Math.PI / 48), .5 * Math.sin(i * Math.PI / 48)]);
	const rings = fittedPicture([disc, ...contours.map(r => r.map(([x, y]): Point => [x * scale, y * scale]))], size, 1, FITTED);
	const inset = layerInset(size);
	rings.push([[0, 0], [inset, 0], [inset, 100], [0, 100]], [[100 - inset, 0], [100, 0], [100, 100], [100 - inset, 100]],
		[[0, 0], [100, 0], [100, inset], [0, inset]], [[0, 100 - inset], [100, 100 - inset], [100, 100], [0, 100]]);
	return { rings };
}

/** Checks in the tips: three lanes across the motif, each starting at a cut
 * from the top and one from the left edge that meet, and ending at a pair
 * from the bottom and right edges; each pair turns the rectangle it cuts off
 * its corner over, so the three make the checked tips. Two strips each way
 * run along the edges (see `generateCornerChecks`). */
function cornersPicture(request: GeneratorRequest): Picture | undefined {
	const contours = normalizeContours(request.contours ?? []);
	if (!contours.length) return;
	const size = request.frameSize ?? 70, scale = request.scale ?? .7, inset = CORNER_INSET;
	const rings = contours.map(r => r.map(([x, y]) => uprightToSheet([x * size * scale, y * size * scale])));
	const { s, d, e, f } = checkedTips(rings, request.gap ?? CORNER_GAP);
	for (let col = 0; col < 3; col++) {
		const start: Point = [s - d + col * d, s + d - col * d], end: Point = [e - f + col * f, e + f - col * f];
		rings.push([[0, 0], [start[0], 0], start, [0, start[1]]], [end, [end[0], 100], [100, 100], [100, end[1]]]);
	}
	rings.push([[0, 0], [inset, 0], [inset, 100], [0, 100]], [[100 - inset, 0], [100, 0], [100, 100], [100 - inset, 100]],
		[[0, 0], [100, 0], [100, inset], [0, inset]], [[0, 100 - inset], [100, 100 - inset], [100, 100], [0, 100]]);
	return { rings };
}

/** The circle on a regular board of five strips, or those the visitor chose
 * (see `boardRanges`): the board's checks, cleared inside the circle, and the
 * motif filling the circle up to the space asked for (see `generate`). Above
 * 70% the circle reaches into the next ring of squares, its checks woven the
 * other way round. A motif that one of the two
 * constructions cannot build keeps the other's nearest circle whatever its
 * size, as `circle` says once a heart of it has reported a size it kept, and
 * one that cannot be divided stays whole in the touching ring, as `whole`
 * says, the circle keeping its colour. */
function boardPicture(request: GeneratorRequest, circle?: 'large' | number, enclosed = true, board?: number, whole = false): Picture | undefined {
	const contours = normalizeContours(request.contours ?? []);
	if (!contours.length) return;
	// The strips its heart was made on, where one was, else those asked for;
	// the largest size its heart kept, where it kept one smaller.
	const strips = board ?? request.board ?? 5, [small, large] = boardRanges(strips);
	const setting = typeof circle === 'number' ? Math.min(circle, request.scale ?? .7) : request.scale ?? .7;
	let { radius, range } = boardRadius(setting, strips);
	if (large && radius <= small[1] && circle === 'large') [radius, range] = [large[0] + .6, large];
	// The circle takes the colour of the middle squares around it while the
	// motif is whole, the other once it is divided in four (on every odd
	// board).
	const outer = whole && range === large ? 0 : (boardPanels(range, strips) - 1) % 2;
	const xs = contours.flat().map(p => p[0]), ys = contours.flat().map(p => p[1]);
	let cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
	const box = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
	let reach = Math.max(...contours.flat().map(([x, y]) => Math.hypot(x - cx, y - cy))) / box;
	// Over the corner squares the motif moves towards its smallest enclosing
	// circle's centre, where it cuts cleanly so (see `generate`).
	if (large && radius > large[1] && enclosed) ({ centre: [cx, cy], reach } = boardPlacement(contours, enclosedAlong(setting)));
	const scale = (Math.min(radius, 50) - Math.max(request.gap ?? 3, 1.5)) / reach / box;
	const disc = frameRing('circle', 2 * radius), side = 100 / strips, rings: Ring[] = [];
	for (let i = 0; i < strips; i++)
		for (let j = 0; j < strips; j++) {
			if ((i + j + outer) % 2) continue;
			const square: Ring = [[i * side, j * side], [(i + 1) * side, j * side], [(i + 1) * side, (j + 1) * side], [i * side, (j + 1) * side]];
			rings.push(square);
			// Its part inside the circle turns back.
			const inside = clipConvex(square, disc);
			if (inside.length >= 3) rings.push(inside);
		}
	// A line the circle meets just short of an edge it reaches ends where the
	// circle meets that edge (see `boardLegs`): the square beyond the line
	// there takes the colour of the one before it, up to that point.
	const meets = radius > 50 ? Math.sqrt(radius ** 2 - 2500) : 50;
	for (let k = 1; k < strips; k++) {
		const line = k * side, d = Math.abs(line - 50);
		if (d <= meets || 50 - Math.sqrt(radius ** 2 - d ** 2) >= BOARD_STUB) continue;
		const [low, high] = line < 50 ? [line, 50 - meets] : [50 + meets, line];
		for (const [from, to] of [[0, side], [100 - side, 100]])
			for (const part of [[[low, from], [high, from], [high, to], [low, to]], [[from, low], [to, low], [to, high], [from, high]]] as Ring[]) {
				rings.push(part);
				const inside = clipConvex(part, disc);
				if (inside.length >= 3) rings.push(inside);
			}
	}
	rings.push(...contours.map(ring => ring.map(([x, y]) => uprightToSheet([(x - cx) * scale, (y - cy) * scale]))));
	return { rings };
}

/** The part of a polygon inside a convex one, anticlockwise or not. */
function clipConvex(subject: Ring, clip: Ring): Ring {
	const area = clip.reduce((sum, p, i) => sum + p[0] * clip[(i + 1) % clip.length][1] - clip[(i + 1) % clip.length][0] * p[1], 0);
	const side = (a: Point, b: Point, p: Point) => Math.sign(area) * ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])) >= 0;
	let out: Ring = subject;
	for (let i = 0; i < clip.length && out.length; i++) {
		const a = clip[i], b = clip[(i + 1) % clip.length], input = out;
		out = [];
		for (let k = 0; k < input.length; k++) {
			const p = input[k], q = input[(k + 1) % input.length], pin = side(a, b, p), qin = side(a, b, q);
			if (pin) out.push(p);
			if (pin !== qin) {
				const d = (b[0] - a[0]) * (q[1] - p[1]) - (b[1] - a[1]) * (q[0] - p[0]);
				const t = ((b[0] - a[0]) * (a[1] - p[1]) - (b[1] - a[1]) * (a[0] - p[0])) / d;
				out.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]);
			}
		}
	}
	return out;
}

/** The figure in the checks: its board, and the motif at its place. */
function stripsPicture(request: GeneratorRequest, place?: number): Picture | undefined {
	if (!request.contours?.length) return;
	const rings = normalizeContours(request.contours), strips = request.board ?? STRIPS, scale = request.scale ?? .7;
	if (!rings.length) return;
	let guesses = clearest.get(request.contours);
	if (!guesses) clearest.set(request.contours, guesses = new Map());
	if (place === undefined && request.place === undefined && !guesses.has(strips)) guesses.set(strips, shifts(rings, strips, .7)[0]);
	const at = request.place ?? slidePlace(rings, scale, place ?? guesses.get(strips)!);
	return { rings: [...placeMotif(rings, scale, at, 0, request.side ?? 0), ...boardChecks(strips)], place: at, bounds: placeBounds(rings, scale) };
}
