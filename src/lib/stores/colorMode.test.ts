import { beforeEach, describe, expect, it, vi } from 'vitest';

// The store only touches storage and the document in the browser.
vi.mock('$app/environment', () => ({ browser: true }));

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

function installStorage(storage: Storage) {
	Object.defineProperty(window, 'localStorage', { configurable: true, get: () => storage });
}

function blockLocalStorage() {
	Object.defineProperty(window, 'localStorage', {
		configurable: true,
		get() {
			throw new DOMException('Access is denied for this document.', 'SecurityError');
		}
	});
}

async function freshStore() {
	vi.resetModules();
	return import('./colorMode');
}

const root = () => document.documentElement;

beforeEach(() => {
	installStorage(memoryStorage());
	root().className = '';
});

describe('colourful mode store', () => {
	it('is off until it has been turned on', async () => {
		const store = await freshStore();
		expect(store.getColorMode()).toBe(false);
	});

	it('remembers being on, under juleflet:', async () => {
		const store = await freshStore();
		store.setColorMode(true);
		expect(store.COLOR_MODE_STORAGE_KEY.startsWith('juleflet:')).toBe(true);
		expect(window.localStorage.getItem(store.COLOR_MODE_STORAGE_KEY)).toBe('1');
		expect(root().classList.contains('colorful')).toBe(true);

		const reloaded = await freshStore();
		expect(reloaded.getColorMode()).toBe(true);

		reloaded.setColorMode(false);
		expect(window.localStorage.getItem(store.COLOR_MODE_STORAGE_KEY)).toBeNull();
		expect(root().classList.contains('colorful')).toBe(false);
		expect((await freshStore()).getColorMode()).toBe(false);
	});

	it('tells its subscribers, until they leave', async () => {
		const store = await freshStore();
		const seen: boolean[] = [];
		const leave = store.subscribeColorMode((on) => seen.push(on));
		store.setColorMode(true);
		store.setColorMode(false);
		leave();
		store.setColorMode(true);
		expect(seen).toEqual([true, false]);
	});

	it('still switches, for the page view, with storage blocked', async () => {
		blockLocalStorage();
		const store = await freshStore();
		expect(store.getColorMode()).toBe(false);
		expect(() => store.setColorMode(true)).not.toThrow();
		expect(store.getColorMode()).toBe(true);
		expect(root().classList.contains('colorful')).toBe(true);
	});
});

describe("the head's inline script", () => {
	const run = async () => {
		const store = await freshStore();
		(0, eval)(store.colorModeHeadSource());
		return store;
	};

	it('puts the class on <html> when the mode was left on', async () => {
		window.localStorage.setItem('juleflet:colourful', '1');
		await run();
		expect(root().classList.contains('colorful')).toBe(true);
	});

	it('leaves it off otherwise', async () => {
		await run();
		expect(root().classList.contains('colorful')).toBe(false);
		window.localStorage.setItem('juleflet:colourful', 'yes');
		await run();
		expect(root().classList.contains('colorful')).toBe(false);
	});

	it('does not throw with storage blocked', async () => {
		blockLocalStorage();
		await expect(run()).resolves.toBeDefined();
		expect(root().classList.contains('colorful')).toBe(false);
	});

	it('agrees with the store on the key and the class', async () => {
		const store = await freshStore();
		const script = store.colorModeHeadScript();
		expect(script).toBe(`<script>${store.colorModeHeadSource()}</script>`);
		expect(script).toContain(JSON.stringify(store.COLOR_MODE_STORAGE_KEY));
		expect(script).toContain(JSON.stringify(store.COLOR_MODE_CLASS));
	});
});
