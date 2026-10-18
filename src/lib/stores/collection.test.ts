import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadStaticHeartById } from './collection';

// The SVGs under /hearts/ are exactly the gallery's hearts, so an unknown id
// (a mistyped or stale /hjerte/<id>/ link, the editor's ?from=<id>) must not
// cost a request that can only come back 404.
describe('loadStaticHeartById', () => {
	afterEach(() => vi.unstubAllGlobals());

	it('asks for nothing when the id is not a gallery heart', async () => {
		const fetch = vi.fn();
		vi.stubGlobal('fetch', fetch);
		expect(await loadStaticHeartById('nope')).toBeNull();
		expect(fetch).not.toHaveBeenCalled();
	});

	it("fetches a gallery heart's SVG", async () => {
		const fetch = vi.fn(async () => new Response('', { status: 404 }));
		vi.stubGlobal('fetch', fetch);
		await loadStaticHeartById('jul');
		expect(fetch).toHaveBeenCalledWith('/hearts/jul.svg');
	});
});
