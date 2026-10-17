/**
 * The dead-end page shared by /nope/ (+error.svelte) and /hjerte/nope/ (the
 * heart page for an id that names no heart): one h1, one sentence, and links
 * that lead on. How it looks is left to the browser QA.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import StatusPage from './StatusPage.svelte';
import { t, type Language } from '$lib/i18n';
import { editorHref, href } from '$lib/i18n/routes';
import { firstSentence } from '$lib/utils/text';

const cleanup: (() => void)[] = [];

afterEach(() => {
	for (const dispose of cleanup.splice(0)) dispose();
});

/** The props the heart page passes when the heart is not found. */
function heartNotFoundProps(lang: Language) {
	return {
		status: 404,
		title: t('heartNotFound', lang),
		text: t('heartNotFoundHint', lang),
		links: [
			{ href: href('home', lang), label: t('heartNotFoundGallery', lang) },
			{ href: editorHref(lang), label: t('heartNotFoundEditor', lang) }
		]
	};
}

function render(lang: Language) {
	const target = document.createElement('div');
	document.body.appendChild(target);
	const component = mount(StatusPage, { target, props: heartNotFoundProps(lang) });
	cleanup.push(() => {
		unmount(component);
		target.remove();
	});
	flushSync();
	return target;
}

describe('StatusPage for a heart that is not found', () => {
	it.each([
		['da', 'Hjertet blev ikke fundet', '/', '/editor/'],
		['en', 'Heart not found', '/en/', '/en/editor/']
	] as const)('has a heading and links to the gallery and the editor (%s)', (lang, title, home, editor) => {
		const target = render(lang);
		const headings = target.querySelectorAll('h1');
		expect(headings).toHaveLength(1);
		expect(headings[0].textContent).toBe(title);
		expect(target.querySelector('main#main-content')).not.toBeNull();
		// The big number is decoration, not a second heading.
		expect(target.querySelector('.error-code')?.getAttribute('aria-hidden')).toBe('true');
		const links = [...target.querySelectorAll('a')].map((a) => [a.getAttribute('href'), a.textContent]);
		expect(links).toEqual([
			[home, t('heartNotFoundGallery', lang)],
			[editor, t('heartNotFoundEditor', lang)]
		]);
		expect(target.querySelector('.error-description')?.textContent).toBe(t('heartNotFoundHint', lang));
	});

	it('says it in one sentence in both languages', () => {
		for (const lang of ['da', 'en'] as const) {
			const hint = t('heartNotFoundHint', lang);
			expect(hint).toMatch(/\.$/);
			expect(firstSentence(hint)).toBe(hint);
		}
	});
});
