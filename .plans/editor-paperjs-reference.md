## Paper.js editor reference (removed)

The previous (Paper.js-based) editor implementation is still available in git history:

- Commit: `d83bd19` (latest Paper.js editor before SVG refactor)
- File: `src/lib/components/PaperHeart.svelte`

To view it:

`git show d83bd19:src/lib/components/PaperHeart.svelte`

This is the source of truth for “feature parity” (symmetry modes, snapping/constraints, segment add/remove, keyboard shortcuts, etc).

Notes:
- Older Paper editor versions exist (e.g. `4be727a`) but `d83bd19` includes additional tools like segment selection, straight/curve segment toggles, and pinch-to-zoom.
