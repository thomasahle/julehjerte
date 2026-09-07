import { describe, it, expect } from 'vitest';
import { PANEL_COLLAPSED_KEY, readPanelCollapsed, writePanelCollapsed } from './panelState';

/** A minimal in-memory Storage. */
function fakeStorage(initial: Record<string, string> = {}): Storage {
	const map = new Map(Object.entries(initial));
	return {
		get length() {
			return map.size;
		},
		clear: () => map.clear(),
		getItem: (k: string) => map.get(k) ?? null,
		key: (i: number) => [...map.keys()][i] ?? null,
		removeItem: (k: string) => void map.delete(k),
		setItem: (k: string, v: string) => void map.set(k, v)
	};
}

/** Storage that throws on every access, like a browser blocking site data. */
function throwingStorage(): Storage {
	const boom = () => {
		throw new DOMException('denied', 'SecurityError');
	};
	return {
		get length(): number {
			return boom();
		},
		clear: boom,
		getItem: boom,
		key: boom,
		removeItem: boom,
		setItem: boom
	} as unknown as Storage;
}

describe('readPanelCollapsed', () => {
	it('defaults to open when nothing has been stored', () => {
		expect(readPanelCollapsed(fakeStorage())).toBe(false);
	});

	it('reads back a collapsed panel', () => {
		expect(readPanelCollapsed(fakeStorage({ [PANEL_COLLAPSED_KEY]: '1' }))).toBe(true);
	});

	it('reads back an open panel', () => {
		expect(readPanelCollapsed(fakeStorage({ [PANEL_COLLAPSED_KEY]: '0' }))).toBe(false);
	});

	it('treats any other stored value as open, rather than as truthy', () => {
		expect(readPanelCollapsed(fakeStorage({ [PANEL_COLLAPSED_KEY]: 'true' }))).toBe(false);
		expect(readPanelCollapsed(fakeStorage({ [PANEL_COLLAPSED_KEY]: '' }))).toBe(false);
	});

	it('stays open when storage throws', () => {
		expect(readPanelCollapsed(throwingStorage())).toBe(false);
	});

	it('stays open when there is no storage at all (server render)', () => {
		expect(readPanelCollapsed(null)).toBe(false);
	});
});

describe('writePanelCollapsed', () => {
	it('round-trips through storage', () => {
		const storage = fakeStorage();
		writePanelCollapsed(true, storage);
		expect(storage.getItem(PANEL_COLLAPSED_KEY)).toBe('1');
		expect(readPanelCollapsed(storage)).toBe(true);

		writePanelCollapsed(false, storage);
		expect(storage.getItem(PANEL_COLLAPSED_KEY)).toBe('0');
		expect(readPanelCollapsed(storage)).toBe(false);
	});

	it('does not throw when storage does', () => {
		expect(() => writePanelCollapsed(true, throwingStorage())).not.toThrow();
		expect(() => writePanelCollapsed(true, null)).not.toThrow();
	});
});
