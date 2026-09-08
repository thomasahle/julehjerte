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
import { fitHeart, type HeartLayout } from './heartLayout';
import type { Mask } from './mask';

/**
 * Where the heart sits on a canvas: the square's centre and its side in pixels,
 * before the 45° turn. `heartLayout.ts` owns it, because the paint canvas maps
 * pointers back through the same three numbers.
 */
export type { HeartLayout };

/** A little air round the heart, as a share of its longest side; the SVG's own 2.1%. */
const PADDING_RATIO = 0.021;

/**
 * Fit the heart into a square canvas of `size` pixels.
 *
 * The bounds and the fit are `fitHeart`'s, so the dialog's 200 px preview and
 * the paint canvas cannot drift apart — "Sådan bliver masken" is a promise the
 * canvas then has to keep. Only the air differs: a preview is measured as a
 * share of the picture, the canvas as pixels of the band it floats in. The heart
 * is wider than it is tall, so the share is of its width.
 */
export function heartLayout(size: number): HeartLayout {
	return fitHeart(size, size, (size * PADDING_RATIO) / (1 + 2 * PADDING_RATIO));
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
	const left = colourChannels(colors.left);
	const right = colourChannels(colors.right);
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

/** One pixel to paint a colour on and read it back from; see `colourChannels`. */
let probe: CanvasRenderingContext2D | null | undefined;
const parsed = new Map<string, Uint8ClampedArray>();

/**
 * A CSS colour as its four channels, or null when it cannot be read — which is
 * also the answer on the server, where there is no canvas to read it with.
 *
 * Painting it and reading it back is what keeps this honest about colour syntax:
 * the site's store spells its red `rgb(185, 19, 19)` while a heart's own colours
 * are hex, and the canvas parses both where a hand-rolled hex reader would take
 * one and drop the other. The answers are cached because the paint canvas draws
 * on every frame of a stroke, and a readback per frame is what makes browsers
 * warn about `willReadFrequently`.
 */
export function colourChannels(colour: string): Uint8ClampedArray | null {
	if (typeof document === 'undefined') return null;
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
