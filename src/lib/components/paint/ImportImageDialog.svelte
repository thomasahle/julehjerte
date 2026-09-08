<!--
  "Importér billede" — PAINT.md §2, the import dialog.

  Filling the mask from a photograph is three decisions, and the dialog is those
  three and nothing else: which file, where the woven square is in it, and which
  of its colours becomes which paper. Everything the old generator page asked
  about besides — tracing resolution, cleanup radii, the solver's time limit —
  either belongs to Find snit or has an answer nobody outside the workshop wants
  to give, so it is settled in `$lib/inverse/engine.ts` instead.

  The preview is the whole point of the dialog. A prepared mask is the picture
  the engine will actually try to weave, and it can differ from the photograph in
  ways the visitor would never predict — a shadow read as red paper, a crop one
  corner out. So every change re-prepares (debounced, because dragging a corner
  is a hundred changes) and the answer is drawn as the heart it will become,
  with the same routine the paint canvas uses.

  But a preview that only appears after the corner is let go is not a preview of
  the drag, and dragging a corner is how a crop is found. So the diamond carries
  two pictures in turn: while the corners move it shows the photograph itself,
  rectified through them on the main thread (`$lib/paint/rectify.ts`, the
  locator's own `rectifyMotif`, a frame per pointer move) and drawn in the same
  heart by `drawHeartPhoto`; when the corner lands, the engine is asked and its
  two-colour answer replaces it. The visitor sees the crop follow their finger
  and then settle into the mask it will become — which is also the honest
  reading, because the colour picture is the crop and only the engine's is the
  mask.
-->
<script lang="ts">
	import Modal from '$lib/components/Modal.svelte';
	import { CloseIcon } from '$lib/components/icons';
	import { t, type Language, type TranslationKey } from '$lib/i18n';
	import {
		DEFAULT_COLORS,
		DEFAULT_COLORS_HEX,
		getColors,
		subscribeColors,
		type HeartColors
	} from '$lib/stores/colors';
	import type { ArtworkInput, CropProposal, Point } from '$lib/inverse/client';
	import {
		cancel,
		detectCorners,
		EngineError,
		ENGINE_UNAVAILABLE,
		paperPair,
		prepareImage,
		refineCorners,
		type ImportSettings
	} from '$lib/inverse/engine';
	import type { Mask } from '$lib/paint/mask';
	import { drawHeart, drawHeartPhoto } from '$lib/paint/drawHeart';
	import {
		decodeImageFile,
		ImportError,
		isConvexQuad,
		maskFromPrepared,
		orderQuad,
		type DecodedImage
	} from '$lib/paint/importImage';
	import { rectifyPhoto, type RectifiedPhoto } from '$lib/paint/rectify';
	import { detectSymmetry, NO_SYMMETRY, type SymmetrySettings } from '$lib/paint/symmetry';

	interface Props {
		open: boolean;
		onClose: () => void;
		/**
		 * The prepared mask and the symmetry detected in it, for the session store.
		 * The dialog closes itself afterwards, so this only has to store them.
		 */
		onUse: (mask: Mask, found: SymmetrySettings) => void;
		lang: Language;
	}

	let { open, onClose, onUse, lang }: Props = $props();

	const tr = (key: TranslationKey, params?: Record<string, string | number>) =>
		t(key, lang, params);

	/** The preview heart's side, in CSS pixels — PAINT.md §2. */
	const PREVIEW_SIZE = 200;

	/**
	 * How long a change waits before the engine is asked again. A dragged corner
	 * fires a pointer event per frame and preparing a photograph takes the better
	 * part of a second, so without this the queue grows faster than it drains.
	 */
	const PREVIEW_DEBOUNCE_MS = 300;

	/** How near a pointer has to be to grab a corner, in screen pixels. */
	const GRAB_RADIUS = 20;

	/**
	 * The smallest drawn area worth searching in, in screen pixels. Below this the
	 * box is a stray click rather than a region.
	 */
	const MIN_REGION = 24;

	/** Where an arrow key moves the corner it is pressed on. */
	const NUDGE: Record<string, Point> = {
		ArrowLeft: [-1, 0],
		ArrowRight: [1, 0],
		ArrowUp: [0, -1],
		ArrowDown: [0, 1]
	};

	let decoded = $state.raw<DecodedImage | null>(null);
	let fileError = $state<TranslationKey | null>(null);

	/** The four corners of the woven square, in image pixels, in the engine's order. */
	let quad = $state<Point[]>([]);
	/** `square` is a square picture used whole; `quad` is a crop, found or set. */
	let cropMode = $state<'quad' | 'square'>('quad');
	/** Whether a drag on the picture moves a corner or draws a search area. */
	let cropTool = $state<'corners' | 'region'>('corners');
	let region = $state.raw<number[] | null>(null);
	/**
	 * What to say about the corners. `found` and `uncertain` are the engine's two
	 * answers, `manual` is the visitor part-way through clicking four, `set` is a
	 * crop they placed or moved themselves, and `invalid` is four corners that do
	 * not enclose anything the engine can rectify.
	 */
	let cornerStatus = $state<
		'searching' | 'found' | 'uncertain' | 'none' | 'manual' | 'set' | 'invalid' | 'failed' | null
	>(null);
	/** The outline the engine drew round what it thinks is the heart. */
	let outline = $state.raw<Point[][]>([]);

	let mode = $state<ImportSettings['mode']>('auto');
	let swatchRight = $state(DEFAULT_COLORS_HEX.right);
	let swatchLeft = $state(DEFAULT_COLORS_HEX.left);
	let invert = $state(false);

	let previewMask = $state.raw<Mask | null>(null);
	let previewFound = $state<SymmetrySettings | null>(null);
	let previewBusy = $state(false);
	/** Why there is no preview, if the engine was asked and could not give one. */
	let previewError = $state<TranslationKey | null>(null);
	/**
	 * The photograph seen through the corners as they stand, or null when there
	 * are no four corners to see it through. It stands in for the mask between a
	 * corner moving and the engine answering — and stays put through a crop that
	 * folds over, so a preview does not blink out under a finger mid-drag.
	 */
	let livePhoto = $state.raw<RectifiedPhoto | null>(null);

	let colours = $state<HeartColors>({ ...DEFAULT_COLORS });
	let fileInput = $state.raw<HTMLInputElement | null>(null);
	let chooseButton = $state.raw<HTMLButtonElement | null>(null);
	let previewCanvas = $state.raw<HTMLCanvasElement | null>(null);
	let photoEl = $state.raw<HTMLDivElement | null>(null);

	let draggingCorner = -1;
	/** Whether the corner under the finger has actually moved since it was grabbed. */
	let cornerMoved = false;
	let regionStart: Point | null = null;
	/** A drag that ended on the picture must not also count as a corner click. */
	let suppressClick = false;

	/**
	 * Bumped by every change that makes the engine's current answer the answer to
	 * a question the visitor has moved on from — a corner dragged, a colour mode
	 * picked, a new file, the dialog closed. A reply carrying an older number is
	 * dropped, so a mask never outlives the crop it was made from.
	 */
	let generation = 0;
	let previewTimer: ReturnType<typeof setTimeout> | null = null;

	// The paper colours the mask will be shown in. The dialog draws its preview
	// with them and the engine draws its own with them too, so they follow the
	// footer's swatches like every other heart on the site.
	$effect(() => {
		colours = getColors();
		return subscribeColors((next) => (colours = next));
	});

	// Everything about a picture belongs to the visit that opened the dialog: a
	// second visit starts from the drop zone rather than from someone else's crop.
	$effect(() => {
		if (!open) reset();
	});

	$effect(() => {
		const canvas = previewCanvas;
		const mask = previewMask;
		const photo = livePhoto;
		if (!canvas || (!mask && !photo)) return;
		const ratio = window.devicePixelRatio || 1;
		canvas.width = Math.round(PREVIEW_SIZE * ratio);
		canvas.height = Math.round(PREVIEW_SIZE * ratio);
		const ctx = canvas.getContext('2d');
		if (!ctx) return;
		ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
		// The mask is the answer and wins whenever there is one; the crop is what
		// the diamond carries until the engine has been asked.
		if (mask) drawHeart(ctx, mask, colours, PREVIEW_SIZE);
		else if (photo) drawHeartPhoto(ctx, photo, colours, PREVIEW_SIZE);
	});

	/**
	 * Keep the live crop in step with the corners.
	 *
	 * This is the old generator page's loop: one animation frame per change, the
	 * locator module fetched once and answering from the browser's registry after
	 * that, and the frame before it cancelled — so a corner dragged across the
	 * picture rectifies once per painted frame rather than once per pointer
	 * event. It is the whole of what moves during a drag; the engine is not asked
	 * until the corner lands (`schedulePreview`).
	 */
	$effect(() => {
		const source = decoded?.input;
		const corners = $state.snapshot(quad) as Point[];
		// A picture used whole has no corners to drag and its mask is already on
		// the way; an SVG has no pixels to rectify.
		if (source?.type !== 'pixels' || cropMode !== 'quad' || corners.length !== 4) {
			livePhoto = null;
			return;
		}
		let cancelled = false;
		const frame = requestAnimationFrame(async () => {
			const image = { width: source.imageWidth, height: source.imageHeight, data: source.rgba };
			try {
				const photo = await rectifyPhoto(image, corners);
				if (!cancelled) livePhoto = photo;
			} catch (error) {
				// Corners that fold over are not a crop the locator can flatten, and
				// the status line already says so in the visitor's own words. The
				// last good frame stays: a preview that blanked every time a dragged
				// corner crossed its neighbour would flicker all the way across.
				//
				// Everything else that can throw here — the locator failing to load
				// above all — has no symptom at all but a crop that never appears,
				// so it is logged like the engine's own failures (`engineFailed`).
				// Corners the dialog itself calls convex are the ones the locator
				// takes, so this asks the question we already have an answer to
				// rather than reading the locator's message back.
				if (isConvexQuad(corners)) {
					console.error('Import: the live crop could not be drawn', error);
				}
			}
		});
		return () => {
			cancelled = true;
			cancelAnimationFrame(frame);
		};
	});

	function reset(): void {
		if (previewTimer) clearTimeout(previewTimer);
		previewTimer = null;
		generation++;
		// Nobody wants the answer any more, so nobody should pay for it either: a
		// prepare of a 24-megapixel photograph runs for seconds after the dialog is
		// closed unless the worker is told to stop. Only when this dialog is what
		// asked, though — `reset` also runs when it is mounted closed, and the
		// engine it would stop is shared with Find snit.
		if (decoded) {
			cancel();
			URL.revokeObjectURL(decoded.url);
		}
		decoded = null;
		fileError = null;
		quad = [];
		cropMode = 'quad';
		cropTool = 'corners';
		region = null;
		cornerStatus = null;
		outline = [];
		mode = 'auto';
		invert = false;
		previewMask = null;
		previewFound = null;
		previewBusy = false;
		previewError = null;
		livePhoto = null;
		// A gesture does not outlive the dialog. Escape while a corner is held
		// closes the Modal and destroys the picture under the finger, so neither
		// pointerup nor pointercancel ever reaches `endDrag` — and a `draggingCorner`
		// left behind would hold open the one branch in `schedulePreview` that never
		// asks the engine, silently, for the rest of the visit: the next picture
		// would show its crop and never become a mask. `regionStart` and
		// `suppressClick` are stale in exactly the same way, and would put the next
		// visit's first click into a region that was abandoned a picture ago.
		draggingCorner = -1;
		cornerMoved = false;
		regionStart = null;
		suppressClick = false;
		if (fileInput) fileInput.value = '';
	}

	function errorKey(error: unknown): TranslationKey {
		if (!(error instanceof ImportError)) return 'paintImportFailed';
		return (
			{
				tooLarge: 'paintImportTooLarge',
				unsupported: 'paintImportUnsupported',
				pixelsTooLarge: 'paintImportPixelsTooLarge',
				decode: 'paintImportFailed'
			} as const
		)[error.kind];
	}

	async function chooseFile(file: File | undefined | null): Promise<void> {
		if (!file) return;
		reset();
		try {
			const next = await decodeImageFile(file);
			decoded = next;
		} catch (error) {
			fileError = errorKey(error);
			return;
		}
		if (decoded.pixels) await findCorners();
		else schedulePreview();
	}

	/** True when the picture is square, so it may be taken as the woven square whole. */
	let squarePicture = $derived(
		!!decoded?.pixels && decoded.pixels.width === decoded.pixels.height
	);

	/**
	 * Ask the engine where the heart is.
	 *
	 * With four corners already on the picture the search is a refinement around
	 * them, which is what a visitor who nudged one corner and pressed Find igen
	 * means; otherwise it is a fresh look, narrowed to the drawn area if there is
	 * one.
	 */
	async function findCorners(): Promise<void> {
		const source = decoded?.input;
		if (!source || source.type !== 'pixels') return;
		// The crop is about to be replaced, so a preview of the old one — running or
		// merely armed — is already out of date; and this search is itself an answer
		// to drop if the visitor picks another picture while it runs.
		if (previewTimer) clearTimeout(previewTimer);
		previewTimer = null;
		const mine = ++generation;
		cornerStatus = 'searching';
		previewMask = null;
		previewFound = null;
		previewBusy = false;
		previewError = null;
		const refine = quad.length === 4 && isConvexQuad(quad);
		const roi = region ?? undefined;
		const corners = quad.map((p) => [...p] as Point);
		try {
			const crops = refine
				? await refineCorners({ ...source, quad: corners })
				: await detectCorners(source, roi);
			if (mine !== generation) return;
			const candidate = crops.candidates[0];
			if (candidate) useCandidate(candidate);
			// A drawn area is an instruction about where the heart is, so falling
			// back to the whole picture would answer a question nobody asked.
			else if (squarePicture && !refine && !region) useWholePicture();
			else if (crops.status === 'needs_selection' && !region) {
				// The engine saw more than one plausible motif and proposed none on
				// purpose: it is asking which one is the heart, and drawing an area
				// round it is how the visitor answers.
				quad = [];
				outline = [];
				cropMode = 'quad';
				cropTool = 'region';
				cornerStatus = null;
			} else {
				quad = [];
				outline = [];
				region = null;
				cropMode = 'quad';
				cropTool = 'corners';
				cornerStatus = 'none';
			}
		} catch (error) {
			if (mine !== generation) return;
			cornerStatus = engineFailed(error) ? 'failed' : 'none';
		}
	}

	/**
	 * Whether the engine is what failed, rather than the picture.
	 *
	 * An engine that cannot load answers every question the same way, so telling
	 * the visitor no heart was found in their photograph blames the photograph
	 * and sends them down a manual crop that will fail in exactly the same way.
	 * What the engine says *about* a picture — that it cannot find red and white
	 * paper in it, say — is a real answer and keeps the picture's own words.
	 * Either way the engine's message is logged: it is the only diagnostic there
	 * is once it has been turned into one of two sentences.
	 */
	function engineFailed(error: unknown): boolean {
		console.error('Import: the engine could not answer', error);
		return error instanceof EngineError && error.code === ENGINE_UNAVAILABLE;
	}

	function useCandidate(candidate: CropProposal): void {
		quad = candidate.quad.map((p) => [...p] as Point);
		outline = candidate.outline;
		cropMode = 'quad';
		cropTool = 'corners';
		// The drawn area has been answered; leaving it on the picture would only
		// draw a gold box round a crop it no longer describes.
		region = null;
		cornerStatus = candidate.needsReview ? 'uncertain' : 'found';
		schedulePreview();
	}

	function useWholePicture(): void {
		cropMode = 'square';
		cropTool = 'corners';
		quad = [];
		outline = [];
		cornerStatus = null;
		region = null;
		schedulePreview();
	}

	function setCornersManually(): void {
		cropMode = 'quad';
		cropTool = 'corners';
		quad = [];
		outline = [];
		region = null;
		cornerStatus = 'manual';
		// There is no crop any more, so this only clears the preview and drops
		// whatever the engine was preparing for the crop there was.
		schedulePreview();
	}

	function selectRegion(): void {
		cropTool = 'region';
		region = null;
		// Arming the tool changes no crop, so the preview still shows what would be
		// used — unless a square picture was being taken whole, where switching to a
		// crop leaves nothing to show until an area is drawn.
		if (cropMode === 'square') {
			cropMode = 'quad';
			schedulePreview();
		}
	}

	/** What goes to the engine, or null while the crop is still unfinished. */
	function payload(): ArtworkInput | null {
		const source = decoded?.input;
		if (!source) return null;
		if (source.type !== 'pixels' || cropMode === 'square') return source;
		if (quad.length !== 4 || !isConvexQuad(quad)) return null;
		return { ...source, quad: quad.map((p) => [...p] as Point) };
	}

	function importSettings(): ImportSettings {
		// `paperPair` is the one place that turns the site's colours into the pair
		// the engine takes — hex, right lobe first, and never twice the same
		// colour, which `settings()` refuses. Find snit sends the same pair.
		return {
			mode,
			swatches: [swatchRight, swatchLeft],
			invert,
			paperColors: paperPair(colours)
		};
	}

	function schedulePreview(): void {
		previewMask = null;
		previewFound = null;
		previewError = null;
		if (previewTimer) clearTimeout(previewTimer);
		previewTimer = null;
		// The number is taken here rather than when the request goes out: a prepare
		// already running is an answer about the corners as they were, and a change
		// made while it runs has to discard it. Bumping it only in `runPreview`
		// would let that answer arrive during the debounce and pass for this one.
		const mine = ++generation;
		previewBusy = false;
		// A corner under a finger is still moving, so even the debounce is too
		// eager: a hand that pauses for a third of a second mid-drag would spend a
		// second of the engine's time on a crop it is about to leave, and the
		// preview would freeze on it. What follows the drag is the rectified
		// photograph; `endDrag` asks the engine once the corner has landed.
		if (!payload() || draggingCorner >= 0) return;
		previewBusy = true;
		previewTimer = setTimeout(() => void runPreview(mine), PREVIEW_DEBOUNCE_MS);
	}

	async function runPreview(mine: number): Promise<void> {
		if (mine !== generation) return;
		const source = payload();
		if (!source) {
			previewBusy = false;
			return;
		}
		try {
			const prepared = await prepareImage(source, importSettings());
			if (mine !== generation) return;
			const mask = maskFromPrepared(prepared);
			previewMask = mask;
			previewFound = detectSymmetry(mask);
		} catch (error) {
			if (mine !== generation) return;
			previewError = engineFailed(error) ? 'paintFailedEngine' : 'paintPreviewFailed';
		} finally {
			if (mine === generation) previewBusy = false;
		}
	}

	function use(): void {
		if (!previewMask) return;
		// Spread rather than hand the store a rune proxy of our own state.
		onUse(previewMask, { ...(previewFound ?? NO_SYMMETRY) });
		// Using the mask is the end of the dialog's business (§2). Closing here
		// rather than leaving it to the parent is what makes that true wherever the
		// dialog is wired up.
		onClose();
	}

	/* ---------------------------------------------------------------------
	   Pointing at the picture
	   --------------------------------------------------------------------- */

	function pointerPoint(event: PointerEvent | MouseEvent): Point | null {
		const pixels = decoded?.pixels;
		if (!pixels || !photoEl) return null;
		const rect = photoEl.getBoundingClientRect();
		if (!rect.width || !rect.height) return null;
		return [
			Math.max(0, Math.min(pixels.width, ((event.clientX - rect.left) / rect.width) * pixels.width)),
			Math.max(0, Math.min(pixels.height, ((event.clientY - rect.top) / rect.height) * pixels.height))
		];
	}

	/**
	 * How many of the picture's own pixels one screen pixel covers.
	 *
	 * Every distance the visitor feels — the grab radius, an arrow key's step, the
	 * smallest area worth searching in — is a distance on the screen, and a
	 * photograph shown at a fifth of its size would otherwise make each of them
	 * five times as coarse as it looks.
	 */
	function imagePixelsPerScreenPixel(): number {
		const width = decoded?.pixels?.width ?? 0;
		const shown = photoEl?.getBoundingClientRect().width ?? 0;
		return shown ? width / shown : 1;
	}

	function startDrag(event: PointerEvent): void {
		if (cropMode !== 'quad' || !(event.currentTarget instanceof HTMLElement)) return;
		suppressClick = false;
		const p = pointerPoint(event);
		if (!p) return;
		if (cropTool === 'region') {
			regionStart = p;
			region = [...p, ...p];
			event.currentTarget.setPointerCapture(event.pointerId);
			suppressClick = true;
			return;
		}
		const radius = GRAB_RADIUS * imagePixelsPerScreenPixel();
		draggingCorner = quad.findIndex((c) => Math.hypot(c[0] - p[0], c[1] - p[1]) <= radius);
		cornerMoved = false;
		if (draggingCorner >= 0) {
			event.currentTarget.setPointerCapture(event.pointerId);
			suppressClick = true;
		}
	}

	function moveDrag(event: PointerEvent): void {
		if (draggingCorner < 0 && !regionStart) return;
		const p = pointerPoint(event);
		if (!p) return;
		if (regionStart) {
			region = [
				Math.min(regionStart[0], p[0]),
				Math.min(regionStart[1], p[1]),
				Math.max(regionStart[0], p[0]),
				Math.max(regionStart[1], p[1])
			];
			return;
		}
		// A tenth of a pixel is finer than anyone can aim and finer than the
		// engine's own half-pixel convention needs; it keeps the numbers readable.
		quad[draggingCorner] = p.map((v) => Math.round(v * 10) / 10) as Point;
		cornerMoved = true;
		outline = [];
		cornerStatus = isConvexQuad(quad) ? 'set' : 'invalid';
		schedulePreview();
	}

	function endDrag(event: PointerEvent): void {
		const corner = draggingCorner;
		draggingCorner = -1;
		if (corner >= 0) {
			// The corner has landed, so the crop is a question worth asking: this is
			// the one `schedulePreview` held back for the length of the drag. A
			// corner grabbed and let go without moving is the crop the preview is
			// already showing, and re-preparing it would throw that away for a
			// second and hand back the same mask.
			if (cornerMoved) schedulePreview();
			cornerMoved = false;
			return;
		}
		if (!regionStart) return;
		regionStart = null;
		if (event.type === 'pointercancel') {
			region = null;
			return;
		}
		// A stray click is not an area. Below this the drawn box is noise, and
		// searching inside it would only find nothing — so it is dropped rather than
		// left on the picture as a box that nothing will ever answer.
		const drawn = region;
		const minimum = MIN_REGION * imagePixelsPerScreenPixel();
		if (!drawn || drawn[2]! - drawn[0]! < minimum || drawn[3]! - drawn[1]! < minimum) {
			region = null;
			return;
		}
		quad = [];
		outline = [];
		cropTool = 'corners';
		void findCorners();
	}

	/**
	 * Move the corner an arrow key was pressed on.
	 *
	 * Dragging is the only other way to adjust a crop, and §8 asks for a keyboard
	 * path throughout; the markers are therefore real buttons, and this is what
	 * they are for. One press is one screen pixel's worth of the picture, ten with
	 * Shift.
	 */
	function nudgeCorner(event: KeyboardEvent, index: number): void {
		const step = NUDGE[event.key];
		const pixels = decoded?.pixels;
		const corner = quad[index];
		if (!step || !pixels || !corner) return;
		event.preventDefault();
		const distance = imagePixelsPerScreenPixel() * (event.shiftKey ? 10 : 1);
		const move = (v: number, by: number, limit: number) =>
			Math.round(Math.max(0, Math.min(limit, v + by * distance)) * 10) / 10;
		quad[index] = [move(corner[0], step[0], pixels.width), move(corner[1], step[1], pixels.height)];
		outline = [];
		cornerStatus = isConvexQuad(quad) ? 'set' : 'invalid';
		schedulePreview();
	}

	function clickPicture(event: MouseEvent): void {
		if (cropMode !== 'quad' || cropTool !== 'corners') return;
		// A click with no pointer behind it (a screen reader activating the picture,
		// say) reports (0, 0), which would put a corner in the top-left of the photo
		// rather than where anybody meant.
		if (event.detail === 0) return;
		if (suppressClick) {
			suppressClick = false;
			return;
		}
		if (quad.length >= 4) return;
		const p = pointerPoint(event);
		if (!p) return;
		quad = [...quad, p.map((v) => Math.round(v)) as Point];
		outline = [];
		if (quad.length < 4) {
			cornerStatus = 'manual';
			return;
		}
		// The visitor was asked for the top corner first; the rest are put into
		// perimeter order from there, so a zigzag of clicks still means the crop
		// they drew rather than a bow tie the engine refuses.
		quad = orderQuad(quad);
		cornerStatus = isConvexQuad(quad) ? 'set' : 'invalid';
		schedulePreview();
	}

	/* ---------------------------------------------------------------------
	   Words
	   --------------------------------------------------------------------- */

	let statusText = $derived.by(() => {
		if (!decoded?.pixels) return '';
		if (cropMode === 'square') return tr('paintCornersWholeImageHint');
		if (cropTool === 'region') return tr('paintCornersRegionHint');
		switch (cornerStatus) {
			case 'searching':
				return tr('paintCornersSearching');
			case 'found':
				return tr('paintCornersFound');
			case 'uncertain':
				return tr('paintCornersUncertain');
			case 'none':
				return tr('paintCornersNone');
			case 'manual':
				return tr('paintCornersManual', { n: quad.length });
			case 'set':
				return tr('paintCornersSet');
			case 'invalid':
				return tr('paintCornersInvalid');
			case 'failed':
				return tr('paintFailedEngine');
			default:
				return '';
		}
	});

	/**
	 * What to say under the crop while it stands in for the mask: that the engine
	 * is working, that it could not answer, or that it has not been asked yet.
	 *
	 * Nothing, for corners that fold over. The picture's own status line already
	 * names that and says what to do about it, and promising a mask on release
	 * here would be a second answer that happens to be wrong.
	 */
	let cropNote = $derived.by<TranslationKey | null>(() => {
		if (previewBusy) return 'paintPreviewWorking';
		if (previewError) return previewError;
		return cornerStatus === 'invalid' ? null : 'paintPreviewCropHint';
	});

	let symmetryText = $derived.by(() => {
		const found = previewFound;
		if (!found) return '';
		const rows: Array<[SymmetrySettings[keyof SymmetrySettings], TranslationKey]> = [
			[found.lobes, 'editorBetweenLobes'],
			[found.lobe, 'editorWithinLobe'],
			[found.curve, 'editorWithinCurve']
		];
		const named = rows
			.filter(([m]) => m !== 'off')
			.map(([m, key]) => `${tr(key)} (${tr(m === 'sym' ? 'editorSym' : 'editorAnti')})`);
		return named.length
			? tr('paintFoundSymmetry', { rows: named.join(', ') })
			: tr('paintFoundSymmetryNone');
	});

	const COLOUR_MODES: Array<{ value: ImportSettings['mode']; label: TranslationKey }> = [
		{ value: 'auto', label: 'paintColoursAuto' },
		{ value: 'red-white-mixture', label: 'paintColoursRedWhite' },
		{ value: 'swatches', label: 'paintColoursPick' }
	];

	function chooseMode(next: ImportSettings['mode']): void {
		mode = next;
		schedulePreview();
	}

	function onDrop(event: DragEvent): void {
		event.preventDefault();
		void chooseFile(event.dataTransfer?.files?.[0]);
	}
</script>

<Modal
	{open}
	labelledBy="paint-import-title"
	width="min(860px, 100%)"
	maxHeight="90vh"
	column
	initialFocus={chooseButton}
	{onClose}
>
	<header class="head">
		<h2 id="paint-import-title">{tr('paintImportTitle')}</h2>
		<button
			type="button"
			class="btn btn-sm btn-ghost btn-icon"
			onclick={onClose}
			aria-label={tr('helpCloseAriaLabel')}
		>
			<CloseIcon size={20} />
		</button>
	</header>

	<div class="body">
		{#if !decoded}
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div class="drop" ondragover={(e) => e.preventDefault()} ondrop={onDrop}>
				<p class="drop-title">{tr('paintDrop')}</p>
				<button
					type="button"
					class="btn btn-outline"
					bind:this={chooseButton}
					onclick={() => fileInput?.click()}
				>
					{tr('paintChooseFile')}
				</button>
				<p class="hint">{tr('paintFormats')}</p>
			</div>
		{:else}
			<div class="work">
				<section class="picture" aria-label={tr('paintCorners')}>
					<!-- Setting a corner is pointing at a place in a photograph, which no
					     key can do, so the picture is not a button: an Enter on one would be
					     a corner at (0, 0). What the keyboard gets instead is the corner
					     markers, which are buttons the arrow keys move, beside Find igen,
					     Vælg område and Sæt selv. -->
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<!-- svelte-ignore a11y_click_events_have_key_events -->
					<div
						class="photo"
						class:pointing={!!decoded.pixels && cropMode === 'quad'}
						class:region-tool={cropTool === 'region'}
						bind:this={photoEl}
						onclick={clickPicture}
						onpointerdown={startDrag}
						onpointermove={moveDrag}
						onpointerup={endDrag}
						onpointercancel={endDrag}
					>
						<img src={decoded.url} alt={decoded.name} draggable="false" />
						{#if decoded.pixels && cropMode === 'quad'}
							<svg
								viewBox="0 0 {decoded.pixels.width} {decoded.pixels.height}"
								preserveAspectRatio="none"
								aria-hidden="true"
							>
								{#each outline as arc, i (i)}
									<polyline class="found" points={arc.map((p) => p.join(',')).join(' ')} />
								{/each}
								{#if region}
									<rect
										class="region"
										x={region[0]}
										y={region[1]}
										width={region[2]! - region[0]!}
										height={region[3]! - region[1]!}
									/>
								{/if}
								{#if quad.length > 1}
									<polyline
										class="crop"
										points={quad.map((p) => p.join(',')).join(' ') +
											(quad.length === 4 ? ` ${quad[0]!.join(',')}` : '')}
									/>
								{/if}
							</svg>
							{#each quad as p, i (i)}
								<button
									type="button"
									class="corner"
									style:left="{(100 * p[0]) / decoded.pixels.width}%"
									style:top="{(100 * p[1]) / decoded.pixels.height}%"
									aria-label={tr('paintCornerNudge', { n: i + 1 })}
									onkeydown={(event) => nudgeCorner(event, i)}>{i + 1}</button
								>
							{/each}
						{/if}
					</div>

					{#if decoded.pixels}
						<div class="corner-actions">
							<button
								type="button"
								class="btn btn-sm btn-ghost"
								disabled={cornerStatus === 'searching'}
								onclick={() => findCorners()}>{tr('paintCornersFindAgain')}</button
							>
							<button
								type="button"
								class="btn btn-sm btn-ghost"
								class:btn-dark={cropTool === 'region'}
								aria-pressed={cropTool === 'region'}
								onclick={selectRegion}>{tr('paintCornersRegion')}</button
							>
							<button
								type="button"
								class="btn btn-sm btn-ghost"
								class:btn-dark={cornerStatus === 'manual'}
								aria-pressed={cornerStatus === 'manual'}
								onclick={setCornersManually}>{tr('paintCornersSetSelf')}</button
							>
							{#if squarePicture}
								<button
									type="button"
									class="btn btn-sm btn-ghost"
									class:btn-dark={cropMode === 'square'}
									aria-pressed={cropMode === 'square'}
									onclick={useWholePicture}>{tr('paintCornersWholeImage')}</button
								>
							{/if}
						</div>
						<p class="hint" role="status">{statusText}</p>
					{/if}
				</section>

				<section class="controls">
					<h3 class="panel-title">{tr('paintColours')}</h3>
					<div class="segmented" role="group" aria-label={tr('paintColoursMode')}>
						{#each COLOUR_MODES as option (option.value)}
							<button
								type="button"
								class="segment"
								class:on={mode === option.value}
								aria-pressed={mode === option.value}
								onclick={() => chooseMode(option.value)}>{tr(option.label)}</button
							>
						{/each}
					</div>

					{#if mode === 'swatches'}
						<p class="hint">{tr('paintSwatchHint')}</p>
						<div class="swatches">
							<label class="swatch">
								<span>{tr('paintSwatchRight')}</span>
								<input
									type="color"
									bind:value={swatchRight}
									oninput={schedulePreview}
								/>
							</label>
							<label class="swatch">
								<span>{tr('paintSwatchLeft')}</span>
								<input type="color" bind:value={swatchLeft} oninput={schedulePreview} />
							</label>
						</div>
					{/if}

					<label class="checkbox">
						<input type="checkbox" bind:checked={invert} onchange={schedulePreview} />
						<span>{tr('paintColoursInvert')}</span>
					</label>

					<h3 class="panel-title">{tr('paintPreview')}</h3>
					<div class="preview">
						{#if previewMask || livePhoto}
							<!-- The name goes on the wrapper: a <canvas> is an interactive
							     element to the accessibility tree, and cannot take role="img".
							     It says which of the two pictures is up, because "the mask" and
							     "the photograph cropped" are different promises. -->
							<div
								class="heart"
								role="img"
								aria-label={previewMask ? tr('paintPreviewAlt') : tr('paintPreviewCropAlt')}
							>
								<canvas
									bind:this={previewCanvas}
									style:width="{PREVIEW_SIZE}px"
									style:height="{PREVIEW_SIZE}px"
									aria-hidden="true"
								></canvas>
							</div>
						{:else}
							<div class="placeholder" role="status">
								{#if previewBusy}{tr('paintPreviewWorking')}{:else if previewError}{tr(
										previewError
									)}{:else}{tr('paintPreviewWaiting')}{/if}
							</div>
						{/if}
					</div>
					{#if previewMask}
						<p class="hint">{symmetryText}</p>
					{:else if livePhoto && cropNote}
						<!-- The crop is showing, so the line under it says what is still
						     missing; `cropNote` is which of those three it is. -->
						<p class="hint" role="status">{tr(cropNote)}</p>
					{/if}
				</section>
			</div>
		{/if}

		{#if fileError}
			<p class="error" role="alert">{tr(fileError)}</p>
		{/if}
	</div>

	<footer class="foot">
		{#if decoded}
			<button type="button" class="btn btn-sm btn-ghost" onclick={() => fileInput?.click()}>
				{tr('paintChooseFile')}
			</button>
		{/if}
		<span class="spacer"></span>
		<button type="button" class="btn btn-sm btn-ghost" onclick={onClose}>{tr('cancel')}</button>
		<button type="button" class="btn btn-sm btn-primary" disabled={!previewMask} onclick={use}>
			{tr('paintUseAsMask')}
		</button>
	</footer>

	<input
		class="file"
		type="file"
		bind:this={fileInput}
		accept=".png,.jpg,.jpeg,.webp,.svg,image/png,image/jpeg,image/webp,image/svg+xml"
		onchange={(event) => chooseFile(event.currentTarget.files?.[0])}
	/>
</Modal>

<style>
	.head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		margin-bottom: 16px;
	}

	.head h2 {
		margin: 0;
		font-size: 20px;
		font-weight: 650;
		color: var(--deep);
	}

	.body {
		flex: 1 1 auto;
		min-height: 0;
		overflow: auto;
	}

	.foot {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-top: 16px;
		padding-top: 16px;
		border-top: 1px solid var(--line);
	}

	.spacer {
		flex: 1 1 auto;
	}

	/* The input is the file picker's only reachable form control, so it is hidden
	   rather than removed: a screen reader follows the button that clicks it. */
	.file {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		border: 0;
		clip-path: inset(50%);
		overflow: hidden;
		white-space: nowrap;
	}

	.drop {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 12px;
		padding: 48px 24px;
		border: 2px dashed var(--sage);
		border-radius: 12px;
		background: var(--cream2);
		text-align: center;
	}

	.drop-title {
		margin: 0;
		font-size: 15px;
		font-weight: 600;
		color: var(--ink);
	}

	.hint {
		margin: 0;
		font-size: 13px;
		line-height: 1.5;
		color: var(--muted);
	}

	.error {
		margin: 16px 0 0;
		padding: 10px 12px;
		border: 1px solid var(--alert-border);
		border-radius: 8px;
		background: var(--alert-bg);
		color: var(--alert-ink);
		font-size: 13px;
	}

	.work {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 260px;
		gap: 20px;
		align-items: start;
	}

	.picture,
	.controls {
		display: flex;
		flex-direction: column;
		gap: 10px;
		min-width: 0;
	}

	.panel-title {
		margin: 0;
	}

	/* The picture shrink-wraps itself so the corner markers, which are positioned
	   in percentages of this box, land on the picture and not on letterboxing
	   beside it. It invites a pointer only where there is a crop to point at: an
	   SVG import has no corners to set, and neither has a picture used whole. */
	.photo {
		position: relative;
		display: block;
		width: fit-content;
		max-width: 100%;
		margin: 0 auto;
		border: 1px solid var(--line);
		border-radius: 10px;
		background: var(--cream2);
		overflow: hidden;
		touch-action: none;
		user-select: none;
	}

	.photo.pointing {
		cursor: crosshair;
	}

	.photo.pointing.region-tool {
		cursor: cell;
	}

	/* A tall photograph must not push the corner buttons and the status line out
	   of the dialog: the picture is a step, not the whole of it. */
	.photo img {
		display: block;
		width: auto;
		max-width: 100%;
		max-height: 340px;
	}

	.photo svg {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		pointer-events: none;
	}

	.photo .crop {
		fill: rgb(var(--deep-rgb) / 0.15);
		stroke: var(--white);
		stroke-width: 2px;
		vector-effect: non-scaling-stroke;
	}

	.photo .found {
		fill: none;
		stroke: var(--gold);
		stroke-width: 1px;
		stroke-dasharray: 4 3;
		vector-effect: non-scaling-stroke;
	}

	.photo .region {
		fill: rgb(var(--deep-rgb) / 0.12);
		stroke: var(--gold);
		stroke-width: 2px;
		vector-effect: non-scaling-stroke;
	}

	/* A marker is a button so that the keyboard can reach it and move it. A
	   pointer is answered by the picture underneath, which grabs whichever corner
	   is nearest — so the marker passes the gesture on rather than catching it,
	   and wears the picture's cursor while it does. */
	.corner {
		position: absolute;
		display: grid;
		place-items: center;
		width: 24px;
		height: 24px;
		padding: 0;
		transform: translate(-50%, -50%);
		border: 2px solid var(--white);
		border-radius: 50%;
		background: var(--green);
		color: var(--white);
		font-family: inherit;
		font-size: 12px;
		font-weight: 600;
		cursor: inherit;
		touch-action: none;
	}

	.corner:focus-visible {
		outline: 2px solid var(--deep);
		outline-offset: 2px;
	}

	.corner-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}

	.segmented {
		display: flex;
		border: 1.5px solid var(--line);
		border-radius: 8px;
		overflow: hidden;
		background: var(--white);
	}

	.segment {
		flex: 1 1 0;
		padding: 8px 6px;
		border: 0;
		background: var(--white);
		color: var(--green);
		font-family: inherit;
		font-size: 12px;
		font-weight: 600;
		line-height: 1.2;
		cursor: pointer;
	}

	.segment + .segment {
		border-left: 1.5px solid var(--line);
	}

	.segment:hover {
		background: var(--cream2);
	}

	.segment.on {
		background: var(--green);
		color: var(--white);
	}

	.swatches {
		display: flex;
		gap: 10px;
	}

	.swatch {
		flex: 1 1 0;
		display: flex;
		flex-direction: column;
		gap: 4px;
		font-size: 12px;
		color: var(--muted);
	}

	.swatch input {
		width: 100%;
		height: 34px;
		padding: 2px;
		border: 1.5px solid var(--line);
		border-radius: 8px;
		background: var(--white);
		cursor: pointer;
	}

	.checkbox {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 14px;
		color: var(--ink);
	}

	.checkbox input {
		width: 16px;
		height: 16px;
		accent-color: var(--red);
	}

	.preview {
		display: grid;
		place-items: center;
		min-height: 200px;
		border: 1px solid var(--line);
		border-radius: 10px;
		background: var(--cream2);
	}

	.heart {
		display: block;
		line-height: 0;
	}

	.placeholder {
		padding: 12px;
		font-size: 13px;
		color: var(--muted);
		text-align: center;
	}

	@media (max-width: 699px) {
		.work {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
