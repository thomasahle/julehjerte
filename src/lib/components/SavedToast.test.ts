import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import SavedToast from './SavedToast.svelte';
import { noteSaved, savedNotice } from '$lib/editor/savedNotice.svelte';

afterEach(() => {
	savedNotice.heart = null;
	vi.useRealTimers();
});

describe('SavedToast', () => {
	it('says at once that the heart was saved, with a way to its card, for a few seconds', () => {
		vi.useFakeTimers();
		const target = document.createElement('div');
		document.body.appendChild(target);
		const toast = mount(SavedToast, { target, props: { lang: 'da' } });
		flushSync();
		const text = () => target.querySelector('[role="status"]')?.textContent?.replace(/\s+/g, ' ').trim();
		// nothing saved, nothing said
		expect(text()).toBe('');
		noteSaved('Dag og nat', '/#heart-user-1');
		flushSync();
		expect(text()).toBe('“Dag og nat” er gemt i Mine hjerter Se dem');
		expect(target.querySelector('[role="status"] a')?.getAttribute('href')).toBe('/#heart-user-1');
		// gone after a few seconds
		vi.advanceTimersByTime(6500);
		flushSync();
		expect(text()).toBe('');
		unmount(toast);
		target.remove();
	});
});
