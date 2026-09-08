/**
 * "Kanten" is its one row under Fast — PAINT.md §2 and §11.
 *
 * The panel is what keeps the three-panel column inside a desktop window, and
 * the way it does it is easy to break in the wrong direction: hiding the shape
 * and the size must change the *panel*, never the frame. A collapse that reset
 * the shape or the size would throw away a setting the visitor made, and they
 * would only find out on the next search.
 */
import { describe, expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import FramePanel from './FramePanel.svelte';
import { DEFAULT_FRAME, type Frame } from '$lib/paint/frame';

type Props = Parameters<typeof FramePanel>[1];

function render(frame: Frame) {
	const asked: Frame[] = [];
	const target = document.createElement('div');
	document.body.appendChild(target);
	const component = mount(FramePanel, {
		target,
		props: {
			frame,
			onFrameStart: () => {},
			onFrame: (next: Frame) => asked.push(next),
			lang: 'da'
		} as Props
	});
	flushSync();
	return {
		asked,
		shapes: target.querySelectorAll('.shape-btn').length,
		sliders: target.querySelectorAll("input[type='range']").length,
		notes: target.querySelectorAll('.note').length,
		title: target.querySelector<HTMLElement>('.panel-title')?.title ?? '',
		mode: (label: string) =>
			[...target.querySelectorAll<HTMLElement>("[data-slot='toggle-group-item']")].find(
				(el) => el.textContent?.trim() === label
			),
		cleanup: () => {
			unmount(component);
			target.remove();
		}
	};
}

describe('FramePanel', () => {
	it('is the Fast / Fri row alone while the band is fixed', () => {
		const panel = render({ ...DEFAULT_FRAME, mode: 'fixed' });
		try {
			expect(panel.shapes).toBe(0);
			expect(panel.sliders).toBe(0);
			expect(panel.notes).toBe(0);
			// The sentence the body no longer carries is on the heading instead.
			expect(panel.title).toBe('Hele firkanten væves, som du har malet den.');
		} finally {
			panel.cleanup();
		}
	});

	it('shows the shape, the size and the hint once the band is free', () => {
		const panel = render({ ...DEFAULT_FRAME, mode: 'free' });
		try {
			expect(panel.shapes).toBe(3);
			expect(panel.sliders).toBe(1);
			expect(panel.notes).toBe(1);
			// Its own hint is in the body, so the heading has nothing left to say.
			expect(panel.title).toBe('');
		} finally {
			panel.cleanup();
		}
	});

	it('keeps the shape and the size the collapsed panel was not showing', () => {
		const kept: Frame = { mode: 'fixed', shape: 'hexagon', size: 0.42 };
		const panel = render(kept);
		try {
			panel.mode('Fri')?.click();
			flushSync();
			expect(panel.asked).toEqual([{ mode: 'free', shape: 'hexagon', size: 0.42 }]);
		} finally {
			panel.cleanup();
		}
	});
});
