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
	import { applySymmetric, applySymmetricEdit, floodFill, rect, stroke } from '$lib/paint/tools';
	import {
		GRAB_PX,
		HANDLES,
		HANDLE_PX,
		ROTATE_GAP_PX,
		clear as clearSelection,
		commit as commitCells,
		contains,
		cornerAt,
		corners,
			lift,
		moveBy,
		rectFrom,
		rotateHandleAt,
		rotateTo,
		scaleTo,
		type Edit,
		type Handle,
		type Placement,
		type Selection
	} from '$lib/paint/selection';
	import { transformsFor, type SymmetrySettings } from '$lib/paint/symmetry';
	import { colourChannels } from '$lib/paint/drawHeart';
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

	/** The site's own paper, as the last resort of `channels` below. */
	const FALLBACK_PAPER = {
		left: Uint8ClampedArray.of(255, 255, 255, 255),
		right: Uint8ClampedArray.of(185, 19, 19, 255)
	};

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
	let paper = $derived([
		channels(colors.left, FALLBACK_PAPER.left),
		channels(colors.right, FALLBACK_PAPER.right)
	]);

	// The gesture in progress. `preview` is the line or rectangle being dragged,
	// drawn over the mask until the pointer comes up and it is committed.
	let pointerId: number | null = null;
	let last: Pt | null = null;
	let start: Pt | null = null;
	let preview: { from: Pt; to: Pt } | null = null;
	let frame = 0;

	// Markér. The mask is not touched while a selection floats: `selection` holds a
	// copy of the cells and where they stand now, and only a commit writes. That is
	// what makes Escape free and undo one snapshot per commit instead of one per
	// drag. None of this is `$state` — like `preview`, it is drawn by `paint()` and
	// nothing outside this component reads it.
	let selection: Selection | null = null;
	let selectionDrag:
		| { kind: 'marquee'; from: Pt }
		| { kind: 'move'; grab: Pt; origin: Placement }
		| { kind: 'scale'; handle: Handle; origin: Placement }
		| { kind: 'rotate' }
		| null = null;
	/** The frame being dragged out, before there are any cells in it. */
	let marquee: { from: Pt; to: Pt } | null = null;
	// The floating cells as a picture, kept for the life of one selection so that
	// dragging it around costs no more than dragging an image around.
	let patch: HTMLCanvasElement | null = null;
	let patchFor: Selection | null = null;

	/** The design tokens the canvas paints with, read once from the document. */
	let chrome: { outline: string; mirror: string; marquee: string; paper: string } | null = null;

	function tokens(): { outline: string; mirror: string; marquee: string; paper: string } {
		if (chrome) return chrome;
		const style = getComputedStyle(canvasEl ?? document.documentElement);
		const deep = style.getPropertyValue('--deep-rgb').trim();
		const blue = style.getPropertyValue('--blue').trim();
		const green = style.getPropertyValue('--green').trim();
		const white = style.getPropertyValue('--white').trim();
		// No fallback colours: a token that is not there draws nothing rather than
		// putting a colour on the page that the stylesheet never named.
		chrome = {
			outline: deep ? `rgb(${deep} / 0.3)` : 'transparent',
			mirror: blue || 'transparent',
			marquee: green || 'transparent',
			paper: white || 'transparent'
		};
		return chrome;
	}

	/** One screen pixel, in mask cells — what the marquee's chrome is measured in. */
	function cellsPerPixel(): number {
		if (!mask || !layout.scale) return 1;
		return mask.size / layout.scale;
	}

	/**
	 * The paper a colour is painted with, or the site's own when it cannot be
	 * read — on the server, or for a colour the browser refuses. The mask has to
	 * be drawn in *something*, and two hearts in the wrong shade of red are
	 * better than a hole in the diamond.
	 */
	function channels(colour: string, fallback: Uint8ClampedArray): Uint8ClampedArray {
		return colourChannels(colour) ?? fallback;
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
		drawSelection(ctx);

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

	/** The floating cells as a picture, built once per selection. */
	function patchImage(sel: Selection): HTMLCanvasElement | null {
		if (patchFor === sel && patch) return patch;
		if (typeof document === 'undefined') return null;
		const w = sel.source.x1 - sel.source.x0;
		const h = sel.source.y1 - sel.source.y0;
		const canvas = document.createElement('canvas');
		canvas.width = w;
		canvas.height = h;
		const ctx = canvas.getContext('2d');
		if (!ctx) return null;
		const image = new ImageData(w, h);
		const [left, right] = paper;
		for (let i = 0; i < sel.cells.length; i++) {
			const colour = sel.cells[i] === 1 ? right! : left!;
			image.data[4 * i] = colour[0]!;
			image.data[4 * i + 1] = colour[1]!;
			image.data[4 * i + 2] = colour[2]!;
			image.data[4 * i + 3] = 255;
		}
		ctx.putImageData(image, 0, 0);
		patch = canvas;
		patchFor = sel;
		return canvas;
	}

	/**
	 * Markér, as it stands: the hole the cells were lifted from, the cells where
	 * they are now, and the frame with its handles.
	 *
	 * All of it in square units, so the marquee is turned with the diamond and sits
	 * on the cells it describes; the chrome divides by `layout.scale` so that a
	 * handle is the same size on screen however large the heart is drawn.
	 */
	function drawSelection(ctx: CanvasRenderingContext2D): void {
		if (!mask) return;
		const size = mask.size;

		if (marquee) {
			const r = rectFrom(marquee.from, marquee.to, mask);
			frameOf(ctx, [
				{ x: r.x0 / size, y: r.y0 / size },
				{ x: r.x1 / size, y: r.y0 / size },
				{ x: r.x1 / size, y: r.y1 / size },
				{ x: r.x0 / size, y: r.y1 / size }
			]);
			return;
		}
		if (!selection) return;

		// The area it came from is already paper: the mask itself still holds the
		// cells, so the hole has to be drawn rather than read.
		const { source, placement } = selection;
		ctx.save();
		ctx.fillStyle = colors.left;
		ctx.fillRect(
			source.x0 / size,
			source.y0 / size,
			(source.x1 - source.x0) / size,
			(source.y1 - source.y0) / size
		);

		const image = patchImage(selection);
		if (image) {
			ctx.translate(placement.cx / size, placement.cy / size);
			ctx.rotate(placement.angle);
			// Cells, not a photograph — the same reason the mask itself is drawn
			// unsmoothed, and what makes the preview show the nearest-neighbour
			// picture the commit will actually lay down.
			ctx.imageSmoothingEnabled = false;
			ctx.drawImage(
				image,
				-placement.width / (2 * size),
				-placement.height / (2 * size),
				placement.width / size,
				placement.height / size
			);
			ctx.imageSmoothingEnabled = true;
		}
		ctx.restore();

		frameOf(
			ctx,
			corners(placement).map((c) => ({ x: c.x / size, y: c.y / size }))
		);
		drawHandles(ctx, placement);
	}

	/**
	 * A dashed frame that shows on both papers: a solid pale line first, the dashes
	 * over it, so neither a white nor a red field can swallow the whole marquee.
	 */
	function frameOf(ctx: CanvasRenderingContext2D, path: Pt[]): void {
		if (path.length < 2) return;
		const ink = tokens();
		ctx.save();
		const trace = () => {
			ctx.beginPath();
			ctx.moveTo(path[0]!.x, path[0]!.y);
			for (let i = 1; i < path.length; i++) ctx.lineTo(path[i]!.x, path[i]!.y);
			ctx.closePath();
			ctx.stroke();
		};
		ctx.lineWidth = 3 / layout.scale;
		ctx.strokeStyle = ink.paper;
		trace();
		ctx.lineWidth = 1.5 / layout.scale;
		ctx.strokeStyle = ink.marquee;
		ctx.setLineDash([6 / layout.scale, 4 / layout.scale]);
		trace();
		ctx.restore();
	}

	/** The four corner grips and the turner above the frame. */
	function drawHandles(ctx: CanvasRenderingContext2D, placement: Placement): void {
		if (!mask) return;
		const size = mask.size;
		const ink = tokens();
		const side = HANDLE_PX / layout.scale;
		const stalk = rotateHandleAt(placement, ROTATE_GAP_PX * cellsPerPixel());
		const top = {
			x: (cornerAt(placement, 'nw').x + cornerAt(placement, 'ne').x) / (2 * size),
			y: (cornerAt(placement, 'nw').y + cornerAt(placement, 'ne').y) / (2 * size)
		};

		ctx.save();
		ctx.lineWidth = 1.5 / layout.scale;
		ctx.strokeStyle = ink.marquee;
		ctx.fillStyle = ink.paper;

		ctx.beginPath();
		ctx.moveTo(top.x, top.y);
		ctx.lineTo(stalk.x / size, stalk.y / size);
		ctx.stroke();

		for (const handle of HANDLES) {
			const c = cornerAt(placement, handle);
			ctx.beginPath();
			ctx.rect(c.x / size - side / 2, c.y / size - side / 2, side, side);
			ctx.fill();
			ctx.stroke();
		}

		ctx.beginPath();
		ctx.arc(stalk.x / size, stalk.y / size, side / 1.6, 0, 2 * Math.PI);
		ctx.fill();
		ctx.stroke();
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

	/**
	 * What the pointer would take hold of: the turner, one corner, the patch
	 * itself, or nothing — which is the click that puts the selection down.
	 */
	function grabAt(point: Pt): Handle | 'rotate' | 'inside' | null {
		if (!selection) return null;
		const reach = GRAB_PX * cellsPerPixel();
		const turner = rotateHandleAt(selection.placement, ROTATE_GAP_PX * cellsPerPixel());
		if (Math.hypot(point.x - turner.x, point.y - turner.y) <= reach) return 'rotate';
		for (const handle of HANDLES) {
			const c = cornerAt(selection.placement, handle);
			if (Math.hypot(point.x - c.x, point.y - c.y) <= reach) return handle;
		}
		return contains(selection.placement, point) ? 'inside' : null;
	}

	/**
	 * Spread a selection's edit under the active symmetries.
	 *
	 * Unlike a stroke this lays down both papers at once — the vacated area is 0,
	 * what was put down may be either — so it cannot be spread by colour the way
	 * `applySymmetric` spreads a stroke. `applySymmetricEdit` takes the marks the
	 * commit left instead, and mirrors what the visitor put down over the hole it
	 * came from rather than the other way round.
	 */
	function spread(edit: Edit): void {
		if (!mask || isEmptyBox(edit.box)) return;
		const changed = transforms.length
			? applySymmetricEdit(mask, edit.box, edit.marks, transforms)
			: edit.box;
		syncOffscreen(changed);
	}

	/** Forget the floating patch without writing anything — Escape, or a new mask. */
	function dropSelection(): void {
		selection = null;
		selectionDrag = null;
		marquee = null;
		patch = null;
		patchFor = null;
	}

	/**
	 * Put the selection down (or, with `erase`, throw its cells away). One undo
	 * snapshot per commit, taken here rather than on pointer down, because every
	 * drag before this one left the mask exactly as it found it.
	 */
	function endSelection(erase = false): void {
		const sel = selection;
		dropSelection();
		if (sel && mask) {
			onEditStart();
			spread(erase ? clearSelection(mask, sel) : commitCells(mask, sel));
			schedule();
			onEditEnd();
			return;
		}
		schedule();
	}

	/** The selection tool's own gestures; the painting tools never reach this. */
	function selectPointerDown(event: PointerEvent, point: Pt): void {
		if (!mask) return;
		const grab = grabAt(point);
		if (grab && selection) {
			pointerId = event.pointerId;
			canvasEl?.setPointerCapture(event.pointerId);
			selectionDrag =
				grab === 'rotate'
					? { kind: 'rotate' }
					: grab === 'inside'
						? { kind: 'move', grab: point, origin: { ...selection.placement } }
						: { kind: 'scale', handle: grab, origin: { ...selection.placement } };
			return;
		}
		// A press anywhere else is the "click outside" that commits — and, when it
		// lands on the square, the start of the next frame in the same gesture.
		if (selection) endSelection();
		if (!insideSquare(point, mask.size)) return;
		pointerId = event.pointerId;
		canvasEl?.setPointerCapture(event.pointerId);
		selectionDrag = { kind: 'marquee', from: point };
		marquee = { from: point, to: point };
		schedule();
	}

	function selectPointerMove(point: Pt, shift: boolean): void {
		const drag = selectionDrag;
		if (!drag) return;
		if (drag.kind === 'marquee') marquee = { from: drag.from, to: point };
		else if (selection) {
			if (drag.kind === 'move') {
				selection.placement = moveBy(drag.origin, point.x - drag.grab.x, point.y - drag.grab.y);
			} else if (drag.kind === 'scale') {
				// Uniform by default and free with Shift: the mask is a picture, and
				// stretching one axis of it is the rarer of the two wishes.
				selection.placement = scaleTo(drag.origin, drag.handle, point, !shift);
			} else {
				selection.placement = rotateTo(selection.placement, point);
			}
		}
		schedule();
	}

	function selectPointerUp(point: Pt): void {
		if (selectionDrag?.kind === 'marquee' && marquee && mask) {
			const framed = rectFrom(marquee.from, point, mask);
			marquee = null;
			// A click is not a one-cell selection: it is how the visitor says "put it
			// down and select nothing", so anything this small selects nothing.
			const tiny = framed.x1 - framed.x0 < 2 && framed.y1 - framed.y0 < 2;
			selection = tiny ? null : lift(mask, framed);
			patch = null;
			patchFor = null;
		}
		selectionDrag = null;
		releasePointer();
		schedule();
	}

	function onPointerDown(event: PointerEvent): void {
		if (disabled || !mask || pointerId !== null || event.button !== 0) return;
		const point = pointAt(event);
		if (!point) return;
		if (tool === 'select') {
			selectPointerDown(event, point);
			return;
		}
		if (!insideSquare(point, mask.size)) return;
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
		if (tool === 'select') {
			const point = pointAt(event);
			if (point) selectPointerMove(point, event.shiftKey);
			return;
		}
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
		if (tool === 'select') {
			selectPointerUp(pointAt(event) ?? marquee?.to ?? { x: 0, y: 0 });
			return;
		}
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
		if (tool === 'select') {
			// The floating patch stays exactly where the drag left it; nothing has
			// been written, so there is nothing to take back.
			selectionDrag = null;
			marquee = null;
			releasePointer();
			schedule();
			return;
		}
		finish();
	}

	/** Give the pointer back and forget the gesture, without ending an edit. */
	function releasePointer(): void {
		if (pointerId !== null && canvasEl?.hasPointerCapture(pointerId)) {
			canvasEl.releasePointerCapture(pointerId);
		}
		pointerId = null;
		start = null;
		last = null;
		preview = null;
	}

	function finish(): void {
		releasePointer();
		schedule();
		onEditEnd();
	}

	/**
	 * A press anywhere off the canvas puts the selection down.
	 *
	 * "Clicking outside commits" has to mean outside the page's drawing, not just
	 * outside the marquee: pressing Find snit with a patch still floating would
	 * otherwise search the mask as it was before the move and then unmount the
	 * canvas, and the visitor's edit would be gone with no way to ask for it back.
	 * `pointerdown` runs before the `click` that starts the search, so the engine
	 * sees the committed mask.
	 */
	function onWindowPointerDown(event: PointerEvent): void {
		if (!selection || disabled) return;
		// The canvas's own handler has already had this event and decided what it
		// means — a handle, a move, or the click that commits.
		if (event.target === canvasEl) return;
		endSelection();
	}

	function onKeyDown(event: KeyboardEvent): void {
		if (disabled || keyboardBusy) return;
		const target = event.target as HTMLElement | null;
		// Never while the visitor is typing in a field: "r" is a letter there.
		if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) {
			return;
		}
		// A floating selection owns these four keys, and only while it floats: Enter
		// and Escape mean nothing else on this page, and Backspace would otherwise
		// walk the browser back a page while the visitor thinks they are erasing.
		if (selection) {
			if (event.key === 'Enter') {
				event.preventDefault();
				endSelection();
				return;
			}
			if (event.key === 'Escape') {
				event.preventDefault();
				dropSelection();
				schedule();
				return;
			}
			if (event.key === 'Delete' || event.key === 'Backspace') {
				event.preventDefault();
				endSelection(true);
				return;
			}
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

	// A selection describes the mask it was lifted from, cell for cell. Undo, Ryd,
	// an import or a symmetry fold replaces those cells, so the patch is dropped
	// rather than committed onto a picture it no longer belongs to.
	$effect(() => {
		void mask;
		void revision;
		untrack(() => {
			if (selection || marquee) {
				dropSelection();
				schedule();
			}
		});
	});

	// Leaving Markér puts the selection down. An edit in progress that vanishes
	// because the visitor reached for the pen would be a stroke's work lost.
	$effect(() => {
		const chosen = tool;
		untrack(() => {
			if (chosen !== 'select' && selection) endSelection();
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

<svelte:window onkeydown={onKeyDown} onpointerdown={onWindowPointerDown} />

<!-- The name is on the box rather than on the <canvas>: a canvas already counts
     as an interactive element, so role="img" on it is an invalid override, and
     the accessible name belongs on something that is only a picture. -->
<div class="mask-canvas" bind:this={boxEl} role="img" aria-label={label}>
	<canvas
		bind:this={canvasEl}
		class:disabled
		class:selecting={!disabled && tool === 'select'}
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

	/* Markér draws a frame rather than paint, and the crosshair reads as "a mark
	   goes here". `cell` is the cursor a marquee has everywhere else. */
	canvas.selecting {
		cursor: cell;
	}
</style>
