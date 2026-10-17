/**
 * Where HangingHeart's drawing code comes from (performance QA, M3): it does not
 * import PaperHeartSVG itself, so the front page, whose hearts arrive as
 * prerendered markup, never downloads it. A heart drawn from `design` gets the
 * component from its parent, either directly (`paper`, the heart page) or on
 * demand (`loadPaper`, the front page after a client-side navigation).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import HangingHeart from './HangingHeart.svelte';
import PaperHeartSVG from './PaperHeartSVG.svelte';
import { getGalleryDesign } from '$lib/data/heartDesigns';
import hangingSource from './HangingHeart.svelte?raw';
import heroHeartsSource from './front/HeroHearts.svelte?raw';
import heartCardSource from './HeartCard.svelte?raw';

const design = getGalleryDesign('classic-3x3')!;
const MARKUP = '<svg class="frozen" viewBox="0 0 10 10"></svg>';

let component: ReturnType<typeof mount> | null = null;

function memoryStorage(): Storage {
	const items = new Map<string, string>();
	return {
		get length() {
			return items.size;
		},
		clear: () => items.clear(),
		getItem: (key) => items.get(key) ?? null,
		key: (i) => [...items.keys()][i] ?? null,
		removeItem: (key) => void items.delete(key),
		setItem: (key, value) => void items.set(key, String(value))
	};
}

beforeEach(() => {
	vi.stubGlobal('localStorage', memoryStorage());
});

afterEach(() => {
	if (component) unmount(component);
	component = null;
	document.body.innerHTML = '';
	vi.unstubAllGlobals();
});

function render(props: Record<string, unknown>) {
	const target = document.createElement('div');
	document.body.append(target);
	component = mount(HangingHeart, { target, props: { idPrefix: 't', ...props } });
	flushSync();
	return target;
}

describe('HangingHeart', () => {
	it('is not, and the front page hearts are not, a static importer of PaperHeartSVG', () => {
		const staticImport = /^\s*import\s+(?!type\b)[^;]*PaperHeartSVG\.svelte/m;
		for (const source of [hangingSource, heroHeartsSource, heartCardSource]) {
			expect(source).not.toMatch(staticImport);
		}
	});

	it('shows markup as it is and never loads the drawing code', () => {
		const loadPaper = vi.fn(async () => ({ default: PaperHeartSVG }));
		const target = render({ design, markup: MARKUP, loadPaper });
		expect(target.querySelector('svg.frozen')).not.toBeNull();
		expect(loadPaper).not.toHaveBeenCalled();
	});

	it('draws a design straight away with the component it is given', () => {
		const target = render({ design, paper: PaperHeartSVG });
		expect(target.querySelector('svg.paper-heart-svg')).not.toBeNull();
	});

	it('loads the component once for a design and then draws it', async () => {
		const loadPaper = vi.fn(async () => ({ default: PaperHeartSVG }));
		const target = render({ design, loadPaper });
		expect(target.querySelector('.ribbon')).not.toBeNull();
		expect(target.querySelector('svg.paper-heart-svg')).toBeNull();
		await vi.waitFor(() => {
			flushSync();
			expect(target.querySelector('svg.paper-heart-svg')).not.toBeNull();
		});
		expect(loadPaper).toHaveBeenCalledTimes(1);
	});
});
