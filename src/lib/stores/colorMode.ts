/**
 * The header's "Farverig" / "Colourful" toggle: on, every heart that follows
 * the site's paper pair is woven from its own pair out of $lib/utils/palette
 * instead (docs/redesign/DESIGN.md §3 "Nav", "As built: colours in the header").
 *
 * The mode's whole effect on the page is one class on <html>, COLOR_MODE_CLASS.
 * Every heart already carries its pair in its markup (palette.pairAttributes),
 * prerendered hearts included, and src/app.css only lets the pair through
 * under that class. So a reload with the mode on shows no red and white first:
 * the head's inline script (colorModeHeadScript, written by the root layout)
 * sets the class before the body is parsed. This module keeps the class, the
 * stored setting and its subscribers in step afterwards. Without JavaScript
 * the class is never set and the mode simply is not there.
 */
import { browser } from '$app/environment';
import { readStorage, removeStorage, writeStorage } from '$lib/utils/safeStorage';

/** Under the site's own `juleflet:` prefix, as its other stored settings. "1" when on. */
export const COLOR_MODE_STORAGE_KEY = 'juleflet:colourful';

/** The class on <html> that turns the mode on in CSS. */
export const COLOR_MODE_CLASS = 'colorful';

/**
 * The inline script for the document's <head>: it puts the class on <html>
 * before the body paints when the stored setting says so. Storage that throws
 * leaves the mode off, like the store below.
 */
export function colorModeHeadScript(): string {
	return `<script>${colorModeHeadSource()}</script>`;
}

/** The source alone, so the test can run it. */
export function colorModeHeadSource(): string {
	const key = JSON.stringify(COLOR_MODE_STORAGE_KEY);
	const cls = JSON.stringify(COLOR_MODE_CLASS);
	return `try{if(localStorage.getItem(${key})==="1")document.documentElement.classList.add(${cls})}catch(e){}`;
}

const subscribers = new Set<(on: boolean) => void>();
let current: boolean | null = null;

/** Whether the mode is on: the stored setting, read once. */
export function getColorMode(): boolean {
	if (!browser) return false;
	if (current === null) current = readStorage(COLOR_MODE_STORAGE_KEY) === '1';
	return current;
}

/** Turns the mode on or off: the <html> class, the stored setting and the subscribers. */
export function setColorMode(on: boolean): void {
	current = on;
	if (browser) {
		document.documentElement.classList.toggle(COLOR_MODE_CLASS, on);
		// Blocked or full: the mode still changes, for this page view only.
		if (on) writeStorage(COLOR_MODE_STORAGE_KEY, '1');
		else removeStorage(COLOR_MODE_STORAGE_KEY);
	}
	subscribers.forEach((fn) => fn(on));
}

export function subscribeColorMode(fn: (on: boolean) => void): () => void {
	subscribers.add(fn);
	return () => {
		subscribers.delete(fn);
	};
}
