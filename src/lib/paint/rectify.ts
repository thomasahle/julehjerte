/**
 * The photograph flattened into the crop the corners describe — PAINT.md §2,
 * the live half of "Sådan bliver masken".
 *
 * The dialog's preview is the *prepared* mask: what the engine will actually
 * weave, two colours, a second of work per answer. That is the right thing to
 * show and the wrong thing to show while a corner is under a finger, because a
 * corner moves a hundred times between grabbing it and letting go and the
 * engine can answer none of those. The old generator page solved it the way
 * this module does: rectify the photograph itself on the main thread — a
 * homography and a bilinear sample per output pixel, under a millisecond at
 * this size — and draw *that* in the heart while the drag lasts. The engine is
 * asked once, on release, and its answer replaces the photo.
 *
 * `rectifyMotif` is the locator's own function, so the crop shown is the crop
 * the engine will read: the same square, the same corner order, the same
 * sampling. It ships unbundled under `static/inverse/` and is loaded by URL
 * like the worker in `$lib/inverse/engine.ts` — never through the bundler,
 * which must not pull the engine into the paint page's bundle (§8).
 */

import { base } from '$app/paths';
import type { Point } from '$lib/inverse/client';

/**
 * The rectified photograph's side, in pixels.
 *
 * It is drawn across the woven square, which is about 112 px wide inside the
 * dialog's 200 px preview, so 200 is already more detail than the preview can
 * show — and small enough that a frame costs well under a millisecond.
 */
export const RECTIFIED_SIZE = 200;

/** A square of RGBA pixels, shaped like `Mask`: a side, and row-major data. */
export type RectifiedPhoto = { size: number; data: Uint8ClampedArray };

/** RGBA pixels as the locator takes them. */
export type SourcePixels = { width: number; height: number; data: Uint8ClampedArray };

type RectifyMotif = (
	image: SourcePixels,
	quad: number[][],
	options: { size: number }
) => { width: number; height: number; data: Uint8ClampedArray };

/**
 * The corners as the locator reads them: half a pixel less in each axis.
 *
 * The dialog counts in pixel *edges* — a pointer at the very left of the
 * picture is 0 and at the very right is `width`, which is what turning a
 * fraction of an element's box into image coordinates gives you, and what the
 * engine's `quad` means too. `rectifyMotif` counts in pixel *centres*: it
 * samples at `image.data[y0 * width + x0]` with `x0 = floor(sx)`, so `sx = 0`
 * is the middle of the first pixel and `sx = width - 1` the middle of the last.
 * The two frames are half a pixel apart, and the old generator page subtracted
 * exactly that before rectifying ("Render source pixels with the same
 * half-pixel convention as preprocessing"). Half a pixel is invisible on a
 * photograph and would still be wrong: a crop that ran to the very edge would
 * clamp its last column, and the live picture would sit half a pixel off the
 * mask that replaces it.
 */
export function rectifyQuad(quad: readonly Point[]): number[][] {
	return quad.map((p) => [p[0] - 0.5, p[1] - 0.5]);
}

/**
 * The locator module, fetched once and kept.
 *
 * A dragged corner asks for it every frame, and the first ask is the only one
 * that costs anything: after that the browser's module registry answers, and
 * this promise resolves in a microtask well inside the same frame.
 */
let locator: Promise<RectifyMotif> | null = null;

function rectifier(): Promise<RectifyMotif> {
	return (locator ??= import(/* @vite-ignore */ `${base}/inverse/locator/locator.js`).then(
		(module: { rectifyMotif: RectifyMotif }) => module.rectifyMotif,
		(error: unknown) => {
			// A load that failed — offline, a bad deploy — must not be cached as
			// this visit's answer: the next corner the visitor moves tries again.
			locator = null;
			throw error;
		}
	));
}

/**
 * The photograph, seen through the quadrilateral, as a square of RGBA pixels.
 *
 * Throws what the locator throws — a `TypeError` for four corners that do not
 * form a convex quadrilateral in perimeter order, which is a crop the engine
 * would refuse as well. The caller keeps its last good frame rather than
 * blinking the preview out under a finger that is still moving.
 */
export async function rectifyPhoto(
	image: SourcePixels,
	quad: readonly Point[],
	size: number = RECTIFIED_SIZE
): Promise<RectifiedPhoto> {
	const rectify = await rectifier();
	return { size, data: rectify(image, rectifyQuad(quad), { size }).data };
}
