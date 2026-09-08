/**
 * The single icon import point for the whole site — docs/redesign/DESIGN.md §1.
 *
 * These are lucide's icons, re-exported under the names the redesign uses, so
 * there is one icon source and one stroke weight (lucide's default 2) across
 * site chrome, the editor and the shadcn primitives — which import the same
 * lucide modules internally. Import from here, never from `@lucide/svelte`
 * directly, outside `$lib/components/ui/`.
 *
 * Every icon takes `size` (px, width and height), paints with `currentColor`,
 * and adds `aria-hidden="true"` on its own unless the call site passes an
 * accessible name, so they stay decorative by default.
 *
 * Only glyphs lucide has no equivalent for are kept as files here (WeaveIcon);
 * the editor's node and segment glyphs live in `$lib/components/editor/icons`.
 */
export { default as ArrowLeftIcon } from '@lucide/svelte/icons/arrow-left';
export { default as ArrowRightIcon } from '@lucide/svelte/icons/arrow-right';
export { default as CheckIcon } from '@lucide/svelte/icons/check';
export { default as ChevronRightIcon } from '@lucide/svelte/icons/chevron-right';
export { default as CloseIcon } from '@lucide/svelte/icons/x';
export { default as DownloadIcon } from '@lucide/svelte/icons/download';
export { default as EraserIcon } from '@lucide/svelte/icons/eraser';
export { default as ExternalIcon } from '@lucide/svelte/icons/external-link';
export { default as FitIcon } from '@lucide/svelte/icons/maximize';
export { default as GearIcon } from '@lucide/svelte/icons/settings';
export { default as HelpIcon } from '@lucide/svelte/icons/circle-help';
export { default as ImageIcon } from '@lucide/svelte/icons/image';
export { default as LineIcon } from '@lucide/svelte/icons/minus';
export { default as MenuIcon } from '@lucide/svelte/icons/menu';
export { default as PaintBucketIcon } from '@lucide/svelte/icons/paint-bucket';
export { default as PaintbrushIcon } from '@lucide/svelte/icons/paintbrush';
export { default as PencilIcon } from '@lucide/svelte/icons/pencil';
export { default as PlusIcon } from '@lucide/svelte/icons/plus';
export { default as PrinterIcon } from '@lucide/svelte/icons/printer';
export { default as RedoIcon } from '@lucide/svelte/icons/redo-2';
export { default as SaveIcon } from '@lucide/svelte/icons/save';
export { default as ScissorsIcon } from '@lucide/svelte/icons/scissors';
export { default as ShareIcon } from '@lucide/svelte/icons/share-2';
export { default as SquareIcon } from '@lucide/svelte/icons/square';
export { default as StarIcon } from '@lucide/svelte/icons/star';
export { default as SwapIcon } from '@lucide/svelte/icons/arrow-left-right';
export { default as TrashIcon } from '@lucide/svelte/icons/trash-2';
export { default as UndoIcon } from '@lucide/svelte/icons/undo-2';
export { default as UploadIcon } from '@lucide/svelte/icons/upload';

/** Paper strips woven into a lattice — no lucide equivalent. */
export { default as WeaveIcon } from './WeaveIcon.svelte';

/**
 * The editor's symmetry glyphs — the pictures the owner chose in
 * docs/redesign/symmetri-ikoner.html. They draw cuts and lobes, which lucide
 * has nothing for, and they carry a little more line than the rest, so they
 * take `size = 28` and stroke 1.8 rather than 20 and 2.
 */
export { default as SymmetryIcon } from './SymmetryIcon.svelte';

export type { IconProps } from './types';
export type { SymmetryIconMode, SymmetryIconRow } from './symmetryIcons';
