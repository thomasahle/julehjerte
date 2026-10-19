<!--
  "Tegn af fra skærmen" — docs/redesign/TRACE.md.

  A full-screen white lightbox with one lobe's cutting template in black, for a
  visitor without a printer who lays thin paper on a tablet and traces it. Three
  states:

    * sizing: drag, pinch, wheel or the mm slider place the template;
    * calibrating: a credit-card outline the visitor matches to a real card,
      which turns the "ca." mm readout into a measured one;
    * locked: the toolbar is gone, a transparent layer swallows every touch,
      and only a two-second hold on the corner button (or Escape) unlocks.

  A page cannot switch the touchscreen off, only ignore it; the guide keeps its
  Guided Access note for the system gestures this cannot stop.

  All the arithmetic is in $lib/utils/trace; this file wires it to pointers,
  the DOM and the browser APIs (wake lock, fullscreen).
-->
<script lang="ts">
	import { tick, untrack } from 'svelte';
	import type { Attachment } from 'svelte/attachments';
	import { CloseIcon, FitIcon, LockIcon, LockOpenIcon } from '$lib/components/icons';
	import { t, type Language } from '$lib/i18n';
	import type { HeartDesign } from '$lib/types/heart';
	import { trackHeartTrace } from '$lib/analytics';
	import { trapTab } from '$lib/utils/focusTrap';
	import { lobesShareTemplate } from '$lib/utils/symmetry';
	import { getTemplateData, type TemplateLobe } from '$lib/utils/templateSvg';
	import { markPathData, shownTemplateMarks } from '$lib/utils/orientationMarks';
	import {
		CARD_CORNER_MM,
		CARD_HEIGHT_MM,
		CARD_WIDTH_MM,
		DEFAULT_PX_PER_MM,
		HOLD_IDLE,
		HOLD_MS,
		MAX_CARD_PX,
		MAX_WIDTH_MM,
		MIN_CARD_PX,
		MIN_WIDTH_MM,
		cardWidthPx,
		centreIn,
		clampView,
		dragView,
		fitView,
		holdCancel,
		holdProgress,
		holdStart,
		holdTick,
		loadTraceSettings,
		pinchView,
		pxPerMmFromCard,
		saveTraceSettings,
		scaleAbout,
		scaleFromWidthMm,
		viewCentre,
		wheelFactor,
		widthMmFromScale,
		type Area,
		type HoldState,
		type Point,
		type TraceView
	} from '$lib/utils/trace';
	import { openOverlay } from '$lib/utils/overlayHistory';

	interface Props {
		design: HeartDesign;
		heartId: string;
		heartName: string;
		lang: Language;
		open: boolean;
		/** The page returns focus to whatever opened the mode. */
		onClose: () => void;
	}

	let { design, heartId, heartName, lang, open, onClose }: Props = $props();

	type Mode = 'size' | 'calibrate' | 'locked';

	let mode = $state<Mode>('size');
	let lobe = $state<TemplateLobe>('left');
	let view = $state<TraceView>({ x: 0, y: 0, s: 1 });
	let pxPerMm = $state(DEFAULT_PX_PER_MM);
	let calibrated = $state(false);
	let cardPx = $state(Math.round(cardWidthPx(DEFAULT_PX_PER_MM)));
	/** The template's width when calibration began, restored at the new scale. */
	let calibrateFromMm = 0;
	let announcement = $state('');

	let vw = $state(0);
	let vh = $state(0);
	let rootEl = $state.raw<HTMLDivElement | null>(null);
	let chromeEl = $state.raw<HTMLDivElement | null>(null);
	let lockButton = $state.raw<HTMLButtonElement | null>(null);
	let unlockButton = $state.raw<HTMLButtonElement | null>(null);
	/** Bottom edge of the toolbar and hint, so "Tilpas" fits below them. */
	let chromeBottom = $state(0);

	const twoTemplates = $derived(!lobesShareTemplate(design.fingers, design.gridSize));
	const shownLobe = $derived<TemplateLobe>(twoTemplates ? lobe : 'left');
	const template = $derived(getTemplateData(design, shownLobe));
	const size = $derived({ width: template.templateWidth, height: template.templateHeight });
	const viewport = $derived({ width: vw, height: vh });
	const freeArea = $derived<Area>({
		left: 0,
		top: chromeBottom,
		width: vw,
		height: Math.max(0, vh - chromeBottom)
	});

	const widthMm = $derived(widthMmFromScale(size.width, view.s, pxPerMm));
	/**
	 * The orientation marks ($lib/utils/orientationMarks), about 3 mm across on
	 * the paper whatever the size: placed for the width shown, to the whole
	 * millimetre so pinching does not re-place them at every frame.
	 */
	const marks = $derived(
		shownTemplateMarks(design, shownLobe, Math.max(1, Math.round(widthMm)) / size.width)
	);
	const readout = $derived(
		t(calibrated ? 'traceWidthMmExact' : 'traceWidthMm', lang, { mm: Math.round(widthMm) })
	);

	// ---- Opening and closing -------------------------------------------------

	/** True once the visitor has moved or sized the template by hand. */
	let adjusted = false;

	/** "Tilpas", then the remembered width about the same centre. */
	function place(rememberedMm?: number): void {
		let next = fitView(size, freeArea, viewport, pxPerMm);
		if (rememberedMm !== undefined) {
			next = centreIn(size, scaleFromWidthMm(size.width, rememberedMm, pxPerMm), freeArea);
			next = clampView(next, size, viewport, pxPerMm);
		}
		view = next;
	}

	let remembered: number | undefined;

	$effect(() => {
		if (!open) return;
		return untrack(() => {
			const scrollY = window.scrollY;
			const body = document.body;
			const previousOverflow = body.style.overflow;
			body.style.overflow = 'hidden';

			const settings = loadTraceSettings();
			pxPerMm = settings.pxPerMm ?? DEFAULT_PX_PER_MM;
			calibrated = settings.pxPerMm !== undefined;
			remembered = settings.widthMm;
			mode = 'size';
			lobe = 'left';
			adjusted = false;
			announcement = '';
			vw = window.innerWidth;
			vh = window.innerHeight;
			trackHeartTrace(heartId, heartName);

			// Fullscreen is asked for here, on the click that opened the mode, and
			// not on "Lås skærmen": going fullscreen moves the page up the glass by
			// the height of the browser's bars, which would slide the template out
			// from under paper already laid on it. Sized in fullscreen, locking
			// changes nothing on screen.
			try {
				document.documentElement.requestFullscreen?.()?.catch(() => {});
			} catch {
				// Not allowed here; the mode works without it.
			}

			tick().then(() => {
				measureChrome();
				place(remembered);
				rootEl?.focus();
			});

			// Back closes the mode, as it would leave any full-screen view; a
			// locked screen refuses, and the entry is pushed again.
			const releaseHistory = openOverlay('trace', () => {
				close();
				return !open;
			});

			return () => {
				releaseHistory();
				cancelHold();
				saveSettings();
				body.style.overflow = previousOverflow;
				document.documentElement.classList.remove('tracing');
				exitFullscreen();
				if (window.scrollY !== scrollY) window.scrollTo(0, scrollY);
			};
		});
	});

	function exitFullscreen(): void {
		try {
			if (document.fullscreenElement) document.exitFullscreen?.()?.catch(() => {});
		} catch {
			// Already left, or never entered.
		}
	}

	function measureChrome(): void {
		chromeBottom = chromeEl ? chromeEl.getBoundingClientRect().bottom : 0;
	}

	/**
	 * Rotation, entering fullscreen or a resized window. Until the visitor has
	 * placed the template themselves it is placed afresh for the new size;
	 * afterwards it is only kept on screen. A locked screen is left alone: the
	 * template must not move under the paper.
	 */
	function handleResize(): void {
		if (!open || mode === 'locked') return;
		remeasure();
	}

	/** Read the viewport again and place or clamp the template for it. */
	async function remeasure(): Promise<void> {
		vw = window.innerWidth;
		vh = window.innerHeight;
		await tick();
		measureChrome();
		if (adjusted) view = clampView(view, size, viewport, pxPerMm);
		else place(remembered);
	}

	function saveSettings(): void {
		saveTraceSettings({ pxPerMm: calibrated ? pxPerMm : undefined, widthMm });
	}

	function close(): void {
		if (mode === 'locked') return;
		onClose();
	}

	// ---- Sizing: pointers, wheel, slider -------------------------------------

	const pointers = new Map<number, Point>();
	let gesture: { start: TraceView; from: Point[] } | null = null;

	/** Restart the gesture from the pointers now down, so lifting one finger of a pinch does not jump. */
	function rebaseline(): void {
		const from = [...pointers.values()].slice(0, 2);
		gesture = from.length ? { start: view, from } : null;
	}

	function handlePointerDown(event: PointerEvent): void {
		if (mode !== 'size') return;
		(event.currentTarget as Element).setPointerCapture?.(event.pointerId);
		pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
		adjusted = true;
		rebaseline();
	}

	function handlePointerMove(event: PointerEvent): void {
		if (mode !== 'size' || !gesture || !pointers.has(event.pointerId)) return;
		pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
		const now = [...pointers.values()].slice(0, 2);
		const { start, from } = gesture;
		if (now.length >= 2 && from.length >= 2) {
			view = pinchView(start, [from[0], from[1]], [now[0], now[1]], size, viewport, pxPerMm);
		} else {
			view = dragView(start, from[0], now[0], size, viewport);
		}
	}

	function handlePointerEnd(event: PointerEvent): void {
		if (!pointers.delete(event.pointerId)) return;
		rebaseline();
	}

	// Svelte registers wheel listeners as passive, and a passive listener cannot
	// stop the page from zooming or scrolling, so this one is added by hand.
	const zoomOnWheel: Attachment<SVGSVGElement> = (node) => {
		const onWheel = (event: WheelEvent) => {
			event.preventDefault();
			if (mode !== 'size') return;
			adjusted = true;
			view = scaleAbout(
				view,
				view.s * wheelFactor(event.deltaY),
				{ x: event.clientX, y: event.clientY },
				size,
				viewport,
				pxPerMm
			);
		};
		node.addEventListener('wheel', onWheel, { passive: false });
		return () => node.removeEventListener('wheel', onWheel);
	};

	function setWidthMm(mm: number): void {
		adjusted = true;
		const s = scaleFromWidthMm(size.width, mm, pxPerMm);
		view = scaleAbout(view, s, viewCentre(view, size), size, viewport, pxPerMm);
	}

	function fit(): void {
		adjusted = true;
		view = fitView(size, freeArea, viewport, pxPerMm);
	}

	// ---- Calibration ---------------------------------------------------------

	// The card lies the way the screen does: 85.6 mm does not fit across a phone
	// held upright, so there it stands on its short edge.
	const cardPortrait = $derived(freeArea.height > freeArea.width);
	const card = $derived.by(() => {
		const long = cardPx;
		const short = (cardPx * CARD_HEIGHT_MM) / CARD_WIDTH_MM;
		const width = cardPortrait ? short : long;
		const height = cardPortrait ? long : short;
		return {
			x: freeArea.left + (freeArea.width - width) / 2,
			y: freeArea.top + (freeArea.height - height) / 2,
			width,
			height,
			r: (CARD_CORNER_MM * cardPx) / CARD_WIDTH_MM
		};
	});

	function startCalibration(): void {
		calibrateFromMm = widthMm;
		cardPx = Math.min(MAX_CARD_PX, Math.max(MIN_CARD_PX, Math.round(cardWidthPx(pxPerMm))));
		mode = 'calibrate';
		tick().then(measureChrome);
	}

	function finishCalibration(): void {
		pxPerMm = pxPerMmFromCard(cardPx);
		calibrated = true;
		mode = 'size';
		const s = scaleFromWidthMm(size.width, calibrateFromMm, pxPerMm);
		view = scaleAbout(view, s, viewCentre(view, size), size, viewport, pxPerMm);
		saveSettings();
		tick().then(measureChrome);
	}

	// ---- Locking -------------------------------------------------------------

	async function lock(): Promise<void> {
		pointers.clear();
		gesture = null;
		saveSettings();
		mode = 'locked';
		announcement = t('traceLockedAnnouncement', lang);
		await tick();
		unlockButton?.focus();
	}

	async function unlock(): Promise<void> {
		cancelHold();
		mode = 'size';
		announcement = t('traceUnlockedAnnouncement', lang);
		// Resizes are ignored while locked, so a rotation then left the surface
		// at the old size: catch up now that the template may move again.
		if (vw !== window.innerWidth || vh !== window.innerHeight) {
			await remeasure();
		} else {
			await tick();
			measureChrome();
		}
		lockButton?.focus();
	}

	// While locked: the `tracing` class on <html> stops the page behind from
	// rubber-banding, and the screen is kept awake. The wake lock is dropped by
	// the browser whenever the tab is hidden, so it is asked for again on return.
	$effect(() => {
		if (mode !== 'locked') return;
		const html = document.documentElement;
		html.classList.add('tracing');
		let sentinel: WakeLockSentinel | null = null;
		let released = false;

		const requestWakeLock = async () => {
			try {
				const next = (await navigator.wakeLock?.request('screen')) ?? null;
				if (released) next?.release().catch(() => {});
				else sentinel = next;
			} catch {
				// Refused (low battery, no permission) or unsupported: the visitor's
				// own screen timeout applies.
			}
		};
		const onVisibility = () => {
			if (document.visibilityState === 'visible') requestWakeLock();
		};

		requestWakeLock();
		document.addEventListener('visibilitychange', onVisibility);
		return () => {
			released = true;
			html.classList.remove('tracing');
			document.removeEventListener('visibilitychange', onVisibility);
			sentinel?.release().catch(() => {});
		};
	});

	/**
	 * Everything a hand or a sheet of paper can do to a touchscreen, cancelled.
	 * Non-passive, or preventDefault() is ignored and iOS still scrolls, zooms
	 * and selects.
	 */
	const BLOCKED = ['touchstart', 'touchmove', 'touchend', 'gesturestart', 'wheel', 'contextmenu', 'dblclick'];
	const swallowTouches: Attachment<HTMLElement> = (node) => {
		const block = (event: Event) => {
			if (event.cancelable) event.preventDefault();
		};
		for (const type of BLOCKED) node.addEventListener(type, block, { passive: false });
		return () => {
			for (const type of BLOCKED) node.removeEventListener(type, block);
		};
	};

	// ---- The two-second hold -------------------------------------------------

	const RING_RADIUS = 31;
	const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

	let hold: HoldState = HOLD_IDLE;
	let progress = $state(0);
	let holdTimer: ReturnType<typeof setTimeout> | null = null;
	let holdFrame: number | null = null;

	/** What started the hold under way: a finger or mouse, or Enter / Space. */
	let holdBy: 'pointer' | 'key' | null = null;

	function beginHold(by: 'pointer' | 'key'): void {
		if (mode !== 'locked' || hold.phase === 'holding') return;
		holdBy = by;
		hold = holdStart(hold, Date.now());
		holdTimer = setTimeout(checkHold, HOLD_MS);
		drawProgress();
	}

	function checkHold(): void {
		holdTimer = null;
		hold = holdTick(hold, Date.now());
		if (hold.phase === 'done') {
			unlock();
		} else if (hold.phase === 'holding') {
			// A timer can fire a hair early; wait out the rest.
			holdTimer = setTimeout(checkHold, HOLD_MS - (Date.now() - hold.since));
		}
	}

	function drawProgress(): void {
		progress = holdProgress(hold, Date.now());
		if (hold.phase !== 'holding' || typeof requestAnimationFrame !== 'function') return;
		holdFrame = requestAnimationFrame(drawProgress);
	}

	function cancelHold(): void {
		holdBy = null;
		hold = holdCancel(hold);
		if (hold.phase === 'done') hold = HOLD_IDLE;
		if (holdTimer !== null) clearTimeout(holdTimer);
		if (holdFrame !== null) cancelAnimationFrame(holdFrame);
		holdTimer = null;
		holdFrame = null;
		progress = 0;
	}

	function handleUnlockDown(event: PointerEvent): void {
		// A captured pointer never "leaves", so sliding off the button would not
		// cancel the hold. WebKit captures a touch before pointerdown and lets go
		// here; Chromium captures it after, in a way releasePointerCapture cannot
		// undo (hasPointerCapture stays false and nothing is released, measured
		// with CDP touch on a Pixel 7), so handleUnlockMove covers that case.
		const button = event.currentTarget as Element;
		if (button.hasPointerCapture?.(event.pointerId)) button.releasePointerCapture(event.pointerId);
		beginHold('pointer');
	}

	// While the button still gets the moves of a finger that has left it, a
	// move outside its box cancels the hold just as pointerleave would.
	function handleUnlockMove(event: PointerEvent): void {
		if (hold.phase !== 'holding') return;
		const box = (event.currentTarget as Element).getBoundingClientRect();
		if (box.width === 0 && box.height === 0) return;
		const outside =
			event.clientX < box.left ||
			event.clientX > box.right ||
			event.clientY < box.top ||
			event.clientY > box.bottom;
		if (outside) cancelHold();
	}

	function handleUnlockKey(event: KeyboardEvent): void {
		if (event.key !== 'Enter' && event.key !== ' ') return;
		event.preventDefault();
		if (event.type === 'keydown') beginHold('key');
		else cancelHold();
	}

	// A two-second hold of Enter or Space on "Lås op" unlocks and moves focus to
	// "Lås skærmen" while the key is still down. Enter's auto-repeat would then
	// click it at once, and Space's release would, locking the screen again. So
	// the lock button acts only on a key that went down on it: repeats are
	// dropped, and a Space released here that was pressed elsewhere is ignored.
	let lockKeyDown: string | null = null;

	function handleLockKey(event: KeyboardEvent): void {
		if (event.key !== 'Enter' && event.key !== ' ') return;
		if (event.type === 'keydown') {
			if (event.repeat) event.preventDefault();
			else lockKeyDown = event.key;
			return;
		}
		if (lockKeyDown !== event.key) event.preventDefault();
		lockKeyDown = null;
	}

	// Focus leaving the button ends a key hold: the key is no longer on it. A
	// finger's hold is ended by the finger, not by focus. Safari blurs a focused
	// button when it is pressed, and "Lås op" is focused on locking, so the
	// first press after locking used to be cancelled at once.
	function handleUnlockBlur(): void {
		if (holdBy === 'key') cancelHold();
	}

	// ---- Keyboard ------------------------------------------------------------

	function handleKeydown(event: KeyboardEvent): void {
		if (!open) return;
		if (event.key === 'Escape') {
			event.preventDefault();
			if (mode === 'locked') unlock();
			else if (mode === 'calibrate') mode = 'size';
			else close();
			return;
		}
		trapTab(event, rootEl);
	}
</script>

<svelte:window onkeydown={handleKeydown} onresize={handleResize} />

{#if open}
	<div
		bind:this={rootEl}
		class="trace"
		class:locked={mode === 'locked'}
		role="dialog"
		aria-modal="true"
		aria-labelledby="trace-title"
		tabindex="-1"
	>
		<h2 id="trace-title" class="sr-only">{t('traceTitle', lang, { name: heartName })}</h2>
		<p class="sr-only" aria-live="polite">{announcement}</p>

		<svg
			class="surface"
			width={vw}
			height={vh}
			viewBox="0 0 {vw} {vh}"
			aria-hidden="true"
			onpointerdown={handlePointerDown}
			onpointermove={handlePointerMove}
			onpointerup={handlePointerEnd}
			onpointercancel={handlePointerEnd}
			{@attach zoomOnWheel}
		>
			{#if mode === 'calibrate'}
				<rect
					class="card"
					x={card.x}
					y={card.y}
					width={card.width}
					height={card.height}
					rx={card.r}
					fill="none"
					stroke="#000"
					stroke-width="2"
				/>
			{:else}
				<!-- Exactly what TemplatePreview draws: ear, sides, dashed fold, cuts.
				     Stroke and dashes are divided by the scale so the line stays
				     2 px on screen at any size. -->
				<g
					class="template"
					data-testid="trace-template"
					transform="translate({view.x}, {view.y}) scale({view.s})"
					fill="none"
					stroke="#000"
					stroke-width={2 / view.s}
				>
					<path d={template.earPath} />
					<line x1={0} y1={template.earRadius} x2={0} y2={template.templateHeight} />
					<line
						x1={template.templateWidth}
						y1={template.earRadius}
						x2={template.templateWidth}
						y2={template.templateHeight}
					/>
					<line
						x1={0}
						y1={template.templateHeight}
						x2={template.templateWidth}
						y2={template.templateHeight}
						stroke-dasharray="{8 / view.s} {4 / view.s}"
					/>
					{#each template.cutPaths as d, i (i)}
						<path {d} />
					{/each}
					{#each marks as mark, i (i)}
						<path class="mark" data-mark={mark.kind} d={markPathData(mark)} stroke-width={1.5 / view.s} />
					{/each}
				</g>
			{/if}
		</svg>

		{#if mode === 'locked'}
			<div class="lock-layer" data-testid="trace-lock-layer" {@attach swallowTouches}></div>

			<div class="unlock" {@attach swallowTouches}>
				<div class="unlock-button-wrap">
					<svg class="hold-ring" width="68" height="68" viewBox="0 0 68 68" aria-hidden="true">
						<circle
							cx="34"
							cy="34"
							r={RING_RADIUS}
							fill="none"
							stroke-width="4"
							stroke-dasharray={RING_LENGTH}
							stroke-dashoffset={RING_LENGTH * (1 - progress)}
							transform="rotate(-90 34 34)"
						/>
					</svg>
					<button
						bind:this={unlockButton}
						class="unlock-button"
						type="button"
						aria-label={t('traceUnlock', lang)}
						aria-describedby="trace-hold-hint"
						onpointerdown={handleUnlockDown}
						onpointermove={handleUnlockMove}
						onpointerup={cancelHold}
						onpointercancel={cancelHold}
						onpointerleave={cancelHold}
						onkeydown={handleUnlockKey}
						onkeyup={handleUnlockKey}
						onblur={handleUnlockBlur}
					>
						<LockOpenIcon size={24} />
					</button>
				</div>
				<p id="trace-hold-hint" class="unlock-hint">{t('traceHoldToUnlock', lang)}</p>
			</div>
		{:else}
			<div class="chrome" bind:this={chromeEl}>
				<div class="toolbar" class:two-templates={twoTemplates && mode !== 'calibrate'}>
					<button class="btn btn-ghost btn-sm btn-icon close" type="button" aria-label={t('close', lang)} onclick={close}>
						<CloseIcon size={18} />
					</button>

					{#if mode === 'calibrate'}
						<label class="slider">
							<span class="slider-label">{t('traceCardSize', lang)}</span>
							<input
								type="range"
								min={MIN_CARD_PX}
								max={MAX_CARD_PX}
								step="1"
								bind:value={cardPx}
							/>
						</label>
						<button class="btn btn-primary btn-sm" type="button" onclick={finishCalibration}>
							{t('done', lang)}
						</button>
					{:else}
						<!-- Below 600 the toolbar is two rows; this starts the second. -->
						<span class="row-break" aria-hidden="true"></span>
						{#if twoTemplates}
							<div class="segmented" role="group" aria-label={t('template', lang)}>
								<button type="button" aria-pressed={lobe === 'left'} onclick={() => (lobe = 'left')}>
									{t('lobeLeft', lang)}
								</button>
								<button type="button" aria-pressed={lobe === 'right'} onclick={() => (lobe = 'right')}>
									{t('lobeRight', lang)}
								</button>
							</div>
						{/if}

						<!-- Named by aria-label, not by the <label>: the label wraps the
						     <output> too, which made the name "Bredde Bredde ca. 127 mm". The
						     readout reaches screen readers as the value text. -->
						<label class="slider">
							<input
								aria-label={t('traceSize', lang)}
								type="range"
								min={MIN_WIDTH_MM}
								max={MAX_WIDTH_MM}
								step="1"
								value={Math.round(widthMm)}
								aria-valuetext={readout}
								oninput={(e) => setWidthMm(Number(e.currentTarget.value))}
							/>
							<output class="readout">{readout}</output>
						</label>

						<button class="btn btn-outline btn-sm fit" type="button" onclick={fit} aria-label={t('traceFit', lang)}>
							<FitIcon size={18} />
							<span class="fit-label">{t('traceFit', lang)}</span>
						</button>
						<button class="btn btn-ghost btn-sm" type="button" onclick={startCalibration}>
							{t('traceCalibrate', lang)}
						</button>
						{#if calibrated}
							<span class="calibrated">{t('traceCalibrated', lang)}</span>
						{/if}
						<button
							bind:this={lockButton}
							class="btn btn-primary btn-sm lock"
							type="button"
							onclick={lock}
							onkeydown={handleLockKey}
							onkeyup={handleLockKey}
							onblur={() => (lockKeyDown = null)}
						>
							<LockIcon size={18} />
							{t('traceLock', lang)}
						</button>
					{/if}
				</div>
				<p class="hint">
					{mode === 'calibrate' ? t('traceCalibrateText', lang) : t('traceHint', lang)}
				</p>
			</div>
		{/if}
	</div>
{/if}

<style>
	/* Locked: nothing behind the tracing surface may scroll or bounce. */
	:global(html.tracing) {
		overflow: hidden;
		overscroll-behavior: none;
	}

	/* Pure white and pure black are the tracing surface itself (TRACE.md):
	   the brightest light through the paper and the darkest line on it. */
	.trace {
		position: fixed;
		inset: 0;
		/* Above the nav (60) and level with Modal: nothing else is open meanwhile. */
		z-index: 1000;
		background: #fff;
		touch-action: none;
		overscroll-behavior: none;
		user-select: none;
		-webkit-user-select: none;
		-webkit-touch-callout: none;
	}

	.trace:focus {
		outline: none;
	}

	.surface {
		position: absolute;
		inset: 0;
		display: block;
		cursor: grab;
	}

	.surface:active {
		cursor: grabbing;
	}

	.locked .surface {
		cursor: default;
	}

	.chrome {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
	}

	.toolbar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px 10px;
		padding: calc(10px + env(safe-area-inset-top)) calc(16px + env(safe-area-inset-right)) 10px
			calc(16px + env(safe-area-inset-left));
		background: var(--white);
		border-bottom: 1px solid var(--line);
	}

	.lock {
		margin-left: auto;
	}

	.slider {
		display: flex;
		align-items: center;
		gap: 10px;
		flex: 1 1 220px;
		min-width: 0;
		color: var(--ink);
		font-size: 14px;
	}

	.slider input {
		flex: 1;
		min-width: 80px;
		accent-color: var(--red);
	}

	.slider-label,
	.readout {
		white-space: nowrap;
		font-variant-numeric: tabular-nums;
	}

	.calibrated {
		color: var(--green);
		font-size: 13px;
	}

	.segmented {
		display: inline-flex;
		border: 1.5px solid var(--line);
		border-radius: 10px;
		overflow: hidden;
	}

	.segmented button {
		height: 37px;
		padding: 0 14px;
		border: 0;
		background: var(--white);
		color: var(--green);
		font: inherit;
		font-size: 14px;
		font-weight: 600;
		cursor: pointer;
	}

	.segmented button + button {
		border-left: 1.5px solid var(--line);
	}

	.segmented button[aria-pressed='true'] {
		background: var(--green);
		color: var(--white);
	}

	/* Over the drawing surface but not part of it: a drag that starts on the
	   hint still moves the template. */
	.hint {
		pointer-events: none;
		margin: 0;
		padding: 8px 16px;
		color: var(--muted);
		font-size: 14px;
		text-align: center;
	}

	.row-break {
		display: none;
	}

	/* Below 600 the toolbar wraps: the buttons, then the Venstre / Højre switch
	   when there is one, then the slider across the full width, so its 30–200 mm
	   are not squeezed into a few px beside the switch. The buttons tighten and
	   "Tilpas" keeps only its icon so the first row holds all four on a 375px
	   phone; every target is 44px, the size of a fingertip. */
	@media (max-width: 599px) {
		.toolbar {
			gap: 8px;
		}

		.toolbar .btn-sm {
			height: 44px;
		}

		.toolbar .btn-sm:not(.btn-icon) {
			padding: 0 12px;
		}

		.segmented button {
			height: 41px;
		}

		.toolbar .fit {
			aspect-ratio: 1;
			padding: 0;
		}

		.fit-label {
			display: none;
		}

		.row-break {
			display: block;
			order: 9;
			flex-basis: 100%;
			height: 0;
		}

		.segmented {
			order: 10;
		}

		/* Beside the switch when there is one, else a short line of its own. */
		.calibrated {
			order: 11;
			flex: 1 1 auto;
		}

		.slider {
			order: 12;
			flex: 1 1 100%;
		}

		.slider input {
			height: 44px;
			margin: 0;
		}

		/* With the switch, the readout moves up beside it and the slider has
		   the last row to itself. */
		.two-templates .slider {
			display: contents;
		}

		.two-templates .readout {
			order: 11;
			margin-left: auto;
		}

		.two-templates .slider input {
			order: 13;
			flex: 1 1 100%;
		}
	}

	.lock-layer {
		position: absolute;
		inset: 0;
		touch-action: none;
		overscroll-behavior: none;
		user-select: none;
		-webkit-user-select: none;
	}

	.unlock {
		position: absolute;
		right: calc(16px + env(safe-area-inset-right));
		bottom: calc(12px + env(safe-area-inset-bottom));
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
		touch-action: none;
	}

	.unlock-button-wrap {
		position: relative;
		width: 68px;
		height: 68px;
		display: grid;
		place-items: center;
	}

	/* Not `.ring`: that is a Tailwind utility, and it drew a square box-shadow
	   round the button — a stray line on the one surface meant for tracing. */
	.hold-ring {
		position: absolute;
		inset: 0;
		stroke: var(--red);
		pointer-events: none;
	}

	.unlock-button {
		width: 56px;
		height: 56px;
		border: 0;
		border-radius: 50%;
		display: grid;
		place-items: center;
		background: var(--deep);
		color: var(--white);
		cursor: pointer;
		touch-action: none;
		-webkit-touch-callout: none;
	}

	/* A light pill, so the words stay legible where they cross the template's lines. */
	.unlock-hint {
		margin: 0;
		padding: 2px 8px;
		border-radius: 999px;
		background: rgb(255 255 255 / 0.85);
		color: var(--muted);
		font-size: 12px;
		white-space: nowrap;
	}
</style>
