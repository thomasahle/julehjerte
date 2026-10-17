/**
 * A hero heart scrolls to its card and puts the card's anchor in the URL
 * through SvelteKit's router, so the page store (and with it the language toggle) sees
 * the hash. Plain history.replaceState left the toggle without it.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { goto } from '$app/navigation';
import HeroHearts from './HeroHearts.svelte';
import { HERO_SLOTS_MOBILE } from './heroSlots';

vi.mock('$app/navigation', () => ({ goto: vi.fn(async () => {}) }));

const cleanup: (() => void)[] = [];

afterEach(() => {
	for (const dispose of cleanup.splice(0)) dispose();
	vi.unstubAllGlobals();
	vi.mocked(goto).mockClear();
});

describe('HeroHearts', () => {
	it('puts the card anchor in the URL through SvelteKit on a click', async () => {
		vi.stubGlobal('matchMedia', () => ({ matches: true }));
		const card = document.createElement('div');
		card.id = 'heart-squares';
		card.scrollIntoView = vi.fn();
		document.body.appendChild(card);
		const target = document.createElement('div');
		document.body.appendChild(target);
		const component = mount(HeroHearts, {
			target,
			props: {
				lang: 'da',
				slots: HERO_SLOTS_MOBILE.slice(0, 1),
				hearts: [{ id: 'squares', name: 'Firkanter', markup: '<svg></svg>' }],
				idPrefix: 'hero-t',
				revealed: true
			}
		});
		cleanup.push(() => {
			unmount(component);
			target.remove();
			card.remove();
		});
		flushSync();

		const link = target.querySelector<HTMLAnchorElement>('a.slot-link')!;
		expect(link.getAttribute('href')).toBe('#heart-squares');
		const click = new MouseEvent('click', { bubbles: true, cancelable: true });
		link.dispatchEvent(click);

		expect(click.defaultPrevented).toBe(true);
		expect(goto).toHaveBeenCalledWith('/#heart-squares', { replaceState: true, noScroll: true, keepFocus: true });
		// The scroll starts once the navigation is done, which would stop it.
		expect(card.scrollIntoView).not.toHaveBeenCalled();
		await Promise.resolve();
		await Promise.resolve();
		expect(card.scrollIntoView).toHaveBeenCalledWith({ block: 'center', behavior: 'auto' });
	});
});
