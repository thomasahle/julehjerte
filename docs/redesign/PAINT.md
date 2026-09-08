# Paint mode ("Mal") — spec

The editor gets a second mode. **Tegn** (draw) is the editor as it is today: strips as curves, symmetry, colours,
details, Gem, PDF. **Mal** (paint) is a two-colour *mask* of the woven square that the visitor paints on, fills from
a photo, or gets from an existing heart, and that the local inverse engine turns into strips ("Find snit"). A heart
can go back and forth: Find snit turns the mask into a heart, "Mal på hjertet" turns a heart into a mask.

Owner's decisions (2026-09-08, mockup https://claude.ai/code/artifact/cc56e263-9cfc-459d-9a6f-9ae00db680aa):

1. The mask is a **fixed high-resolution image** (400 × 400 cells of the woven square, the engine's resolution).
   No cell size setting, no visible grid. Brushes: fine / medium / coarse.
2. **Symmetry belongs to Find snit**, using the editor's own three rows (Inden i kurve, Inden i lap, Mellem
   lapper; Fra / Sym / Anti). Symmetries found in the mask are switched on and tagged "fundet".
3. **No search time setting.** Find snit runs until it has an answer or the visitor presses Afbryd.
4. Mal has **two panels only**: left = Importér billede, Ryd, tools; right = Find snit. Farver and Hjertedetaljer
   stay in Tegn. The tool panel's two swatches only choose which paper colour the pen paints.
5. The mask is drawn **inside the heart**: the woven diamond carries the mask, the lobes show the paper colours,
   mirror lines are drawn in heart orientation.
6. **Import is a dialog**: file, corners (found automatically, draggable), colour interpretation, a preview of the
   mask as a heart, "Brug som maske".

Everything else in docs/redesign/DESIGN.md still applies (tokens, `.btn`, floating panels, breakpoints, i18n, tests).

## 1. Routes, chrome, navigation

- Draw: `/editor/` and `/en/editor/` (unchanged). Paint: `/editor/mal/` and `/en/editor/paint/`, registered in
  `$lib/i18n/routes.ts` as RouteKey `paint` (the language toggle, hreflang alternates and the sitemap all read that
  table). Pages live where the other differing-slug pages live: `src/routes/editor/mal/+page.svelte` and
  `src/routes/en/editor/paint/+page.svelte`, each a thin wrapper rendering `$lib/components/paint/PaintPage.svelte`
  with `lang`. Prerendered like every page; the engine is never touched at build or SSR time.
- `PageHeader` (variant `editor`) gains an optional `mode` prop: `{ current: 'draw' | 'paint' }`. When given it
  renders a segmented switch in the middle of the bar (grid `1fr auto 1fr`): "Tegn" with the pencil icon and "Mal"
  with the image icon (en: Draw / Paint), links to the two routes, `aria-current` on the active one. Both editor pages
  pass it. On phones (< 600px) the switch shows icons only.
- Switching mode is plain client-side navigation. State survives it because it lives in a module store (§3), not
  in page components.
- Top-bar actions in Mal: Hjælp, Download PDF, Gem, EN pill — the same buttons as Tegn. Download PDF and Gem act on
  the session's current heart (the last Find snit result, or the heart the visitor came from). While there is no
  heart yet they are disabled with a tooltip ("Find snit først").

## 2. UX of the paint page

Canvas (full-bleed, same `CanvasBackdrop` sky and landscape, same fit band between the floating panels):

- The heart as it will look: two lobes in the paper colours (left lobe = left colour, right lobe = right colour),
  the woven diamond carrying the mask (mask 0 = left colour, 1 = right colour), a faint outline of the diamond.
  Painting happens directly on the diamond. Outside the diamond the pointer does nothing.
- Mirror lines, dashed `--blue`, drawn in heart orientation for the symmetries that are on (see §5).
- Top-left pill: "Maske · 400 × 400 · to farver" plus a one-line hint. Below 900px the pill goes away.
- Wheel/pinch zoom and drag-to-pan like Tegn are **not** required in the first version; fit-to-band is enough.
  Keep the canvas code ready for it (one transform matrix between screen and mask coordinates).

Left floating panel (same column width and style as Tegn's tool rail area, 300px):

- Row of two buttons: `Importér billede` (outline, opens the dialog) and `Ryd` (ghost, clears to all-0 after a
  confirm if the mask is not empty; uses the site `Modal`, no `confirm()`).
- Panel "Værktøj": tools Pen, Viskelæder, Fyld, Linje, Rektangel as 40px icon buttons (lucide: pencil, eraser,
  paint-bucket, minus (rotated 45°) or a simple line glyph, square); brush size segmented control Fin / Mellem / Grov
  (radius 2 / 6 / 14 cells); "Maler med" two swatches (the current paper colours, the chosen one ringed).
  Viskelæder always paints 0. Undo / redo buttons (lucide undo-2 / redo-2) and Cmd/Ctrl+Z, Shift+Cmd/Ctrl+Z.
- Keyboard: P pen, E eraser, F fill, L line, R rectangle, X swaps the painting colour, `[`/`]` brush size.

Right floating panel (340px, collapsible with the same "Skjul panel" control as Tegn):

- Panel "Find snit": one sentence ("Symmetri som i Tegn. Fundet i masken og slået til; alt du maler, spejles med."),
  the three symmetry rows (a shared component, §6), the primary button `Find snit`, a disclosure "Avanceret" with the
  engine settings that matter to a hobbyist: Papirets bredde (mm, default 100), Mindste strimmelbredde (mm, 2),
  Samme skabelon til begge sider (checkbox, follows Mellem lapper: Sym), and a "Nulstil" link. Nothing else.
- While searching: the panel shows a progress row (heart glyph, "Søger efter snit … 12 s", the current stage in
  plain words, a bar) and `Afbryd`. The mask stays editable-looking but pointer input is ignored until done.
- After success: "Skabelonen er fundet" with the numbers (n + m snit, minimum clearance in mm, difference from the
  mask in %), and the buttons `Åbn i Tegn` (primary) and `Tilbage til masken` (outline). The difference is measured
  on the heart we are about to show — `maskMismatch` of `rasterizeDesign(design, 200)` against the session mask
  resampled to 200 — not taken from the engine's `report.imageError.mismatchFraction`, which describes the solution
  before simplifying and before `enforce` (§4) moved it. The canvas shows the found
  heart rendered by our own `PaperHeartSVG` (not the engine's preview), and a small card with the mask and a
  "Ret masken" link. Download PDF and Gem in the top bar now work on this heart.
- After failure: a notice in the panel: what happened (timed out / no weavable pattern / engine could not load) and
  what to try (paint with fewer thin details, switch off a symmetry, try again), plus `Prøv igen`.

Empty state (no mask yet): the heart with an all-0 diamond, and a small card beside it: "Eller importér et billede,
så fyldes masken fra fotoet" with a link that opens the dialog, and "Prøv stjernen" which imports
`static/inverse/examples/star.png`.

Import dialog (`ImportImageDialog`, built on the site `Modal`, `column` layout, ~860px):

- Step 1: a drop zone / file picker (PNG, JPEG, WebP, SVG; ≤ 12 MB; the same decoding as the old generate page:
  `createImageBitmap` → canvas → RGBA). SVG goes to the engine as text like before.
- Step 2 (photos): the image with the four numbered corners the engine proposed (`detect-crops`), draggable; buttons
  `Find igen` and `Sæt selv` (click four corners in order, top corner first, as the engine expects); a status line
  (fundet automatisk / usikker, tjek hjørnerne / ingen fundet, sæt dem selv). Square images may use "Hele billedet".
- Step 3: colour interpretation segmented control: Automatisk / Rød-hvidt foto / Vælg selv (two colour inputs),
  mapping to the engine's `mode` auto / red-white-mixture / swatches; "Byt farverne" checkbox (engine `invert`).
- Live preview "Sådan bliver masken": the prepared mask drawn as a heart (same renderer as the canvas, 200px), and a
  line naming the symmetries found (§5). The preview re-runs `prepare` (debounced) when corners or colours change.
- Footer: `Annuller`, `Brug som maske` (primary). Using replaces the session mask (confirm via Modal if the current
  mask has unsaved strokes), sets the suggested symmetries, closes the dialog.

Tegn additions:

- "Handlinger" gets `Mal på hjertet` (outline, first in the list): rasterises the current heart into the session
  mask (§4) and navigates to the paint route. If a mask with strokes already exists, ask first (Modal).
- The top-bar mode switch (§1).

## 3. State: the editor session

`src/lib/editor/session.svelte.ts` — one module-level rune store shared by both modes, browser only:

```ts
export type PaintSession = {
  mask: Mask | null;                // the mask being painted (400 × 400)
  maskDirty: boolean;               // strokes since it was created/imported/rasterised
  symmetry: SymmetrySettings;       // the three rows, as in Tegn
  found: SymmetrySettings | null;   // what detection suggested (for the "fundet" tags)
  result: PaintResult | null;       // last successful Find snit
  status: 'idle' | 'importing' | 'searching' | 'done' | 'failed';
  error: PaintError | null;
  sourceName: string | null;        // "stjerne.png" or null
};
export type PaintResult = { design: HeartDesign; report: { cuts: [number, number]; clearanceMm: number; mismatch: number; identical: boolean } };
export type SymmetrySettings = { curve: SymmetryMode; lobe: SymmetryMode; lobes: SymmetryMode };  // 'off' | 'sym' | 'anti'
export const session: PaintSession;                 // $state; mask and result are $state.raw (see below)
export function setSymmetry(s: SymmetrySettings): void;     // switches the rows and folds the mask to match (§4)
export function handoffToDraw(design: HeartDesign): void;   // stores the design for the draw page to pick up
export function takeHandoff(): HeartDesign | null;  // draw page calls this on mount (source `session`)
```

The draw page today reads its input from the URL (`getEditorUrlInput`). Add one more source: when the paint page
navigates to `/editor/?from=session` the page takes the handoff design, treats it as a new unsaved heart (name from
the source: "Stjerne fra billede" / "Heart from image"), and the draft mechanism carries on as for any new heart. The
session's `mask` is kept, so the visitor can come back to it.

Persistence: the mask is not written to localStorage in this version (160 KB per save is more than the draft should
carry); a reload loses it. Say so nowhere — it simply behaves like an unsaved drawing. Keep the door open: the store
has one `serialize()`/`restore()` pair, unused for now.

Reactivity: `mask` and `result` are held with `$state.raw`, so what is reactive is replacing them, not writing into
them. A deep `$state` proxy around the mask costs about fourteen times the time in the tools' innermost loops, and it
would not have made a stroke reactive anyway (`Uint8Array` is never proxied). Painting is therefore invisible to
`$derived`/`$effect` by design; the canvas repaints the box each tool returns (§8), and anything else that must know a
mask changed goes through `setMask`.

## 4. Modules and contracts

All pure logic is plain TypeScript under `src/lib/paint/` with vitest coverage; no DOM, no canvas. UI under
`src/lib/components/paint/`. Engine bridge under `src/lib/inverse/` next to the existing `client.ts`.

```ts
// src/lib/paint/mask.ts
export const MASK_SIZE = 400;
export type Mask = { size: number; data: Uint8Array };          // row-major, y*size+x, values 0 | 1
export type Box = { x0: number; y0: number; x1: number; y1: number };   // half-open, so the empty box exists
export function createMask(fill?: 0 | 1, size?: number): Mask;  // `size` for the rasteriser and the tests
export function cloneMask(m: Mask): Mask;
export function isEmpty(m: Mask): boolean;
export function get(m: Mask, x: number, y: number): 0 | 1;      // 0 outside, so tools need no bounds checks
export function resample(data: Uint8Array, from: number, to: number): Uint8Array;   // nearest neighbour
export function maskMismatch(a: Uint8Array, b: Uint8Array): number;   // share of differing cells, 0–1
export function emptyBox(): Box;                                // with isEmptyBox, unionBox, clampBox
export function packMask(m: Mask): string;                      // with unpackMask; only backs session.serialize

// src/lib/paint/tools.ts — every op mutates in place and returns the changed bounding box (for repaint)
export type Brush = { radius: number; value: 0 | 1 };
export function stampCircle(m: Mask, x: number, y: number, brush: Brush): Box;
export function stroke(m: Mask, from: Vec, to: Vec, brush: Brush): Box;   // circles along the segment, no gaps
export function line(m: Mask, from: Vec, to: Vec, brush: Brush): Box;     // same as stroke; the UI previews it
export function rect(m: Mask, a: Vec, b: Vec, value: 0 | 1): Box;
export function floodFill(m: Mask, x: number, y: number, value: 0 | 1): Box;   // 4-connected, iterative
export function applySymmetric(m: Mask, box: Box, transforms: Transform[], value: 0 | 1): Box; // spreads the brush colour under each transform

// src/lib/paint/symmetry.ts
export type Transform = 'transpose' | 'antiTranspose' | 'mirrorX' | 'mirrorY' | 'rotate180';
export function transformsFor(s: SymmetrySettings): Transform[];        // §5 table
export function detectSymmetry(m: Mask, tolerance = 0.03): SymmetrySettings;  // §5 rules
export function symmetrize(m: Mask, transforms: Transform[]): void;    // majority/first-wins fold, used before solving

// src/lib/paint/rasterize.ts — heart -> mask, pure (flatten Béziers, even-odd scanline fill)
export function rasterizeDesign(design: HeartDesign, size = MASK_SIZE): Mask;

// src/lib/paint/history.ts — undo/redo as full snapshots capped at 40 (a 160 KB mask × 40 = 6.4 MB, fine)

// src/lib/inverse/toHeartDesign.ts — engine cut geometry -> our heart
export type CutGeometryOptions = { name: string; author?: string; colors?: HeartColors; enforce?: SymmetrySettings; tolerance?: number };
export function cutGeometryToDesign(json: string | CutGeometry, opts: CutGeometryOptions): HeartDesign;
// the same conversion, plus the symmetry rows the geometry could actually be held to (see the converter notes)
export function convertCutGeometry(json: string | CutGeometry, opts: CutGeometryOptions): { design: HeartDesign; honoured: SymmetrySettings };
// src/lib/inverse/simplifyCurves.ts — fit a chain of cubics with fewer cubics within `tolerance` (0–100 units)
// src/lib/inverse/engine.ts — thin async API over InverseWorker used by the UI:
export function prepareMask(mask: Mask, colors: HeartColors, onStage: (s: string) => void): Promise<PreparedArtwork>;
export function prepareImage(input: ArtworkInput, settings: ImportSettings, onStage): Promise<PreparedArtwork>;
export function findCuts(settings: FindSettings, onStage): Promise<DesignResult>;   // after a prepare
export function detectCorners(input: PixelsInput, roi?: number[]): Promise<DetectedCrops>;
export function cancel(): void;
```

`applySymmetric` takes the brush colour as a fourth argument — 0 for the eraser — and spreads exactly that colour from
the cells of `box` to their images, rather than copying the box wholesale. A copy is wrong at a mirror line, where the
box lands on its own image and the copy reads cells it has just written; a snapshot-based copy that ignores the colour
degenerates to a swap there; and folding by majority gives the pen and the eraser the same answer where they need
opposite ones. Spreading one colour is order-free and idempotent. In return it needs the mask to have been symmetric
before the edit: `box` is the rectangle a tool changed, not the cells it wrote, so older paint of the brush colour
lying inside it spreads too. **Switching a row on therefore goes through `setSymmetry` in the session store, which
folds the mask with `symmetrize` first**, and `setMask` folds an arriving mask the same way (detection answers
"symmetric" only within its tolerance).

### Engine facts the bridge relies on

- Worker: `static/inverse/worker-bootstrap.js` (classic) → `worker.js` (module) → `core/engine.js`; HiGHS WASM
  (3.5 MB) loads inside the worker on first solve. `InverseWorker` in `client.ts` owns the lifecycle; one request at
  a time; `stop()` terminates the worker (that is how Afbryd works).
- `prepare` input: `{type:'pixels', rgba, imageWidth, imageHeight, quad?}` — no `quad` means the whole square image
  is the woven square. For the mask we send a 400 × 400 RGBA image with the two paper colours and
  `mode: 'swatches', swatches: [right, left]` (or `threshold` on a pure black/white rendering — pick one and TEST that a
  mask sent in comes back unchanged from `prepared.mask`, including which value is which colour).
- Settings we pass (from the old page, minus what the owner removed): `{...AUTOMATIC_PRESET, width: 100, minWidth: 2,
  cutError: 0.25, timeLimit: 600, preferMatchingSheets, matchingErrorAllowance: 0.01, earlyStop: false,
  removeSpecks: 0, fillHoles: 0, minRadius: 0.8, kerf: 0, printShrinkPercent: 0.2, materialResolution: 360,
  trials: 12, requireMaterialCore: true, paperColors: [right, left], resolution: 400}`. `identicalSheets: true` when
  Mellem lapper is Sym (check `core/settings.js` for the accepted keys before relying on one).
- `prepared.mask`: `Uint8Array` of `prepared.resolution²`, value 0 = left colour, 1 = right colour (this is the
  convention the old page used when drawing it). Resample to 400 if the engine chose a smaller resolution.
- `DesignResult.files['cut_geometry.json']` is the solution (schema `heartcurves-2`): `square_width_mm` (100),
  `phase` (0/1), `curves[id] = {control_points: [[x,y]×4] in mm, visible_boundary}`, `A_overlap_paths` and
  `B_overlap_paths`: arrays of cuts, each cut an ordered list of `{curve, reverse}`. Every cut runs from one edge of the
  square to the opposite edge: A cuts from y=0 to y=w (x varies), B cuts from x=0 to x=w (y varies). Verified on
  `static/inverse/examples/star.saved.json` and `jul.saved.json`. `report` carries `slits {left,right}`,
  `validation.minimumInterSlitDistanceLower`, `imageError.mismatchFraction`, `solver.matchingPreference.identical`.
- Engine frame: the left (white, paper B) lobe hangs on the edge x=0, the right (red, paper A) lobe on the edge y=0;
  the preview draws it with `matrix(1 1 -1 1 0 0)`, so (0,0) is the heart's top cleft and (w,w) the bottom tip.

### Our heart's frame (see `$lib/utils/heartDesign.ts`, `$lib/utils/overlapRect.ts`, `$lib/rendering/svgWeave.ts`)

- Internal pixel frame: 600 × 600, overlap rect = gridSize × 75 centred at (300,300). JSON/raw fingers use 0–100
  inside the overlap rect; `normalizeHeartDesign` converts them. **Build the converter's output as raw JSON fingers
  (0–100 `pathData`) and run it through `normalizeHeartDesign`** — never construct pixel-frame fingers by hand.
- Left-lobe fingers are horizontal paths (position = y, running between x=0 and x=100); right-lobe fingers are
  vertical (position = x). The two outer boundaries of each lobe are fingers too (`ensureOuterBoundaries` adds them;
  `serializeHeartDesign` drops them), and `gridSize = {x: rightFingers − 1, y: leftFingers − 1}`, max 12 per axis.
- Therefore: engine A cuts (vertical) → our **right** lobe; engine B cuts (horizontal) → our **left** lobe;
  coordinates scale by 100 / `square_width_mm`, no mirroring expected — but **prove it** (below).
- `weaveParity` (0 = top-left cell has the left lobe on top) has to be derived from the engine's `phase` and the path
  counts (the engine's own preview uses `phase ^ (A.length % 2) ^ (B.length % 2)`). Derive it, then verify by
  rasterising both parities and picking the one that matches the engine's `sampleWeave`; keep the analytic rule as
  the primary and the comparison as a test.

### Converter requirements and tests (`src/lib/inverse/toHeartDesign.test.ts`)

1. Load `star.saved.json` and `jul.saved.json` (import from `static/inverse/examples/`), convert, and compare our
   `rasterizeDesign(design, 200)` with the engine's `sampleWeave(solution, 200)` (import `loadSolutionJSON` from
   `static/inverse/core/graph.js` and `sampleWeave` from `core/validate.js` — they are plain ESM). Mismatch must be
   under 1.5% for both. JUL is asymmetric, so a mirrored or transposed frame fails this test loudly.
2. Simplification: each engine cut is a chain of 13–31 cubics; the converter fits it with as few cubics as possible
   within `tolerance` (default **0.25** of the 0–100 range, i.e. 0.25 mm at 100 mm) using least-squares cubic
   fitting with subdivision (Schneider). Test: after simplification the mismatch in test 1 grows by at most
   **0.7 points**, and the average number of segments per cut is **≤ 12** for the star, from 20.9 unfitted.

   The three numbers were 0.6, 0.5 points and ≤ 4 when this was written; all three were measured and corrected
   (2026-09-08). Refitting costs mismatch in proportion to the tolerance — about 3 points of the woven square per
   unit — so at 0.6 the star drifts 2.140% and jul 2.025%, over test 1's own 1.5% bar; 0.25 costs 0.67 and 0.46
   points and keeps both well under it, and the half-point contract holds at 0.15 (a test pins that too). The
   segment count cannot reach 4: the star's eight cuts turn through 67 corners of more than 25°, a corner always
   costs its own cubic, and even an absurd 4 mm tolerance leaves about nine per cut. 11.75 is the default's answer.
3. Cuts with more than 13 per family are rejected with a typed error (our grid max is 12 strips), and so are cuts that
   do not run edge to edge (a `CutGeometryError` with a message key the UI can translate).
4. `enforce`: when a symmetry row is Sym/Anti, the corresponding fingers are made exactly symmetric using the
   mappings exported from `$lib/utils/symmetry.ts` — the detector's own functions, not copies of them (one lobe's
   fingers copied from the other under the mapping for Mellem lapper; each finger mirrored/point-reflected in place
   for the two others), so the draw page's own detection (`detectSymmetryModes`) reports them on. Test on the star
   with all three rows Sym.

   Enforcing is a *correction*, not a projection: it assumes the solve nearly holds the symmetry already, which is
   what the symmetrised mask and `identicalSheets` buy. On a solve that does not hold it, forcing the cuts moves
   the picture — 11–19% of the woven area per row on the saved examples, 17–24% for all three — and that is
   unavoidable, because a weave can be symmetric as a picture while its cuts are not. Tests pin those bounds, and
   check that the correction costs under 0.5 points on a solve that does hold the symmetry.

   Mellem lapper needs the two families to have equally many cuts, and the engine may answer otherwise. The
   converter then drops the row rather than deform the heart, and says so: `convertCutGeometry` returns
   `{ design, honoured }`, and the panel sets its toggles from `honoured` (`cutGeometryToDesign` is the same call
   without it). Test on a family with one cut removed.
5. Node types: mark every joint between fitted cubics `smooth`, endpoints `corner`.

### Rasteriser requirements and tests (`src/lib/paint/rasterize.test.ts`)

- `rasterizeDesign` draws exactly what `computeWeaveData` draws: base 0, then the even-odd union of all strips
  (`rightOnTopStrips` + `leftOnTopStrips`) as 1, in the overlap rect mapped to [0,size)². Flatten Béziers adaptively
  (max 0.25 cell error), fill with an even-odd scanline at pixel centres.
- The flattening adapts per cubic rather than by recursive subdivision: the deviation of an n-piece uniform
  flattening is at most 3·D/(4n²) for D the larger second difference of the control points, so the piece count
  follows in closed form and needs no recursion, no depth guard and no array per curve. Both lanes wrote a
  rasteriser, independently, and the two agree to 0.01% of the square once either is run to convergence, so the
  choice was made on cost: this one is allocation-free and bounded, and it is the more faithful of the two on the
  converted engine hearts (0.04 of the star's, 0.04 of jul's cells against its own converged self, where the
  recursive fit drifts 0.10 and 0.09).
- Tests: `classic-3x3` from `src/lib/data/heart-designs.json` gives a checkerboard (assert the cell values);
  `stjerne` round-trips through `cutGeometryToDesign` ∘ engine? (no engine in tests — instead assert that
  rasterising the gallery `jul` and the converted `jul.saved.json` agree within 3%). The orientation is pinned
  besides: jul disagrees with all five of its symmetry images, and named cells are checked against the image each
  transform sends them to, so a mirrored, transposed or wrong-parity frame fails rather than passing quietly.

### Mask ops tests (`src/lib/paint/tools.test.ts`, `symmetry.test.ts`)

- stroke leaves no gaps at any speed (two far points → connected set), flood fill stops at the diamond edge (the
  mask is the square; the diamond is just how it is shown), rect clamps, symmetric painting produces exactly
  transformed copies, `detectSymmetry` finds transpose on a hand-built symmetric mask and nothing on noise,
  tolerance behaves (3% noise still detected, 10% not).

## 5. Symmetry: the mask, the engine and the draw page

In the square frame (x to the right, y down, both 0..1), the draw page's rows map to mask transforms:

| Row (draw page)          | Mode | Mask transform(s)                     | Heart-orientation mirror line   |
|--------------------------|------|---------------------------------------|---------------------------------|
| Mellem lapper            | Sym  | transpose (x↔y)                       | vertical centre line            |
| Mellem lapper            | Anti | antiTranspose (x→1−y, y→1−x)          | horizontal centre line          |
| Inden i lap              | Sym  | mirrorX **and** mirrorY               | both diagonals of the diamond   |
| Inden i lap              | Anti | rotate180                             | (point symmetry, draw a dot? no: draw nothing) |
| Inden i kurve            | Sym  | mirrorX **and** mirrorY (same as lobe Sym) | both diagonals              |
| Inden i kurve            | Anti | — (per-cut point symmetry; no mask transform) | nothing                 |

Why: a left-lobe cut runs along x, so mirroring it across its own lobe's centre line is `mirrorY` and reflecting it
across its chord bisector is `mirrorX`; for the right lobe the roles swap. The rows apply to both lobes at once, so
the mask needs both mirrors. `transformsFor()` returns the union (deduplicated) of the transforms of every row that
is on. Painting: every stroke's changed box is copied under each transform (`applySymmetric`), and the compositions
are closed automatically because each copy is itself copied (apply transforms in a fixed order, then copy the union
once more — or simply apply the full closure of the generated group; keep it simple and tested).

Detection (`detectSymmetry`): agreement ratio of the mask with each transformed copy; a transform "holds" when the
disagreeing fraction is ≤ tolerance (3%). That fraction is counted **against the ink** — the cells of the minority
colour — not against the whole square: over the square, any mask with under about 1.5% ink agrees with all five of its
images whatever is drawn on it, so every row would come back "fundet" and `symmetrize` would then fold the visitor's
motif away before the engine saw it. At half coverage the two readings are the same number, so a photograph is judged
as before. A mask with no ink at all (straight after Ryd) reports nothing. Rules: transpose → Mellem lapper Sym; else
antiTranspose → Mellem lapper Anti; mirrorX ∧ mirrorY → Inden i lap Sym and Inden i kurve Sym; else rotate180 → Inden
i lap Anti. Everything else off. Run it after import and after "Mal på hjertet"; the result becomes both
`session.symmetry` and `session.found`.

Solving with symmetry on: `symmetrize` the mask under the active transforms first (so the target itself is
symmetric), pass `identicalSheets`/`preferMatchingSheets` for Mellem lapper Sym (the only symmetry the engine
enforces itself), and give the converter `enforce: session.symmetry` so the resulting fingers are exact. Inden i
kurve Anti cannot be expressed on the mask; it is passed to the converter only, so it is the one row that always
reaches a solve that was never asked to hold it — see the note on what enforcing costs in §4. The rows the panel
shows afterwards are the converter's `honoured`, not what was asked for.

## 6. Shared symmetry rows

The three segmented rows (label · Fra/Sym/Anti) now appear in two places. Extract them from `PaperHeart.svelte`
into `$lib/components/editor/SymmetryRows.svelte` with props `{ value: SymmetrySettings; onChange; found?:
SymmetrySettings | null; disabled?: Partial<Record<keyof SymmetrySettings, boolean>>; lang }`, rendering the same
markup and classes both places (the "fundet" tag is a small `--gold` pill after the label, only when `found` marks
that row). Tegn keeps its behaviour (including the "requires equal grid size" disabling). The icon set chosen for
these rows (Family A, see the Symmetri-ikoner artifact) is a separate task and must slot into this component later.

## 7. i18n

All strings in `src/lib/i18n/translations.ts`, both languages, key prefix `paint` (e.g. `paintModeDraw` "Tegn" /
"Draw", `paintModePaint` "Mal" / "Paint", `paintImportImage`, `paintClear`, `paintTools`, `paintPen`, `paintEraser`,
`paintFill`, `paintLine`, `paintRect`, `paintBrush`, `paintBrushFine/Medium/Coarse`, `paintsWith`, `paintFindCuts`,
`paintFindCutsHint`, `paintAdvanced`, `paintSearching`, `paintStage*`, `paintCancel`, `paintFound`,
`paintFoundSummary` with `{left}`, `{right}`, `{clearance}`, `{mismatch}`, `paintOpenInDraw`, `paintBackToMask`,
`paintFailedTimeout`, `paintFailedNoSolution`, `paintFailedEngine`, `paintTryAgain`, `paintEmptyHint`,
`paintTryStar`, `paintMaskPill`, `paintOnHeart` "Mal på hjertet", dialog keys `paintImportTitle`, `paintDrop`,
`paintFormats`, `paintCorners*`, `paintColours*`, `paintUseAsMask`, `paintFoundSymmetry`, confirm texts, and the
tooltips for the disabled top-bar buttons). The old `src/lib/inverse/messages.ts` is deleted with the old page (§9);
copy over only the phrases that are still shown. `translations.test.ts` fails on unused keys, so add keys as you use
them.

## 8. Accessibility and performance

- The canvas is one `<canvas>` with `role="img"` and an `aria-label` describing the mask; the tools are real
  buttons with `aria-pressed`; the dialog is the site `Modal` (focus trap, Escape, return focus).
- Pointer events with `setPointerCapture`; touch works (no page scroll while painting on the diamond: `touch-action:
  none` on the canvas). Coalesced pointer events (`getCoalescedEvents`) for smooth strokes.
- Repaint only the changed box (the mask lives in an offscreen canvas as an ImageData; the on-screen canvas draws
  lobes + the rotated offscreen canvas each frame with `requestAnimationFrame`, one frame per pointer batch).
- The paint page must not load the engine or its WASM until Find snit / import / "Prøv stjernen" is used, and the
  draw page's bundle must not grow because of Mal (dynamic import of the paint modules from the draw page's "Mal på
  hjertet" action is fine; the paint page itself may import them statically).
- Prefers-reduced-motion: no animated progress bar sweep, a plain determinate/indeterminate bar.

## 9. Retiring the old generator page

Once Mal works end to end: delete `src/routes/[[lang=lang]]/generate/`, `src/lib/inverse/messages.ts`,
`ArtworkComparison.svelte`, `SvgPreview.svelte` and their tests, the sitemap entries, and every translation key that
only they used. Keep `client.ts`, `presets.js`, `static/inverse/**` (engine, examples, licences, notices; the
attribution link "Motorens licenser" moves into the Avanceret disclosure), `scripts/inverse/**` and `docs/inverse/**`
as they are. Update docs/inverse/README.md's first paragraph to say where the engine is used now.

## 10. Out of scope (this version)

Mask persistence across reloads, zoom/pan on the paint canvas, per-heart colour editing in Mal, the hero button on
the front page, the symmetry icons (separate task), format 2 of the heart model.

## 11. Decisions taken after round one (2026-09-08)

**Enforcing symmetry has a cost limit.** `convertCutGeometry` takes `enforceCostLimit` (default 0.03): it converts
with and without `enforce`, rasterises both at 200, and if the two differ by more than the limit it returns the
unenforced design with every row of `honoured` set to `'off'` and `symmetryCost` reporting the measured share. The
panel then shows the rows from `honoured` and a one-line notice ("Symmetrien kunne ikke holdes helt; hjertet vises
som motoren fandt det"). Below the limit the corrected design is returned as before. Rationale: enforcing is a
correction for a solve that nearly holds the symmetry; on one that does not, it deforms the heart by 11–24 %.

**The engine will hold symmetry itself.** A separate lane (branch `paint-engine-symmetry`) adds
`settings.symmetry = { mirrorX?, mirrorY?, transpose?, antiTranspose?, rotate180?: boolean; withinCurve?: 'off' |
'sym' | 'anti' }` to the engine: the fitter's target becomes the mean of the mask over the symmetry group ("both
mirrorings in the loss") and the control points are tied under the group, so the answer is exactly symmetric. The
bridge maps the three rows to it — Mellem lapper Sym → transpose, Anti → antiTranspose; Inden i lap Sym → mirrorX +
mirrorY, Anti → rotate180; Inden i kurve Sym/Anti → withinCurve — in one function `engineSymmetry(rows)` in
`src/lib/inverse/engine.ts`, sent only when `ENGINE_SYMMETRY` (a constant in the same file, false until the engine
lane lands) is true, so the page can be built before the engine is merged. `symmetrize` on the mask and
`enforce` in the converter stay as the safety net for the MILP route and for `withinCurve` Anti.

**Free cells are the next stage, and the engine side is Codex's.** Codex's motif-border experiment
(docs/inverse/MOTIF-BORDER.md) shows that an isolated painted motif needs a band of cells the engine may fill with
a supporting weave, and that the engine needs explicit per-cell loss weights for that (a 0.5 probability is not
ignored). Codex is building that in the engine on their branch; we port it when it lands and do not build it here.
The UI is designed now so the paint mode fits it from the start (mockup, section "Frie felter"): the mask gains a
third value `2 = free`; "Maler med" gets a third, hatched swatch; a panel "Fri kant" with a checkbox "Lad motoren
lægge kanten" and a width (Smal / Mellem / Bred ≈ 10 / 18 / 25 % of the square) marks the outer band free; free
cells are drawn hatched on a light ground inside the heart with a dashed outline of the protected centre;
`detectSymmetry` ignores free cells; the bridge sends weight 0 for them; the result panel reports the difference
inside the protected motif separately from the whole square, and a checkbox shows the protected outline on the
found heart; the import dialog gets "Reparér kanten" with the same width control for blurred photo edges. Until
the engine supports weights, nothing of this is shown. Keep the mask's value type open to it: no code may assume
`data[i] < 2` except the tools' own brushes.

**Session store as landed.** `session` is a class instance: `mask` and `result` are `$state.raw` (replace, never
mutate for reactivity; the canvas repaints by box), the small fields plain `$state`. Callers use `setMask(mask,
{sourceName, symmetry, found})` (folds the mask to the rows), `setSymmetry(rows)` (switches and folds),
`markMaskDirty()`, `clearMask()`, `handoffToDraw(design)` / `takeHandoff()`.

**Known flake.** `src/lib/inverse/simplifyCurves.test.ts` has one test that exceeds vitest's 5 s default under a
parallel full run (11.8 s) and passes alone (3.4 s): give it an explicit timeout or make its sweep cheaper.
