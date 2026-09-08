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
	const target = document.createElement('div');
	document.body.appendChild(target);
	const component = mount(MaskToolPanelFixture, {
		target,
		props: {
			tool: 'pen',
			onTool: (tool: PaintTool) => picked.push(tool),
			brushSize: 'medium',
			onBrushSize: () => {},
			paintValue: 1,
			onPaintValue: () => {},
			colors: { left: '#ffffff', right: '#b91313' },
			canUndo: false,
			canRedo: false,
			onUndo: () => {},
			onRedo: () => {},
			onImport: () => {},
			onClear: () => {},
			lang: 'da',
			...overrides
		} as Props
	});
	flushSync();
	const buttons = [...target.querySelectorAll<HTMLButtonElement>('.tool-grid button')];
	return {
		picked,
		buttons,
		byLabel: (label: string) => buttons.find((b) => b.getAttribute('aria-label') === label),
		cleanup: () => {
			unmount(component);
			target.remove();
		}
	};
}

describe('MaskToolPanel', () => {
	it('gives every tool button its own click', () => {
		const panel = render();
		try {
			expect(panel.buttons).toHaveLength(5);
			for (const button of panel.buttons) button.click();
			flushSync();
			expect(panel.picked).toEqual(['pen', 'eraser', 'fill', 'line', 'rect']);
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
			expect(panel.buttons.map((b) => b.disabled)).toEqual([true, true, true, true, true]);
			panel.byLabel('Viskelæder')?.click();
			flushSync();
			expect(panel.picked).toEqual([]);
		} finally {
			panel.cleanup();
		}
	});
});
