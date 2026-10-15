/**
 * The tracing mode's behaviour in a DOM: the analytics event per opening, what
 * locking does to the page, and the two ways out of a lock — a hold of the full
 * two seconds on the corner button, or Escape. The arithmetic behind sizing is
 * covered by $lib/utils/trace.test.ts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, tick, unmount } from 'svelte';
import TraceModeFixture from './TraceModeFixture.svelte';
import type { HeartDesign } from '$lib/types/heart';
import { trackHeartTrace } from '$lib/analytics';

vi.mock('$lib/analytics', () => ({ trackHeartTrace: vi.fn() }));

const design: HeartDesign = {
	id: 'test-heart',
	name: 'Prøvehjerte',
	author: '',
	gridSize: { x: 3, y: 3 },
	fingers: []
};

const cleanup: (() => void)[] = [];

/** A fresh in-memory localStorage per test: Node's own half-built one shadows jsdom's. */
function memoryStorage(): Storage {
	const items = new Map<string, string>();
	return {
		get length() {
			return items.size;
		},
		clear: () => items.clear(),
		getItem: (key) => items.get(key) ?? null,
		key: (i) => [...items.keys()][i] ?? null,
		removeItem: (key) => void items.delete(key),
		setItem: (key, value) => void items.set(key, String(value))
	};
}

beforeEach(() => {
	vi.useFakeTimers();
	vi.mocked(trackHeartTrace).mockClear();
	vi.stubGlobal('localStorage', memoryStorage());
});

afterEach(() => {
	for (const dispose of cleanup.splice(0)) dispose();
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

async function settle(): Promise<void> {
	flushSync();
	await tick();
	flushSync();
}

async function render() {
	const target = document.createElement('div');
	document.body.appendChild(target);
	const component = mount(TraceModeFixture, { target, props: { design } });
	cleanup.push(() => {
		unmount(component);
		target.remove();
	});
	await settle();
	const q = <T extends Element>(selector: string) => target.querySelector<T>(selector);
	const button = (label: string) =>
		[...target.querySelectorAll<HTMLButtonElement>('button')].find(
			(b) => b.textContent?.trim() === label || b.getAttribute('aria-label') === label
		);
	return {
		target,
		q,
		button,
		dialog: () => q<HTMLElement>('[role="dialog"]'),
		toolbar: () => q<HTMLElement>('.toolbar'),
		lockLayer: () => q<HTMLElement>('[data-testid="trace-lock-layer"]'),
		unlock: () => button('Lås op')!,
		async lock() {
			button('Lås skærmen')!.click();
			await settle();
		}
	};
}

function pointer(type: string, el: Element): void {
	el.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 1, isPrimary: true }));
}

function escape(): void {
	window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
}

describe('TraceMode', () => {
	it('sends one trace_heart per opening', async () => {
		const view = await render();
		expect(view.dialog()).not.toBeNull();
		expect(trackHeartTrace).toHaveBeenCalledTimes(1);
		expect(trackHeartTrace).toHaveBeenCalledWith('test-heart', 'Prøvehjerte');

		// Sizing the template re-renders the mode; it is still the same opening.
		const slider = view.q<HTMLInputElement>('input[type="range"]')!;
		slider.value = '120';
		slider.dispatchEvent(new Event('input', { bubbles: true }));
		await settle();
		expect(trackHeartTrace).toHaveBeenCalledTimes(1);

		escape();
		await settle();
		expect(view.dialog()).toBeNull();
		view.button('reopen')!.click();
		await settle();
		expect(view.dialog()).not.toBeNull();
		expect(trackHeartTrace).toHaveBeenCalledTimes(2);
	});

	it('locks: the toolbar goes, the overlay comes and <html> gets `tracing`', async () => {
		const view = await render();
		expect(document.documentElement.classList.contains('tracing')).toBe(false);
		await view.lock();
		expect(document.documentElement.classList.contains('tracing')).toBe(true);
		expect(view.lockLayer()).not.toBeNull();
		expect(view.toolbar()).toBeNull();
		expect(view.q('[aria-live="polite"]')!.textContent).toContain('Skærmen er låst');
		// Escape locked must not close the mode, only unlock it.
		expect(view.button('Luk')).toBeUndefined();
	});

	it('does not unlock on a 500 ms hold', async () => {
		const view = await render();
		await view.lock();
		pointer('pointerdown', view.unlock());
		vi.advanceTimersByTime(500);
		pointer('pointerup', view.unlock());
		vi.advanceTimersByTime(3000);
		await settle();
		expect(view.lockLayer()).not.toBeNull();
		expect(view.toolbar()).toBeNull();
	});

	it('does not unlock when the finger slides off the button', async () => {
		const view = await render();
		await view.lock();
		pointer('pointerdown', view.unlock());
		vi.advanceTimersByTime(1500);
		pointer('pointerleave', view.unlock());
		vi.advanceTimersByTime(1000);
		await settle();
		expect(view.lockLayer()).not.toBeNull();
	});

	it('unlocks after a 2000 ms hold', async () => {
		const view = await render();
		await view.lock();
		pointer('pointerdown', view.unlock());
		vi.advanceTimersByTime(1999);
		await settle();
		expect(view.lockLayer()).not.toBeNull();
		vi.advanceTimersByTime(1);
		await settle();
		expect(view.lockLayer()).toBeNull();
		expect(view.toolbar()).not.toBeNull();
		expect(document.documentElement.classList.contains('tracing')).toBe(false);
		expect(view.q('[aria-live="polite"]')!.textContent).toContain('låst op');
	});

	it('unlocks on Escape, and a second Escape closes', async () => {
		const view = await render();
		await view.lock();
		escape();
		await settle();
		expect(view.lockLayer()).toBeNull();
		expect(view.toolbar()).not.toBeNull();
		expect(view.dialog()).not.toBeNull();
		escape();
		await settle();
		expect(view.dialog()).toBeNull();
	});

	it('swallows touches on the overlay', async () => {
		const view = await render();
		await view.lock();
		const move = new Event('touchmove', { bubbles: true, cancelable: true });
		view.lockLayer()!.dispatchEvent(move);
		expect(move.defaultPrevented).toBe(true);
	});

	it('remembers the width it was locked at', async () => {
		const view = await render();
		const slider = view.q<HTMLInputElement>('input[type="range"]')!;
		slider.value = '120';
		slider.dispatchEvent(new Event('input', { bubbles: true }));
		await settle();
		await view.lock();
		expect(JSON.parse(window.localStorage.getItem('juleflet:trace')!)).toEqual({ widthMm: 120 });
	});
});
