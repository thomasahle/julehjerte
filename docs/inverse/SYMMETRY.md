# Symmetric cutting templates

The paint editor's symmetry rows reach the engine as a request on the **cut
set**, not as a filter applied to the painted mask beforehand. Both mirrorings
of the drawing enter the loss, and the fitted control points are projected onto
the requested symmetric subspace at every optimizer step, so an accepted result
is symmetric by construction rather than by rounding.

```js
settings({ symmetry: {
  mirrorX: false, mirrorY: false, transpose: false, antiTranspose: false,
  rotate180: false, withinCurve: 'off'   // or 'sym' | 'anti'
}})
```

All flags default to off, and `symmetry` itself defaults to `null`. An absent
request and a fully switched-off request behave identically everywhere; with
neither, every stage below runs exactly as it did before this feature existed.
Unknown keys, non-boolean flags and an unknown `withinCurve` are rejected by
`settings()`.

A requested set means the cut set is invariant under **every element of the
group the requested transforms generate**. Only the generators are listed to
the engine: the union-find that merges their pairings closes the group by
itself, and the picture's orbit is closed separately for the loss.

## Frame and pairing table

Square of width `w`, `x` to the right, `y` down. Family A cuts travel from
`y=0` to `y=w` with `x` free; family B cuts travel from `x=0` to `x=w` with `y`
free. Inside a family, cut `i` is the i-th by its crossing coordinate, so A cut
0 is the leftmost and B cut 0 the topmost; `n` is that family's cut count and
`m` the number of cubics in a cut.

"forward" ties cubic `j` point `k` to the partner's cubic `j` point `k`.
"reversed" ties it to the partner's cubic `m-1-j` point `3-k`, which requires
both cuts to hold the same number of cubics. The coordinate columns give this
cut's coordinates in terms of the partner's.

| transform | A cut *i* pairs with | B cut *i* pairs with | direction | coordinates |
| --- | --- | --- | --- | --- |
| `mirrorX` | A cut *n-1-i* | B cut *i* | A forward, B reversed | x = w-x', y = y' |
| `mirrorY` | A cut *i* | B cut *n-1-i* | A reversed, B forward | x = x', y = w-y' |
| `rotate180` | A cut *n-1-i* | B cut *n-1-i* | reversed | x = w-x', y = w-y' |
| `transpose` | B cut *i* | A cut *i* | forward | x = y', y = x' |
| `antiTranspose` | B cut *n-1-i* | A cut *n-1-i* | reversed | x = w-y', y = w-x' |

`mirrorX` keeps every `y` and reverses the left-to-right order, so it maps each
B cut onto **itself travelled backwards**; `mirrorY` does the same to each A
cut. A cut paired with itself ties its own points, so the middle cut of an odd
family under `mirrorX` collapses onto the midline `x = w/2`; the union-find
reports that as a pinned constant rather than as a group of equal values.
`rotate180 = mirrorX ∘ mirrorY`. `transpose` and `antiTranspose` need equal
family counts.

`withinCurve` is per cut and uses the **cut's own chord**, not the square:
`'sym'` reflects across the perpendicular bisector of the chord from the cut's
start to its end, `'anti'` reflects through the chord midpoint. Both swap the
endpoints, so both tie cubic `j` point `k` to cubic `m-1-j` point `3-k` of the
same cut. The chord map is an affine map determined by the two endpoints, and
the endpoints are parameters themselves: it is recomputed from the current
endpoints at each projection step and held fixed inside that step. Each
endpoint's crossing coordinate is pinned to its square edge, so the chord
cannot swing between steps.

### Parameterisation

Ties are **affine groups**: members `[index, sign, offset]` whose
`sign*value + offset` agree across the group. A mirror needs exactly that
(`x = w - x'` is sign `-1`, offset `w`), while `transpose` is sign `+1`, offset
`0` across the two axes. A weighted union-find merges the pairings of every
requested transform; a class that closes on itself with the opposite sign
becomes a pinned constant, and an inconsistent class is recorded in
`conflicts` instead of being silently averaged.

Requested symmetries are enforced by **hard projection** of both the control
points and the search direction — they are constraints, not preferences. The
soft quadratic penalty (`matchingPenalty`) remains what it was: the preference
behind `preferMatchingSheets`. With only `transpose` requested, the projection
produces bit-identical values to the existing identical-sheet projection; a
regression test asserts that.

### Counts

A mirrored cut set repaints the woven colours when the mirrored family holds an
**odd** number of cuts, because the count of cuts left of `x` becomes `n` minus
itself. So `mirrorX` admits only even A counts, `mirrorY` only even B counts,
`rotate180` only an even total, and `transpose`/`antiTranspose` any equal
counts. The grid-count search skips the pairs it cannot reproduce; the skipped
counts cannot hold the answer, since their woven picture would be the requested
one with its colours swapped.

### The editor's three rows

The paint editor states symmetry as cut geometry — within a curve, within a
lobe, between lobes — and paints with the square symmetries those rows imply
(`src/lib/paint/symmetry.ts`, same five transform names, same closure over the
eight symmetries of the square). The engine request that carries each row:

| Editor row | `sym` | `anti` |
| --- | --- | --- |
| Mellem lapper (between lobes) | `transpose` | `antiTranspose` |
| Inden i lap (within a lobe) | `mirrorX` + `mirrorY` | `rotate180` |
| Inden i kurve (within a curve) | `withinCurve: 'sym'` | `withinCurve: 'anti'` |

The last row is the one the mask cannot express — a per-cut chord symmetry is
not a symmetry of the square — so the editor paints it as the closest mask
symmetry while the engine holds it exactly on the cuts. Sending both the row's
mask transforms and its `withinCurve` mode is consistent: the union-find merges
them, and the report measures each separately.

## Which stage sees which target

When any transform of the square is requested, every per-pixel target the
search optimizes is replaced by the **mean over the generated group** of its
transformed copies. For the squared boundary loss the sum of the losses against
every orbit member equals the loss against that one mean, which is what "use
both mirrorings in the loss function" asks for. `withinCurve` is not an image
transform and never changes the target.

| Stage | Target |
| --- | --- |
| Classification, preview mask, saved `sourceImage` | original classified mask |
| `symmetryEvidence` identical-sheet lower bound | original mask |
| Border-inset evidence and count suggestions | orbit mean |
| Grid initialization (uniform, border, separable, row DP) | orbit mean; its scores threshold that mean |
| Ordered-grid gradient stages and clearance | orbit mean, area-resampled |
| Free Bézier refinement (boundary value and gradient) | orbit mean, area-resampled |
| Polish stage | orbit mean of the classified mask, at source resolution |
| Candidate ranking `error` | thresholded orbit mean |
| Acceptance `originalImageError`, feature audit, `report.imageError` | **original classified mask** |
| `report.symmetry` | the final control points themselves |

Initialization therefore sees a symmetric picture — the soft orbit mean, whose
threshold is the thresholded orbit mean the initializer's mismatch scores use —
while reporting fidelity stays measured against what the visitor actually drew.
Nothing rewrites the visitor's mask.

## Precedence with the identical-sheet options

1. `symmetry.transpose: true` **implies identical sheets**. It forces
   `preferMatchingSheets` on, the way `identicalSheets` did, and the fitter
   enforces the transposed tie from the first step, so the matching-preference
   stage finds the pair already identical and returns `already_identical`.
2. Any other requested transform (including `withinCurve`) **forces
   `preferMatchingSheets` off**, even if the caller passed it explicitly. That
   preference copies or averages one sheet onto the other, which would break
   the requested pairing after the fact.
3. No symmetry requested: `preferMatchingSheets`, `identicalSheets` and the
   trace route behave exactly as before.

`identicalSheets` remains a preparation option of the traced route
(`transposeTarget` reflects the traced artwork) and is untouched.

## Routing, and what is not enforced

- **The MILP trace route is unchanged.** It selects cuts from a traced
  candidate graph, in which a mirrored partner curve need not exist at all, so
  a mirror constraint would have to be added as a pairing over candidate edges
  that the graph does not contain. The automatic route therefore takes the
  direct fitter whenever anything beyond `transpose` is requested — for
  photographs, for the angular route and for the SVG (vector) route. `transpose`
  alone keeps its existing routing, where identical sheets are already handled.
- **Traced feature recovery is skipped** under a request, for the same reason:
  it routes through the MILP. A symmetric fit is also expected to drop features
  of an asymmetric drawing, so the trigger would fire on constraint cost.
- **Shared-cut recovery is skipped** under a request. It re-subdivides one cut
  of a pair, after which the paired cuts no longer hold the same number of
  cubics and no pairing can follow them.
- **Hidden-curve rounding (`roundHidden`) is not symmetry aware.** The direct
  fitter produces no hidden curves once sharing is skipped, so this only
  matters for imported or traced geometry; the measured `honoured` list will
  show it if rounding breaks a tie.
- **Combined requests use alternating projections.** Within-curve ties are
  applied first and the square's ties last, so a combined request leaves the
  square symmetries exact and the chord symmetry within floating-point
  rounding (about 1e-14 mm in practice, far inside the 1e-6 mm report
  tolerance).
- **Adam's per-coordinate scaling** preserves a sign-flipped tie exactly, but
  not a chord reflection that mixes x and y; the projection after every update
  removes that drift rather than relying on the step to respect it.

## Report

```json
"symmetry": { "requested": ["mirrorX", "transpose"], "honoured": ["mirrorX", "transpose"], "maxDeviationMm": 0 }
```

`honoured` is **measured, not assumed**: the exported control points are
compared with the image of their partner under each requested transform, and a
transform is listed only when every pair agrees within 1e-6 mm.
`maxDeviationMm` is the largest of those measured distances, and is `null` when
nothing was requested or when no requested transform has a pairing for this
solution (unequal counts, or paired cuts subdivided differently). Every other
report field is unchanged. `withinCurve` appears as `withinCurve:sym` or
`withinCurve:anti`.

## Limits

- The orbit mean assumes the painting is **invariant** under the requested
  transforms, not anti-invariant. A drawing whose mirror is its own colour
  swap averages to a flat 0.5 target with no usable gradient; the count parity
  rule above is the same statement seen from the cut side. Requesting a mirror
  for such a drawing is not supported, and the resulting error is reported
  honestly rather than repaired.
- A request is a hard constraint, so a drawing that is not symmetric pays for
  it in image error. The star example fits its `transpose` symmetry for free
  (the drawing has it) and pays several percentage points for both mirrors (it
  does not). Nothing lowers the image-error acceptance threshold to hide that;
  the candidate is exported with the usual review notice instead.
- The search is still local and time limited. A symmetric fit is only found
  among the count pairs, phases and layouts the existing search reaches; the
  constraint removes the asymmetric part of the parameter space, it does not
  add new routing moves.
- `conflicts` from the union-find and `skipped` transforms are held on the tie
  structure for diagnosis; the report exposes their consequence through the
  measured `honoured` list rather than as separate fields.
