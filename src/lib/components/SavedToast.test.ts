import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';

// The layout's navigations, called by hand: no router runs in a unit test.
const nav = vi.hoisted(() => ({ arrived: [] as Array<() => void> }));
vi.mock('$app/navigation', () => ({ afterNavigate: (callback: () => void) => nav.arrived.push(callback) }));

const { default: SavedToast } = await import('./SavedToast.svelte');
const { noteSaved } = await import('$lib/editor/savedNotice');

const arrive = () => {
	for (const callback of nav.arrived) callback();
	flushSync();
};

afterEach(() => {
	nav.arrived.length = 0;
	vi.useRealTimers();
});

describe('SavedToast', () => {
	it('says once, on the page "Gem" goes to, that the heart was saved, for a few seconds', () => {
		vi.useFakeTimers();
		const target = document.createElement('div');
		document.body.appendChild(target);
		const toast = mount(SavedToast, { target, props: { lang: 'da' } });
		flushSync();
		const text = () => target.querySelector('[role="status"]')?.textContent?.trim();
		// a page reached with nothing saved says nothing
		arrive();
		expect(text()).toBe('');
		noteSaved('Dag og nat');
		arrive();
		expect(text()).toBe('“Dag og nat” er gemt i Mine hjerter');
		// gone after a few seconds, and not told again on the next page
		vi.advanceTimersByTime(5000);
		flushSync();
		expect(text()).toBe('');
		arrive();
		expect(text()).toBe('');
		unmount(toast);
		target.remove();
	});
});
