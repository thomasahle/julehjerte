import { browser } from '$app/environment';
import { readStorage, writeStorage } from '$lib/utils/safeStorage';

/**
 * The repository's star count, fetched at most once a day and cached in
 * localStorage. Extracted from the old GitHubStarsButton so both the nav pill
 * and the footer link can show the same number without fetching twice.
 *
 * Always resolves — never throws, never logs — and resolves to null when the
 * count is not available (offline, rate limited, or called during
 * prerendering); the link then shows without it.
 *
 * api.github.com allows 60 unauthenticated requests an hour per address, and a
 * visitor browsing the hearts loads a page per heart, so with an hour's cache
 * and only an in-memory record of failures every page load after the limit
 * asked again and logged a 403 (QA, 2026-10-17). The count now keeps a day,
 * and a failure is remembered in storage too, for the rate limit's hour.
 */
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/** Under the site's own `juleflet:` prefix, as its other stored settings. */
const cacheKey = (repo: string) => `juleflet:github-stars:${repo}`;

/** How long a failure is remembered: GitHub's rate-limit window. */
const FAILURE_TTL_MS = 60 * 60 * 1000;

/** In-memory cache so several components on a page share one request. */
const inFlight = new Map<string, Promise<number | null>>();

interface Cached {
	/** The count; absent for a remembered failure. */
	value?: number;
	ts: number;
}

export function formatStars(n: number): string {
	if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}m`;
	if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}k`;
	return String(n);
}

function readCache(repo: string): Cached | null {
	const raw = readStorage(cacheKey(repo));
	if (!raw) return null;
	try {
		const cached = JSON.parse(raw) as { value?: unknown; ts?: unknown };
		if (typeof cached.ts !== 'number') return null;
		const age = Date.now() - cached.ts;
		if (typeof cached.value === 'number') return age < CACHE_TTL_MS ? { value: cached.value, ts: cached.ts } : null;
		return age < FAILURE_TTL_MS ? { ts: cached.ts } : null;
	} catch {
		return null;
	}
}

function writeCache(repo: string, value: number | null) {
	const entry: Cached = value === null ? { ts: Date.now() } : { value, ts: Date.now() };
	// Storage full or blocked — the count is a nicety, so ignore it.
	writeStorage(cacheKey(repo), JSON.stringify(entry));
}

export async function loadStarCount(repo: string): Promise<number | null> {
	if (!browser) return null;

	const cached = readCache(repo);
	if (cached) return cached.value ?? null;

	const pending = inFlight.get(repo);
	if (pending) return pending;

	const request = (async (): Promise<number | null> => {
		let count: number | null = null;
		try {
			const res = await fetch(`https://api.github.com/repos/${repo}`, {
				headers: { Accept: 'application/vnd.github+json' }
			});
			if (res.ok) {
				const data = (await res.json()) as { stargazers_count?: unknown };
				if (typeof data.stargazers_count === 'number') count = data.stargazers_count;
			}
		} catch {
			// Offline or blocked: the same as no count.
		} finally {
			inFlight.delete(repo);
		}
		writeCache(repo, count);
		return count;
	})();

	inFlight.set(repo, request);
	return request;
}
