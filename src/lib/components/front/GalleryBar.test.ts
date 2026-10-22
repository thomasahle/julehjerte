/**
 * The gallery bar (docs/redesign/GALLERY-BAR.md): a wordmark that only shows
 * once the bar has stuck, one chip per category with scroll-spy, and the
 * download and select controls only while something is ticked
 * (docs/redesign/FRONT-SIMPLIFY.md).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, tick, unmount } from 'svelte';
import GalleryBar from './GalleryBar.svelte';
import type { DifficultyLevel } from '$lib/utils/difficulty';

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
	categories?: { id: string; count: number; total?: number }[];
	levels?: Set<DifficultyLevel>;
	availableLevels?: DifficultyLevel[];
	lang?: 'da' | 'en';
}

async function render({
	selectedCount = 0,
	myHeartCount = 0,
	categories = CATEGORIES,
	levels = new Set(),
	availableLevels = [],
	lang = 'da'
}: Options = {}) {
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
	const handlers = { onDownload: vi.fn(), onToggleLevel: vi.fn(), onClearLevels: vi.fn() };
	const component = mount(GalleryBar, {
		target,
		props: {
			lang,
			categories,
			myHeartCount,
			selectedCount,
			levels,
			availableLevels,
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
		download: () => button('Hent skabeloner'),
		/** The difficulty filter's chip. */
		levelChip: () => target.querySelector<HTMLButtonElement>('button.level-chip'),
		/** Opens the filter's menu, as Enter on its chip does, and gives its items (on the page's top layer). */
		openLevels: async () => {
			const chip = target.querySelector<HTMLButtonElement>('button.level-chip')!;
			chip.focus();
			chip.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
			flushSync();
			await tick();
			await new Promise((resolve) => setTimeout(resolve, 0));
			flushSync();
			return [...document.querySelectorAll<HTMLElement>('.level-menu [role^="menuitem"]')];
		}
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
		// Every observer the bar makes (its height, the chip row's fades).
		const observed: (() => void)[] = [];
		vi.stubGlobal(
			'ResizeObserver',
			class {
				constructor(callback: () => void) {
					observed.push(callback);
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
			for (const callback of observed) callback();
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

	describe('the difficulty filter', () => {
		const ALL: DifficultyLevel[] = ['easy', 'medium', 'hard', 'expert'];

		it('offers one chip before the category chips, which opens a menu of the levels', async () => {
			const ui = await render({ availableLevels: ALL });
			const chip = ui.levelChip()!;
			expect(chip.textContent?.trim()).toBe('Sværhedsgrad');
			expect(chip.getAttribute('aria-haspopup')).toBe('menu');
			expect(chip.type).toBe('button');
			// In the chip row, before the first category chip, an item the gallery lifts onto the hill.
			const nav = ui.target.querySelector('nav')!;
			expect(chip.parentElement).toBe(nav);
			expect(chip.nextElementSibling?.getAttribute('href')).toBe('#klassiske');
			expect(nav.querySelectorAll('[data-hill-chip]')).toHaveLength(1 + 5);
			const items = await ui.openLevels();
			expect(items.map((item) => item.textContent?.trim())).toEqual(['Let', 'Mellem', 'Svær', 'Ekspert']);
			expect(items.every((item) => item.getAttribute('aria-checked') === 'false')).toBe(true);
			// The dots are decoration: the word names the level.
			const dots = items[0].querySelector('.dots')!;
			expect(dots.getAttribute('aria-hidden')).toBe('true');
			expect(items[3].querySelectorAll('.dot.on')).toHaveLength(4);
		});

		it('offers only the levels the gallery has', async () => {
			const ui = await render({ availableLevels: ['easy', 'hard'] });
			expect((await ui.openLevels()).map((item) => item.textContent?.trim())).toEqual(['Let', 'Svær']);
			const none = await render();
			expect(none.levelChip()).toBeNull();
		});

		it('ticks the chosen levels, reports a tick, and says how many are chosen', async () => {
			const ui = await render({ availableLevels: ALL, levels: new Set(['easy', 'expert']) });
			const chip = ui.levelChip()!;
			expect(chip.classList.contains('chosen')).toBe(true);
			expect(chip.querySelector('.chip-count')?.textContent).toBe('2');
			const items = await ui.openLevels();
			expect(items.slice(0, 4).map((item) => item.getAttribute('aria-checked'))).toEqual(['true', 'false', 'false', 'true']);
			items[1].click();
			expect(ui.handlers.onToggleLevel).toHaveBeenCalledWith('medium');
			// And a way to show them all again.
			expect(items[4].textContent?.trim()).toBe('Alle sværhedsgrader');
			items[4].click();
			expect(ui.handlers.onClearLevels).toHaveBeenCalled();
		});

		it('counts the hearts on show and dims a category the filter empties', async () => {
			const ui = await render({
				availableLevels: ALL,
				levels: new Set(['easy']),
				categories: [
					{ id: 'klassiske', count: 1, total: 4 },
					{ id: 'stjerner', count: 3, total: 12 },
					{ id: 'moenstre', count: 0, total: 26 },
					{ id: 'figurer', count: 0, total: 8 },
					{ id: 'hjerter', count: 1, total: 6 }
				],
				myHeartCount: 2
			});
			expect(ui.chips().map((a) => a.textContent?.replace(/\s+/g, ' ').trim())).toEqual([
				'Klassiske 1',
				'Stjerner 3',
				'Mønstre 0',
				'Figurer 0',
				'Hjerter 1',
				// "Mine hjerter" is not filtered.
				'Mine hjerter 2'
			]);
			const moenstre = ui.chips()[2];
			expect(moenstre.classList.contains('empty')).toBe(true);
			expect(moenstre.getAttribute('aria-disabled')).toBe('true');
			expect(moenstre.getAttribute('tabindex')).toBe('-1');
			expect(ui.chips()[1].hasAttribute('aria-disabled')).toBe(false);
			// It leads nowhere: its section is hidden.
			const click = new MouseEvent('click', { bubbles: true, cancelable: true });
			moenstre.dispatchEvent(click);
			expect(click.defaultPrevented).toBe(true);
		});

		it('never marks a dimmed chip current, and spies only on the sections on show', async () => {
			const ui = await render({
				availableLevels: ALL,
				levels: new Set(['easy']),
				categories: [
					{ id: 'klassiske', count: 1, total: 4 },
					{ id: 'stjerner', count: 3, total: 12 },
					{ id: 'moenstre', count: 0, total: 26 },
					{ id: 'figurer', count: 0, total: 8 },
					{ id: 'hjerter', count: 1, total: 6 }
				]
			});
			await ui.stick(true);
			placeAt(ui.section('klassiske'), -900);
			placeAt(ui.section('stjerner'), -300);
			// Hidden sections have an all-zero box, which reads as reached.
			placeAt(ui.section('moenstre'), 0);
			placeAt(ui.section('figurer'), 0);
			placeAt(ui.section('hjerter'), 1500);
			await ui.scroll();
			expect(ui.current()).toEqual(['#stjerner']);

			placeAt(ui.section('hjerter'), 40);
			await ui.scroll();
			expect(ui.current()).toEqual(['#hjerter']);
		});

		it('names the chip and the levels in English on /en/', async () => {
			const ui = await render({ availableLevels: ALL, lang: 'en' });
			expect(ui.levelChip()?.textContent?.trim()).toBe('Difficulty');
			expect((await ui.openLevels()).map((item) => item.textContent?.trim())).toEqual(['Easy', 'Medium', 'Hard', 'Expert']);
		});
	});

	describe('overflow fade', () => {
		/** Gives the chip row a scroll box (jsdom has no layout) and scrolls it. */
		async function scrollRow(row: HTMLElement, { width, view, left }: { width: number; view: number; left: number }) {
			Object.defineProperty(row, 'scrollWidth', { configurable: true, value: width });
			Object.defineProperty(row, 'clientWidth', { configurable: true, value: view });
			row.scrollLeft = left;
			row.dispatchEvent(new Event('scroll'));
			await Promise.resolve();
			flushSync();
			await tick();
		}

		it('fades the edge with more chips beyond it, and neither while the row fits', async () => {
			const ui = await render();
			const row = ui.target.querySelector<HTMLElement>('nav.chips')!;
			const fades = () => ['fade-start', 'fade-end'].filter((c) => row.classList.contains(c));
			await scrollRow(row, { width: 400, view: 400, left: 0 });
			expect(fades()).toEqual([]);
			await scrollRow(row, { width: 600, view: 400, left: 0 });
			expect(fades()).toEqual(['fade-end']);
			await scrollRow(row, { width: 600, view: 400, left: 100 });
			expect(fades()).toEqual(['fade-start', 'fade-end']);
			await scrollRow(row, { width: 600, view: 400, left: 200 });
			expect(fades()).toEqual(['fade-start']);
		});
	});
});
