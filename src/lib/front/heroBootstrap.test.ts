import { describe, it, expect, beforeEach } from 'vitest';
import { HERO_PICKS_ATTRIBUTE, heroBootstrapSource } from './heroBootstrap';

const LABEL = 'Gå til {name} i galleriet';

/**
 * The bit of the front page the script talks to: hero layers with empty-ish
 * slots, and a gallery of cards with a finished heart in each. Shaped like the
 * real markup (HeroHearts, HeartCard, HangingHeart), including the comments
 * Svelte hydrates the `{@html}` block by, which the script must leave in place.
 */
function page({ cards = 6, userCards = 0 } = {}) {
	const slot = (i: number) =>
		`<div class="slot"><a class="slot-link" href="#" aria-label="placeholder">` +
		`<div class="hang"><div class="ribbon" style="background: rgb(0, 0, 0);"></div>` +
		`<div class="heart"><!--[--><!---->${heartSvg(`hero-${i}`)}<!----><!--]--></div>` +
		`</div></a></div>`;

	const card = (id: string, name: string, user: boolean) =>
		`<article id="heart-${id}" data-heart-id="${id}" data-heart-name="${name}"` +
		`${user ? ' data-user=""' : ''}><div class="card-heart"><div class="hang">` +
		`<div class="ribbon" style="background: rgb(9, 9, ${9 + Number(user)});"></div>` +
		`<div class="heart">${heartSvg(`card-${id}`)}</div></div></div></article>`;

	const gallery = [
		...Array.from({ length: cards }, (_, i) => card(`h${i}`, `Heart ${i}`, false)),
		...Array.from({ length: userCards }, (_, i) => card(`u${i}`, `Mit ${i}`, true))
	].join('');

	document.body.innerHTML =
		`<div data-hero-layer="hero-d">${[0, 1, 2, 3, 4].map(slot).join('')}</div>` +
		`<div data-hero-layer="hero-m">${[5, 6, 7].map(slot).join('')}</div>` +
		`<div id="skabeloner">${gallery}</div>`;
}

function heartSvg(idPrefix: string): string {
	return (
		`<svg class="paper-heart-svg"><g><defs><clipPath id="overlap-${idPrefix}">` +
		`<rect /></clipPath></defs><g clip-path="url(#overlap-${idPrefix})"><path /></g></g></svg>`
	);
}

function run() {
	// The script is source text on purpose — it runs inline, before any module.
	(0, eval)(heroBootstrapSource(LABEL));
}

function slotsOf(layer: string): HTMLElement[] {
	return [...document.querySelectorAll<HTMLElement>(`[data-hero-layer="${layer}"] .slot`)];
}

function heartIdIn(slot: HTMLElement): string | null {
	const clip = slot.querySelector('.heart [id]');
	// "hero-d-0-overlap-card-h3" -> "h3"
	return clip?.id.replace(/^.*overlap-card-/, '') ?? null;
}

beforeEach(() => {
	document.documentElement.className = '';
	document.documentElement.removeAttribute(HERO_PICKS_ATTRIBUTE);
});

describe('the hero bootstrap script', () => {
	it('hangs a distinct gallery heart in every slot', () => {
		page();
		run();

		const ids = slotsOf('hero-d').map(heartIdIn);
		expect(ids).toHaveLength(5);
		expect(ids.every((id) => id && /^h\d$/.test(id))).toBe(true);
		expect(new Set(ids).size).toBe(5);
	});

	it('gives the stacked hero the first hearts of the same draw', () => {
		page();
		run();

		expect(slotsOf('hero-m').map(heartIdIn)).toEqual(slotsOf('hero-d').map(heartIdIn).slice(0, 3));
	});

	it('never draws a heart the visitor made', () => {
		page({ cards: 5, userCards: 4 });
		run();

		for (const id of slotsOf('hero-d').map(heartIdIn)) expect(id).toMatch(/^h\d$/);
	});

	it('gives each copy its own clip-path ids', () => {
		page();
		run();

		const ids = [...document.querySelectorAll('[data-hero-layer] .heart [id]')].map((el) => el.id);
		expect(new Set(ids).size).toBe(ids.length);
		for (const slot of [...slotsOf('hero-d'), ...slotsOf('hero-m')]) {
			const owner = slot.querySelector('.heart [id]')!;
			const user = slot.querySelector('.heart [clip-path]')!;
			expect(user.getAttribute('clip-path')).toBe(`url(#${owner.id})`);
		}
	});

	it('leaves the anchor comments around the heart in place', () => {
		page();
		run();

		for (const slot of slotsOf('hero-d')) {
			const kinds = [...slot.querySelector('.heart')!.childNodes].map((n) => n.nodeType);
			expect(kinds).toEqual([
				Node.COMMENT_NODE,
				Node.COMMENT_NODE,
				Node.ELEMENT_NODE,
				Node.COMMENT_NODE,
				Node.COMMENT_NODE
			]);
		}
	});

	it('points each slot at its heart’s card, in the page’s language', () => {
		page();
		run();

		for (const slot of slotsOf('hero-d')) {
			const id = heartIdIn(slot);
			const link = slot.querySelector('a')!;
			expect(link.getAttribute('href')).toBe(`#heart-${id}`);
			expect(link.getAttribute('aria-label')).toBe(
				`Gå til Heart ${id!.slice(1)} i galleriet`
			);
		}
	});

	it('takes the ribbon colour from the card it copied', () => {
		page();
		run();

		for (const slot of slotsOf('hero-d')) {
			const ribbon = slot.querySelector<HTMLElement>('.ribbon')!;
			expect(ribbon.style.background).toBe('rgb(9, 9, 9)');
		}
	});

	it('leaves the gallery it copied from alone', () => {
		page();
		const before = document.getElementById('skabeloner')!.innerHTML;
		run();
		expect(document.getElementById('skabeloner')!.innerHTML).toBe(before);
	});

	it('reveals the hero even when there is nothing to hang', () => {
		document.body.innerHTML = '<div data-hero-layer="hero-d"></div>';
		run();
		expect(document.documentElement.classList.contains('hero-ready')).toBe(true);
	});

	it('leaves its draw where the page can read it back', () => {
		page();
		run();

		const published = document.documentElement.getAttribute(HERO_PICKS_ATTRIBUTE)!.split(' ');
		expect(published).toEqual(slotsOf('hero-d').map(heartIdIn));
	});

	it('reveals the hero once the slots are filled', () => {
		page();
		run();
		expect(document.documentElement.classList.contains('hero-ready')).toBe(true);
	});
});
