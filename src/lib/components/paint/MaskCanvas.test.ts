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
	/** The wrapper that carries the label and, under Markér, the tab stop. */
	box: HTMLElement;
	edits: number;
	setTool: (tool: PaintTool) => void;
	commitSelection: () => void;
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
		box: target.querySelector<HTMLElement>('.mask-canvas')!,
		get edits() {
			return harness.edits;
		},
		setTool: (tool: PaintTool) => {
			component.setTool(tool);
			flushSync();
		},
		commitSelection: () => {
			component.commitSelection();
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

/** One keystroke, from wherever the focus happens to be. */
function press(
	key: string,
	options: { on?: EventTarget; shiftKey?: boolean } = {}
): KeyboardEvent {
	const event = new KeyboardEvent('keydown', {
		key,
		bubbles: true,
		cancelable: true,
		shiftKey: options.shiftKey ?? false
	});
	(options.on ?? window).dispatchEvent(event);
	flushSync();
	return event;
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
		press('Enter');
		expect(c.cell(8, 8)).toBe(0);
		expect(c.cell(8, 28)).toBe(1);
		expect(c.edits).toBe(1);
	});

	it('puts everything back on Escape and writes nothing', () => {
		const c = withBlock();
		drag(c.canvas, [5, 5], [13, 13]);
		drag(c.canvas, [8, 8], [28, 28]);
		press('Escape');
		expect(c.cell(8, 8)).toBe(1);
		expect(c.cell(28, 28)).toBe(0);
		expect(c.edits).toBe(0);
	});

	it('clears the selected cells on Delete', () => {
		const c = withBlock();
		drag(c.canvas, [5, 5], [13, 13]);
		press('Delete');
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
		press('Enter');

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

	it('puts the selection down when the pointer goes anywhere else on the page', () => {
		const c = withBlock();
		drag(c.canvas, [5, 5], [13, 13]);
		drag(c.canvas, [8, 8], [28, 8]);
		// Find snit lives off the canvas, and pressing it with a patch still
		// floating used to search the mask as it was before the move.
		document.body.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 2, bubbles: true }));
		flushSync();
		expect(c.cell(8, 8)).toBe(0);
		expect(c.cell(28, 8)).toBe(1);
		expect(c.edits).toBe(1);
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

	it('puts the selection down when the page asks, for a button pressed by key', () => {
		const c = withBlock();
		drag(c.canvas, [5, 5], [13, 13]);
		drag(c.canvas, [8, 8], [28, 8]);
		// Space on a focused Find snit never goes near a pointer, so the page calls
		// this before it hands the mask to the engine.
		c.commitSelection();
		expect(c.cell(8, 8)).toBe(0);
		expect(c.cell(28, 8)).toBe(1);
		expect(c.edits).toBe(1);
	});

	it('mirrors a moved patch under an active symmetry instead of blanking the mask', () => {
		// Mellem lapper Sym is the transpose, so the block and its image are both
		// drawn: the mask has to be symmetric before an edit is spread.
		const c = render({ tool: 'select', symmetry: { curve: 'off', lobe: 'off', lobes: 'sym' } });
		// A block off the diagonal and its image, so the mask is exactly symmetric
		// before anything is moved, as it always is when a row is switched on.
		for (let y = 16; y < 22; y++) {
			for (let x = 6; x < 12; x++) {
				c.mask.data[y * SIZE + x] = 1;
				c.mask.data[x * SIZE + y] = 1;
			}
		}
		const ink = c.mask.data.reduce((n, v) => n + v, 0);

		drag(c.canvas, [5, 15], [13, 23]);
		// Straight across the diagonal and onto its own reflection, which is where
		// the hole and the patch claim the same cells. Spreading the hole over the
		// cells the patch had just laid down left the whole drawing blank.
		drag(c.canvas, [8, 18], [18, 8]);
		press('Enter');

		expect(c.mask.data.reduce((n, v) => n + v, 0)).toBe(ink);
		expect(c.cell(18, 8)).toBe(1);
		expect(c.cell(8, 18)).toBe(1);
	});

	it('leaves Enter to a button the visitor has tabbed to', () => {
		const c = withBlock();
		drag(c.canvas, [5, 5], [13, 13]);
		drag(c.canvas, [8, 8], [28, 8]);
		const button = document.createElement('button');
		document.body.appendChild(button);
		button.focus();

		const event = press('Enter', { on: button });

		// The button gets its own press, and the patch is still floating.
		expect(event.defaultPrevented).toBe(false);
		expect(c.cell(8, 8)).toBe(1);
		expect(c.edits).toBe(0);
		button.remove();
	});

	it('marks, moves and commits from the keyboard alone', () => {
		const c = render({ tool: 'select' });
		// A block in the middle of the mask, which is what the keyboard's own frame
		// takes hold of.
		for (let y = 18; y < 22; y++) for (let x = 18; x < 22; x++) c.mask.data[y * SIZE + x] = 1;
		c.box.focus();
		expect(c.box.tabIndex).toBe(0);

		press('Enter');
		for (let i = 0; i < 6; i++) press('ArrowRight');
		press('Enter');

		expect(c.cell(20, 20)).toBe(0);
		expect(c.cell(26, 20)).toBe(1);
		expect(c.edits).toBe(1);
	});

	it('sizes with Shift and an arrow and turns with the turn keys', () => {
		const c = render({ tool: 'select' });
		for (let y = 18; y < 22; y++) for (let x = 18; x < 22; x++) c.mask.data[y * SIZE + x] = 1;
		c.box.focus();
		press('Enter');
		// Ten cells wider, then a quarter turn: three presses of the turn key are 45°,
		// six are 90°, and the block comes back to itself either way — what has to be
		// true is that the keys are taken and the commit is one edit.
		for (let i = 0; i < 10; i++) press('ArrowRight', { shiftKey: true });
		for (let i = 0; i < 6; i++) expect(press('.').defaultPrevented).toBe(true);
		press('Enter');
		expect(c.edits).toBe(1);
		expect(c.mask.data.some((v) => v === 1)).toBe(true);
	});

	it('leaves the arrow keys alone when the drawing is not the focused thing', () => {
		const c = withBlock();
		const before = new Uint8Array(c.mask.data);
		drag(c.canvas, [5, 5], [13, 13]);
		// The tool panel's radio group and the page's own scrolling own the arrow
		// keys everywhere but on the drawing itself.
		const event = press('ArrowRight');
		expect(event.defaultPrevented).toBe(false);
		press('Enter');
		expect(c.mask.data).toEqual(before);
	});
});
