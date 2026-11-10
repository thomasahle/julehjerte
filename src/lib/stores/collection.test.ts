import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { normalizeHeartDesign } from '$lib/utils/heartDesign';
import { DESIGN_JSON, TILE_JSON } from '$lib/utils/fixtures/storedForms';
import { USER_COLLECTION_KEY, decodeCollection, deleteUserDesign, getUserCollection, loadStaticHeartById, saveUserDesign } from './collection';

// The collection only touches storage in the browser.
vi.mock('$app/environment', () => ({ browser: true }));

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

/** A minimal in-memory Storage (Node's own global localStorage is unusable here). */
function memoryStorage(): Storage {
	const map = new Map<string, string>();
	return {
		get length() {
			return map.size;
		},
		clear: () => map.clear(),
		getItem: (k: string) => map.get(k) ?? null,
		key: (i: number) => [...map.keys()][i] ?? null,
		removeItem: (k: string) => void map.delete(k),
		setItem: (k: string, v: string) => void map.set(k, String(v))
	};
}

// What a browser holds in "Mine hjerter" today must keep opening, and a save
// must not lose what it cannot read: the front page's inline script counts
// the hearts in the same array, and a newer tab may have written there.
describe('the stored collection', () => {
	let storage: Storage;
	beforeEach(() => {
		storage = memoryStorage();
		Object.defineProperty(window, 'localStorage', { configurable: true, get: () => storage });
	});
	const heart = (json: string) => normalizeHeartDesign(JSON.parse(json))!;
	const stored = () => storage.getItem(USER_COLLECTION_KEY);
	/** A heart's JSON from before versioning, as the site writes it now. */
	const versioned = (json: string) => '{"v":1,' + json.slice(1);

	it('is written as the site wrote it on 10 Nov 2026, each heart with its version', () => {
		saveUserDesign(heart(DESIGN_JSON));
		expect(stored()).toBe(`[${versioned(DESIGN_JSON)}]`);
		saveUserDesign(heart(TILE_JSON));
		expect(stored()).toBe(`[${versioned(DESIGN_JSON)},${versioned(TILE_JSON)}]`);
		// Saving a heart again replaces it where it is.
		saveUserDesign({ ...heart(DESIGN_JSON), name: 'Til mor' });
		expect(JSON.parse(stored()!).map((d: { name: string }) => d.name)).toEqual(['Til mor', 'Fisk']);
	});

	it('reads what the site wrote, before versioning and since', () => {
		storage.setItem(USER_COLLECTION_KEY, `[${DESIGN_JSON},${TILE_JSON}]`);
		expect(getUserCollection().map((d) => [d.id, d.name])).toEqual([
			['user-5b0c9a7e', 'Mit hjerte'],
			['user-escher', 'Fisk']
		]);
		saveUserDesign(heart(DESIGN_JSON));
		expect(getUserCollection()).toEqual([heart(DESIGN_JSON), heart(TILE_JSON)]);
		expect(decodeCollection(JSON.parse(stored()!))).toEqual([heart(DESIGN_JSON), heart(TILE_JSON)]);
	});

	it('leaves out a heart a later site wrote, as it does what is no heart, but keeps it stored', () => {
		const later = JSON.stringify({ ...JSON.parse(DESIGN_JSON), v: 2, id: 'later' });
		storage.setItem(USER_COLLECTION_KEY, `[${later},${TILE_JSON}]`);
		expect(getUserCollection().map((d) => d.id)).toEqual(['user-escher']);
		saveUserDesign(heart(DESIGN_JSON));
		deleteUserDesign('user-escher');
		expect(stored()).toBe(`[${later},${versioned(DESIGN_JSON)}]`);
	});

	it('reads past fields it does not know, such as a version', () => {
		storage.setItem(USER_COLLECTION_KEY, JSON.stringify([{ v: 1, ...JSON.parse(DESIGN_JSON), later: true }]));
		expect(getUserCollection()).toEqual([heart(DESIGN_JSON)]);
	});

	it('leaves out what is not a heart, and reads an empty object as a blank one', () => {
		storage.setItem(USER_COLLECTION_KEY, `[null,42,"heart",${DESIGN_JSON},{}]`);
		expect(getUserCollection().map((d) => [d.id, d.name])).toEqual([
			['user-5b0c9a7e', 'Mit hjerte'],
			['', 'Untitled']
		]);
		// Nor is anything stored that is no array of them.
		for (const junk of ['{"0":' + DESIGN_JSON + '}', '"hearts"', 'not json [', '']) {
			storage.setItem(USER_COLLECTION_KEY, junk);
			expect(getUserCollection(), junk).toEqual([]);
		}
	});

	it('keeps what it cannot read when it saves or deletes', () => {
		storage.setItem(USER_COLLECTION_KEY, `[42,{"id":"other","fingers":"later"},${TILE_JSON}]`);
		saveUserDesign(heart(DESIGN_JSON));
		expect(stored()).toBe(`[42,{"id":"other","fingers":"later"},${TILE_JSON},${versioned(DESIGN_JSON)}]`);
		deleteUserDesign('user-escher');
		expect(stored()).toBe(`[42,{"id":"other","fingers":"later"},${versioned(DESIGN_JSON)}]`);
		// What is stored is no array: a save starts one.
		storage.setItem(USER_COLLECTION_KEY, '{"hearts":[]}');
		saveUserDesign(heart(DESIGN_JSON));
		expect(stored()).toBe(`[${versioned(DESIGN_JSON)}]`);
	});

	it('tells the caller a save failed', () => {
		storage.setItem = () => {
			throw new DOMException('full', 'QuotaExceededError');
		};
		expect(() => saveUserDesign(heart(DESIGN_JSON))).toThrow('full');
		// A delete fails silently.
		expect(() => deleteUserDesign('user-5b0c9a7e')).not.toThrow();
	});
});
