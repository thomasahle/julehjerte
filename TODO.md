# TODO

## Path Editing (Beziers)
- [x] Double-click a segment to insert a node at the clicked `t` (not midpoint).
- [x] Insert at click position (store last hit `{ fingerId, segIdx, t }` from `hit.location.time`, use it when inserting).
- [x] Shift-click curve to add/remove the surrounding anchors/segment (true multi-select UX).
- [x] Allow endpoint node types (`smooth`/`symmetric`) and apply them to the single available handle.
- [ ] Add explicit “break handles” (cusp) vs “corner” semantics (per-node handle linkage flags).
- [x] Add “double-click / quick insert” UX polish (select new node, keep segment selection consistent).

## Refactors / Cleanup
- [x] Split `src/lib/components/PaperHeart.svelte` into editor modules:
  - [x] `src/lib/editor/selection.ts` (selection helpers)
  - [x] `src/lib/editor/commands.ts` (insert/delete/convert/node-type commands + undo)
  - [x] `src/lib/editor/hitTest.ts` (Paper.js hit results → selection updates)
- [x] Replace parallel selection arrays with a single `Selection` object (anchors/segments + last-hit info).
- [x] Fix Svelte warnings about `state_referenced_locally` (e.g. `gridSize` / `lastGridSize` patterns).
- [x] Make `__julefletPaperHeartDebug` dev-only to keep prod global scope clean.

## UI / UX
- [ ] Add descriptive text below carousel (especially for photos, e.g. photo credit vs template author).