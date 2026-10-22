import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	STRAND_LAYOUT,
	clearLevelBootstrap,
	clearStrandBootstrap,
	strandBootstrapScript,
	strandBootstrapSource,
	type StrandChips
} from './strandBootstrap';
import { cardDrop, hillTopPage, type LandRect } from './hillLine';
import { LANDSCAPE_HEIGHT, LANDSCAPE_MAX_WIDTH, LANDSCAPE_WIDTH } from '$lib/landscape';
import { CATEGORIES } from '$lib/data/categories';
import heartCards from '$lib/data/heart-cards.json';
import { LEVELS, LEVEL_PARAM, LEVEL_SLUGS, LEVEL_STORAGE_KEY } from './levelFilter';

const CHIPS: StrandChips = {
	categories: [
		{ title: 'Klassiske', count: 4 },
		{ title: 'Stjerner', count: 12 },
		{ title: 'Mønstre', count: 26 },
		{ title: 'Figurer', count: 7 },
		{ title: 'Hjerter', count: 6 }
	],
	mine: 'Mine hjerter',
	download: 'Hent skabeloner',
	storageKey: 'julehjerte-collection'
};

/** The foot of the hero's scene at 1440 and 1024 (header 62 + hero 660 / 600). */
const SCENE_BOTTOM = 722;

/**
 * Text widths as the browser lays the chips out at 1440 ("Klassiske 4" is a
 * 98.67px chip): label and count per chip, in chip order. Anything else is
 * 7px a character.
 */
const TEXT_WIDTHS: Record<string, number> = {
	Klassiske: 59.4,
	Stjerner: 49.7,
	Mønstre: 51.4,
	Fliser: 33.9,
	Figurer: 44.0,
	Tekst: 33.0,
	Hjerter: 43.0,
	'4': 7.2,
	'12': 14.4,
	'26': 14.4,
	'5': 7.2,
	'14': 14.4,
	'28': 14.4,
	'10': 14.4,
	'11': 14.4,
	'7': 7.2,
	'6': 7.2,
	'8': 7.2,
	'0': 7.2,
	'1': 7.2,
	'3': 7.2,
	// The difficulty toggles' words, at 600.
	Let: 20.2,
	Mellem: 45.1,
	Svær: 32.2,
	Ekspert: 48.2
};

const LABELS: Record<string, string> = {
	easy: 'Let',
	medium: 'Mellem',
	hard: 'Svær',
	expert: 'Ekspert'
};

/**
 * The row's width with the toggles: four toggles (dots and their gap only
 * from 1200px up), the group's extra gap, and the seven category chips with
 * these counts, 8px apart.
 */
function rowTotal(counts: string[], dots: boolean): number {
	const toggles = ['Let', 'Mellem', 'Svær', 'Ekspert'].map((label) =>
		Math.round(26 + (dots ? STRAND_LAYOUT.dotsWidth + 6 : 0) + TEXT_WIDTHS[label])
	);
	const chips = ['Klassiske', 'Stjerner', 'Mønstre', 'Fliser', 'Figurer', 'Tekst', 'Hjerter'].map((title, i) =>
		Math.round(32 + TEXT_WIDTHS[title] + TEXT_WIDTHS[counts[i]])
	);
	const widths = [...toggles, ...chips];
	return widths.reduce((sum, w) => sum + w, 0) + 8 * (widths.length - 1) + STRAND_LAYOUT.groupGap;
}

const TITLES: Record<string, string> = {
	klassiske: 'Klassiske',
	stjerner: 'Stjerner',
	moenstre: 'Mønstre',
	fliser: 'Fliser',
	figurer: 'Figurer',
	tekst: 'Tekst',
	hjerter: 'Hjerter'
};

/** The chips as the front page's load hands them over: the real categories, with the filter. */
const CARDS = heartCards as Record<string, { difficulty: string }>;
const FILTERED: StrandChips = {
	...CHIPS,
	categories: CATEGORIES.map((category) => ({
		id: category.id,
		title: TITLES[category.id],
		count: category.hearts.length,
		levels: category.hearts.map((id) => CARDS[id].difficulty),
		hearts: category.hearts
	})),
	filter: {
		levels: LEVELS.map((level) => ({ level, slug: LEVEL_SLUGS[level], label: LABELS[level] })),
		param: LEVEL_PARAM,
		storageKey: LEVEL_STORAGE_KEY
	}
};

let width = 1440;
let scrollbar = 0;

function stubPage() {
	document.body.innerHTML =
		'<section class="scene"><div data-scene-land><svg></svg></div></section>' +
		'<div class="gallery-wrap"></div>';
	const scene = document.querySelector<HTMLElement>('.scene')!;
	scene.getBoundingClientRect = () => ({ bottom: SCENE_BOTTOM }) as DOMRect;
	Object.defineProperty(window, 'innerWidth', { configurable: true, get: () => width });
	Object.defineProperty(document.documentElement, 'clientWidth', {
		configurable: true,
		get: () => width
	});
	window.matchMedia = ((query: string) => {
		const min = /^\(min-width: (\d+)px\)$/.exec(query);
		return { matches: min ? width >= Number(min[1]) : false };
	}) as unknown as typeof window.matchMedia;
	// A classic scrollbar `scrollbar` px wide, as the script's probe sees it.
	Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
		configurable: true,
		get(this: HTMLElement) {
			return this.style.overflow === 'scroll' ? 100 : 0;
		}
	});
	Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
		configurable: true,
		get(this: HTMLElement) {
			return this.style.overflow === 'scroll' ? 100 - scrollbar : 0;
		}
	});
	vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
		() =>
			({
				font: '',
				measureText: (text: string) => ({ width: TEXT_WIDTHS[text] ?? text.length * 7 })
			}) as unknown as CanvasRenderingContext2D
	);
}

function run(chips: StrandChips = CHIPS) {
	(0, eval)(strandBootstrapSource(chips));
}

const root = () => document.documentElement;
const prop = (name: string) => root().style.getPropertyValue(name);
const px = (name: string) => parseFloat(prop(name));

/** What Gallery.svelte's measure finds, worked out with $lib/front/hillLine. */
function expected(viewport: number, chipTotal: number) {
	const landW = Math.min(viewport, LANDSCAPE_MAX_WIDTH);
	const land: LandRect = {
		left: 0,
		top: SCENE_BOTTOM + 1 - (landW * LANDSCAPE_HEIGHT) / LANDSCAPE_WIDTH,
		width: landW
	};
	const column = Math.min(viewport, STRAND_LAYOUT.columnMax);
	const left = (viewport - column) / 2 + STRAND_LAYOUT.columnPadding;
	const right = left + column - 2 * STRAND_LAYOUT.columnPadding;
	const hillTop = hillTopPage(left, right, land);
	const gap = STRAND_LAYOUT.trackGap;
	const n = Math.floor((right - left + gap) / (STRAND_LAYOUT.trackMin + gap));
	const track = (right - left - gap * (n - 1)) / n;
	const span: [number, number] = [Math.max(left, right - chipTotal), right];
	const drops = Array.from({ length: n }, (_, k) =>
		cardDrop(left + k * (track + gap) + track / 2, land, hillTop, span)
	);
	return { pull: hillTop - SCENE_BOTTOM, drops };
}

/** The chip row's width with TEXT_WIDTHS: each chip 26 + label + 6 + count, rounded, 8px apart. */
const CHIP_TOTAL = [
	['Klassiske', '4'],
	['Stjerner', '12'],
	['Mønstre', '26'],
	['Figurer', '7'],
	['Hjerter', '6']
]
	.map(([label, count]) => Math.round(32 + TEXT_WIDTHS[label] + TEXT_WIDTHS[count]))
	.reduce((sum, w) => sum + w + 8, -8);

beforeEach(() => {
	width = 1440;
	scrollbar = 0;
	root().removeAttribute('style');
	root().className = '';
	// Node's own global localStorage is unusable here (see safeStorage.test.ts).
	const store = new Map<string, string>();
	vi.stubGlobal('localStorage', {
		getItem: (key: string) => store.get(key) ?? null,
		setItem: (key: string, value: string) => void store.set(key, value)
	});
	const session = new Map<string, string>();
	vi.stubGlobal('sessionStorage', {
		getItem: (key: string) => session.get(key) ?? null,
		setItem: (key: string, value: string) => void session.set(key, value)
	});
	clearLevelBootstrap();
	window.history.replaceState(null, '', '/');
	stubPage();
});

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
	delete (HTMLElement.prototype as { offsetWidth?: number }).offsetWidth;
	delete (HTMLElement.prototype as { clientWidth?: number }).clientWidth;
});

describe('the strand bootstrap script', () => {
	it('lays out 1440 as the gallery measures it there', () => {
		run();
		// The numbers Gallery.svelte sets at 1440 (chromium and WebKit agree).
		expect(px('--gallery-pull')).toBeCloseTo(-149.7, 1);
		expect([0, 1, 2, 3, 4].map((k) => px(`--strand-${k}`))).toEqual([0.2, 29, 68.8, 105.7, 65.3]);
		expect(prop('--strand-5')).toBe('');
		expect(px('--strand-room')).toBe(105.7);
		expect(px('--gallery-bar-height')).toBe(49.6);
		expect(root().classList.contains('strands-ready')).toBe(true);
		expect(root().classList.contains('strands-5')).toBe(true);
	});

	it('agrees with $lib/front/hillLine at every desktop width', () => {
		for (const viewport of [900, 960, 1024, 1199, 1200, 1280, 1440, 1600, 1920, 2000, 2001, 2560, 3200]) {
			width = viewport;
			root().removeAttribute('style');
			root().className = '';
			run();
			const { pull, drops } = expected(viewport, CHIP_TOTAL);
			expect(px('--gallery-pull'), `pull at ${viewport}`).toBeCloseTo(pull, 1);
			expect(root().classList.contains(`strands-${drops.length}`), `columns at ${viewport}`).toBe(true);
			drops.forEach((drop, k) => {
				expect(Math.abs(px(`--strand-${k}`) - drop), `strand ${k} at ${viewport}`).toBeLessThan(0.051);
			});
			expect(px('--strand-room')).toBeCloseTo(Math.max(...drops), 1);
		}
	});

	it('does nothing below 900px', () => {
		for (const viewport of [390, 768, 899]) {
			width = viewport;
			run();
			expect(root().getAttribute('style')).toBeNull();
			expect(root().className).toBe('');
		}
	});

	it('lays out for the width left once a classic scrollbar appears', () => {
		scrollbar = 15;
		run();
		const { pull, drops } = expected(1425, CHIP_TOTAL);
		expect(px('--gallery-pull')).toBeCloseTo(pull, 1);
		drops.forEach((drop, k) => expect(px(`--strand-${k}`)).toBeCloseTo(drop, 1));
	});

	it('counts "Mine hjerter" and the download button into the chips’ span', () => {
		// At 1024 (four columns, centres 152, 392, 632, 872) the five chips end
		// at 984 and start at 494, so the last two columns are under them.
		width = 1024;
		run();
		const plain = [0, 1, 2, 3].map((k) => px(`--strand-${k}`));
		const base = expected(1024, CHIP_TOTAL).drops;
		expect(plain[2]).toBeCloseTo(base[2], 1);

		// "Mine hjerter 3" and "Hent skabeloner (2)" widen the row past 392.
		localStorage.setItem('julehjerte-collection', JSON.stringify([{}, {}, {}]));
		window.history.replaceState(null, '', '/?selected=a,b,a');
		root().removeAttribute('style');
		run();
		const mine = Math.round(32 + 'Mine hjerter'.length * 7 + 7);
		const button = Math.round(64 + 'Hent skabeloner'.length * 7 + 7);
		const wider = expected(1024, CHIP_TOTAL + mine + button + 16).drops;
		[0, 1, 2, 3].forEach((k) => expect(px(`--strand-${k}`)).toBeCloseTo(wider[k], 1));
		expect(px('--strand-1') - plain[1]).toBeCloseTo(54, 1);
	});

	it('is a script element whose text cannot close itself early, and runs as it is', () => {
		const html = strandBootstrapScript({ ...CHIPS, mine: '</script><b>' });
		expect(html.startsWith('<script>')).toBe(true);
		expect(html.indexOf('</script>')).toBe(html.length - '</script>'.length);
		(0, eval)(html.slice('<script>'.length, -'</script>'.length));
		expect(px('--strand-3')).toBe(105.7);
	});
});

describe('clearStrandBootstrap', () => {
	it('removes everything the script set, and nothing else', () => {
		run();
		root().classList.add('hero-ready');
		root().style.setProperty('--other', '1px');
		clearStrandBootstrap();
		expect(root().className).toBe('hero-ready');
		expect(root().getAttribute('style')).toBe('--other: 1px;');
	});
});

describe('the difficulty filter in the strand bootstrap script', () => {
	const style = () => document.querySelector('style[data-level-bootstrap]')?.textContent ?? null;

	it('counts the toggles into the chips’ span: 1440 as the gallery measures it there', () => {
		// The numbers Gallery.svelte sets at 1440 with the toggles in the row
		// (chromium and WebKit agree): the row now reaches over four columns.
		run(FILTERED);
		expect([0, 1, 2, 3, 4].map((k) => px(`--strand-${k}`))).toEqual([54.2, 83, 122.8, 105.7, 65.3]);
		expect(px('--strand-room')).toBe(122.8);
		// No filter chosen: nothing to hide.
		expect(style()).toBeNull();
	});

	it('hides the other levels and the emptied categories for ?level=let', () => {
		window.history.replaceState(null, '', '/?level=let');
		run(FILTERED);
		const css = style()!;
		for (const level of ['medium', 'hard', 'expert']) {
			expect(css).toContain(`.cat-grid > [data-level="${level}"]{display:none}`);
		}
		expect(css).not.toContain('[data-level="easy"]{display:none}');
		expect(css).toContain('#skabeloner > #moenstre{display:none}');
		expect(css).toContain('#skabeloner > #figurer{display:none}');
		expect(css).not.toContain('#klassiske{display:none}');
		// Klassiske still has a heart on show, so it keeps the first margin.
		expect(css).not.toContain('margin-top');
		// The strands count the cards on show only: five columns at 1440.
		expect(css).toContain(
			'html.strands-5 #skabeloner .cat:not(.apart) .cat-grid > :nth-child(5n + 1 of [data-level="easy"]){--strand:var(--strand-0)}'
		);
		expect(css).toContain(':nth-child(5n + 5 of [data-level="easy"]){--strand:var(--strand-4)}');
	});

	it('estimates the chips with the counts the filter leaves, at every desktop width', () => {
		// "Let": Klassiske 1, Stjerner 4, Mønstre 0, Fliser 0, Figurer 0, Tekst 0,
		// Hjerter 1, the emptied ones dimmed but still in the row.
		const counts = ['1', '4', '0', '0', '0', '0', '1'];
		for (const viewport of [900, 1024, 1199, 1200, 1440, 1920]) {
			width = viewport;
			window.history.replaceState(null, '', '/?level=let');
			root().removeAttribute('style');
			root().className = '';
			run(FILTERED);
			const { drops } = expected(viewport, rowTotal(counts, viewport >= 1200));
			drops.forEach((drop, k) => {
				expect(Math.abs(px(`--strand-${k}`) - drop), `strand ${k} at ${viewport}`).toBeLessThan(0.051);
			});
		}
	});

	it('takes the URL over the tab’s stored choice, and the stored choice without one', () => {
		sessionStorage.setItem(LEVEL_STORAGE_KEY, 'ekspert');
		run(FILTERED);
		expect(style()).toContain('[data-level="easy"]{display:none}');
		expect(style()).not.toContain('[data-level="expert"]{display:none}');

		clearLevelBootstrap();
		window.history.replaceState(null, '', '/?level=let,mellem');
		run(FILTERED);
		expect(style()).toContain('[data-level="expert"]{display:none}');
		expect(style()).toContain('of [data-level="easy"],[data-level="medium"])');
	});

	it('gives the first category on show the first one’s margin', () => {
		// No "Klassiske" heart is an expert's.
		window.history.replaceState(null, '', '/?level=ekspert');
		run(FILTERED);
		const css = style()!;
		expect(css).toContain('#skabeloner > #klassiske{display:none}');
		expect(css).toContain('#skabeloner > #stjerner{margin-top:8px}');
		expect(css).toContain(
			'@media (min-width: 900px){#skabeloner > #stjerner{margin-top:calc(6px - var(--gallery-bar-height, 49px) - var(--bar-room, 0px))}}'
		);
	});

	it('filters below 900px too, without strands', () => {
		width = 390;
		window.history.replaceState(null, '', '/?level=let');
		run(FILTERED);
		expect(style()).toContain('#skabeloner > #moenstre{display:none}');
		expect(style()).not.toContain('--strand');
		expect(root().getAttribute('style')).toBeNull();
		expect(root().className).toBe('');
	});

	it('leaves out a filter that hides what the page was entered at', () => {
		// A heart's breadcrumb links to its category; a card's anchor to it.
		sessionStorage.setItem(LEVEL_STORAGE_KEY, 'let');
		window.history.replaceState(null, '', '/#moenstre');
		run(FILTERED);
		expect(style()).toBeNull();

		window.history.replaceState(null, '', '/#heart-jul');
		run(FILTERED);
		expect(style()).toBeNull();

		// Shown by the filter: it stays.
		window.history.replaceState(null, '', '/#stjerner');
		run(FILTERED);
		expect(style()).toContain('#skabeloner > #moenstre{display:none}');
		clearLevelBootstrap();
		window.history.replaceState(null, '', '/#heart-classic-3x3');
		run(FILTERED);
		expect(style()).toContain('#skabeloner > #moenstre{display:none}');
	});

	it('ignores unknown words', () => {
		window.history.replaceState(null, '', '/?level=nonsense');
		run(FILTERED);
		expect(style()).toBeNull();
	});

	it('counts the toggles’ dots only from 1200px up and while nothing is ticked', () => {
		const all = ['5', '14', '28', '10', '11', '4', '7'];
		// A desktop width where a column centre lies between the row's start with and without the dots.
		const at = [1440, 1366, 1280, 1536, 1600, 1680, 1920, 1200].find(
			(viewport) => JSON.stringify(expected(viewport, rowTotal(all, true)).drops) !== JSON.stringify(expected(viewport, rowTotal(all, false)).drops)
		)!;
		expect(at).toBeDefined();
		width = at;
		const withDots = expected(at, rowTotal(all, true)).drops;
		run(FILTERED);
		withDots.forEach((drop, k) => expect(px(`--strand-${k}`)).toBeCloseTo(drop, 1));

		// Ticked: the download button joins the row and the dots go.
		window.history.replaceState(null, '', '/?selected=a');
		root().removeAttribute('style');
		run(FILTERED);
		const button = Math.round(64 + 'Hent skabeloner'.length * 7 + 7);
		const ticked = expected(at, rowTotal(all, false) + button + 8).drops;
		ticked.forEach((drop, k) => expect(px(`--strand-${k}`)).toBeCloseTo(drop, 1));
	});
});

describe('clearLevelBootstrap', () => {
	it('removes the filter’s first-paint rules', () => {
		window.history.replaceState(null, '', '/?level=let');
		run(FILTERED);
		expect(document.querySelectorAll('style[data-level-bootstrap]')).toHaveLength(1);
		clearLevelBootstrap();
		expect(document.querySelectorAll('style[data-level-bootstrap]')).toHaveLength(0);
	});
});
