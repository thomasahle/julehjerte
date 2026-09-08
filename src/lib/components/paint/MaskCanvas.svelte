<!--
  The mask, drawn as the heart it will become, and painted on directly
  (docs/redesign/PAINT.md §2 and §8).

  What is on screen: the two lobes in the paper colours, the woven square turned
  a quarter of a right angle between them carrying the mask cell for cell, a
  faint outline of that square, and the mirror lines of whichever symmetries are
  on. Painting happens on the square; outside it the pointer does nothing, because
  outside it there is no cell to paint.

  Two canvases. The mask lives in an offscreen one as an ImageData, so a stroke
  rewrites only the cells it changed (`putImageData` takes the box the tool
  reported); the visible canvas redraws lobes and square once per animation
  frame, which is once per batch of pointer events however many arrived. That is
  the other half of why the session holds the mask with `$state.raw`: painting is
  invisible to reactivity by design, and this component repaints itself.

  `revision` is how the page says the mask changed behind our back — undo, Ryd,
  an import, a symmetry fold. Bumping it repaints everything.
-->
<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { t, type Language } from '$lib/i18n';
	import type { HeartColors } from '$lib/types/heart';
	import { clampBox, emptyBox, isEmptyBox, unionBox, type Box, type Mask } from '$lib/paint/mask';
	import { applySymmetric, floodFill, rect, stroke } from '$lib/paint/tools';
	import { transformsFor, type SymmetrySettings } from '$lib/paint/symmetry';
	import { fitHeart, insideSquare, toMask, type HeartLayout, type Pt } from '$lib/paint/heartLayout';
	import { shortcutFor, type PaintAction, type PaintTool } from '$lib/paint/toolset';

	interface Props {
		mask: Mask | null;
		colors: HeartColors;
		symmetry: SymmetrySettings;
		tool: PaintTool;
		/** Brush radius in mask cells. */
		brush: number;
		/** Which paper the pen lays down; the eraser always lays down 0. */
		paintValue: 0 | 1;
		/** Bumped by the page when the mask changed other than by painting. */
		revision: number;
		/** No pointer input while the engine is working (PAINT.md §2). */
		disabled?: boolean;
		/**
		 * A dialog has the keyboard: the shortcuts stand down, the pointer does not.
		 *
		 * The key handler is on the window, and the site `Modal` stops nothing but
		 * Escape, so without this a P or an X would change the tool behind the scrim
		 * and Cmd/Ctrl+Z would undo the very mask the dialog is asking about — while
		 * swallowing the browser's own Undo inside the dialog's own fields.
		 */
		keyboardBusy?: boolean;
		/** A gesture is about to change the mask: the moment to snapshot for undo. */
		onEditStart: () => void;
		/** The gesture is over and the mask has changed. */
		onEditEnd: () => void;
		/** A keystroke the canvas recognised; the page owns the state it changes. */
		onShortcut: (action: PaintAction) => void;
		lang: Language;
	}

	let {
		mask,
		colors,
		symmetry,
		tool,
		brush,
		paintValue,
		revision,
		disabled = false,
		keyboardBusy = false,
		onEditStart,
		onEditEnd,
		onShortcut,
		lang
	}: Props = $props();

	/** Air between the heart and the edges of the drawing band. */
	const PADDING = 24;

	let boxEl = $state.raw<HTMLDivElement | null>(null);
	let canvasEl = $state.raw<HTMLCanvasElement | null>(null);
	let boxWidth = $state(0);
	let boxHeight = $state(0);

	// The mask as pixels. Kept for the life of one mask, so a stroke costs one
	// putImageData of its own box and nothing else.
	let offscreen: HTMLCanvasElement | null = null;
	let offscreenData: ImageData | null = null;
	let offscreenFor: Mask | null = null;

	let layout = $derived<HeartLayout>(fitHeart(boxWidth, boxHeight, PADDING));
	let transforms = $derived(transformsFor(symmetry));
	let paper = $derived([channels(colors.left), channels(colors.right)]);

	// The gesture in progress. `preview` is the line or rectangle being dragged,
	// drawn over the mask until the pointer comes up and it is committed.
	let pointerId: number | null = null;
	let last: Pt | null = null;
	let start: Pt | null = null;
	let preview: { from: Pt; to: Pt } | null = null;
	let frame = 0;

	/** The design tokens the canvas paints with, read once from the document. */
	let chrome: { outline: string; mirror: string } | null = null;

	function tokens(): { outline: string; mirror: string } {
		if (chrome) return chrome;
		const style = getComputedStyle(canvasEl ?? document.documentElement);
		const deep = style.getPropertyValue('--deep-rgb').trim();
		const blue = style.getPropertyValue('--blue').trim();
		// No fallback colours: a token that is not there draws nothing rather than
		// putting a colour on the page that the stylesheet never named.
		chrome = {
			outline: deep ? `rgb(${deep} / 0.3)` : 'transparent',
			mirror: blue || 'transparent'
		};
		return chrome;
	}

	/** A CSS colour as RGB channels, through the browser's own parser. */
	function channels(colour: string): number[] {
		if (typeof document === 'undefined') return [0, 0, 0];
		const probe = document.createElement('canvas').getContext('2d');
		if (!probe) return [0, 0, 0];
		probe.fillStyle = colour;
		const value = probe.fillStyle;
		if (typeof value === 'string' && value.startsWith('#')) {
			return [1, 3, 5].map((i) => parseInt(value.slice(i, i + 2), 16));
		}
		const parts = String(value).match(/\d+(?:\.\d+)?/g);
		return parts ? parts.slice(0, 3).map((v) => Math.round(Number(v))) : [0, 0, 0];
	}

	/** The value the current tool lays down. */
	function toolValue(): 0 | 1 {
		return tool === 'eraser' ? 0 : paintValue;
	}

	function paint(): void {
		if (!canvasEl) return;
		const dpr = Math.min(3, Math.max(1, window.devicePixelRatio || 1));
		const w = Math.max(1, Math.round(boxWidth * dpr));
		const h = Math.max(1, Math.round(boxHeight * dpr));
		if (canvasEl.width !== w || canvasEl.height !== h) {
			canvasEl.width = w;
			canvasEl.height = h;
		}
		const ctx = canvasEl.getContext('2d');
		if (!ctx) return;
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		ctx.clearRect(0, 0, boxWidth, boxHeight);

		// From here on the context works in square units: (0,0) is the heart's top
		// cleft, (1,1) its bottom tip, and the quarter turn is in the matrix.
		ctx.save();
		ctx.translate(layout.cx, layout.cy);
		ctx.rotate(Math.PI / 4);
		ctx.scale(layout.scale, layout.scale);
		ctx.translate(-0.5, -0.5);

		// The lobes: a half-disc off the square's left edge in the left paper, one
		// off its top edge in the right paper. The square itself is the mask.
		ctx.fillStyle = colors.left;
		ctx.beginPath();
		ctx.arc(0, 0.5, 0.5, Math.PI / 2, -Math.PI / 2);
		ctx.closePath();
		ctx.fill();

		ctx.fillStyle = colors.right;
		ctx.beginPath();
		ctx.arc(0.5, 0, 0.5, Math.PI, 0);
		ctx.closePath();
		ctx.fill();

		if (offscreen) {
			// Cells, not a photograph: smoothing would blur the edge the visitor
			// just painted into a colour neither paper explains. The outline below
			// covers the stair-steps the turn leaves along the square's own edges.
			ctx.imageSmoothingEnabled = false;
			ctx.drawImage(offscreen, 0, 0, 1, 1);
			ctx.imageSmoothingEnabled = true;
		}

		drawPreview(ctx);

		// A faint edge, so the square reads as the woven part even where the mask
		// happens to be the same colour as the lobe beside it.
		ctx.lineWidth = 1.5 / layout.scale;
		ctx.strokeStyle = tokens().outline;
		ctx.strokeRect(0, 0, 1, 1);

		drawMirrorLines(ctx);
		ctx.restore();
	}

	/** The line or rectangle under the pointer, before it is committed. */
	function drawPreview(ctx: CanvasRenderingContext2D): void {
		if (!preview || !mask) return;
		const from = { x: preview.from.x / mask.size, y: preview.from.y / mask.size };
		const to = { x: preview.to.x / mask.size, y: preview.to.y / mask.size };
		const colour = toolValue() ? colors.right : colors.left;
		ctx.save();
		ctx.globalAlpha = 0.7;
		if (tool === 'rect') {
			ctx.fillStyle = colour;
			ctx.fillRect(from.x, from.y, to.x - from.x, to.y - from.y);
		} else {
			ctx.strokeStyle = colour;
			ctx.lineCap = 'round';
			ctx.lineWidth = (2 * brush + 1) / mask.size;
			ctx.beginPath();
			ctx.moveTo(from.x, from.y);
			ctx.lineTo(to.x, to.y);
			ctx.stroke();
		}
		ctx.restore();
	}

	/**
	 * The mirror lines of the symmetries that are on, in heart orientation
	 * (PAINT.md §5's table). Mellem lapper is a diagonal of the square, which the
	 * turn makes the heart's own centre line; Inden i lap and Inden i kurve are
	 * the square's centre lines, which the turn makes the diamond's diagonals. A
	 * half turn is a point symmetry with no line, so it draws none.
	 */
	function drawMirrorLines(ctx: CanvasRenderingContext2D): void {
		const lines: [number, number, number, number][] = [];
		if (transforms.includes('transpose')) lines.push([0, 0, 1, 1]);
		if (transforms.includes('antiTranspose')) lines.push([1, 0, 0, 1]);
		if (transforms.includes('mirrorX')) lines.push([0.5, 0, 0.5, 1]);
		if (transforms.includes('mirrorY')) lines.push([0, 0.5, 1, 0.5]);
		if (!lines.length) return;
		ctx.save();
		ctx.strokeStyle = tokens().mirror;
		ctx.lineWidth = 1.5 / layout.scale;
		ctx.setLineDash([7 / layout.scale, 5 / layout.scale]);
		for (const [x0, y0, x1, y1] of lines) {
			ctx.beginPath();
			ctx.moveTo(x0, y0);
			ctx.lineTo(x1, y1);
			ctx.stroke();
		}
		ctx.restore();
	}

	/** One frame per batch of events, never one per event. */
	function schedule(): void {
		if (frame) return;
		frame = requestAnimationFrame(() => {
			frame = 0;
			paint();
		});
	}

	/** Rewrite the offscreen picture, or just the box a tool reported changing. */
	function syncOffscreen(box?: Box): void {
		if (!mask || typeof document === 'undefined') return;
		let area = box;
		if (offscreenFor !== mask || !offscreen || !offscreenData) {
			offscreen = document.createElement('canvas');
			offscreen.width = offscreen.height = mask.size;
			offscreenData = new ImageData(mask.size, mask.size);
			offscreenFor = mask;
			area = undefined;
		}
		const ctx = offscreen.getContext('2d');
		if (!ctx) return;
		const clipped = area ? clampBox(mask, area.x0, area.y0, area.x1, area.y1) : null;
		const x0 = clipped ? clipped.x0 : 0;
		const y0 = clipped ? clipped.y0 : 0;
		const x1 = clipped ? clipped.x1 : mask.size;
		const y1 = clipped ? clipped.y1 : mask.size;
		if (x1 <= x0 || y1 <= y0) return;

		const pixels = offscreenData.data;
		const [left, right] = paper;
		for (let y = y0; y < y1; y++) {
			const row = y * mask.size;
			for (let x = x0; x < x1; x++) {
				const i = row + x;
				// Only 1 is the right paper. A value the mask may grow (a "free" cell,
				// PAINT.md §11) is neither paper and must not be painted as if it were.
				const colour = mask.data[i] === 1 ? right! : left!;
				pixels[4 * i] = colour[0]!;
				pixels[4 * i + 1] = colour[1]!;
				pixels[4 * i + 2] = colour[2]!;
				pixels[4 * i + 3] = 255;
			}
		}
		ctx.putImageData(offscreenData, 0, 0, x0, y0, x1 - x0, y1 - y0);
	}

	/** Where a pointer event lands, in mask cells. */
	function pointAt(event: { clientX: number; clientY: number }): Pt | null {
		if (!canvasEl || !mask) return null;
		const bounds = canvasEl.getBoundingClientRect();
		return toMask(layout, mask.size, event.clientX - bounds.left, event.clientY - bounds.top);
	}

	/** Spread what a tool painted under the active symmetries, then repaint it. */
	function commit(box: Box, value: 0 | 1): void {
		if (!mask || isEmptyBox(box)) return;
		const changed = transforms.length ? applySymmetric(mask, box, transforms, value) : box;
		syncOffscreen(changed);
		schedule();
	}

	function onPointerDown(event: PointerEvent): void {
		if (disabled || !mask || pointerId !== null || event.button !== 0) return;
		const point = pointAt(event);
		if (!point || !insideSquare(point, mask.size)) return;
		pointerId = event.pointerId;
		canvasEl?.setPointerCapture(event.pointerId);
		onEditStart();
		const value = toolValue();
		if (tool === 'fill') {
			commit(floodFill(mask, point.x, point.y, value), value);
			finish();
			return;
		}
		if (tool === 'line' || tool === 'rect') {
			start = point;
			preview = { from: point, to: point };
			schedule();
			return;
		}
		last = point;
		commit(stroke(mask, point, point, { radius: brush, value }), value);
	}

	function onPointerMove(event: PointerEvent): void {
		if (pointerId !== event.pointerId || !mask) return;
		if (tool === 'line' || tool === 'rect') {
			const point = pointAt(event);
			if (!point || !start) return;
			preview = { from: start, to: point };
			schedule();
			return;
		}
		// Every position the browser saw since the last frame, so a fast stroke is
		// a line and not a row of dots.
		const coalesced = event.getCoalescedEvents?.();
		const steps = coalesced?.length ? coalesced : [event];
		const value = toolValue();
		let changed = emptyBox();
		for (const step of steps) {
			const point = pointAt(step);
			if (!point) continue;
			if (last) changed = unionBox(changed, stroke(mask, last, point, { radius: brush, value }));
			last = point;
		}
		commit(changed, value);
	}

	function onPointerUp(event: PointerEvent): void {
		if (pointerId !== event.pointerId || !mask) return;
		if ((tool === 'line' || tool === 'rect') && start) {
			const point = pointAt(event) ?? start;
			const value = toolValue();
			preview = null;
			commit(
				tool === 'rect'
					? rect(mask, start, point, value)
					: stroke(mask, start, point, { radius: brush, value }),
				value
			);
		}
		finish();
	}

	function onPointerCancel(event: PointerEvent): void {
		// A cancelled drag drops its preview; anything already painted stays, and
		// the visitor undoes it if they did not want it.
		if (pointerId !== event.pointerId) return;
		finish();
	}

	function finish(): void {
		if (pointerId !== null && canvasEl?.hasPointerCapture(pointerId)) {
			canvasEl.releasePointerCapture(pointerId);
		}
		pointerId = null;
		start = null;
		last = null;
		preview = null;
		schedule();
		onEditEnd();
	}

	function onKeyDown(event: KeyboardEvent): void {
		if (disabled || keyboardBusy) return;
		const target = event.target as HTMLElement | null;
		// Never while the visitor is typing in a field: "r" is a letter there.
		if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) {
			return;
		}
		const action = shortcutFor(event);
		if (!action) return;
		event.preventDefault();
		onShortcut(action);
	}

	onMount(() => {
		if (!boxEl) return;
		const element = boxEl;
		const measure = () => {
			const bounds = element.getBoundingClientRect();
			boxWidth = bounds.width;
			boxHeight = bounds.height;
		};
		measure();
		if (typeof ResizeObserver === 'undefined') {
			window.addEventListener('resize', measure, { passive: true });
			return () => window.removeEventListener('resize', measure);
		}
		const observer = new ResizeObserver(measure);
		observer.observe(element);
		return () => {
			observer.disconnect();
			if (frame) cancelAnimationFrame(frame);
		};
	});

	// The offscreen picture follows the mask and the paper. `revision` is in here
	// for the changes reactivity cannot see: the cells are a raw Uint8Array, so
	// undo, Ryd and a symmetry fold are invisible until the page says so.
	$effect(() => {
		void mask;
		void revision;
		void paper;
		untrack(() => {
			offscreenFor = null;
			syncOffscreen();
			schedule();
		});
	});

	// The visible canvas follows everything else it draws.
	$effect(() => {
		void colors.left;
		void colors.right;
		void transforms;
		void boxWidth;
		void boxHeight;
		void revision;
		untrack(schedule);
	});

	let label = $derived(
		mask ? t('paintCanvasLabel', lang, { size: mask.size }) : t('paintCanvasEmptyLabel', lang)
	);
</script>

<svelte:window onkeydown={onKeyDown} />

<!-- The name is on the box rather than on the <canvas>: a canvas already counts
     as an interactive element, so role="img" on it is an invalid override, and
     the accessible name belongs on something that is only a picture. -->
<div class="mask-canvas" bind:this={boxEl} role="img" aria-label={label}>
	<canvas
		bind:this={canvasEl}
		class:disabled
		onpointerdown={onPointerDown}
		onpointermove={onPointerMove}
		onpointerup={onPointerUp}
		onpointercancel={onPointerCancel}
	></canvas>
</div>

<style>
	.mask-canvas {
		position: absolute;
		inset: 0;
	}

	canvas {
		display: block;
		width: 100%;
		height: 100%;
		/* Painting on the diamond must not scroll the page under the finger. */
		touch-action: none;
		cursor: crosshair;
	}

	canvas.disabled {
		cursor: progress;
	}
</style>
