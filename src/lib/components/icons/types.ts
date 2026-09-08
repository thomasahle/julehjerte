import type { LucideProps } from '@lucide/svelte';

/**
 * Props shared by every icon in the site chrome and the editor's tool rail.
 *
 * This is lucide's own props type, so the re-exports in `./index.ts` and the
 * few hand-drawn glyphs beside them (WeaveIcon, `$lib/components/editor/icons`)
 * are interchangeable wherever a call site takes an icon `Component<IconProps>`.
 *
 * `size` is width and height in px — 18 inside `.btn`, 24 for the gallery steps
 * — and the icon paints with `stroke: currentColor`.
 */
export type IconProps = LucideProps;

/**
 * Opacity of the part a hand-drawn glyph holds back — the lobe the cuts sit in,
 * the frame of the woven square — so the subject is read first.
 *
 * It is the `.soft` class of docs/redesign/symmetri-ikoner.html, where all of
 * these were drawn, and it belongs to that family of glyphs as a whole: the
 * symmetry table and the two Tegning icons both draw with it, so it sits here
 * beside IconProps rather than inside one of them.
 */
export const SOFT_OPACITY = 0.45;
