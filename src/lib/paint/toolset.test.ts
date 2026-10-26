import { describe, it, expect } from 'vitest';
import { MIN_BRUSH_SIZE, MAX_BRUSH_SIZE, DEFAULT_BRUSH_SIZE, MIN_SMUDGE_SIZE, MAX_SMUDGE_SIZE, SIZE_SLIDER_STEPS, clampBrush, clampStrength, shortcutFor, sizeOfSlider, sliderOfSize, stepBrush } from './toolset';

describe('brush sizes', () => {
	it('keeps the medium default and accepts sizes between the old presets', () => {
		expect(DEFAULT_BRUSH_SIZE).toBe(6);
		expect(clampBrush(9)).toBe(9);
		expect(clampBrush(9.7)).toBe(10);
		expect(clampBrush(NaN)).toBe(DEFAULT_BRUSH_SIZE);
	});

	it('reaches as far as Udtvær, half the mask', () => {
		expect(MAX_BRUSH_SIZE).toBe(MAX_SMUDGE_SIZE);
		expect(clampBrush(500)).toBe(MAX_BRUSH_SIZE);
	});

	it('steps a cell at a time while fine, a tenth of its size once broad', () => {
		expect(stepBrush(100, 1)).toBe(110);
		expect(stepBrush(100, -1)).toBe(90);
		expect(stepBrush(196, 1)).toBe(MAX_BRUSH_SIZE);
	});

	it('sets every size on the slider, the fine ones as easily as the broad', () => {
		for (const [min, max] of [[MIN_BRUSH_SIZE, MAX_BRUSH_SIZE], [MIN_SMUDGE_SIZE, MAX_SMUDGE_SIZE]])
			for (let size = min; size <= max; size++) expect(sizeOfSlider(sliderOfSize(size, min, max), min, max)).toBe(size);
		expect(sizeOfSlider(0, MIN_BRUSH_SIZE, MAX_BRUSH_SIZE)).toBe(MIN_BRUSH_SIZE);
		expect(sizeOfSlider(SIZE_SLIDER_STEPS, MIN_BRUSH_SIZE, MAX_BRUSH_SIZE)).toBe(MAX_BRUSH_SIZE);
		// Sizes 1 to 10 take as much of the slider as 20 to 200.
		const share = (a: number, b: number) => sliderOfSize(b, MIN_BRUSH_SIZE, MAX_BRUSH_SIZE) - sliderOfSize(a, MIN_BRUSH_SIZE, MAX_BRUSH_SIZE);
		expect(Math.abs(share(1, 10) - share(20, 200))).toBeLessThanOrEqual(1);
	});

	it("keeps Udtvær's strength between a tenth and full", () => {
		expect(clampStrength(5)).toBe(10);
		expect(clampStrength(55.4)).toBe(55);
		expect(clampStrength(120)).toBe(100);
		expect(clampStrength(NaN)).toBe(100);
	});

	it('steps one cell at a time and stops at both ends', () => {
		expect(stepBrush(6, 1)).toBe(7);
		expect(stepBrush(6, -1)).toBe(5);
		expect(stepBrush(MAX_BRUSH_SIZE, 1)).toBe(MAX_BRUSH_SIZE);
		expect(stepBrush(MIN_BRUSH_SIZE, -1)).toBe(MIN_BRUSH_SIZE);
	});
});

describe('shortcutFor', () => {
	it('picks a tool with its own letter', () => {
		expect(shortcutFor({ key: 'p' })).toEqual({ kind: 'tool', tool: 'pen' });
		expect(shortcutFor({ key: 'f' })).toEqual({ kind: 'tool', tool: 'fill' });
		expect(shortcutFor({ key: 'l' })).toEqual({ kind: 'tool', tool: 'line' });
		expect(shortcutFor({ key: 'r' })).toEqual({ kind: 'tool', tool: 'rect' });
		expect(shortcutFor({ key: 'u' })).toEqual({ kind: 'tool', tool: 'smudge' });
		expect(shortcutFor({ key: 'm' })).toEqual({ kind: 'tool', tool: 'select' });
		expect(shortcutFor({ key: 'o' })).toEqual({ kind: 'tool', tool: 'ellipse' });
		expect(shortcutFor({ key: 'e' })).toBeNull();
	});

	it('steps the brush with the bracket keys and swaps the colour with X', () => {
		expect(shortcutFor({ key: '[' })).toEqual({ kind: 'brush', delta: -1 });
		expect(shortcutFor({ key: ']' })).toEqual({ kind: 'brush', delta: 1 });
		expect(shortcutFor({ key: 'x' })).toEqual({ kind: 'swapColour' });
	});

	it('undoes and redoes with the site-wide chord', () => {
		expect(shortcutFor({ key: 'z', metaKey: true })).toEqual({ kind: 'undo' });
		expect(shortcutFor({ key: 'z', ctrlKey: true })).toEqual({ kind: 'undo' });
		expect(shortcutFor({ key: 'z', metaKey: true, shiftKey: true })).toEqual({ kind: 'redo' });
		expect(shortcutFor({ key: 'y', ctrlKey: true })).toEqual({ kind: 'redo' });
	});

	it('leaves the browser its own chords', () => {
		// Ctrl+R reloads and Alt+P opens a menu somewhere; a paint tool must not
		// take either of them.
		expect(shortcutFor({ key: 'r', ctrlKey: true })).toBeNull();
		expect(shortcutFor({ key: 'p', metaKey: true })).toBeNull();
		expect(shortcutFor({ key: 'e', altKey: true })).toBeNull();
	});

	it('says nothing about a key it does not know', () => {
		expect(shortcutFor({ key: 'q' })).toBeNull();
		expect(shortcutFor({ key: 'Enter' })).toBeNull();
		expect(shortcutFor({ key: ' ' })).toBeNull();
	});
});
