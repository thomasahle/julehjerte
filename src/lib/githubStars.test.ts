/**
 * The star count beside the GitHub link. api.github.com allows 60 unauthenticated
 * requests an hour, and every full page load used to ask once the hour-old cache
 * ran out, so a visitor browsing the hearts got a 403 in the console from about
 * the 40th page on (QA, 2026-10-17). The count is kept a day, a failure is
 * remembered across page loads, and nothing is logged.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, tick, unmount } from 'svelte';

import GitHubLink from '$lib/components/GitHubLink.svelte';

vi.mock('$app/environment', () => ({ browser: true, dev: false, building: false, version: 'test' }));

const REPO = 'thomasahle/julehjerte';
const HOUR = 60 * 60 * 1000;

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

/** A fresh copy of the module, as a new page load gets: no in-memory state. */
async function pageLoad() {
	vi.resetModules();
	return import('./githubStars');
}

let fetchMock: ReturnType<typeof vi.fn>;
let consoleSpies: ReturnType<typeof vi.spyOn>[];

beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(new Date('2026-12-01T12:00:00Z'));
	vi.stubGlobal('localStorage', memoryStorage());
	fetchMock = vi.fn(async () => new Response(JSON.stringify({ stargazers_count: 1234 }), { status: 200 }));
	vi.stubGlobal('fetch', fetchMock);
	consoleSpies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) =>
		vi.spyOn(console, m).mockImplementation(() => {})
	);
});

afterEach(() => {
	for (const spy of consoleSpies) expect(spy).not.toHaveBeenCalled();
	vi.useRealTimers();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe('loadStarCount', () => {
	it('asks GitHub once a day, keeping the count under the juleflet: prefix', async () => {
		expect(await (await pageLoad()).loadStarCount(REPO)).toBe(1234);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(Object.keys(Object.fromEntries(Array.from({ length: localStorage.length }, (_, i) => [localStorage.key(i), 1])))).toEqual([
			`juleflet:github-stars:${REPO}`
		]);

		vi.advanceTimersByTime(23 * HOUR);
		expect(await (await pageLoad()).loadStarCount(REPO)).toBe(1234);
		expect(fetchMock).toHaveBeenCalledTimes(1);

		vi.advanceTimersByTime(2 * HOUR);
		expect(await (await pageLoad()).loadStarCount(REPO)).toBe(1234);
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it('gives null for a 403, quietly, and does not ask again on the next page loads', async () => {
		fetchMock.mockImplementation(async () => new Response('{"message":"API rate limit exceeded"}', { status: 403 }));
		expect(await (await pageLoad()).loadStarCount(REPO)).toBeNull();
		for (let i = 0; i < 5; i++) {
			vi.advanceTimersByTime(5 * 60 * 1000);
			expect(await (await pageLoad()).loadStarCount(REPO)).toBeNull();
		}
		expect(fetchMock).toHaveBeenCalledTimes(1);
		// The rate limit's window is an hour; after it, one more try.
		vi.advanceTimersByTime(HOUR);
		fetchMock.mockImplementation(async () => new Response(JSON.stringify({ stargazers_count: 7 }), { status: 200 }));
		expect(await (await pageLoad()).loadStarCount(REPO)).toBe(7);
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it('gives null when the request itself fails, quietly', async () => {
		fetchMock.mockImplementation(async () => {
			throw new TypeError('Failed to fetch');
		});
		expect(await (await pageLoad()).loadStarCount(REPO)).toBeNull();
		expect(await (await pageLoad()).loadStarCount(REPO)).toBeNull();
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it('still works when storage is blocked', async () => {
		vi.stubGlobal('localStorage', {
			getItem: () => {
				throw new Error('blocked');
			},
			setItem: () => {
				throw new Error('blocked');
			}
		});
		expect(await (await pageLoad()).loadStarCount(REPO)).toBe(1234);
	});
});

describe('GitHubLink', () => {
	it('shows the link without a count when the count is unavailable', async () => {
		fetchMock.mockImplementation(async () => new Response('', { status: 403 }));
		const target = document.createElement('div');
		document.body.appendChild(target);
		const component = mount(GitHubLink, { target, props: {} });
		flushSync();
		await vi.runAllTimersAsync();
		await tick();
		flushSync();
		const link = target.querySelector('a')!;
		expect(link.getAttribute('href')).toBe(`https://github.com/${REPO}`);
		expect(link.textContent!.trim()).toBe('GitHub');
		expect(target.querySelector('.count')).toBeNull();
		unmount(component);
		target.remove();
	});
});
