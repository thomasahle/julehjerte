/**
 * The hearts the front page's hero is prerendered with (docs/redesign/DESIGN.md §3).
 *
 * The hero shows a random draw from the gallery, but the *prerender* cannot: it
 * has to be a fixed set, or every build would produce a different page. So the
 * HTML ships these hearts and the inline script in $lib/front/heroBootstrap
 * swaps in the random set while the page is still parsing — it draws from the
 * gallery cards below, which is the same pool by construction (a heart the
 * visitor drew lives in localStorage and is not in the HTML at all).
 *
 * The fixed set is never seen by a visitor whose browser runs that script: the
 * slots are invisible until it has finished. It is what `html.no-js` gets.
 */

/**
 * The five hearts baked into the prerendered hero, in DOM order (long ribbons
 * first, so they pass behind the shorter hearts).
 */
export const HERO_HEART_IDS = [
	'nemt-hjerte',
	'snowflake',
	'jul',
	'classic-3x3',
	'stjerne'
] as const;

/** The three hearts of the stacked hero below 900px, in DOM order. */
export const HERO_HEART_IDS_MOBILE = ['jul', 'stjerne', 'classic-3x3'] as const;
