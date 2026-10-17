/**
 * The stacked hero's markup order (performance QA, M1): everything pinned to
 * the foot of the scene — the corner firs, the scroll hint and the landscape
 * band — comes after the hero's content, so a page painted mid-parse never
 * shows them at the foot of a scene that is still growing.
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
		expect(order).toEqual(['hero-sky-m', 'hero-inner', 'hero-tree-m', 'scroll-hint', 'scene-land']);
	});
});
