/**
 * The "Hent skabelon" dialog in a DOM: its defaults, the derived line in each
 * mode, the controls each mode shows, the PDF handed to the generator with the
 * chosen settings, the laser file handed to the browser with one
 * download_laser, and the settings surviving a reopening. The page planning,
 * the geometry and the writers are covered in $lib/pdf and $lib/laser.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, tick, unmount } from 'svelte';
import DownloadDialog from './DownloadDialog.svelte';
import type { HeartDesign } from '$lib/types/heart';
import { trackHeartDownload, trackLaserDownload } from '$lib/analytics';
import { downloadTemplatesPDF } from '$lib/pdf/template';
import { loadHeart } from '$lib/laser/testHearts';

vi.mock('$lib/analytics', () => ({ trackHeartDownload: vi.fn(), trackLaserDownload: vi.fn() }));
// The dialog imports the generator on the click, as the page did; jsPDF itself
// is not wanted here, only what the dialog asks of it.
vi.mock('$lib/pdf/template', () => ({ downloadTemplatesPDF: vi.fn(async () => {}) }));

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
	vi.mocked(trackHeartDownload).mockClear();
	vi.mocked(downloadTemplatesPDF).mockClear();
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
	const component = mount(DownloadDialog, {
		target,
		props: { design, heartId: design.id, heartName: 'Klassisk', lang: 'da', open: true, onClose: () => {} }
	});
	let disposed = false;
	const dispose = () => {
		if (disposed) return;
		disposed = true;
		unmount(component);
		target.remove();
	};
	cleanup.push(dispose);
	await settle();
	const q = <T extends Element>(selector: string) => target.querySelector<T>(selector);
	const button = (label: string) =>
		[...target.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === label);
	return {
		q,
		button,
		dispose,
		derived: () => q('[data-testid="download-derived"]')?.textContent?.trim(),
		note: () => q('[data-testid="download-sheet-note"]')?.textContent?.trim(),
		async choose(label: string) {
			button(label)!.click();
			await settle();
		},
		async type(selector: string, value: string) {
			const input = q<HTMLInputElement>(selector)!;
			input.value = value;
			input.dispatchEvent(new Event('input', { bubbles: true }));
			input.dispatchEvent(new Event('blur'));
			await settle();
		}
	};
}

describe('DownloadDialog', () => {
	it('opens on Printer, 80 mm, one heart, A4, with the picture', async () => {
		const view = await render();
		expect(view.q('#download-dialog-title')!.textContent).toBe('Hent skabelon');
		expect(view.button('Printer')!.getAttribute('data-state')).toBe('on');
		expect(view.button('Laserskærer')!.getAttribute('data-state')).toBe('off');
		expect(view.button('A4')!.getAttribute('data-state')).toBe('on');
		expect(view.q<HTMLInputElement>('#download-width')!.value).toBe('80');
		expect(view.q<HTMLInputElement>('#download-hearts')!.value).toBe('1');
		expect(view.q<HTMLInputElement>('[data-testid="download-preview-image"]')!.checked).toBe(true);
		expect(view.q('.hint')!.textContent).toContain('Print uden tilpasning til siden');
		expect(view.note()).toBe('1 side');
		expect(view.button('Hent PDF')).toBeDefined();
		// The first page: the heart's two folded templates.
		expect(view.q('.preview-sheet svg')!.getAttribute('viewBox')).toBe('0 0 210 297');
		expect(view.q('.preview-sheet')!.querySelectorAll('g.cut')).toHaveLength(2);
	});

	it('gives the folded height for print and the unfolded one for the laser', async () => {
		const view = await render();
		expect(view.derived()).toBe('Stribebredde 26,7 mm · højde 120 mm');
		await view.type('#download-width', '90');
		expect(view.derived()).toBe('Stribebredde 30 mm · højde 135 mm');
		await view.choose('Laserskærer');
		expect(view.derived()).toBe('Stribebredde 30 mm · højde 270 mm');
	});

	it('shows each mode its own controls and its own preview', async () => {
		const view = await render();
		const previewOf = () => view.q('.preview-sheet')!.innerHTML;
		const printerPreview = previewOf();
		expect(view.button('SVG')).toBeUndefined();
		expect(view.q('[data-testid="download-score"]')).toBeNull();
		expect(view.q('.legend')).toBeNull();

		await view.choose('Laserskærer');
		expect(view.button('SVG')!.getAttribute('data-state')).toBe('on');
		expect(view.button('DXF')).toBeDefined();
		expect(view.q('[data-testid="download-score"]')).not.toBeNull();
		expect(view.q('[data-testid="download-preview-image"]')).toBeNull();
		expect(view.q('.legend')!.textContent).toContain('Rød = skær');
		expect(view.q('.hint')!.textContent).toContain('DXF til xTool');
		expect(view.button('Hent SVG')).toBeDefined();
		expect(previewOf()).not.toBe(printerPreview);
		// The unfolded pieces carry no name lines; the folded templates do.
		expect(view.q('.preview-sheet text')).toBeNull();

		await view.choose('Printer');
		expect(view.button('SVG')).toBeUndefined();
		expect(view.button('Hent PDF')).toBeDefined();
		expect(previewOf()).toBe(printerPreview);
	});

	it('says how many pages the PDF takes, and when a template is too big for the sheet', async () => {
		const view = await render();
		await view.type('#download-hearts', '3');
		expect(view.note()).toBe('2 sider');
		expect(view.q('[data-testid="download-preview-page"]')!.textContent!.trim()).toBe('Side 1 af 2');
		expect(view.q('.preview-sheet')!.querySelectorAll('g.cut')).toHaveLength(4);
		await view.choose('A3');
		expect(view.note()).toBe('1 side');
		await view.choose('A4');
		await view.type('#download-width', '200');
		expect(view.note()).toContain('Skabelonen er for stor til arket');
		expect(view.button('Hent PDF')!.disabled).toBe(true);
	});

	it('hands the PDF generator the chosen width, hearts, sheet and picture setting', async () => {
		const design = loadHeart('classic-3x3');
		const view = await render(design);
		await view.type('#download-width', '60');
		await view.type('#download-hearts', '3');
		view.button('Hent PDF')!.click();
		await vi.dynamicImportSettled();
		await settle();
		expect(downloadTemplatesPDF).toHaveBeenCalledTimes(1);
		expect(downloadTemplatesPDF).toHaveBeenCalledWith([design], {
			widthMm: 60,
			hearts: 3,
			sheet: { widthMm: 210, heightMm: 297 },
			lang: 'da',
			previewImage: true
		});
		expect(trackHeartDownload).toHaveBeenCalledTimes(1);
		expect(trackHeartDownload).toHaveBeenCalledWith('classic-3x3', design.name);
		expect(trackLaserDownload).not.toHaveBeenCalled();
		expect(blobs).toHaveLength(0);

		await view.choose('Eget mål');
		await view.type('.sheet-size label:first-child input', '300');
		await view.type('.sheet-size label:last-child input', '200');
		view.q<HTMLInputElement>('[data-testid="download-preview-image"]')!.click();
		await settle();
		view.button('Hent PDF')!.click();
		await vi.dynamicImportSettled();
		await settle();
		expect(vi.mocked(downloadTemplatesPDF).mock.calls[1]![1]).toEqual({
			widthMm: 60,
			hearts: 3,
			sheet: { widthMm: 300, heightMm: 200 },
			lang: 'da',
			previewImage: false
		});
	});

	it('says so when the PDF cannot be made', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		vi.mocked(downloadTemplatesPDF).mockRejectedValueOnce(new Error('no canvas'));
		const view = await render();
		view.button('Hent PDF')!.click();
		await vi.dynamicImportSettled();
		await settle();
		expect(view.q('[role="alert"]')!.textContent).toContain('PDF-skabelonen kunne ikke laves');
	});

	it('downloads an SVG and sends one download_laser', async () => {
		const view = await render();
		await view.choose('Laserskærer');
		view.button('Hent SVG')!.click();
		await settle();
		expect(blobs).toHaveLength(1);
		expect(blobs[0]!.type).toBe('image/svg+xml');
		expect(await blobs[0]!.text()).toContain('width="210mm"');
		expect(downloads).toEqual([{ name: 'classic-3x3-laser-80mm.svg', href: 'blob:test/1' }]);
		expect(trackLaserDownload).toHaveBeenCalledTimes(1);
		expect(trackLaserDownload).toHaveBeenCalledWith('classic-3x3', 'Klassisk', 'svg', 80);
		expect(trackHeartDownload).not.toHaveBeenCalled();
		expect(downloadTemplatesPDF).not.toHaveBeenCalled();
		vi.advanceTimersByTime(1000);
		expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test/1');
	});

	it('downloads a DXF once DXF is chosen', async () => {
		const view = await render();
		await view.choose('Laserskærer');
		await view.choose('DXF');
		await view.type('#download-width', '70');
		view.button('Hent DXF')!.click();
		await settle();
		expect(blobs).toHaveLength(1);
		expect(blobs[0]!.type).toBe('application/dxf');
		expect(await blobs[0]!.text()).toContain('AC1009');
		expect(downloads[0]!.name).toBe('classic-3x3-laser-70mm.dxf');
		expect(trackLaserDownload).toHaveBeenCalledWith('classic-3x3', 'Klassisk', 'dxf', 70);
	});

	it('says how many pieces fit on the laser sheet when not all of them do', async () => {
		const view = await render();
		await view.choose('Laserskærer');
		expect(view.note()).toBeUndefined();
		// One lobe per sheet, one piece per heart: A4 holds two 80 mm pieces.
		await view.type('#download-hearts', '2');
		expect(view.note()).toBeUndefined();
		expect(view.q('.preview-sheet')!.querySelectorAll('.cut path').length).toBeGreaterThan(0);
		await view.type('#download-hearts', '3');
		expect(view.note()).toBe('Der er kun plads til 2 af 3 stykker på arket');
	});

	it('cuts a heart with two equal halves from one sheet, and says to cut it in each colour', async () => {
		const view = await render();
		await view.choose('Laserskærer');
		expect(view.button('Venstre')).toBeUndefined();
		expect(view.q('[data-testid="download-lobe-note"]')!.textContent).toContain('Halvdelene er ens');
		view.button('Hent SVG')!.click();
		await settle();
		expect(downloads[0]!.name).toBe('classic-3x3-laser-80mm.svg');
	});

	it('puts one lobe of an asymmetric heart on the sheet, and names it in the file', async () => {
		const jul = loadHeart('jul');
		const view = await render(jul);
		await view.choose('Laserskærer');
		await view.type('#download-hearts', '2');
		expect(view.button('Venstre')!.getAttribute('data-state')).toBe('on');
		expect(view.q('[data-testid="download-lobe-note"]')!.textContent).toContain('Hent begge halvdele');
		const leftPreview = view.q('.preview-sheet')!.innerHTML;
		view.button('Hent SVG')!.click();
		await settle();
		expect(downloads[0]!.name).toBe('jul-laser-80mm-venstre.svg');

		await view.choose('Højre');
		expect(view.q('.preview-sheet')!.innerHTML).not.toBe(leftPreview);
		view.button('Hent SVG')!.click();
		await settle();
		expect(downloads[1]!.name).toBe('jul-laser-80mm-hoejre.svg');
		// The lobe is for this visit, not for storage.
		expect(window.localStorage.getItem('juleflet:download')).not.toContain('right');
		view.dispose();
		const again = await render(jul);
		expect(again.button('Højre')!.getAttribute('data-state')).toBe('on');
		await again.choose('Venstre');
	});

	it('remembers every setting for the next opening', async () => {
		const first = await render();
		await first.choose('Laserskærer');
		await first.choose('DXF');
		await first.type('#download-width', '70');
		await first.type('#download-hearts', '2');
		await first.choose('A3');
		first.q<HTMLInputElement>('[data-testid="download-score"]')!.click();
		await settle();
		expect(JSON.parse(window.localStorage.getItem('juleflet:download')!)).toEqual({
			mode: 'laser',
			widthMm: 70,
			hearts: 2,
			sheet: 'A3',
			format: 'dxf',
			scoreFold: true,
			previewImage: true
		});
		first.dispose();

		const again = await render();
		expect(again.button('Laserskærer')!.getAttribute('data-state')).toBe('on');
		expect(again.button('DXF')!.getAttribute('data-state')).toBe('on');
		expect(again.button('A3')!.getAttribute('data-state')).toBe('on');
		expect(again.q<HTMLInputElement>('#download-width')!.value).toBe('70');
		expect(again.q<HTMLInputElement>('#download-hearts')!.value).toBe('2');
		expect(again.q<HTMLInputElement>('[data-testid="download-score"]')!.checked).toBe(true);
	});

	it('remembers a custom sheet by its size', async () => {
		const first = await render();
		await first.choose('Eget mål');
		await first.type('.sheet-size label:first-child input', '250');
		first.dispose();
		const again = await render();
		expect(again.button('Eget mål')!.getAttribute('data-state')).toBe('on');
		expect(again.q<HTMLInputElement>('.sheet-size label:first-child input')!.value).toBe('250');
		expect(again.q<HTMLInputElement>('.sheet-size label:last-child input')!.value).toBe('297');
	});

	it('takes the width and format from the old laser dialog once, then its own', async () => {
		window.localStorage.setItem('juleflet:laser', JSON.stringify({ format: 'dxf', widthMm: 120 }));
		const first = await render();
		expect(first.button('Printer')!.getAttribute('data-state')).toBe('on');
		expect(first.q<HTMLInputElement>('#download-width')!.value).toBe('120');
		await first.type('#download-width', '90');
		first.dispose();
		const again = await render();
		expect(again.q<HTMLInputElement>('#download-width')!.value).toBe('90');
		await again.choose('Laserskærer');
		expect(again.button('DXF')!.getAttribute('data-state')).toBe('on');
	});

	it('keeps a width out of range inside 40–200 mm', async () => {
		const view = await render();
		await view.type('#download-width', '500');
		expect(view.q<HTMLInputElement>('#download-width')!.value).toBe('200');
	});

	it('says so, and offers no laser file, for a heart it cannot cut', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const design = loadHeart('classic-3x3');
		const fingers = design.fingers.map((f) => ({ ...f, segments: f.segments.map((s) => ({ ...s })) }));
		// A left-lobe strip cut (not one of the straight edges, whose controls sit
		// on their ends) runs right to left and ends on the fold; pull it in.
		const cut = fingers.find((f) => f.lobe === 'left' && f.segments[0]!.p1.x !== f.segments[0]!.p0.x)!;
		const last = cut.segments[cut.segments.length - 1]!;
		last.p3 = { x: last.p3.x + 20, y: last.p3.y };
		const view = await render({ ...design, fingers });
		await view.choose('Laserskærer');
		expect(view.q('[role="alert"]')!.textContent).toContain('Filen kunne ikke laves');
		expect(view.button('Hent SVG')!.disabled).toBe(true);
	});
});
