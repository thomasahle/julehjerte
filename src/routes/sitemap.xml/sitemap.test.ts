/**
 * The sitemap: well-formed XML with the image namespace, and every heart page
 * (in both languages) carrying its square picture, the front pages the first
 * few of the gallery's. Dates come from git ($lib/server/lastModified), faked
 * here.
 */
import { describe, expect, it, vi } from 'vitest';
import { ALL_HEART_IDS } from '$lib/data/categories';
import type { LastModified } from '$lib/server/lastModified';

const lastModified = vi.hoisted(() => ({ value: null as LastModified | null }));
vi.mock('$lib/server/lastModified', () => ({ readLastModified: () => lastModified.value }));

const { GET } = await import('./+server');

const IMAGE_NS = 'http://www.google.com/schemas/sitemap-image/1.1';
const SITEMAP_NS = 'http://www.sitemaps.org/schemas/sitemap/0.9';

async function sitemap(): Promise<Document> {
	const response = await (GET as unknown as () => Promise<Response>)();
	const text = await response.text();
	const doc = new DOMParser().parseFromString(text, 'application/xml');
	expect(doc.getElementsByTagName('parsererror')).toHaveLength(0);
	return doc;
}

function imagesByPage(doc: Document): Map<string, string[]> {
	const pages = new Map<string, string[]>();
	for (const url of Array.from(doc.getElementsByTagNameNS(SITEMAP_NS, 'url'))) {
		const loc = url.getElementsByTagNameNS(SITEMAP_NS, 'loc')[0].textContent!;
		const images = Array.from(url.getElementsByTagNameNS(IMAGE_NS, 'image')).map(
			(image) => image.getElementsByTagNameNS(IMAGE_NS, 'loc')[0].textContent!
		);
		pages.set(loc, images);
	}
	return pages;
}

function lastmodByPage(doc: Document): Map<string, string | null> {
	return new Map(
		Array.from(doc.getElementsByTagNameNS(SITEMAP_NS, 'url')).map((url) => [
			url.getElementsByTagNameNS(SITEMAP_NS, 'loc')[0].textContent!,
			url.getElementsByTagNameNS(SITEMAP_NS, 'lastmod')[0]?.textContent ?? null
		])
	);
}

describe('sitemap.xml images', () => {
	it('is well-formed and declares the image namespace', async () => {
		const doc = await sitemap();
		expect(doc.documentElement.getAttribute('xmlns:image')).toBe(IMAGE_NS);
	});

	it('gives each heart page exactly its square picture', async () => {
		const pages = imagesByPage(await sitemap());
		for (const id of ALL_HEART_IDS) {
			for (const prefix of ['', '/en']) {
				expect(pages.get(`https://juleflet.dk${prefix}/hjerte/${id}/`), id).toEqual([
					`https://juleflet.dk/og/hearts/${id}.png`
				]);
			}
		}
		const heartImages = [...pages].filter(([loc]) => loc.includes('/hjerte/')).flatMap(([, images]) => images);
		expect(heartImages).toHaveLength(2 * ALL_HEART_IDS.length);
	});

	it('gives the front pages the first five hearts and other pages none', async () => {
		const pages = imagesByPage(await sitemap());
		const first = ALL_HEART_IDS.slice(0, 5).map((id) => `https://juleflet.dk/og/hearts/${id}.png`);
		expect(pages.get('https://juleflet.dk/')).toEqual(first);
		expect(pages.get('https://juleflet.dk/en/')).toEqual(first);
		expect(pages.get('https://juleflet.dk/om/')).toEqual([]);
	});
});

describe('sitemap.xml dates', () => {
	it('dates each heart page by its heart and the front pages by the gallery, and no other page', async () => {
		const [first, second] = ALL_HEART_IDS;
		lastModified.value = {
			hearts: new Map([
				[first!, '2026-10-20'],
				[second!, '2026-10-27']
			]),
			gallery: '2026-10-27'
		};
		const dates = lastmodByPage(await sitemap());
		lastModified.value = null;
		for (const prefix of ['', '/en']) {
			expect(dates.get(`https://juleflet.dk${prefix}/hjerte/${first}/`)).toBe('2026-10-20');
			expect(dates.get(`https://juleflet.dk${prefix}/hjerte/${second}/`)).toBe('2026-10-27');
			expect(dates.get(`https://juleflet.dk${prefix}/hjerte/${ALL_HEART_IDS[2]}/`)).toBeNull();
			expect(dates.get(`https://juleflet.dk${prefix}/`)).toBe('2026-10-27');
		}
		expect(dates.get('https://juleflet.dk/om/')).toBeNull();
	});

	it('leaves every date out when there is no history to read', async () => {
		const dates = lastmodByPage(await sitemap());
		expect([...dates.values()].every((date) => date === null)).toBe(true);
	});
});
