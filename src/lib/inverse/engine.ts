/**
 * Paint mode's door to the inverse engine — PAINT.md §4.
 *
 * `client.ts` is the wire protocol: a worker, a request id, and the shapes that
 * travel. This module is the handful of calls the UI actually makes, with the
 * engine's settings filled in once rather than at every call site — the settings
 * a hobbyist's heart is solved with, the mask as an image the engine can
 * classify, and the one worker the whole of Mal shares. The old generator page
 * carried the whole settings form in its markup and handed all twenty-odd keys
 * to every button; here the visitor chooses only what §2 offers them, so the
 * rest lives here, next to the reason it is what it is.
 *
 * The worker is made on first use and kept, never at import time: the engine is
 * 3.5 MB of WebAssembly and both editor pages must open without it (§8), while
 * the import dialog calls in every time a corner moves.
 *
 * One request at a time is the engine's own rule — `InverseWorker.request`
 * rejects a second outright — and paint mode has callers that race: the import
 * dialog's corner search, its debounced preview, and Find snit beside them. So
 * the queue lives here, next to the worker they share, rather than inside
 * whichever caller was written first; a caller that had to remember to wait
 * would meet the engine's raw English refusal instead.
 *
 * ## The mask's round trip
 *
 * A mask is `0` for the left paper and `1` for the right, so it is sent as a
 * 400 × 400 image painted in exactly those two colours, classified with
 * `mode: 'swatches'` and `swatches: [right, left]`. The engine's classifier
 * gives cell 1 to whichever swatch comes first, which is why the pair is the
 * right colour first — the mask's own convention, upside down from
 * `HeartColors`. `engine.test.ts` sends a mask through the engine's own
 * `prepare` and gets the same cells back, so the two conventions cannot drift.
 *
 * Nothing here assumes a cell is 0 or 1: a third value ("free", PAINT.md §11) is
 * coming, and it will need its own colour rather than a new branch.
 */

import { base } from '$app/paths';
import { AUTOMATIC_PRESET } from '$lib/inverse/presets.js';
import {
	InverseWorker,
	type ArtworkInput,
	type DesignResult,
	type DetectedCrops,
	type PixelsInput,
	type PreparedArtwork
} from '$lib/inverse/client';
import {
	DEFAULT_FRAME_CELLS,
	FRAME_MAX_CELLS,
	FRAME_MIN_CELLS,
	insideCell,
	type Frame
} from '$lib/paint/frame';
import { MASK_SIZE, type Mask } from '$lib/paint/mask';
import type { SymmetrySettings } from '$lib/paint/symmetry';
import type { HeartColors } from '$lib/types/heart';
import { toHexColor } from '$lib/utils/heartColors';

// The engine's own error and the code that marks the engine itself as what
// failed, re-exported so a caller can tell "the engine broke" from "this picture
// cannot be read" without reaching past this door.
export { EngineError, ENGINE_UNAVAILABLE } from './client';

/** A decoded picture. Only pixels have corners to look for; SVG arrives as text. */
export type { PixelsInput };

/** The paper pair as the engine wants it: `[right, left]`, six-digit hex. */
export type PaperPair = [string, string];

/** Where the classic bootstrap worker lives under `static/`. */
const WORKER_PATH = 'inverse/worker-bootstrap.js';

/** The paper width the templates are solved for, in millimetres. */
export const DEFAULT_WIDTH_MM = 100;

/** The narrowest strip the visitor is offered, in millimetres. */
export const DEFAULT_MIN_WIDTH_MM = 2;

/**
 * The longest search the engine will accept. PAINT.md asked for 600 seconds;
 * `core/settings.js` bounds `timeLimit` to 180 and throws outside it, so this is
 * the real "run until it has an answer": three minutes, and Afbryd for the
 * visitor who does not want to wait that long.
 */
export const MAX_TIME_LIMIT_SECONDS = 180;

/**
 * Whether the engine is asked to hold the symmetry itself.
 *
 * True since the `paint-engine-symmetry` lane landed on `redesign` (PAINT.md
 * §11): the fitter takes the symmetry group as part of its target and ties the
 * control points under it, so the answer is exactly symmetric rather than
 * corrected afterwards. `symmetrize` on the mask and `enforce` in the converter
 * stay either way, as the safety net for the traced route and for Inden i kurve
 * Anti, which the mask cannot express at all.
 */
export const ENGINE_SYMMETRY = true;

/** The engine's own name for a symmetry of the woven square. */
export type EngineSymmetry = {
	mirrorX?: boolean;
	mirrorY?: boolean;
	transpose?: boolean;
	antiTranspose?: boolean;
	rotate180?: boolean;
	withinCurve?: 'off' | 'sym' | 'anti';
};

/**
 * The editor's three rows as the engine's symmetry group (PAINT.md §11, and
 * docs/inverse/SYMMETRY.md's own table).
 *
 * The same table `transformsFor` uses on the mask, in the engine's vocabulary:
 * Mellem lapper is the transpose or the anti-transpose, Inden i lap is both
 * mirrors or the half turn, and Inden i kurve is the one row that is not a
 * symmetry of the square at all — it is per cut, so it goes over as its own
 * field. Sym there also sends both mirrors: the mask was painted mirrored, so
 * the fitter has to be told both.
 */
export function engineSymmetry(rows: SymmetrySettings): EngineSymmetry {
	const out: EngineSymmetry = {};
	if (rows.lobes === 'sym') out.transpose = true;
	else if (rows.lobes === 'anti') out.antiTranspose = true;
	if (rows.lobe === 'sym') {
		out.mirrorX = true;
		out.mirrorY = true;
	} else if (rows.lobe === 'anti') out.rotate180 = true;
	if (rows.curve === 'sym') {
		out.mirrorX = true;
		out.mirrorY = true;
		out.withinCurve = 'sym';
	} else if (rows.curve === 'anti') out.withinCurve = 'anti';
	return out;
}

/**
 * The frame as per-cell loss weights: 1 for a cell that must come out as painted,
 * 0 for a cell of a free band the search may fill as it likes.
 *
 * **Nothing sends this to the engine yet, and that is deliberate.** The fitter's
 * loss has no per-cell weight to take: `core/` scores a candidate against every
 * cell of the target equally, and MOTIF-BORDER.md says plainly why the obvious
 * workaround does not work — a neutral 0.5 probability is not ignored, because
 * the squared-error grid loss still pulls predictions towards it and several
 * ranking stages threshold probabilities on the way out. Weights are Codex's
 * lane. Until they land, a free band reaches the engine as
 * `substituteCheckerBand`'s woven pattern instead (PAINT.md §11).
 *
 * It is written now, and tested, so that the day the engine takes weights the
 * change is one added settings key here and the deletion of one function in
 * `$lib/paint/frame` — not a new model of what the mask is.
 */
export function frameWeights(mask: Mask, frame: Frame): Float32Array {
	const weights = new Float32Array(mask.data.length);
	weights.fill(1);
	if (frame.mode !== 'free') return weights;
	for (let y = 0; y < mask.size; y++) {
		const row = y * mask.size;
		for (let x = 0; x < mask.size; x++) {
			if (!insideCell(frame, mask.size, x, y)) weights[row + x] = 0;
		}
	}
	return weights;
}

/** How the engine should read a picture's colours; the dialog's three choices. */
export type ColourMode = 'auto' | 'red-white-mixture' | 'swatches';

/**
 * What the import dialog lets the visitor decide about a picture: how its
 * colours become two, and whether the two are the right way round.
 *
 * `mode` is a subset of the engine's own list. Automatic picks between a grey
 * threshold and a two-cluster fit in Lab; the red-white mixture is the model
 * that knows a photograph of red and white paper has pixels of both in it; and
 * swatches is the visitor naming the two colours themselves. Where the woven
 * square sits in the picture is part of the picture (`ArtworkInput.quad`), not
 * part of this.
 */
export type ImportSettings = {
	/** The paper the mask will be shown on, which the engine draws its preview with. */
	paperColors: PaperPair;
	mode?: ColourMode;
	/** The two colours for `mode: 'swatches'`, as `[right, left]` like `paperColors`. */
	swatches?: PaperPair;
	/** "Byt farverne": the engine's own `invert`, applied after the classification. */
	invert?: boolean;
};

export type FindSettings = {
	colors: HeartColors;
	/** The three rows as the visitor has them. */
	symmetry: SymmetrySettings;
	widthMm?: number;
	minWidthMm?: number;
	/** Cut both lobes from one template. Follows Mellem lapper: Sym by default. */
	matchingSheets?: boolean;
};

/**
 * What the "Avanceret" disclosure offers (PAINT.md §2 and §11): three knobs on
 * the engine, and one on the target the engine is given.
 *
 * Everything else the engine can be told is either meaningless to a hobbyist or
 * a way to get a template that cannot be cut, so it is not offered.
 */
export type AdvancedSettings = {
	widthMm: number;
	minWidthMm: number;
	matchingSheets: boolean;
	/**
	 * "Rammens felter": how many checker cells a free band is woven from, per side
	 * of the square (PAINT.md §11).
	 *
	 * The one number here that the engine never sees: it shapes the *target* the
	 * search is given, in `$lib/paint/frame`, rather than the search. It sits with
	 * the others because it belongs to the same disclosure and the same Nulstil,
	 * and because it goes away with the checker when weights arrive.
	 */
	frameCells: number;
};

/** The settings in it that are numbers, which are the ones that have bounds. */
export type AdvancedNumber = 'widthMm' | 'minWidthMm' | 'frameCells';

/**
 * What each of those numbers may be.
 *
 * `core/settings.js` bounds `width` to [20, 300] and `minWidth` to [0.1, 30] and
 * *throws* outside them — inside the worker, at solve time, as an `EngineError`
 * with no report, which the page can only tell the visitor as "the engine could
 * not be loaded". So a number is clamped rather than passed on. The floor on the
 * strip width is the panel's own 0.5 mm rather than the engine's 0.1: half a
 * millimetre is already thinner than anyone can cut by hand.
 */
export const ADVANCED_LIMITS: Record<AdvancedNumber, readonly [number, number]> = {
	widthMm: [20, 300],
	minWidthMm: [0.5, 30],
	// Codex's benchmark tried three, four and five and four won on both fixtures;
	// outside that range the band stops being a weave a heart can be cut from.
	frameCells: [FRAME_MIN_CELLS, FRAME_MAX_CELLS]
};

const ADVANCED_DEFAULTS: Record<AdvancedNumber, number> = {
	widthMm: DEFAULT_WIDTH_MM,
	minWidthMm: DEFAULT_MIN_WIDTH_MM,
	frameCells: DEFAULT_FRAME_CELLS
};

/** One typed number brought inside the range; a non-number goes back to the default. */
export function clampAdvanced(key: AdvancedNumber, value: number): number {
	if (!Number.isFinite(value)) return ADVANCED_DEFAULTS[key];
	const [lo, hi] = ADVANCED_LIMITS[key];
	return Math.min(hi, Math.max(lo, value));
}

/** What Nulstil goes back to; matching sheets follows Mellem lapper: Sym. */
export function defaultAdvanced(symmetry: SymmetrySettings): AdvancedSettings {
	return {
		widthMm: DEFAULT_WIDTH_MM,
		minWidthMm: DEFAULT_MIN_WIDTH_MM,
		matchingSheets: symmetry.lobes === 'sym',
		frameCells: DEFAULT_FRAME_CELLS
	};
}

/** Progress from the engine, as the stage names `core/` emits ('graph', 'paper', …). */
export type StageListener = (stage: string) => void;

let worker: InverseWorker | null = null;

/** The one worker the page shares, made on demand. */
function engine(): InverseWorker {
	// The engine is unbundled under static/, so it is addressed by URL and only
	// ever loaded in a browser — never at build or SSR time (§1).
	return (worker ??= new InverseWorker(`${base}/${WORKER_PATH}`));
}

/** The tail of the queue: every call waits for it, and becomes it. */
let chain: Promise<unknown> = Promise.resolve();

/**
 * Which round of requests we are on. `cancel` moves it on, and work that was
 * queued before the move is dropped rather than started: the point of Afbryd is
 * that the engine stops, not that it starts the next 24-megapixel prepare
 * nobody is waiting for any more.
 */
let epoch = 0;

function queue<T>(work: () => Promise<T>): Promise<T> {
	const mine = epoch;
	const run = () =>
		mine === epoch ? work() : Promise.reject<T>(new DOMException('Cancelled', 'AbortError'));
	const next = chain.then(run, run);
	// The tail must not carry a rejection nobody handles; callers see their own.
	chain = next.catch(() => undefined);
	return next;
}

/**
 * Stop the engine: what it is doing now, and what is waiting behind it.
 *
 * Terminating the worker is the only interruption there is — a solve is one
 * long synchronous computation inside it — so the request in flight rejects
 * with an `AbortError` and the next call builds a fresh worker. Afbryd is this,
 * and so is closing the import dialog on a prepare the visitor no longer wants.
 * The artwork prepared inside the worker goes with it, so the next search has
 * to prepare again; `findCuts` is never called on its own, so that costs
 * nothing.
 */
export function cancel(): void {
	epoch++;
	worker?.stop();
}

/** The pair every fallback lands on: the site's own default paper. */
const DEFAULT_HEX = { left: '#ffffff', right: '#b91313' };

/**
 * Both paper colours as the engine's `[right, left]` pair of `#rrggbb`, which is
 * the only form it accepts.
 *
 * `toHexColor` rather than `parseHexColor`: the site's colour store still spells
 * its default red `rgb(185, 19, 19)`, and a visitor's own pair comes back from
 * `<input type="color">` as hex, so both forms reach here.
 */
export function paperPair(colors: HeartColors): PaperPair {
	const left = toHexColor(colors.left, DEFAULT_HEX.left);
	const right = toHexColor(colors.right, DEFAULT_HEX.right);
	// Two identical colours are refused by `settings()` with a message about
	// choosing two different ones, which is true but not about anything the
	// visitor did here — the site's own pair is never equal.
	return left.toLowerCase() === right.toLowerCase()
		? [DEFAULT_HEX.right, DEFAULT_HEX.left]
		: [right, left];
}

/**
 * The mask as an image the engine can classify.
 *
 * Exported because the test sends exactly this through the engine's own
 * `prepare`; nothing else should need it.
 */
export function maskToPixels(mask: Mask, colors: HeartColors): PixelsInput {
	const [right, left] = paperPair(colors);
	const channels = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
	const paper = [channels(left), channels(right)];
	const rgba = new Uint8ClampedArray(mask.data.length * 4);
	for (let i = 0; i < mask.data.length; i++) {
		// Any value the mask may grow (PAINT.md §11's "free" cells) falls back to
		// the left paper here rather than painting an undefined colour.
		const colour = paper[mask.data[i]!] ?? paper[0]!;
		rgba[4 * i] = colour[0]!;
		rgba[4 * i + 1] = colour[1]!;
		rgba[4 * i + 2] = colour[2]!;
		rgba[4 * i + 3] = 255;
	}
	return { type: 'pixels', rgba, imageWidth: mask.size, imageHeight: mask.size };
}

/**
 * The settings that make `prepare` give a mask back unchanged.
 *
 * Exported for the same reason as `maskToPixels`: the test proves the round trip
 * on the settings the page really sends, not on a copy of them.
 */
export function maskPrepareSettings(colors: HeartColors): Record<string, unknown> {
	const pair = paperPair(colors);
	return {
		...AUTOMATIC_PRESET,
		width: DEFAULT_WIDTH_MM,
		resolution: MASK_SIZE,
		paperColors: pair,
		// The two paper colours are the only two in the image, so nearest-swatch
		// is exact; `auto` would go looking for a threshold it does not need.
		mode: 'swatches',
		swatches: pair,
		invert: false,
		// The mask is the visitor's drawing, not a photograph: a stray cell is
		// something they painted, and cleaning it away would be editing it.
		removeSpecks: 0,
		fillHoles: 0
	};
}

/** Classify the painted mask, which is what a search is run against. */
export function prepareMask(
	mask: Mask,
	colors: HeartColors,
	onStage: StageListener = () => {}
): Promise<PreparedArtwork> {
	return queue(() =>
		engine().request<PreparedArtwork>(
			'prepare',
			maskToPixels(mask, colors),
			maskPrepareSettings(colors),
			onStage
		)
	);
}

/**
 * Turn a picture into the engine's two-colour target: the import dialog's
 * preview and its "Brug som maske", and "Prøv stjernen" on the empty page.
 *
 * Only the keys preparation reads are sent. The solve settings (time limit,
 * clearances, matching sheets) belong to Find snit and are none of this call's
 * business — and one of them, a time limit past 180 seconds, would be rejected
 * by the engine's own validation before a single pixel was classified.
 */
export function prepareImage(
	input: ArtworkInput,
	settings: ImportSettings,
	onStage: StageListener = () => {}
): Promise<PreparedArtwork> {
	return queue(() =>
		engine().request<PreparedArtwork>(
			'prepare',
			input,
			{
				...AUTOMATIC_PRESET,
				// The woven square is 100 mm wide and the mask has MASK_SIZE cells to a
				// side, so the prepared mask arrives at the resolution we paint at.
				width: DEFAULT_WIDTH_MM,
				minWidth: DEFAULT_MIN_WIDTH_MM,
				cutError: 0.25,
				resolution: MASK_SIZE,
				paperColors: settings.paperColors,
				mode: settings.mode ?? 'auto',
				swatches: settings.swatches ?? settings.paperColors,
				invert: settings.invert ?? false
			},
			onStage
		)
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
	return queue(() => engine().request<DetectedCrops>('detect-crops', { ...input, roi }, {}));
}

/**
 * Re-fit corners the visitor has moved, by searching again around them.
 *
 * The engine derives the region of interest from the quadrilateral it is given,
 * so this is "Find igen" once there is something to refine rather than a blind
 * second look at the whole picture.
 */
export function refineCorners(input: PixelsInput): Promise<DetectedCrops> {
	return queue(() => engine().request<DetectedCrops>('refine-crop', input, {}));
}

/**
 * The settings one search is run with.
 *
 * Exported so the test can put them through the engine's own `settings()`, which
 * is the only thing that says which keys the engine accepts: it copies the keys
 * of its `DEFAULTS` and silently drops everything else. That is how
 * `identicalSheets` — the obvious name for "cut both lobes from one template",
 * and the name PAINT.md §4 suggested — sat here doing nothing, while the setting
 * the fitter really reads (`preferMatchingSheets`, in `core/direct/fit.js` and
 * `core/direct/prefer-matching.js`) was hard-coded true. It is a `prepare`-time
 * key, read off the raw object by `core/engine.js`, and never reaches a solve.
 */
export function solveSettings(settings: FindSettings): Record<string, unknown> {
	return {
		...AUTOMATIC_PRESET,
		width: clampAdvanced('widthMm', settings.widthMm ?? DEFAULT_WIDTH_MM),
		minWidth: clampAdvanced('minWidthMm', settings.minWidthMm ?? DEFAULT_MIN_WIDTH_MM),
		cutError: 0.25,
		timeLimit: MAX_TIME_LIMIT_SECONDS,
		// "Samme skabelon til begge sider" — the checkbox, which follows Mellem
		// lapper Sym until the visitor says otherwise. A requested symmetry
		// overrules it inside `settings()`: the transpose implies matching sheets,
		// and any other mirror rules them out, because the two families are then
		// each other's images rather than copies.
		preferMatchingSheets: settings.matchingSheets ?? settings.symmetry.lobes === 'sym',
		matchingErrorAllowance: 0.01,
		earlyStop: false,
		removeSpecks: 0,
		fillHoles: 0,
		minRadius: 0.8,
		kerf: 0,
		printShrinkPercent: 0.2,
		materialResolution: 360,
		trials: 12,
		requireMaterialCore: true,
		paperColors: paperPair(settings.colors),
		resolution: MASK_SIZE,
		// The engine holds the symmetry itself where it can (§11); the folded mask
		// and the converter's `enforce` remain the safety net for the rest.
		...(ENGINE_SYMMETRY ? { symmetry: engineSymmetry(settings.symmetry) } : {})
	};
}

/**
 * Search for the cuts that weave the prepared artwork. Call after a `prepare`.
 *
 * There is no search-time setting (PAINT.md decision 3): the limit is the
 * engine's own maximum, and Afbryd is how a visitor shortens it.
 */
export function findCuts(
	settings: FindSettings,
	onStage: StageListener = () => {}
): Promise<DesignResult> {
	return queue(() =>
		engine().request<DesignResult>('solve', undefined, solveSettings(settings), onStage)
	);
}
