/**
 * The scene's markup order (performance QA, M1): the landscape comes after the
 * scene's content, so a page painted while it is still parsing never shows the
 * phone's in-flow band at the top of an empty scene and then moves it down.
 * That it still *paints* under the content (z-index -1 in the scene's own
 * stacking context) is a pixel question, left to the browser QA.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { createRawSnippet, flushSync, mount, unmount } from 'svelte';
import Scene from './Scene.svelte';

const cleanup: (() => void)[] = [];
afterEach(() => {
	while (cleanup.length) cleanup.pop()!();
	document.body.innerHTML = '';
});

const content = createRawSnippet(() => ({ render: () => '<div class="content">hero</div>' }));

function render(band: number | null) {
	const target = document.createElement('div');
	document.body.append(target);
	const component = mount(Scene, { target, props: { band, children: content } });
	flushSync();
	cleanup.push(() => unmount(component));
	return target.querySelector('section')!;
}

describe('Scene', () => {
	for (const band of [null, 230]) {
		it(`puts the landscape after the content (band ${band})`, () => {
			const section = render(band);
			const children = [...section.children];
			expect(children.map((el) => el.className.split(' ')[0])).toEqual(['content', 'scene-land']);
			expect(section.lastElementChild?.hasAttribute('data-scene-land')).toBe(true);
			expect(section.lastElementChild?.querySelector('svg')).not.toBeNull();
		});
	}
});
