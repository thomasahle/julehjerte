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
import {
	trackHeartDownload,
	trackLaserDownload,
	trackMultiDownload,
	trackMultiLaserDownload
} from '$lib/analytics';
import { downloadTemplatesPDF } from '$lib/pdf/template';
import { prerenderHeartImages } from '$lib/pdf/heartRenderer';
import { loadHeart } from '$lib/laser/testHearts';

vi.mock('$lib/analytics', () => ({
	trackHeartDownload: vi.fn(),
	trackLaserDownload: vi.fn(),
	trackMultiDownload: vi.fn(),
	trackMultiLaserDownload: vi.fn()
}));
// The dialog imports the generator on the click, as the page did; jsPDF itself
// is not wanted here, only what the dialog asks of it.
vi.mock('$lib/pdf/template', () => ({ downloadTemplatesPDF: vi.fn(async () => {}) }));
// jsdom has no canvas to draw the heart's picture in; the preview only needs
// to be handed one, when the PDF's renderer has made it.
const PICTURE = 'data:image/png;base64,iVBORw0KGgo=';
vi.mock('$lib/pdf/heartRenderer', () => ({
	prerenderHeartImages: vi.fn(async (designs: HeartDesign[]) => new Map(designs.map((d) => [d.id, PICTURE])))
}));

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
	vi.mocked(trackMultiDownload).mockClear();
	vi.mocked(trackMultiLaserDownload).mockClear();
	vi.mocked(downloadTemplatesPDF).mockClear();
	vi.mocked(prerenderHeartImages).mockClear();
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

/** The button stays busy for a moment after a download; let that pass. */
async function release(): Promise<void> {
	await vi.advanceTimersByTimeAsync(1000);
	await settle();
}

/** One heart, as the heart's page opens it, or several, as the front page does. */
async function render(design: HeartDesign | HeartDesign[] = loadHeart('classic-3x3'), lang: 'da' | 'en' = 'da') {
	const target = document.createElement('div');
	document.body.appendChild(target);
	const props = Array.isArray(design)
		? { designs: design, lang, open: true, onClose: () => {} }
		: { designs: [design], heartId: design.id, heartName: 'Klassisk', lang, open: true, onClose: () => {} };
	const component = mount(DownloadDialog, { target, props });
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
		},
		/** Typed, and the field not left yet. */
		async typeLive(selector: string, value: string) {
			const input = q<HTMLInputElement>(selector)!;
			input.value = value;
			input.dispatchEvent(new Event('input', { bubbles: true }));
			await settle();
		},
		async leave(selector: string) {
			q<HTMLInputElement>(selector)!.dispatchEvent(new Event('blur'));
			await settle();
		}
	};
}

describe('DownloadDialog', () => {
	it('opens on Printer, 80 mm, A4, with the picture, and no heart count', async () => {
		const view = await render();
		expect(view.q('#download-dialog-title')!.textContent!.trim()).toBe('Hent skabelon');
		expect(view.button('Printer')!.getAttribute('data-state')).toBe('on');
		expect(view.button('Laserskærer')!.getAttribute('data-state')).toBe('off');
		expect(view.button('A4')!.getAttribute('data-state')).toBe('on');
		expect(view.q<HTMLInputElement>('#download-width')!.value).toBe('80');
		// A printed template is cut as often as wanted: the count is the laser's.
		expect(view.q('#download-hearts')).toBeNull();
		expect(view.q<HTMLInputElement>('[data-testid="download-preview-image"]')!.checked).toBe(true);
		expect(view.q('.hint')!.textContent).toContain('Print uden tilpasning til siden');
		expect(view.note()).toBe('1 side');
		expect(view.button('Hent PDF')).toBeDefined();
		// The first page: the heart's two folded templates.
		expect(view.q('.preview-sheet svg')!.getAttribute('viewBox')).toBe('0 0 210 297');
		expect(view.q('.preview-sheet')!.querySelectorAll('g.cut')).toHaveLength(2);
		await view.choose('Laserskærer');
		expect(view.q<HTMLInputElement>('#download-hearts')!.value).toBe('1');
	});

	it('closes from a 44 px ✕ in its header, named Luk / Close', async () => {
		for (const [lang, name] of [['da', 'Luk'], ['en', 'Close']] as const) {
			const onClose = vi.fn();
			const target = document.createElement('div');
			document.body.appendChild(target);
			const design = loadHeart('classic-3x3');
			const component = mount(DownloadDialog, {
				target,
				props: { designs: [design], heartId: design.id, heartName: 'Klassisk', lang, open: true, onClose }
			});
			cleanup.push(() => {
				unmount(component);
				target.remove();
			});
			await settle();
			const close = target.querySelector<HTMLButtonElement>('[data-testid="download-close"]')!;
			expect(close.getAttribute('aria-label')).toBe(name);
			expect(close.classList.contains('btn-icon')).toBe(true);
			expect(close.classList.contains('btn-sm')).toBe(false); // .btn is 44 px; .btn-sm would be 40
			// In the header, beside the title, not at the bottom with "Annuller".
			expect(close.parentElement!.querySelector('h2')!.id).toBe('download-dialog-title');
			close.click();
			expect(onClose).toHaveBeenCalledTimes(1);
		}
	});

	it('shows the real heart in the printer preview, as the PDF renders it', async () => {
		let finish: (images: Map<string, string>) => void = () => {};
		vi.mocked(prerenderHeartImages).mockImplementationOnce(
			() => new Promise((resolve) => (finish = resolve))
		);
		const design = loadHeart('classic-3x3');
		const view = await render(design);
		const sheet = () => view.q('.preview-sheet')!;
		// Rendering: nothing where the picture goes, not even a box.
		expect(sheet().querySelectorAll('image, use, rect.thumb')).toHaveLength(0);
		expect(sheet().querySelectorAll('rect')).toHaveLength(1);
		// The address is in the ear already, where it will be with the picture;
		// the heart's name is above the template, on the paper.
		expect(sheet().querySelector('text.address')!.textContent).toBe('juleflet.dk/hjerte/classic-3x3');
		expect(sheet().querySelector('text.label')!.textContent).toBe(design.name);

		finish(new Map([[design.id, PICTURE]]));
		await settle();
		expect(prerenderHeartImages).toHaveBeenCalledTimes(1);
		// The PDF's own size: 28 mm at 300 dpi.
		expect(prerenderHeartImages).toHaveBeenCalledWith([design], 331);
		expect(sheet().querySelector('image')!.getAttribute('href')).toBe(PICTURE);
		expect(sheet().querySelectorAll('use.picture')).toHaveLength(2);

		// Turned off: no picture in the preview either, and no new rendering.
		view.q<HTMLInputElement>('[data-testid="download-preview-image"]')!.click();
		await settle();
		expect(sheet().querySelectorAll('image, use')).toHaveLength(0);
		view.q<HTMLInputElement>('[data-testid="download-preview-image"]')!.click();
		await settle();
		expect(sheet().querySelectorAll('use.picture')).toHaveLength(2);
		expect(prerenderHeartImages).toHaveBeenCalledTimes(1);
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
		expect(view.q('.legend')).toBeNull();

		await view.choose('Laserskærer');
		expect(view.button('SVG')!.getAttribute('data-state')).toBe('on');
		expect(view.button('DXF')).toBeDefined();
		expect(view.q('[data-testid="download-preview-image"]')).toBeNull();
		// No fold scoring: nothing to switch on, and every line in the preview a cut.
		expect(view.q('input[type="checkbox"]')).toBeNull();
		expect(view.q('.legend')!.textContent!.trim()).toBe('Alle linjer skæres · 0,01 mm streg');
		expect(view.q('.preview-sheet')!.querySelectorAll('g')).toHaveLength(1);
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
		const view = await render([loadHeart('classic-3x3'), loadHeart('jul'), loadHeart('stjerne')]);
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

	it('hands the PDF generator the chosen width, sheet and picture setting, one set per heart', async () => {
		const design = loadHeart('classic-3x3');
		const view = await render(design);
		await view.type('#download-width', '60');
		// A laser count does not reach the PDF.
		await view.choose('Laserskærer');
		await view.type('#download-hearts', '3');
		await view.choose('Printer');
		view.button('Hent PDF')!.click();
		await vi.dynamicImportSettled();
		await settle();
		expect(downloadTemplatesPDF).toHaveBeenCalledTimes(1);
		expect(downloadTemplatesPDF).toHaveBeenCalledWith([design], {
			widthMm: 60,
			hearts: 1,
			sheet: { widthMm: 210, heightMm: 297 },
			lang: 'da',
			previewImage: true
		});
		expect(trackHeartDownload).toHaveBeenCalledTimes(1);
		expect(trackHeartDownload).toHaveBeenCalledWith('classic-3x3', design.name);
		expect(trackLaserDownload).not.toHaveBeenCalled();
		expect(blobs).toHaveLength(0);
		await release();

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
			hearts: 1,
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

	describe('activated again while a download is under way', () => {
		// A double-click, a burst of clicks or Enter held down: the activations
		// that arrive before the DOM has disabled the button reach the handler.
		const burst = (button: HTMLButtonElement) => {
			for (let i = 0; i < 5; i++) button.click();
		};

		it('makes one PDF and sends one download event', async () => {
			const view = await render();
			const button = view.button('Hent PDF')!;
			burst(button);
			await settle();
			expect(button.disabled).toBe(true);
			expect(button.getAttribute('aria-busy')).toBe('true');
			expect(button.textContent!.trim()).toBe('Genererer...');
			burst(button);
			await vi.dynamicImportSettled();
			await settle();
			burst(button);
			await settle();
			expect(downloadTemplatesPDF).toHaveBeenCalledTimes(1);
			expect(trackHeartDownload).toHaveBeenCalledTimes(1);
			await release();
			expect(button.disabled).toBe(false);
			expect(button.getAttribute('aria-busy')).toBe('false');
			expect(button.textContent!.trim()).toBe('Hent PDF');
			// Once it is over, the next click is a new download.
			button.click();
			await vi.dynamicImportSettled();
			await settle();
			expect(downloadTemplatesPDF).toHaveBeenCalledTimes(2);
		});

		it('writes one laser file and sends one download_laser', async () => {
			const view = await render();
			await view.choose('Laserskærer');
			const button = view.button('Hent SVG')!;
			burst(button);
			await settle();
			expect(button.disabled).toBe(true);
			burst(button);
			await settle();
			expect(downloads).toHaveLength(1);
			expect(blobs).toHaveLength(1);
			expect(trackLaserDownload).toHaveBeenCalledTimes(1);
			await release();
			expect(button.disabled).toBe(false);
			button.click();
			await settle();
			expect(downloads).toHaveLength(2);
		});

		it('sends one set of events for several hearts', async () => {
			const view = await render([loadHeart('classic-3x3'), loadHeart('jul')]);
			await view.choose('Laserskærer');
			burst(view.button('Hent SVG')!);
			await settle();
			expect(downloads).toHaveLength(1);
			expect(trackMultiLaserDownload).toHaveBeenCalledTimes(1);
			await release();
			await view.choose('Printer');
			burst(view.button('Hent PDF')!);
			await vi.dynamicImportSettled();
			await settle();
			expect(downloadTemplatesPDF).toHaveBeenCalledTimes(1);
			expect(trackMultiDownload).toHaveBeenCalledTimes(1);
		});
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

	it('says the template is too big when no laser piece fits, in either language', async () => {
		// The opened-out piece is three widths tall: 300 mm at 100 mm, more than A4's 297.
		const da = await render();
		await da.choose('Laserskærer');
		await da.type('#download-width', '100');
		expect(da.note()).toBe('Skabelonen er for stor til arket. Vælg en mindre bredde eller et større ark.');
		expect(da.button('Hent SVG')!.disabled).toBe(true);
		da.dispose();

		const en = await render([loadHeart('classic-3x3'), loadHeart('jul')], 'en');
		await en.choose('Laser cutter');
		await en.type('#download-width', '200');
		expect(en.note()).toBe('The template is too big for the sheet. Choose a smaller width or a larger sheet.');
		expect(en.button('Download SVG')!.disabled).toBe(true);
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
		await release();

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

	it('remembers every setting of a download for the next opening', async () => {
		const first = await render();
		await first.choose('Laserskærer');
		await first.choose('DXF');
		await first.type('#download-width', '70');
		await first.type('#download-hearts', '2');
		await first.choose('A3');
		expect(window.localStorage.getItem('juleflet:download')).toBeNull();
		first.button('Hent DXF')!.click();
		await settle();
		expect(JSON.parse(window.localStorage.getItem('juleflet:download')!)).toEqual({
			mode: 'laser',
			widthMm: 70,
			hearts: 2,
			sheet: 'A3',
			format: 'dxf',
			previewImage: true
		});
		first.dispose();

		const again = await render();
		expect(again.button('Laserskærer')!.getAttribute('data-state')).toBe('on');
		expect(again.button('DXF')!.getAttribute('data-state')).toBe('on');
		expect(again.button('A3')!.getAttribute('data-state')).toBe('on');
		expect(again.q<HTMLInputElement>('#download-width')!.value).toBe('70');
		expect(again.q<HTMLInputElement>('#download-hearts')!.value).toBe('2');
	});

	it('stores nothing on opening, and nothing when cancelled', async () => {
		const opened = await render();
		expect(window.localStorage.getItem('juleflet:download')).toBeNull();
		opened.button('Annuller')!.click();
		opened.dispose();
		expect(window.localStorage.getItem('juleflet:download')).toBeNull();

		// A change and then Annuller or Escape: the next opening is as before.
		for (const leave of ['Annuller', 'Escape']) {
			const view = await render();
			await view.choose('Laserskærer');
			await view.type('#download-width', '120');
			await view.choose('A3');
			if (leave === 'Escape') {
				document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
			} else {
				view.button('Annuller')!.click();
			}
			await settle();
			view.dispose();
			expect(window.localStorage.getItem('juleflet:download')).toBeNull();
			const again = await render();
			expect(again.button('Printer')!.getAttribute('data-state')).toBe('on');
			expect(again.q<HTMLInputElement>('#download-width')!.value).toBe('80');
			again.dispose();
		}
	});

	it('keeps the last download\'s settings when a later change is cancelled', async () => {
		const first = await render();
		await first.type('#download-width', '60');
		first.button('Hent PDF')!.click();
		await vi.dynamicImportSettled();
		await settle();
		const stored = window.localStorage.getItem('juleflet:download');
		expect(JSON.parse(stored!).widthMm).toBe(60);
		await release();
		await first.type('#download-width', '150');
		await first.choose('A3');
		first.button('Annuller')!.click();
		first.dispose();
		expect(window.localStorage.getItem('juleflet:download')).toBe(stored);
		const again = await render();
		expect(again.q<HTMLInputElement>('#download-width')!.value).toBe('60');
		expect(again.button('A4')!.getAttribute('data-state')).toBe('on');
	});

	it('remembers a custom sheet by its size', async () => {
		const first = await render();
		await first.choose('Eget mål');
		await first.type('.sheet-size label:first-child input', '250');
		first.button('Hent PDF')!.click();
		await vi.dynamicImportSettled();
		await settle();
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
		first.button('Hent PDF')!.click();
		await vi.dynamicImportSettled();
		await settle();
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

	describe('while a number is typed', () => {
		it('shows and downloads the width clamped to 40–200 mm at once', async () => {
			const design = loadHeart('classic-3x3');
			const reference = await render(design);
			await reference.type('#download-width', '40');
			const at40 = { derived: reference.derived(), preview: reference.q('.preview-sheet')!.innerHTML };
			reference.dispose();

			const view = await render(design);
			await view.typeLive('#download-width', '30');
			// The field keeps what was typed; everything else is the 40 mm the file gets.
			expect(view.q<HTMLInputElement>('#download-width')!.value).toBe('30');
			expect(view.derived()).toBe(at40.derived);
			expect(view.q('.preview-sheet')!.innerHTML).toBe(at40.preview);
			expect(view.q('#download-width')!.getAttribute('aria-invalid')).toBe('false');
			view.button('Hent PDF')!.click();
			await vi.dynamicImportSettled();
			await settle();
			expect(vi.mocked(downloadTemplatesPDF).mock.calls[0]![1].widthMm).toBe(40);
			await view.leave('#download-width');
			expect(view.q<HTMLInputElement>('#download-width')!.value).toBe('40');
			await release();

			// Too wide for A4 the moment 250 is typed (it is 200 mm).
			await view.typeLive('#download-width', '250');
			expect(view.note()).toContain('Skabelonen er for stor til arket');
			expect(view.button('Hent PDF')!.disabled).toBe(true);
		});

		it('takes any whole millimetre', async () => {
			const view = await render();
			const input = view.q<HTMLInputElement>('#download-width')!;
			expect(input.step).toBe('1');
			await view.typeLive('#download-width', '47');
			expect(input.validity.valid).toBe(true);
			view.button('Hent PDF')!.click();
			await vi.dynamicImportSettled();
			await settle();
			expect(vi.mocked(downloadTemplatesPDF).mock.calls[0]![1].widthMm).toBe(47);
		});

		it('marks an empty field and waits, then puts the last value back when it is left', async () => {
			const view = await render();
			await view.typeLive('#download-width', '60');
			await view.typeLive('#download-width', '');
			const input = view.q<HTMLInputElement>('#download-width')!;
			expect(input.getAttribute('aria-invalid')).toBe('true');
			expect(view.button('Hent PDF')!.disabled).toBe(true);
			await view.leave('#download-width');
			expect(input.value).toBe('60');
			expect(input.getAttribute('aria-invalid')).toBe('false');
			expect(view.button('Hent PDF')!.disabled).toBe(false);
		});

		it('does the same for the laser count, clamped to 1–20', async () => {
			const view = await render();
			await view.choose('Laserskærer');
			await view.typeLive('#download-hearts', '100');
			expect(view.q<HTMLInputElement>('#download-hearts')!.value).toBe('100');
			expect(view.note()).toBe('Der er kun plads til 2 af 20 stykker på arket');
			await view.typeLive('#download-hearts', '0');
			expect(view.note()).toBeUndefined();
			view.button('Hent SVG')!.click();
			await settle();
			expect(trackLaserDownload).toHaveBeenCalledTimes(1);
			await release();
			await view.typeLive('#download-hearts', '');
			expect(view.q('#download-hearts')!.getAttribute('aria-invalid')).toBe('true');
			expect(view.button('Hent SVG')!.disabled).toBe(true);
			await view.leave('#download-hearts');
			expect(view.q<HTMLInputElement>('#download-hearts')!.value).toBe('1');
			expect(view.button('Hent SVG')!.disabled).toBe(false);
		});

		it('does the same for a custom sheet, clamped to 50–2000 mm', async () => {
			const view = await render();
			await view.choose('Eget mål');
			const width = '.sheet-size label:first-child input';
			await view.typeLive(width, '30');
			// A 50 mm wide page has no room for an 80 mm template.
			expect(view.note()).toContain('Skabelonen er for stor til arket');
			expect(view.button('Hent PDF')!.disabled).toBe(true);
			await view.typeLive(width, '5000');
			expect(view.note()).toBe('1 side');
			view.button('Hent PDF')!.click();
			await vi.dynamicImportSettled();
			await settle();
			expect(vi.mocked(downloadTemplatesPDF).mock.calls[0]![1].sheet).toEqual({ widthMm: 2000, heightMm: 297 });
			await release();
			await view.typeLive(width, '');
			expect(view.q(width)!.getAttribute('aria-invalid')).toBe('true');
			expect(view.button('Hent PDF')!.disabled).toBe(true);
		});
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
	describe('with several hearts (SELECTION.md)', () => {
		const set = () => [loadHeart('classic-3x3'), loadHeart('jul')];

		it("names the count, plans every heart in order, and leaves out the single heart's line", async () => {
			const view = await render(set());
			expect(view.q('#download-dialog-title')!.textContent!.replace(/\s+/g, ' ').trim()).toBe('Hent skabeloner 2');
			expect(view.derived()).toBeUndefined();
			// Classic's one shared template twice (as the single dialog prints it), Jul's two.
			expect(view.q('.preview-sheet')!.querySelectorAll('g.cut')).toHaveLength(4);
			const addresses = [...view.q('.preview-sheet')!.querySelectorAll('text.address')].map((t) => t.textContent);
			expect(addresses).toEqual([
				'juleflet.dk/hjerte/classic-3x3',
				'juleflet.dk/hjerte/classic-3x3',
				'juleflet.dk/hjerte/jul',
				'juleflet.dk/hjerte/jul',
				// The page's footer.
				'juleflet.dk'
			]);
			// The names, with the side for Jul's two halves, sit above the templates.
			const labels = [...view.q('.preview-sheet')!.querySelectorAll('text.label')].map((t) => t.textContent);
			expect(labels).toEqual(['Classic 3x3', 'Classic 3x3', 'JUL (Venstre)', 'JUL (Højre)']);
		});

		it('hands the PDF generator every heart, with one shared download event', async () => {
			const designs = set();
			const view = await render(designs);
			view.button('Hent PDF')!.click();
			await vi.dynamicImportSettled();
			await settle();
			expect(downloadTemplatesPDF).toHaveBeenCalledWith(designs, expect.objectContaining({ hearts: 1 }));
			expect(trackMultiDownload).toHaveBeenCalledWith([
				{ id: 'classic-3x3', name: designs[0]!.name },
				{ id: 'jul', name: designs[1]!.name }
			]);
			expect(trackHeartDownload).not.toHaveBeenCalled();
		});

		it("packs every heart's pieces into one laser file named by the count, the lobe applying to the asymmetric one", async () => {
			const designs = set();
			const view = await render(designs);
			await view.choose('Laserskærer');
			// Jul's halves differ, so the lobe choice shows even though Classic's do not.
			expect(view.button('Venstre')!.getAttribute('data-state')).toBe('on');
			expect(view.q('.preview-sheet')!.querySelectorAll('g.cut path').length).toBeGreaterThan(0);
			view.button('Hent SVG')!.click();
			await settle();
			expect(downloads[0]!.name).toBe('julehjerter-2-laser-80mm-venstre.svg');
			const svg = await blobs[0]!.text();
			expect(svg).toContain(designs[0]!.name);
			expect(svg).toContain(designs[1]!.name);
			expect(trackMultiLaserDownload).toHaveBeenCalledWith(
				[
					{ id: 'classic-3x3', name: designs[0]!.name },
					{ id: 'jul', name: designs[1]!.name }
				],
				'svg',
				80
			);
			expect(trackLaserDownload).not.toHaveBeenCalled();
		});

		describe('when the sheet holds only some of them', () => {
			// At 80 mm on A4 there is room for two pieces: Classic's and Jul's, not Weave 1's.
			const three = () => [loadHeart('classic-3x3'), loadHeart('jul'), loadHeart('amy-weave-1')];

			it('names the heart left out, and the file holds and is named for the hearts on it', async () => {
				const designs = three();
				const view = await render(designs);
				await view.choose('Laserskærer');
				expect(view.note()).toBe(
					'Der er kun plads til 2 af 3 stykker på arket. Ikke med: Weave 1. Vælg A3 eller en mindre bredde, eller hent arket igen for de resterende.'
				);
				view.button('Hent SVG')!.click();
				await settle();
				expect(downloads[0]!.name).toBe('julehjerter-2-laser-80mm-venstre.svg');
				// The title counts the hearts ticked; only the file counts the sheet.
				expect(view.q('[data-testid="download-count"]')!.textContent).toBe('3');
				const svg = await blobs[0]!.text();
				expect(svg).toContain('<title>Classic 3x3, JUL</title>');
				expect(svg).not.toContain('Weave 1');
				// The events count the hearts on the sheet too, not every ticked one.
				expect(trackMultiLaserDownload).toHaveBeenCalledTimes(1);
				expect(trackMultiLaserDownload).toHaveBeenCalledWith(
					[
						{ id: 'classic-3x3', name: designs[0]!.name },
						{ id: 'jul', name: designs[1]!.name }
					],
					'svg',
					80
				);
			});

			it('suggests A3 only when A3 would hold them all', async () => {
				const view = await render(three());
				await view.choose('Laserskærer');
				await view.choose('A3');
				await view.type('#download-width', '120');
				expect(view.note()).toMatch(/Ikke med: .*\. Vælg en mindre bredde, eller hent arket igen for de resterende\.$/);
			});

			it('says the same in English', async () => {
				const view = await render(three(), 'en');
				await view.choose('Laser cutter');
				expect(view.note()).toBe(
					'There is only room for 2 of 3 pieces on the sheet. Left out: Weave 1. Choose A3 or a smaller width, or download another sheet for the rest.'
				);
				view.button('Download SVG')!.click();
				await settle();
				expect(downloads[0]!.name).toBe('christmas-hearts-2-laser-80mm-left.svg');
			});
		});

		it("offers no lobe choice when every heart's halves are the same", async () => {
			const view = await render([loadHeart('classic-3x3'), loadHeart('classic-3x3')]);
			await view.choose('Laserskærer');
			expect(view.button('Venstre')).toBeUndefined();
			view.button('Hent SVG')!.click();
			await settle();
			expect(downloads[0]!.name).toBe('julehjerter-2-laser-80mm.svg');
		});
	});
});
