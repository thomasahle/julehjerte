/**
 * The stacked hero's markup order (performance QA, M1): everything pinned to
 * the foot of the scene — the corner firs and the landscape band — comes after
 * the hero's content, so a page painted mid-parse never shows them at the foot
 * of a scene that is still growing. The scroll hint is not pinned: it follows
 * the buttons in the text column, in the sky above the band.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import Hero from './Hero.svelte';

let component: ReturnType<typeof mount> | null = null;
afterEach(() => {
	if (component) unmount(component);
	component = null;
	document.body.innerHTML = '';
});

describe('Hero', () => {
	it('puts the foot-pinned layers after the hero text', () => {
		const target = document.createElement('div');
		document.body.append(target);
		component = mount(Hero, { target, props: { lang: 'da', desktop: [], mobile: [] } });
		flushSync();
		const section = target.querySelector('section')!;
		const order = [...section.children].map((el) => el.getAttribute('class')?.split(' ')[0]);
		expect(order).toEqual(['hero-sky-m', 'hero-inner', 'hero-tree-m', 'scene-land']);
	});

	it('puts the scroll hint in flow right after the buttons', () => {
		const target = document.createElement('div');
		document.body.append(target);
		component = mount(Hero, { target, props: { lang: 'da', desktop: [], mobile: [] } });
		flushSync();
		const hint = target.querySelector('.scroll-hint')!;
		expect(hint.parentElement?.classList.contains('hero-text')).toBe(true);
		expect(hint.previousElementSibling?.classList.contains('hero-btns')).toBe(true);
		expect(hint.nextElementSibling).toBeNull();
		expect(hint.getAttribute('href')).toBe('#skabeloner');
	});

	// The desktop hero hides the drawing's stars and dots that fall inside its
	// text column by position in their groups (Hero.svelte's stylesheet). If the
	// drawing is ever reordered, the rule would hide the wrong ones.
	it('hides the sky decorations behind the text by their place in the drawing', () => {
		const target = document.createElement('div');
		document.body.append(target);
		component = mount(Hero, { target, props: { lang: 'da', desktop: [], mobile: [] } });
		flushSync();
		const land = target.querySelector('.hero-inner ~ [data-scene-land]')!;
		expect(land).not.toBeNull();
		const stars = [...land.querySelectorAll('#stars > use')].map((u) => u.getAttribute('transform'));
		expect(stars.slice(0, 2)).toEqual(['translate(243 134)', 'translate(707 253) scale(.83)']);
		const dots = [...land.querySelectorAll('#snowflakes > circle')].map((c) => Number(c.getAttribute('cx')));
		expect(dots.slice(0, 5)).toEqual([86, 151, 335, 435, 626]);
		// Everything after them is right of the text column at every width.
		expect(Math.min(...dots.slice(5))).toBeGreaterThan(1000);
	});
});
