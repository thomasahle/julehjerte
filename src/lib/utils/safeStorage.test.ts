import { beforeEach, describe, expect, it } from 'vitest';
import { getLocalStorage, readStorage, removeStorage, writeStorage } from './safeStorage';

/** A Storage whose every method throws, as a full or blocked store does. */
function throwingStorage(name = 'SecurityError'): Storage {
	const fail = () => {
		throw new DOMException('The operation is insecure.', name);
	};
	return {
		get length() {
			return fail();
		},
		clear: fail,
		getItem: fail,
		key: fail,
		removeItem: fail,
		setItem: fail
	} as unknown as Storage;
}

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

/** Makes reading `window.localStorage` itself throw, as Chrome's "Block all cookies" does. */
function blockLocalStorage() {
	Object.defineProperty(window, 'localStorage', {
		configurable: true,
		get() {
			throw new DOMException('Access is denied for this document.', 'SecurityError');
		}
	});
}

let storage: Storage;
beforeEach(() => {
	storage = memoryStorage();
	installStorage(storage);
});

describe('safeStorage', () => {
	it('reads, writes and removes through working storage', () => {
		expect(writeStorage('k', 'v')).toBe(true);
		expect(readStorage('k')).toBe('v');
		expect(removeStorage('k')).toBe(true);
		expect(readStorage('k')).toBeNull();
	});

	it('degrades to null/false when every method throws', () => {
		const storage = throwingStorage();
		expect(readStorage('k', storage)).toBeNull();
		expect(writeStorage('k', 'v', storage)).toBe(false);
		expect(removeStorage('k', storage)).toBe(false);
		expect(writeStorage('k', 'v', throwingStorage('QuotaExceededError'))).toBe(false);
	});

	it('degrades when even the localStorage getter throws', () => {
		blockLocalStorage();
		expect(() => window.localStorage).toThrow();
		expect(getLocalStorage()).toBeNull();
		expect(readStorage('k')).toBeNull();
		expect(writeStorage('k', 'v')).toBe(false);
		expect(removeStorage('k')).toBe(false);
	});
});
