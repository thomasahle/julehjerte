import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import boelgerSvg from '../../../static/hearts/boelger.svg?raw';
import type { HeartDesign, Vec } from '$lib/types/heart';
import { parseHeartFromSVG, serializeHeartDesign } from '$lib/utils/heartDesign';
import { readDraft, writeDraft } from '$lib/editor/draft';
import { handoffToDraw } from '$lib/editor/handoff';
import { getUserCollection, saveUserDesign } from '$lib/stores/collection';
// The Escher tab's panel, which Tegn loads when a heart opens on the tab, loaded ahead.
import '$lib/components/pattern/EscherPanel.svelte';

// The page saves only in a browser.
vi.mock('$app/environment', () => ({ browser: true, dev: false, building: false, version: 'test' }));

const { default: EditorPage } = await import('./EditorPage.svelte');

/** The browser's localStorage, in memory. */
const stored = new Map<string, string>();
const storage: Storage = {
	get length() {
		return stored.size;
	},
	clear: () => stored.clear(),
	getItem: (k) => stored.get(k) ?? null,
	key: (i) => [...stored.keys()][i] ?? null,
	removeItem: (k) => void stored.delete(k),
	setItem: (k, v) => void stored.set(k, String(v))
};

const boelger = (): HeartDesign => {
	const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
	try {
		return parseHeartFromSVG(boelgerSvg, 'boelger.svg')!;
	} finally {
		warn.mockRestore();
	}
};

const cleanup: (() => Promise<void> | void)[] = [];
beforeEach(() => {
	// jsdom has no SVG layout: pointer events are in the heart's own units (see PaperHeart.test.ts).
	vi.stubGlobal('DOMPoint', class {
		constructor(public x: number, public y: number) {}
		matrixTransform() {
			return this;
		}
	});
	Object.defineProperty(SVGElement.prototype, 'getScreenCTM', { configurable: true, value: () => ({ inverse: () => ({}) }) });
	vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
	stored.clear();
	Object.defineProperty(window, 'localStorage', { configurable: true, value: storage });
	vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
});
afterEach(async () => {
	for (const dispose of cleanup.splice(0)) await dispose();
	vi.useRealTimers();
	delete (SVGElement.prototype as unknown as Record<string, unknown>).getScreenCTM;
	vi.unstubAllGlobals();
	window.history.replaceState(null, '', '/');
});

function render(address = '/editor/') {
	window.history.replaceState(null, '', address);
	const target = document.createElement('div');
	document.body.appendChild(target);
	const component = mount(EditorPage, { target, props: {} });
	flushSync();
	cleanup.push(async () => {
		await unmount(component);
		target.remove();
	});
	const field = (id: string) => target.querySelector<HTMLInputElement>(`#${id}`)!.value;
	return {
		target,
		svg: () => target.querySelector<SVGSVGElement>('.canvas-wrapper > svg')!,
		/** The hit path of the cut drawn `index`th: the left lobe's from its top edge, then the right's from its left edge. */
		cut: (index: number) => target.querySelectorAll<SVGPathElement>('path[stroke-opacity="0.001"]')[index]!,
		cuts: () => target.querySelectorAll('path[stroke-opacity="0.001"]').length,
		name: () => field('name'),
		author: () => field('author'),
		unsaved: () => target.querySelector('.unsaved-dot') !== null
	};
}

function send(target: Element, type: string, p: Vec) {
	target.dispatchEvent(
		new PointerEvent(type, { pointerId: 1, pointerType: 'mouse', button: 0, buttons: type === 'pointerup' ? 0 : 1, clientX: p.x, clientY: p.y, bubbles: true })
	);
	flushSync();
}

/** The autosave's wait, run out. */
function autosave() {
	vi.advanceTimersByTime(600);
	flushSync();
}

// The blank 3 × 3 heart: the square from 187.5 to 412.5 each way, L-0 its top edge, R-2 the right
// lobe's cut at x = 337.5.
const L0 = 0;
const R2 = 6;

describe('the editor page', () => {
	it('opens blank, named, with nothing to save', () => {
		const page = render();
		expect(page.name()).toBe('Mit hjerte');
		expect(page.cuts()).toBe(8);
		expect(page.unsaved()).toBe(false);
		autosave();
		expect(readDraft(storage)).toBeNull();
	});

	it('takes a drag as an edit once it is let go: the unsaved dot, then the draft with the cut where it was dragged', () => {
		const page = render();
		const at = { x: 337.5, y: 260 };
		send(page.cut(R2), 'pointerdown', at);
		send(page.svg(), 'pointermove', { x: at.x + 4, y: at.y });
		send(page.svg(), 'pointermove', { x: at.x + 8, y: at.y });
		send(page.svg(), 'pointerup', { x: at.x + 8, y: at.y });
		expect(page.unsaved()).toBe(true);
		expect(readDraft(storage)).toBeNull();
		autosave();
		const draft = readDraft(storage)!;
		expect(draft.source).toBe('blank');
		const r2 = draft.design.fingers.find((f) => f.id === 'R-2')!;
		expect(r2.segments[0]!.p0.x).toBeCloseTo(337.5 + 8);
		// taken back with Fortryd: nothing left unsaved
		page.target.querySelector<HTMLButtonElement>('button[aria-label="Fortryd"]')!.click();
		flushSync();
		expect(page.unsaved()).toBe(false);
	});

	it('keeps a drag going on when the page is left in the middle of it', () => {
		const page = render();
		const at = { x: 337.5, y: 260 };
		send(page.cut(R2), 'pointerdown', at);
		send(page.svg(), 'pointermove', { x: at.x + 8, y: at.y });
		window.dispatchEvent(new Event('beforeunload'));
		const r2 = readDraft(storage)!.design.fingers.find((f) => f.id === 'R-2')!;
		expect(r2.segments[0]!.p0.x).toBeCloseTo(337.5 + 8);
		send(page.svg(), 'pointerup', { x: at.x + 8, y: at.y });
	});

	it('takes an edge pulled in too little for a strip, which goes back, as an edit that leaves nothing unsaved', () => {
		const page = render();
		const at = { x: 300, y: 187.5 };
		send(page.cut(L0), 'pointerdown', at);
		send(page.svg(), 'pointermove', { x: at.x, y: at.y + 1 });
		send(page.svg(), 'pointerup', { x: at.x, y: at.y + 1 });
		expect(page.cuts()).toBe(8);
		expect(page.unsaved()).toBe(false);
		autosave();
		expect(readDraft(storage)?.design.fingers).toHaveLength(8);
	});

	it('copies a gallery heart (?from=) as the visitor’s own, with nothing to save until it is edited', async () => {
		vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, text: async () => boelgerSvg })));
		const page = render('/editor/?from=boelger');
		await vi.waitFor(() => expect(page.cuts()).toBe(10));
		expect(page.name()).toBe('Bølger (Kopi)');
		expect(page.author()).toBe('');
		expect(page.unsaved()).toBe(false);
		autosave();
		expect(readDraft(storage)).toBeNull();
	});

	it('opens a shared link (#design=) as a copy that keeps its author', () => {
		const design = { ...boelger(), author: 'Ida' };
		const payload = encodeURIComponent(JSON.stringify(serializeHeartDesign(design)));
		const page = render(`/editor/#design=${payload}`);
		expect(page.cuts()).toBe(10);
		expect(page.name()).toBe('Bølger (Kopi)');
		expect(page.author()).toBe('Ida');
		expect(page.unsaved()).toBe(false);
	});

	it('opens a heart of "Mine hjerter" (?edit=true) as itself, and saves a drag back into the collection', () => {
		const design = { ...boelger(), id: 'heart-mine', name: 'Mine bølger' };
		saveUserDesign(design);
		const payload = encodeURIComponent(JSON.stringify(serializeHeartDesign(design)));
		const page = render(`/editor/?edit=true#design=${payload}`);
		expect(page.name()).toBe('Mine bølger');
		const at = { x: 300, y: 250 };
		send(page.cut(7), 'pointerdown', at);
		send(page.svg(), 'pointermove', { x: at.x + 5, y: at.y });
		send(page.svg(), 'pointerup', { x: at.x + 5, y: at.y });
		expect(page.unsaved()).toBe(false);
		autosave();
		expect(readDraft(storage)).toBeNull();
		const saved = getUserCollection().find((h) => h.id === 'heart-mine')!;
		expect(JSON.stringify(saved.fingers)).not.toBe(JSON.stringify(design.fingers));
	});

	it('takes a draft up where it was left ("Fortsæt"), as work not saved', () => {
		writeDraft({ design: { ...boelger(), id: 'heart-draft', name: 'Min kladde' }, source: 'blank', savedAt: 1 }, storage);
		const page = render();
		expect(page.name()).toBe('Mit hjerte');
		const resume = page.target.querySelector<HTMLButtonElement>('.draft-notice button')!;
		resume.click();
		flushSync();
		expect(page.cuts()).toBe(10);
		expect(page.name()).toBe('Min kladde');
		expect(page.unsaved()).toBe(true);
		expect(page.target.querySelector('.draft-notice')).toBeNull();
	});

	it('opens an imported SVG as a new heart, kept as the draft', async () => {
		const page = render();
		const input = page.target.querySelector<HTMLInputElement>('#import-svg')!;
		Object.defineProperty(input, 'files', { configurable: true, value: [new File([boelgerSvg], 'boelger.svg', { type: 'image/svg+xml' })] });
		input.dispatchEvent(new Event('change', { bubbles: true }));
		await vi.waitFor(() => expect(page.cuts()).toBe(10));
		flushSync();
		expect(page.name()).toBe('Bølger');
		expect(page.unsaved()).toBe(true);
		autosave();
		expect(readDraft(storage)?.source).toBe('import');
	});

	it('opens the heart Mal found (?from=session) by its own name, as work not saved', () => {
		handoffToDraw({ ...boelger(), id: 'heart-mal', name: 'Stjerne fra billede', author: '' });
		const page = render('/editor/?from=session');
		expect(page.cuts()).toBe(10);
		expect(page.name()).toBe('Stjerne fra billede');
		expect(page.unsaved()).toBe(true);
		autosave();
		expect(readDraft(storage)?.source).toBe('paint');
	});
});
