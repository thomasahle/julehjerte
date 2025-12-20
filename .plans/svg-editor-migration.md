---
name: svg-editor-migration
description: Plan to replace Paper.js editor with SVG-only and remove paper dependency
---

# Plan

Replace the remaining Paper.js usage (the interactive editor and any Paper-dependent utilities) with an SVG-only implementation so the `paper` dependency can be removed entirely.

## Requirements
- No hybrid renderer (no `<canvas>` layers); SVG-only for editor rendering.
- Preserve the existing `HeartDesign` / `Finger` data model and SVG import/export format.
- Maintain editor UX parity: selecting/dragging curves + handles, snapping, symmetry modes, undo/redo, zoom/pan (mouse + touch), and acceptable performance.
- Ensure readonly rendering, previews, and PDF generation continue to use the SVG pipeline.

## Scope
- In:
  - Replace `src/lib/components/PaperHeart.svelte` with an SVG editor component.
  - Remove any remaining runtime/build-time usage of `paper` in `src/` and scripts.
  - Delete/retire Paper-only modules once unused and remove `paper` from dependencies.
- Out:
  - Redesigning the editor UX or changing design file formats.

## Current Status
- Readonly rendering is SVG-based (gallery, detail previews, PDF preview rasterization).
- Paper.js remains for the interactive editor route and related Paper-specific helper code.

## Files and Entry Points
- Editor route: `src/routes/editor/+page.svelte`
- Current Paper editor: `src/lib/components/PaperHeart.svelte`
- Paper rendering helpers (legacy/editor-only): `src/lib/rendering/paperWeave.ts`
- SVG rendering: `src/lib/components/PaperHeartSVG.svelte`, `src/lib/rendering/svgWeave.ts`, `src/lib/rendering/heartSvg.ts`
- Paper-dependent scripts: `scripts/render-heart-png.ts`, `scripts/bench-snap.ts`, `scripts/bench-weave.mjs`
- Dependency manifest: `package.json`

## Data Model / API Changes
- None intended.
- New component will mirror the existing editor component’s props/events:
  - Props: `initialFingers`, `initialGridSize`, `initialWeaveParity`, `readonly?`
  - Callback: `onFingersChange(fingers, gridSize, weaveParity)`

## Action Items
[ ] Define `SvgHeartEditor.svelte` public API to match `PaperHeart` (props/events) and add it beside the existing component.
[ ] Implement SVG-only rendering for editor mode:
    - Lobes + weave (reuse `svgWeave`/`heartSvg` logic)
    - Optional outlines/handles/selection UI (render minimal DOM; only when needed)
[ ] Implement a view transform model:
    - Maintain a world↔screen transform matrix
    - Apply transform via a single `<g transform="...">`
    - Map pointer coordinates into world space for interaction
[ ] Implement hit-testing in TypeScript (not DOM-based):
    - Nearest-point-to-cubic-bezier for curve selection
    - Point proximity for anchors/handles
    - Overlap constraints and snapping integration
[ ] Implement interactions using Pointer Events:
    - Select/multi-select
    - Drag anchors/handles/whole curve segments
    - Insert/delete nodes (if supported today)
    - Keyboard shortcuts parity
[ ] Preserve non-rendering logic:
    - Reuse existing command/state machinery for undo/redo
    - Reuse symmetry rules and snapping algorithms; keep them rendering-agnostic
[ ] Add a temporary feature flag to switch editors (e.g. `?editor=svg`) for parity testing and staged rollout.
[ ] Port or retire Paper-dependent scripts:
    - Replace `scripts/render-heart-png.ts` with SVG-based rasterization (headless) for any pipelines that still need PNGs.
    - Remove/replace bench scripts or rewrite to use pure geometry (no PaperScope).
[ ] Remove Paper.js:
    - Delete dead Paper-only modules
    - Remove `paper` from `package.json`
    - Confirm builds/tests and runtime routes work without Paper

## Testing and Validation
- `npm run check`
- `npm test`
- Manual editor parity checklist:
  - Drag anchors/handles, insert/delete nodes, snapping behavior, symmetry modes, undo/redo
  - Zoom/pan + touch gestures
- Visual spot checks:
  - Gallery rendering, heart detail preview, PDF generation
- Performance sanity:
  - Editing responsiveness at typical and worst-case designs

## Risks and Edge Cases
- Hit-testing performance and correctness at high zoom or complex curves.
- SVG rendering seams/stroke scaling under transforms.
- Gesture handling differences between browsers (esp. touch).
- Avoid relying on `getBBox()`/DOM layout for core geometry (prefer deterministic bounds).

## Open Questions
- What’s the acceptable “worst-case” editor complexity target (number of strips/fingers/segments) to design for?
