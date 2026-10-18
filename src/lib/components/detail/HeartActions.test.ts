/**
 * "Hent skabelon" and "Tegn af" open things the page's script draws, so the
 * prerendered HTML has them disabled with a reason (pages-edges QA 7: without
 * JavaScript they were enabled and did nothing); the browser turns them on.
 */
import { afterEach, describe, expect, it } from 'vitest';
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
		expect(buttons.map((b) => b.textContent?.trim())).toEqual(['Hent skabelon', 'Tegn af']);
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
});
