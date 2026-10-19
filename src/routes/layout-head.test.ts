/**
 * The layout's <head>: an ordinary page is indexable with a self canonical and
 * its language alternates; an error page (a 404) gets none of those and says
 * noindex instead.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRawSnippet, flushSync, mount, unmount, type Component } from 'svelte';
import { writable } from 'svelte/store';

const pageStore = vi.hoisted(() => ({ value: null as unknown }));

vi.mock('$app/stores', async () => {
	const store = writable({
		url: new URL('https://juleflet.dk/om/'),
		params: {},
		route: { id: '/[[lang=lang]]/om' },
		status: 200,
		error: null as App.Error | null,
		data: {},
		state: {},
		form: null
	});
	pageStore.value = store;
	return { page: store };
});

const { default: Layout } = await import('./+layout.svelte');
const { default: ErrorPage } = await import('./+error.svelte');

type Page = { url: URL; route: { id: string | null }; status: number; error: App.Error | null };
const setPage = (patch: Partial<Page>) =>
	(pageStore.value as ReturnType<typeof writable<Page>>).update((p) => ({ ...p, ...patch }));

const cleanup: (() => void)[] = [];
afterEach(() => {
	for (const dispose of cleanup.splice(0)) dispose();
	document.head.innerHTML = '';
});

function render(component: Component<any>, props: Record<string, unknown> = {}) {
	const target = document.createElement('div');
	document.body.appendChild(target);
	const app = mount(component, { target, props });
	cleanup.push(() => {
		unmount(app);
		target.remove();
	});
	flushSync();
}

const children = createRawSnippet(() => ({ render: () => '<div></div>' }));
const head = (selector: string) => [...document.head.querySelectorAll(selector)];

describe('layout head', () => {
	it('gives the unadvertised archive its own description and language alternates', () => {
		setPage({ url: new URL('https://juleflet.dk/en/all/'), route: { id: '/en/all' }, status: 200, error: null });
		render(Layout, { children });
		expect(head('meta[name="description"]')).toHaveLength(1);
		expect(head('meta[name="description"]')[0].getAttribute('content')).toContain('An archive of woven Christmas hearts');
		expect(head('link[rel="alternate"][hreflang="da"]')[0].getAttribute('href')).toBe('https://juleflet.dk/all/');
	});

	it('gives an ordinary page a canonical, alternates and index', () => {
		setPage({ url: new URL('https://juleflet.dk/om/'), route: { id: '/[[lang=lang]]/om' }, status: 200, error: null });
		render(Layout, { children });
		expect(head('link[rel="canonical"]').map((l) => l.getAttribute('href'))).toEqual(['https://juleflet.dk/om/']);
		expect(head('link[rel="alternate"][hreflang]')).toHaveLength(3);
		expect(head('meta[name="robots"]').map((m) => m.getAttribute('content'))).toEqual(['index, follow']);
	});

	it('gives an error page noindex and no canonical or alternates', () => {
		setPage({
			url: new URL('https://juleflet.dk/does-not-exist/'),
			route: { id: null },
			status: 404,
			error: { message: 'Not Found' }
		});
		render(Layout, { children });
		render(ErrorPage);
		expect(head('link[rel="canonical"]')).toEqual([]);
		expect(head('link[rel="alternate"][hreflang]')).toEqual([]);
		expect(head('meta[name="robots"]').map((m) => m.getAttribute('content'))).toEqual(['noindex']);
	});
});
