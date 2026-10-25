import { describe, it, expect } from 'vitest';
import { MIN_BRUSH_SIZE, MAX_BRUSH_SIZE, DEFAULT_BRUSH_SIZE, clampBrush, shortcutFor, stepBrush } from './toolset';

describe('brush sizes', () => {
	it('keeps the medium default and accepts sizes between the old presets', () => {
		expect(DEFAULT_BRUSH_SIZE).toBe(6);
		expect(clampBrush(9)).toBe(9);
		expect(clampBrush(9.7)).toBe(10);
		expect(clampBrush(NaN)).toBe(DEFAULT_BRUSH_SIZE);
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
		expect(shortcutFor({ key: 'E' })).toEqual({ kind: 'tool', tool: 'eraser' });
		expect(shortcutFor({ key: 'f' })).toEqual({ kind: 'tool', tool: 'fill' });
		expect(shortcutFor({ key: 'l' })).toEqual({ kind: 'tool', tool: 'line' });
		expect(shortcutFor({ key: 'r' })).toEqual({ kind: 'tool', tool: 'rect' });
		expect(shortcutFor({ key: 'u' })).toEqual({ kind: 'tool', tool: 'smudge' });
		expect(shortcutFor({ key: 'm' })).toEqual({ kind: 'tool', tool: 'select' });
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
