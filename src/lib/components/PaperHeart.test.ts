import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import PaperHeart from './PaperHeart.svelte';
import type { Finger, GridSize, HeartPattern, Vec } from '$lib/types/heart';
import { splitBezierAt } from '$lib/geometry/bezierSegments';
import { closestPointOnBezier } from '$lib/geometry/curves';
import { opposite } from '$lib/pattern/rules';
import { fitLines } from '$lib/pattern/tiling';
import { ruleStart } from '$lib/pattern/starts';
import { dragTile, restartedTile, savedPattern, startPanDrag, tileFingers, tileGrid, turnedTile, weaveParityOf } from '$lib/pattern/escherTab';
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

function render(opened?: Partial<Opened> & { initialEscherTab?: boolean }) {
	const target = document.createElement('div');
	document.body.appendChild(target);
	let fingers: Finger[] = [];
	let gridSize: GridSize = { x: 0, y: 0 };
	let isStart = () => false;
	const component = mount(PaperHeart, {
		target,
		props: {
			lang: 'en',
			...opened,
			onFingersChange(nextFingers, nextGrid, _parity, _pattern, nextIsStart) {
				fingers = nextFingers;
				gridSize = nextGrid;
				isStart = nextIsStart;
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
		/** Whether the heart is just its Escher type's start, as the route is told. */
		isStart: () => isStart(),
		path(id: string) {
			const index = fingers.findIndex((f) => f.id === id);
			return target.querySelectorAll<SVGPathElement>('path[stroke-opacity="0.001"]')[index]!;
		},
		handles: () => target.querySelectorAll('[data-grab-anchor]'),
		button: (label: string) => target.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!
	};
}

function send(target: Element, type: string, p: Vec, shiftKey = false, pointerType = 'mouse') {
	target.dispatchEvent(new PointerEvent(type, {
		pointerId: 1, pointerType, button: 0, buttons: type === 'pointerup' ? 0 : 1,
		clientX: p.x, clientY: p.y, bubbles: true, shiftKey
	}));
	flushSync();
}

function midpoint(finger: Finger): Vec {
	const { p0, p3 } = finger.segments[0]!;
	return { x: (p0.x + p3.x) / 2, y: (p0.y + p3.y) / 2 };
}

/** The point `t` of the way along a cubic Bézier segment. */
function bezierAt(seg: Finger['segments'][number], t: number): Vec {
	const u = 1 - t;
	return {
		x: u * u * u * seg.p0.x + 3 * u * u * t * seg.p1.x + 3 * u * t * t * seg.p2.x + t * t * t * seg.p3.x,
		y: u * u * u * seg.p0.y + 3 * u * u * t * seg.p1.y + 3 * u * t * t * seg.p2.y + t * t * t * seg.p3.y
	};
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
	const chosenType = (h: ReturnType<typeof render>) => h.target.querySelector('.rule-templates [data-state="on"]')?.getAttribute('aria-label');
	const pressed = (h: ReturnType<typeof render>, label: string) => h.button(label).getAttribute('aria-pressed') === 'true';
	const chosenTab = (h: ReturnType<typeof render>) => h.target.querySelector('.symmetry-tabs [data-state="on"]')?.textContent?.trim();
	const snapBox = (h: ReturnType<typeof render>) => [...h.target.querySelectorAll('label.checkbox')].some((l) => l.textContent?.includes("Snap to the other lobe's points"));
	const cutsOf = (fingers: Finger[]) => JSON.stringify(fingers.map((f) => [f.id, f.segments]).sort());

	it('always has a type: opened on a heart that is no tile, it draws the cuts as the first type starts, which Fortryd takes back', async () => {
		const h = render({ initialEscherTab: true });
		const original = JSON.stringify(h.fingers);
		await vi.waitFor(() => expect(chosenType(h)).toBe('Moved'));
		expect(chosenTab(h)).toBe('Escher');
		// every type's tooltip says what it does, before it is chosen
		const moved = h.target.querySelector('.rule-templates [data-state="on"]')!.getAttribute('title')!;
		expect(moved.split('\n')).toEqual(['Moved', expect.stringContaining('The white tile is the red one')]);
		expect(cutsOf(h.fingers)).toBe(cutsOf(tileFingers(fitLines(ruleStart(opposite('move', 'move'), 2)))));
		// the lobes share their crossings, which the tile places: no snapping to the other lobe's points
		expect(snapBox(h)).toBe(false);
		h.button('Undo').click();
		flushSync();
		expect(JSON.stringify(h.fingers)).toBe(original);
		expect(chosenTab(h)).toBe('Normal');
		expect(snapBox(h)).toBe(true);
	});

	it.each(['L-0', 'R-4', 'L-4', 'R-0', 'L-2', 'R-1'])('moves the whole pattern when %s is dragged: no strip added or cut moved alone, and the type kept', async (id) => {
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

	it.each(['L-2', 'R-1'])('chooses the cut %s when it is clicked: its points show, and nothing moves', async (id) => {
		const tile = { ...knobTile(opposite('move', 'move')), cuts: 3 };
		const h = render({ initialFingers: tileFingers(tile), initialGridSize: tileGrid(tile), initialWeaveParity: weaveParityOf(tile), initialPattern: savedPattern(tile) });
		await vi.waitFor(() => expect(chosenType(h)).toBe('Moved'));
		const opened = JSON.stringify(h.fingers);
		const at = bezierAt(h.fingers.find((f) => f.id === id)!.segments[1]!, 0.5);
		send(h.path(id), 'pointerdown', at);
		send(h.svg, 'pointerup', at);
		expect(h.handles().length).toBeGreaterThan(0);
		expect(JSON.stringify(h.fingers)).toBe(opened);
		expect(h.button('Undo').disabled).toBe(true);
	});

	it("tells the route the cuts it draws as it opens are just its type's start, and not once they are drawn on", async () => {
		const h = render({ initialEscherTab: true });
		await vi.waitFor(() => expect(chosenType(h)).toBe('Moved'));
		expect(h.isStart()).toBe(true);
		// another size of the start is its start too
		const first = cutsOf(h.fingers);
		h.target.querySelector<HTMLButtonElement>('.pattern-sizes button:nth-child(2)')!.click();
		flushSync();
		expect(cutsOf(h.fingers)).not.toBe(first);
		expect(h.isStart()).toBe(true);
		const slider = h.target.querySelector<HTMLInputElement>('.pattern-turn input[type="range"]')!;
		slider.value = '5';
		slider.dispatchEvent(new Event('input', { bubbles: true }));
		flushSync();
		slider.dispatchEvent(new Event('change', { bubbles: true }));
		flushSync();
		expect(h.isStart()).toBe(false);
		// nor is a heart in the Normal tab
		h.button('Undo').click();
		h.button('Undo').click();
		h.button('Undo').click();
		flushSync();
		expect(chosenTab(h)).toBe('Normal');
		expect(h.isStart()).toBe(false);
	});

	it('turns the whole pattern with its turn control, which a turn takes one Fortryd step to take back', async () => {
		const tile = { ...knobTile(opposite('move', 'move')), cuts: 3 };
		const h = render({ initialFingers: tileFingers(tile), initialGridSize: tileGrid(tile), initialWeaveParity: weaveParityOf(tile), initialPattern: savedPattern(tile) });
		await vi.waitFor(() => expect(chosenType(h)).toBe('Moved'));
		const opened = JSON.stringify(h.fingers);
		const slider = h.target.querySelector<HTMLInputElement>('.pattern-turn input[type="range"]')!;
		expect(h.target.querySelector('.pattern-turn output')?.textContent).toBe('0°');
		slider.value = '7.5';
		slider.dispatchEvent(new Event('input', { bubbles: true }));
		flushSync();
		slider.dispatchEvent(new Event('change', { bubbles: true }));
		flushSync();
		expect(cutsOf(h.fingers)).toBe(cutsOf(tileFingers(turnedTile(tile, 7.5)!)));
		expect(h.target.querySelector('.pattern-turn output')?.textContent).toBe('7.5°');
		expect(chosenType(h)).toBe('Moved');
		h.button('Undo').click();
		flushSync();
		expect(JSON.stringify(h.fingers)).toBe(opened);
		expect(h.button('Undo').disabled).toBe(true);
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
		// chosen, it stays black, ringed in yellow: not yellow all through like a node of the curve
		expect(h.handles()[a]!.getAttribute('fill')).toBe('#1e2a25');
		expect(h.target.querySelectorAll('rect[fill="#ffcc00"][pointer-events="none"]')).toHaveLength(1);
		send(h.svg, 'pointermove', { x: from.x - 15, y: from.y });
		send(h.svg, 'pointermove', to);
		send(h.svg, 'pointerup', to);
		expect(h.gridSize.x).toBeGreaterThan(4);
		expect(h.gridSize.y).toBe(4);
		expect(chosenType(h)).toBe('Moved');
	});

	it('opens a heart whose cuts are a tile on the Escher tab, its type chosen, though no tile was saved with it', async () => {
		const tile = fitLines({ ...knobTile(opposite('move', 'mirror')), cuts: 4, pan: { x: 0.3, y: -0.2 } });
		const h = render({ initialFingers: tileFingers(tile), initialGridSize: tileGrid(tile), initialWeaveParity: weaveParityOf(tile) });
		const opened = JSON.stringify(h.fingers);
		await vi.waitFor(() => expect(chosenType(h)).toBe('Moved and mirrored'));
		expect(chosenTab(h)).toBe('Escher');
		// taken up as it is: not one cut changed
		expect(JSON.stringify(h.fingers)).toBe(opened);
	});

	it('adds a node to every copy of a curve double-clicked, though the second click lands on a handle of the curve', async () => {
		const tile = ruleStart(opposite('move', 'move'), 4);
		const h = render({ initialFingers: tileFingers(tile), initialGridSize: tileGrid(tile), initialWeaveParity: weaveParityOf(tile), initialPattern: savedPattern(tile) });
		await vi.waitFor(() => expect(chosenType(h)).toBe('Moved'));
		const counts = () => h.fingers.filter((f) => /^[LR]-[1-4]$/.test(f.id)).map((f) => `${f.id}:${f.segments.length}`);
		expect(counts()).toEqual(['L-1:5', 'L-2:5', 'L-3:5', 'L-4:5', 'R-1:5', 'R-2:5', 'R-3:5', 'R-4:5']);
		// a point on the bent curve of L-2's second stretch
		const seg = h.fingers.find((f) => f.id === 'L-2')!.segments[1]!;
		const at = bezierAt(seg, 0.55);
		send(h.path('L-2'), 'pointerdown', at);
		send(h.svg, 'pointerup', at);
		// the first click selected the cut and showed its handles; the second lands on one
		const handle = h.target.querySelector('circle[style*="cursor: pointer"]')!;
		send(handle, 'pointerdown', at);
		send(h.svg, 'pointerup', at);
		expect(counts()).toEqual(['L-1:10', 'L-2:10', 'L-3:10', 'L-4:10', 'R-1:5', 'R-2:5', 'R-3:5', 'R-4:5']);
		expect(chosenType(h)).toBe('Moved');
		// the node selected is the one added, where it was put: in L-2's second stretch, after the node
		// the first stretch got too
		const nodes = h.fingers.find((f) => f.id === 'L-2')!.segments.map((s) => s.p0);
		const selected = [...h.handles()].findIndex((el) => el.getAttribute('fill') === '#ffcc00');
		expect(selected).toBe(3);
		expect(Math.hypot(nodes[3]!.x - at.x, nodes[3]!.y - at.y)).toBeLessThan(1);
		// the curve is as it was, the node a smooth one on it
		const [before, after] = h.fingers.find((f) => f.id === 'L-2')!.segments.slice(2, 4);
		for (const k of [0.25, 0.5, 0.75]) {
			const p = bezierAt(before!, k);
			const q = bezierAt(seg, 0.55 * k);
			expect(Math.hypot(p.x - q.x, p.y - q.y)).toBeLessThan(1e-3);
			const r = bezierAt(after!, k);
			const w = bezierAt(seg, 0.55 + 0.45 * k);
			expect(Math.hypot(r.x - w.x, r.y - w.y)).toBeLessThan(1e-3);
		}
		expect(pressed(h, 'Smooth node')).toBe(true);
	});

	it('keeps a node made a corner a corner in every copy, though the pattern is then moved, and its handles then move apart', async () => {
		const tile = ruleStart(opposite('move', 'move'), 4);
		const h = render({ initialFingers: tileFingers(tile), initialGridSize: tileGrid(tile), initialWeaveParity: weaveParityOf(tile), initialPattern: savedPattern(tile) });
		await vi.waitFor(() => expect(chosenType(h)).toBe('Moved'));
		// a smooth node added to the bent curve of L-2's second stretch, its handles in line
		const seg = h.fingers.find((f) => f.id === 'L-2')!.segments[1]!;
		const at = bezierAt(seg, 0.5);
		const second = bezierAt(seg, 0.55);
		send(h.path('L-2'), 'pointerdown', at);
		send(h.svg, 'pointerup', at);
		send(h.path('L-2'), 'pointerdown', second);
		send(h.svg, 'pointerup', second);
		expect(pressed(h, 'Smooth node')).toBe(true);
		const selected = () => [...h.handles()].findIndex((el) => el.getAttribute('fill') === '#ffcc00');
		const node = selected();
		h.button('Corner node').click();
		flushSync();
		expect(pressed(h, 'Corner node')).toBe(true);
		// the pattern moved by its edge: every cut made again, the node still a corner, in every copy
		const edge = h.fingers.find((f) => f.id === 'L-0')!.segments[0]!.p3;
		send(h.path('L-0'), 'pointerdown', edge);
		send(h.svg, 'pointermove', { x: edge.x + 6, y: edge.y + 3 });
		send(h.svg, 'pointerup', { x: edge.x + 6, y: edge.y + 3 });
		const types = (id: string) => h.fingers.find((f) => f.id === id)!.nodeTypes ?? {};
		// every left-lobe cut carries the curve: the node is a corner on each
		for (const id of ['L-1', 'L-2', 'L-3']) expect(types(id)[String(node)], id).toBe('corner');
		// chosen again, it is a corner, and one handle dragged leaves the other where it was
		const corner = h.fingers.find((f) => f.id === 'L-2')!.segments;
		send(h.path('L-2'), 'pointerdown', bezierAt(corner[node - 1]!, 0.5));
		send(h.svg, 'pointerup', bezierAt(corner[node - 1]!, 0.5));
		expect(types('L-2')[String(node)]).toBe('corner');
	});

	it('adds a corner to a straight piece, which Smooth node gives handles that a drag keeps in line', async () => {
		const tile = ruleStart(opposite('move', 'move'), 4);
		const h = render({ initialFingers: tileFingers(tile), initialGridSize: tileGrid(tile), initialWeaveParity: weaveParityOf(tile), initialPattern: savedPattern(tile) });
		await vi.waitFor(() => expect(chosenType(h)).toBe('Moved'));
		// L-2's second stretch made straight: its piece is chosen by a click on it
		const seg = () => h.fingers.find((f) => f.id === 'L-2')!.segments[1]!;
		const on = bezierAt(seg(), 0.5);
		send(h.path('L-2'), 'pointerdown', on);
		send(h.svg, 'pointerup', on);
		h.button('Straight segment').click();
		flushSync();
		const near = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y) < 1e-6;
		const straight = seg();
		expect(near(straight.p1, straight.p0) && near(straight.p2, straight.p3)).toBe(true);
		// a double-click on it, away from the first click, adds a corner with no handles of its own
		const at = bezierAt(straight, 0.2);
		for (let i = 0; i < 2; i++) {
			send(h.path('L-2'), 'pointerdown', at);
			send(h.svg, 'pointerup', at);
		}
		expect(pressed(h, 'Corner node')).toBe(true);
		// the pieces on either side of the node selected, the one added (every copy of the curve has one)
		const selected = () => [...h.handles()].findIndex((el) => el.getAttribute('fill') === '#ffcc00');
		const around = () => h.fingers.find((f) => f.id === 'L-2')!.segments.slice(selected() - 1, selected() + 1);
		expect(Math.hypot(around()[1]!.p0.x - at.x, around()[1]!.p0.y - at.y)).toBeLessThan(1);
		expect(near(around()[0]!.p2, around()[0]!.p3) && near(around()[1]!.p1, around()[1]!.p0)).toBe(true);
		// Smooth node gives it handles, in line
		h.button('Smooth node').click();
		flushSync();
		const inLine = () => {
			const [a, b] = around();
			const node = b!.p0;
			const u = { x: a!.p2.x - node.x, y: a!.p2.y - node.y };
			const v = { x: b!.p1.x - node.x, y: b!.p1.y - node.y };
			return { lengths: [Math.hypot(u.x, u.y), Math.hypot(v.x, v.y)], cross: (u.x * v.y - u.y * v.x) / (Math.hypot(u.x, u.y) * Math.hypot(v.x, v.y)), dot: u.x * v.x + u.y * v.y };
		};
		expect(Math.min(...inLine().lengths)).toBeGreaterThan(1);
		expect(Math.abs(inLine().cross)).toBeLessThan(1e-6);
		expect(inLine().dot).toBeLessThan(0);
		// and the node dragged off the line stays smooth, its handles still in line
		const node = around()[1]!.p0;
		send(h.handles()[selected()]!, 'pointerdown', node);
		send(h.svg, 'pointermove', { x: node.x + 4, y: node.y - 6 });
		send(h.svg, 'pointerup', { x: node.x + 4, y: node.y - 6 });
		expect(Math.abs(inLine().cross)).toBeLessThan(1e-6);
		expect(pressed(h, 'Smooth node')).toBe(true);
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
		// on a tile that is its start already, it changes nothing and leaves nothing to undo
		h.button('Redo').click();
		flushSync();
		const started = JSON.stringify(h.fingers);
		h.target.querySelector<HTMLButtonElement>('.pattern-restart')!.click();
		flushSync();
		expect(JSON.stringify(h.fingers)).toBe(started);
		h.button('Undo').click();
		flushSync();
		expect(JSON.stringify(h.fingers)).toBe(knobs);
		expect(h.button('Undo').disabled).toBe(true);
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

describe('node types', () => {
	it('give a node without handles its handles when it is made smooth', () => {
		const h = render();
		const at = midpoint(h.fingers.find((f) => f.id === 'R-1')!);
		for (let i = 0; i < 2; i++) {
			send(h.path('R-1'), 'pointerdown', at);
			send(h.svg, 'pointerup', at);
		}
		const handleLengths = () => {
			const [a, b] = h.fingers.find((f) => f.id === 'R-1')!.segments;
			return [Math.hypot(a!.p2.x - a!.p3.x, a!.p2.y - a!.p3.y), Math.hypot(b!.p1.x - b!.p0.x, b!.p1.y - b!.p0.y)];
		};
		// the Normal tab adds a node without handles
		expect(handleLengths()).toEqual([0, 0]);
		h.button('Smooth node').click();
		flushSync();
		expect(Math.min(...handleLengths())).toBeGreaterThan(1);
	});
});

describe('the cut under the pointer', () => {
	it('darkens all along, over the stripes where two cuts share a stroke too', () => {
		const h = render();
		h.path('R-1').dispatchEvent(new PointerEvent('pointerenter'));
		flushSync();
		const dark = [...h.svg.querySelectorAll('path[stroke="#000"][stroke-opacity="0.35"]')];
		expect(dark).toHaveLength(1);
		const overlay = h.svg.querySelector('.shared-cut-overlay')!;
		expect(overlay.compareDocumentPosition(dark[0]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
		h.path('R-1').dispatchEvent(new PointerEvent('pointerleave'));
		flushSync();
		expect(h.svg.querySelectorAll('path[stroke="#000"][stroke-opacity="0.35"]')).toHaveLength(0);
	});
});

describe('the keys', () => {
	const key = (type: 'keydown' | 'keyup', k: string, shiftKey = false) => {
		window.dispatchEvent(new KeyboardEvent(type, { key: k, shiftKey }));
		flushSync();
	};

	it('move the chosen node a pixel a press with the arrows, ten with Shift, in one Fortryd step, and F and B step from node to node', () => {
		const h = render();
		const at = midpoint(h.fingers.find((f) => f.id === 'R-1')!);
		for (let i = 0; i < 2; i++) {
			send(h.path('R-1'), 'pointerdown', at);
			send(h.svg, 'pointerup', at);
		}
		const node = () => h.fingers.find((f) => f.id === 'R-1')!.segments[1]!.p0;
		const start = node();
		const opened = JSON.stringify(h.fingers);
		for (let i = 0; i < 3; i++) key('keydown', 'ArrowLeft');
		key('keydown', 'ArrowDown', true);
		key('keyup', 'ArrowDown');
		expect(node().x).toBeCloseTo(start.x - 3);
		expect(node().y).toBeCloseTo(start.y + 10);
		h.button('Undo').click();
		flushSync();
		expect(JSON.stringify(h.fingers)).toBe(opened);
		// F and B: the next node and the one before, round the cut
		const chosen = () => [...h.target.querySelectorAll('[data-grab-anchor]')].find((r) => r.getAttribute('fill') === '#ffcc00')?.getAttribute('data-grab-anchor');
		expect(chosen()).toBe('1');
		key('keydown', 'f');
		expect(chosen()).toBe('2');
		key('keydown', 'f');
		expect(chosen()).toBe('0');
		key('keydown', 'B');
		expect(chosen()).toBe('2');
	});
});

describe('a finger', () => {
	it('takes hold of the chosen cut\'s point nearest it, though it touches beside the point, which keeps that distance from it', () => {
		const h = render();
		const at = midpoint(h.fingers.find((f) => f.id === 'R-1')!);
		for (let i = 0; i < 2; i++) {
			send(h.path('R-1'), 'pointerdown', at);
			send(h.svg, 'pointerup', at);
		}
		const node = h.fingers.find((f) => f.id === 'R-1')!.segments[1]!.p0;
		// pressed 9 units beside the node, on the empty paper, and moved 12 down
		const beside = { x: node.x - 9, y: node.y };
		send(h.svg, 'pointerdown', beside, false, 'touch');
		send(h.svg, 'pointermove', { x: beside.x, y: beside.y + 12 }, false, 'touch');
		send(h.svg, 'pointerup', { x: beside.x, y: beside.y + 12 }, false, 'touch');
		const moved = h.fingers.find((f) => f.id === 'R-1')!.segments[1]!.p0;
		expect(moved.x).toBeCloseTo(node.x);
		expect(moved.y).toBeCloseTo(node.y + 12);
	});
});

describe('the red cuts', () => {
	const red = (h: ReturnType<typeof render>) => h.target.querySelectorAll('path[stroke="#ff0000"]').length;
	// The least gap the red cuts allow on the 3 × 3 heart: 1.5 of its 100 units across 225 px.
	const margin = 1.5 * (225 / 100);

	/** A node put in the middle of R-1 by a double-click. */
	function nodeOnR1(h: ReturnType<typeof render>) {
		const at = midpoint(h.fingers.find((f) => f.id === 'R-1')!);
		for (let i = 0; i < 2; i++) {
			send(h.path('R-1'), 'pointerdown', at);
			send(h.svg, 'pointerup', at);
		}
		return h.fingers.find((f) => f.id === 'R-1')!.segments[1]!.p0;
	}

	it('are never made by a drag: a node dragged at the next cut stops short of it by the gap they need, and says why', () => {
		const h = render();
		expect(red(h)).toBe(0);
		const node = nodeOnR1(h);
		const next = h.fingers.find((f) => f.id === 'R-2')!;
		// How far the dragged node is from R-2, which is gently bent.
		const gap = () => {
			const at = h.fingers.find((f) => f.id === 'R-1')!.segments[1]!.p0;
			return Math.min(...next.segments.map((seg) => closestPointOnBezier(seg, at).distance));
		};
		send(h.handles()[1]!, 'pointerdown', node);
		send(h.svg, 'pointermove', { x: next.segments[0]!.p0.x - 1, y: node.y });
		expect(gap()).toBeGreaterThan(margin - 0.05);
		expect(gap()).toBeLessThan(margin + 0.3);
		expect(red(h)).toBe(0);
		expect(h.target.querySelector('.drag-stop')?.textContent).toContain('too thin');
		// and slides along it as the pointer goes on past it
		send(h.svg, 'pointermove', { x: next.segments[0]!.p0.x + 5, y: node.y + 20 });
		const slid = h.fingers.find((f) => f.id === 'R-1')!.segments[1]!.p0;
		expect(Math.abs(slid.y - (node.y + 20))).toBeLessThan(1);
		expect(gap()).toBeGreaterThan(margin - 0.05);
		expect(gap()).toBeLessThan(margin + 0.3);
		send(h.svg, 'pointerup', slid);
		expect(red(h)).toBe(0);
	});

	it('mark a heart too close already at the first move of a drag, which may leave it so, and are right again the moment the drag ends', () => {
		const first = render();
		const node = nodeOnR1(first);
		const next = first.fingers.find((f) => f.id === 'R-2')!.segments[0]!.p0.x;
		// The same heart with R-1's node a pixel short of R-2: no crossing, but far too close.
		const tooClose = first.fingers.map((f) => {
			if (f.id !== 'R-1') return f;
			const [a, b] = f.segments as [Finger['segments'][number], Finger['segments'][number]];
			const delta = { x: next - 1 - node.x, y: 0 };
			const move = (p: Vec) => ({ x: p.x + delta.x, y: p.y + delta.y });
			return { ...f, segments: [{ ...a, p2: move(a.p2), p3: move(a.p3) }, { ...b, p0: move(b.p0), p1: move(b.p1) }] };
		});
		const h = render({ initialFingers: tooClose, initialGridSize: { x: 3, y: 3 } });
		expect(red(h)).toBeGreaterThan(0);
		const close = h.fingers.find((f) => f.id === 'R-1')!.segments[1]!.p0;
		send(h.path('R-1'), 'pointerdown', close);
		send(h.svg, 'pointerup', close);
		// away: right at the first move
		send(h.handles()[1]!, 'pointerdown', close);
		send(h.svg, 'pointermove', node);
		expect(h.fingers.find((f) => f.id === 'R-1')!.segments[1]!.p0.x).toBeCloseTo(node.x);
		expect(red(h)).toBe(0);
		// back as close as it was, which the drag may leave it, and let go: red the moment the drag ends
		send(h.svg, 'pointermove', close);
		send(h.svg, 'pointerup', close);
		expect(h.fingers.find((f) => f.id === 'R-1')!.segments[1]!.p0.x).toBeCloseTo(next - 1);
		expect(red(h)).toBeGreaterThan(0);
		expect(h.target.querySelector('.canvas-notice.warning')?.textContent).toContain('come too close');
		// A drag that begins on a heart this close may not take it closer than that again, after it once left.
		send(h.handles()[1]!, 'pointerdown', close);
		send(h.svg, 'pointermove', node);
		send(h.svg, 'pointerup', node);
		expect(red(h)).toBe(0);
	});
});
