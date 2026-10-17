/**
 * The gallery toolbar shows its download and select controls only while
 * something is ticked (docs/redesign/FRONT-SIMPLIFY.md); with nothing ticked it
 * is just the three-step strip.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, tick, unmount } from 'svelte';
import GalleryToolbar from './GalleryToolbar.svelte';

const cleanup: (() => void)[] = [];

afterEach(() => {
	for (const dispose of cleanup.splice(0)) dispose();
	vi.unstubAllGlobals();
});

async function render(selectedCount: number, allSelected = false) {
	// The toolbar watches a sentinel to know when it has stuck; jsdom has no
	// IntersectionObserver, and the test does not scroll.
	vi.stubGlobal(
		'IntersectionObserver',
		class {
			observe() {}
			disconnect() {}
		}
	);
	const target = document.createElement('div');
	document.body.appendChild(target);
	const handlers = { onPrint: vi.fn(), onSelectAll: vi.fn(), onSelectNone: vi.fn() };
	const component = mount(GalleryToolbar, {
		target,
		props: {
			lang: 'da',
			selectedCount,
			generating: false,
			allSelected,
			pdfLayout: 'medium',
			...handlers
		}
	});
	cleanup.push(() => {
		unmount(component);
		target.remove();
	});
	flushSync();
	await tick();
	const button = (text: string) =>
		[...target.querySelectorAll<HTMLButtonElement>('button')].find((b) =>
			b.textContent?.trim().startsWith(text)
		);
	return {
		target,
		handlers,
		toolbar: () => target.querySelector<HTMLElement>('.toolbar')!,
		download: () => button('Hent skabeloner'),
		selectAll: () => button('Vælg alle'),
		selectNone: () => button('Fravælg alle'),
		gear: () => target.querySelector<HTMLButtonElement>('[aria-label="PDF-indstillinger"]')
	};
}

describe('GalleryToolbar', () => {
	it('shows only the steps while nothing is ticked', async () => {
		const ui = await render(0);
		expect(ui.download()).toBeUndefined();
		expect(ui.gear()).toBeNull();
		expect(ui.selectAll()).toBeUndefined();
		expect(ui.selectNone()).toBeUndefined();
		expect(ui.target.querySelectorAll('button')).toHaveLength(0);
		// The steps are still there, and the bar knows it is idle (it collapses on phones).
		expect(ui.target.querySelectorAll('a').length).toBe(3);
		expect(ui.toolbar().classList.contains('idle')).toBe(true);
	});

	it('shows download, select all and select none once hearts are ticked', async () => {
		const ui = await render(2);
		expect(ui.toolbar().classList.contains('idle')).toBe(false);
		expect(ui.download()?.textContent).toMatch(/Hent skabeloner\s*2/);
		expect(ui.download()?.hasAttribute('aria-disabled')).toBe(false);
		expect(ui.gear()).not.toBeNull();
		expect(ui.selectAll()).toBeDefined();
		expect(ui.selectNone()).toBeDefined();

		ui.download()!.click();
		ui.selectAll()!.click();
		ui.selectNone()!.click();
		expect(ui.handlers.onPrint).toHaveBeenCalledTimes(1);
		expect(ui.handlers.onSelectAll).toHaveBeenCalledTimes(1);
		expect(ui.handlers.onSelectNone).toHaveBeenCalledTimes(1);
	});

	it('hides "Vælg alle" when every heart is ticked', async () => {
		const ui = await render(2, true);
		expect(ui.selectAll()).toBeUndefined();
		expect(ui.download()).toBeDefined();
		expect(ui.selectNone()).toBeDefined();
	});
});
