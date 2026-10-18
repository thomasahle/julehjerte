/**
 * The heart page's load for an id that is no gallery heart: it must come back
 * empty (no meta, design, prose or related row) so that the page falls through
 * to the browser-only lookups and, failing those, to its not-found page.
 */
import { describe, expect, it } from 'vitest';
import { load } from './+page';

type LoadEvent = Parameters<typeof load>[0];

async function run(id: string, lang?: string) {
	return (await load({ params: { id, lang } } as unknown as LoadEvent)) as Record<string, unknown>;
}

describe('heart page load', () => {
	it.each([undefined, 'en'])('returns nothing for an unknown id (lang %s)', async (lang) => {
		const data = await run('nope', lang);
		expect(data.meta).toBeNull();
		expect(data.design).toBeNull();
		expect(data.description).toBeNull();
		expect(data.shared).toBe(false);
		expect(data.categoryId).toBeNull();
		expect(data.related).toEqual([]);
	});

	it('returns the heart for a gallery id', async () => {
		const data = await run('stjerne');
		expect(data.meta).not.toBeNull();
		expect(data.design).not.toBeNull();
	});

	it("names the related hearts in the page's language", async () => {
		const names = async (lang?: string) =>
			((await run('amy-weave-2', lang)).related as { id: string; name: string }[]).find((h) => h.id === 'amy-weave-1')
				?.name;
		expect(await names()).toBe('Flet 1');
		expect(await names('en')).toBe('Weave 1');
	});
});
