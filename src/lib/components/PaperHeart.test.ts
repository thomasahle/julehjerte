import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import PaperHeart from './PaperHeart.svelte';
import type { Finger, GridSize, Vec } from '$lib/types/heart';

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

function render() {
	const target = document.createElement('div');
	document.body.appendChild(target);
	let fingers: Finger[] = [];
	let gridSize: GridSize = { x: 0, y: 0 };
	const component = mount(PaperHeart, {
		target,
		props: {
			lang: 'en',
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
