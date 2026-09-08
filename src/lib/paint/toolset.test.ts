import { describe, it, expect } from 'vitest';
import { BRUSH_RADII, BRUSH_SIZES, shortcutFor, stepBrush } from './toolset';

describe('brush sizes', () => {
	it('grows from fine to coarse', () => {
		const radii = BRUSH_SIZES.map((s) => BRUSH_RADII[s]);
		expect(radii).toEqual([...radii].sort((a, b) => a - b));
		expect(new Set(radii).size).toBe(radii.length);
	});

	it('steps along them and stops at both ends', () => {
		expect(stepBrush('fine', 1)).toBe('medium');
		expect(stepBrush('medium', 1)).toBe('coarse');
		expect(stepBrush('coarse', 1)).toBe('coarse');
		expect(stepBrush('coarse', -1)).toBe('medium');
		expect(stepBrush('fine', -1)).toBe('fine');
	});
});

describe('shortcutFor', () => {
	it('picks a tool with its own letter', () => {
		expect(shortcutFor({ key: 'p' })).toEqual({ kind: 'tool', tool: 'pen' });
		expect(shortcutFor({ key: 'E' })).toEqual({ kind: 'tool', tool: 'eraser' });
		expect(shortcutFor({ key: 'f' })).toEqual({ kind: 'tool', tool: 'fill' });
		expect(shortcutFor({ key: 'l' })).toEqual({ kind: 'tool', tool: 'line' });
		expect(shortcutFor({ key: 'r' })).toEqual({ kind: 'tool', tool: 'rect' });
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
