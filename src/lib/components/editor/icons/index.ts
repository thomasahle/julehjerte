// Editor-only stroke icons (docs/redesign/DESIGN.md §7 — the tool rail).
//
// The shared set in $lib/components/icons covers the site chrome; these five
// node/segment glyphs exist only inside the editor, so they live next to it.
// Same contract: { size = 20, class } plus any SVG attribute, stroke 1.8 in
// `currentColor`, which is what lets the active tool button invert to white.
export { default as NodeAddIcon } from './NodeAddIcon.svelte';
export { default as NodeCornerIcon } from './NodeCornerIcon.svelte';
export { default as NodeSmoothIcon } from './NodeSmoothIcon.svelte';
export { default as NodeSymmetricIcon } from './NodeSymmetricIcon.svelte';
export { default as NodeCurveIcon } from './NodeCurveIcon.svelte';
export { default as SegmentLineIcon } from './SegmentLineIcon.svelte';
export { default as SegmentCurveIcon } from './SegmentCurveIcon.svelte';
