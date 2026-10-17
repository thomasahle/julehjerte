/**
 * The gallery card's interaction in a DOM (docs/redesign/FRONT-SIMPLIFY.md):
 * the card is one link to the heart's page, a checkbox ticks it for the PDF,
 * there is no "Detaljer" link any more, and only the visitor's own hearts can be
 * deleted. What the card looks like is left to the browser QA.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, tick, unmount } from 'svelte';
import HeartCard from './HeartCard.svelte';
import type { GalleryHeart } from '$lib/front/galleryHearts';
import type { Language } from '$lib/i18n';
import { heartHref } from '$lib/i18n/routes';

const heart: GalleryHeart = { id: 'stjerne', name: 'Stjerne', difficulty: 'medium' };
const mine: GalleryHeart = { ...heart, id: 'mit-hjerte', name: 'Mit hjerte', isUserCreated: true };

/** A stand-in for the prerendered SVG; the card never looks inside it. */
const MARKUP = '<svg viewBox="0 0 10 10"></svg>';

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
	vi.stubGlobal('localStorage', memoryStorage());
});

afterEach(() => {
	for (const dispose of cleanup.splice(0)) dispose();
	vi.unstubAllGlobals();
});

interface RenderOptions {
	heart?: GalleryHeart;
	selected?: boolean;
	lang?: Language;
	onSelect?: (heart: GalleryHeart) => void;
	onClick?: (heart: GalleryHeart) => void;
	onDelete?: (heart: GalleryHeart) => void;
}

async function render(options: RenderOptions = {}) {
	const target = document.createElement('div');
	document.body.appendChild(target);
	const component = mount(HeartCard, {
		target,
		props: {
			heart: options.heart ?? heart,
			markup: MARKUP,
			lang: options.lang ?? 'da',
			selected: options.selected ?? false,
			onSelect: options.onSelect,
			onClick: options.onClick,
			onDelete: options.onDelete
		}
	});
	cleanup.push(() => {
		unmount(component);
		target.remove();
	});
	flushSync();
	await tick();
	return {
		target,
		links: () => [...target.querySelectorAll<HTMLAnchorElement>('a')],
		checkbox: () => target.querySelector<HTMLInputElement>('input[type="checkbox"]')!,
		deleteButton: () => target.querySelector<HTMLButtonElement>('.delete-btn')
	};
}

describe('HeartCard', () => {
	it.each<Language>(['da', 'en'])(
		'renders exactly one link, to the heart page, named after the heart (%s)',
		async (lang) => {
			const { links } = await render({ lang });
			expect(links()).toHaveLength(1);
			const [link] = links();
			expect(link.getAttribute('href')).toBe(heartHref(heart.id, lang));
			expect(link.getAttribute('aria-label')).toBe(heart.name);
		}
	);

	it('names the card <article> after the heart', async () => {
		const { target } = await render();
		const card = target.querySelector('article')!;
		const id = card.getAttribute('aria-labelledby')!;
		expect(target.querySelector(`[id="${id}"]`)?.textContent).toBe(heart.name);
	});

	it('records the view when the link is clicked', async () => {
		const onClick = vi.fn();
		const { links } = await render({ onClick });
		// jsdom cannot navigate and says so; the handler is all this is about.
		const [link] = links();
		link.addEventListener('click', (event) => event.preventDefault());
		link.click();
		expect(onClick).toHaveBeenCalledWith(heart);
	});

	it('has no "Detaljer" link', async () => {
		const { target } = await render();
		expect(target.textContent).not.toMatch(/Detaljer|Details/);
		expect(target.querySelector('.details')).toBeNull();
	});

	it('keeps the attributes the hero bootstrap picks cards by', async () => {
		const { target } = await render();
		const card = target.querySelector('article')!;
		expect(card.id).toBe('heart-stjerne');
		expect(card.dataset.heartId).toBe(heart.id);
		expect(card.dataset.heartName).toBe(heart.name);
		expect(card.hasAttribute('data-user')).toBe(false);
		// The hero clones the card's first <svg>: it has to be the heart.
		expect(card.querySelector('svg')?.getAttribute('viewBox')).toBe('0 0 10 10');
	});

	it('labels the checkbox for the PDF, in both languages', async () => {
		const da = await render();
		expect(da.checkbox().getAttribute('aria-label')).toBe('Vælg til PDF: Stjerne');
		// No <label> text of its own: it would be read again after the checkbox.
		expect(da.target.querySelector('label')).toBeNull();
		expect(da.target.querySelector('.card')!.textContent).not.toContain('Vælg til PDF');
		const en = await render({ lang: 'en', heart: { ...heart, id: 'star' } });
		expect(en.checkbox().getAttribute('aria-label')).toBe('Select for PDF: Stjerne');
		// Two cards on a page must not share a checkbox id.
		expect(en.checkbox().id).not.toBe(da.checkbox().id);
	});

	it('reflects `selected` in the checkbox', async () => {
		expect((await render({ selected: false })).checkbox().checked).toBe(false);
		const ticked = await render({ selected: true, heart: { ...heart, id: 'b' } });
		expect(ticked.checkbox().checked).toBe(true);
		expect(ticked.target.querySelector('article')!.classList.contains('is-selected')).toBe(true);
	});

	it('calls onSelect when the checkbox is toggled, and does not open the heart', async () => {
		const onSelect = vi.fn();
		const onClick = vi.fn();
		const { checkbox } = await render({ onSelect, onClick });
		checkbox().click();
		expect(onSelect).toHaveBeenCalledTimes(1);
		expect(onSelect).toHaveBeenCalledWith(heart);
		checkbox().click();
		expect(onSelect).toHaveBeenCalledTimes(2);
		expect(onClick).not.toHaveBeenCalled();
	});

	it('offers delete only for the visitor\'s own hearts', async () => {
		const onDelete = vi.fn();
		expect((await render({ onDelete })).deleteButton()).toBeNull();
		const own = await render({ heart: mine, onDelete });
		expect(own.target.querySelector('article')!.hasAttribute('data-user')).toBe(true);
		// Named after the heart, so several delete buttons do not all sound alike.
		expect(own.deleteButton()!.getAttribute('aria-label')).toBe('Slet Mit hjerte');
		own.deleteButton()!.click();
		expect(onDelete).toHaveBeenCalledWith(mine);
	});
});
