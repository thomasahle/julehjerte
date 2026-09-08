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
	import { toHexColors } from '$lib/utils/heartColors';
	import type { ArtworkInput, CropProposal, Point } from '$lib/inverse/client';
	import { detectCorners, prepareImage, refineCorners, type ImportSettings } from '$lib/inverse/engine';
	import type { Mask } from '$lib/paint/mask';
	import { drawHeart } from '$lib/paint/drawHeart';
	import {
		decodeImageFile,
		ImportError,
		isConvexQuad,
		maskFromPrepared,
		orderQuad,
		type DecodedImage
	} from '$lib/paint/importImage';
	import { detectSymmetry, NO_SYMMETRY, type SymmetrySettings } from '$lib/paint/symmetry';

	interface Props {
		open: boolean;
		onClose: () => void;
		/** The prepared mask and the symmetry detected in it, for the session store. */
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

	let decoded = $state.raw<DecodedImage | null>(null);
	let fileError = $state<TranslationKey | null>(null);

	/** The four corners of the woven square, in image pixels, in the engine's order. */
	let quad = $state<Point[]>([]);
	/** `square` is a square picture used whole; `quad` is a crop, found or set. */
	let cropMode = $state<'quad' | 'square'>('quad');
	/** Whether a drag on the picture moves a corner or draws a search area. */
	let cropTool = $state<'corners' | 'region'>('corners');
	let region = $state.raw<number[] | null>(null);
	let cornerStatus = $state<'searching' | 'found' | 'uncertain' | 'none' | 'manual' | null>(null);
	/** The outline the engine drew round what it thinks is the heart. */
	let outline = $state.raw<Point[][]>([]);

	let mode = $state<ImportSettings['mode']>('auto');
	let swatchRight = $state(DEFAULT_COLORS_HEX.right);
	let swatchLeft = $state(DEFAULT_COLORS_HEX.left);
	let invert = $state(false);

	let previewMask = $state.raw<Mask | null>(null);
	let previewFound = $state<SymmetrySettings | null>(null);
	let previewBusy = $state(false);
	let previewFailed = $state(false);

	let colours = $state<HeartColors>({ ...DEFAULT_COLORS });
	let fileInput = $state.raw<HTMLInputElement | null>(null);
	let chooseButton = $state.raw<HTMLButtonElement | null>(null);
	let previewCanvas = $state.raw<HTMLCanvasElement | null>(null);
	let photoEl = $state.raw<HTMLButtonElement | null>(null);

	let draggingCorner = -1;
	let regionStart: Point | null = null;
	/** A drag that ended on the picture must not also count as a corner click. */
	let suppressClick = false;

	/**
	 * The engine takes one request at a time (`InverseWorker.request` refuses a
	 * second), and the dialog has two callers racing — corner detection and the
	 * debounced preview. Chaining them is simpler than a busy flag each has to
	 * remember to check, and it keeps the order the visitor asked for.
	 */
	let chain: Promise<unknown> = Promise.resolve();

	function queue<T>(work: () => Promise<T>): Promise<T> {
		const next = chain.then(work, work);
		chain = next.catch(() => undefined);
		return next;
	}

	/** Bumped by every scheduled preview, so a late answer to an old question is dropped. */
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
		if (!canvas || !mask) return;
		const ratio = window.devicePixelRatio || 1;
		canvas.width = Math.round(PREVIEW_SIZE * ratio);
		canvas.height = Math.round(PREVIEW_SIZE * ratio);
		const ctx = canvas.getContext('2d');
		if (!ctx) return;
		ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
		drawHeart(ctx, mask, colours, PREVIEW_SIZE);
	});

	function reset(): void {
		if (previewTimer) clearTimeout(previewTimer);
		previewTimer = null;
		generation++;
		if (decoded) URL.revokeObjectURL(decoded.url);
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
		previewFailed = false;
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
		cornerStatus = 'searching';
		previewMask = null;
		previewFailed = false;
		const refine = quad.length === 4 && isConvexQuad(quad);
		const roi = region ?? undefined;
		const corners = quad.map((p) => [...p] as Point);
		try {
			const crops = await queue(() =>
				refine ? refineCorners({ ...source, quad: corners }) : detectCorners(source, roi)
			);
			const candidate = crops.candidates[0];
			if (candidate) useCandidate(candidate);
			else if (squarePicture && !refine) useWholePicture();
			else {
				quad = [];
				outline = [];
				cropMode = 'quad';
				cropTool = 'corners';
				cornerStatus = 'none';
			}
		} catch {
			cornerStatus = 'none';
		}
	}

	function useCandidate(candidate: CropProposal): void {
		quad = candidate.quad.map((p) => [...p] as Point);
		outline = candidate.outline;
		cropMode = 'quad';
		cropTool = 'corners';
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
		previewMask = null;
	}

	function selectRegion(): void {
		cropMode = 'quad';
		cropTool = 'region';
		region = null;
		previewMask = null;
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
		const paper = toHexColors(colours, DEFAULT_COLORS_HEX);
		// The engine refuses two identical paper colours, and the site's swatches
		// can be set to the same colour; the defaults stand in so the preview still
		// says something rather than failing at the visitor.
		const pair: [string, string] =
			paper.left.toLowerCase() === paper.right.toLowerCase()
				? [DEFAULT_COLORS_HEX.right, DEFAULT_COLORS_HEX.left]
				: [paper.right, paper.left];
		return { mode, swatches: [swatchRight, swatchLeft], invert, paperColors: pair };
	}

	function schedulePreview(): void {
		previewMask = null;
		previewFound = null;
		previewFailed = false;
		if (previewTimer) clearTimeout(previewTimer);
		previewTimer = null;
		if (!payload()) return;
		previewBusy = true;
		previewTimer = setTimeout(runPreview, PREVIEW_DEBOUNCE_MS);
	}

	async function runPreview(): Promise<void> {
		const source = payload();
		if (!source) {
			previewBusy = false;
			return;
		}
		const mine = ++generation;
		try {
			const prepared = await queue(() => prepareImage(source, importSettings()));
			if (mine !== generation) return;
			const mask = maskFromPrepared(prepared);
			previewMask = mask;
			previewFound = detectSymmetry(mask);
		} catch {
			if (mine !== generation) return;
			previewFailed = true;
		} finally {
			if (mine === generation) previewBusy = false;
		}
	}

	function use(): void {
		if (!previewMask) return;
		// Spread rather than hand the store a rune proxy of our own state.
		onUse(previewMask, { ...(previewFound ?? NO_SYMMETRY) });
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
		const rect = event.currentTarget.getBoundingClientRect();
		const radius = (GRAB_RADIUS * (decoded?.pixels?.width ?? 0)) / rect.width;
		draggingCorner = quad.findIndex((c) => Math.hypot(c[0] - p[0], c[1] - p[1]) <= radius);
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
		outline = [];
		cornerStatus = 'uncertain';
		schedulePreview();
	}

	function endDrag(event: PointerEvent): void {
		draggingCorner = -1;
		if (!regionStart) return;
		regionStart = null;
		if (event.type === 'pointercancel') {
			region = null;
			return;
		}
		// A stray click is not an area. Below this the drawn box is noise, and
		// searching inside it would only find nothing.
		const drawn = region;
		if (drawn && drawn[2]! - drawn[0]! >= 24 && drawn[3]! - drawn[1]! >= 24) {
			quad = [];
			outline = [];
			cropTool = 'corners';
			void findCorners();
		}
	}

	function clickPicture(event: MouseEvent): void {
		if (cropMode !== 'quad' || cropTool !== 'corners') return;
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
		cornerStatus = isConvexQuad(quad) ? 'found' : 'none';
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
			default:
				return '';
		}
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
					<button
						type="button"
						class="photo"
						class:region-tool={cropTool === 'region'}
						bind:this={photoEl}
						onclick={clickPicture}
						onpointerdown={startDrag}
						onpointermove={moveDrag}
						onpointerup={endDrag}
						onpointercancel={endDrag}
						aria-label={tr('paintCorners')}
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
								<span
									class="corner"
									style:left="{(100 * p[0]) / decoded.pixels.width}%"
									style:top="{(100 * p[1]) / decoded.pixels.height}%"
									aria-hidden="true">{i + 1}</span
								>
							{/each}
						{/if}
					</button>

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
								aria-pressed={cropTool === 'region'}
								onclick={selectRegion}>{tr('paintCornersRegion')}</button
							>
							<button
								type="button"
								class="btn btn-sm btn-ghost"
								aria-pressed={cropMode === 'quad' && cropTool === 'corners' && !!quad.length}
								onclick={setCornersManually}>{tr('paintCornersSetSelf')}</button
							>
							{#if squarePicture}
								<button
									type="button"
									class="btn btn-sm btn-ghost"
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
						<span>{tr('swapColors')}</span>
					</label>

					<h3 class="panel-title">{tr('paintPreview')}</h3>
					<div class="preview">
						{#if previewMask}
							<!-- The name goes on the wrapper: a <canvas> is an interactive
							     element to the accessibility tree, and cannot take role="img". -->
							<div class="heart" role="img" aria-label={tr('paintPreviewAlt')}>
								<canvas
									bind:this={previewCanvas}
									style:width="{PREVIEW_SIZE}px"
									style:height="{PREVIEW_SIZE}px"
									aria-hidden="true"
								></canvas>
							</div>
						{:else}
							<div class="placeholder" role="status">
								{#if previewBusy}{tr('paintPreviewWorking')}{:else if previewFailed}{tr(
										'paintPreviewFailed'
									)}{/if}
							</div>
						{/if}
					</div>
					{#if previewMask}
						<p class="hint">{symmetryText}</p>
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

	/* The picture is a button so that clicking it to set a corner is a real
	   control; it carries none of a button's looks. */
	.photo {
		position: relative;
		display: block;
		width: 100%;
		padding: 0;
		border: 1px solid var(--line);
		border-radius: 10px;
		background: var(--cream2);
		overflow: hidden;
		cursor: crosshair;
		touch-action: none;
		user-select: none;
	}

	.photo.region-tool {
		cursor: cell;
	}

	.photo img {
		display: block;
		width: 100%;
		height: auto;
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

	.corner {
		position: absolute;
		display: grid;
		place-items: center;
		width: 24px;
		height: 24px;
		transform: translate(-50%, -50%);
		border: 2px solid var(--white);
		border-radius: 50%;
		background: var(--green);
		color: var(--white);
		font-size: 12px;
		font-weight: 600;
		pointer-events: none;
	}

	.corner-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}

	.corner-actions .btn[aria-pressed='true'] {
		background: var(--green);
		border-color: var(--green);
		color: var(--white);
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
