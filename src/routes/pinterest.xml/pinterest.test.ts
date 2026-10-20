/**
 * The /pinterest.xml endpoint: well-formed RSS whatever the clock says, with
 * the real hearts' Danish names and descriptions ($lib/pinterest).
 */
import { afterEach, describe, expect, it } from 'vitest';
import { GET } from './+server';

async function feed(now?: string): Promise<Document> {
	if (now) process.env.PINTEREST_NOW = now;
	const response = await (GET as unknown as () => Promise<Response>)();
	expect(response.headers.get('Content-Type')).toContain('application/rss+xml');
	const doc = new DOMParser().parseFromString(await response.text(), 'application/xml');
	expect(doc.getElementsByTagName('parsererror')).toHaveLength(0);
	return doc;
}

afterEach(() => {
	delete process.env.PINTEREST_NOW;
});

describe('pinterest.xml', () => {
	it('is empty the day before the start', async () => {
		const doc = await feed('2026-10-20T12:00:00+02:00');
		expect(doc.getElementsByTagName('item')).toHaveLength(0);
	});

	it('has a week of hearts with Danish texts on 27 October', async () => {
		const doc = await feed('2026-10-27T08:00:00+01:00');
		const items = Array.from(doc.getElementsByTagName('item'));
		expect(items).toHaveLength(7);
		const titles = items.map((item) => item.getElementsByTagName('title')[0].textContent);
		expect(titles.at(-1)).toBe('Klassisk 3×3 – flettet julehjerte');
		expect(titles).toContain('Gaver – flettet julehjerte');
		const description = items.at(-1)!.getElementsByTagName('description')[0].textContent!;
		expect(description).toMatch(/^Det traditionelle danske julehjerte\./);
		expect(description.endsWith('Hent skabelonen gratis på juleflet.dk')).toBe(true);
	});

	it('rejects a PINTEREST_NOW that is not a date', async () => {
		process.env.PINTEREST_NOW = 'i morgen';
		await expect((GET as unknown as () => Promise<Response>)()).rejects.toThrow(/PINTEREST_NOW/);
	});
});
