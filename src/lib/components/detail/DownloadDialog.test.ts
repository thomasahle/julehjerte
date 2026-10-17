/**
 * The laser dialog in a DOM: its defaults, the derived strip-width line, the
 * "room for n" note, and a download that hands the browser one file of the
 * chosen type and sends one download_laser. The geometry and the writers are
 * covered in $lib/laser.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, tick, unmount } from 'svelte';
import LaserDialog from './LaserDialog.svelte';
import type { HeartDesign } from '$lib/types/heart';
import { trackLaserDownload } from '$lib/analytics';
import { loadHeart } from '$lib/laser/testHearts';

vi.mock('$lib/analytics', () => ({ trackLaserDownload: vi.fn() }));

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

let blobs: Blob[];
let downloads: { name: string; href: string }[];

beforeEach(() => {
	vi.useFakeTimers();
	vi.mocked(trackLaserDownload).mockClear();
	vi.stubGlobal('localStorage', memoryStorage());
	blobs = [];
	downloads = [];
	URL.createObjectURL = vi.fn((blob: Blob) => {
		blobs.push(blob);
		return `blob:test/${blobs.length}`;
	});
	URL.revokeObjectURL = vi.fn();
	vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
		downloads.push({ name: this.download, href: this.href });
	});
});

afterEach(() => {
	for (const dispose of cleanup.splice(0)) dispose();
	vi.useRealTimers();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

async function settle(): Promise<void> {
	flushSync();
	await tick();
	flushSync();
}

async function render(design: HeartDesign = loadHeart('classic-3x3')) {
	const target = document.createElement('div');
	document.body.appendChild(target);
	const component = mount(LaserDialog, {
		target,
		props: { design, heartId: design.id, heartName: 'Klassisk', lang: 'da', open: true, onClose: () => {} }
	});
	cleanup.push(() => {
		unmount(component);
		target.remove();
	});
	await settle();
	const q = <T extends Element>(selector: string) => target.querySelector<T>(selector);
	const button = (label: string) =>
		[...target.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === label);
	return {
		q,
		button,
		derived: () => q('[data-testid="laser-derived"]')?.textContent?.trim(),
		fit: () => q('[data-testid="laser-fit"]')?.textContent?.trim(),
		async type(selector: string, value: string) {
			const input = q<HTMLInputElement>(selector)!;
			input.value = value;
			input.dispatchEvent(new Event('input', { bubbles: true }));
			input.dispatchEvent(new Event('blur'));
			await settle();
		}
	};
}

describe('LaserDialog', () => {
	it('opens on SVG, 80 mm, one heart, A4, no score line', async () => {
		const view = await render();
		expect(view.q('#laser-dialog-title')!.textContent).toBe('Hent til laserskærer');
		expect(view.button('SVG')!.getAttribute('data-state')).toBe('on');
		expect(view.button('DXF')!.getAttribute('data-state')).toBe('off');
		expect(view.button('A4')!.getAttribute('data-state')).toBe('on');
		expect(view.q<HTMLInputElement>('#laser-width')!.value).toBe('80');
		expect(view.q<HTMLInputElement>('#laser-hearts')!.value).toBe('1');
		expect(view.q<HTMLInputElement>('input[type="checkbox"]')!.checked).toBe(false);
		expect(view.button('Hent SVG')).toBeDefined();
		expect(view.q('.preview-sheet svg')).not.toBeNull();
	});

	it('shows the strip width and height for the width chosen', async () => {
		const view = await render();
		expect(view.derived()).toBe('Stribebredde 26,7 mm · højde 240 mm');
		await view.type('#laser-width', '90');
		expect(view.derived()).toBe('Stribebredde 30 mm · højde 270 mm');
	});

	it('says how many hearts fit when not all of them do', async () => {
		const view = await render();
		expect(view.fit()).toBeUndefined();
		await view.type('#laser-hearts', '3');
		expect(view.fit()).toBe('Der er plads til 1 på arket');
		// A3 holds three 80 mm pieces: still one whole heart.
		view.button('A3')!.click();
		await settle();
		expect(view.fit()).toBe('Der er plads til 1 på arket');
	});

	it('downloads an SVG and sends one download_laser', async () => {
		const view = await render();
		view.button('Hent SVG')!.click();
		await settle();
		expect(blobs).toHaveLength(1);
		expect(blobs[0]!.type).toBe('image/svg+xml');
		expect(await blobs[0]!.text()).toContain('width="210mm"');
		expect(downloads).toEqual([{ name: 'classic-3x3-laser-80mm.svg', href: 'blob:test/1' }]);
		expect(trackLaserDownload).toHaveBeenCalledTimes(1);
		expect(trackLaserDownload).toHaveBeenCalledWith('classic-3x3', 'Klassisk', 'svg', 80);
		vi.advanceTimersByTime(1000);
		expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test/1');
	});

	it('downloads a DXF once DXF is chosen, and remembers the choice', async () => {
		const view = await render();
		view.button('DXF')!.click();
		await settle();
		await view.type('#laser-width', '70');
		view.button('Hent DXF')!.click();
		await settle();
		expect(blobs).toHaveLength(1);
		expect(blobs[0]!.type).toBe('application/dxf');
		expect(await blobs[0]!.text()).toContain('AC1009');
		expect(downloads[0]!.name).toBe('classic-3x3-laser-70mm.dxf');
		expect(trackLaserDownload).toHaveBeenCalledWith('classic-3x3', 'Klassisk', 'dxf', 70);
		expect(JSON.parse(window.localStorage.getItem('juleflet:laser')!)).toEqual({ format: 'dxf', widthMm: 70 });
	});

	it('keeps a width out of range inside 40–200 mm', async () => {
		const view = await render();
		await view.type('#laser-width', '500');
		expect(view.q<HTMLInputElement>('#laser-width')!.value).toBe('200');
	});

	it('says so, and offers no download, for a heart it cannot cut', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const design = loadHeart('classic-3x3');
		const fingers = design.fingers.map((f) => ({ ...f, segments: f.segments.map((s) => ({ ...s })) }));
		// A left-lobe strip cut (not one of the straight edges, whose controls sit
		// on their ends) runs right to left and ends on the fold; pull it in.
		const cut = fingers.find((f) => f.lobe === 'left' && f.segments[0]!.p1.x !== f.segments[0]!.p0.x)!;
		const last = cut.segments[cut.segments.length - 1]!;
		last.p3 = { x: last.p3.x + 20, y: last.p3.y };
		const view = await render({ ...design, fingers });
		expect(view.q('[role="alert"]')!.textContent).toContain('Filen kunne ikke laves');
		expect(view.button('Hent SVG')!.disabled).toBe(true);
	});
});
