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

function render(
	path: string,
	lang: 'da' | 'en',
	active?: 'templates' | 'howto' | 'about',
	variant: 'site' | 'editor' = 'site'
) {
	url.current = new URL(`http://localhost${path}`);
	const target = document.createElement('div');
	document.body.appendChild(target);
	const component = mount(PageHeader, { target, props: { lang, active, variant } });
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

	it('links the design page, current on it', () => {
		const da = render('/design/', 'da', 'design').links('Design');
		expect(da).toHaveLength(2);
		for (const a of da) {
			expect(a.getAttribute('href')).toBe('/design/');
			expect(a.getAttribute('aria-current')).toBe('page');
		}
		const en = render('/en/about/', 'en', 'about').links('Design');
		expect(en[0]!.getAttribute('href')).toBe('/en/design/');
		expect(en[0]!.hasAttribute('aria-current')).toBe(false);
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

	it('carries the paper colours in the bar and as a row in the menu: three named buttons each', () => {
		const { target } = render('/', 'da', 'templates');
		const groups = [...target.querySelectorAll('[role="group"]')];
		expect(groups.map((g) => g.getAttribute('aria-label'))).toEqual(['Farver', 'Farver']);
		expect(target.querySelector('.nav-actions .colors-bar')).not.toBeNull();
		expect(target.querySelector('.nav-menu .colors-menu')).not.toBeNull();
		for (const group of groups) {
			const names = [...group.querySelectorAll('button')].map((b) => b.getAttribute('aria-label'));
			expect(names).toEqual(['Rød og hvid', 'Farverig', 'Egne farver']);
		}
		const english = render('/en/', 'en', 'templates').target.querySelector('[role="group"]')!;
		expect([...english.querySelectorAll('button')].map((b) => b.getAttribute('aria-label'))).toEqual([
			'Red and white',
			'Colourful',
			'Your own colours'
		]);
	});

	it("takes a plain click on the other mode to the page's own way there, and leaves other clicks to the link", () => {
		url.current = new URL('http://localhost/editor/');
		const target = document.createElement('div');
		document.body.appendChild(target);
		const switchTo = vi.fn();
		const component = mount(PageHeader, { target, props: { lang: 'da', variant: 'editor', mode: { current: 'draw', switchTo } } });
		// Whether the header took the click, read after it, and no navigation in jsdom either way.
		let taken = false;
		const settle = (e: Event) => {
			taken = e.defaultPrevented;
			e.preventDefault();
		};
		document.addEventListener('click', settle);
		cleanup.push(() => {
			document.removeEventListener('click', settle);
			unmount(component);
			target.remove();
		});
		flushSync();
		const [draw, paint] = target.querySelectorAll<HTMLAnchorElement>('.mode-link');
		const click = (link: HTMLAnchorElement, init: MouseEventInit = {}) => {
			link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ...init }));
			return taken;
		};
		expect(paint.getAttribute('href')).toBe('/editor/mal/');
		expect(click(paint)).toBe(true);
		expect(switchTo).toHaveBeenCalledTimes(1);
		expect(click(paint, { metaKey: true })).toBe(false);
		expect(click(paint, { button: 1 })).toBe(false);
		expect(click(draw)).toBe(false);
		expect(switchTo).toHaveBeenCalledTimes(1);
	});

	it('keeps them in the bar of the design tools, which have no colour controls of their own', () => {
		const { target } = render('/editor/', 'da', undefined, 'editor');
		const groups = [...target.querySelectorAll('[role="group"]')];
		expect(groups).toHaveLength(1);
		expect(target.querySelector('.nav-actions .colors-bar')).not.toBeNull();
		expect(target.querySelector('.colors-menu')).toBeNull();
		expect(target.querySelector('input[type="color"]')).toBeNull();
	});
});
