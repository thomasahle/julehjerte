<!--
  Mal — the paint page (docs/redesign/PAINT.md §1 and §2).

  The visitor paints a two-colour picture of the woven square and the local
  inverse engine looks for the cuts that weave it. The page itself holds no
  drawing: the mask, the symmetry rows and the found heart live in the editor
  session ($lib/editor/session.svelte.ts), so that switching to Tegn and back is
  ordinary navigation and loses nothing.

  Both routes render this component; everything that differs between them is the
  `lang` prop and the route table.
-->
<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import CanvasBackdrop from '$lib/components/editor/CanvasBackdrop.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import PaperHeartSVG from '$lib/components/PaperHeartSVG.svelte';
	import { TooltipProvider } from '$lib/components/ui/tooltip';
	import {
		ChevronRightIcon,
		CloseIcon,
		DownloadIcon,
		HelpIcon,
		SaveIcon,
		StarIcon
	} from '$lib/components/icons';
	import MaskCanvas from './MaskCanvas.svelte';
	import MaskToolPanel from './MaskToolPanel.svelte';
	import FindCutsPanel from './FindCutsPanel.svelte';
	import ImportImageDialog from './ImportImageDialog.svelte';
	import { SITE_TITLE, SITE_TITLE_EN } from '$lib/config';
	import { t, tArray, type Language } from '$lib/i18n';
	import { editorHref, homeAnchorHref } from '$lib/i18n/routes';
	import { NARROW_QUERY } from '$lib/breakpoints';
	import { readPanelCollapsed, writePanelCollapsed } from '$lib/editor/panelState';
	import {
		clearMask,
		handoffToDraw,
		markMaskDirty,
		session,
		setMask,
		setSymmetry,
		type PaintError,
		type SymmetrySettings
	} from '$lib/editor/session.svelte';
	import { createMask, isEmpty, maskMismatch, resample, type Mask } from '$lib/paint/mask';
	import { detectSymmetry } from '$lib/paint/symmetry';
	import { rasterizeDesign } from '$lib/paint/rasterize';
	import {
		canRedo as historyCanRedo,
		canUndo as historyCanUndo,
		createHistory,
		record,
		redo as historyRedo,
		resetHistory,
		undo as historyUndo,
		type MaskStep
	} from '$lib/paint/history';
	import {
		BRUSH_RADII,
		stepBrush,
		type BrushSize,
		type PaintAction,
		type PaintTool
	} from '$lib/paint/toolset';
	import { decodeImageFile, maskFromPrepared, type DecodedImage } from '$lib/paint/importImage';
	import {
		cancel as cancelEngine,
		defaultAdvanced,
		findCuts,
		paperPair,
		prepareImage,
		prepareMask,
		type AdvancedSettings
	} from '$lib/inverse/engine';
	import { EngineError, searchTimedOut } from '$lib/inverse/client';
	import { convertValidatedCutGeometry, CutGeometryError } from '$lib/inverse/toHeartDesign';
	import { DEFAULT_COLORS, DEFAULT_COLORS_HEX, getColors, subscribeColors } from '$lib/stores/colors';
	import { saveUserDesign } from '$lib/stores/collection';
	import { toHexColors } from '$lib/utils/heartColors';
	import { makeHeartAnchorId } from '$lib/utils/heartAnchors';
	import type { HeartColors } from '$lib/types/heart';

	interface Props {
		lang: Language;
	}

	let { lang }: Props = $props();

	/** The grid the difference from the mask is measured on (PAINT.md §2). */
	const COMPARE_SIZE = 200;

	let colors = $state<HeartColors>({ ...DEFAULT_COLORS });
	let headerEl = $state.raw<HTMLElement | null>(null);
	let pageEl = $state.raw<HTMLDivElement | null>(null);
	let helpButtonEl = $state.raw<HTMLButtonElement | null>(null);

	let tool = $state<PaintTool>('pen');
	let brushSize = $state<BrushSize>('medium');
	let paintValue = $state<0 | 1>(1);
	let panelCollapsed = $state(false);
	/**
	 * Below 900px the page stacks: the heart, then the two panels under it. They
	 * float over the canvas above that, and a floating panel cannot simply become
	 * a flowing one — it lives inside the canvas box, which is a fixed height with
	 * its overflow hidden. So the two layouts render the same two snippets in two
	 * different places, as the editor route does. Read after mount, so the server
	 * and the first client render agree.
	 */
	let isNarrow = $state(false);
	let showHelp = $state(false);
	let showImport = $state(false);
	let showingResult = $state(false);
	let advanced = $state<AdvancedSettings>(defaultAdvanced(session.symmetry));

	/** Bumped whenever the mask changed other than by a stroke; the canvas watches it. */
	let revision = $state(0);
	/**
	 * Bumped when a stroke ends. The mask's cells are a raw Uint8Array, so nothing
	 * that reads them can see a stroke on its own — and whether the mask is empty
	 * decides both Ryd and Find snit. The canvas does not watch this: it has
	 * already drawn the stroke that caused it.
	 */
	let strokes = $state(0);
	let canUndo = $state(false);
	let canRedo = $state(false);
	const history = createHistory();

	let stage = $state('');
	let elapsed = $state(0);
	let timer: ReturnType<typeof setInterval> | null = null;
	/** The rows the converter could hold the last heart to (PAINT.md §11). */
	let honoured = $state<SymmetrySettings | null>(null);

	/** A destructive step waiting for the visitor to say yes. */
	let confirming = $state<'clear' | 'import' | null>(null);
	let pendingImport: { mask: Mask; found: SymmetrySettings; source: string } | null = null;

	/** Something that went wrong outside the search: a save, a PDF, the example. */
	let notice = $state<string | null>(null);

	let maskEmpty = $derived.by(() => {
		void revision;
		void strokes;
		return !session.mask || isEmpty(session.mask);
	});
	let busy = $derived(session.status === 'searching' || session.status === 'importing');
	/**
	 * A dialog is on screen, so it owns the keyboard.
	 *
	 * The canvas listens on the window, and `Modal` stops nothing but Escape, so
	 * the paint shortcuts have to stand down themselves: P and X would otherwise
	 * change the tool behind the scrim, and Cmd/Ctrl+Z would undo the very mask the
	 * Ryd or Erstat dialog is asking about. Pointer input is a separate question —
	 * `disabled` answers that one — so this gates only the keys.
	 */
	let dialogOpen = $derived(showHelp || showImport || confirming !== null);
	/**
	 * The found heart is on screen, so there is no mask under the pointer and the
	 * left column can do nothing at all. It used to stay bright and clickable and
	 * simply not work, which read as a page that had stopped responding. Not the
	 * same thing as `busy`: a search leaves the mask on screen and the panel merely
	 * out of reach for a minute.
	 */
	let toolsStandby = $derived(showingResult);
	let heading = $derived(t('paintPageTitle', lang));

	onMount(() => {
		const narrow = window.matchMedia(NARROW_QUERY);
		const syncNarrow = () => (isNarrow = narrow.matches);
		syncNarrow();
		narrow.addEventListener('change', syncNarrow);

		colors = getColors();
		const unsubscribe = subscribeColors((next) => (colors = next));
		panelCollapsed = readPanelCollapsed();
		// Coming back from Tegn: the session still holds the heart Find snit found,
		// so the page opens where it was left rather than on a mask the visitor has
		// already moved past.
		showingResult = session.status === 'done' && !!session.result;
		// The page always has a mask to paint on: the empty state is an empty mask,
		// not the absence of one, so the heart is on screen from the first frame.
		if (!session.mask) setMask(createMask(0));
		measureHeader();
		return () => {
			narrow.removeEventListener('change', syncNarrow);
			unsubscribe();
			stopTimer();
			// Leaving the page must not leave a worker solving in the background.
			cancelEngine();
		};
	});

	/** The canvas fills the viewport under the bar, so the bar's height is a variable. */
	function measureHeader(): void {
		void tick().then(() => {
			if (!headerEl || !pageEl) return;
			const height = headerEl.getBoundingClientRect().height;
			pageEl.style.setProperty('--paint-header-height', `${Math.round(height)}px`);
		});
	}

	function syncHistoryFlags(): void {
		canUndo = historyCanUndo(history);
		canRedo = historyCanRedo(history);
	}

	// ---------------------------------------------------------------- painting

	/**
	 * The mask and the rows it is folded under, which is one state and not two:
	 * painting under symmetry assumes the mask already matches the rows that are
	 * on, so an undo step has to put both back together.
	 */
	function currentStep(): MaskStep | null {
		return session.mask ? { mask: session.mask, symmetry: session.symmetry } : null;
	}

	function onEditStart(): void {
		const step = currentStep();
		if (!step) return;
		record(history, step);
		syncHistoryFlags();
	}

	function onEditEnd(): void {
		markMaskDirty();
		strokes++;
		// A new stroke is a new picture: whatever heart was found describes the
		// mask as it was, so the page goes back to the mask.
		backToMask();
	}

	/**
	 * Leave the found heart and go back to the mask — the button, the card's link,
	 * and the first stroke after a search.
	 *
	 * `session.result` stays, so Download PDF and Gem keep working on the heart
	 * that was found (PAINT.md §1); only `status` goes back, because the search is
	 * over and the panel has to offer Find snit again. Without that, coming back to
	 * the page later would open on a result the visitor had already left behind.
	 */
	function backToMask(): void {
		showingResult = false;
		if (session.status === 'done') session.status = 'idle';
	}

	/**
	 * Put a step back — the cells and the rows at once.
	 *
	 * Assigned rather than passed to `setMask` or `setSymmetry`: this is the same
	 * mask coming back, not a new one, so its source, its "fundet" tags and the
	 * heart it produced all still describe it — and it was already folded under
	 * these very rows when the step was taken, so folding it again would at best
	 * do nothing and at worst fold it under the rows we are leaving behind.
	 */
	function restore(step: MaskStep): void {
		// The checkbox follows Mellem lapper, as it does when the row is switched by
		// hand — but only when the row actually moves, so undoing a stroke cannot
		// quietly re-tick a box the visitor unticked.
		if (step.symmetry.lobes !== session.symmetry.lobes) {
			advanced = { ...advanced, matchingSheets: step.symmetry.lobes === 'sym' };
		}
		session.mask = step.mask;
		session.symmetry = { ...step.symmetry };
		revision++;
		syncHistoryFlags();
	}

	function undo(): void {
		const step = currentStep();
		if (!step) return;
		const previous = historyUndo(history, step);
		if (previous) restore(previous);
	}

	function redo(): void {
		const step = currentStep();
		if (!step) return;
		const next = historyRedo(history, step);
		if (next) restore(next);
	}

	function onShortcut(action: PaintAction): void {
		if (action.kind === 'tool') tool = action.tool;
		else if (action.kind === 'swapColour') paintValue = paintValue ? 0 : 1;
		else if (action.kind === 'undo') undo();
		else if (action.kind === 'redo') redo();
		else if (action.kind === 'brush') brushSize = stepBrush(brushSize, action.delta);
	}

	function changeSymmetry(next: SymmetrySettings): void {
		// Switching a row on folds the mask, which is an edit the visitor may want
		// back — so it goes on the undo stack like any other, with the rows it was
		// folded under, which are the ones still in force at this line.
		const step = currentStep();
		if (step) {
			record(history, step);
			syncHistoryFlags();
		}
		setSymmetry(next);
		advanced = { ...advanced, matchingSheets: next.lobes === 'sym' };
		revision++;
	}

	// -------------------------------------------------------- replacing the mask

	function askToClear(): void {
		if (maskEmpty) return;
		confirming = 'clear';
	}

	function doClear(): void {
		confirming = null;
		clearMask();
		resetHistory(history);
		syncHistoryFlags();
		showingResult = false;
		revision++;
	}

	function useMask(mask: Mask, found: SymmetrySettings, source: string): void {
		setMask(mask, { sourceName: source, symmetry: found, found });
		// The rows arrived with the picture, so the checkbox that follows Mellem
		// lapper follows them too.
		advanced = { ...advanced, matchingSheets: found.lobes === 'sym' };
		resetHistory(history);
		syncHistoryFlags();
		showingResult = false;
		honoured = null;
		revision++;
	}

	/** The dialog's answer. A mask with unsaved strokes is confirmed away first. */
	function onImported(mask: Mask, found: SymmetrySettings, source = 'image'): void {
		if (session.maskDirty && !maskEmpty) {
			pendingImport = { mask, found, source };
			confirming = 'import';
			return;
		}
		useMask(mask, found, source);
	}

	function confirmImport(): void {
		confirming = null;
		if (!pendingImport) return;
		useMask(pendingImport.mask, pendingImport.found, pendingImport.source);
		pendingImport = null;
	}

	/**
	 * "Prøv stjernen": the example picture, through the very path the import
	 * dialog uses, so the two cannot behave differently.
	 */
	async function tryStar(): Promise<void> {
		if (busy) return;
		session.status = 'importing';
		notice = null;
		let decoded: DecodedImage | null = null;
		try {
			const response = await fetch(`${base}/inverse/examples/star.png`);
			if (!response.ok) throw new Error(`star.png: ${response.status}`);
			const blob = await response.blob();
			decoded = await decodeImageFile(new File([blob], 'star.png', { type: 'image/png' }));
			// The example is square, so the whole picture is the woven square: no
			// quad, and the colour reading left to the engine, exactly as the dialog
			// does for a square picture taken whole.
			const prepared = await prepareImage(decoded.input, { paperColors: paperPair(colors) });
			const mask = maskFromPrepared(prepared);
			session.status = 'idle';
			onImported(mask, detectSymmetry(mask), 'star.png');
		} catch (err) {
			console.error('Loading the star example failed', err);
			session.status = 'idle';
			notice = t('paintImportFailed', lang);
		} finally {
			// The decoder hands back an object URL for showing the picture, which
			// this path never shows; releasing it is the caller's job either way.
			if (decoded) URL.revokeObjectURL(decoded.url);
		}
	}

	// ------------------------------------------------------------- find the cuts

	function startTimer(): void {
		stopTimer();
		const began = performance.now();
		elapsed = 0;
		timer = setInterval(() => (elapsed = Math.floor((performance.now() - began) / 1000)), 1000);
	}

	function stopTimer(): void {
		if (timer) clearInterval(timer);
		timer = null;
	}

	function classify(err: unknown): PaintError {
		if (err instanceof CutGeometryError) return { kind: 'noSolution', detail: err.key };
		if (err instanceof EngineError) {
			if (searchTimedOut(err.report)) return { kind: 'timeout' };
			// A solve that failed says why in its report; a worker that never loaded
			// has none, and that is a different thing to tell the visitor.
			return err.report ? { kind: 'noSolution', detail: err.message } : { kind: 'engine' };
		}
		return { kind: 'engine', detail: err instanceof Error ? err.message : String(err) };
	}

	async function find(): Promise<void> {
		const mask = session.mask;
		if (!mask || maskEmpty || busy) return;
		notice = null;
		session.error = null;
		session.status = 'searching';
		stage = 'preprocessing';
		startTimer();
		try {
			// The target itself has to be symmetric, or the search spends its time
			// proving away a difference the visitor cannot see (PAINT.md §5).
			setSymmetry(session.symmetry);
			revision++;

			await prepareMask(mask, colors, (next) => (stage = next));
			const solved = await findCuts(
				{
					colors,
					symmetry: session.symmetry,
					widthMm: advanced.widthMm,
					minWidthMm: advanced.minWidthMm,
					matchingSheets: advanced.matchingSheets
				},
				(next) => (stage = next)
			);

			const geometry = solved.files['cut_geometry.json'];
			if (!geometry) {
				throw new CutGeometryError('paintErrorGeometrySchema', 'The engine returned no geometry.');
			}
			const converted = convertValidatedCutGeometry(geometry, {
				name: session.sourceName ? t('paintHeartFromImage', lang) : t('paintHeartFromMask', lang),
				colors: toHexColors(colors, DEFAULT_COLORS_HEX),
				enforce: session.symmetry
			});

			// The difference the panel reports is measured on the heart about to be
			// shown, not on the engine's own number: that one describes the solution
			// before simplifying and before the symmetry correction moved it.
			const mismatch = maskMismatch(
				rasterizeDesign(converted.design, COMPARE_SIZE).data,
				resample(mask.data, mask.size, COMPARE_SIZE)
			);

			// The rows the panel shows are the converter's, not `solved.report.symmetry.
			// honoured` (PAINT.md §11). Both are true statements about different
			// things: the engine's says which symmetries its own cuts came out with,
			// the converter's says which ones the heart on screen has. Where the
			// engine could not hold one and correcting it was cheap, the heart does
			// have it — and it is the heart the visitor is looking at. Where the
			// correction was too expensive the converter drops every row and the
			// panel says so, which is the same notice the engine's report would ask
			// for. The engine's own answer goes to the console, because a search that
			// surprises someone is diagnosed from what the fitter managed.
			const asked = solved.report.symmetry;
			if (asked && asked.honoured.length < asked.requested.length) {
				console.warn('The engine could not hold every symmetry that was asked of it', asked);
			}
			honoured = converted.honoured;
			session.result = {
				design: { ...converted.design, id: newHeartId() },
				report: {
					cuts: [solved.report.slits.left, solved.report.slits.right],
					clearanceMm: solved.report.validation.minimumInterSlitDistanceLower,
					mismatch,
					identical: solved.report.solver.matchingPreference?.identical ?? false
				}
			};
			session.status = 'done';
			showingResult = true;
		} catch (err) {
			if (err instanceof DOMException && err.name === 'AbortError') {
				// Afbryd, or leaving the page: not a failure to report.
				session.status = 'idle';
				return;
			}
			console.error('Find snit failed', err);
			session.error = classify(err);
			session.status = 'failed';
		} finally {
			stopTimer();
		}
	}

	function abort(): void {
		cancelEngine();
		stopTimer();
		session.status = 'idle';
	}

	function newHeartId(): string {
		return `heart-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
	}

	// ------------------------------------------------------------- the top bar

	function openInDraw(): void {
		const design = session.result?.design;
		if (!design) return;
		handoffToDraw(design);
		void goto(editorHref(lang, '?from=session'));
	}

	async function downloadPdf(): Promise<void> {
		const design = session.result?.design;
		if (!design) return;
		try {
			const { downloadPDF } = await import('$lib/pdf/template');
			await downloadPDF(design, { lang });
		} catch (err) {
			console.error('Generating the PDF failed', err);
			notice = t('pdfFailed', lang);
		}
	}

	function save(): void {
		const design = session.result?.design;
		if (!design) return;
		try {
			saveUserDesign(design);
		} catch (err) {
			console.error('Saving the heart failed', err);
			notice = t('saveFailed', lang);
			return;
		}
		void goto(homeAnchorHref(makeHeartAnchorId(design.id), lang));
	}

	function closeHelp(): void {
		showHelp = false;
		void tick().then(() => helpButtonEl?.focus());
	}

	function setPanelCollapsed(next: boolean): void {
		panelCollapsed = next;
		writePanelCollapsed(next);
	}
</script>

<svelte:head>
	<title>{heading} - {lang === 'en' ? SITE_TITLE_EN : SITE_TITLE}</title>
</svelte:head>

<div class="paint" bind:this={pageEl}>
	<PageHeader bind:ref={headerEl} {lang} variant="editor" mode={{ current: 'paint' }}>
		<button
			type="button"
			class="btn btn-sm btn-ghost btn-icon icon-button"
			bind:this={helpButtonEl}
			onclick={() => (showHelp = true)}
			aria-haspopup="dialog"
			aria-expanded={showHelp}
			aria-label={t('helpOpenAriaLabel', lang)}
		>
			<HelpIcon size={20} />
		</button>
		<!-- aria-disabled, not `disabled`: a disabled button takes no focus, so the
		     "Find snit først" that explains it was mouse-only and unannounced. Both
		     handlers already do nothing without a heart (GalleryToolbar.svelte and
		     DESIGN.md §3 took the same decision for the same reason). -->
		<button
			type="button"
			class="btn btn-sm btn-primary top-action"
			onclick={downloadPdf}
			aria-disabled={!session.result}
			aria-describedby={session.result ? undefined : 'paint-needs-heart'}
			title={session.result ? t('editorDownloadPdf', lang) : t('paintNeedsHeart', lang)}
			aria-label={t('editorDownloadPdf', lang)}
		>
			<DownloadIcon size={18} />
			<span class="top-action-label">{t('editorDownloadPdf', lang)}</span>
		</button>
		<button
			type="button"
			class="btn btn-sm btn-dark top-action"
			onclick={save}
			aria-disabled={!session.result}
			aria-describedby={session.result ? undefined : 'paint-needs-heart'}
			title={session.result ? t('saveToMyHearts', lang) : t('paintNeedsHeart', lang)}
			aria-label={t('saveToMyHearts', lang)}
		>
			<SaveIcon size={18} />
			<span class="top-action-label">{t('editorSave', lang)}</span>
		</button>
		{#if !session.result}
			<span id="paint-needs-heart" class="sr-only">{t('paintNeedsHeart', lang)}</span>
		{/if}
	</PageHeader>

	<main id="main-content" tabindex="-1">
		<h1 class="sr-only">{heading}</h1>
		<TooltipProvider delayDuration={250}>
			<div class="paint-top" class:panel-collapsed={panelCollapsed}>
				<CanvasBackdrop />

				<div class="stage">
					{#if showingResult && session.result}
						<div class="result">
							<PaperHeartSVG
								readonly
								idPrefix="paint-result"
								initialFingers={session.result.design.fingers}
								initialGridSize={session.result.design.gridSize}
								initialWeaveParity={session.result.design.weaveParity ?? 0}
								colors={session.result.design.colors}
								size={520}
							/>
						</div>
						<!-- The whole card is the way back: it used to carry a "Ret masken"
						     link of its own next to the panel's "Tilbage til masken", which
						     read as two different steps and is one. -->
						<button type="button" class="mask-card" onclick={backToMask}>
							<span class="mask-card-canvas">
								<MaskCanvas
									{lang}
									mask={session.mask}
									{colors}
									symmetry={session.symmetry}
									{tool}
									brush={BRUSH_RADII[brushSize]}
									{paintValue}
									{revision}
									disabled
									onEditStart={() => {}}
									onEditEnd={() => {}}
									onShortcut={() => {}}
								/>
							</span>
							<span class="mask-card-label">{t('paintBackToMask', lang)}</span>
						</button>
					{:else}
						<MaskCanvas
							{lang}
							mask={session.mask}
							{colors}
							symmetry={session.symmetry}
							{tool}
							brush={BRUSH_RADII[brushSize]}
							{paintValue}
							{revision}
							disabled={busy}
							keyboardBusy={dialogOpen}
							{onEditStart}
							{onEditEnd}
							{onShortcut}
						/>
						{#if maskEmpty}
							<div class="empty-card">
								<p>{t('paintEmptyHint', lang)}</p>
								<div class="empty-actions">
									<button
										type="button"
										class="btn btn-sm btn-outline"
										onclick={() => (showImport = true)}
										disabled={busy}
									>
										{t('paintImportImage', lang)}
									</button>
									<button
										type="button"
										class="btn btn-sm btn-ghost"
										onclick={tryStar}
										disabled={busy}
									>
										<StarIcon size={16} />
										{t('paintTryStar', lang)}
									</button>
								</div>
							</div>
						{/if}
					{/if}

					<p class="canvas-pill">
						<strong>{t('paintMaskPill', lang, { size: session.mask?.size ?? 400 })}</strong>
						<span>{t('paintCanvasHint', lang)}</span>
					</p>

					{#if notice}
						<p class="canvas-notice" role="alert">
							{notice}
							<button
								type="button"
								class="notice-dismiss"
								onclick={() => (notice = null)}
								aria-label={t('dismissMessage', lang)}
							>
								<CloseIcon size={14} />
							</button>
						</p>
					{/if}
				</div>

				{#if !isNarrow}
					<div class="left-panel">{@render toolPanel()}</div>
					<div class="right-panel" class:collapsed={panelCollapsed} id="paint-panel">
						<div class="panel-collapse">
							<button
								type="button"
								class="panel-button"
								aria-expanded={!panelCollapsed}
								aria-controls="paint-panel"
								onclick={() => setPanelCollapsed(true)}
							>
								{t('editorHidePanel', lang)}
								<ChevronRightIcon size={14} />
							</button>
						</div>
						{@render cutsPanel()}
					</div>

					{#if panelCollapsed}
						<button
							type="button"
							class="panel-tab"
							aria-expanded={false}
							aria-controls="paint-panel"
							onclick={() => setPanelCollapsed(false)}
						>
							<ChevronRightIcon size={14} />
							<span>{t('editorShowPanel', lang)}</span>
						</button>
					{/if}
				{/if}
			</div>

			{#if isNarrow}
				<aside class="sidebar">
					{@render toolPanel()}
					{@render cutsPanel()}
				</aside>
			{/if}
		</TooltipProvider>
	</main>

	<!-- The two panels, authored once and rendered either floating over the canvas
	     or stacked under it. -->
	{#snippet toolPanel()}
					<!-- While the found heart is on screen there is no mask to paint on, so
					     the whole column stands down: aria-disabled says so to a screen
					     reader in one place rather than control by control, the muting says
					     it on screen, and every control inside is really disabled so a click
					     that gets through still does nothing. "Tilbage til masken" — the
					     panel's button or the card — brings it back. -->
					<div
						class="tool-panel"
						class:standby={toolsStandby}
						aria-disabled={toolsStandby ? 'true' : undefined}
					>
						<MaskToolPanel
							{lang}
							{tool}
							onTool={(next) => (tool = next)}
							{brushSize}
							onBrushSize={(next) => (brushSize = next)}
							{paintValue}
							onPaintValue={(next) => (paintValue = next)}
							{colors}
							{canUndo}
							{canRedo}
							onUndo={undo}
							onRedo={redo}
							onImport={() => (showImport = true)}
							onClear={askToClear}
							clearDisabled={maskEmpty}
							disabled={busy || showingResult}
						/>
					</div>
	{/snippet}

	{#snippet cutsPanel()}
					<FindCutsPanel
						{lang}
						symmetry={session.symmetry}
						onSymmetry={changeSymmetry}
						found={session.found}
						status={session.status}
						error={session.error}
						result={session.result}
						{showingResult}
						{honoured}
						{elapsed}
						{stage}
						{advanced}
						onAdvanced={(next) => (advanced = next)}
						onResetAdvanced={() => (advanced = defaultAdvanced(session.symmetry))}
						canFind={!maskEmpty && !busy}
						onFind={find}
						onCancel={abort}
						onOpenInDraw={openInDraw}
						onBackToMask={backToMask}
					/>
	{/snippet}

	<ImportImageDialog
		{lang}
		open={showImport}
		onClose={() => (showImport = false)}
		onUse={(mask, found) => onImported(mask, found)}
	/>

	<Modal
		open={confirming !== null}
		labelledBy="paint-confirm-title"
		onClose={() => (confirming = null)}
	>
		<h2 id="paint-confirm-title" class="confirm-title">
			{t(confirming === 'import' ? 'paintReplaceTitle' : 'paintClearTitle', lang)}
		</h2>
		<p class="confirm-text">
			{t(confirming === 'import' ? 'paintReplacePrompt' : 'paintClearPrompt', lang)}
		</p>
		<div class="confirm-actions">
			<button type="button" class="btn btn-sm btn-ghost" onclick={() => (confirming = null)}>
				{t('paintCancelAction', lang)}
			</button>
			<button
				type="button"
				class="btn btn-sm btn-primary"
				onclick={confirming === 'import' ? confirmImport : doClear}
			>
				{t(confirming === 'import' ? 'paintReplaceConfirm' : 'paintClearConfirm', lang)}
			</button>
		</div>
	</Modal>

	<Modal open={showHelp} labelledBy="paint-help-title" width="min(640px, 100%)" column onClose={closeHelp}>
		<div class="help-header">
			<h2 id="paint-help-title">{t('paintHelpTitle', lang)}</h2>
			<button
				type="button"
				class="btn btn-sm btn-ghost btn-icon"
				onclick={closeHelp}
				aria-label={t('helpCloseAriaLabel', lang)}
			>
				<CloseIcon size={20} />
			</button>
		</div>
		<p class="help-intro">{t('paintHelpIntro', lang)}</p>
		<ul class="help-list">
			{#each tArray('paintHelpBullets', lang) as item, i (i)}
				<li>{item}</li>
			{/each}
		</ul>
	</Modal>
</div>

<style>
	.paint {
		position: relative;
		z-index: 1;
		background: var(--page);
		--paint-header-height: var(--nav-height);
	}

	/* position: relative so <CanvasBackdrop> fills exactly the canvas area. */
	.paint-top {
		position: relative;
		height: calc(100dvh - var(--paint-header-height));
		min-height: 420px;
		overflow: hidden;
	}

	/* The band the heart is fitted into: the canvas less whatever the two
	   floating columns take. */
	.stage {
		position: absolute;
		inset: 0;
	}

	.icon-button {
		flex: none;
		background: var(--white);
	}

	/* `.btn`'s own hover rules exempt `:disabled` alone, and these two are
	   aria-disabled so their hint stays reachable — so the hover that would say
	   "press me" has to be turned off here instead. */
	.top-action[aria-disabled='true']:hover {
		background: var(--red);
		border-color: var(--red);
	}

	.btn-dark.top-action[aria-disabled='true']:hover {
		background: var(--green);
		border-color: var(--green);
	}

	.left-panel {
		position: absolute;
		left: 16px;
		top: 50%;
		transform: translateY(-50%);
		width: 300px;
		z-index: 26;
	}

	/* The tool column standing down while the found heart is on screen. Every
	   control inside is disabled for real, which is what mutes them — the heading
	   is the one thing left that would still read as live, so it goes quiet too.
	   No opacity on the wrapper: it would multiply with the controls' own and
	   leave the panel too faint to read at all. */
	.tool-panel.standby :global(.panel-title) {
		color: var(--muted);
	}

	.right-panel {
		position: absolute;
		top: 4px;
		bottom: 4px;
		right: 8px;
		width: 372px;
		padding: 16px;
		box-sizing: border-box;
		display: flex;
		flex-direction: column;
		gap: 14px;
		overflow-y: auto;
		overscroll-behavior: contain;
		scrollbar-width: thin;
		z-index: 26;
	}

	.right-panel.collapsed {
		display: none;
	}

	.left-panel :global(.editor-panel),
	.right-panel :global(.editor-panel) {
		box-shadow: var(--shadow-panel);
	}

	.panel-collapse {
		display: flex;
		justify-content: flex-end;
	}

	/* Small pill button, the same one Tegn's panel uses. */
	.panel-button {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 8px 12px;
		border: 1.5px solid var(--line);
		border-radius: 8px;
		background: var(--white);
		color: var(--green);
		font-family: inherit;
		font-size: 13px;
		font-weight: 600;
		line-height: 1;
		cursor: pointer;
	}

	.panel-button:hover {
		background: var(--cream2);
	}

	.panel-tab {
		position: absolute;
		right: 0;
		top: 50%;
		transform: translateY(-50%);
		display: inline-flex;
		flex-direction: column;
		align-items: center;
		gap: 8px;
		padding: 16px 7px;
		border: 1.5px solid var(--line);
		border-right: none;
		border-radius: 10px 0 0 10px;
		background: var(--white);
		color: var(--green);
		font-family: inherit;
		font-size: 13px;
		font-weight: 600;
		cursor: pointer;
		z-index: 26;
	}

	.panel-tab span {
		writing-mode: vertical-rl;
	}

	.panel-tab :global(svg) {
		transform: rotate(180deg);
	}

	/* Canvas chrome. All of it sits on a picture, so all of it carries the same
	   white pill the editor's hint does. */
	.canvas-pill,
	.canvas-notice,
	.empty-card,
	.mask-card {
		position: absolute;
		z-index: 22;
		margin: 0;
		padding: 8px 12px;
		border: 1px solid var(--line);
		border-radius: 10px;
		background: var(--white);
		font-size: 13px;
		line-height: 1.4;
	}

	.canvas-pill {
		top: 14px;
		left: 16px;
		display: none;
		gap: 4px;
		flex-direction: column;
		max-width: 320px;
		color: var(--muted);
		pointer-events: none;
	}

	.canvas-pill strong {
		color: var(--ink);
		font-weight: 600;
	}

	.canvas-notice {
		display: flex;
		align-items: flex-start;
		gap: 8px;
		top: 14px;
		left: 50%;
		transform: translateX(-50%);
		max-width: min(460px, calc(100% - 32px));
		border-color: var(--alert-border);
		background: var(--alert-bg);
		color: var(--alert-ink);
	}

	.notice-dismiss {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 22px;
		height: 22px;
		flex: none;
		border: 0;
		border-radius: 4px;
		background: transparent;
		color: inherit;
		cursor: pointer;
	}

	/* Bottom right rather than bottom centre: the heart's tip is at the bottom of
	   the middle, and a card over it hides the one corner that says which way up
	   the heart goes. */
	.empty-card {
		right: 16px;
		bottom: 20px;
		width: min(320px, calc(100% - 32px));
		display: flex;
		flex-direction: column;
		gap: 8px;
		color: var(--muted);
		box-shadow: var(--shadow-panel);
	}

	.empty-actions {
		display: flex;
		gap: 8px;
	}

	.empty-actions .btn {
		flex: 1 1 0;
		background: var(--white);
	}

	.result {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 24px;
		box-sizing: border-box;
	}

	.result :global(svg) {
		max-width: 100%;
		max-height: 100%;
	}

	.mask-card {
		left: 20px;
		bottom: 20px;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 6px;
		box-shadow: var(--shadow-panel);
		font-family: inherit;
		cursor: pointer;
	}

	.mask-card:hover {
		border-color: var(--green);
	}

	/* Sky, not white: on white the white lobe vanishes and the card shows half a
	   mask — the same reason the detail page's heart thumbnails are sky. */
	.mask-card-canvas {
		position: relative;
		display: block;
		width: 120px;
		height: 120px;
		border-radius: 8px;
		background: var(--sky);
		overflow: hidden;
	}

	/* The canvas inside the card is a picture on a button, not something to paint
	   on, so it must not offer the painting cursor. */
	.mask-card :global(canvas) {
		cursor: inherit;
	}

	.mask-card-label {
		color: var(--green);
		font-size: 12px;
		font-weight: 600;
		text-decoration: underline;
	}

	.confirm-title {
		margin: 0 0 8px;
		font-size: 20px;
		color: var(--deep);
	}

	.confirm-text {
		margin: 0 0 20px;
		color: var(--ink);
		line-height: 1.5;
	}

	.confirm-actions {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
	}

	.help-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		padding-bottom: 16px;
		border-bottom: 1px solid var(--line);
		margin-bottom: 16px;
	}

	.help-header h2 {
		margin: 0;
		font-size: 22px;
		color: var(--deep);
	}

	.help-intro {
		margin: 0 0 12px;
		color: var(--ink);
		line-height: 1.6;
	}

	.help-list {
		margin: 0;
		padding-left: 1.25rem;
		color: var(--ink);
		line-height: 1.6;
	}

	.help-list li {
		margin-bottom: 0.35rem;
	}

	/* Desktop: the two columns float over the canvas, and the heart is fitted to
	   the band between them (docs/redesign/DESIGN.md §7). */
	@media (min-width: 900px) {
		.stage {
			left: 332px;
			right: 388px;
		}

		.paint-top.panel-collapsed .stage {
			right: 60px;
		}

		.canvas-pill {
			display: flex;
		}
	}

	/* Below 900px the page stacks, as the editor does: the heart first, then the
	   two panels under it, in one column. */
	.sidebar {
		display: flex;
		flex-direction: column;
		gap: 16px;
		width: min(420px, calc(100% - 2rem));
		margin: 1.25rem auto 0;
	}

	.sidebar :global(.editor-panel) {
		box-shadow: var(--shadow-panel);
	}

	@media (max-width: 899px) {
		.paint {
			padding-bottom: 3rem;
		}

		.paint-top {
			height: 62dvh;
			min-height: 320px;
		}

		/* No floating columns down here, so the card goes back under the heart. */
		.empty-card {
			left: 50%;
			right: auto;
			bottom: 12px;
			transform: translateX(-50%);
		}
	}

	@media (max-width: 599px) {
		.top-action {
			width: 40px;
			padding: 0;
		}

		.top-action-label {
			display: none;
		}
	}
</style>
