/**
 * The mask, drawn as the heart it will become — PAINT.md §2, decision 5.
 *
 * A mask on its own is a square of two colours, and a square tells the visitor
 * nothing about which half of it ends up on which lobe. So paint mode never
 * shows the square: it shows the heart, with the woven diamond carrying the mask
 * and the two lobes in the paper colours. The paint canvas draws it at whatever
 * size the band allows and the import dialog draws it at 200 px, and they must
 * agree to the pixel — otherwise "Sådan bliver masken" is a promise the canvas
 * then breaks — so the routine lives here rather than in either component.
 *
 * It is plain canvas-2d: everything about the heart's geometry is in `heartLayout`,
 * which is arithmetic and testable, and `drawHeart` is the six calls that put it
 * on a context. The frame matches the site's SVG heart (`$lib/rendering/svgWeave`):
 * an overlap square with a semicircular lobe on its left edge and another on its
 * top edge, the whole turned 45° about the square's centre, so the lobes rise to
 * either side of a cleft and the square's far corner becomes the tip.
 */

import type { HeartColors } from '$lib/types/heart';
import type { Mask } from './mask';

/**
 * Where the heart sits on a `size` × `size` canvas.
 *
 * The unit is the woven square's side: the square is centred on `(cx, cy)` and
 * `scale` pixels across, before the 45° turn. Everything else — a pointer's cell,
 * a mirror line, the diamond's outline — follows from those three numbers, which
 * is why they are returned rather than kept inside the drawing.
 */
export type HeartLayout = { cx: number; cy: number; scale: number };

/**
 * The drawn heart's bounds, in units of the woven square's side, measured from
 * the square's centre after the turn.
 *
 * The square's corners land at ±√½; a lobe is a half-disc of radius ½ about the
 * middle of an edge, which the turn carries to (∓√⅛, −√⅛), so the two lobes
 * reach √⅛ + ½ up and to either side. Nothing reaches below the square's far
 * corner. The numbers are written out because they are the reason the heart is
 * wider than it is tall, and hence why it is centred vertically the way it is.
 */
const REACH = Math.SQRT1_2 / 2 + 0.5; // 0.8536 — left, right and top
const BOTTOM = Math.SQRT1_2; // 0.7071 — the tip

/** A little air round the heart, as a share of its longest side; the SVG's own 2.1%. */
const PADDING_RATIO = 0.021;

/** Fit the heart into a square canvas of `size` pixels. */
export function heartLayout(size: number): HeartLayout {
	const width = 2 * REACH;
	const side = width * (1 + 2 * PADDING_RATIO);
	const scale = size / side;
	// The bounds are symmetric left to right but not top to bottom, so the centre
	// of the square is pushed down by half the difference to centre the heart.
	return { cx: size / 2, cy: size / 2 + ((REACH - BOTTOM) / 2) * scale, scale };
}

/**
 * Draw the whole heart: two lobes in the paper colours, the woven square filled
 * with the mask.
 *
 * `colors.left` is the mask's 0 and `colors.right` its 1 — the engine's own
 * convention for `prepared.mask`, kept end to end so nobody has to remember a
 * translation. `size` is in the context's own units, so a canvas scaled by the
 * device pixel ratio passes its CSS size. The context is left as it was found.
 */
export function drawHeart(
	ctx: CanvasRenderingContext2D,
	mask: Mask,
	colors: HeartColors,
	size: number
): void {
	const { cx, cy, scale } = heartLayout(size);
	ctx.save();
	ctx.clearRect(0, 0, size, size);
	ctx.translate(cx, cy);
	ctx.scale(scale, scale);
	ctx.rotate(Math.PI / 4);

	// From here the frame is the design's own, before the turn: the woven square
	// is [-½, ½]², the left lobe bulges out of its left edge and the right lobe
	// out of its top edge.
	ctx.fillStyle = colors.left;
	ctx.beginPath();
	ctx.arc(-0.5, 0, 0.5, -Math.PI / 2, Math.PI / 2, true);
	ctx.lineTo(0.5, 0.5);
	ctx.lineTo(0.5, -0.5);
	ctx.closePath();
	ctx.fill();

	ctx.fillStyle = colors.right;
	ctx.beginPath();
	ctx.arc(0, -0.5, 0.5, Math.PI, 2 * Math.PI);
	ctx.lineTo(0.5, 0.5);
	ctx.lineTo(-0.5, 0.5);
	ctx.closePath();
	ctx.fill();

	drawMaskCells(ctx, mask, colors, scale);
	ctx.restore();
}

/**
 * Paint the mask into the woven square of an already-transformed context.
 *
 * The cells go through an offscreen canvas of the mask's own size rather than as
 * `fillRect` per cell: 160 000 rectangles is a second of work, one `drawImage`
 * is a blit. Smoothing follows the direction of the scaling — a 400-cell mask
 * shown 112 px wide loses every thin stroke to nearest-neighbour sampling, while
 * a mask magnified past its own cells should show them as the squares they are.
 */
function drawMaskCells(
	ctx: CanvasRenderingContext2D,
	mask: Mask,
	colors: HeartColors,
	scale: number
): void {
	const cells = maskCanvas(mask, colors);
	if (!cells) return;
	ctx.save();
	ctx.beginPath();
	ctx.rect(-0.5, -0.5, 1, 1);
	ctx.clip();
	ctx.imageSmoothingEnabled = scale < mask.size;
	ctx.drawImage(cells, -0.5, -0.5, 1, 1);
	ctx.restore();
}

/** The mask as an image of its two paper colours, one pixel per cell. */
function maskCanvas(mask: Mask, colors: HeartColors): HTMLCanvasElement | null {
	const left = channels(colors.left);
	const right = channels(colors.right);
	if (!left || !right) return null;
	const canvas = document.createElement('canvas');
	canvas.width = mask.size;
	canvas.height = mask.size;
	const ctx = canvas.getContext('2d');
	if (!ctx) return null;
	const image = ctx.createImageData(mask.size, mask.size);
	for (let i = 0; i < mask.data.length; i++) {
		image.data.set(mask.data[i] ? right : left, i * 4);
	}
	ctx.putImageData(image, 0, 0);
	return canvas;
}

/** One pixel to paint a colour on and read it back from; see `channels`. */
let probe: CanvasRenderingContext2D | null | undefined;
const parsed = new Map<string, Uint8ClampedArray>();

/**
 * A CSS colour as its four channels.
 *
 * Painting it and reading it back is what keeps this honest about colour syntax:
 * the site's store spells its red `rgb(185, 19, 19)` while a heart's own colours
 * are hex, and the canvas parses both where a hand-rolled hex reader would take
 * one and drop the other. The answers are cached because the paint canvas draws
 * on every frame of a stroke, and a readback per frame is what makes browsers
 * warn about `willReadFrequently`.
 */
function channels(colour: string): Uint8ClampedArray | null {
	const known = parsed.get(colour);
	if (known) return known;
	if (probe === undefined) {
		const canvas = document.createElement('canvas');
		canvas.width = 1;
		canvas.height = 1;
		probe = canvas.getContext('2d', { willReadFrequently: true });
	}
	if (!probe) return null;
	// A value the canvas cannot parse is *ignored* rather than refused, so the
	// probe would keep the colour it painted last and we would cache that under
	// this name — the mask drawn in a colour nobody asked for, with nothing to
	// show that anything went wrong. Two different starting values tell the two
	// apart: only an assignment that took leaves the same colour behind both
	// times, and a null answer makes `maskCanvas` bail visibly instead.
	probe.fillStyle = '#000000';
	probe.fillStyle = colour;
	const took = probe.fillStyle;
	probe.fillStyle = '#ffffff';
	probe.fillStyle = colour;
	if (probe.fillStyle !== took) return null;
	probe.clearRect(0, 0, 1, 1);
	probe.fillRect(0, 0, 1, 1);
	const value = probe.getImageData(0, 0, 1, 1).data;
	// The pair of paper colours is what this is for, but a colour picker dragged
	// across the wheel would feed it a new value a frame; the cache is emptied
	// rather than allowed to grow for the life of the page.
	if (parsed.size >= 64) parsed.clear();
	parsed.set(colour, value);
	return value;
}
