import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	STRAND_LAYOUT,
	clearStrandBootstrap,
	strandBootstrapScript,
	strandBootstrapSource,
	type StrandChips
} from './strandBootstrap';
import { cardDrop, hillTopPage, type LandRect } from './hillLine';
import { LANDSCAPE_HEIGHT, LANDSCAPE_MAX_WIDTH, LANDSCAPE_WIDTH } from '$lib/landscape';

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
	Figurer: 44.0,
	Hjerter: 43.0,
	'4': 7.2,
	'12': 14.4,
	'26': 14.4,
	'7': 7.2,
	'6': 7.2
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
	window.matchMedia = ((query: string) => ({
		matches: query === '(min-width: 900px)' ? width >= 900 : false
	})) as unknown as typeof window.matchMedia;
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
