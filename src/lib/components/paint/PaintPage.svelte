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
	import { goto, replaceState } from '$app/navigation';
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
		SaveIcon
	} from '$lib/components/icons';
	import FrameOutline from './FrameOutline.svelte';
	import FramePanel from './FramePanel.svelte';
	import MaskCanvas from './MaskCanvas.svelte';
	import MaskToolPanel from './MaskToolPanel.svelte';
	import SymmetryPanel from './SymmetryPanel.svelte';
	import FindCutsPanel from './FindCutsPanel.svelte';
	import ImportImageDialog from './ImportImageDialog.svelte';
	import { pageTitle } from '$lib/seo';
	import { t, tArray, type Language } from '$lib/i18n';
	import { editorHref, homeAnchorHref } from '$lib/i18n/routes';
	import { NARROW_QUERY } from '$lib/breakpoints';
	import { readPanelCollapsed, writePanelCollapsed } from '$lib/editor/panelState';
	import { getSessionStorage, readStorage, removeStorage, writeStorage } from '$lib/utils/safeStorage';
	import {
		clearMask,
		handoffToDraw,
		markMaskDirty,
		restore as restoreSession,
		serialize as serializeSession,
		session,
		setFrame,
		setMask,
		setSymmetry,
		takeReplacedMask,
		type Frame,
		type PaintError,
		type PaintResult,
		type SymmetrySettings
	} from '$lib/editor/session.svelte';
	import type { DesignResult } from '$lib/inverse/client';
	import { clampFrameSize, frameMismatch, shapeCells } from '$lib/paint/frame';
	import { cloneMask, isEmpty, maskMismatch, type Mask } from '$lib/paint/mask';
	import { defaultMask, isDefaultMask } from '$lib/paint/tools';
	import { detectSymmetry, NO_SYMMETRY, transformsFor } from '$lib/paint/symmetry';
	import { fingerHasIntersectionIssues, intersectionMarginPx } from '$lib/editor/curveIssues';
	import { inferOverlapRect } from '$lib/utils/overlapRect';
	import { rasterizeDesign } from '$lib/paint/rasterize';
	import { isMediocre } from '$lib/paint/verdict';
	import {
		canRedo as historyCanRedo,
		canUndo as historyCanUndo,
		createHistory,
		record,
		redo as historyRedo,
		takeBack,
		undo as historyUndo,
		type MaskStep
	} from '$lib/paint/history';
	import {
		DEFAULT_BRUSH_SIZE,
		DEFAULT_SMUDGE_SIZE,
		DEFAULT_SMUDGE_STRENGTH,
		SMUDGE_STEP,
		clampSmudge,
		stepBrush,
		type BrushSize,
		type PaintAction,
		type PaintValue,
		type BrushShape,
		type PaintTool,
		type SmudgeMode
	} from '$lib/paint/toolset';
	import {
		cancel as cancelEngine,
		defaultAdvanced,
		findCuts,
		prepareMask,
		useBest as useBestResult,
		type AdvancedSettings,
		type EngineProgress
	} from '$lib/inverse/engine';
	import { EngineError, searchTimedOut } from '$lib/inverse/client';
	import {
		convertValidatedCutGeometry,
		cutGeometryToDesign,
		CutGeometryError,
		type CutGeometry
	} from '$lib/inverse/toHeartDesign';
	import {
		candidateGeometry,
		createGeometryThrottle,
		IDLE_PROGRESS,
		reduceProgress,
		type SearchProgress
	} from '$lib/paint/searchProgress';
	import { DEFAULT_COLORS, DEFAULT_COLORS_HEX } from '$lib/stores/colors';
	import { shownColors, subscribeShownColors } from '$lib/stores/colorMode';
	import { saveUserDesign } from '$lib/stores/collection';
	import { toHexColors } from '$lib/utils/heartColors';
	import { makeHeartAnchorId } from '$lib/utils/heartAnchors';
	import type { HeartColors, HeartDesign } from '$lib/types/heart';

	interface Props {
		lang: Language;
	}

	let { lang }: Props = $props();

	let colors = $state<HeartColors>({ ...DEFAULT_COLORS });
	let headerEl = $state.raw<HTMLElement | null>(null);
	let pageEl = $state.raw<HTMLDivElement | null>(null);
	let helpButtonEl = $state.raw<HTMLButtonElement | null>(null);
	/** The canvas being painted on, for `settle()` below. */
	let maskCanvas = $state.raw<ReturnType<typeof MaskCanvas> | null>(null);
	/** The left column, which scrolls inside itself on a short viewport. */
	let leftColumnEl = $state.raw<HTMLDivElement | null>(null);
	/** There is more of the column below its bottom edge. */
	let leftColumnCut = $state(false);
	/** There is more of the column above its top edge. */
	let leftColumnCutTop = $state(false);

	let tool = $state<PaintTool>('pen');
	let brushSize = $state<BrushSize>(DEFAULT_BRUSH_SIZE);
	let brushShape = $state<BrushShape>('round');
	/** Udtvær's radius, kept apart from the pen's: it reaches much further. */
	let smudgeSize = $state<BrushSize>(DEFAULT_SMUDGE_SIZE);
	let smudgeMode = $state<SmudgeMode>('push');
	let smudgeStrength = $state(DEFAULT_SMUDGE_STRENGTH);
	/** A put-down selection holds the tools inside it (the canvas says when). */
	let fenceHeld = $state(false);
	let paintValue = $state<PaintValue>(1);
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
	let advanced = $state<AdvancedSettings>(defaultAdvanced());

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

	/**
	 * What the search is doing, folded out of the engine's progress events.
	 *
	 * `$state.raw` because the reducer replaces the object rather than mutating
	 * it: a checkpoint arrives a few times a second and the panel reads the whole
	 * thing, so per-field reactivity would buy nothing and cost a proxy around an
	 * array that is rebuilt anyway.
	 */
	let progress = $state.raw<SearchProgress>(IDLE_PROGRESS);
	let elapsed = $state(0);
	let timer: ReturnType<typeof setInterval> | null = null;

	/**
	 * The candidate the engine is looking at right now, drawn over the mask.
	 *
	 * Geometry snapshots arrive at refinement checkpoints and for validated MILP
	 * incumbents. Rate-limited events retain their boolean validity flag, which
	 * `candidateGeometry` ignores without clearing the last available preview.
	 */
	let candidate = $state.raw<HeartDesign | null>(null);
	let solveStarted = $state(false);
	let usingBest = $state(false);

	/**
	 * Converting a candidate is a full `cutGeometryToDesign`, so it is held to
	 * four a second with the latest winning. This also coalesces worker messages
	 * that arrive together after the main thread has been busy.
	 */
	const candidates = createGeometryThrottle<string | CutGeometry>((geometry) => {
		try {
			candidate = cutGeometryToDesign(geometry, {
				name: t('paintHeartFromMask', lang),
				colors: toHexColors(colors, DEFAULT_COLORS_HEX),
				// Coarse, and no `enforce`: this is a picture of where the search has
				// got to, redrawn a few times a second, not the heart anyone will cut.
				// The tolerance keeps the conversion cheap and the missing enforcement
				// keeps it from rasterising two designs to price a correction.
				tolerance: 1.0
			});
		} catch (error) {
			// A candidate mid-refinement need not be a legal heart — cuts may cross,
			// a family may be empty. That is not a failure of the search, so it
			// leaves the last good candidate on screen and says nothing.
			console.debug('A candidate could not be drawn', error);
		}
	});
	/** The rows the converter could hold the last heart to (PAINT.md §11). */
	let honoured = $state<SymmetrySettings | null>(null);
	/**
	 * The other template beside the one shown: the fitter's smooth cuts when the
	 * exact search's template came first (worker-controller.js sends it once the
	 * fitter is done). Swapping exchanges the two; a new search clears it.
	 */
	let alternative = $state.raw<{ result: PaintResult; honoured: SymmetrySettings } | null>(null);
	/** A smoother template is still being found (the fitter after the exact search's answer). */
	let alternativePending = $state(false);
	/** Two hearts weaving pictures this close (share of cells) with as many cuts are the same. */
	const SAME_HEART = 0.0005;
	/** The most of the mask correcting an exact template's symmetry may cost (see toResult). */
	const EXACT_SYMMETRY_COST = 0.01;
	/** Which search an alternative belongs to: one arriving for an older one is dropped. */
	let searchCount = 0;
	/** "Vis det beskyttede motiv": the outline over the found heart. */
	let showMotif = $state(false);

	/** Something that went wrong outside the search: a save, a PDF, the example. */
	let notice = $state<string | null>(null);

	/** One paper only: nothing for Find snit to find. */
	let maskEmpty = $derived.by(() => {
		void revision;
		void strokes;
		return !session.mask || isEmpty(session.mask);
	});
	/**
	 * Still the board Mal starts on (see `defaultMask`): nothing painted yet, so
	 * Ryd has nothing to clear and a reload loses nothing.
	 */
	let maskUntouched = $derived.by(() => {
		void revision;
		void strokes;
		return !session.mask || isDefaultMask(session.mask);
	});
	let hasMissingPhotoPixels = $derived.by(() => {
		void revision;
		void strokes;
		return session.mask?.validMask?.some(v => !v) ?? false;
	});
	let busy = $derived(session.status === 'searching' || session.status === 'importing');
	/**
	 * A dialog is on screen, so it owns the keyboard.
	 *
	 * The canvas listens on the window, and `Modal` stops nothing but Escape, so
	 * the paint shortcuts have to stand down themselves: P and X would otherwise
	 * change the tool behind the scrim, and Cmd/Ctrl+Z would undo a stroke nobody
	 * can see. Pointer input is a separate question — `disabled` answers that
	 * one — so this gates only the keys.
	 */
	let dialogOpen = $derived(showHelp || showImport);
	/**
	 * The found heart is on screen, so there is no mask under the pointer and the
	 * left column can do nothing at all. It used to stay bright and clickable and
	 * simply not work, which read as a page that had stopped responding. Not the
	 * same thing as `busy`: a search leaves the mask on screen and the panel merely
	 * out of reach for a minute.
	 */
	let toolsStandby = $derived(showingResult);
	let heading = $derived(t('paintPageTitle', lang));

	/** Where the session waits in the tab's sessionStorage through a reload. */
	const RELOAD_KEY = 'julehjerte-paint-reload';

	/**
	 * The session, written once as the page unloads, for this tab to take back as Mal opens again:
	 * a drawing survives a reload, though nothing is stored while painting
	 * ($lib/editor/session.svelte.ts). Only a mask painted on, or with a heart found for it.
	 */
	function keepThroughReload(): void {
		if (!session.mask || isDefaultMask(session.mask) && !session.result) return;
		writeStorage(RELOAD_KEY, JSON.stringify(serializeSession()), getSessionStorage());
	}

	/** The session kept through a reload, put back and forgotten; false when there is none. */
	function takeBackAfterReload(): boolean {
		const storage = getSessionStorage();
		const raw = readStorage(RELOAD_KEY, storage);
		removeStorage(RELOAD_KEY, storage);
		if (!raw) return false;
		try {
			return restoreSession(JSON.parse(raw));
		} catch {
			return false;
		}
	}

	onMount(() => {
		const narrow = window.matchMedia(NARROW_QUERY);
		const syncNarrow = () => (isNarrow = narrow.matches);
		syncNarrow();
		narrow.addEventListener('change', syncNarrow);

		colors = shownColors();
		const unsubscribe = subscribeShownColors((next) => (colors = next));
		panelCollapsed = readPanelCollapsed();
		// Coming back from Tegn: the session still holds the heart Find snit found,
		// so the page opens where it was left rather than on a mask the visitor has
		// already moved past.
		showingResult = session.status === 'done' && !!session.result;
		// A reload keeps the drawing (the engine's own error asks for one): the session
		// written as the page unloaded comes back, once.
		if (!session.mask) takeBackAfterReload();
		window.addEventListener('pagehide', keepThroughReload);
		// The page always has a mask to paint on: it starts on the plain 5 × 5
		// board (see `defaultMask`), never an empty mask, so the heart is on screen
		// from the first frame.
		if (!session.mask) setMask(defaultMask());
		// A heart carried over from Tegn replaced what was painted here: Fortryd
		// brings that back, as it does after an import.
		const replaced = takeReplacedMask();
		if (replaced) {
			record(history, replaced);
			syncHistoryFlags();
		}
		measureHeader();
		// `?import` (the design page's "Fra et billede") opens the import dialog.
		// It is taken once and dropped from the address, so a reload or a step
		// back lands on the plain paint page. The router finishes mounting after
		// this, so the address is rewritten a task later, as GeneratorPage does —
		// and before the dialog opens, because the open dialog pushes a history
		// entry of its own (Back closes it) that a later rewrite would replace.
		const url = new URL(window.location.href);
		let importTimer: ReturnType<typeof setTimeout> | undefined;
		if (url.searchParams.has('import')) {
			url.searchParams.delete('import');
			importTimer = setTimeout(() => {
				try {
					replaceState(url, {});
				} catch {
					// The router is not up; the address keeps `?import`, the dialog still opens.
				}
				showImport = true;
			}, 0);
		}
		return () => {
			clearTimeout(importTimer);
			window.removeEventListener('pagehide', keepThroughReload);
			narrow.removeEventListener('change', syncNarrow);
			unsubscribe();
			stopTimer();
			// Leaving the page must not leave a worker solving in the background.
			cancelEngine();
		};
	});

	/**
	 * Whether the left column has more of itself past either edge.
	 *
	 * Read on scroll, on a resize of the column, and after a change that alters what
	 * is in it — the Markér hint is several lines, and appearing is what pushes the
	 * panel below it under the edge.
	 */
	function measureLeftColumn(): void {
		const el = leftColumnEl;
		// A pixel of rounding either way must not make a fade flicker at the end.
		leftColumnCut = !!el && el.scrollHeight - el.scrollTop - el.clientHeight > 4;
		leftColumnCutTop = !!el && el.scrollTop > 4;
	}

	/** The canvas fills the viewport under the bar, so the bar's height is a variable. */
	function measureHeader(): void {
		void tick().then(() => {
			if (!headerEl || !pageEl) return;
			const height = headerEl.getBoundingClientRect().height;
			pageEl.style.setProperty('--paint-header-height', `${Math.round(height)}px`);
		});
	}

	// The column *and every panel in it*, because only the panels can say that the
	// fade is needed. The column is pinned top and bottom, so its own box never
	// changes height whatever it holds: watching it alone caught the viewport and
	// nothing else, and each content change — the Markér hint appearing, the panels
	// standing down, Kanten collapsing under Fast — had to be named here by hand as
	// a `void` line. That list went stale the first time a panel learned a new
	// height, and it would again; the panels themselves cannot.
	$effect(() => {
		const el = leftColumnEl;
		if (!el) return;
		void tick().then(measureLeftColumn);
		if (typeof ResizeObserver === 'undefined') return;
		const observer = new ResizeObserver(measureLeftColumn);
		observer.observe(el);
		for (const panel of el.children) observer.observe(panel);
		return () => observer.disconnect();
	});

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

	/** A stroke given up before it ended (a second finger came down to zoom): the mask as it was. */
	function onEditCancel(): void {
		const before = takeBack(history);
		if (before) restore(before);
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

	/**
	 * Put a floating Markér patch down before the page acts on the mask.
	 *
	 * The canvas commits on a press anywhere off itself, which covers the mouse.
	 * Space or Enter on a focused button never goes near a pointer, so Find snit,
	 * Ryd and an import ask for the mask the visitor is looking at instead of the
	 * one it was before the move — which would otherwise be lost with no undo.
	 */
	function settle(): void {
		maskCanvas?.commitSelection();
	}

	function onShortcut(action: PaintAction): void {
		if (action.kind === 'tool') tool = action.tool;
		else if (action.kind === 'swapColour') paintValue = paintValue ? 0 : 1;
		else if (action.kind === 'undo') undo();
		else if (action.kind === 'redo') redo();
		else if (action.kind === 'brush') {
			if (tool === 'smudge') smudgeSize = clampSmudge(smudgeSize + action.delta * SMUDGE_STEP);
			else brushSize = stepBrush(brushSize, action.delta);
		}
	}

	/**
	 * "Kanten" changed: a new mode, shape or size.
	 *
	 * It changes what a search is being asked for, so a heart found under the old
	 * frame stops being the answer and the page goes back to the mask, exactly as
	 * it does after a stroke. It also changes which cells the symmetry rows apply
	 * to — the band's are excluded while it is free — which is why it goes through
	 * the store's `setFrame` and not through an assignment: the store folds the
	 * mask to the region the new frame means.
	 */
	function applyFrame(next: Frame): void {
		setFrame(next);
		revision++;
		backToMask();
	}

	/**
	 * The mask as it stands, on the undo stack, before a gesture moves the frame.
	 *
	 * That fold is an edit like any other: widening the motif folds band paint the
	 * rows had left alone, and narrowing it stops folding paint that was folded —
	 * so without this a drag of the Størrelse handle would rewrite cells the
	 * visitor could not get back. Once per gesture, not once per pointermove:
	 * both the slider and the canvas handle say when one begins.
	 *
	 * With no row on there is nothing to fold and nothing to record. As with
	 * `changeSymmetry`, the fold does not mark the mask dirty — it is the
	 * visitor's own instruction, not an edit they have yet to notice.
	 */
	function recordFrameFold(): void {
		// Before anything else, and whether or not a fold follows: changing the frame
		// bumps `revision`, and the canvas drops a floating patch on a bump because
		// the cells it was lifted from are no longer the cells underneath. Both
		// gestures that reach here — the panel's controls and the canvas's own
		// handles — can be made with a patch still in the air, and the handles are on
		// the canvas, so the press that grabs one is not the press "outside" that
		// commits. Settling first also puts the two undo steps in the order they
		// happened: the patch goes down, then the frame folds what is there.
		settle();
		if (!transformsFor(session.symmetry).length) return;
		const step = currentStep();
		if (!step) return;
		record(history, step);
		syncHistoryFlags();
	}

	/** A dragged handle, which arrives many times a second and only moves the size. */
	function resizeFrame(size: number): void {
		if (size === session.frame.size) return;
		applyFrame({ ...session.frame, size: clampFrameSize(size) });
	}

	/**
	 * What the mask is symmetric under, judged on the visitor's own motif.
	 *
	 * With a free band the band is about to be replaced by a woven pattern, so its
	 * colours must not decide whether the picture is symmetric (PAINT.md §11).
	 * Every mask that arrives from the import dialog is judged here, which is
	 * why the dialog is handed this function rather than calling
	 * `detectSymmetry` itself: a photo crop's corners are exactly the part
	 * a free band throws away, so they must not decide the rows either.
	 */
	function detectOn(mask: Mask): SymmetrySettings {
		const region =
			session.frame.mode === 'free' ? shapeCells(session.frame, mask.size) : undefined;
		return detectSymmetry(mask, undefined, region);
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
		revision++;
	}

	// -------------------------------------------------------- replacing the mask

	/**
	 * The mask as it was, kept for Fortryd before Ryd or an import replaces it:
	 * a whole new mask is one undo step, as a stroke is, rather than the end of
	 * the history.
	 */
	function rememberBeforeReplacing(): void {
		const step = currentStep();
		if (step) record(history, step);
	}

	// Ryd and an import replace the mask without asking: the mask they replace
	// is Fortryd away.
	function clear(): void {
		settle();
		if (maskUntouched) return;
		maskCanvas?.deselect();
		rememberBeforeReplacing();
		clearMask();
		syncHistoryFlags();
		showingResult = false;
		revision++;
	}

	function useMask(mask: Mask, found: SymmetrySettings, source: string): void {
		maskCanvas?.deselect();
		rememberBeforeReplacing();
		setMask(mask, { sourceName: source, symmetry: found, found });
		syncHistoryFlags();
		showingResult = false;
		honoured = null;
		revision++;
	}

	function openImport(): void {
		settle();
		showImport = true;
	}

	/**
	 * The template's weave becomes the mask and its heart the result, as if
	 * found: the cuts are the template's own, so there is nothing to search for.
	 * The rows stay off — folding would edit the weave the cuts make — and the
	 * symmetry found in it is only reported.
	 */
	function useTemplate(design: HeartDesign, mask: Mask, found: SymmetrySettings): void {
		maskCanvas?.deselect();
		rememberBeforeReplacing();
		setMask(mask, { sourceName: 'template', symmetry: { ...NO_SYMMETRY }, found });
		syncHistoryFlags();
		revision++;
		// A read template's fingers are its cuts and the lobe's two edges.
		const cuts = (lobe: string) => design.fingers.filter((f) => f.lobe === lobe && !f.id.includes('-edge-')).length;
		// Drawn templates are not always cuttable as drawn: Tegn's own check says
		// where cuts come too close, and the panel says that it does.
		const margin = intersectionMarginPx(inferOverlapRect(design.fingers, design.gridSize));
		const tooClose = design.fingers.some((f) => fingerHasIntersectionIssues(f, design.fingers, margin));
		session.result = {
			design: { ...design, id: newHeartId(), name: t('paintHeartFromTemplate', lang) },
			report: { cuts: [cuts('left'), cuts('right')], clearanceMm: null, mismatch: 0, identical: false, read: true, tooClose }
		};
		session.error = null;
		session.status = 'done';
		honoured = null;
		showingResult = true;
	}

	// ------------------------------------------------------------- find the cuts

	function startTimer(): void {
		stopTimer();
		const began = performance.now();
		elapsed = 0;
		timer = setInterval(() => (elapsed = Math.floor((performance.now() - began) / 1000)), 1000);
	}

	/**
	 * The search is over, however it ended: found, failed, Afbryd, or the page
	 * being left. The candidate goes with the clock, because a conversion still
	 * waiting in the throttle would otherwise land a picture of a half-finished
	 * search over the answer a second after it arrived.
	 */
	function stopTimer(): void {
		solveStarted = false;
		usingBest = false;
		if (timer) clearInterval(timer);
		timer = null;
		candidates.stop();
		candidate = null;
	}

	function classify(err: unknown): PaintError {
		if (err instanceof CutGeometryError) return { kind: 'noSolution', detail: err.key };
		if (err instanceof EngineError) {
			// The exact search alone (Avanceret) found no template: say so, and what else to choose.
			if (err.code === 'NO_EXACT_TEMPLATE') return { kind: 'noExact' };
			if (searchTimedOut(err.report)) return { kind: 'timeout' };
			// A solve that failed says why in its report; a worker that never loaded
			// has none, and that is a different thing to tell the visitor.
			return err.report ? { kind: 'noSolution', detail: err.message } : { kind: 'engine' };
		}
		return { kind: 'engine', detail: err instanceof Error ? err.message : String(err) };
	}

	/**
	 * One progress event: the numbers the panel shows, and the candidate it draws.
	 *
	 * Both directions of PAINT.md §12 meet here. The reducer takes the whole event
	 * — it has to, because the fitter says which counts it is trying and how wrong
	 * they still are, and none of that survived the old `progress(data.event.
	 * stage)` — and the candidate's cuts are lifted out separately, because they
	 * are a picture rather than a number and cost a conversion to draw.
	 */
	function onProgress(event: EngineProgress): void {
		progress = reduceProgress(progress, event);
		const geometry = candidateGeometry(event);
		if (geometry) candidates.push(geometry);
	}

	/**
	 * A found template as the page shows it: the engine's cut geometry converted
	 * into the editor's heart, measured against the mask it was searched for, with
	 * the symmetry rows it holds. The first answer and the fitter's alternative
	 * beside it both come through here.
	 */
	function toResult(solved: DesignResult, target: Mask, frame: Frame): { result: PaintResult; honoured: SymmetrySettings } {
		const geometry = solved.files['cut_geometry.json'];
		if (!geometry) {
			throw new CutGeometryError('paintErrorGeometrySchema', 'The engine returned no geometry.');
		}
		const kind: PaintResult['report']['kind'] = solved.report.solver?.exactOutline?.chosen === 'exact' ? 'exact' : 'smooth';
		// The exact search's cuts follow the picture: made symmetric at more than
		// EXACT_SYMMETRY_COST of the mask (cuts searched without the symmetry's
		// ties do not pair up, permo-kroge 1.9 %) they lose what they are for, so
		// they stay as found, with the rows marked as not held, and the fitter's
		// symmetric cuts beside them.
		const converted = convertValidatedCutGeometry(geometry, {
			name: session.sourceName ? t('paintHeartFromImage', lang) : t('paintHeartFromMask', lang),
			colors: toHexColors(colors, DEFAULT_COLORS_HEX),
			enforce: session.symmetry,
			...(kind === 'exact' ? { enforceCostLimit: EXACT_SYMMETRY_COST } : {}),
			reference: { mask: target, weights: frame.mode === 'free' ? shapeCells(frame, target.size) : undefined }
		});

		// Measure the actual editable heart against the original drawing. Changes
		// outside the protected motif are permitted, and reported separately.
		// Score at the drawing's resolution: shrinking a binary mask moves edge
		// pixels and can exaggerate the disagreement with the fitted curves.
		const woven = rasterizeDesign(converted.design, target.size).data;
		const wanted = target.data;
		const mismatch = maskMismatch(woven, wanted, target.validMask);
		const regions = frame.mode === 'free'
			? frameMismatch(woven, wanted, target.size, frame, target.validMask) : undefined;

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
		return {
			honoured: converted.honoured,
			result: {
				design: { ...converted.design, id: newHeartId() },
				report: {
					kind,
					cuts: [solved.report.slits.left, solved.report.slits.right],
					clearanceMm: solved.report.validation.minimumInterSlitDistanceLower,
					mismatch,
					missingFeatures: solved.report.imageFidelity?.features.passed === false,
					motifMismatch: regions?.inside,
					borderChange: regions?.outside,
					identical: solved.report.solver.matchingPreference?.identical ?? false,
					stoppedEarly: solved.report.stoppedEarly ?? false
				}
			}
		};
	}

	async function find(): Promise<void> {
		settle();
		const mask = session.mask;
		if (!mask || maskEmpty || busy) return;
		// "Find snit igen", from the panel's own result face: the heart on screen
		// describes a search that is over, so the canvas goes back to the mask the
		// new one is about — otherwise the visitor would watch a progress bar under
		// the very heart they had just been told was not good enough.
		backToMask();
		notice = null;
		alternative = null;
		alternativePending = false;
		const search = ++searchCount;
		session.error = null;
		session.status = 'searching';
		progress = reduceProgress(IDLE_PROGRESS, { stage: 'preprocessing' });
		candidate = null;
		startTimer();
		try {
			// The target itself has to be symmetric, or the search spends its time
			// proving away a difference the visitor cannot see (PAINT.md §5).
			setSymmetry(session.symmetry);
			revision++;

			// Preserve the original drawing; a free band carries zero image weight.
			// Checker patterns may seed the search, but never replace this target.
			const frame = { ...session.frame };
			const target = cloneMask(mask);
			await prepareMask(target, colors, onProgress, frame);
			solveStarted = true;
			const solved = await findCuts(
				{
					colors,
					symmetry: session.symmetry,
					widthMm: advanced.widthMm,
					minWidthMm: advanced.minWidthMm,
					matchingSheets: advanced.matchingSheets,
					method: advanced.method
				},
				onProgress,
				(other, pending) => {
					if (search !== searchCount) return;
					alternativePending = pending;
					if (!other) return;
					try {
						const found = toResult(other, target, frame), shown = session.result;
						// The same heart is no choice: an alternative weaving the same picture
						// with as many cuts (the 3 x 3 heart's straight cuts) is not offered.
						const same = shown && found.result.report.cuts.every((n, k) => n === shown.report.cuts[k])
							&& maskMismatch(rasterizeDesign(found.result.design, target.size).data, rasterizeDesign(shown.design, target.size).data) < SAME_HEART;
						if (!same) {
							alternative = found;
							// A heart only close (the panel's "close, but not right") gives way to
							// one that is not: the photographs whose sides the exact search reads
							// deeper than their edge come out over 1 %, the fitter's under it.
							if (shown && isMediocre(shown.report) && !isMediocre(found.result.report)) swapTemplate();
						}
					} catch (err) {
						// A second template that does not convert is simply not offered.
						console.warn('The alternative template could not be converted', err);
					}
				}
			);

			const found = toResult(solved, target, frame);
			honoured = found.honoured;
			session.result = found.result;
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

	/** Show the other template: the alternative and the shown one change places. */
	function swapTemplate(): void {
		if (!alternative || !session.result) return;
		const shown = { result: session.result, honoured: honoured ?? { ...NO_SYMMETRY } };
		session.result = alternative.result;
		honoured = alternative.honoured;
		alternative = shown;
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
		const design = session.result ? { ...session.result.design, colors: toHexColors(colors, DEFAULT_COLORS_HEX) } : undefined;
		if (!design) return;
		handoffToDraw(design);
		void goto(editorHref(lang, '?from=session'));
	}

	async function downloadPdf(): Promise<void> {
		const design = session.result ? { ...session.result.design, colors: toHexColors(colors, DEFAULT_COLORS_HEX) } : undefined;
		if (!design) return;
		try {
			const { downloadDesignPDF } = await import('$lib/pdf/template');
			await downloadDesignPDF(design, lang);
		} catch (err) {
			console.error('Generating the PDF failed', err);
			notice = t('pdfFailed', lang);
		}
	}

	function save(): void {
		const design = session.result ? { ...session.result.design, colors: toHexColors(colors, DEFAULT_COLORS_HEX) } : undefined;
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
	<title>{pageTitle('paint', lang)}</title>
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
		     handlers already do nothing without a heart (GalleryBar.svelte and
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
							{#key session.result.design.id}
								<PaperHeartSVG
									readonly
									idPrefix="paint-result"
									initialFingers={session.result.design.fingers}
									initialGridSize={session.result.design.gridSize}
									initialWeaveParity={session.result.design.weaveParity ?? 0}
									size={520}
								/>
							{/key}
							{#if showMotif && session.result.report.motifMismatch !== undefined}
								<FrameOutline design={session.result.design} frame={session.frame} size={520} />
							{/if}
						</div>
						<!-- The whole card is the way back: it used to carry a "Ret masken"
						     link of its own next to the panel's "Tilbage til masken", which
						     read as two different steps and is one. -->
						<button type="button" class="mask-card" onclick={backToMask}>
							<!-- The picture is decoration on a button whose one word says what
							     it does: read out, its own label would put the whole
							     "400 × 400 celler i to papirfarver" in front of that word. -->
							<span class="mask-card-canvas" aria-hidden="true">
								<MaskCanvas
									{lang}
									mask={session.mask}
									{colors}
									symmetry={session.symmetry}
									{tool}
									brush={brushSize}
									{paintValue}
									{revision}
									frame={session.frame}
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
							bind:this={maskCanvas}
							{lang}
							mask={session.mask}
							{colors}
							symmetry={session.symmetry}
							{tool}
							brush={tool === 'smudge' ? smudgeSize : brushSize}
							{brushShape}
							{smudgeMode}
							{smudgeStrength}
							{paintValue}
							{revision}
							frame={session.frame}
							{candidate}
							onFenceChange={(held) => (fenceHeld = held)}
							onFrameSizeStart={recordFrameFold}
							onFrameSize={resizeFrame}
							disabled={busy}
							keyboardBusy={dialogOpen}
							{onEditStart}
							{onEditEnd}
							{onEditCancel}
							{onShortcut}
						/>
					{/if}

					<p class="canvas-pill">
						<strong>{t('paintMaskPill', lang, { size: session.mask?.size ?? 400 })}</strong>
						<span>{t('paintCanvasHint', lang)}</span>
						{#if hasMissingPhotoPixels}
							<span>{t('paintMissingPhotoPixels', lang)}</span>
						{/if}
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
					<div class="left-panel" bind:this={leftColumnEl} onscroll={measureLeftColumn}>
						{@render toolPanel()}
						{@render symmetryPanel()}
						{@render framePanel()}
					</div>
					<!-- The column runs past one edge or the other and there is more of it
					     out of sight. macOS draws nothing of an overlay scrollbar until a
					     gesture starts, so without these a panel is simply not there as far
					     as anyone can tell. Both edges, not just the bottom: a short window
					     or a Kanten expanded under Fri still runs the column past both, so a
					     visitor who has scrolled down to Kanten needs to be told Værktøj is
					     up there as much as they needed to be told Kanten was below. -->
					<div class="left-fade top" class:showing={leftColumnCutTop} aria-hidden="true"></div>
					<div class="left-fade" class:showing={leftColumnCut} aria-hidden="true"></div>
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
				<!-- The same order as the left column above, then the right one:
				     Værktøj, Symmetri, Kanten, Find snit. -->
				<aside class="sidebar">
					{@render toolPanel()}
					{@render symmetryPanel()}
					{@render framePanel()}
					{@render cutsPanel()}
				</aside>
			{/if}
		</TooltipProvider>
	</main>

	<!-- The three panels, authored once and rendered either floating over the canvas
	     or stacked under it. -->
	{#snippet toolPanel()}
					<!-- While the found heart is on screen there is no mask to paint on, so
					     the whole column stands down: every control inside is really
					     disabled, which is what says so to a screen reader, and the class
					     mutes what is left on screen. (aria-disabled on this wrapper would
					     say nothing at all: it is not a global attribute, and a plain div
					     has no role to hang it on.) "Tilbage til masken" — the panel's
					     button or the card — brings it back. -->
					<div class="tool-panel" class:standby={toolsStandby}>
						<MaskToolPanel
							{lang}
							{tool}
							onTool={(next) => (tool = next)}
							brushSize={tool === 'smudge' ? smudgeSize : brushSize}
							onBrushSize={(next) => (tool === 'smudge' ? (smudgeSize = next) : (brushSize = next))}
							{brushShape}
							onBrushShape={(next) => (brushShape = next)}
							{smudgeMode}
							onSmudgeMode={(next) => (smudgeMode = next)}
							{smudgeStrength}
							onSmudgeStrength={(next) => (smudgeStrength = next)}
							{paintValue}
							onPaintValue={(next) => (paintValue = next)}
							symmetry={session.symmetry}
							{fenceHeld}
							onDeselect={() => maskCanvas?.deselect()}
							onChecks={(n) => maskCanvas?.layChecks(n)}
							{colors}
							{canUndo}
							{canRedo}
							onUndo={undo}
							onRedo={redo}
							onImport={openImport}
							onClear={clear}
							clearDisabled={maskUntouched}
							disabled={busy || showingResult}
						/>
					</div>
	{/snippet}

	{#snippet symmetryPanel()}
					<SymmetryPanel
						{lang}
						value={session.symmetry}
						onChange={changeSymmetry}
						found={session.found}
						disabled={busy || showingResult}
					/>
	{/snippet}

	<!-- Kanten sits under Symmetri in the same column (PAINT.md §11): it is about
	     the picture, not about the search, and the visitor sets it while they
	     paint. A snippet of its own, so each one is named for the panel it draws
	     and the two layouts below stay a plain list of the column's contents. -->
	{#snippet framePanel()}
					<FramePanel
						{lang}
						frame={session.frame}
						onFrameStart={recordFrameFold}
						onFrame={applyFrame}
						disabled={busy || showingResult}
					/>
	{/snippet}

	{#snippet cutsPanel()}
					<FindCutsPanel
						{lang}
						symmetry={session.symmetry}
						status={session.status}
						error={session.error}
						result={session.result}
						alternative={alternative?.result ?? null}
						{alternativePending}
						onSwap={swapTemplate}
						{showingResult}
						{honoured}
						{showMotif}
						onShowMotif={(next) => (showMotif = next)}
						{elapsed}
						{progress}
						{advanced}
						onAdvanced={(next) => (advanced = next)}
						onResetAdvanced={() => (advanced = defaultAdvanced())}
						canFind={!maskEmpty && !busy}
						onFind={find}
						onCancel={abort}
						onUseBest={solveStarted ? () => { if (!usingBest) usingBest = useBestResult(); } : undefined}
						stopping={usingBest}
						onOpenInDraw={openInDraw}
						onBackToMask={backToMask}
					/>
	{/snippet}

	<ImportImageDialog
		{lang}
		open={showImport}
		detect={detectOn}
		onClose={() => (showImport = false)}
		onUse={(mask, found) => useMask(mask, found, 'image')}
		onUseTemplate={useTemplate}
	/>

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
		height: calc(100dvh - var(--paint-header-height) - var(--site-footer-height, 100px));
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

	/* Three panels (Værktøj, Symmetri, Kanten) that fit a desktop window in their
	   default state — 732px against the 880 a 1440 x 950 viewport leaves — and run
	   past it on a short one, or with Kanten expanded under Fri. So the column
	   stays centred while it fits and scrolls from the top when it does not, which
	   is what `safe center` says; a browser that does not know the keyword falls
	   back to the top, the same answer for the case that matters. Centring with a
	   transform instead cut the column off at *both* ends, with the top out of
	   reach altogether.

	   The padding is for the panels' shadow: `overflow-y: auto` computes overflow-x
	   to `auto` as well, which clips anything drawn outside the box. */
	.left-panel {
		position: absolute;
		left: 10px;
		top: 4px;
		bottom: 4px;
		width: 312px;
		box-sizing: border-box;
		padding: 4px 6px;
		display: flex;
		flex-direction: column;
		justify-content: safe center;
		gap: 14px;
		overflow-y: auto;
		overscroll-behavior: contain;
		scrollbar-width: thin;
		scrollbar-color: var(--sage) transparent;
		z-index: 26;
	}

	/* A cut edge, when there is more of the column past it. Its own element rather
	   than a pseudo of the scroller: a background inside a scroller either scrolls
	   away with the content or sits behind the opaque panels, and the scrollbar
	   cannot say it — Chrome ignores `::-webkit-scrollbar` as soon as
	   `scrollbar-width` is set, and macOS draws an overlay scrollbar that is
	   invisible until a gesture starts. */
	.left-fade {
		position: absolute;
		left: 10px;
		bottom: 4px;
		width: 312px;
		height: 28px;
		z-index: 27;
		opacity: 0;
		transition: opacity 120ms ease-out;
		pointer-events: none;
		background: linear-gradient(to top, var(--page), transparent);
	}

	/* The same edge at the top, drawn the other way up. */
	.left-fade.top {
		top: 4px;
		bottom: auto;
		background: linear-gradient(to bottom, var(--page), transparent);
	}

	.left-fade.showing {
		opacity: 1;
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
