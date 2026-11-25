/**
 * "Hent skabelon" and "Tegn af" open things the page's script draws, so the
 * prerendered HTML has them disabled with a reason (pages-edges QA 7: without
 * JavaScript they were enabled and did nothing); the browser turns them on.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import HeartActions from './HeartActions.svelte';

const props = {
	lang: 'da' as const,
	hasDesign: true,
	editHref: '/editor/?from=jul',
	shareStatus: 'idle' as const,
	onDownload: () => {},
	onEdit: () => {},
	onShare: () => {},
	onSaveShared: () => {},
	onTrace: () => {}
};

let component: ReturnType<typeof mount> | null = null;
afterEach(() => {
	if (component) unmount(component);
	component = null;
	document.body.innerHTML = '';
});

describe('HeartActions', () => {
	// The first render, before any effect has run, is the one the server
	// prerenders and hydration repeats (mount() leaves onMount for the flush).
	it('renders the two script buttons disabled, with a title, until mounted', () => {
		const target = document.createElement('div');
		document.body.append(target);
		component = mount(HeartActions, { target, props });
		const buttons = [...target.querySelectorAll('button')].slice(0, 2);
		// The first button carries its wide label and its phone label; CSS shows one of them.
		expect(buttons.map((b) => b.textContent?.replace(/\s+/g, ' ').trim())).toEqual(['Hent skabelon Hent PDF', 'Tegn af Tegn skabelon']);
		for (const button of buttons) {
			expect(button.disabled).toBe(true);
			expect(button.title).toBe('Kræver JavaScript');
		}
	});

	it('turns them on once mounted', () => {
		const target = document.createElement('div');
		document.body.append(target);
		component = mount(HeartActions, { target, props });
		flushSync();
		const buttons = [...target.querySelectorAll('button')].slice(0, 2);
		for (const button of buttons) {
			expect(button.disabled).toBe(false);
			expect(button.hasAttribute('title')).toBe(false);
		}
	});

	// A gallery heart: the template is also a file (src/routes/skabelon), and the button is a link to it.
	it('links "Hent skabelon" to the PDF file, and opens the dialog instead once mounted', () => {
		const target = document.createElement('div');
		document.body.append(target);
		const onDownload = vi.fn();
		component = mount(HeartActions, { target, props: { ...props, pdfHref: '/skabelon/stjerne.pdf', onDownload } });
		const link = target.querySelector<HTMLAnchorElement>('a.get')!;
		expect(link.getAttribute('href')).toBe('/skabelon/stjerne.pdf');
		expect(link.textContent?.replace(/\s+/g, ' ').trim()).toBe('Hent skabelon Hent PDF');
		expect(target.querySelector('button.get')).toBeNull();

		// Before the script runs the link is followed.
		const before = new MouseEvent('click', { bubbles: true, cancelable: true });
		link.addEventListener('click', (event) => event.preventDefault(), { once: true });
		link.dispatchEvent(before);
		expect(onDownload).not.toHaveBeenCalled();

		flushSync();
		const after = new MouseEvent('click', { bubbles: true, cancelable: true });
		link.dispatchEvent(after);
		expect(after.defaultPrevented).toBe(true);
		expect(onDownload).toHaveBeenCalledTimes(1);
	});
});
