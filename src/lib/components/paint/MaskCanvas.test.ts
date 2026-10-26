/**
 * The canvas, driven through its own pointer handlers.
 *
 * The tools live in `tools.ts` and are tested there, cell by cell. What no pure
 * test can see is the wiring between a pointer and them: the left paper is the
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
import { DEFAULT_FRAME, type Frame } from '$lib/paint/frame';
import { NO_SYMMETRY, type SymmetrySettings } from '$lib/paint/symmetry';
import { LOBE_OUTLINE_COLORS } from '$lib/editor/outlineColors';
import { cutGeometryToDesign, type CutGeometry } from '$lib/inverse/toHeartDesign';
import starSolution from '../../../../static/inverse/examples/star.saved.json';
import type { HeartDesign } from '$lib/types/heart';
import type { PaintTool, PaintValue } from '$lib/paint/toolset';

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
	/** Gestures the canvas gave up, for the page to take back. */
	cancels: number;
	setTool: (tool: PaintTool) => void;
	setBrush: (brush: number) => void;
	setDisabled: (disabled: boolean) => void;
	commitSelection: () => void;
	deselect: () => void;
	layChecks: (n: number) => void;
	/** What the canvas said about its selection holding the tools, in order. */
	fences: boolean[];
	cell: (x: number, y: number) => number;
	cleanup: () => void;
};

const alive: (() => void)[] = [];

function render(
	options: {
		tool?: PaintTool;
		paintValue?: PaintValue;
		brush?: number;
		symmetry?: SymmetrySettings;
		fill?: 0 | 1;
		frame?: Frame;
		/** The cuts of the search in progress, drawn over the mask (PAINT.md §12). */
		candidate?: HeartDesign | null;
	} = {}
): Harness {
	const mask = createMask(options.fill ?? 0, SIZE);
	const target = document.createElement('div');
	document.body.appendChild(target);
	const harness = { edits: 0, cancels: 0 };
	const fences: boolean[] = [];
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
			// Fast by default, which is the canvas the painting tests want: nothing is
			// protected, so the band draws nothing over the cells they sample.
			frame: options.frame ?? { ...DEFAULT_FRAME },
			candidate: options.candidate ?? null,
			onEditStart: () => {},
			onEditEnd: () => {
				harness.edits++;
			},
			onEditCancel: () => {
				harness.cancels++;
			},
			onShortcut: () => {},
			onFenceChange: (held: boolean) => fences.push(held),
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
		get cancels() {
			return harness.cancels;
		},
		setTool: (tool: PaintTool) => {
			component.setTool(tool);
			flushSync();
		},
		setBrush: (brush: number) => { component.setBrush(brush); flushSync(); },
		setDisabled: (disabled: boolean) => { component.setDisabled(disabled); flushSync(); },
		commitSelection: () => {
			component.commitSelection();
			flushSync();
		},
		deselect: () => {
			component.deselect();
			flushSync();
		},
		layChecks: (n: number) => {
			component.layChecks(n);
			flushSync();
		},
		fences,
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
	type: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointerleave' | 'pointercancel',
	where: { clientX: number; clientY: number },
	modifiers: Partial<Record<Key, boolean>> & { pointerType?: string } = {}
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
	it('XOR retraces once per drag and inverts again on the next drag', () => {
		const c = render({ paintValue: 'xor', brush: 2 });
		send(c.canvas, 'pointerdown', at(10, 10));
		send(c.canvas, 'pointermove', at(20, 10));
		send(c.canvas, 'pointermove', at(10, 10));
		send(c.canvas, 'pointerup', at(10, 10));
		expect(c.cell(10, 10)).toBe(1);
		expect(c.cell(15, 10)).toBe(1);
		expect(c.edits).toBe(1);
		drag(c.canvas, [10, 10], [20, 10]);
		expect(c.cell(15, 10)).toBe(0);
		expect(c.edits).toBe(2);
	});

	it('finishes a held XOR gesture before a keyboard action changes its mask', () => {
		const c = render({ paintValue: 'xor' });
		send(c.canvas, 'pointerdown', at(10, 10));
		press('x');
		expect(c.edits).toBe(1);
		const finished = c.mask.data.slice();
		send(c.canvas, 'pointermove', at(20, 10));
		send(c.canvas, 'pointerup', at(20, 10));
		expect(c.mask.data).toEqual(finished);
		expect(c.edits).toBe(1);
	});

	it('includes the final release position without toggling overlapping cells again', () => {
		const c = render({ paintValue: 'xor' });
		send(c.canvas, 'pointerdown', at(10, 10));
		send(c.canvas, 'pointerup', at(20, 10));
		expect(c.cell(10, 10)).toBe(1);
		expect(c.cell(15, 10)).toBe(1);
		expect(c.cell(20, 10)).toBe(1);
	});

	it.each(['line', 'rect'] as const)('previews XOR %s without committing until release', (tool) => {
		const c = render({ tool, paintValue: 'xor', fill: 1 });
		send(c.canvas, 'pointerdown', at(10, 10));
		send(c.canvas, 'pointermove', at(20, 20));
		expect(c.cell(15, 15)).toBe(1);
		send(c.canvas, 'pointerup', at(20, 20));
		expect(c.cell(15, 15)).toBe(0);
		expect(c.cell(30, 30)).toBe(1);
		expect(c.edits).toBe(1);
	});

	it('XOR fills either paper', () => {
		const c = render({ tool: 'fill', paintValue: 'xor', fill: 1 });
		send(c.canvas, 'pointerdown', at(10, 10));
		expect(c.cell(30, 30)).toBe(0);
		send(c.canvas, 'pointerdown', at(10, 10));
		expect(c.cell(30, 30)).toBe(1);
	});

	it('positions and resizes the hover circle through the same diamond transform', () => {
		const c = render({ brush: 3 });
		const position = at(12, 25);
		send(c.canvas, 'pointermove', position, { pointerType: 'mouse' });
		const outline = () => c.box.querySelector<HTMLElement>('.brush-outline');
		expect(parseFloat(outline()!.style.left)).toBeCloseTo(position.clientX);
		expect(parseFloat(outline()!.style.top)).toBeCloseTo(position.clientY);
		expect(parseFloat(outline()!.style.width)).toBeCloseTo(6 * layout.scale / SIZE);
		c.setBrush(9);
		expect(parseFloat(outline()!.style.width)).toBeCloseTo(18 * layout.scale / SIZE);
		c.setDisabled(true);
		expect(outline()).toBeNull();
		c.setDisabled(false);
		c.setTool('fill');
		expect(outline()).toBeNull();
		c.setTool('pen');
		send(c.canvas, 'pointerleave', position);
		expect(outline()).toBeNull();
		send(c.canvas, 'pointermove', atPoint({ x: -5, y: 20 }));
		expect(outline()).toBeNull();
	});

	it('hides the touch brush outline on release and cancellation', () => {
		const c = render({ paintValue: 'xor' });
		const touch = { pointerType: 'touch' };
		send(c.canvas, 'pointermove', at(15, 15), touch);
		expect(c.box.querySelector('.brush-outline')).toBeNull();
		send(c.canvas, 'pointerdown', at(15, 15), touch);
		expect(c.box.querySelector('.brush-outline')).not.toBeNull();
		send(c.canvas, 'pointerup', at(15, 15), touch);
		expect(c.box.querySelector('.brush-outline')).toBeNull();
		send(c.canvas, 'pointerdown', at(15, 15), touch);
		send(c.canvas, 'pointercancel', at(15, 15), touch);
		expect(c.box.querySelector('.brush-outline')).toBeNull();
		expect(c.edits).toBe(2);
	});

	it('paints with the pen', () => {
		const c = render({ tool: 'pen', brush: 1 });
		drag(c.canvas, [10, 10], [20, 10]);
		expect(c.cell(10, 10)).toBe(1);
		expect(c.cell(20, 10)).toBe(1);
		expect(c.cell(30, 10)).toBe(0);
		expect(c.edits).toBe(1);
	});

	it('paints the left paper, though the value it lays down is falsy', () => {
		const c = render({ tool: 'pen', paintValue: 0, brush: 1, fill: 1 });
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
		const c = render({ tool: 'fill', paintValue: 0, brush: 1, fill: 1 });
		c.setTool('pen');
		drag(c.canvas, [10, 10], [10, 10]);
		expect(c.cell(10, 10)).toBe(0);
		expect(c.cell(30, 30)).toBe(1);
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

	it('takes no undo step for a patch that is put down where it was lifted', () => {
		const c = withBlock();
		drag(c.canvas, [5, 5], [13, 13]);
		press('Enter');
		expect(c.edits).toBe(0);
		expect(c.cell(8, 8)).toBe(1);
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

/**
 * The candidate the search is looking at, over the mask — PAINT.md §12 (a).
 *
 * The pass is additive and its colours are the editor's own, so what has to be
 * true is exactly that: with no candidate the canvas is what it always was, and
 * with one there is cyan and orange on it that no paper colour could explain.
 * The design is the star's real solution, converted the way the page converts a
 * candidate.
 */
describe('MaskCanvas drawing a candidate', () => {
	// `resolveJsonModule` widens `phase` to number, which the schema pins to 0 | 1;
	// `toHeartDesign.test.ts` casts the same fixture for the same reason.
	const star: HeartDesign = cutGeometryToDesign(starSolution as unknown as CutGeometry, {
		name: 'candidate',
		tolerance: 1.0
	});

	/** How many pixels of the drawing sit within `tolerance` of a colour. */
	function pixelsNear(canvas: HTMLCanvasElement, hex: string, tolerance = 40): number {
		const ctx = canvas.getContext('2d')!;
		const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
		const want = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
		let count = 0;
		for (let i = 0; i < data.length; i += 4) {
			const d = Math.hypot(data[i]! - want[0]!, data[i + 1]! - want[1]!, data[i + 2]! - want[2]!);
			if (d <= tolerance) count++;
		}
		return count;
	}

	/** The component draws in a requested frame, which `flushSync` does not run. */
	function painted(): Promise<void> {
		return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
	}

	it('draws nothing of its own while there is no candidate', async () => {
		const c = render();
		await painted();
		// The right lobe's paper, so a canvas that was never drawn on cannot pass
		// this by being empty.
		expect(pixelsNear(c.canvas, '#b91313', 8)).toBeGreaterThan(100);
		expect(pixelsNear(c.canvas, LOBE_OUTLINE_COLORS.left)).toBe(0);
		expect(pixelsNear(c.canvas, LOBE_OUTLINE_COLORS.right)).toBe(0);
	});

	it('draws both lobes’ cuts in the editor’s two colours', async () => {
		const c = render({ candidate: star });
		await painted();
		// Cyan for the left lobe and orange for the right, as "Vis omrids" draws
		// them in Tegn: the same cuts, and the visitor meets them again there.
		expect(pixelsNear(c.canvas, LOBE_OUTLINE_COLORS.left)).toBeGreaterThan(100);
		expect(pixelsNear(c.canvas, LOBE_OUTLINE_COLORS.right)).toBeGreaterThan(100);
		// And the black halo under both, so neither colour is lost on a paper the
		// visitor chose. The mask is all zeroes here, so the white left paper is the
		// only other thing on the square.
		expect(pixelsNear(c.canvas, '#000000', 20)).toBeGreaterThan(100);
	});
});

describe('a selection put down', () => {
	/** A frame over cells 10–19 each way, put down by reaching for `tool`. */
	function fencedWith(tool: PaintTool) {
		const c = render({ tool: 'select' });
		drag(c.canvas, [10, 10], [19, 19]);
		c.setTool(tool);
		return c;
	}

	it('holds the pen inside it, and says so to the page', () => {
		const c = fencedWith('pen');
		expect(c.fences.at(-1)).toBe(true);
		drag(c.canvas, [4, 15], [34, 15]);
		expect(c.cell(15, 15)).toBe(1);
		expect(c.cell(5, 15)).toBe(0);
		expect(c.cell(30, 15)).toBe(0);
	});

	it('fills only the selected part of a region', () => {
		const c = fencedWith('fill');
		send(c.canvas, 'pointerdown', at(15, 15));
		send(c.canvas, 'pointerup', at(15, 15));
		expect(c.cell(15, 15)).toBe(1);
		expect(c.cell(10, 10)).toBe(1);
		expect(c.cell(9, 15)).toBe(0);
		expect(c.mask.data.reduce((a, b) => a + b, 0)).toBe(100);
	});

	it('lets the tools paint anywhere again on Escape', () => {
		const c = fencedWith('pen');
		press('Escape');
		expect(c.fences.at(-1)).toBe(false);
		drag(c.canvas, [4, 15], [34, 15]);
		expect(c.cell(5, 15)).toBe(1);
		expect(c.cell(30, 15)).toBe(1);
	});

	it('lays Tern inside it, or over the whole mask once deselected', () => {
		const c = fencedWith('pen');
		c.layChecks(5);
		expect(c.edits).toBe(1);
		// A 5 × 5 board on 40 cells: squares of 8, the one holding (16, 10) is the right paper.
		expect(c.cell(16, 10)).toBe(1);
		expect(c.cell(24, 4)).toBe(0);
		c.deselect();
		c.layChecks(5);
		expect(c.cell(24, 4)).toBe(1);
		expect(c.edits).toBe(2);
	});
});

describe('Udtvær', () => {
	it('drags the paper under the brush along with the pointer, as one edit', () => {
		const c = render({ tool: 'smudge', brush: 10 });
		for (let y = 16; y < 24; y++) for (let x = 10; x < 18; x++) c.mask.data[y * SIZE + x] = 1;
		drag(c.canvas, [14, 20], [24, 20]);
		expect(c.cell(22, 20)).toBe(1);
		expect(c.cell(11, 20)).toBe(0);
		expect(c.edits).toBe(1);
	});
});

describe('zoom and pan, as in Tegn', () => {
	/** A wheel turned over the canvas at a screen point. */
	function wheel(canvas: HTMLCanvasElement, where: { clientX: number; clientY: number }, deltaY: number, ctrlKey: boolean, deltaX = 0): void {
		canvas.dispatchEvent(new WheelEvent('wheel', { deltaX, deltaY, ctrlKey, bubbles: true, cancelable: true, ...where }));
		flushSync();
	}

	/** A finger's pointer event: each finger its own id. */
	function finger(canvas: HTMLCanvasElement, type: 'pointerdown' | 'pointermove' | 'pointerup', id: number, where: { clientX: number; clientY: number }): void {
		canvas.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', button: 0, buttons: type === 'pointerup' ? 0 : 1, bubbles: true, ...where }));
		flushSync();
	}

	it('zooms about the pointer with Ctrl and the wheel, so the cell under it stays under it', () => {
		const c = render({ brush: 1 });
		const point = at(12, 25);
		// Six notches in: about 1.8 times as large.
		for (let k = 0; k < 6; k++) wheel(c.canvas, point, -100, true);
		send(c.canvas, 'pointerdown', point);
		send(c.canvas, 'pointerup', point);
		expect(c.cell(12, 25)).toBe(1);
		// Forty pixels to the right is fewer cells away now: unzoomed it would be
		// 3.5 cells further along x (at 16), zoomed by e^0.6 ≈ 1.82 about 1.9.
		const before = new Uint8Array(c.mask.data);
		const away = { clientX: point.clientX + 40, clientY: point.clientY };
		send(c.canvas, 'pointerdown', away);
		send(c.canvas, 'pointerup', away);
		const added: number[] = [];
		for (let i = 0; i < c.mask.data.length; i++) if (c.mask.data[i] && !before[i]) added.push(i % SIZE);
		const meanX = added.reduce((s, x) => s + x, 0) / added.length;
		const unzoomed = toSquareX(away) * SIZE;
		expect(unzoomed).toBeCloseTo(16);
		expect(meanX).toBeCloseTo(12.5 + (unzoomed - 12.5) / Math.exp(0.6), 0);
	});

	it('pans with a two-finger scroll, and Tilpas visning puts the heart back', () => {
		const c = render({ brush: 1 });
		expect(document.querySelector('.fit-view')).toBeNull();
		for (let k = 0; k < 4; k++) wheel(c.canvas, at(20, 20), -100, true);
		wheel(c.canvas, at(20, 20), 30, false, 30);
		const fit = document.querySelector<HTMLButtonElement>('.fit-view');
		expect(fit?.textContent?.trim()).toBe('Tilpas visning');
		fit!.click();
		flushSync();
		expect(document.querySelector('.fit-view')).toBeNull();
		send(c.canvas, 'pointerdown', at(20, 20));
		send(c.canvas, 'pointerup', at(20, 20));
		expect(c.cell(20, 20)).toBe(1);
	});

	it('gives up the first finger\'s stroke when a second comes down, and paints nothing until both are lifted', () => {
		const c = render({ brush: 1 });
		finger(c.canvas, 'pointerdown', 7, at(10, 10));
		expect(c.cell(10, 10)).toBe(1);
		finger(c.canvas, 'pointerdown', 8, at(30, 30));
		expect(c.cancels).toBe(1);
		finger(c.canvas, 'pointermove', 8, at(34, 34));
		finger(c.canvas, 'pointerup', 8, at(34, 34));
		// The finger left behind neither paints nor ends an edit.
		finger(c.canvas, 'pointermove', 7, at(14, 14));
		finger(c.canvas, 'pointerup', 7, at(14, 14));
		expect(c.cell(14, 14)).toBe(0);
		expect(c.edits).toBe(0);
		// The spread zoomed in.
		expect(document.querySelector('.fit-view')).not.toBeNull();
		// A new finger paints again.
		finger(c.canvas, 'pointerdown', 9, at(20, 5));
		finger(c.canvas, 'pointerup', 9, at(20, 5));
		expect(c.edits).toBe(1);
	});
});

/** A screen point's x across the square, at the unzoomed layout. */
function toSquareX(where: { clientX: number; clientY: number }): number {
	const R = Math.SQRT1_2, rx = (where.clientX - layout.cx) / layout.scale, ry = (where.clientY - layout.cy) / layout.scale;
	return R * rx + R * ry + 0.5;
}

