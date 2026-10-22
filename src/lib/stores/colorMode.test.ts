import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IDENTITY, PALETTE, paletteVariables } from '$lib/utils/palette';

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
const KEY = 'juleflet:colourful';

/** The --pal-* variables on <html>, by name. */
function rootVariables(): Record<string, string> {
	const out: Record<string, string> = {};
	for (let i = 0; i < root().style.length; i++) {
		const name = root().style.item(i);
		if (name.startsWith('--pal-')) out[name] = root().style.getPropertyValue(name).trim();
	}
	return out;
}

beforeEach(() => {
	installStorage(memoryStorage());
	root().className = '';
	root().removeAttribute('style');
});

describe('colourful mode store', () => {
	it('greets a first visit with a shuffle of its own', async () => {
		const store = await freshStore();
		expect(store.getColorMode()).toBe(true);
		expect(store.getPermutation()).toHaveLength(PALETTE.length);
		expect(root().classList.contains('colorful')).toBe(true);
		expect(window.localStorage.getItem(KEY)).toBe(store.getPermutation()!.join(','));
	});

	it('leaves a pair chosen before the mode was the default on show', async () => {
		window.localStorage.setItem('julehjerte-colors', JSON.stringify({ left: '#ffffff', right: '#b91313' }));
		const store = await freshStore();
		expect(store.getColorMode()).toBe(false);
		expect(store.getPermutation()).toBeNull();
		expect(window.localStorage.getItem(KEY)).toBeNull();
	});

	it('deals a new shuffle on every press, and remembers the last, under juleflet:', async () => {
		const store = await freshStore();
		expect(store.COLOR_MODE_STORAGE_KEY).toBe(KEY);
		const first = store.shuffleColorMode();
		const second = store.shuffleColorMode();
		expect(second).not.toEqual(first);
		expect(window.localStorage.getItem(KEY)).toBe(second.join(','));
		expect(root().classList.contains('colorful')).toBe(true);
		expect(rootVariables()).toEqual(paletteVariables(second));

		const reloaded = await freshStore();
		expect(reloaded.getColorMode()).toBe(true);
		expect(reloaded.getPermutation()).toEqual(second);

		reloaded.turnOffColorMode();
		expect(window.localStorage.getItem(KEY)).toBe('0');
		expect(root().classList.contains('colorful')).toBe(false);
		expect((await freshStore()).getColorMode()).toBe(false);
	});

	it('reads the first version\'s "1" as the unshuffled palette, and junk as off', async () => {
		const store = await freshStore();
		expect(store.parseStoredPermutation('1')).toEqual(IDENTITY);
		expect(store.parseStoredPermutation(null)).toBeNull();
		expect(store.parseStoredPermutation('0')).toBeNull();
		expect(store.parseStoredPermutation('')).toBeNull();
		expect(store.parseStoredPermutation('0,1,2')).toBeNull();
		expect(store.parseStoredPermutation([...IDENTITY.slice(1), 1].join(','))).toBeNull();
		expect(store.parseStoredPermutation([...IDENTITY].reverse().join(','))).toEqual([...IDENTITY].reverse());
	});

	it('tells its subscribers, until they leave', async () => {
		window.localStorage.setItem(KEY, '0');
		const store = await freshStore();
		const seen: boolean[] = [];
		const leave = store.subscribeColorMode((on) => seen.push(on));
		store.shuffleColorMode();
		store.turnOffColorMode();
		leave();
		store.shuffleColorMode();
		expect(seen).toEqual([true, false]);
	});

	it("deals a canvas's heart the shuffle's first pair, and the site's pair again when off", async () => {
		const store = await freshStore();
		const colors = await import('./colors');
		colors.setColors({ left: '#ffffff', right: '#c8102e' });
		const seen: { left: string; right: string }[] = [];
		const leave = store.subscribeShownColors((pair) => seen.push(pair));
		expect(store.shownColors()).toEqual({ left: '#ffffff', right: '#c8102e' });
		const first = store.shuffleColorMode();
		const second = store.shuffleColorMode();
		store.turnOffColorMode();
		leave();
		store.shuffleColorMode();
		const pair = (index: number) => ({ left: PALETTE[index].left, right: PALETTE[index].right });
		expect(seen).toEqual([pair(first[0]), pair(second[0]), { left: '#ffffff', right: '#c8102e' }]);
	});

	it('still shuffles, for the page view, with storage blocked', async () => {
		blockLocalStorage();
		const store = await freshStore();
		expect(store.getColorMode()).toBe(true);
		expect(root().classList.contains('colorful')).toBe(true);
		store.turnOffColorMode();
		expect(store.getColorMode()).toBe(false);
		expect(() => store.shuffleColorMode()).not.toThrow();
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

	it('reproduces the stored shuffle before the body paints', async () => {
		const store = await freshStore();
		const permutations = [store.shuffleColorMode(), [...IDENTITY].reverse(), [...IDENTITY]];
		for (const p of permutations) {
			root().className = '';
			root().removeAttribute('style');
			window.localStorage.setItem(KEY, p.join(','));
			await run();
			expect(root().classList.contains('colorful')).toBe(true);
			expect(rootVariables()).toEqual(paletteVariables(p));
		}
	});

	it('reads "1" as the unshuffled palette', async () => {
		window.localStorage.setItem(KEY, '1');
		await run();
		expect(root().classList.contains('colorful')).toBe(true);
		expect(rootVariables()).toEqual(paletteVariables(IDENTITY));
	});

	it('deals a first visit a shuffle of its own, stores it, and the store reads it', async () => {
		const store = await run();
		expect(root().classList.contains('colorful')).toBe(true);
		const dealt = store.parseStoredPermutation(window.localStorage.getItem(KEY));
		expect(dealt).toHaveLength(PALETTE.length);
		expect(rootVariables()).toEqual(paletteVariables(dealt!));
		expect((await freshStore()).getPermutation()).toEqual(dealt);
	});

	it('leaves the mode off once turned off, after a pair was chosen before it was the default, or with nothing it can read', async () => {
		const cases: [string | null, string | null][] = [
			['0', null],
			[null, JSON.stringify({ left: '#ffffff', right: '#b91313' })],
			...['', 'yes', '0,1,2', [...IDENTITY.slice(1), 1].join(','), [...IDENTITY.slice(1), 99].join(',')].map((v): [string, null] => [v, null])
		];
		for (const [stored, pair] of cases) {
			root().className = '';
			root().removeAttribute('style');
			window.localStorage.clear();
			if (stored !== null) window.localStorage.setItem(KEY, stored);
			if (pair !== null) window.localStorage.setItem('julehjerte-colors', pair);
			await run();
			expect(root().classList.contains('colorful'), String(stored)).toBe(false);
			expect(rootVariables(), String(stored)).toEqual({});
			expect(window.localStorage.getItem(KEY), String(stored)).toBe(stored);
		}
	});

	it('does not throw with storage blocked', async () => {
		blockLocalStorage();
		await expect(run()).resolves.toBeDefined();
		expect(root().classList.contains('colorful')).toBe(false);
	});

	it('carries the whole palette', async () => {
		const store = await freshStore();
		const source = store.colorModeHeadSource();
		for (const pair of PALETTE) {
			expect(source).toContain(pair.left);
			expect(source).toContain(pair.right);
		}
		expect(store.colorModeHeadScript()).toBe(`<script>${source}</script>`);
	});

	it('puts the stored paper pair on <html>, with the class for its kind', async () => {
		const cases: [unknown, string | null][] = [
			[{ left: '#ffffff', right: 'rgb(185, 19, 19)' }, null],
			[{ left: '#b91313', right: '#fff' }, 'paper-flipped'],
			[{ left: '#dcb55e', right: '#22385c' }, 'paper-custom']
		];
		for (const [pair, cls] of cases) {
			root().className = '';
			root().removeAttribute('style');
			window.localStorage.setItem('julehjerte-colors', JSON.stringify(pair));
			await run();
			const { left, right } = pair as { left: string; right: string };
			expect(root().style.getPropertyValue('--paper-left')).toBe(left);
			expect(root().style.getPropertyValue('--paper-right')).toBe(right);
			expect([...root().classList].filter((c) => c === 'paper-flipped' || c === 'paper-custom')).toEqual(cls ? [cls] : []);
		}
	});

	it('agrees with paperKind on which class a pair gets', async () => {
		const { paperKind, PAPER_KIND_CLASSES } = await import('$lib/stores/colors');
		const pairs = [
			...PALETTE.map((p) => ({ left: p.left, right: p.right })),
			...PALETTE.map((p) => ({ left: p.right, right: p.left })),
			{ left: '#ffffff', right: '#b91313' },
			{ left: '#b91313', right: '#ffffff' },
			{ left: 'rgb(255, 255, 255)', right: 'rgb(185, 19, 19)' },
			{ left: '#FFF', right: '#B91313' }
		];
		for (const pair of pairs) {
			root().className = '';
			window.localStorage.setItem('julehjerte-colors', JSON.stringify(pair));
			await run();
			const kind = paperKind(pair);
			const expected = kind === 'classic' ? [] : [PAPER_KIND_CLASSES[kind]];
			expect([...root().classList].filter((c) => c === 'paper-flipped' || c === 'paper-custom'), JSON.stringify(pair)).toEqual(expected);
		}
	});

	it('ignores a stored pair it cannot read, and still reads the shuffle', async () => {
		window.localStorage.setItem('julehjerte-colors', '{not json');
		window.localStorage.setItem(KEY, '1');
		await run();
		expect(root().style.getPropertyValue('--paper-left')).toBe('');
		expect(root().classList.contains('colorful')).toBe(true);
	});

	it("puts the visitor's own pair on <html> for the custom button, saved or on show", async () => {
		window.localStorage.setItem('juleflet:custom-colors', JSON.stringify({ left: '#efdfe6', right: '#7d5a7e' }));
		window.localStorage.setItem('julehjerte-colors', JSON.stringify({ left: '#ffffff', right: '#b91313' }));
		await run();
		expect(root().style.getPropertyValue('--custom-left')).toBe('#efdfe6');
		expect(root().style.getPropertyValue('--custom-right')).toBe('#7d5a7e');
		expect(root().classList.contains('paper-has-custom')).toBe(true);

		root().className = '';
		root().removeAttribute('style');
		window.localStorage.removeItem('juleflet:custom-colors');
		window.localStorage.setItem('julehjerte-colors', JSON.stringify({ left: '#123456', right: '#abcdef' }));
		await run();
		expect(root().style.getPropertyValue('--custom-left')).toBe('#123456');
		expect(root().classList.contains('paper-has-custom')).toBe(true);

		root().className = '';
		root().removeAttribute('style');
		window.localStorage.setItem('julehjerte-colors', JSON.stringify({ left: '#b91313', right: '#ffffff' }));
		await run();
		expect(root().classList.contains('paper-has-custom')).toBe(false);
	});
});
