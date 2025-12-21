## SVG Editor parity checklist (vs Paper.js editor)

Reference implementation: `.plans/editor-paperjs-reference.md`

### Editing UI
- [ ] Grid size control regenerates defaults
- [ ] Show/hide curve overlays
- [ ] Symmetry toggles:
  - [ ] Shadcn tri-state (off/mirror/anti) for:
    - [ ] Within-curve
    - [ ] Within-lobe
    - [ ] Between-lobes
- [ ] Undo/redo restores symmetry modes
- [ ] Segment count + add/remove segment buttons
- [ ] Segment selection + tools:
  - [ ] Select segments (single + shift-toggle)
  - [ ] Make selected segments straight
  - [ ] Make selected segments curved
- [ ] Insert node between selected anchors
- [ ] Delete selected nodes (button + Delete/Backspace)
- [ ] Undo/redo (buttons + Cmd/Ctrl+Z / Shift+Cmd/Ctrl+Z / Cmd/Ctrl+Y)
- [ ] Zoom/pan (trackpad/touch) with clamp

### Interaction model
- [ ] Click curve selects finger
- [ ] Shift-click anchors multi-select
- [ ] Drag selected anchors moves all selected anchors
- [ ] Endpoint projection keeps endpoints on square edges (preserve tangent)
- [ ] Dragging respects boundary ordering
- [ ] Dragging prevents boundary intersections (same lobe)
- [ ] Handle drag snapping (QP + obstacles)
- [ ] Junction drag snapping (QP + obstacles) for multi-segment curves
- [ ] Temporal snap smoothing (previous solution stickiness)
- [ ] Double-click curve inserts node at closest point
- [ ] Feasible-region projection for anchor/control drags (not just backoff)
- [ ] Delete whole curve when endpoints selected (and reconcile strip count/outer curves)

### Rendering behavior
- [ ] View fits / no cropping for extreme designs
- [ ] Overlay controls only for selected finger (matches Paper editor)
- [ ] Hover highlight + cursor feedback
- [ ] Keep handle/outline stroke widths stable when zoomed
- [ ] Mark problematic curves (red) when:
  - [ ] Intersections occur away from endpoints
  - [ ] Curves get too close (same lobe)
