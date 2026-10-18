/**
 * Back closes an overlay: the history bookkeeping, against jsdom's history,
 * with SvelteKit's pushState stood in for by one that writes the state where
 * SvelteKit does.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$app/navigation', () => ({
	pushState: (url: string, state: App.PageState) =>
		history.pushState({ 'sveltekit:states': state }, '', url || location.href)
}));

import { openOverlay, resetOverlayHistory, settleOverlayHistory } from './overlayHistory';

const nextPop = () => new Promise<void>((resolve) => window.addEventListener('popstate', () => resolve(), { once: true }));
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

beforeEach(() => {
	resetOverlayHistory();
	history.replaceState(null, '', '/hjerte/stjerne/');
});

afterEach(() => {
	resetOverlayHistory();
	vi.restoreAllMocks();
});

describe('openOverlay', () => {
	it('pushes one entry on the same URL', () => {
		const before = history.length;
		openOverlay('dialog', () => true);
		expect(history.length).toBe(before + 1);
		expect(location.pathname).toBe('/hjerte/stjerne/');
		expect(history.state['sveltekit:states']).toEqual({ overlay: 'dialog' });
	});

	it('closes the overlay on Back, once', async () => {
		const onBack = vi.fn(() => true);
		const release = openOverlay('dialog', onBack);
		const popped = nextPop();
		history.back();
		await popped;
		expect(onBack).toHaveBeenCalledTimes(1);
		// The overlay's own close after a Back does not go back again.
		const goSpy = vi.spyOn(history, 'go');
		release();
		release();
		await wait(5);
		expect(goSpy).not.toHaveBeenCalled();
	});

	it('takes its entry off when closed another way, and that pop is not a Back', async () => {
		const other = vi.fn(() => true);
		const release = openOverlay('dialog', () => true);
		const popped = nextPop();
		release();
		await popped;
		expect(history.state).toBeNull(); // back on the page's own entry
		// A later overlay is not closed by the pop we caused.
		openOverlay('other', other);
		await wait(5);
		expect(other).not.toHaveBeenCalled();
	});

	it('does not go back when the entry on top is no longer ours (navigated, or reloaded)', async () => {
		const release = openOverlay('dialog', () => true);
		history.pushState({}, '', '/somewhere-else/');
		const goSpy = vi.spyOn(history, 'go');
		release();
		await wait(5);
		expect(goSpy).not.toHaveBeenCalled();
		await settleOverlayHistory();
	});

	it('pushes the entry again when the overlay refuses to close (locked)', async () => {
		let locked = true;
		const onBack = vi.fn(() => !locked);
		openOverlay('trace', onBack);
		const popped = nextPop();
		history.back();
		await popped;
		expect(onBack).toHaveBeenCalledTimes(1);
		expect(history.state['sveltekit:states']).toEqual({ overlay: 'trace' });
		locked = false;
		const again = nextPop();
		history.back();
		await again;
		expect(onBack).toHaveBeenCalledTimes(2);
	});

	it('hands its entry to an overlay opening in the same tick, with no back and push', async () => {
		const release = openOverlay('import', () => true);
		const length = history.length;
		const goSpy = vi.spyOn(history, 'go');
		release();
		const confirm = vi.fn(() => true);
		openOverlay('confirm', confirm);
		await wait(5);
		expect(goSpy).not.toHaveBeenCalled();
		expect(history.length).toBe(length);
		// And Back closes the one that is open.
		const popped = nextPop();
		history.back();
		await popped;
		expect(confirm).toHaveBeenCalledTimes(1);
	});

	it('lets a navigation wait for the back it owes', async () => {
		const release = openOverlay('dialog', () => true);
		release();
		await settleOverlayHistory();
		expect(history.state).toBeNull();
	});
});
