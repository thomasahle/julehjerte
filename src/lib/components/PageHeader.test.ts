/**
 * The nav's "Skabeloner" goes to the gallery, not the top of the front page,
 * and is still the current page on the front page itself.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';

const { url } = vi.hoisted(() => ({ url: { current: new URL('http://localhost/') } }));
vi.mock('$app/stores', async () => {
	const { readable } = await import('svelte/store');
	return {
		page: {
			subscribe: (run: (value: unknown) => void) =>
				readable({ url: url.current, params: {}, route: { id: null }, status: 200, error: null, data: {}, state: {}, form: null }).subscribe(run)
		}
	};
});

import PageHeader from './PageHeader.svelte';

const cleanup: (() => void)[] = [];
afterEach(() => {
	for (const dispose of cleanup.splice(0)) dispose();
});

function render(path: string, lang: 'da' | 'en', active?: 'templates' | 'howto' | 'about') {
	url.current = new URL(`http://localhost${path}`);
	const target = document.createElement('div');
	document.body.appendChild(target);
	const component = mount(PageHeader, { target, props: { lang, active } });
	cleanup.push(() => {
		unmount(component);
		target.remove();
	});
	flushSync();
	const links = (label: string) => [...target.querySelectorAll<HTMLAnchorElement>('a')].filter((a) => a.textContent?.trim() === label);
	return { target, links };
}

describe('PageHeader', () => {
	it('points Skabeloner at the gallery, in the bar and in the burger menu', () => {
		const { links } = render('/om/', 'da', 'about');
		const templates = links('Skabeloner');
		expect(templates).toHaveLength(2);
		for (const a of templates) {
			expect(a.getAttribute('href')).toBe('/#skabeloner');
			expect(a.hasAttribute('aria-current')).toBe(false);
		}
		// The logo still goes to the top.
		expect(render('/om/', 'da').target.querySelector('.nav-logo')!.getAttribute('href')).toBe('/');
	});

	it('goes to the English gallery from English pages', () => {
		const { links } = render('/en/about/', 'en', 'about');
		expect(links('Templates')[0]!.getAttribute('href')).toBe('/en/#skabeloner');
	});

	it("keeps aria-current=page on the front page, and true on a heart's page", () => {
		for (const a of render('/', 'da', 'templates').links('Skabeloner')) {
			expect(a.getAttribute('aria-current')).toBe('page');
		}
		for (const a of render('/hjerte/jul/', 'da', 'templates').links('Skabeloner')) {
			expect(a.getAttribute('aria-current')).toBe('true');
		}
		expect(render('/en/', 'en', 'templates').links('Templates')[0]!.getAttribute('aria-current')).toBe('page');
	});
});
