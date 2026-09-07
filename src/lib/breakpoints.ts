/**
 * The media queries JavaScript switches on, so the JS and the CSS change at the
 * same pixel.
 *
 * The breakpoint list itself is documented once in src/app.css; these are the
 * two of the six that code, not only stylesheets, has to react to. Import from
 * here instead of re-typing the string — before this module the editor and
 * PaperHeart each spelled the narrow query as `(max-width: 900px)` while every
 * stylesheet in the site used `max-width: 899px`, so at a viewport of exactly
 * 900px the editor drew its phone canvas inside the desktop layout.
 */

/** Below the 900px breakpoint: stacked / tablet layouts. Pairs with `max-width: 899px`. */
export const NARROW_QUERY = '(max-width: 899px)';

/** At or above 1400px: wide enough for the gallery frame decoration. */
export const WIDE_FRAME_QUERY = '(min-width: 1400px)';
