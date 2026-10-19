/**
 * The header's three colour buttons: red and white (and its flip), the
 * colourful shuffle, and the dialog behind "Egne farver".
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$app/environment', () => ({ browser: true, dev: false }));

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

const cleanup: (() => void)[] = [];
afterEach(() => {
	for (const dispose of cleanup.splice(0)) dispose();
	delete (window as { gtag?: unknown }).gtag;
});

beforeEach(() => {
	const storage = memoryStorage();
	Object.defineProperty(window, 'localStorage', { configurable: true, get: () => storage });
	document.documentElement.className = '';
});

async function render() {
	vi.resetModules();
	const colors = await import('$lib/stores/colors');
	const mode = await import('$lib/stores/colorMode');
	const { default: ColorControls } = await import('./ColorControls.svelte');
	// The same Svelte instance as the freshly imported component.
	const { flushSync, mount, tick, unmount } = await import('svelte');
	const gtag = vi.fn();
	window.gtag = gtag;
	const target = document.createElement('div');
	document.body.appendChild(target);
	const component = mount(ColorControls, { target, props: { lang: 'da', variant: 'bar' } });
	cleanup.push(() => {
		unmount(component);
		target.remove();
	});
	flushSync();
	const button = (name: string) => target.querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`)!;
	const click = async (el: HTMLElement) => {
		el.click();
		flushSync();
		await tick();
	};
	const events = () => gtag.mock.calls.map((c) => [c[1], c[2]]);
	return { target, colors, mode, button, click, events, flushSync, tick };
}

describe('ColorControls', () => {
	it('shows three named round buttons', async () => {
		const { target } = await render();
		const names = [...target.querySelectorAll('button')].map((b) => b.getAttribute('aria-label'));
		expect(names).toEqual(['Rød og hvid', 'Farverig', 'Egne farver']);
		expect(target.querySelector('button[aria-label="Rød og hvid"]')!.getAttribute('aria-pressed')).toBe('true');
		expect(target.querySelector('button[aria-label="Egne farver"]')!.getAttribute('aria-haspopup')).toBe('dialog');
	});

	it('red and white: pressed again it swaps the sides, back and forth', async () => {
		const { colors, button, click } = await render();
		await click(button('Rød og hvid'));
		expect(colors.paperKind(colors.getColors())).toBe('flipped');
		await click(button('Rød og hvid'));
		expect(colors.paperKind(colors.getColors())).toBe('classic');
	});

	it('red and white: from a custom pair or the colourful mode, it puts the classic pair on first', async () => {
		const { colors, mode, button, click, events, flushSync } = await render();
		colors.setColors({ left: '#123456', right: '#abcdef' });
		mode.shuffleColorMode();
		flushSync();
		expect(button('Rød og hvid').getAttribute('aria-pressed')).toBe('false');
		await click(button('Rød og hvid'));
		expect(mode.getColorMode()).toBe(false);
		expect(colors.paperKind(colors.getColors())).toBe('classic');
		expect(button('Rød og hvid').getAttribute('aria-pressed')).toBe('true');
		expect(events()).toContainEqual(['paper_colors', { source: 'classic' }]);
		expect(events()).toContainEqual(['color_mode', { on: false }]);
		// Now it flips.
		await click(button('Rød og hvid'));
		expect(colors.paperKind(colors.getColors())).toBe('flipped');
		expect(events()).toContainEqual(['paper_colors', { source: 'flip' }]);
	});

	it('colourful: every press is a new shuffle, and it stays on', async () => {
		const { mode, button, click, events } = await render();
		await click(button('Farverig'));
		const first = mode.getPermutation();
		await click(button('Farverig'));
		expect(mode.getColorMode()).toBe(true);
		expect(mode.getPermutation()).not.toEqual(first);
		expect(button('Farverig').getAttribute('aria-pressed')).toBe('true');
		expect(events()).toEqual([
			['color_mode', { on: true, shuffle: 1 }],
			['color_mode', { on: true, shuffle: 2 }]
		]);
	});

	it('custom: the dialog opens, a ready-made pair applies at once and turns the colourful mode off', async () => {
		const { colors, mode, button, click, events } = await render();
		mode.shuffleColorMode();
		await click(button('Egne farver'));
		const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
		expect(dialog).not.toBeNull();
		expect(dialog.querySelectorAll('input[type="color"]')).toHaveLength(2);
		const presets = dialog.querySelectorAll<HTMLButtonElement>('.preset');
		expect(presets).toHaveLength(12);
		await click(dialog.querySelector<HTMLButtonElement>('button[aria-label="Nat og guld"]')!);
		expect(mode.getColorMode()).toBe(false);
		expect(colors.getColors()).toEqual({ left: '#dcb55e', right: '#22385c' });
		expect(colors.paperKind(colors.getColors())).toBe('custom');
		expect(dialog.querySelector('button[aria-label="Nat og guld"]')!.getAttribute('aria-pressed')).toBe('true');
		expect(events()).toContainEqual(['paper_colors', { source: 'preset' }]);
		// Still open: picking does not close it.
		expect(document.querySelector('[role="dialog"]')).not.toBeNull();
	});

	it('custom: a picked colour applies live; Færdig closes and gives focus back', async () => {
		const { colors, button, click, flushSync, tick } = await render();
		await click(button('Egne farver'));
		const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
		const right = dialog.querySelectorAll<HTMLInputElement>('input[type="color"]')[1]!;
		right.value = '#2244aa';
		right.dispatchEvent(new Event('input', { bubbles: true }));
		flushSync();
		expect(colors.getColors().right).toBe('#2244aa');
		const done = [...dialog.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Færdig')!;
		await click(done);
		await tick();
		expect(document.querySelector('[role="dialog"]')).toBeNull();
		expect(document.activeElement).toBe(button('Egne farver'));
	});

	it("custom: the visitor's pair is kept through red and white and the colourful mode, and Færdig puts it back", async () => {
		const { colors, mode, button, click, events } = await render();
		await click(button('Egne farver'));
		let dialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
		await click(dialog.querySelector<HTMLButtonElement>('button[aria-label="Lyng og lys rosa"]')!);
		const done = () => [...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].find((b) => b.textContent?.trim() === 'Færdig')!;
		await click(done());
		const mine = { left: '#efdfe6', right: '#7d5a7e' };
		expect(colors.getCustomColors()).toEqual(mine);

		// Away to red and white, then the colourful mode: the saved pair stays.
		await click(button('Rød og hvid'));
		expect(colors.paperKind(colors.getColors())).toBe('classic');
		await click(button('Farverig'));
		expect(mode.getColorMode()).toBe(true);
		expect(colors.getCustomColors()).toEqual(mine);

		// The dialog opens on the saved pair, not on what is on show ...
		await click(button('Egne farver'));
		dialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
		expect(dialog.querySelector('button[aria-label="Lyng og lys rosa"]')!.getAttribute('aria-pressed')).toBe('true');
		expect(dialog.querySelector<HTMLInputElement>('input[type="color"]')!.value).toBe('#efdfe6');
		// ... and Færdig, with nothing changed, puts it on.
		await click(done());
		expect(document.querySelector('[role="dialog"]')).toBeNull();
		expect(mode.getColorMode()).toBe(false);
		expect(colors.getColors()).toEqual(mine);
		expect(events()).toContainEqual(['paper_colors', { source: 'saved' }]);
	});

	it('custom: Escape with nothing changed leaves the pair on show alone', async () => {
		const { colors, mode, button, click, flushSync, tick } = await render();
		colors.setCustomColors({ left: '#dcb55e', right: '#22385c' });
		mode.shuffleColorMode();
		await click(button('Egne farver'));
		const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
		dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		flushSync();
		await tick();
		expect(document.querySelector('[role="dialog"]')).toBeNull();
		expect(mode.getColorMode()).toBe(true);
		expect(colors.paperKind(colors.getColors())).toBe('classic');
	});

	it('custom: before there is a saved pair, the dialog starts from the pair on show', async () => {
		const { colors, button, click } = await render();
		expect(colors.getCustomColors()).toBeNull();
		colors.flipColors();
		await click(button('Egne farver'));
		const input = document.querySelector<HTMLInputElement>('[role="dialog"] input[type="color"]')!;
		expect(input.value).toBe('#b91313');
	});

	it("colourful: the button's four cells follow the shuffle", async () => {
		const { target, mode, button, click } = await render();
		const { PALETTE, iconPairs } = await import('$lib/utils/palette');
		const cells = [...target.querySelectorAll('button[aria-label="Farverig"] rect')];
		expect(cells.map((c) => c.getAttribute('class')!.split(' ')[0])).toEqual(['cell-0', 'cell-1', 'cell-2', 'cell-3']);
		const shown = () => [0, 1, 2, 3].map((k) => document.documentElement.style.getPropertyValue(`--pal-icon-${k}`));
		await click(button('Farverig'));
		expect(shown()).toEqual(iconPairs(mode.getPermutation()!).map((i) => PALETTE[i].right));
		await click(button('Farverig'));
		expect(shown()).toEqual(iconPairs(mode.getPermutation()!).map((i) => PALETTE[i].right));
	});
});
