/**
 * The sitemap: well-formed XML with the image namespace, and every heart page
 * (in both languages) carrying its square picture, the front pages the first
 * few of the gallery's.
 */
import { describe, expect, it } from 'vitest';
import { ALL_HEART_IDS } from '$lib/data/categories';
import { GET } from './+server';

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
