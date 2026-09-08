/**
 * The paint page's side of the inverse engine.
 *
 * `client.ts` is the typed boundary to the worker: it knows how to ask, not what
 * to ask for. This module knows what to ask for — the settings a hobbyist's
 * heart is solved with, the mask as an image the engine can classify, and the
 * one worker the whole page shares — so that no component has to assemble an
 * engine settings object, and so the mask's colour convention is stated once.
 *
 * The worker is created on the first call, never at import time: the engine is
 * 3.5 MB of WebAssembly and the paint page must open without it (PAINT.md §8).
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
	type Point,
	type PreparedArtwork
} from '$lib/inverse/client';
import { MASK_SIZE, type Mask } from '$lib/paint/mask';
import type { SymmetrySettings } from '$lib/paint/symmetry';
import type { HeartColors } from '$lib/types/heart';
import { parseHexColor } from '$lib/utils/heartColors';

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
 * False until the `paint-engine-symmetry` lane lands (PAINT.md §11). The
 * mapping below is written and tested regardless, so switching this to true is
 * the whole change: `symmetrize` on the mask and `enforce` in the converter stay
 * either way, as the safety net for the MILP route and for Inden i kurve Anti,
 * which the mask cannot express at all.
 */
export const ENGINE_SYMMETRY = false;

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
 * The editor's three rows as the engine's symmetry group (PAINT.md §11).
 *
 * The same table `transformsFor` uses on the mask, in the engine's vocabulary:
 * Mellem lapper is the transpose or the anti-transpose, Inden i lap is both
 * mirrors or the half turn, and Inden i kurve is the one row that is not a
 * symmetry of the square at all — it is per cut, so it goes over as its own
 * field.
 */
export function engineSymmetry(rows: SymmetrySettings): EngineSymmetry {
	const out: EngineSymmetry = {};
	if (rows.lobes === 'sym') out.transpose = true;
	else if (rows.lobes === 'anti') out.antiTranspose = true;
	if (rows.lobe === 'sym') {
		out.mirrorX = true;
		out.mirrorY = true;
	} else if (rows.lobe === 'anti') out.rotate180 = true;
	if (rows.curve !== 'off') out.withinCurve = rows.curve;
	return out;
}

/** How the engine should read a picture's colours; the dialog's three choices. */
export type ColourMode = 'auto' | 'red-white-mixture' | 'swatches';

export type ImportSettings = {
	/** The paper colours the heart will be drawn in. */
	colors: HeartColors;
	mode?: ColourMode;
	/** `[right, left]` for `mode: 'swatches'` — the mask's order, not HeartColors'. */
	swatches?: [string, string];
	invert?: boolean;
	/** The four corners of the woven square in the photo; absent means the whole image. */
	quad?: Point[];
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
 * The three engine knobs the "Avanceret" disclosure offers (PAINT.md §2).
 *
 * Everything else the engine can be told is either meaningless to a hobbyist or
 * a way to get a template that cannot be cut, so it is not offered.
 */
export type AdvancedSettings = { widthMm: number; minWidthMm: number; matchingSheets: boolean };

/** The two settings in it that are numbers, which are the two that have bounds. */
export type AdvancedNumber = 'widthMm' | 'minWidthMm';

/**
 * What those two numbers may be.
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
	minWidthMm: [0.5, 30]
};

const ADVANCED_DEFAULTS: Record<AdvancedNumber, number> = {
	widthMm: DEFAULT_WIDTH_MM,
	minWidthMm: DEFAULT_MIN_WIDTH_MM
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
		matchingSheets: symmetry.lobes === 'sym'
	};
}

/** Progress from the engine, as the stage names `core/` emits ('graph', 'paper', …). */
export type StageListener = (stage: string) => void;

let worker: InverseWorker | null = null;

/** The one worker the page shares, made on demand. */
function engine(): InverseWorker {
	return (worker ??= new InverseWorker(`${base}/${WORKER_PATH}`));
}

/**
 * Stop whatever the engine is doing — Afbryd, and leaving the page.
 *
 * The worker is terminated, which is the only way to interrupt a solve, so the
 * artwork prepared inside it is gone too: the next search has to prepare again.
 * `findCuts` is never called on its own, so that costs nothing.
 */
export function cancel(): void {
	worker?.stop();
}

/** The pair every fallback lands on: the site's own default paper. */
const DEFAULT_HEX = { left: '#ffffff', right: '#b91313' };

/** Both paper colours as `#rrggbb`, which is the only form the engine accepts. */
function hexPair(colors: HeartColors): { left: string; right: string } {
	const left = parseHexColor(colors.left) ?? DEFAULT_HEX.left;
	const right = parseHexColor(colors.right) ?? DEFAULT_HEX.right;
	// Two identical colours are refused by `settings()` with a message about
	// choosing two different ones, which is true but not about anything the
	// visitor did here — the site's own pair is never equal.
	return left === right ? DEFAULT_HEX : { left, right };
}

/**
 * The mask as an image the engine can classify.
 *
 * Exported because the test sends exactly this through the engine's own
 * `prepare`; nothing else should need it.
 */
export function maskToPixels(mask: Mask, colors: HeartColors): PixelsInput {
	const { left, right } = hexPair(colors);
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
	const { left, right } = hexPair(colors);
	return {
		...AUTOMATIC_PRESET,
		width: DEFAULT_WIDTH_MM,
		resolution: MASK_SIZE,
		paperColors: [right, left],
		// The two paper colours are the only two in the image, so nearest-swatch
		// is exact; `auto` would go looking for a threshold it does not need.
		mode: 'swatches',
		swatches: [right, left],
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
	return engine().request<PreparedArtwork>(
		'prepare',
		maskToPixels(mask, colors),
		maskPrepareSettings(colors),
		onStage
	);
}

/** Classify a picture: the import dialog's preview and its "Brug som maske". */
export function prepareImage(
	input: ArtworkInput,
	settings: ImportSettings,
	onStage: StageListener = () => {}
): Promise<PreparedArtwork> {
	const { left, right } = hexPair(settings.colors);
	const payload: ArtworkInput =
		input.type === 'pixels' && settings.quad ? { ...input, quad: settings.quad } : input;
	return engine().request<PreparedArtwork>(
		'prepare',
		payload,
		{
			...AUTOMATIC_PRESET,
			width: DEFAULT_WIDTH_MM,
			resolution: MASK_SIZE,
			paperColors: [right, left],
			mode: settings.mode ?? 'auto',
			swatches: settings.swatches ?? [right, left],
			invert: settings.invert ?? false,
			removeSpecks: 0,
			fillHoles: 0
		},
		onStage
	);
}

/** The four corners of the woven square the engine proposes for a photo. */
export function detectCorners(input: PixelsInput, roi?: number[]): Promise<DetectedCrops> {
	return engine().request<DetectedCrops>('detect-crops', { ...input, roi }, {});
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
	const { left, right } = hexPair(settings.colors);
	return {
		...AUTOMATIC_PRESET,
		width: clampAdvanced('widthMm', settings.widthMm ?? DEFAULT_WIDTH_MM),
		minWidth: clampAdvanced('minWidthMm', settings.minWidthMm ?? DEFAULT_MIN_WIDTH_MM),
		cutError: 0.25,
		timeLimit: MAX_TIME_LIMIT_SECONDS,
		// "Samme skabelon til begge sider" — the checkbox, which follows Mellem
		// lapper Sym until the visitor says otherwise.
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
		paperColors: [right, left],
		resolution: MASK_SIZE,
		// Sent only once the engine can hold the symmetry itself; until then the
		// mask is folded before solving and the cuts corrected afterwards.
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
	return engine().request<DesignResult>('solve', undefined, solveSettings(settings), onStage);
}
