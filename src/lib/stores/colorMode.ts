/**
 * The header's "Farverig" / "Colourful" button: each press gives every heart
 * that follows the site's paper pair a new random pair out of
 * $lib/utils/palette (docs/redesign/DESIGN.md §3 "Nav", "As built: colours in
 * the header"). Picking a swatch colour or swapping turns the mode off.
 *
 * Every heart already carries its slot in its markup (palette.pairAttributes),
 * prerendered hearts included. The mode's whole effect on the page is one class
 * on <html>, COLOR_MODE_CLASS, plus the shuffle as `--pal-<slot>-*` variables
 * on <html> (palette.paletteVariables), which src/app.css only lets through
 * under that class. So a press repaints the page without touching a heart, and
 * a reload shows the last shuffle with no red and white first: the head's
 * inline script (colorModeHeadScript, written by the root layout) sets the
 * class and the variables before the body is parsed. Without JavaScript the
 * class is never set and the mode simply is not there.
 *
 * Stored under COLOR_MODE_STORAGE_KEY as the permutation, "3,0,7,…"; nothing
 * stored means off. "1", what the first version stored, is the unshuffled
 * palette.
 */
import { browser } from '$app/environment';
import {
	IDENTITY,
	PALETTE,
	EDGE_COLOR,
	isPermutation,
	paletteVariables,
	randomPermutation,
	type Permutation
} from '$lib/utils/palette';
import { readStorage, removeStorage, writeStorage } from '$lib/utils/safeStorage';

/** Under the site's own `juleflet:` prefix, as its other stored settings. */
export const COLOR_MODE_STORAGE_KEY = 'juleflet:colourful';

/** The class on <html> that turns the mode on in CSS. */
export const COLOR_MODE_CLASS = 'colorful';

/** The stored text's permutation, or null for off (or anything unreadable). */
export function parseStoredPermutation(text: string | null): Permutation | null {
	if (text === null) return null;
	if (text === '1') return IDENTITY;
	const p = text.split(',').map((v) => (/^\d+$/.test(v) ? Number(v) : NaN));
	return isPermutation(p) ? p : null;
}

/**
 * The inline script for the document's <head>: with a shuffle stored it puts
 * the class on <html> and sets the shuffle's variables before the body paints.
 * The same rules as parseStoredPermutation and paletteVariables, in plain ES5;
 * colorMode.test.ts checks the two agree. Storage that throws leaves the mode
 * off, like the store below.
 */
export function colorModeHeadScript(): string {
	return `<script>${colorModeHeadSource()}</script>`;
}

/** The source alone, so the test can run it. */
export function colorModeHeadSource(): string {
	const pairs = JSON.stringify(PALETTE.map((p) => [p.left, p.right, p.edge ? 1 : 0]));
	return (
		`try{(function(t,P,E){if(t===null)return;var n=P.length,p=[],s={},i;` +
		`if(t==="1"){for(i=0;i<n;i++)p.push(i)}else{var a=t.split(",");if(a.length!==n)return;` +
		`for(i=0;i<n;i++){if(!/^\\d+$/.test(a[i]))return;var v=+a[i];if(v>=n||s[v])return;s[v]=1;p.push(v)}}` +
		`var r=document.documentElement;for(i=0;i<n;i++){var q=P[p[i]];` +
		`r.style.setProperty("--pal-"+i+"-l",q[0]);r.style.setProperty("--pal-"+i+"-r",q[1]);` +
		`r.style.setProperty("--pal-"+i+"-o",q[2]?E:"transparent")}` +
		`r.classList.add(${JSON.stringify(COLOR_MODE_CLASS)})` +
		`})(localStorage.getItem(${JSON.stringify(COLOR_MODE_STORAGE_KEY)}),${pairs},${JSON.stringify(EDGE_COLOR)})}catch(e){}`
	);
}

const subscribers = new Set<(on: boolean) => void>();
let current: Permutation | null | undefined;

function stored(): Permutation | null {
	if (current === undefined) current = browser ? parseStoredPermutation(readStorage(COLOR_MODE_STORAGE_KEY)) : null;
	return current;
}

/** Whether the mode is on. */
export function getColorMode(): boolean {
	return browser && stored() !== null;
}

/** The shuffle on show, or null when the mode is off. */
export function getPermutation(): Permutation | null {
	return browser ? stored() : null;
}

function apply(permutation: Permutation | null) {
	current = permutation;
	if (browser) {
		const root = document.documentElement;
		if (permutation) {
			for (const [name, value] of Object.entries(paletteVariables(permutation))) {
				root.style.setProperty(name, value);
			}
		}
		root.classList.toggle(COLOR_MODE_CLASS, permutation !== null);
		// Blocked or full: the mode still changes, for this page view only.
		if (permutation) writeStorage(COLOR_MODE_STORAGE_KEY, permutation.join(','));
		else removeStorage(COLOR_MODE_STORAGE_KEY);
	}
	subscribers.forEach((fn) => fn(permutation !== null));
}

/**
 * Turns the mode on with a new random shuffle, never the one on show. `random`
 * is for the tests.
 */
export function shuffleColorMode(random: () => number = Math.random): Permutation {
	const next = randomPermutation(random, stored() ?? undefined);
	apply(next);
	return next;
}

/** Turns the mode off: the hearts go back to the site's pair. */
export function turnOffColorMode(): void {
	apply(null);
}

export function subscribeColorMode(fn: (on: boolean) => void): () => void {
	subscribers.add(fn);
	return () => {
		subscribers.delete(fn);
	};
}
