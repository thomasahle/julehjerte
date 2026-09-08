/**
 * The canvas, driven through its own pointer handlers.
 *
 * The tools live in `tools.ts` and are tested there, cell by cell. What no pure
 * test can see is the wiring between a pointer and them: the eraser paints the
 * value 0, which is falsy, so any `if (value)` on that path silently does
 * nothing; and Linje and Rektangel do all their work on pointer *up*, so a
 * cleared `start`, a lost pointer capture or a swallowed event leaves the mask
 * exactly as it was with no error anywhere. Both were reported as "changes
 * nothing" bugs, and both would show here and nowhere else.
 *
 * jsdom has no layout and no pointer capture, so the box is given a size and the
 * three capture methods are stubbed. Everything else is the real component:
 * where a cell lands on screen comes from `heartLayout`, exactly as the
 * component's own `pointAt` reads it back.
 */
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import MaskCanvasFixture from './MaskCanvasFixture.svelte';
import { createMask, type Mask } from '$lib/paint/mask';
import { fitHeart, toScreen } from '$lib/paint/heartLayout';
import { ROTATE_GAP_PX, placementOf, rotateHandleAt } from '$lib/paint/selection';
import { NO_SYMMETRY, type SymmetrySettings } from '$lib/paint/symmetry';
import type { PaintTool } from '$lib/paint/toolset';

const BOX = 600;
const PADDING = 24;
const SIZE = 40;
const layout = fitHeart(BOX, BOX, PADDING);

beforeAll(() => {
	// One box for every element: the component measures its own wrapper, and the
	// canvas's rect is what `pointAt` subtracts, so both want the same origin.
	Element.prototype.getBoundingClientRect = () =>
		({ x: 0, y: 0, left: 0, top: 0, right: BOX, bottom: BOX, width: BOX, height: BOX }) as DOMRect;
	const capture = HTMLElement.prototype as unknown as Record<string, unknown>;
	capture.setPointerCapture = () => {};
	capture.releasePointerCapture = () => {};
	capture.hasPointerCapture = () => true;
	// jsdom leaves `ImageData` off the window even where it can draw, and the
	// offscreen mask is built from one. The 2D context can make an instance, so its
	// constructor is borrowed rather than a package being reached into.
	const probe = document.createElement('canvas').getContext('2d');
	if (probe && typeof globalThis.ImageData === 'undefined') {
		globalThis.ImageData = Object.getPrototypeOf(probe.createImageData(1, 1)).constructor;
	}
});

/** Where a point of the mask, in cells, falls on screen. */
function atPoint(p: { x: number; y: number }): { clientX: number; clientY: number } {
	const screen = toScreen(layout, p.x / SIZE, p.y / SIZE);
	return { clientX: screen.x, clientY: screen.y };
}

/** Where the centre of mask cell (x, y) falls on screen. */
function at(x: number, y: number): { clientX: number; clientY: number } {
	return atPoint({ x: x + 0.5, y: y + 0.5 });
}

type Harness = {
	mask: Mask;
	canvas: HTMLCanvasElement;
	edits: number;
	setTool: (tool: PaintTool) => void;
	cell: (x: number, y: number) => number;
	cleanup: () => void;
};

const alive: (() => void)[] = [];

function render(
	options: {
		tool?: PaintTool;
		paintValue?: 0 | 1;
		brush?: number;
		symmetry?: SymmetrySettings;
		fill?: 0 | 1;
	} = {}
): Harness {
	const mask = createMask(options.fill ?? 0, SIZE);
	const target = document.createElement('div');
	document.body.appendChild(target);
	const harness = { edits: 0 };
	const component = mount(MaskCanvasFixture, {
		target,
		props: {
			mask,
			colors: { left: '#ffffff', right: '#b91313' },
			symmetry: options.symmetry ?? { ...NO_SYMMETRY },
			tool: options.tool ?? 'pen',
			brush: options.brush ?? 2,
			paintValue: options.paintValue ?? 1,
			revision: 0,
			onEditStart: () => {},
			onEditEnd: () => {
				harness.edits++;
			},
			onShortcut: () => {},
			lang: 'da' as const
		}
	});
	flushSync();
	const canvas = target.querySelector('canvas')!;
	const cleanup = () => {
		unmount(component);
		target.remove();
	};
	alive.push(cleanup);
	return {
		mask,
		canvas,
		get edits() {
			return harness.edits;
		},
		setTool: (tool: PaintTool) => {
			component.setTool(tool);
			flushSync();
		},
		cell: (x: number, y: number) => mask.data[y * SIZE + x]!,
		cleanup
	};
}

afterEach(() => {
	while (alive.length) alive.pop()!();
});

type Key = 'shiftKey';

function send(
	canvas: HTMLCanvasElement,
	type: 'pointerdown' | 'pointermove' | 'pointerup',
	where: { clientX: number; clientY: number },
	modifiers: Partial<Record<Key, boolean>> = {}
): void {
	canvas.dispatchEvent(
		new PointerEvent(type, {
			pointerId: 1,
			button: 0,
			buttons: type === 'pointerup' ? 0 : 1,
			bubbles: true,
			...where,
			...modifiers
		})
	);
	flushSync();
}

/** One press-drag-release across the mask, in cells. */
function drag(
	canvas: HTMLCanvasElement,
	from: [number, number],
	to: [number, number],
	modifiers: Partial<Record<Key, boolean>> = {}
): void {
	send(canvas, 'pointerdown', at(...from), modifiers);
	send(canvas, 'pointermove', at(...to), modifiers);
	send(canvas, 'pointerup', at(...to), modifiers);
}

describe('painting tools through the canvas', () => {
	it('paints with the pen', () => {
		const c = render({ tool: 'pen', brush: 1 });
		drag(c.canvas, [10, 10], [20, 10]);
		expect(c.cell(10, 10)).toBe(1);
		expect(c.cell(20, 10)).toBe(1);
		expect(c.cell(30, 10)).toBe(0);
		expect(c.edits).toBe(1);
	});

	it('erases, though the value it lays down is falsy', () => {
		const c = render({ tool: 'eraser', brush: 1, fill: 1 });
		drag(c.canvas, [10, 10], [20, 10]);
		expect(c.cell(10, 10)).toBe(0);
		expect(c.cell(20, 10)).toBe(0);
		expect(c.cell(30, 10)).toBe(1);
	});

	it('fills a region, in either paper', () => {
		const painted = render({ tool: 'fill', paintValue: 1 });
		send(painted.canvas, 'pointerdown', at(20, 20));
		send(painted.canvas, 'pointerup', at(20, 20));
		expect(painted.mask.data.every((v) => v === 1)).toBe(true);

		const emptied = render({ tool: 'fill', paintValue: 0, fill: 1 });
		send(emptied.canvas, 'pointerdown', at(20, 20));
		send(emptied.canvas, 'pointerup', at(20, 20));
		expect(emptied.mask.data.every((v) => v === 0)).toBe(true);
	});

	it('commits the line on release and not before', () => {
		const c = render({ tool: 'line', brush: 1 });
		send(c.canvas, 'pointerdown', at(8, 8));
		send(c.canvas, 'pointermove', at(28, 8));
		// Still only a preview: the mask must be untouched until the pointer is up.
		expect(c.mask.data.some((v) => v === 1)).toBe(false);
		send(c.canvas, 'pointerup', at(28, 8));
		expect(c.cell(8, 8)).toBe(1);
		expect(c.cell(18, 8)).toBe(1);
		expect(c.cell(28, 8)).toBe(1);
		expect(c.cell(8, 20)).toBe(0);
	});

	it('commits the rectangle on release', () => {
		const c = render({ tool: 'rect' });
		send(c.canvas, 'pointerdown', at(10, 10));
		send(c.canvas, 'pointermove', at(20, 18));
		expect(c.mask.data.some((v) => v === 1)).toBe(false);
		send(c.canvas, 'pointerup', at(20, 18));
		expect(c.cell(11, 11)).toBe(1);
		expect(c.cell(15, 14)).toBe(1);
		expect(c.cell(19, 17)).toBe(1);
		// Well clear of the corners, so a cell of rounding either way cannot decide
		// whether this passes.
		expect(c.cell(25, 25)).toBe(0);
		expect(c.cell(5, 5)).toBe(0);
	});

	it('clears a rectangle when the paper being painted is the falsy one', () => {
		const c = render({ tool: 'rect', paintValue: 0, fill: 1 });
		send(c.canvas, 'pointerdown', at(10, 10));
		send(c.canvas, 'pointermove', at(20, 18));
		send(c.canvas, 'pointerup', at(20, 18));
		expect(c.cell(15, 14)).toBe(0);
		expect(c.cell(25, 25)).toBe(1);
	});

	it('keeps the tool the visitor picked after mounting', () => {
		const c = render({ tool: 'pen', brush: 1, fill: 1 });
		c.setTool('eraser');
		drag(c.canvas, [10, 10], [10, 10]);
		expect(c.cell(10, 10)).toBe(0);
	});

	it('mirrors a stroke under an active symmetry', () => {
		const c = render({
			tool: 'pen',
			brush: 1,
			symmetry: { curve: 'off', lobe: 'off', lobes: 'sym' }
		});
		send(c.canvas, 'pointerdown', at(30, 8));
		send(c.canvas, 'pointerup', at(30, 8));
		// Mellem lapper Sym is the transpose, so the dab appears mirrored in the
		// square's diagonal as well.
		expect(c.cell(30, 8)).toBe(1);
		expect(c.cell(8, 30)).toBe(1);
	});
});

describe('Markér', () => {
	/** A 6 × 6 block of ink in the top left, and the tool in hand. */
	function withBlock() {
		const c = render({ tool: 'select' });
		for (let y = 6; y < 12; y++) for (let x = 6; x < 12; x++) c.mask.data[y * SIZE + x] = 1;
		return c;
	}

	it('lifts a frame and lays the cells down where they are dragged', () => {
		const c = withBlock();
		drag(c.canvas, [5, 5], [13, 13]);
		// The frame alone changes nothing.
		expect(c.cell(8, 8)).toBe(1);
		drag(c.canvas, [8, 8], [28, 8]);
		send(c.canvas, 'pointerdown', at(35, 35));
		send(c.canvas, 'pointerup', at(35, 35));
		expect(c.cell(8, 8)).toBe(0);
		expect(c.cell(28, 8)).toBe(1);
	});

	it('commits on Enter and counts as exactly one edit', () => {
		const c = withBlock();
		drag(c.canvas, [5, 5], [13, 13]);
		drag(c.canvas, [8, 8], [8, 28]);
		expect(c.edits).toBe(0);
		window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
		flushSync();
		expect(c.cell(8, 8)).toBe(0);
		expect(c.cell(8, 28)).toBe(1);
		expect(c.edits).toBe(1);
	});

	it('puts everything back on Escape and writes nothing', () => {
		const c = withBlock();
		drag(c.canvas, [5, 5], [13, 13]);
		drag(c.canvas, [8, 8], [28, 28]);
		window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		flushSync();
		expect(c.cell(8, 8)).toBe(1);
		expect(c.cell(28, 28)).toBe(0);
		expect(c.edits).toBe(0);
	});

	it('clears the selected cells on Delete', () => {
		const c = withBlock();
		drag(c.canvas, [5, 5], [13, 13]);
		window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
		flushSync();
		expect(c.mask.data.some((v) => v === 1)).toBe(false);
		expect(c.edits).toBe(1);
	});

	it('turns the patch about its centre from the handle above it', () => {
		const c = render({ tool: 'select' });
		// An L: an upright down the left of the patch and a foot along its bottom, so
		// a quarter turn is unmistakable.
		for (let y = 6; y < 12; y++) c.mask.data[y * SIZE + 6] = 1;
		for (let x = 6; x < 12; x++) c.mask.data[11 * SIZE + x] = 1;
		const ink = () => c.mask.data.reduce((n, v) => n + v, 0);
		const inRow = (y: number) => {
			let n = 0;
			for (let x = 0; x < SIZE; x++) n += c.cell(x, y);
			return n;
		};
		const inColumn = (x: number) => {
			let n = 0;
			for (let y = 0; y < SIZE; y++) n += c.cell(x, y);
			return n;
		};
		expect([ink(), inRow(6), inColumn(6)]).toEqual([11, 1, 6]);

		// The marquee's cells are exact: a drag between two cell centres rounds
		// outwards, so this is the 7 × 7 patch from (6, 6) to (12, 12).
		drag(c.canvas, [6, 6], [12, 12]);
		const placement = placementOf({ x0: 6, y0: 6, x1: 13, y1: 13 });
		const turner = rotateHandleAt(placement, (ROTATE_GAP_PX * SIZE) / layout.scale);
		send(c.canvas, 'pointerdown', atPoint(turner));
		// Straight out to the right of the centre: a quarter turn clockwise.
		send(c.canvas, 'pointermove', atPoint({ x: placement.cx + 6, y: placement.cy }));
		send(c.canvas, 'pointerup', atPoint({ x: placement.cx + 6, y: placement.cy }));
		window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
		flushSync();

		// The upright has come round to the top and the foot to the left, and a
		// quarter turn of a square patch loses no cells on the way.
		expect(ink()).toBe(11);
		expect(inRow(6)).toBeGreaterThanOrEqual(5);
		expect(inColumn(6)).toBeLessThanOrEqual(1);
	});

	it('leaves the mask alone until something is committed', () => {
		const c = withBlock();
		const before = new Uint8Array(c.mask.data);
		drag(c.canvas, [5, 5], [13, 13]);
		drag(c.canvas, [8, 8], [20, 20]);
		expect(c.mask.data).toEqual(before);
	});

	it('puts the selection down when the visitor reaches for another tool', () => {
		const c = withBlock();
		drag(c.canvas, [5, 5], [13, 13]);
		drag(c.canvas, [8, 8], [28, 8]);
		c.setTool('pen');
		expect(c.cell(8, 8)).toBe(0);
		expect(c.cell(28, 8)).toBe(1);
		expect(c.edits).toBe(1);
	});
});
