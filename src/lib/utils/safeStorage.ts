/**
 * localStorage (and sessionStorage) that cannot throw.
 *
 * With storage blocked (Chrome's "Block all cookies", some private modes) even
 * reading `window.localStorage` throws a SecurityError, and a full store throws
 * on write. Everything the site keeps there is a convenience — colours, the
 * tracing settings, a cached star count — so a failure must cost only the
 * memory, never the page. Code that has to tell the visitor a save failed (the
 * editor's "Gem") checks the boolean that the writers return, or calls
 * localStorage itself inside its own try.
 */

/** The browser's localStorage, or null where there is none or touching it throws. */
export function getLocalStorage(): Storage | null {
	try {
		if (typeof window === 'undefined') return null;
		return window.localStorage ?? null;
	} catch {
		return null;
	}
}

/** The tab's sessionStorage, or null where there is none or touching it throws. */
export function getSessionStorage(): Storage | null {
	try {
		if (typeof window === 'undefined') return null;
		return window.sessionStorage ?? null;
	} catch {
		return null;
	}
}

/** The stored string, or null when nothing is stored or storage fails. */
export function readStorage(key: string, storage: Storage | null = getLocalStorage()): string | null {
	try {
		return storage?.getItem(key) ?? null;
	} catch {
		return null;
	}
}

/** Stores the value; false when there is no storage or the write failed. */
export function writeStorage(key: string, value: string, storage: Storage | null = getLocalStorage()): boolean {
	if (!storage) return false;
	try {
		storage.setItem(key, value);
		return true;
	} catch {
		return false;
	}
}

/** Removes the key; false when there is no storage or the removal failed. */
export function removeStorage(key: string, storage: Storage | null = getLocalStorage()): boolean {
	if (!storage) return false;
	try {
		storage.removeItem(key);
		return true;
	} catch {
		return false;
	}
}
