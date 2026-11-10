/**
 * The footer's one line, in each language, with the seasons it counts.
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

import PageFooter from './PageFooter.svelte';

afterEach(() => {
	vi.useRealTimers();
	document.body.innerHTML = '';
});

function line(path: string, today: string): string {
	vi.useFakeTimers({ toFake: ['Date'] });
	vi.setSystemTime(new Date(today));
	url.current = new URL(`http://localhost${path}`);
	const target = document.createElement('div');
	document.body.append(target);
	const component = mount(PageFooter, { target });
	flushSync();
	const text = target.querySelector('.made-by')!.textContent!.replace(/\s+/g, ' ').trim();
	unmount(component);
	return text;
}

describe('PageFooter', () => {
	it('credits the site with the Christmases it has been up, in the page language', () => {
		expect(line('/', '2025-12-01')).toBe('© Thomas Ahle, julen 2025');
		expect(line('/om/', '2026-12-01')).toBe('© Thomas Ahle, julen 2025, 2026');
		expect(line('/en/about/', '2026-12-01')).toBe('© Thomas Ahle, Christmas 2025, 2026');
	});
});
