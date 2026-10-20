import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import PaperHeart from './PaperHeart.svelte';
import type { Finger, GridSize, HeartPattern, Vec } from '$lib/types/heart';
import { splitBezierAt } from '$lib/geometry/bezierSegments';
import { opposite } from '$lib/pattern/rules';
import { fitLines } from '$lib/pattern/tiling';
import { ruleStart } from '$lib/pattern/starts';
import { dragTile, restartedTile, savedPattern, startPanDrag, tileFingers, tileGrid, weaveParityOf } from '$lib/pattern/escherTab';
import { getCenteredRectParams } from '$lib/utils/overlapRect';
import { knobTile } from '$lib/pattern/examples';
// The Escher tab's panel, which Tegn loads when a heart opens on the tab, loaded ahead.
import '$lib/components/pattern/EscherPanel.svelte';

const cleanup: (() => Promise<void>)[] = [];

beforeEach(() => {
	// jsdom has no SVG layout. Use heart coordinates directly for pointer events;
	// the real component still handles selection, dragging and boundary creation.
	vi.stubGlobal('DOMPoint', class {
		constructor(public x: number, public y: number) {}
		matrixTransform() { return this; }
	});
	Object.defineProperty(SVGElement.prototype, 'getScreenCTM', {
		configurable: true,
		value: () => ({ inverse: () => ({}) })
	});
	vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
});

afterEach(async () => {
	for (const dispose of cleanup.splice(0)) await dispose();
	delete (SVGElement.prototype as unknown as Record<string, unknown>).getScreenCTM;
	vi.unstubAllGlobals();
});

type Opened = { initialFingers: Finger[]; initialGridSize: GridSize; initialWeaveParity: 0 | 1; initialPattern: HeartPattern };

function render(opened?: Opened | { initialEscherTab: boolean }) {
	const target = document.createElement('div');
	document.body.appendChild(target);
	let fingers: Finger[] = [];
	let gridSize: GridSize = { x: 0, y: 0 };
	const component = mount(PaperHeart, {
		target,
		props: {
			lang: 'en',
			...opened,
			onFingersChange(nextFingers, nextGrid) {
				fingers = nextFingers;
				gridSize = nextGrid;
			}
		}
	});
	flushSync();
	cleanup.push(async () => { await unmount(component); target.remove(); });
	return {
		target,
		svg: target.querySelector<SVGSVGElement>('.canvas-wrapper > svg')!,
		get fingers() { return fingers; },
		get gridSize() { return gridSize; },
		path(id: string) {
			const index = fingers.findIndex((f) => f.id === id);
			return target.querySelectorAll<SVGPathElement>('path[stroke-opacity="0.001"]')[index]!;
		},
		handles: () => target.querySelectorAll('rect[style*="cursor: pointer"]'),
		button: (label: string) => target.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!
	};
}

function send(target: Element, type: string, p: Vec, shiftKey = false) {
	target.dispatchEvent(new PointerEvent(type, {
		pointerId: 1, pointerType: 'mouse', button: 0, buttons: type === 'pointerup' ? 0 : 1,
		clientX: p.x, clientY: p.y, bubbles: true, shiftKey
	}));
	flushSync();
}

function midpoint(finger: Finger): Vec {
	const { p0, p3 } = finger.segments[0]!;
	return { x: (p0.x + p3.x) / 2, y: (p0.y + p3.y) / 2 };
}

const edges = [
	{ id: 'L-0', delta: { x: 0, y: 25 }, cut: 'L-1', grid: { x: 3, y: 4 } },
	{ id: 'L-3', delta: { x: 0, y: -25 }, cut: 'L-3', grid: { x: 3, y: 4 } },
	{ id: 'R-0', delta: { x: 25, y: 0 }, cut: 'R-1', grid: { x: 4, y: 3 } },
	{ id: 'R-3', delta: { x: -25, y: 0 }, cut: 'R-3', grid: { x: 4, y: 3 } }
];

describe('outer edges in the designer', () => {
	it.each(edges)('$id has no editable corners, node tools or double-click insertion', ({ id }) => {
		const h = render();
		const original = JSON.stringify(h.fingers);
		const p = midpoint(h.fingers.find((f) => f.id === id)!);
		// Repeated and shift-clicks must all remain whole-edge gestures.
		for (const shift of [false, false, true]) {
			send(h.path(id), 'pointerdown', p, shift);
			send(h.svg, 'pointerup', p);
			expect(h.handles()).toHaveLength(0);
			const tools = h.target.querySelectorAll<HTMLButtonElement>(
				'.edit-controls button, .node-type-controls button, .convert-controls button'
			);
			expect([...tools].every((button) => button.disabled)).toBe(true);
		}
		window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete' }));
		flushSync();
		expect(JSON.stringify(h.fingers)).toBe(original);
	});

	it.each(edges)('$id still pulls inward to create an editable cut, with undo and redo', ({ id, delta, cut, grid }) => {
		const h = render();
		const original = JSON.stringify(h.fingers);
		const edge = h.fingers.find((f) => f.id === id)!;
		const p = midpoint(edge);
		const end = { x: p.x + delta.x, y: p.y + delta.y };
		send(h.path(id), 'pointerdown', p);
		send(h.svg, 'pointermove', end);
		expect(h.handles()).toHaveLength(0);
		send(h.svg, 'pointerup', end);
		expect(h.gridSize).toEqual(grid);
		expect(h.fingers).toHaveLength(9);
		const outer = h.fingers.find((f) => f.lobe === edge.lobe &&
			JSON.stringify(f.segments[0]!.p0) === JSON.stringify(edge.segments[0]!.p0));
		expect(outer?.segments[0]!.p3).toEqual(edge.segments[0]!.p3);
		expect(h.handles()).toHaveLength(2);
		const created = JSON.stringify(h.fingers);
		h.button('Undo').click();
		flushSync();
		expect(JSON.stringify(h.fingers)).toBe(original);
		expect(h.handles()).toHaveLength(0);
		h.button('Redo').click();
		flushSync();
		expect(JSON.stringify(h.fingers)).toBe(created);
		// Double-clicking the resulting real cut still inserts a node.
		const at = midpoint(h.fingers.find((f) => f.id === cut)!);
		for (let i = 0; i < 2; i++) {
			send(h.path(cut), 'pointerdown', at);
			send(h.svg, 'pointerup', at);
		}
		expect(h.fingers.find((f) => f.id === cut)!.segments).toHaveLength(2);
		expect(h.handles()).toHaveLength(3);
	});
});

describe('the Escher tab', () => {
	const chosenType = (h: ReturnType<typeof render>) => h.target.querySelector('.rule-templates [data-state="on"]')?.getAttribute('title');
	const chosenTab = (h: ReturnType<typeof render>) => h.target.querySelector('.symmetry-tabs [data-state="on"]')?.textContent?.trim();
	const snapBox = (h: ReturnType<typeof render>) => [...h.target.querySelectorAll('label.checkbox')].some((l) => l.textContent?.includes("Snap to the other lobe's points"));
	const cutsOf = (fingers: Finger[]) => JSON.stringify(fingers.map((f) => [f.id, f.segments]).sort());

	it('always has a type: opened on a heart that is no tile, it draws the cuts as the first type starts, which Fortryd takes back', async () => {
		const h = render({ initialEscherTab: true });
		const original = JSON.stringify(h.fingers);
		await vi.waitFor(() => expect(chosenType(h)).toBe('Moved'));
		expect(chosenTab(h)).toBe('Escher');
		expect(cutsOf(h.fingers)).toBe(cutsOf(tileFingers(fitLines(ruleStart(opposite('move', 'move'), 2)))));
		// the lobes share their crossings, which the tile places: no snapping to the other lobe's points
		expect(snapBox(h)).toBe(false);
		h.button('Undo').click();
		flushSync();
		expect(JSON.stringify(h.fingers)).toBe(original);
		expect(chosenTab(h)).toBe('Normal');
		expect(snapBox(h)).toBe(true);
	});

	it.each(['L-0', 'R-4', 'L-2', 'R-1'])('moves the whole pattern when %s is dragged: no strip added or cut moved alone, and the type kept', async (id) => {
		const tile = { ...knobTile(opposite('move', 'move')), cuts: 3 };
		const h = render({ initialFingers: tileFingers(tile), initialGridSize: tileGrid(tile), initialWeaveParity: weaveParityOf(tile), initialPattern: savedPattern(tile) });
		await vi.waitFor(() => expect(chosenType(h)).toBe('Moved'));
		const from = h.fingers.find((f) => f.id === id)!.segments[0]!.p3;
		const delta = { x: 30, y: -12 };
		send(h.path(id), 'pointerdown', from);
		send(h.svg, 'pointermove', { x: from.x + delta.x / 2, y: from.y + delta.y / 2 });
		send(h.svg, 'pointermove', { x: from.x + delta.x, y: from.y + delta.y });
		send(h.svg, 'pointerup', { x: from.x + delta.x, y: from.y + delta.y });
		const moved = dragTile(startPanDrag(tile, from, null), delta, getCenteredRectParams({ x: 4, y: 4 }))!;
		expect(moved.pan).toBeDefined();
		expect(cutsOf(h.fingers)).toBe(cutsOf(tileFingers(moved)));
		expect(h.gridSize).toEqual(tileGrid(moved));
		expect(chosenType(h)).toBe('Moved');
	});

	it('stretches the tiles when a black point is dragged along its cut, and the heart gets more strips that way', async () => {
		const tile = { ...knobTile(opposite('move', 'move')), cuts: 3 };
		const h = render({ initialFingers: tileFingers(tile), initialGridSize: tileGrid(tile), initialWeaveParity: weaveParityOf(tile), initialPattern: savedPattern(tile) });
		await vi.waitFor(() => expect(chosenType(h)).toBe('Moved'));
		const anchors = () => {
			const segs = h.fingers.find((f) => f.id === 'L-2')!.segments;
			return [segs[0]!.p0, ...segs.map((s) => s.p3)];
		};
		send(h.path('L-2'), 'pointerdown', anchors()[0]!);
		send(h.svg, 'pointerup', anchors()[0]!);
		// the black points, in Tegn's order along the cut: its crossings, ends and all
		const black = [...h.handles()].map((el, a) => ({ el, a })).filter(({ el }) => el.getAttribute('fill') === '#1e2a25');
		expect(black.length).toBeGreaterThanOrEqual(3);
		// the second one in from the right edge, dragged along the cut towards the middle
		const { el, a } = black[1]!;
		const from = anchors()[a]!;
		const to = { x: from.x - 30, y: from.y };
		send(el, 'pointerdown', from);
		send(h.svg, 'pointermove', { x: from.x - 15, y: from.y });
		send(h.svg, 'pointermove', to);
		send(h.svg, 'pointerup', to);
		expect(h.gridSize.x).toBeGreaterThan(4);
		expect(h.gridSize.y).toBe(4);
		expect(chosenType(h)).toBe('Moved');
	});

	it('starts the tile over as its type starts, at its size, which Fortryd takes back', async () => {
		const tile = { ...knobTile(opposite('move', 'turn')), cuts: 4 };
		const h = render({ initialFingers: tileFingers(tile), initialGridSize: tileGrid(tile), initialWeaveParity: weaveParityOf(tile), initialPattern: savedPattern(tile) });
		await vi.waitFor(() => expect(chosenType(h)).toBe('Moved and half turn'));
		const knobs = JSON.stringify(h.fingers);
		h.target.querySelector<HTMLButtonElement>('.pattern-restart')!.click();
		flushSync();
		expect(cutsOf(h.fingers)).toBe(cutsOf(tileFingers(restartedTile(tile))));
		expect(chosenType(h)).toBe('Moved and half turn');
		h.button('Undo').click();
		flushSync();
		expect(JSON.stringify(h.fingers)).toBe(knobs);
	});

	it('drags the same node of a moved pattern on, though the edge cuts more of a curve before it into the cut on the way', async () => {
		// The type's start with a node added in the middle of every piece. Dragging node 10 of R-1 lets
		// the edge show more of the curve before it: from the second step on, the cut made again has
		// the node as node 11.
		const start = ruleStart(opposite('turn', 'move'), 4);
		const noded = { ...start, curves: Object.fromEntries(Object.entries(start.curves).map(([key, curve]) => [key, curve!.flatMap((s) => splitBezierAt(s, 0.5))])) };
		const tile = fitLines({ ...noded, pan: { x: 0.37, y: -0.21 } });
		const h = render({ initialFingers: tileFingers(tile), initialGridSize: tileGrid(tile), initialWeaveParity: weaveParityOf(tile), initialPattern: savedPattern(tile) });
		await vi.waitFor(() => expect(h.target.querySelector('.rule-templates')).not.toBeNull());
		const nodes = () => h.fingers.find((f) => f.id === 'R-1')!.segments.map((s) => s.p0);
		send(h.path('R-1'), 'pointerdown', nodes()[5]!);
		send(h.svg, 'pointerup', nodes()[5]!);
		const from = nodes()[10]!;
		send(h.handles()[10]!, 'pointerdown', from);
		let pointer = from;
		for (let step = 1; step <= 3; step++) {
			pointer = { x: from.x - 1.5 * step, y: from.y + step };
			send(h.svg, 'pointermove', pointer);
			// The dragged node is under the pointer, and still the one selected.
			const at = nodes().findIndex((p) => Math.hypot(p.x - pointer.x, p.y - pointer.y) < 1e-6);
			expect(at, `step ${step}`).toBe(step === 1 ? 10 : 11);
			expect(h.handles()[at]!.getAttribute('fill'), `step ${step}`).toBe('#ffcc00');
		}
		send(h.svg, 'pointerup', pointer);
	});
});

describe('the red cuts', () => {
	it('mark a cut dragged too close to the next one at the first move, and are right again the moment the drag ends', () => {
		const h = render();
		const red = () => h.target.querySelectorAll('path[stroke="#ff0000"]').length;
		expect(red()).toBe(0);
		// A node in the middle of R-1, put by a double-click.
		const at = midpoint(h.fingers.find((f) => f.id === 'R-1')!);
		for (let i = 0; i < 2; i++) {
			send(h.path('R-1'), 'pointerdown', at);
			send(h.svg, 'pointerup', at);
		}
		// Dragged to a pixel short of R-2: no crossing, so the drag goes there, but far too close.
		const next = h.fingers.find((f) => f.id === 'R-2')!.segments[0]!.p0.x;
		const node = h.fingers.find((f) => f.id === 'R-1')!.segments[1]!.p0;
		send(h.handles()[1]!, 'pointerdown', node);
		send(h.svg, 'pointermove', { x: next - 1, y: node.y });
		expect(h.fingers.find((f) => f.id === 'R-1')!.segments[1]!.p0.x).toBeCloseTo(next - 1);
		expect(red()).toBeGreaterThan(0);
		// Straight back and let go: during a drag the check may wait a moment, but not past its end.
		send(h.svg, 'pointermove', node);
		send(h.svg, 'pointerup', node);
		expect(red()).toBe(0);
	});
});
