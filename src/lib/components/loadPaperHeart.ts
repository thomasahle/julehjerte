/**
 * PaperHeartSVG on demand, for the front page's hearts (see HangingHeart's
 * `loadPaper`). They are prerendered as markup, so the drawing code (the
 * component and the weave renderer under it) is only needed after a
 * client-side navigation or for the visitor's own hearts, and this keeps it
 * out of the page's first load.
 *
 * Only the front page's components may import this: a page that also imports
 * PaperHeartSVG statically can lose its stylesheet (see HangingHeart).
 */
export const loadPaperHeart = () => import('$lib/components/PaperHeartSVG.svelte');
