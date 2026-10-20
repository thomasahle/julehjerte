/**
 * What a search engine reads on a gallery heart's page, rendered from the
 * page's own load data: one ld+json script with the HowTo, the robots
 * directive that allows a large image preview, and a real <img> of the heart's
 * square picture in the "Hjerte" thumbnail, beside the inline SVG it lies over.
 * A heart that is no gallery heart gets none of them.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount, type Component } from 'svelte';
import { writable } from 'svelte/store';

const pageStore = vi.hoisted(() => ({ value: null as unknown }));

vi.mock('$app/stores', async () => {
	const store = writable({
		url: new URL('https://juleflet.dk/hjerte/jul/'),
		params: { id: 'jul' } as Record<string, string | undefined>,
		route: { id: '/[[lang=lang]]/hjerte/[id]' },
		status: 200,
		error: null,
		data: {},
		state: {},
		form: null
	});
	pageStore.value = store;
	return { page: store };
});

const { default: HeartPage } = await import('./+page.svelte');
const { default: stageSource } = await import('$lib/components/detail/HeartStage.svelte?raw');
const { PAPER_KIND_CLASSES } = await import('$lib/stores/colors');
const { COLOR_MODE_CLASS } = await import('$lib/stores/colorMode');
const { load } = await import('./+page');

type LoadEvent = Parameters<typeof load>[0];

const cleanup: (() => void)[] = [];
afterEach(() => {
	for (const dispose of cleanup.splice(0)) dispose();
	document.head.innerHTML = '';
});

async function render(id: string, lang?: string) {
	(pageStore.value as ReturnType<typeof writable<any>>).update((p) => ({
		...p,
		url: new URL(`https://juleflet.dk${lang ? `/${lang}` : ''}/hjerte/${id}/`),
		params: { id, lang }
	}));
	const data = await load({ params: { id, lang } } as unknown as LoadEvent);
	const target = document.createElement('div');
	document.body.appendChild(target);
	const app = mount(HeartPage as Component<any>, { target, props: { data, params: { id, lang } } });
	cleanup.push(() => {
		unmount(app);
		target.remove();
	});
	flushSync();
	return target;
}

const ldJson = () =>
	[...document.head.querySelectorAll('script[type="application/ld+json"]')].map((s) => JSON.parse(s.textContent!));

describe('heart page search appearance', () => {
	it.each([
		[undefined, 'da'],
		['en', 'en']
	])('writes the HowTo, the robots directive and the image (lang %s)', async (lang, inLanguage) => {
		const target = await render('jul', lang);
		const scripts = ldJson();
		expect(scripts).toHaveLength(1);
		expect(scripts[0]).toMatchObject({ '@type': 'HowTo', name: 'JUL', inLanguage });
		expect(scripts[0].image[0].url).toBe('https://juleflet.dk/og/hearts/jul.png');
		expect(scripts[0].description).toBe(
			document.head.querySelector('meta[name="description"]')!.getAttribute('content')
		);
		expect([...document.head.querySelectorAll('meta[name="robots"]')].map((m) => m.getAttribute('content'))).toEqual([
			'index, follow, max-image-preview:large'
		]);

		const img = target.querySelector<HTMLImageElement>('.thumb-picture img')!;
		expect(img).not.toBeNull();
		expect(img.getAttribute('src')).toBe('/og/hearts/jul.png');
		expect(img.getAttribute('alt')).toContain('JUL');
		// The inline SVG stays under it for the colourful mode and other pairs.
		expect(img.closest('.thumb')!.querySelector(':scope > svg')).not.toBeNull();
	});

	it('gives a heart that is no gallery heart neither', async () => {
		const target = await render('not-a-heart');
		expect(ldJson()).toEqual([]);
		expect(target.querySelector('.thumb-picture')).toBeNull();
	});

	it("hides the red and white picture under every class that recolours the thumbnail's SVG", () => {
		for (const name of [COLOR_MODE_CLASS, PAPER_KIND_CLASSES.flipped, PAPER_KIND_CLASSES.custom]) {
			expect(stageSource).toContain(`:global(html.${name}) .thumb-picture`);
		}
	});
});
