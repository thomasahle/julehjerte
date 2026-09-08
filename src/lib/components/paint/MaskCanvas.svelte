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
		isUnmoved,
		lift,
		middleRect,
		moveBy,
		rectFrom,
		resizeBy,
		rotateHandleAt,
		rotateTo,
		scaleTo,
		turnBy,
		type Edit,
		type Handle,
		type Placement,
		type Selection
	} from '$lib/paint/selection';
	import { transformsFor, type SymmetrySettings } from '$lib/paint/symmetry';
	import { colourChannels } from '$lib/paint/drawHeart';
	import { fitHeart, insideSquare, toMask, toSquare, type HeartLayout, type Pt } from '$lib/paint/heartLayout';
	import {
		frameHandles,
		shapeOutline,
		sizeFromHandle,
		type Frame,
		type FrameAxis
	} from '$lib/paint/frame';
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
		/**
		 * "Kanten": the protected motif and what happens to the band (PAINT.md §11).
		 *
		 * Only a free band is drawn. Fast is the canvas as it always was, because
		 * that is what Fast means — nothing is protected, so an outline saying
		 * otherwise would be a promise the search never made.
		 */
		frame: Frame;
		/**
		 * A handle was dragged to a new size. Absent — in the small card beside a
		 * found heart, say — and the handles are not drawn at all.
		 */
		onFrameSize?: (size: number) => void;
		/**
		 * A handle has been grabbed and the size is about to move.
		 *
		 * The drag folds the mask, because the rows apply to the protected motif
		 * alone while the band is free; the page snapshots for undo here so that
		 * the whole drag is one step and not one per pointer event.
		 */
		onFrameSizeStart?: () => void;
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
		frame,
		onFrameSize,
		onFrameSizeStart,
		disabled = false,
		keyboardBusy = false,
		onEditStart,
		onEditEnd,
		onShortcut,
		lang
	}: Props = $props();

	/** Air between the heart and the edges of the drawing band. */
	const PADDING = 24;

	/** How far one press of a turn key turns the patch: a twelfth of a half turn. */
	const TURN_STEP = Math.PI / 12;

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
	/** The hatch tile, made once and re-transformed per frame. */
	let hatch: CanvasPattern | null = null;
	/** The handle being dragged, if any; the frame's size follows the pointer. */
	let frameAxis: FrameAxis | null = null;

	/** A handle's radius on screen, and how near the pointer has to come to grab it. */
	const HANDLE_RADIUS = 7;
	const HANDLE_GRAB = 14;

	// The pending animation frame. Named for what it holds, now that `frame` is
	// the visitor's own setting and a prop.
	let rafHandle = 0;

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

	/**
	 * What the marquee last did, for a visitor who cannot see it. Empty until
	 * something happens, so the live region says nothing on the way in.
	 */
	let selectionNote = $state('');

	/** The design tokens the canvas paints with, read once from the document. */
	let chrome: {
		outline: string;
		mirror: string;
		marquee: string;
		paper: string;
		frameGround: string;
		frameHatch: string;
		frameLine: string;
		frameHandle: string;
	} | null = null;

	function tokens(): NonNullable<typeof chrome> {
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
			paper: white || 'transparent',
			frameGround: style.getPropertyValue('--cream2').trim() || 'transparent',
			frameHatch: style.getPropertyValue('--sage-dark').trim() || 'transparent',
			// The band's outline and the marquee are both the page's green, and its
			// handles are filled with the same white the eraser lays down.
			frameLine: green || 'transparent',
			frameHandle: white || 'transparent'
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
		drawFreeBand(ctx);
		// After the band, not before it: the band's ground is opaque, so a patch
		// dragged across it would vanish under the hatch while the visitor is still
		// holding it. A patch is a thing in the hand and stays visible until it is
		// put down — at which point the hatch does cover it, which is the band
		// saying what it always says: these cells are not the visitor's to keep.
		drawSelection(ctx);

		// A faint edge, so the square reads as the woven part even where the mask
		// happens to be the same colour as the lobe beside it.
		ctx.lineWidth = 1.5 / layout.scale;
		ctx.strokeStyle = tokens().outline;
		ctx.strokeRect(0, 0, 1, 1);

		drawMirrorLines(ctx);
		drawFrameOutline(ctx);
		ctx.restore();
	}

	/** The protected shape as a path in square units, ready to fill or stroke. */
	function traceShape(ctx: CanvasRenderingContext2D): void {
		const outline = shapeOutline(frame.shape, frame.size);
		if (outline.kind === 'circle') {
			ctx.moveTo(outline.cx + outline.r, outline.cy);
			ctx.arc(outline.cx, outline.cy, outline.r, 0, 2 * Math.PI);
			return;
		}
		outline.points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
		ctx.closePath();
	}

	/**
	 * The diagonal hatch, as a pattern tile of a fixed size on screen.
	 *
	 * The context draws in square units and turned a quarter of a right angle, so
	 * the pattern is given the inverse of both: scaled back down by `layout.scale`
	 * and turned back by 45°, which leaves the tile's own 45° strokes running at
	 * 45° on the visitor's screen whatever the heart's size.
	 */
	function hatchPattern(ctx: CanvasRenderingContext2D): CanvasPattern | null {
		if (!hatch) {
			const tile = document.createElement('canvas');
			tile.width = tile.height = 8;
			const tileCtx = tile.getContext('2d');
			if (!tileCtx) return null;
			tileCtx.strokeStyle = tokens().frameHatch;
			tileCtx.lineWidth = 1.5;
			// Two strokes, so the diagonal carries on across the tile's own corners.
			tileCtx.beginPath();
			tileCtx.moveTo(-2, 6);
			tileCtx.lineTo(6, -2);
			tileCtx.moveTo(2, 10);
			tileCtx.lineTo(10, 2);
			tileCtx.stroke();
			hatch = ctx.createPattern(tile, 'repeat');
		}
		hatch?.setTransform(new DOMMatrix().scale(1 / layout.scale).rotate(-45));
		return hatch;
	}

	/**
	 * A free band: a light ground with a hatch over it, covering the mask's own
	 * colours there.
	 *
	 * Covering rather than tinting is the point. The cells under it still exist
	 * and can still be painted on — they are simply not part of what the search is
	 * asked for — so showing them in the paper colours would say the opposite.
	 */
	function drawFreeBand(ctx: CanvasRenderingContext2D): void {
		if (frame.mode !== 'free') return;
		ctx.save();
		// The square with the shape cut out of it: even-odd, so the second
		// sub-path is a hole rather than a second island.
		ctx.beginPath();
		ctx.rect(0, 0, 1, 1);
		traceShape(ctx);
		ctx.clip('evenodd');
		ctx.fillStyle = tokens().frameGround;
		ctx.fillRect(0, 0, 1, 1);
		const pattern = hatchPattern(ctx);
		if (pattern) {
			ctx.fillStyle = pattern;
			ctx.fillRect(0, 0, 1, 1);
		}
		ctx.restore();
	}

	/** The dashed outline of the protected motif, and the four handles on it. */
	function drawFrameOutline(ctx: CanvasRenderingContext2D): void {
		if (frame.mode !== 'free') return;
		const colour = tokens().frameLine;
		ctx.save();
		ctx.strokeStyle = colour;
		ctx.lineWidth = 2 / layout.scale;
		ctx.setLineDash([6 / layout.scale, 4 / layout.scale]);
		ctx.beginPath();
		traceShape(ctx);
		ctx.stroke();
		if (onFrameSize) {
			ctx.setLineDash([]);
			ctx.lineWidth = 2 / layout.scale;
			const r = HANDLE_RADIUS / layout.scale;
			for (const { point } of frameHandles(frame)) {
				ctx.beginPath();
				ctx.arc(point.x, point.y, r, 0, 2 * Math.PI);
				// The site's own white, not the left paper: a handle is chrome, and a
				// visitor who picks a dark left paper must not lose it.
				ctx.fillStyle = tokens().frameHandle;
				ctx.fill();
				ctx.stroke();
			}
		}
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
		if (rafHandle) return;
		rafHandle = requestAnimationFrame(() => {
			rafHandle = 0;
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

	/** Say what the marquee just did, in the live region under the canvas. */
	function announce(note: string): void {
		selectionNote = note;
	}

	/** The marquee as it stands, in whole cells, for the live region to read out. */
	function announceSelection(sel: Selection): void {
		announce(
			t('paintSelectionLifted', lang, {
				width: Math.round(sel.placement.width),
				height: Math.round(sel.placement.height)
			})
		);
	}

	/**
	 * Put the selection down (or, with `erase`, throw its cells away). One undo
	 * snapshot per commit, taken here rather than on pointer down, because every
	 * drag before this one left the mask exactly as it found it.
	 *
	 * A patch still standing where it was lifted from writes back the very cells it
	 * took, so it takes no snapshot at all: an undo step that restores an identical
	 * mask is one press of Fortryd that appears to do nothing.
	 */
	function endSelection(erase = false): void {
		const sel = selection;
		dropSelection();
		if (sel && mask && (erase || !isUnmoved(sel))) {
			onEditStart();
			spread(erase ? clearSelection(mask, sel) : commitCells(mask, sel));
			announce(t(erase ? 'paintSelectionCleared' : 'paintSelectionPlaced', lang));
			schedule();
			onEditEnd();
			return;
		}
		if (sel) announce(t('paintSelectionPlaced', lang));
		schedule();
	}

	/**
	 * Put a floating patch down from outside the canvas.
	 *
	 * A press anywhere on the page already commits, but a button activated from the
	 * keyboard never goes near a pointer — so the page calls this before it acts on
	 * the mask (Find snit, Ryd, an import), or the visitor's move would be searched
	 * past and then dropped with the canvas.
	 */
	export function commitSelection(): void {
		if (selection) endSelection();
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
			if (selection) announceSelection(selection);
		}
		selectionDrag = null;
		releasePointer();
		schedule();
	}

	/** Where a pointer event lands, in square units (0…1 across the woven square). */
	function squareAt(event: { clientX: number; clientY: number }): Pt | null {
		if (!canvasEl) return null;
		const bounds = canvasEl.getBoundingClientRect();
		return toSquare(layout, event.clientX - bounds.left, event.clientY - bounds.top);
	}

	/** The handle under the pointer, if one is near enough to grab. */
	function handleAt(event: PointerEvent): FrameAxis | null {
		if (frame.mode !== 'free' || !onFrameSize) return null;
		const p = squareAt(event);
		if (!p) return null;
		// The grab radius is a distance on screen, so it does not grow with the heart.
		const reach = HANDLE_GRAB / layout.scale;
		let nearest: FrameAxis | null = null;
		let best = reach;
		for (const { axis, point } of frameHandles(frame)) {
			const d = Math.hypot(point.x - p.x, point.y - p.y);
			if (d <= best) {
				best = d;
				nearest = axis;
			}
		}
		return nearest;
	}

	function onPointerDown(event: PointerEvent): void {
		if (disabled || !mask || pointerId !== null || event.button !== 0) return;
		// A handle takes the gesture before the brush does: the handles sit on the
		// square, so a drag that starts on one is a resize and not a stroke.
		const grabbed = handleAt(event);
		if (grabbed) {
			pointerId = event.pointerId;
			frameAxis = grabbed;
			canvasEl?.setPointerCapture(event.pointerId);
			onFrameSizeStart?.();
			return;
		}
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
		// The frame handle first, in the order pointer down took them: a gesture
		// that began on a handle is a resize whatever the tool says.
		if (frameAxis) {
			const p = squareAt(event);
			if (p) onFrameSize?.(sizeFromHandle(frame.shape, frameAxis, p));
			schedule();
			return;
		}
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
		if (frameAxis) {
			finish();
			return;
		}
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
		frameAxis = null;
		start = null;
		last = null;
		preview = null;
	}

	function finish(): void {
		// Read before releasing: `releasePointer` is what clears `frameAxis`, and the
		// selection lane split it out of this function so a marquee could let the
		// pointer go without ending an edit that never began.
		const resizing = frameAxis !== null;
		releasePointer();
		schedule();
		// A resize is not a stroke: the undo step it needs was taken when the handle
		// was grabbed (`onFrameSizeStart`), and the page has already left the found
		// heart behind on the first change of size.
		if (!resizing) onEditEnd();
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

	/**
	 * Whether a keystroke is the canvas's to take, or belongs to something the
	 * visitor has tabbed to.
	 *
	 * Enter on a focused button has to press the button: a floating marquee that
	 * claims Enter unconditionally swallows the first press of every control on the
	 * page for as long as it is on screen, and nothing says why.
	 */
	function ours(node: EventTarget | null): boolean {
		// The window itself, which is what a keystroke with nothing focused reports.
		if (!(node instanceof Element)) return true;
		if (node === document.body) return true;
		if (boxEl?.contains(node)) return true;
		return !node.closest('a[href], button, input, select, textarea, [tabindex], [role="button"]');
	}

	/** Whether the drawing itself has the keyboard — what the nudge keys need. */
	function focused(): boolean {
		return !!boxEl && typeof document !== 'undefined' && boxEl.contains(document.activeElement);
	}

	/**
	 * Markér from the keyboard, so the tool is not pointer-only: a frame over the
	 * middle to start from, the arrow keys to move it, Shift and an arrow to size
	 * it, and the two turn keys. Returns whether the keystroke was used up.
	 *
	 * The three keys that end a selection are taken wherever the canvas owns the
	 * keyboard — they are what the hint promises after a pointer gesture, and
	 * Backspace would otherwise walk the browser back a page while the visitor
	 * thinks they are erasing. The rest need the drawing to be the focused thing,
	 * because the arrow keys belong to the tool panel's radio group and to the
	 * page's own scrolling everywhere else.
	 */
	function selectionKey(event: KeyboardEvent): boolean {
		if (!mask) return false;
		const sel = selection;
		if (!sel) {
			if (!focused() || event.key !== 'Enter') return false;
			selection = lift(mask, middleRect(mask));
			patch = null;
			patchFor = null;
			if (selection) announceSelection(selection);
			schedule();
			return true;
		}
		if (event.key === 'Enter') {
			endSelection();
			return true;
		}
		if (event.key === 'Escape') {
			dropSelection();
			announce(t('paintSelectionDropped', lang));
			schedule();
			return true;
		}
		if (event.key === 'Delete' || event.key === 'Backspace') {
			endSelection(true);
			return true;
		}
		if (!focused()) return false;
		const p = sel.placement;
		// Shift means size rather than position, as it does on the corner handles.
		const sizing = event.shiftKey;
		if (event.key === 'ArrowLeft') sel.placement = sizing ? resizeBy(p, -1, 0) : moveBy(p, -1, 0);
		else if (event.key === 'ArrowRight') sel.placement = sizing ? resizeBy(p, 1, 0) : moveBy(p, 1, 0);
		else if (event.key === 'ArrowUp') sel.placement = sizing ? resizeBy(p, 0, -1) : moveBy(p, 0, -1);
		else if (event.key === 'ArrowDown') sel.placement = sizing ? resizeBy(p, 0, 1) : moveBy(p, 0, 1);
		else if (event.key === ',') sel.placement = turnBy(p, -TURN_STEP);
		else if (event.key === '.') sel.placement = turnBy(p, TURN_STEP);
		else return false;
		// A size the visitor cannot see is worth saying; a nudge of one cell would
		// be read out on every press and drown the rest.
		if (sizing) announceSelection(sel);
		schedule();
		return true;
	}

	function onKeyDown(event: KeyboardEvent): void {
		if (disabled || keyboardBusy) return;
		const target = event.target as HTMLElement | null;
		// Never while the visitor is typing in a field: "r" is a letter there.
		if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) {
			return;
		}
		if (tool === 'select' && ours(event.target) && selectionKey(event)) {
			event.preventDefault();
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
			if (rafHandle) cancelAnimationFrame(rafHandle);
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
		void frame.mode;
		void frame.shape;
		void frame.size;
		untrack(schedule);
	});

	let label = $derived(
		mask ? t('paintCanvasLabel', lang, { size: mask.size }) : t('paintCanvasEmptyLabel', lang)
	);
</script>

<svelte:window onkeydown={onKeyDown} onpointerdown={onWindowPointerDown} />

<!-- The name is on the box rather than on the <canvas>: a canvas already counts
     as an interactive element, so role="img" on it is an invalid override, and
     the accessible name belongs on something that is only a picture.

     Markér makes the box a tab stop, because its whole gesture set is otherwise
     pointer-only: with the box focused, Enter marks the middle, the arrow keys
     move, Shift and an arrow size, and comma and full stop turn. -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div
	class="mask-canvas"
	bind:this={boxEl}
	role="img"
	aria-label={label}
	tabindex={tool === 'select' && !disabled ? 0 : undefined}
>
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
<!-- Outside the box on purpose: role="img" is a leaf, so anything inside it is
     hidden from the very readers this line is for. -->
<p class="sr-only" role="status">{selectionNote}</p>

<style>
	.mask-canvas {
		position: absolute;
		inset: 0;
	}

	/* The box is a tab stop while Markér is in hand, so it has to show that it has
	   the keyboard — inset, because the box is the whole drawing band and a ring
	   on its outer edge would sit under the two floating columns. */
	.mask-canvas:focus-visible {
		outline: 2px solid var(--blue);
		outline-offset: -4px;
		border-radius: 8px;
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
