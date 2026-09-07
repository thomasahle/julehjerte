import { browser } from '$app/environment';

/**
 * The repository's star count, fetched once per hour and cached in
 * localStorage. Extracted from the old GitHubStarsButton so both the nav pill
 * and the footer link can show the same number without fetching twice.
 *
 * Always resolves — never throws — and resolves to null when the count is not
 * available (offline, rate limited, or called during prerendering).
 */
const CACHE_TTL_MS = 60 * 60 * 1000;

const cacheKey = (repo: string) => `github-stars:${repo}`;

/** How long a failure is remembered. Short, because it is usually a rate limit. */
const FAILURE_TTL_MS = 5 * 60 * 1000;

/** In-memory cache so several components on a page share one request. */
const inFlight = new Map<string, Promise<number | null>>();

/**
 * When the request last failed, per repo. Without this a rate-limited or offline
 * visitor refetches on every client-side navigation: PageHeader mounts per page,
 * and only a *successful* response is written to localStorage.
 */
const lastFailure = new Map<string, number>();

export function formatStars(n: number): string {
	if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}m`;
	if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}k`;
	return String(n);
}

function readCache(repo: string): number | null {
	try {
		const raw = window.localStorage.getItem(cacheKey(repo));
		if (!raw) return null;
		const cached = JSON.parse(raw) as { value?: unknown; ts?: unknown };
		if (typeof cached.value !== 'number' || typeof cached.ts !== 'number') return null;
		return Date.now() - cached.ts < CACHE_TTL_MS ? cached.value : null;
	} catch {
		return null;
	}
}

function writeCache(repo: string, value: number) {
	try {
		window.localStorage.setItem(cacheKey(repo), JSON.stringify({ value, ts: Date.now() }));
	} catch {
		// Storage full or blocked — the count is a nicety, so ignore it.
	}
}

export async function loadStarCount(repo: string): Promise<number | null> {
	if (!browser) return null;

	const cached = readCache(repo);
	if (cached !== null) return cached;

	const pending = inFlight.get(repo);
	if (pending) return pending;

	const failedAt = lastFailure.get(repo);
	if (failedAt !== undefined && Date.now() - failedAt < FAILURE_TTL_MS) return null;

	const request = (async () => {
		try {
			const res = await fetch(`https://api.github.com/repos/${repo}`, {
				headers: { Accept: 'application/vnd.github+json' }
			});
			if (!res.ok) {
				lastFailure.set(repo, Date.now());
				return null;
			}
			const data = (await res.json()) as { stargazers_count?: unknown };
			if (typeof data.stargazers_count !== 'number') {
				lastFailure.set(repo, Date.now());
				return null;
			}
			writeCache(repo, data.stargazers_count);
			lastFailure.delete(repo);
			return data.stargazers_count;
		} catch {
			lastFailure.set(repo, Date.now());
			return null;
		} finally {
			inFlight.delete(repo);
		}
	})();

	inFlight.set(repo, request);
	return request;
}
