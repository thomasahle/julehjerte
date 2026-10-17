/**
 * The gallery bar (docs/redesign/GALLERY-BAR.md): a wordmark that only shows
 * once the bar has stuck, one chip per category with scroll-spy, and the
 * download and select controls only while something is ticked
 * (docs/redesign/FRONT-SIMPLIFY.md).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, tick, unmount } from 'svelte';
import GalleryBar from './GalleryBar.svelte';

const CATEGORIES = [
	{ id: 'klassiske', count: 12 },
	{ id: 'stjerner', count: 10 },
	{ id: 'moenstre', count: 26 },
	{ id: 'figurer', count: 4 },
	{ id: 'hjerter', count: 3 }
];

const cleanup: (() => void)[] = [];

afterEach(() => {
	for (const dispose of cleanup.splice(0)) dispose();
	vi.unstubAllGlobals();
});

/** Fakes an element's box: jsdom has no layout, so every rect is all zeros. */
function placeAt(el: Element, top: number, height = 40) {
	el.getBoundingClientRect = () =>
		({ top, bottom: top + height, left: 0, right: 0, width: 0, height, x: 0, y: top }) as DOMRect;
}

interface Options {
	selectedCount?: number;
	myHeartCount?: number;
}

async function render({ selectedCount = 0, myHeartCount = 0 }: Options = {}) {
	// The bar watches a sentinel to know when it has stuck; jsdom has no
	// IntersectionObserver, so the test keeps the callback and calls it itself.
	let reportSentinel: ((entries: Partial<IntersectionObserverEntry>[]) => void) | null = null;
	vi.stubGlobal(
		'IntersectionObserver',
		class {
			constructor(callback: (entries: Partial<IntersectionObserverEntry>[]) => void) {
				reportSentinel = callback;
			}
			observe() {}
			disconnect() {}
		}
	);
	// The bar's height binding measures through a ResizeObserver; jsdom has
	// none, and there is no layout to measure anyway.
	vi.stubGlobal(
		'ResizeObserver',
		class {
			observe() {}
			unobserve() {}
			disconnect() {}
		}
	);
	// Run the spy's frame on the next microtask rather than a real frame, so a
	// dispatched scroll is measured before the assertion. Not synchronously:
	// the bar stores the frame handle after requesting it, as with a real one.
	vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
		queueMicrotask(() => callback(0));
		return 1;
	});

	// The sections the chips point at, as the gallery would render them.
	const sections = [...CATEGORIES.map((c) => c.id), 'mine'].map((id) => {
		const section = document.createElement('section');
		section.id = id;
		placeAt(section, 10_000);
		document.body.appendChild(section);
		return section;
	});

	const target = document.createElement('div');
	document.body.appendChild(target);
	const handlers = { onDownload: vi.fn() };
	const component = mount(GalleryBar, {
		target,
		props: {
			lang: 'da',
			categories: CATEGORIES,
			myHeartCount,
			selectedCount,
			...handlers
		}
	});
	cleanup.push(() => {
		unmount(component);
		target.remove();
		for (const section of sections) section.remove();
	});
	flushSync();
	await tick();
	const button = (text: string) =>
		[...target.querySelectorAll<HTMLButtonElement>('button')].find((b) =>
			b.textContent?.trim().startsWith(text)
		);
	// Unstuck to begin with: the bar's top below the top of the screen.
	const bar = target.querySelector<HTMLElement>('.gallery-bar')!;
	placeAt(bar, 300, 50);
	window.dispatchEvent(new Event('scroll'));
	await Promise.resolve();
	flushSync();
	await tick();
	return {
		target,
		handlers,
		bar,
		wordmark: () => target.querySelector<HTMLAnchorElement>('a.wordmark')!,
		chips: () => [...target.querySelectorAll<HTMLAnchorElement>('nav a.chip')],
		current: () =>
			[...target.querySelectorAll<HTMLAnchorElement>('a.chip[aria-current="true"]')].map((a) =>
				a.getAttribute('href')
			),
		section: (id: string) => sections.find((s) => s.id === id)!,
		/**
		 * Puts the bar at its sticky top (or below it) and lets the sentinel
		 * report it, which asks the bar to measure itself.
		 */
		stick: async (stuck: boolean) => {
			placeAt(bar, stuck ? 0 : 300, 50);
			reportSentinel!([
				{ isIntersecting: !stuck, boundingClientRect: { top: stuck ? -1 : 300 } as DOMRect }
			]);
			await Promise.resolve();
			flushSync();
			await tick();
		},
		/** Moves the bar without telling the sentinel, as a jump scroll can. */
		moveBar: async (top: number) => {
			placeAt(bar, top, 50);
			window.dispatchEvent(new Event('scroll'));
			await Promise.resolve();
			flushSync();
			await tick();
		},
		scroll: async () => {
			window.dispatchEvent(new Event('scroll'));
			await Promise.resolve();
			flushSync();
			await tick();
		},
		download: () => button('Hent skabeloner')
	};
}

describe('GalleryBar', () => {
	it('shows one chip per category, in order, with its count', async () => {
		const ui = await render();
		const nav = ui.target.querySelector('nav')!;
		expect(nav.getAttribute('aria-label')).toBe('Kategorier');
		expect(ui.chips().map((a) => a.getAttribute('href'))).toEqual([
			'#klassiske',
			'#stjerner',
			'#moenstre',
			'#figurer',
			'#hjerter'
		]);
		expect(ui.chips().map((a) => a.textContent?.replace(/\s+/g, ' ').trim())).toEqual([
			'Klassiske 12',
			'Stjerner 10',
			'Mønstre 26',
			'Figurer 4',
			'Hjerter 3'
		]);
	});

	it('adds "Mine hjerter" only when the visitor has hearts of their own', async () => {
		const without = await render();
		expect(without.chips().some((a) => a.getAttribute('href') === '#mine')).toBe(false);

		const withHearts = await render({ myHeartCount: 2 });
		const last = withHearts.chips().at(-1)!;
		expect(last.getAttribute('href')).toBe('#mine');
		expect(last.textContent?.replace(/\s+/g, ' ').trim()).toBe('Mine hjerter 2');
	});

	it('leaves out a category without hearts', async () => {
		const ui = await render();
		expect(ui.chips()).toHaveLength(5);
		// Re-render with an empty category through a fresh mount.
		const target = document.createElement('div');
		document.body.appendChild(target);
		const component = mount(GalleryBar, {
			target,
			props: {
				lang: 'en',
				categories: [...CATEGORIES.slice(0, 4), { id: 'hjerter', count: 0 }],
				myHeartCount: 0,
				selectedCount: 0,
				onDownload: vi.fn()
			}
		});
		cleanup.push(() => {
			unmount(component);
			target.remove();
		});
		flushSync();
		expect([...target.querySelectorAll('a.chip')].map((a) => a.getAttribute('href'))).toEqual([
			'#klassiske',
			'#stjerner',
			'#moenstre',
			'#figurer'
		]);
		expect(target.querySelector('nav')?.getAttribute('aria-label')).toBe('Categories');
	});

	it('keeps the wordmark hidden until the bar has stuck', async () => {
		const ui = await render();
		const wordmark = ui.wordmark();
		expect(wordmark.textContent?.trim()).toBe('Juleflet.dk');
		expect(wordmark.getAttribute('href')).toBe('/');
		expect(wordmark.getAttribute('aria-hidden')).toBe('true');
		expect(wordmark.getAttribute('tabindex')).toBe('-1');
		expect(ui.bar.classList.contains('stuck')).toBe(false);

		await ui.stick(true);
		expect(ui.bar.classList.contains('stuck')).toBe(true);
		expect(wordmark.hasAttribute('aria-hidden')).toBe(false);
		expect(wordmark.hasAttribute('tabindex')).toBe(false);

		await ui.stick(false);
		expect(wordmark.getAttribute('aria-hidden')).toBe('true');
	});

	it('marks the chip of the section that has reached the bar as current', async () => {
		const ui = await render();
		await ui.stick(true);
		// The bar is 50px tall at the top; Mønstre's heading has just reached it.
		placeAt(ui.section('klassiske'), -2000);
		placeAt(ui.section('stjerner'), -900);
		placeAt(ui.section('moenstre'), 58);
		placeAt(ui.section('figurer'), 1500);
		placeAt(ui.section('hjerter'), 2500);
		await ui.scroll();
		expect(ui.current()).toEqual(['#moenstre']);

		placeAt(ui.section('moenstre'), 200);
		await ui.scroll();
		expect(ui.current()).toEqual(['#stjerner']);
	});

	it('marks the first category once the bar has stuck, even before its row reaches the line', async () => {
		// A chip jump to Klassiske lands just past the point where the bar
		// sticks, where the row's lowest strand may still hang below the line.
		const ui = await render();
		await ui.stick(true);
		placeAt(ui.section('klassiske'), 70);
		await ui.scroll();
		expect(ui.current()).toEqual(['#klassiske']);
	});

	it('derives stuck from where the bar is, also after a jump scroll the sentinel missed', async () => {
		const ui = await render();
		// scrollTo(0, 3000) from the top: the bar is at its sticky top.
		await ui.moveBar(0);
		expect(ui.bar.classList.contains('stuck')).toBe(true);
		expect(ui.wordmark().hasAttribute('aria-hidden')).toBe(false);
		// And straight back to the top of the page.
		await ui.moveBar(600);
		expect(ui.bar.classList.contains('stuck')).toBe(false);
		expect(ui.wordmark().getAttribute('aria-hidden')).toBe('true');
	});

	it('marks nothing while the bar has not reached the top', async () => {
		const ui = await render();
		placeAt(ui.bar, 300, 50);
		placeAt(ui.section('klassiske'), 358);
		await ui.scroll();
		expect(ui.current()).toEqual([]);
	});

	it('renders no download button while nothing is ticked', async () => {
		const ui = await render();
		expect(ui.download()).toBeUndefined();
		expect(ui.target.querySelectorAll('button')).toHaveLength(0);
	});

	it('shows one "Hent skabeloner" button with the count once hearts are ticked, first in the chip row', async () => {
		const ui = await render({ selectedCount: 2 });
		expect(ui.download()?.textContent).toMatch(/Hent skabeloner\s*2/);
		// One button: no PDF-layout menu, no select all / none (SELECTION.md).
		expect(ui.target.querySelectorAll('button')).toHaveLength(1);
		// The chip row's first item, right before "Klassiske".
		expect(ui.download()!.parentElement?.tagName).toBe('NAV');
		expect(ui.download()!.nextElementSibling?.getAttribute('href')).toBe('#klassiske');

		ui.download()!.click();
		expect(ui.handlers.onDownload).toHaveBeenCalledTimes(1);
	});

	it('puts the button before the chip row, outside it, below 900px', async () => {
		vi.stubGlobal('matchMedia', (query: string) => ({
			matches: query === '(max-width: 899px)',
			media: query,
			addEventListener() {},
			removeEventListener() {}
		}));
		const ui = await render({ selectedCount: 1 });
		const get = ui.download()!;
		// Not in the scrolling row, so ticking neither widens the row nor
		// moves its scrollLeft, and the button never covers a chip.
		expect(get.closest('nav')).toBeNull();
		expect(get.nextElementSibling?.tagName).toBe('NAV');
		expect(ui.chips()[0].getAttribute('href')).toBe('#klassiske');
		expect(ui.target.querySelectorAll('button')).toHaveLength(1);
	});

	it('reports a height that does not follow the room on top (L)', async () => {
		// The first row's top is the bar's top + 6px (CategorySection: margin
		// 6 − height − L), so `height` has to be the box less the padding L
		// adds on top, whatever L is: ticking a heart can add a button with a
		// larger lift than the chips', and the row must not drop with it.
		let observed: (() => void) | null = null;
		vi.stubGlobal(
			'ResizeObserver',
			class {
				constructor(callback: () => void) {
					observed = callback;
				}
				observe() {}
				unobserve() {}
				disconnect() {}
			}
		);
		vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
			queueMicrotask(() => callback(0));
			return 1;
		});
		vi.stubGlobal(
			'IntersectionObserver',
			class {
				observe() {}
				disconnect() {}
			}
		);
		const target = document.createElement('div');
		document.body.appendChild(target);
		let height = 0;
		const component = mount(GalleryBar, {
			target,
			props: {
				lang: 'da',
				categories: CATEGORIES,
				myHeartCount: 0,
				selectedCount: 1,
				// The lifts the bar was handed; the box below is laid out with
				// a different L, as for a frame while the two catch up.
				lifts: [10, 67.8],
				get height() {
					return height;
				},
				set height(value: number) {
					height = value;
				},
				onDownload: () => {}
			}
		});
		cleanup.push(() => {
			unmount(component);
			target.remove();
		});
		flushSync();
		const bar = target.querySelector<HTMLElement>('.gallery-bar')!;
		const layOut = async (room: number) => {
			// What the stylesheet does on the desktop layout: 10px + L on top.
			bar.style.paddingTop = `${10 + room}px`;
			bar.style.paddingBottom = '10px';
			placeAt(bar, 300, 49.6 + room);
			observed?.();
			await Promise.resolve();
			flushSync();
		};
		await layOut(67.8);
		expect(height).toBeCloseTo(49.6, 5);

		// The button's larger lift makes L 73.6: the box grows by 5.8, the
		// height an anchor has to clear does not. Read as the box less the
		// lifts' L it came out 55.4, and the first row dropped by 5.8.
		await layOut(73.6);
		expect(height).toBeCloseTo(49.6, 5);
	});
});
