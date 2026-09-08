/**
 * The paint mode's door to the inverse engine — PAINT.md §4.
 *
 * `client.ts` is the wire protocol: a worker, a request id, and the shapes that
 * travel. This is the handful of calls the UI actually makes, with the engine's
 * settings filled in once rather than at every call site. The old generator page
 * carried the whole settings form in its markup and handed all twenty-odd keys
 * to every button; in Mal the visitor chooses only what §2 offers them, so the
 * rest belongs here, next to the reason it is what it is.
 *
 * The worker is made on first use and kept. Making it costs a fetch, and the
 * HiGHS WASM it loads on the first solve costs 3.5 MB more, while a dialog calls
 * in every time a corner moves; there is one at a time by design (see
 * `InverseWorker.request`, which refuses a second), so callers serialise their
 * own requests.
 */

import { base } from '$app/paths';
import { AUTOMATIC_PRESET } from './presets.js';
import { MASK_SIZE } from '$lib/paint/mask';
import {
	InverseWorker,
	type ArtworkInput,
	type DetectedCrops,
	type PreparedArtwork
} from './client';

/** The paper pair as the engine wants it: `[right, left]`, six-digit hex. */
export type PaperPair = [string, string];

/** A decoded picture. Only pixels have corners to look for; SVG arrives as text. */
export type PixelsInput = Extract<ArtworkInput, { type: 'pixels' }>;

let worker: InverseWorker | null = null;

function engine(): InverseWorker {
	// The engine is unbundled under static/, so it is addressed by URL and only
	// ever loaded in a browser — never at build or SSR time (§1).
	return (worker ??= new InverseWorker(`${base}/inverse/worker-bootstrap.js`));
}

/* -------------------------------------------------------------------------
   Importing a picture (the import dialog)
   ------------------------------------------------------------------------- */

/**
 * What the import dialog lets the visitor decide about a picture: how its
 * colours become two, and whether the two are the right way round.
 *
 * `mode` is a subset of the engine's own list. Automatic picks between a grey
 * threshold and a two-cluster fit in Lab; the red-white mixture is the model
 * that knows a photograph of red and white paper has pixels of both in it; and
 * swatches is the visitor naming the two colours themselves.
 */
export type ImportSettings = {
	mode: 'auto' | 'red-white-mixture' | 'swatches';
	/** The two colours for `mode: 'swatches'`, as `[right, left]` like `paperColors`. */
	swatches: PaperPair;
	/** "Byt farverne": the engine's own `invert`, applied after the classification. */
	invert: boolean;
	/** The paper the mask will be shown on, which the engine draws its preview with. */
	paperColors: PaperPair;
};

/**
 * Turn a picture into the engine's two-colour target.
 *
 * Only the keys preparation reads are sent. The solve settings (time limit,
 * clearances, matching sheets) belong to Find snit and are none of this call's
 * business — and one of them, a time limit past 180 seconds, would be rejected
 * by the engine's own validation before a single pixel was classified.
 */
export function prepareImage(
	input: ArtworkInput,
	settings: ImportSettings,
	onStage: (stage: string) => void = () => {}
): Promise<PreparedArtwork> {
	return engine().request<PreparedArtwork>(
		'prepare',
		input,
		{
			...AUTOMATIC_PRESET,
			// The woven square is 100 mm wide and the mask has MASK_SIZE cells to a
			// side, so the prepared mask arrives at the resolution we paint at.
			width: 100,
			minWidth: 2,
			cutError: 0.25,
			resolution: MASK_SIZE,
			paperColors: settings.paperColors,
			mode: settings.mode,
			swatches: settings.swatches,
			invert: settings.invert
		},
		onStage
	);
}

/**
 * Ask the engine where the woven square is in a photograph.
 *
 * `roi` is an optional `[x0, y0, x1, y1]` rectangle in image pixels: the visitor
 * draws it round one heart when a picture holds several, or when the automatic
 * search found the wrong thing. The answer's `quad` is four corners in the order
 * the engine expects everywhere — the top cleft first, then clockwise — so it
 * can go straight back as `ArtworkInput.quad`.
 */
export function detectCorners(input: PixelsInput, roi?: number[]): Promise<DetectedCrops> {
	return engine().request<DetectedCrops>('detect-crops', { ...input, roi }, {});
}

/**
 * Re-fit corners the visitor has moved, by searching again around them.
 *
 * The engine derives the region of interest from the quadrilateral it is given,
 * so this is "Find igen" once there is something to refine rather than a blind
 * second look at the whole picture.
 */
export function refineCorners(input: PixelsInput): Promise<DetectedCrops> {
	return engine().request<DetectedCrops>('refine-crop', input, {});
}
