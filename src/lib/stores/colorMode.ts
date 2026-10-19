/**
 * The header's "Farverig" / "Colourful" button: each press gives every heart
 * that follows the site's paper pair a new random pair out of
 * $lib/utils/palette (docs/redesign/DESIGN.md §3 "Nav", "As built: colours in
 * the header"). Choosing a pair with the header's other two buttons turns the
 * mode off.
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
import {
	COLORS_STORAGE_KEY,
	CUSTOM_COLORS_STORAGE_KEY,
	CUSTOM_PAIR_CLASS,
	DEFAULT_COLORS_HEX,
	PAPER_KIND_CLASSES
} from '$lib/stores/colors';

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
 * The inline script for the document's <head>. Before the body paints it puts
 * on <html>:
 *   - the site's paper pair from storage, as `--paper-left` / `--paper-right`
 *     with `paper-flipped` or `paper-custom` (colors.paperKind's rule), so the
 *     prerendered hearts and the header's colour buttons start in the pair the
 *     visitor chose;
 *   - the visitor's own pair, saved apart from the one on show, as
 *     `--custom-left` / `--custom-right` with `paper-has-custom`, for the
 *     custom button's picture (colors.getCustomColors);
 *   - with a shuffle stored, the colourful class and the shuffle's variables.
 * The same rules as parseStoredPermutation, paletteVariables and paperKind, in
 * plain ES5; colorMode.test.ts checks they agree. Storage that throws, or holds
 * something unreadable, leaves the defaults.
 */
export function colorModeHeadScript(): string {
	return `<script>${colorModeHeadSource()}</script>`;
}

/** The source alone, so the test can run it. */
export function colorModeHeadSource(): string {
	const pairs = JSON.stringify(PALETTE.map((p) => [p.left, p.right, p.edge ? 1 : 0, p.family]));
	const white = JSON.stringify(DEFAULT_COLORS_HEX.left);
	const red = JSON.stringify(DEFAULT_COLORS_HEX.right);
	const paper =
		`try{(function(t){if(!t)return;var c=JSON.parse(t);if(!c||typeof c.left!=="string"||typeof c.right!=="string"||!c.left||!c.right)return;` +
		`var r=document.documentElement;r.style.setProperty("--paper-left",c.left);r.style.setProperty("--paper-right",c.right);` +
		`function h(v){v=v.replace(/\\s+/g,"").toLowerCase();var m=/^rgb\\((\\d+),(\\d+),(\\d+)\\)$/.exec(v);` +
		`if(m){v="#";for(var k=1;k<4;k++){var x=(+m[k]).toString(16);v+=x.length<2?"0"+x:x}}` +
		`else if(/^#[0-9a-f]{3}$/.test(v)){v="#"+v[1]+v[1]+v[2]+v[2]+v[3]+v[3]}return v}` +
		`var L=h(c.left),R=h(c.right);if(L===${white}&&R===${red})return;` +
		`r.classList.add(L===${red}&&R===${white}?${JSON.stringify(PAPER_KIND_CLASSES.flipped)}:${JSON.stringify(PAPER_KIND_CLASSES.custom)})` +
		`})(localStorage.getItem(${JSON.stringify(COLORS_STORAGE_KEY)}))}catch(e){}`;
	const mode =
		`try{(function(t,P,E){if(t===null)return;var n=P.length,p=[],s={},i;` +
		`if(t==="1"){for(i=0;i<n;i++)p.push(i)}else{var a=t.split(",");if(a.length!==n)return;` +
		`for(i=0;i<n;i++){if(!/^\\d+$/.test(a[i]))return;var v=+a[i];if(v>=n||s[v])return;s[v]=1;p.push(v)}}` +
		`var r=document.documentElement;for(i=0;i<n;i++){var q=P[p[i]];` +
		`r.style.setProperty("--pal-"+i+"-l",q[0]);r.style.setProperty("--pal-"+i+"-r",q[1]);` +
		`r.style.setProperty("--pal-"+i+"-o",q[2]?E:"transparent")}` +
		`var f={},c=0;for(i=0;i<n&&c<4;i++){var w=P[p[i]];if(f[w[3]])continue;f[w[3]]=1;r.style.setProperty("--pal-icon-"+c,w[1]);c++}` +
		`r.classList.add(${JSON.stringify(COLOR_MODE_CLASS)})` +
		`})(localStorage.getItem(${JSON.stringify(COLOR_MODE_STORAGE_KEY)}),${pairs},${JSON.stringify(EDGE_COLOR)})}catch(e){}`;
	// The visitor's own pair, for the custom button's picture; before one is
	// saved, a custom pair on show counts as it (colors.getCustomColors).
	const custom =
		`try{(function(t){var r=document.documentElement,c=null;try{c=JSON.parse(t)}catch(e){}` +
		`if(!c||typeof c.left!=="string"||typeof c.right!=="string"||!c.left||!c.right){` +
		`if(!r.classList.contains(${JSON.stringify(PAPER_KIND_CLASSES.custom)}))return;` +
		`c={left:r.style.getPropertyValue("--paper-left"),right:r.style.getPropertyValue("--paper-right")}}` +
		`r.style.setProperty("--custom-left",c.left);r.style.setProperty("--custom-right",c.right);` +
		`r.classList.add(${JSON.stringify(CUSTOM_PAIR_CLASS)})` +
		`})(localStorage.getItem(${JSON.stringify(CUSTOM_COLORS_STORAGE_KEY)}))}catch(e){}`;
	return paper + custom + mode;
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
