/**
 * A single drawn line (Rektangel dragged along the diagonal) leaves the engine
 * no two slits to measure between, and it reports the clearance as null. The
 * panel used to throw formatting that number, so it stayed on "Søger efter
 * snit …" for good while the canvas already showed the heart. This mounts the
 * panel mid-search and hands it such a result, as PaintPage does.
 */
import { describe, expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import FindCutsPanelFixture from './FindCutsPanelFixture.svelte';
import type { PaintResult } from '$lib/editor/session.svelte';
import type { HeartDesign } from '$lib/types/heart';

const design = { id: 'heart-test', name: 'Test', gridSize: { x: 2, y: 2 }, fingers: [] } as unknown as HeartDesign;

function render(lang: 'da' | 'en' = 'da') {
	const opened: number[] = [];
	const target = document.createElement('div');
	document.body.appendChild(target);
	const component = mount(FindCutsPanelFixture, {
		target,
		props: { lang, onOpenInDraw: () => opened.push(1) }
	}) as { finish: (result: PaintResult) => void };
	flushSync();
	return {
		target,
		opened,
		finish: (result: PaintResult) => {
			component.finish(result);
			flushSync();
		},
		cleanup: () => {
			unmount(component);
			target.remove();
		}
	};
}

describe('FindCutsPanel', () => {
	it('reaches the found face when the engine reports no clearance', () => {
		const panel = render();
		try {
			expect(panel.target.textContent).toContain('Afbryd');
			panel.finish({
				design,
				report: { cuts: [1, 1], clearanceMm: null, mismatch: 0.012, identical: false }
			});
			const text = panel.target.textContent ?? '';
			expect(text).toContain('Skabelonen er fundet.');
			expect(text).toContain('1 + 1 snit');
			expect(text).not.toContain(' mm');
			expect(text).toContain('1,2% forskel');
			expect(text).not.toContain('Afbryd');
			const open = [...panel.target.querySelectorAll('button')].find(
				(b) => b.textContent?.trim() === 'Åbn i Tegn'
			);
			expect(open).toBeDefined();
			open!.click();
			expect(panel.opened).toHaveLength(1);
		} finally {
			panel.cleanup();
		}
	});

	it('shows a dash for a missing free-border difference', () => {
		const panel = render('en');
		try {
			panel.finish({
				design,
				report: {
					cuts: [2, 2],
					clearanceMm: null,
					mismatch: Number.NaN,
					motifMismatch: 0.046,
					borderChange: Number.NaN,
					identical: false
				}
			});
			const text = panel.target.textContent ?? '';
			expect(text).toContain('4.6% different in the motif · –% of the free border changed');
			expect(text).toContain('2 + 2 cuts');
			expect(text).not.toContain(' mm');
		} finally {
			panel.cleanup();
		}
	});
});
