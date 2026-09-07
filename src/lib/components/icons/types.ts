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
