# Woven hearts, format version 2 — specification

Status: agreed direction, implementation postponed (2026-09-07). This document is the
reference for when the work starts. It replaces nothing yet; the site runs format 1.

## 1. Why

Format 1 describes a heart as two fixed pieces: a square woven area with a semicircle
lobe on each piece, and cut curves ("fingers") that run from the fold to the far edge
of the square. Real hearts do more:

- cuts of different lengths, so the woven area is not a square (Onkelhjerte);
- the far end of a piece shaped as a diagonal, a heart, a wide arc, anything (Suboptimalt
  onkelhjerte, the wide flat heart);
- side edges that curve like the cuts (wavy strips, the heart chain with semicircular
  bumps), so the outer strips are shaped too;
- lobes that differ between the two pieces.

All of these are the same thing: each piece is a folded sheet whose outline and cuts are
free curves, and the finished heart is what you see when the two pieces' strips cross.
Format 2 makes that the model. Patterns still come only from where the two templates'
lines meet ("invisible lines"); there are deliberately **no cut-outs and no free
over/under** (decided 2026-09-07).

A second benefit: rendering the finished heart as one path per colour removes the
anti-aliasing seams format 1 shows where same-coloured shapes touch.

## 2. Terminology

- **Piece**: one folded sheet. A heart has two, `a` and `b`. Colours belong to pieces.
- **Fold**: the straight edge along which the sheet is folded double. Everything in a
  piece is described on one layer; the other layer is its mirror image across the fold.
- **Side edges**: the two outer edges of the piece, running from the fold to the lobe.
- **Lobe**: the curve that closes the piece at the far end, between the tips of the two
  side edges. Default: a semicircle.
- **Cuts**: curves that start on the fold and end inside the piece, ordered from one
  side edge to the other. `n` cuts make `n + 1` strips.
- **Strip**: the region between two neighbouring cut lines (or a cut and a side edge),
  from the fold to where the shorter of its two boundaries ends.
- **Flap**: the uncut remainder of a piece beyond the strips' ends. It includes the lobe.
  For weaving purposes it behaves like one more strip that everything crosses.
- **Crossing**: where a strip (or flap) of `a` overlaps a strip (or flap) of `b`. At every
  crossing one is on top; a strip goes "under" by passing between the other's two layers.

## 3. Coordinates

Each piece is authored in **piece space**: `u` across the strips, `v` along them.

- The fold is the line `v = 0`, from `u = 0` to `u = W` (`W` is the piece width; the
  default is 225, the format 1 square, so existing numbers carry over unchanged).
- Side edge 0 starts at `(0, 0)`, side edge 1 at `(W, 0)`. Both run in increasing `v`.
- Cuts start on the fold at `0 < u < W` and run in increasing `v`.
- The lobe runs from the tip of side edge 0 to the tip of side edge 1.
- The other layer of the sheet is the mirror `v -> -v`; it is never stored.

**Heart space** is the format 1 render space (600 units, centre 300). Piece `a` is placed
with its fold along the heart's lower-left edge and its strips pointing up-right; piece
`b` with its fold along the lower-right edge and strips pointing up-left. The two
transforms are rotations by ±45° plus a translation chosen so that two default pieces
produce exactly the format 1 heart: overlap square 187.5..412.5, lobes of radius 112.5.
A design's bounding box is computed from the placed pieces, so a heart with a wide lobe
or bumps sticking out is simply bigger; renderers fit the box, never a fixed square.

## 4. Format

Interchange stays an SVG file as today (`static/hearts/<id>.svg`, export/import in the
editor): the root gains `data-format="2"` and `data-symmetry`, each piece is a `<g
data-piece="a|b">` whose `<path>` elements carry `data-role="side-0|side-1|lobe|cut"` and
the piece's `data-width`; the RDF credit block is unchanged. The JSON form below is what
code, localStorage and the `#design=` share hash use:

```ts
type Curve = {
  // Cubic Bézier chain in piece space: M p0, then C p1 p2 p3 per segment.
  segments: { p0: Vec; p1: Vec; p2: Vec; p3: Vec }[];
  nodeTypes?: Record<string, 'corner' | 'smooth' | 'symmetric'>;
};

type Piece = {
  width: number;          // W: length of the fold
  side: [Curve, Curve];   // side edge 0 (starts at u=0) and side edge 1 (starts at u=W)
  lobe: Curve;            // from tip of side[0] to tip of side[1]
  cuts: Curve[];          // ordered by u at the fold, each starting on v = 0
  color?: string;         // #rrggbb; absent = site-wide colour for this piece
  stripColors?: string[]; // optional, one per strip (cuts.length + 1); overrides color
};

type HeartDesignV2 = {
  version: 2;
  id: string;
  name: string;
  author: string; authorUrl?: string; publisher?: string; publisherUrl?: string;
  source?: string; date?: string; description?: string;
  symmetry: 'mirrored' | 'identical' | 'free';
  pieces: { a: Piece; b: Piece };   // when symmetry !== 'free', b is derived and omitted on disk
  weaveParity: 0 | 1;                // which piece is on top at the first crossing
};
```

Rules a parser enforces (reject the design otherwise):

1. `side[0]` starts at `(0,0)`, `side[1]` at `(W,0)`; every cut starts on `v = 0` with
   `0 < u < W`, cuts sorted by that `u`, no two cuts sharing a start.
2. The lobe's ends coincide with the side edges' tips.
3. All curves have `v >= 0` (nothing crosses the fold) and no curve self-intersects.
4. No cut intersects another cut, a side edge or the lobe, and every cut ends strictly
   inside the outline (a cut that reaches the outline would sever the piece).
5. `stripColors`, when present, has exactly `cuts.length + 1` entries.
6. Only `version: 2` is accepted. There is no version 1 reader in the app (decision
   2026-09-07: no backwards compatibility). See §9 for the one-off migration.

Symmetry:

- `mirrored`: `b` is `a` mirrored across the strip direction (`u -> W - u`). This is the
  format 1 "one template for both sides".
- `identical`: `b` equals `a` (Onkelhjerte and both h33.dk examples).
- `free`: both pieces stored.

The existing intra-piece symmetry toggles (within a cut, within a piece, between the two
pieces) remain editor conveniences and are still detected from the curves, not stored.

## 5. Geometry: from pieces to the picture

All computation happens on flattened curves (polylines with a tolerance of about 0.25
units in heart space, adaptive to curvature). Curves are flattened once per render.

1. **Outline** of a piece = side[0] + lobe + reverse(side[1]) + the fold, as one closed
   polygon in piece space.
2. **Strips**. For strip `i` between boundary curves `L` (cut `i-1` or side[0]) and `R`
   (cut `i` or side[1]): the region of the outline polygon between `L` and `R`, from the
   fold up to the end of the shorter of the two boundaries; beyond that point the region
   belongs to the flap. Formally: cut the outline polygon with the polylines of `L` and
   `R`; the strip is the face touching the fold between them. The **flap** is the face
   of the outline that touches the lobe once all cuts are removed.
3. **Placement**. Transform every strip and the flap of `a` and of `b` into heart space.
4. **Crossings**. For every pair (strip or flap of `a`, strip or flap of `b`) compute the
   polygon intersection. Assign the top piece by parity: index `i` for `a` (`0..n_a`,
   flap = `n_a`), `j` for `b` (flap = `n_b`); `a` is on top when
   `(i + j + weaveParity) % 2 === 0`. The flap-versus-flap crossing is a single
   consistent choice, which is what paper allows.
5. **Uncrossed material**. The part of each strip and flap that overlaps nothing of the
   other piece is visible in its own colour.
6. **Union per colour**. Union all regions coloured with piece `a`'s colour into one
   path, likewise for `b` (and per strip colour if `stripColors` is set). Emit those
   paths. Nothing else is drawn, so no two same-coloured shapes ever share an edge.

Boolean operations: use one library for every renderer (browser SVG, build-time
prerender in Node, the PDF/OG rasteriser). `polygon-clipping` (Martinez) on the
flattened polygons is the reference choice: pure JS, robust, no DOM. Paper.js stays
in the editor for interaction only.

Physical warnings (editor only, not blocking): a strip narrower than 2 mm at print size;
a strip wider than any slot it must pass through by more than 10 %; a lobe that meets
the side edges at less than 30°.

## 6. Templates and PDF

A piece's cutting template is its outline plus its cut lines, drawn in piece space and
mirrored across the fold for the second layer, exactly as on the h33.dk sheets:

- solid: side edges, lobe (both layers), and each cut on both layers;
- dashed: the fold;
- the existing marks (name, size label, site address) unchanged.

`mirrored` and `identical` symmetry print one template; `free` prints two. Scaling and
layout (A4, compact grids) reuse the current `getTemplateDimensions`; the template's
bounding box is the piece outline's, not a fixed rectangle.

## 7. Editor

The canvas shows both pieces placed in heart space, as today. Editing model:

- Every curve (side edges, lobe, cuts) has the same node handles and node types as
  fingers do now; the fold is not editable (its length `W` is a numeric field).
- Constraints are enforced while dragging: side-edge and cut starts stay on the fold, the
  lobe's ends stay glued to the side-edge tips, curves may not cross (rejected drags
  snap back), cuts may not reach the outline.
- **Ghost lines**: the other piece's cuts and edges are drawn faintly under the active
  piece, and "Snap til modsat side" snaps to them, so aligning an invisible seam is a
  deliberate act. This is the intended way to make patterns.
- **Copy shape**: apply the selected curve's shape to all cuts, or to cuts and side edges
  (wavy strips, bumps).
- **Lobe presets**: semicircle, wide arc, pointed, straight (diagonal end). A preset is a
  starting point; the curve stays editable.
- Symmetry mode is a three-way control (Spejlvendt / Ens / Fri). Switching to `free`
  copies `b` from `a`; switching back discards `b`'s differences after confirmation.
- Difficulty (`$lib/utils/difficulty`) is recomputed from the strips' geometry rather
  than from the grid: number of strips, curved length, narrowest strip, flap crossings.

Mobile keeps the stacked layout; nothing here changes the editor's panel structure.

## 8. What stays the same

`id`, name/author/date/source metadata, colours (`color` per piece replaces
`colors.left/right`; the site-wide store keeps the same two-colour shape), the share
hash mechanism (deflate + base64url of the JSON), localStorage collection, the PDF
layout options, analytics events, OG images (rendered with the same renderer), the
gallery data pipeline (`scripts/generate-heart-data.mjs` runs the same renderer).

## 9. Migration (one-off)

A script converts every gallery source file `static/hearts/<id>.svg` (a 100-unit SVG with
the cuts as paths, `data-weave-parity`, and the RDF credit block) from format 1 to
format 2 and rewrites the file in place, keeping the metadata block untouched:

- `W = 225`; side edges = straight lines `(0,0)->(0,225)` and `(225,0)->(225,225)`;
  lobe = semicircle from `(0,225)` to `(225,225)` bulging in `+v`;
- each finger becomes a cut with its path data translated from the format 1 square into
  piece space (the square's fold edge maps to `v = 0`) and its far endpoint placed on
  `v = 225`, exactly where it ended before;
- `symmetry = mirrored` when `lobesShareTemplate()` is true for the design, else `free`;
- `weaveParity` copied; `colors` dropped (gallery hearts never carry colours).

The script asserts, for every gallery heart, that the format 2 render and the format 1
render agree pixel-for-pixel at 400 px apart from the seams (a diff under a small
threshold), and the result is committed. Visitors' saved hearts and old share links are
not converted (decision 2026-09-07); the app shows a clear "this heart was made with an
older version" message for `version !== 2` instead of failing silently. If that turns out
to hurt, the conversion above is twenty lines and can run on load.

## 10. Tests

- Parser: accepts the migrated gallery designs; rejects each rule violation in §4 with a
  named error.
- Geometry: strips of a default piece are the format 1 strips; a cut shorter than the
  square yields a flap that reaches the fold on that side; flap-versus-flap parity is
  consistent; union output has no two same-coloured faces sharing an edge.
- Renderer equivalence: gallery hearts match their format 1 renders (from the migration
  script) within tolerance.
- Templates: outline plus cuts, mirrored across the fold; `identical` prints one sheet.
- Symmetry derivation and round-trips through JSON, SVG and the share hash.
- Property test: random valid pieces never produce a renderer exception or an empty path.

## 11. Plan and effort

1. Geometry core and renderer with default pieces only, behind the equivalence test
   (2 days).
2. Migration script and format 2 parser; gallery converted; prerender and OG through the
   new renderer (1 day).
3. Templates (1 day).
4. Editor: side edges and lobe as curves, constraints, ghost lines, copy shape, presets,
   symmetry control (3–4 days).
5. Difficulty, warnings, docs, guide page note on non-square hearts (1 day).

Roughly 8–9 agent-days, sequenced after the redesign and the image-to-heart generator
have merged, since it changes the design format they both write. The image-to-heart
solver keeps producing default pieces until it is extended; that is fine.

## 12. Out of scope

Cut-outs, free over/under matrices, three or more pieces, glued-on shapes, non-straight
folds, pieces crossing at angles other than 90°.
