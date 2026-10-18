import { beforeEach, describe, expect, it, vi } from 'vitest';

// The store only touches storage in the browser.
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
	return import('./colors');
}

let storage: Storage;
beforeEach(() => {
	storage = memoryStorage();
	installStorage(storage);
});

describe('colour store', () => {
	it('loads and saves through localStorage', async () => {
		window.localStorage.setItem('julehjerte-colors', JSON.stringify({ left: '#00aa00', right: '#ffffff' }));
		const store = await freshStore();
		expect(store.getColors()).toEqual({ left: '#00aa00', right: '#ffffff' });
		store.setColors({ left: '#123456', right: '#654321' });
		expect(JSON.parse(window.localStorage.getItem('julehjerte-colors')!)).toEqual({
			left: '#123456',
			right: '#654321'
		});
	});

	it('ignores stored values that are not a colour pair', async () => {
		window.localStorage.setItem('julehjerte-colors', JSON.stringify({ left: 3, right: null }));
		const store = await freshStore();
		expect(store.getColors()).toEqual(store.DEFAULT_COLORS);
	});

	describe('with storage blocked', () => {
		beforeEach(blockLocalStorage);

		it('starts from the defaults without throwing', async () => {
			const store = await freshStore();
			expect(() => store.getColors()).not.toThrow();
			expect(store.getColors()).toEqual(store.DEFAULT_COLORS);
		});

		it('still changes, swaps and notifies in memory', async () => {
			const store = await freshStore();
			const seen: unknown[] = [];
			store.subscribeColors((c) => seen.push(c));
			expect(() => store.setLeftColor('#00aa00')).not.toThrow();
			expect(store.getColors()).toEqual({ left: '#00aa00', right: store.DEFAULT_COLORS.right });
			expect(() => store.flipColors()).not.toThrow();
			expect(store.getColors()).toEqual({ left: store.DEFAULT_COLORS.right, right: '#00aa00' });
			expect(seen).toHaveLength(2);
		});
	});

	it('keeps working when setItem throws (storage full)', async () => {
		const store = await freshStore();
		storage.setItem = () => {
			throw new DOMException('full', 'QuotaExceededError');
		};
		expect(() => store.setColors({ left: '#111111', right: '#222222' })).not.toThrow();
		expect(store.getColors()).toEqual({ left: '#111111', right: '#222222' });
	});
});
