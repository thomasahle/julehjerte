/**
 * The tool buttons are wrapped in a `Tooltip.Trigger`, and its `child` snippet
 * hands the button a props object that carries an `onclick` of its own and a
 * `disabled: false`. Whichever of the two spreads comes last wins, so the order
 * of one line decides whether clicking "Viskelæder" picks the eraser at all —
 * and nothing else in the suite would notice, because every keyboard shortcut
 * goes straight to `shortcutFor` and never touches the button.
 *
 * So this mounts the real panel and clicks the real buttons.
 */
import { describe, expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import MaskToolPanelFixture from './MaskToolPanelFixture.svelte';
import type MaskToolPanel from './MaskToolPanel.svelte';
import type { PaintTool } from '$lib/paint/toolset';

type Props = Parameters<typeof MaskToolPanel>[1];

function render(overrides: Partial<Props> = {}) {
	const picked: PaintTool[] = [];
	const history: string[] = [];
	const target = document.createElement('div');
	document.body.appendChild(target);
	const component = mount(MaskToolPanelFixture, {
		target,
		props: {
			tool: 'pen',
			onTool: (tool: PaintTool) => picked.push(tool),
			brushSize: 6,
			onBrushSize: () => {},
			paintValue: 1,
			onPaintValue: () => {},
			colors: { left: '#ffffff', right: '#b91313' },
			canUndo: false,
			canRedo: false,
			onUndo: () => history.push('undo'),
			onRedo: () => history.push('redo'),
			onImport: () => {},
			onClear: () => {},
			lang: 'da',
			...overrides
		} as Props
	});
	flushSync();
	const buttons = [...target.querySelectorAll<HTMLButtonElement>('.tool-grid button')];
	return {
		target,
		picked,
		buttons,
		history,
		historyButtons: [...target.querySelectorAll<HTMLButtonElement>('.history button')],
		byLabel: (label: string) => buttons.find((b) => b.getAttribute('aria-label') === label),
		cleanup: () => {
			unmount(component);
			target.remove();
		}
	};
}

describe('MaskToolPanel', () => {
	it('offers both paper colours and XOR as one exclusive painting choice', () => {
		const chosen: unknown[] = [];
		const panel = render({ paintValue: 'xor', onPaintValue: value => chosen.push(value) });
		try {
			const swatches = [...panel.target.querySelectorAll<HTMLButtonElement>('.swatches button')];
			expect(swatches).toHaveLength(3);
			const xor = swatches.find(button => button.textContent?.includes('XOR'))!;
			expect(xor.getAttribute('data-state')).toBe('on');
			expect(xor.getAttribute('aria-label')).toContain('byt farven');
			swatches[0]!.click();
			flushSync();
			expect(chosen).toEqual([0]);
		} finally {
			panel.cleanup();
		}
	});

	it('uses a labelled integer slider and accepts sizes between the old presets', () => {
		const sizes: number[] = [];
		const panel = render({ onBrushSize: size => sizes.push(size) });
		try {
			const slider = panel.target.querySelector<HTMLInputElement>('input[type="range"]')!;
			expect(slider.getAttribute('aria-label')).toBe('Pensel');
			expect(slider.getAttribute('aria-valuetext')).toBe('Radius: 6 px');
			expect([slider.min, slider.max, slider.step, slider.value]).toEqual(['1', '40', '1', '6']);
			slider.value = '9';
			slider.dispatchEvent(new Event('input', { bubbles: true }));
			flushSync();
			expect(sizes).toEqual([9]);
		} finally {
			panel.cleanup();
		}
	});

	it('disables the slider and all three paint choices during a search', () => {
		const panel = render({ disabled: true });
		try {
			expect(panel.target.querySelector<HTMLInputElement>('input[type="range"]')!.disabled).toBe(true);
			expect([...panel.target.querySelectorAll<HTMLButtonElement>('.swatches button')].every(button => button.disabled)).toBe(true);
		} finally {
			panel.cleanup();
		}
	});

	it('gives every tool button its own click', () => {
		const panel = render();
		try {
			expect(panel.buttons).toHaveLength(6);
			for (const button of panel.buttons) button.click();
			flushSync();
			expect(panel.picked).toEqual(['pen', 'eraser', 'fill', 'line', 'rect', 'select']);
		} finally {
			panel.cleanup();
		}
	});

	it('marks the chosen tool and only that one', () => {
		const panel = render({ tool: 'fill' });
		try {
			const pressed = panel.buttons
				.filter((b) => b.getAttribute('aria-pressed') === 'true')
				.map((b) => b.getAttribute('aria-label'));
			expect(pressed).toEqual(['Fyld']);
		} finally {
			panel.cleanup();
		}
	});

	it('really disables the tools while the engine is working', () => {
		const panel = render({ disabled: true });
		try {
			expect(panel.buttons.map((b) => b.disabled)).toEqual([true, true, true, true, true, true]);
			panel.byLabel('Viskelæder')?.click();
			flushSync();
			expect(panel.picked).toEqual([]);
		} finally {
			panel.cleanup();
		}
	});

	// Fortryd and Gentag went through the same tooltip trigger as the tools above
	// them, so they inherited the same one-line trap: the trigger's props carry an
	// `onclick`, and spreading them last would swallow the undo without a word.
	it('gives Fortryd and Gentag their own click through the tooltip', () => {
		const panel = render({ canUndo: true, canRedo: true });
		try {
			expect(panel.historyButtons.map((b) => b.getAttribute('aria-label'))).toEqual([
				'Fortryd',
				'Gentag'
			]);
			for (const button of panel.historyButtons) button.click();
			flushSync();
			expect(panel.history).toEqual(['undo', 'redo']);
		} finally {
			panel.cleanup();
		}
	});

	it('leaves each history button disabled while it has nothing to do', () => {
		const panel = render({ canUndo: true, canRedo: false });
		try {
			expect(panel.historyButtons.map((b) => b.disabled)).toEqual([false, true]);
			panel.historyButtons[1]?.click();
			flushSync();
			expect(panel.history).toEqual([]);
		} finally {
			panel.cleanup();
		}
	});
});
